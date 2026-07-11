import type { PdfJob, UploadTarget } from '../types/pdfJob';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

interface ApiErrorBody {
  error?: string;
  code?: string;
}

async function apiRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE_URL) throw new Error('前端缺少 VITE_API_BASE_URL 配置。');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (!response.ok) throw new Error(`接口返回了无法解析的错误（HTTP ${response.status}）。`);
    }
  }
  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new Error(errorBody?.error || `请求失败（HTTP ${response.status}）。`);
  }
  return body as T;
}

export function createPdfJob(token: string): Promise<PdfJob> {
  return apiRequest('/api/pdf-jobs', token, { method: 'POST', body: '{}' });
}

export function listPdfJobs(token: string, limit = 30): Promise<{ jobs: PdfJob[] }> {
  return apiRequest(`/api/pdf-jobs?limit=${limit}`, token);
}

export function getPdfJob(token: string, jobId: string): Promise<PdfJob> {
  return apiRequest(`/api/pdf-jobs/${encodeURIComponent(jobId)}`, token);
}

export function createUploadTarget(token: string, jobId: string, file: File): Promise<UploadTarget> {
  return apiRequest(`/api/pdf-jobs/${encodeURIComponent(jobId)}/upload-url`, token, {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, size: file.size }),
  });
}

export function uploadFile(
  target: UploadTarget,
  file: File,
  onProgress: (percentage: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', target.uploadUrl);
    request.setRequestHeader('Content-Type', target.contentType);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`上传到 R2 失败（HTTP ${request.status}）。`));
    });
    request.addEventListener('error', () => reject(new Error('上传到 R2 时发生网络错误。')));
    request.addEventListener('abort', () => reject(new Error('上传已取消。')));
    request.send(file);
  });
}

export function startPdfJob(token: string, jobId: string, target: UploadTarget): Promise<PdfJob> {
  return apiRequest(`/api/pdf-jobs/${encodeURIComponent(jobId)}/start`, token, {
    method: 'POST',
    body: JSON.stringify({ inputKey: target.inputKey, inputType: target.inputType }),
  });
}

export function getDownloadUrl(token: string, jobId: string): Promise<{ downloadUrl: string; expiresIn: number; fileName: string }> {
  return apiRequest(`/api/pdf-jobs/${encodeURIComponent(jobId)}/download-url`, token, {
    method: 'POST',
    body: '{}',
  });
}
