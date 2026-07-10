import fsp from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const action = process.argv[2] || 'start';
const latestPath = path.resolve(projectRoot, '.github/latest-run.json');
const historyPath = path.resolve(projectRoot, '.github/build-history.json');
const latestIdPath = path.resolve(projectRoot, '.github/latest-run-id.txt');
const latestUrlPath = path.resolve(projectRoot, '.github/latest-run-url.txt');
const summaryPath = path.resolve(projectRoot, '.github/last-build-summary.json');

function now() {
  return new Date().toISOString();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function runUrl(runId) {
  const repo = process.env.GITHUB_REPOSITORY || '';
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  return repo && runId ? `${server}/${repo}/actions/runs/${runId}` : '';
}

function baseRecord(status) {
  const runId = process.env.GITHUB_RUN_ID || 'local';
  return {
    run_id: runId,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || '',
    run_number: process.env.GITHUB_RUN_NUMBER || '',
    run_url: runUrl(runId),
    workflow: process.env.GITHUB_WORKFLOW || '',
    job: process.env.GITHUB_JOB || '',
    actor: process.env.GITHUB_ACTOR || '',
    branch: process.env.GITHUB_REF_NAME || '',
    head_sha: process.env.GITHUB_SHA || '',
    status,
    started_at: now(),
    finished_at: null,
    duration_seconds: null,
    build_outcome: null,
    artifact_outcome: null,
    publish_outcome: null,
    consume_outcome: null,
    summary_status: null,
    artifact_name: 'obsidian-style-pdf',
    log_file: '.github/latest-build-log.txt'
  };
}

function secondsBetween(start, end) {
  const a = Date.parse(start || '');
  const b = Date.parse(end || '');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

function upsert(history, record) {
  const arr = Array.isArray(history) ? history.filter(Boolean) : [];
  const idx = arr.findIndex((item) => String(item.run_id) === String(record.run_id));
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...record };
  } else {
    arr.unshift(record);
  }
  arr.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  return arr.slice(0, 10);
}

function finalStatus({ buildOutcome, artifactOutcome, publishOutcome, consumeOutcome, summaryStatus }) {
  if (summaryStatus === 'skipped') return 'skipped';
  if (buildOutcome !== 'success') return 'failure';
  if (artifactOutcome !== 'success') return 'artifact_failed';
  if (publishOutcome !== 'success') return 'publish_failed';
  if (consumeOutcome && consumeOutcome !== 'success' && consumeOutcome !== 'skipped') {
    return 'consume_failed';
  }
  return 'success';
}

await fsp.mkdir(path.dirname(latestPath), { recursive: true });

let latest = await readJson(latestPath, null);
let history = await readJson(historyPath, []);
let record;

if (action === 'start') {
  record = baseRecord('running');
} else {
  const buildOutcome = process.env.BUILD_OUTCOME || '';
  const artifactOutcome = process.env.ARTIFACT_OUTCOME || '';
  const publishOutcome = process.env.PUBLISH_OUTCOME || '';
  const consumeOutcome = process.env.CONSUME_OUTCOME || '';
  const summary = await readJson(summaryPath, null);
  const summaryStatus = summary?.status || null;
  const status = finalStatus({
    buildOutcome,
    artifactOutcome,
    publishOutcome,
    consumeOutcome,
    summaryStatus
  });

  record = latest && String(latest.run_id) === String(process.env.GITHUB_RUN_ID)
    ? { ...latest }
    : baseRecord(status);

  const finishedAt = now();
  record.status = status;
  record.finished_at = finishedAt;
  record.duration_seconds = secondsBetween(record.started_at, finishedAt);
  record.build_outcome = buildOutcome;
  record.artifact_outcome = artifactOutcome;
  record.publish_outcome = publishOutcome;
  record.consume_outcome = consumeOutcome;
  record.summary_status = summaryStatus;
}

latest = record;
history = upsert(history, record);

await fsp.writeFile(latestPath, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
await fsp.writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
await fsp.writeFile(latestIdPath, `${latest.run_id}\n`, 'utf8');
await fsp.writeFile(latestUrlPath, `${latest.run_url}\n`, 'utf8');

console.log(`Recorded run ${latest.run_id}: ${latest.status}`);
