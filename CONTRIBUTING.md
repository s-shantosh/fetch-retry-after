# Contributing

Thanks for considering a contribution.

## Before opening a change

- Keep the ESM (`index.js`) and CommonJS (`index.cjs`) behavior in sync.
- Add or update tests for user-visible behavior.
- Keep runtime dependencies at zero unless a dependency is essential.
- Update the README and changelog when changing the public API.

## Local checks

Use Node.js 22 or newer, then run:

```sh
npm ci
npm run check
npm test
npm pack --dry-run
```

`npm publish` runs the syntax check and test suite again through the `prepublishOnly` script.

## Pull requests

Describe the behavior change, the reason for it, and the checks you ran. Avoid including credentials, private URLs, or real API tokens in examples.
