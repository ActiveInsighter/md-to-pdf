import { ApiError, type Env } from './types';

const REQUIRED_ENV_KEYS: Array<keyof Env> = [
  'DB',
  'PDF_BUCKET',
  'GITHUB_TOKEN',
  'GITHUB_OWNER',
  'GITHUB_REPO',
  'GITHUB_WORKFLOW_FILE',
  'GITHUB_WORKFLOW_REF',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'PDF_CALLBACK_SECRET',
  'PDF_API_TOKEN',
  'FRONTEND_ORIGIN',
];

export function assertEnvironment(env: Env): void {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.error(`Missing Worker bindings or variables: ${missing.join(', ')}`);
    throw new ApiError(500, '服务端环境变量未完整配置。', 'ENV_MISSING');
  }
}

export function maxUploadBytes(env: Env): number {
  const value = Number(env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);
  if (!Number.isFinite(value) || value <= 0) return 50 * 1024 * 1024;
  return Math.floor(value);
}

export function presignedUrlTtl(env: Env): number {
  const value = Number(env.PRESIGNED_URL_TTL_SECONDS || 600);
  if (!Number.isFinite(value)) return 600;
  return Math.min(900, Math.max(300, Math.floor(value)));
}
