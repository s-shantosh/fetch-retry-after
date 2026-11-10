import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import createRetryFetchDefault, {
  createRetryFetch,
  parseRetryAfterMs,
  DEFAULT_RETRYABLE_STATUSES,
  DEFAULT_RETRY_METHODS,
} from "../index.js";

const require = createRequire(import.meta.url);
const commonJs = require("../index.cjs");

test("ESM and CommonJS entry points expose the same public API", () => {
  assert.equal(createRetryFetchDefault, createRetryFetch);
  assert.equal(typeof commonJs.createRetryFetch, "function");
  assert.deepEqual(commonJs.DEFAULT_RETRYABLE_STATUSES, DEFAULT_RETRYABLE_STATUSES);
  assert.deepEqual(commonJs.DEFAULT_RETRY_METHODS, DEFAULT_RETRY_METHODS);
});

test("parseRetryAfterMs accepts delta-seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterMs("3"), 3000);
  const now = Date.parse("Wed, 21 Oct 2015 07:27:59 GMT");
  assert.equal(parseRetryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT", now), 1000);
  assert.equal(parseRetryAfterMs("not a date"), null);
  assert.equal(parseRetryAfterMs("9".repeat(400)), Number.POSITIVE_INFINITY);
  assert.throws(() => parseRetryAfterMs("1", Number.NaN), RangeError);
});

test("retries rejected GET requests and returns the successful response", async () => {
  let calls = 0;
  const retryAttempts = [];
  const fetchWithRetry = createRetryFetch({
    fetch: async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("temporary network failure");
      return new Response("ok");
    },
    retries: 2,
    baseDelayMs: 0,
    jitter: "none",
    onRetry: ({ attempt, error }) => retryAttempts.push({ attempt, error }),
  });

  const response = await fetchWithRetry("https://example.test/data");
  assert.equal(await response.text(), "ok");
  assert.equal(calls, 3);
  assert.deepEqual(retryAttempts.map(({ attempt }) => attempt), [1, 2]);
});

test("shouldRetryError can stop retries for a rejected request", async () => {
  let calls = 0;
  const permanentError = new TypeError("invalid request");
  const fetchWithRetry = createRetryFetch({
    fetch: async () => {
      calls += 1;
      throw permanentError;
    },
    retries: 4,
    baseDelayMs: 0,
    shouldRetryError: () => false,
  });

  await assert.rejects(fetchWithRetry("https://example.test/data"), (error) => error === permanentError);
  assert.equal(calls, 1);
});

test("does not retry write methods by default", async () => {
  let calls = 0;
  const fetchWithRetry = createRetryFetch({
    fetch: async () => {
      calls += 1;
      return new Response("failed", { status: 503 });
    },
    retries: 3,
    baseDelayMs: 0,
  });

  const response = await fetchWithRetry("https://example.test/data", { method: "POST" });
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test("retries a configured transient response and honors Retry-After: 0", async () => {
  let calls = 0;
  const retryFetch = createRetryFetch({
    fetch: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("busy", { status: 503, headers: { "Retry-After": "0" } });
      }
      return new Response("ready", { status: 200 });
    },
    retries: 1,
    baseDelayMs: 0,
  });

  const response = await retryFetch("https://example.test/data");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ready");
  assert.equal(calls, 2);
});

test("returns a response when Retry-After exceeds the configured wait budget", async () => {
  let calls = 0;
  const retryFetch = createRetryFetch({
    fetch: async () => {
      calls += 1;
      return new Response("rate limited", { status: 429, headers: { "Retry-After": "10" } });
    },
    retries: 2,
    maxDelayMs: 100,
  });

  const response = await retryFetch("https://example.test/data");
  assert.equal(response.status, 429);
  assert.equal(await response.text(), "rate limited");
  assert.equal(calls, 1);
});

test("uses the Request signal to cancel a backoff wait", async () => {
  const controller = new AbortController();
  const request = new Request("https://example.test/data", { signal: controller.signal });
  let calls = 0;
  const abortReason = new Error("cancelled by caller");
  const retryFetch = createRetryFetch({
    fetch: async () => {
      calls += 1;
      throw new TypeError("temporary network failure");
    },
    retries: 2,
    baseDelayMs: 10_000,
    onRetry: () => controller.abort(abortReason),
  });

  await assert.rejects(retryFetch(request), (error) => error === abortReason);
  assert.equal(calls, 1);
});

test("validates options before calling fetch", () => {
  let calls = 0;
  assert.throws(() => createRetryFetch({
    fetch: async () => {
      calls += 1;
    },
    retries: -1,
  }), RangeError);
  assert.equal(calls, 0);
});

test("CommonJS entry returns standard fetch responses", async () => {
  const fetchWithRetry = commonJs.createRetryFetch({
    fetch: async () => new Response("commonjs"),
    retries: 0,
  });
  const response = await fetchWithRetry("https://example.test/data");
  assert.equal(await response.text(), "commonjs");
});
