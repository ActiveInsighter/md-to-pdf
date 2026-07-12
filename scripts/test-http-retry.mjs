import assert from 'node:assert/strict';
import {
  RetryFetchError,
  fetchWithRetry,
  parseRetryAfter,
  retryDelay,
  retryPolicyFromEnv,
} from './http-retry.mjs';

const policy = { timeoutMs: 200, maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20 };

assert.deepEqual(retryPolicyFromEnv({}), {
  timeoutMs: 15000,
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 5000,
});
assert.throws(
  () => retryPolicyFromEnv({ REQUEST_MAX_ATTEMPTS: '0' }),
  /REQUEST_MAX_ATTEMPTS must be an integer between 1 and 5/,
);
assert.throws(
  () => retryPolicyFromEnv({ RETRY_BASE_DELAY_MS: '20', RETRY_MAX_DELAY_MS: '10' }),
  /RETRY_MAX_DELAY_MS must be an integer between 20 and 30000/,
);

assert.equal(parseRetryAfter('0.01', 20, 0), 10);
assert.equal(parseRetryAfter('999', 20, 0), 20);
assert.equal(parseRetryAfter('Thu, 01 Jan 1970 00:00:00 GMT', 20, 1_000), 0);
assert.equal(parseRetryAfter('Thu, 01 Jan 1970 00:00:01 GMT', 20, 990), 10);
assert.equal(parseRetryAfter('invalid', 20, 0), null);
assert.equal(retryDelay(null, 1, policy, 0), 5);
assert.equal(retryDelay(null, 2, policy, 0), 10);
assert.equal(retryDelay(null, 4, policy, 0), 20);
assert.equal(retryDelay(new Response('', { status: 429, headers: { 'Retry-After': '0' } }), 1, policy, 0), 0);

async function runFetchCase({ responses, expectedCalls, expectedSleeps = [], expectedWarnings = 0 }) {
  let calls = 0;
  const sleeps = [];
  const warnings = [];
  const fetchImpl = async () => {
    const item = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    if (item instanceof Error) throw item;
    return item;
  };

  const result = await fetchWithRetry('https://example.test/resource', {
    requestInit: { method: 'GET' },
    target: '/resource',
    policy,
    fetchImpl,
    sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
    logger: { warn: (message) => warnings.push(message) },
    now: () => 0,
  });

  assert.equal(calls, expectedCalls);
  assert.deepEqual(sleeps, expectedSleeps);
  assert.equal(warnings.length, expectedWarnings);
  return { result, warnings };
}

{
  const { result, warnings } = await runFetchCase({
    responses: [
      new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }),
      new Response('{}', { status: 200 }),
    ],
    expectedCalls: 2,
    expectedSleeps: [0],
    expectedWarnings: 1,
  });
  assert.equal(result.status, 200);
  assert.match(warnings[0], /Retrying GET \/resource in 0ms .*HTTP 429/);
}

{
  const { result } = await runFetchCase({
    responses: [new Response('forbidden', { status: 403 })],
    expectedCalls: 1,
  });
  assert.equal(result.status, 403);
}

{
  const { result, warnings } = await runFetchCase({
    responses: [new Response('unavailable', { status: 503 })],
    expectedCalls: 3,
    expectedSleeps: [5, 10],
    expectedWarnings: 2,
  });
  assert.equal(result.status, 503);
  assert.match(warnings[1], /attempt 3\/3/);
}

{
  const timeoutError = new Error('operation timed out');
  timeoutError.name = 'TimeoutError';
  let calls = 0;
  await assert.rejects(
    () =>
      fetchWithRetry('https://example.test/resource', {
        requestInit: { method: 'DELETE' },
        target: '/resource',
        policy,
        fetchImpl: async () => {
          calls += 1;
          throw timeoutError;
        },
        sleepImpl: async () => {},
        logger: { warn: () => {} },
      }),
    (error) => {
      assert.ok(error instanceof RetryFetchError);
      assert.equal(error.kind, 'timeout');
      assert.equal(error.attempts, 3);
      assert.match(error.message, /DELETE \/resource timed out after 200ms/);
      return true;
    },
  );
  assert.equal(calls, 3);
}

{
  const networkError = new TypeError('socket closed');
  await assert.rejects(
    () =>
      fetchWithRetry('https://example.test/resource', {
        requestInit: { method: 'PATCH' },
        target: '/resource',
        policy: { ...policy, maxAttempts: 1 },
        fetchImpl: async () => {
          throw networkError;
        },
        sleepImpl: async () => {},
        logger: { warn: () => {} },
      }),
    (error) => {
      assert.ok(error instanceof RetryFetchError);
      assert.equal(error.kind, 'network');
      assert.equal(error.attempts, 1);
      assert.match(error.message, /PATCH \/resource network error: socket closed/);
      return true;
    },
  );
}

console.log('HTTP retry module tests passed.');
