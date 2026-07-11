import { Hono } from 'hono';
import { maxUploadBytes, presignedUrlTtl } from '../env';
import { requireUser } from '../services/auth';
import { dispatchPdfWorkflow } from '../services/github';
import {
  claimForDispatch,
  createJob,
  getOwnedJob,
  listOwnedJobs,
  markUploaded,
  restoreAfterDispatchFailure,
  setUploadMetadata,
  toJobResponse,
} from '../services/jobs';
import { createPresignedGetUrl, createPresignedPutUrl } from '../services/r2';
import { ApiError, type Env, type PdfInputType } from '../types';

interface UploadUrlBody {
  fileName?: string;
  size?: number;
}

interface StartJobBody {
  inputKey?: string;
  inputType?: PdfInputType;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, '请求 JSON 格式不正确。', 'INVALID_JSON');
  }
}

function parseInputType(fileName: string): PdfInputType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (lower.endsWith('.zip')) return 'zip';
  throw new ApiError(400, '仅支持 Markdown 或 ZIP 文件。', 'UNSUPPORTED_FILE_TYPE');
}

export const pdfJobsRoutes = new Hono<{ Bindings: Env }>();

pdfJobsRoutes.post('/', async (context) => {
  const { userId } = await requireUser(context.req.raw, context.env);
  const job = await createJob(context.env, userId);
  return context.json(toJobResponse(job), 201);
});

pdfJobsRoutes.get('/', async (context) => {
  const { userId } = await requireUser(context.req.raw, context.env);
  const rawLimit = Number(context.req.query('limit') || 30);
  const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 30));
  const jobs = await listOwnedJobs(context.env, userId, limit);
  return context.json({ jobs: jobs.map(toJobResponse) });
});

pdfJobsRoutes.get('/:jobId', async (context) => {
  const { userId } = await requireUser(context.req.raw, context.env);
  const job = await getOwnedJob(context.env, context.req.param('jobId'), userId);
  return context.json(toJobResponse(job));
});

pdfJobsRoutes.post('/:jobId/upload-url', async (context) => {
  const { userId } = await requireUser(context.req.raw, context.env);
  const jobId = context.req.param('jobId');
  await getOwnedJob(context.env, jobId, userId);
  const body = await readJson<UploadUrlBody>(context.req.raw);
  const fileName = String(body.fileName || '').trim();
  const size = Number(body.size);
  if (!fileName) throw new ApiError(400, '缺少文件名。', 'FILE_NAME_REQUIRED');
  if (!Number.isSafeInteger(size) || size <= 0) throw new ApiError(400, '文件大小无效。', 'INVALID_FILE_SIZE');
  if (size > maxUploadBytes(context.env)) {
    throw new ApiError(413, `上传文件不能超过 ${maxUploadBytes(context.env)} 字节。`, 'FILE_TOO_LARGE');
  }

  const inputType = parseInputType(fileName);
  const contentType = inputType === 'zip' ? 'application/zip' : 'text/markdown';
  const inputKey = `jobs/${jobId}/input/source.${inputType}`;
  await setUploadMetadata(context.env, jobId, userId, { inputKey, inputType, contentType, size });
  const expiresIn = presignedUrlTtl(context.env);
  const uploadUrl = await createPresignedPutUrl(context.env, inputKey, contentType, expiresIn);

  return context.json({ uploadUrl, inputKey, inputType, contentType, expiresIn, maxBytes: maxUploadBytes(context.env) });
});

pdfJobsRoutes.post('/:jobId/start', async (context) => {
  const { userId } = await requireUser(context.req.raw, context.env);
  const jobId = context.req.param('jobId');
  const body = await readJson<StartJobBody>(context.req.raw);
  const job = await getOwnedJob(context.env, jobId, userId);

  if (['queued', 'processing', 'uploading_result', 'completed'].includes(job.status)) {
    return context.json(toJobResponse(job));
  }
  if (job.status === 'failed' || job.status === 'cancelled') {
    throw new ApiError(409, '该任务已经结束，请创建新任务重新构建。', 'TERMINAL_JOB_STATE');
  }
  if (!job.input_key || !job.input_type) {
    throw new ApiError(409, '请先获取上传地址并上传源文件。', 'INPUT_NOT_CONFIGURED');
  }
  if (body.inputKey !== job.input_key || body.inputType !== job.input_type) {
    throw new ApiError(400, '输入路径或文件类型与任务记录不匹配。', 'INPUT_MISMATCH');
  }

  const object = await context.env.PDF_BUCKET.head(job.input_key);
  if (!object) throw new ApiError(409, 'R2 中未找到上传文件，请重新上传。', 'INPUT_NOT_FOUND');
  if (object.size <= 0 || object.size > maxUploadBytes(context.env)) {
    throw new ApiError(413, 'R2 中的输入文件为空或超过大小限制。', 'INVALID_R2_OBJECT_SIZE');
  }

  await markUploaded(context.env, jobId, userId, object.size);
  const claimed = await claimForDispatch(context.env, jobId, userId);
  if (!claimed) {
    const latest = await getOwnedJob(context.env, jobId, userId);
    if (['queued', 'processing', 'uploading_result', 'completed'].includes(latest.status)) {
      return context.json(toJobResponse(latest));
    }
    throw new ApiError(409, '任务状态已变化，未重复触发构建。', 'DISPATCH_NOT_CLAIMED');
  }

  try {
    await dispatchPdfWorkflow(context.env, {
      jobId,
      inputKey: job.input_key,
      inputType: job.input_type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '触发 GitHub Actions 失败。';
    await restoreAfterDispatchFailure(context.env, jobId, userId, message);
    throw error;
  }

  const queued = await getOwnedJob(context.env, jobId, userId);
  return context.json(toJobResponse(queued), 202);
});

pdfJobsRoutes.post('/:jobId/download-url', async (context) => {
  const { userId } = await requireUser(context.req.raw, context.env);
  const job = await getOwnedJob(context.env, context.req.param('jobId'), userId);
  if (job.status !== 'completed' || !job.result_key) {
    throw new ApiError(409, 'PDF 尚未构建完成。', 'RESULT_NOT_READY');
  }
  const object = await context.env.PDF_BUCKET.head(job.result_key);
  if (!object || object.size <= 0) {
    throw new ApiError(404, 'R2 中未找到构建结果。', 'RESULT_NOT_FOUND');
  }
  const expiresIn = presignedUrlTtl(context.env);
  const downloadUrl = await createPresignedGetUrl(context.env, job.result_key, expiresIn);
  return context.json({ downloadUrl, expiresIn, fileName: 'result.pdf' });
});
