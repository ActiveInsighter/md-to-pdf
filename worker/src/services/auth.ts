import { ApiError, type Env } from '../types';

async function sha256(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function requireUser(request: Request, env: Env): Promise<{ userId: string }> {
  const token = getBearerToken(request);
  if (!token || !(await constantTimeEqual(token, env.PDF_API_TOKEN))) {
    throw new ApiError(401, '访问令牌无效或已缺失。', 'UNAUTHORIZED');
  }
  const userHash = await sha256(token);
  return { userId: bytesToHex(userHash) };
}

export async function requireCallback(request: Request, env: Env): Promise<void> {
  const token = getBearerToken(request);
  if (!token || !(await constantTimeEqual(token, env.PDF_CALLBACK_SECRET))) {
    throw new ApiError(401, '内部回调鉴权失败。', 'CALLBACK_UNAUTHORIZED');
  }
}
