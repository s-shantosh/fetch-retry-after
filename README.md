# fetch-retry-after

[![CI](https://github.com/s-shantosh/fetch-retry-after/actions/workflows/ci.yml/badge.svg)](https://github.com/s-shantosh/fetch-retry-after/actions/workflows/ci.yml)

A small, dependency-free wrapper around the native Fetch API. It retries temporary network failures and selected HTTP responses with exponential backoff, full jitter, and support for the server's `Retry-After` header.

## Install

```sh
npm install fetch-retry-after
```

Requires Node.js 22 or newer, or a modern browser with `fetch`, `AbortController`, and timers.

## Quick start

```js
import { createRetryFetch } from "fetch-retry-after";

const fetchWithRetry = createRetryFetch();
const response = await fetchWithRetry("https://api.example.com/data");

if (!response.ok) {
  throw new Error(`Request failed: ${response.status}`);
}

const data = await response.json();
```

CommonJS is supported too:

```js
const { createRetryFetch } = require("fetch-retry-after");

const fetchWithRetry = createRetryFetch();
```

## Configure it

```js
const fetchWithRetry = createRetryFetch({
  retries: 4,                 // retries after the first request
  baseDelayMs: 200,
  maxDelayMs: 10_000,
  jitter: "full",
  onRetry: ({ attempt, delayMs, response, error }) => {
    console.log(`Retry ${attempt + 1} in ${delayMs} ms`, response?.status ?? error);
  },
  shouldRetryError: (error) => error instanceof TypeError,
});
```

By default, rejected calls to the configured `fetch` are retried for eligible methods. Use `shouldRetryError` to filter rejections from a custom fetch implementation or to stop retries for errors you know are permanent. Native Fetch does not expose a standard error code that reliably separates network failures from every invalid request.

`fetchWithRetry(input, init)` accepts the same arguments as `fetch`, including an `AbortSignal`:

```js
const controller = new AbortController();
const response = await fetchWithRetry(url, { signal: controller.signal });

// Later, cancel an in-flight request or a backoff wait:
controller.abort();
```

## Defaults

- Retries network errors and HTTP `408`, `425`, `429`, `500`, `502`, `503`, and `504` responses.
- Retries `GET`, `HEAD`, and `OPTIONS` by default. It does not automatically repeat write requests.
- Uses exponential backoff with full jitter, starting at a 250 ms window and capped at 30 seconds.
- Uses a valid `Retry-After` value for HTTP-date or delay-seconds responses. If the server asks for longer than `maxDelayMs`, the response is returned without another request.
- Returns the final HTTP `Response` as normal `fetch` does. A network error is thrown after the retry limit.
- Cancels the body of an HTTP response before retrying it.

To opt into other methods, pass `retryMethods`, for example `retryMethods: ["GET", "PUT"]`. Only do this when repeating that request is safe for your API. If a request has a body, it must also be reusable for every attempt; one-shot streams cannot be replayed.

## API

### `createRetryFetch(options?)`

Returns a `fetch`-compatible async function.

| Option | Default | Description |
| --- | --- | --- |
| `fetch` | `globalThis.fetch` | Fetch implementation to wrap. |
| `retries` | `3` | Number of retries after the initial request. |
| `baseDelayMs` | `250` | Starting backoff window in milliseconds. |
| `maxDelayMs` | `30000` | Maximum backoff and accepted `Retry-After` delay. |
| `jitter` | `"full"` | Use `"none"` for deterministic exponential delays. |
| `retryableStatuses` | `408, 425, 429, 500, 502, 503, 504` | HTTP status codes that can be retried. |
| `retryMethods` | `GET, HEAD, OPTIONS` | HTTP methods eligible for retries. |
| `retryOnNetworkError` | `true` | Retry rejected fetch calls for eligible methods. |
| `shouldRetryError` | — | Optional predicate to reject permanent or custom errors from retries. |
| `onRetry` | — | Callback before each wait; receives attempt, delay, and error or response. |

Invalid options throw before a request is made. Both delay options are capped at `2147483647` ms, the maximum delay supported by standard JavaScript timers. The package supports Node.js 22 and newer and modern browsers; Node.js 18 and 20 are end-of-life. Pass a different `fetch` implementation in `options.fetch` for custom runtimes.

### `parseRetryAfterMs(value, now?)`

Parses the HTTP `Retry-After` header's delay-seconds or HTTP-date form. It returns milliseconds, `null` for missing or invalid input, and `Infinity` if a valid delay is too large to represent. The optional `now` timestamp is useful when parsing HTTP dates.

### Constants

- `DEFAULT_RETRYABLE_STATUSES`
- `DEFAULT_RETRY_METHODS`

## License

MIT

## Project links

- [Contributing guide](https://github.com/s-shantosh/fetch-retry-after/blob/main/CONTRIBUTING.md)
- [Security policy](https://github.com/s-shantosh/fetch-retry-after/blob/main/SECURITY.md)
- [Changelog](https://github.com/s-shantosh/fetch-retry-after/blob/main/CHANGELOG.md)
