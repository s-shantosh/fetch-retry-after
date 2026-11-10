export type RetryFetchInput = RequestInfo | URL;

export interface RetryAttemptInfo {
  /** The one-based request attempt that just failed. */
  attempt: number;
  /** The wait before the next request, in milliseconds. */
  delayMs: number;
  /** Present when the fetch implementation rejected. */
  error?: unknown;
  /** Present when the server returned a retryable HTTP response. */
  response?: Response;
  input: RetryFetchInput;
  init?: RequestInit;
}

export interface RetryErrorContext {
  /** The one-based failed request attempt. */
  attempt: number;
  input: RetryFetchInput;
  init?: RequestInit;
}

export interface RetryFetchOptions {
  /** Fetch implementation to wrap. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Number of retries after the first request. Default: 3. */
  retries?: number;
  /** Starting backoff window in milliseconds. Default: 250. Maximum: 2147483647. */
  baseDelayMs?: number;
  /** Maximum backoff or accepted Retry-After delay. Default: 30000. Maximum: 2147483647. */
  maxDelayMs?: number;
  /** Full jitter avoids synchronized retry bursts. Default: "full". */
  jitter?: "full" | "none";
  /** HTTP statuses that can trigger a retry. */
  retryableStatuses?: readonly number[];
  /** Methods allowed to retry. Defaults to GET, HEAD, and OPTIONS. */
  retryMethods?: readonly string[];
  /** Retry rejected fetch calls for retryable methods. Default: true. */
  retryOnNetworkError?: boolean;
  /** Optional filter for rejected fetch calls. The default retries all rejected fetch calls. */
  shouldRetryError?: (error: unknown, context: RetryErrorContext) => boolean | Promise<boolean>;
  /** Called before each retry wait. May be asynchronous. */
  onRetry?: (info: RetryAttemptInfo) => void | Promise<void>;
}

export type RetryFetch = (
  input: RetryFetchInput,
  init?: RequestInit,
) => Promise<Response>;

export declare function createRetryFetch(options?: RetryFetchOptions): RetryFetch;

/** Parses Retry-After delta-seconds or HTTP-date. Returns null for invalid input and Infinity for an unrepresentably large valid delay. */
export declare function parseRetryAfterMs(value: string | null, now?: number): number | null;

export declare const DEFAULT_RETRYABLE_STATUSES: readonly number[];
export declare const DEFAULT_RETRY_METHODS: readonly string[];

export default createRetryFetch;
