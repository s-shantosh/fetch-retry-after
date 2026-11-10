# Changelog

## 1.0.0

- Initial release.
- Add ESM and CommonJS entry points with TypeScript declarations.
- Retry selected transient HTTP responses and rejected Fetch calls with exponential backoff and jitter.
- Allow callers to filter rejected fetch calls with `shouldRetryError`.
- Respect `Retry-After` and caller cancellation.
- Default to read-only HTTP methods; require explicit opt-in for other methods.
