import { ApiError, type Env, type PdfInputType, type PdfJobResponse, type PdfJobRow, type PdfJobStatus } from '../types';

export function toJobResponse(row: PdfJobRow): PdfJobResponse {
  return {
    jobId: row.id,
    status: row.status,
    inputType: row.input_type,
    inputSize: row.input_size,
    resultSize: row.result_size,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    workflowRunId: row.workflow_run_id,
    workflowUrl: row.workflow_url,
    resultKey: row.result_key,
    errorMessage: row.error_message,
  };
}

export async function createJob(env: Env, userId: string): Promise<PdfJobRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO pdf_jobs (id, user_id, status, created_at, updated_at)
     VALUES (?, ?, 'created', ?, ?)`,
  ).bind(id, userId, now, now).run();
  return getOwnedJob(env, id, userId);
}

export async function getOwnedJob(env: Env, id: string, userId: string): Promise<PdfJobRow> {
  const row = await env.DB.prepare(
    'SELECT * FROM pdf_jobs WHERE id = ? AND user_id = ? LIMIT 1',
  ).bind(id, userId).first<PdfJobRow>();
  if (!row) throw new ApiError(404, '任务不存在或无权访问。', 'JOB_NOT_FOUND');
  return row;
}

export async function getInternalJob(env: Env, id: string): Promise<PdfJobRow> {
  const row = await env.DB.prepare('SELECT * FROM pdf_jobs WHERE id = ? LIMIT 1').bind(id).first<PdfJobRow>();
  if (!row) throw new ApiError(404, '任务不存在。', 'JOB_NOT_FOUND');
  return row;
}

export async function listOwnedJobs(env: Env, userId: string, limit: number): Promise<PdfJobRow[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM pdf_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
  ).bind(userId, limit).all<PdfJobRow>();
  return result.results || [];
}

export async function setUploadMetadata(
  env: Env,
  id: string,
  userId: string,
  metadata: { inputKey: string; inputType: PdfInputType; contentType: string; size: number },
): Promise<PdfJobRow> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE pdf_jobs
     SET status = 'uploading', input_key = ?, input_type = ?, input_content_type = ?, input_size = ?,
         error_message = NULL, updated_at = ?
     WHERE id = ? AND user_id = ? AND status IN ('created', 'uploading', 'uploaded')`,
  ).bind(
    metadata.inputKey,
    metadata.inputType,
    metadata.contentType,
    metadata.size,
    now,
    id,
    userId,
  ).run();
  if ((result.meta.changes || 0) !== 1) {
    throw new ApiError(409, '当前任务状态不允许重新生成上传地址。', 'INVALID_JOB_STATE');
  }
  return getOwnedJob(env, id, userId);
}

export async function markUploaded(env: Env, id: string, userId: string, actualSize: number): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE pdf_jobs SET status = 'uploaded', input_size = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND status IN ('created', 'uploading', 'uploaded')`,
  ).bind(actualSize, now, id, userId).run();
}

export async function claimForDispatch(env: Env, id: string, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE pdf_jobs
     SET status = 'queued', started_at = COALESCE(started_at, ?), error_message = NULL, updated_at = ?
     WHERE id = ? AND user_id = ? AND status = 'uploaded'`,
  ).bind(now, now, id, userId).run();
  return (result.meta.changes || 0) === 1;
}

export async function restoreAfterDispatchFailure(env: Env, id: string, userId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE pdf_jobs SET status = 'uploaded', error_message = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND status = 'queued'`,
  ).bind(message.slice(0, 2000), now, id, userId).run();
}

export async function updateInternalStatus(
  env: Env,
  id: string,
  status: Extract<PdfJobStatus, 'processing' | 'uploading_result'>,
  values: { runId?: string; workflowUrl?: string; commit?: string },
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE pdf_jobs
     SET status = ?, workflow_run_id = COALESCE(?, workflow_run_id), workflow_url = COALESCE(?, workflow_url),
         commit_sha = COALESCE(?, commit_sha), updated_at = ?
     WHERE id = ? AND status IN ('queued', 'processing', 'uploading_result')`,
  ).bind(status, values.runId || null, values.workflowUrl || null, values.commit || null, now, id).run();
}

export async function completeInternalJob(
  env: Env,
  id: string,
  values: { resultKey: string; resultSize: number; runId?: string; workflowUrl?: string; commit?: string },
): Promise<void> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE pdf_jobs
     SET status = 'completed', result_key = ?, result_size = ?, workflow_run_id = COALESCE(?, workflow_run_id),
         workflow_url = COALESCE(?, workflow_url), commit_sha = COALESCE(?, commit_sha), error_message = NULL,
         completed_at = ?, updated_at = ?
     WHERE id = ? AND status IN ('queued', 'processing', 'uploading_result')`,
  ).bind(
    values.resultKey,
    values.resultSize,
    values.runId || null,
    values.workflowUrl || null,
    values.commit || null,
    now,
    now,
    id,
  ).run();
  if ((result.meta.changes || 0) !== 1) {
    const row = await getInternalJob(env, id);
    if (row.status !== 'completed') throw new ApiError(409, '任务状态不允许标记为完成。', 'INVALID_JOB_STATE');
  }
}

export async function failInternalJob(
  env: Env,
  id: string,
  values: { message: string; runId?: string; workflowUrl?: string },
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE pdf_jobs
     SET status = 'failed', workflow_run_id = COALESCE(?, workflow_run_id), workflow_url = COALESCE(?, workflow_url),
         error_message = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND status != 'completed'`,
  ).bind(
    values.runId || null,
    values.workflowUrl || null,
    values.message.slice(0, 2000),
    now,
    now,
    id,
  ).run();
}
