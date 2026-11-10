"use strict";

const DEFAULT_RETRYABLE_STATUSES = Object.freeze([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY_METHODS = Object.freeze(["GET", "HEAD", "OPTIONS"]);

function assertNonNegativeFinite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number greater than or equal to 0.`);
  }
}

function normalizeOptions(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Options must be an object.");
  }

  const retries = options.retries === undefined ? 3 : options.retries;
  if (!Number.isSafeInteger(retries) || retries < 0) {
    throw new RangeError("retries must be a non-negative safe integer.");
  }

  const baseDelayMs = options.baseDelayMs === undefined ? 250 : options.baseDelayMs;
  const maxDelayMs = options.maxDelayMs === undefined ? 30_000 : options.maxDelayMs;
  assertNonNegativeFinite("baseDelayMs", baseDelayMs);
  assertNonNegativeFinite("maxDelayMs", maxDelayMs);
  if (baseDelayMs > 2_147_483_647 || maxDelayMs > 2_147_483_647) {
    throw new RangeError("baseDelayMs and maxDelayMs must not exceed 2147483647 ms.");
  }

  const jitter = options.jitter === undefined ? "full" : options.jitter;
  if (jitter !== "full" && jitter !== "none") {
    throw new TypeError('jitter must be either "full" or "none".');
  }

  const retryOnNetworkError = options.retryOnNetworkError === undefined
    ? true
    : options.retryOnNetworkError;
  if (typeof retryOnNetworkError !== "boolean") {
    throw new TypeError("retryOnNetworkError must be a boolean.");
  }

  const retryableStatuses = options.retryableStatuses === undefined
    ? DEFAULT_RETRYABLE_STATUSES
    : options.retryableStatuses;
  if (!Array.isArray(retryableStatuses) || retryableStatuses.some(
    (status) => !Number.isInteger(status) || status < 100 || status > 599,
  )) {
    throw new TypeError("retryableStatuses must be an array of HTTP status codes from 100 to 599.");
  }

  const retryMethods = options.retryMethods === undefined
    ? DEFAULT_RETRY_METHODS
    : options.retryMethods;
  if (!Array.isArray(retryMethods) || retryMethods.some(
    (method) => typeof method !== "string" || method.trim() === "",
  )) {
    throw new TypeError("retryMethods must be an array of non-empty HTTP method names.");
  }

  const onRetry = options.onRetry;
  if (onRetry !== undefined && typeof onRetry !== "function") {
    throw new TypeError("onRetry must be a function.");
  }

  const shouldRetryError = options.shouldRetryError;
  if (shouldRetryError !== undefined && typeof shouldRetryError !== "function") {
    throw new TypeError("shouldRetryError must be a function.");
  }

  const fetchImpl = options.fetch === undefined ? globalThis.fetch : options.fetch;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A Fetch implementation is required. Pass it as the fetch option.");
  }

  return {
    retries,
    baseDelayMs,
    maxDelayMs,
    jitter,
    retryOnNetworkError,
    retryableStatuses: new Set(retryableStatuses),
    retryMethods: new Set(retryMethods.map((method) => method.trim().toUpperCase())),
    onRetry,
    shouldRetryError,
    fetch: fetchImpl,
  };
}

function getAbortReason(signal) {
  if (signal && signal.reason !== undefined) return signal.reason;
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw getAbortReason(signal);
}

function delayWithSignal(delayMs, signal) {
  throwIfAborted(signal);
  if (delayMs <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, getAbortReason(signal));
    const timer = setTimeout(() => finish(resolve), delayMs);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    }
  });
}

function backoffDelay(attempt, options) {
  const ceiling = Math.min(options.maxDelayMs, options.baseDelayMs * (2 ** (attempt - 1)));
  if (options.jitter === "none") return ceiling;
  return Math.floor(Math.random() * (ceiling + 1));
}

function parseRetryAfterMs(value, now = Date.now()) {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (typeof now !== "number" || !Number.isFinite(now)) {
    throw new RangeError("now must be a finite timestamp in milliseconds.");
  }
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : Number.POSITIVE_INFINITY;
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - now);
}

function getMethod(input, init) {
  const method = init && init.method !== undefined
    ? init.method
    : input && typeof input.method === "string"
      ? input.method
      : "GET";
  return String(method).trim().toUpperCase();
}

function cancelResponseBody(response) {
  if (!response.body || typeof response.body.cancel !== "function") return Promise.resolve();
  return Promise.resolve(response.body.cancel()).catch(() => undefined);
}

function createRetryFetch(options = {}) {
  const settings = normalizeOptions(options);

  return async function retryFetch(input, init) {
    const signal = init && Object.prototype.hasOwnProperty.call(init, "signal")
      ? init.signal
      : input && input.signal;
    const mayRetryMethod = settings.retryMethods.has(getMethod(input, init));

    for (let attempt = 1; ; attempt += 1) {
      throwIfAborted(signal);

      let response;
      try {
        response = await settings.fetch(input, init);
      } catch (error) {
        if (signal && signal.aborted) throw getAbortReason(signal);
        if (!settings.retryOnNetworkError || !mayRetryMethod || attempt > settings.retries) {
          throw error;
        }
        if (settings.shouldRetryError && !(await settings.shouldRetryError(error, { attempt, input, init }))) {
          throw error;
        }

        const delayMs = backoffDelay(attempt, settings);
        if (settings.onRetry) {
          await settings.onRetry({ attempt, delayMs, error, input, init });
        }
        await delayWithSignal(delayMs, signal);
        continue;
      }

      if (!mayRetryMethod || attempt > settings.retries || !settings.retryableStatuses.has(response.status)) {
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      // Do not retry earlier than the server asks. If its delay is beyond our
      // configured budget, give the response back to the caller immediately.
      if (retryAfterMs !== null && retryAfterMs > settings.maxDelayMs) return response;

      const delayMs = retryAfterMs === null ? backoffDelay(attempt, settings) : retryAfterMs;
      try {
        if (settings.onRetry) {
          await settings.onRetry({ attempt, delayMs, response, input, init });
        }
      } finally {
        await cancelResponseBody(response);
      }
      await delayWithSignal(delayMs, signal);
    }
  };
}

module.exports = {
  createRetryFetch,
  parseRetryAfterMs,
  DEFAULT_RETRYABLE_STATUSES,
  DEFAULT_RETRY_METHODS,
};
