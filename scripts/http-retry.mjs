export const DEFAULT_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export class RetryFetchError extends Error {
  constructor({ kind, method, target, timeoutMs, attempts, cause }) {
    const detail = cause instanceof Error ? cause.message : String(cause || 'unknown error');
    const message =
      kind === 'timeout'
        ? `${method} ${target} timed out after ${timeoutMs}ms`
        : `${method} ${target} network error: ${detail}`;
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = 'RetryFetchError';
    this.kind = kind;
    this.method = method;
    this.target = target;
    this.timeoutMs = timeoutMs;
    this.attempts = attempts;
  }
}

function integerSetting(env, name, fallback, minimum, maximum) {
  const raw = env[name] || String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}; received ${raw}.`);
  }
  return value;
}

export function retryPolicyFromEnv(env = process.env) {
  const timeoutMs = integerSetting(env, 'REQUEST_TIMEOUT_MS', 15000, 100, 120000);
  const maxAttempts = integerSetting(env, 'REQUEST_MAX_ATTEMPTS', 3, 1, 5);
  const baseDelayMs = integerSetting(env, 'RETRY_BASE_DELAY_MS', 250, 1, 10000);
  const maxDelayMs = integerSetting(env, 'RETRY_MAX_DELAY_MS', 5000, baseDelayMs, 30000);
  return { timeoutMs, maxAttempts, baseDelayMs, maxDelayMs };
}

export function isTimeoutError(error) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function parseRetryAfter(value, maxDelayMs, now = Date.now()) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), maxDelayMs);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(Math.max(0, timestamp - now), maxDelayMs);
}

export function retryDelay(response, attempt, policy, now = Date.now()) {
  const retryAfter = parseRetryAfter(response?.headers?.get('retry-after'), policy.maxDelayMs, now);
  if (retryAfter !== null) return retryAfter;
  return Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
}

export function retryReason(error, response, timeoutMs) {
  if (response) return `HTTP ${response.status}`;
  if (isTimeoutError(error)) return `request timeout after ${timeoutMs}ms`;
  return `network error: ${error instanceof Error ? error.message : String(error)}`;
}

export async function fetchWithRetry(
  url,
  {
    requestInit = {},
    target,
    policy,
    retryableStatuses = DEFAULT_RETRYABLE_STATUSES,
    fetchImpl = globalThis.fetch,
    sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    logger = console,
    now = Date.now,
  },
) {
  if (!policy) throw new Error('A retry policy is required.');
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  const method = requestInit.method || 'GET';
  const requestTarget = target || String(url);

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    let response = null;
    let requestError = null;

    try {
      response = await fetchImpl(url, {
        ...requestInit,
        signal: AbortSignal.timeout(policy.timeoutMs),
      });
    } catch (error) {
      requestError = error;
    }

    if (response && !retryableStatuses.has(response.status)) return response;

    if (attempt < policy.maxAttempts) {
      const delayMs = retryDelay(response, attempt, policy, now());
      await response?.body?.cancel().catch(() => {});
      logger.warn(
        `Retrying ${method} ${requestTarget} in ${delayMs}ms (attempt ${attempt + 1}/${policy.maxAttempts}): ${retryReason(requestError, response, policy.timeoutMs)}`,
      );
      await sleepImpl(delayMs);
      continue;
    }

    if (response) return response;
    throw new RetryFetchError({
      kind: isTimeoutError(requestError) ? 'timeout' : 'network',
      method,
      target: requestTarget,
      timeoutMs: policy.timeoutMs,
      attempts: attempt,
      cause: requestError,
    });
  }

  throw new Error(`${method} ${requestTarget} failed after ${policy.maxAttempts} attempts.`);
}
