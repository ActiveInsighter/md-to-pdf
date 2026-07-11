import { Hono } from 'hono';
import { requireCallback } from '../services/auth';
import { completeInternalJob, failInternalJob, getInternalJob, updateInternalStatus } from '../services/jobs';
import { ApiError, type Env, type PdfJobStatus } from '../types';

interface StatusBody {
  status?: PdfJobStatus;
  runId?: string | number;
  workflowUrl?: string;
  commit?: string;
}

interface CompleteBody extends StatusBody {
  resultKey?: string;
  fileSize?: number;
}

interface FailedBody extends StatusBody {
  message?: string;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, '内部回调 JSON 格式不正确。', 'INVALID_JSON');
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value).slice(0, 2000);
}

export const internalCallbacksRoutes = new Hono<{ Bindings: Env }>();

internalCallbacksRoutes.post('/:jobId/status', async (context) => {
  await requireCallback(context.req.raw, context.env);
  const jobId = context.req.param('jobId');
  await getInternalJob(context.env, jobId);
  const body = await readJson<StatusBody>(context.req.raw);
  if (body.status !== 'processing' && body.status !== 'uploading_result') {
    throw new ApiError(400, '内部状态只能是 processing 或 uploading_result。', 'INVALID_INTERNAL_STATUS');
  }
  await updateInternalStatus(context.env, jobId, body.status, {
    runId: optionalString(body.runId),
    workflowUrl: optionalString(body.workflowUrl),
    commit: optionalString(body.commit),
  });
  return context.json({ ok: true });
});

internalCallbacksRoutes.post('/:jobId/complete', async (context) => {
  await requireCallback(context.req.raw, context.env);
  const jobId = context.req.param('jobId');
  await getInternalJob(context.env, jobId);
  const body = await readJson<CompleteBody>(context.req.raw);
  const expectedResultKey = `jobs/${jobId}/output/result.pdf`;
  if (body.resultKey !== expectedResultKey) {
    throw new ApiError(400, '结果对象路径与任务 ID 不匹配。', 'RESULT_KEY_MISMATCH');
  }
  const fileSize = Number(body.fileSize);
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new ApiError(400, 'PDF 文件大小无效。', 'INVALID_RESULT_SIZE');
  }
  const object = await context.env.PDF_BUCKET.head(expectedResultKey);
  if (!object || object.size <= 0) {
    throw new ApiError(409, 'R2 中尚未找到 PDF 结果对象。', 'RESULT_NOT_IN_R2');
  }
  await completeInternalJob(context.env, jobId, {
    resultKey: expectedResultKey,
    resultSize: object.size,
    runId: optionalString(body.runId),
    workflowUrl: optionalString(body.workflowUrl),
    commit: optionalString(body.commit),
  });
  return context.json({ ok: true });
});

internalCallbacksRoutes.post('/:jobId/failed', async (context) => {
  await requireCallback(context.req.raw, context.env);
  const jobId = context.req.param('jobId');
  await getInternalJob(context.env, jobId);
  const body = await readJson<FailedBody>(context.req.raw);
  const message = optionalString(body.message) || 'GitHub Actions PDF 构建失败。';
  await failInternalJob(context.env, jobId, {
    message,
    runId: optionalString(body.runId),
    workflowUrl: optionalString(body.workflowUrl),
  });
  return context.json({ ok: true });
});
