import { ApiError, type Env, type PdfInputType } from '../types';

export async function dispatchPdfWorkflow(
  env: Env,
  values: { jobId: string; inputKey: string; inputType: PdfInputType },
): Promise<void> {
  const workflow = encodeURIComponent(env.GITHUB_WORKFLOW_FILE);
  const url = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/${workflow}/dispatches`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'md-to-pdf-cloudflare-worker',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref: env.GITHUB_WORKFLOW_REF,
      inputs: {
        job_id: values.jobId,
        input_key: values.inputKey,
        input_type: values.inputType,
      },
    }),
  });

  if (response.status !== 204) {
    const details = (await response.text()).slice(0, 1000);
    console.error(`GitHub workflow dispatch failed (${response.status}): ${details}`);
    throw new ApiError(502, '触发 GitHub Actions 失败，请检查 Worker 中的 GitHub 配置。', 'GITHUB_DISPATCH_FAILED');
  }
}
