import { AwsClient } from 'aws4fetch';
import type { Env } from '../types';

function encodeObjectKey(key: string): string {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function client(env: Env): AwsClient {
  return new AwsClient({
    service: 's3',
    region: 'auto',
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
}

export async function createPresignedPutUrl(
  env: Env,
  key: string,
  contentType: string,
  expiresIn: number,
): Promise<string> {
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${encodeURIComponent(env.R2_BUCKET)}/${encodeObjectKey(key)}?X-Amz-Expires=${expiresIn}`;
  const signed = await client(env).sign(
    new Request(url, { method: 'PUT', headers: { 'Content-Type': contentType } }),
    { aws: { signQuery: true } },
  );
  return signed.url.toString();
}

export async function createPresignedGetUrl(env: Env, key: string, expiresIn: number): Promise<string> {
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${encodeURIComponent(env.R2_BUCKET)}/${encodeObjectKey(key)}?X-Amz-Expires=${expiresIn}`;
  const signed = await client(env).sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } });
  return signed.url.toString();
}
