# Release guide

## First npm publication

1. Check that `fetch-retry-after` is available on npm: `npm view fetch-retry-after` should report that the package is not found. If another maintainer already owns the name, choose another name and update `package.json`, `package-lock.json`, and the README before continuing.
2. Sign in to npm with `npm login --auth-type=web`. The npm account needs publishing authentication enabled; npm may request a second factor during publication.
3. From the project directory, run:

   ```sh
   npm ci
   npm run check
   npm test
   npm pack --dry-run
   npm publish --access public
   ```

   `npm publish` runs the syntax check and test suite again automatically.
4. Confirm the package is visible with `npm view fetch-retry-after` and open its npm page.

## Later releases with GitHub Actions

After the first release, configure npm trusted publishing for this public GitHub repository. In the package's npm settings, add a GitHub Actions trusted publisher for owner `s-shantosh`, repository `fetch-retry-after`, and workflow `.github/workflows/publish.yml`. Allow direct `npm publish` for that publisher. This workflow uses OIDC rather than a long-lived npm token.

For each release:

1. Update `CHANGELOG.md` and increment the version with `npm version patch`, `npm version minor`, or `npm version major`.
2. Push the commit and tag: `git push origin main --follow-tags`.
3. In GitHub, open **Actions → Publish to npm → Run workflow** and run it from `main`.
4. Confirm the new version with `npm view fetch-retry-after version`.
