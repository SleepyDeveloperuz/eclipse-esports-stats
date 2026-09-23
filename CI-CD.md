# GitHub → Vercel

## Everyday workflow

Commit a change to GitHub's `main` branch (including edits made on github.com), or merge a pull request into `main`.

1. GitHub Actions runs **Eclipse CI**: locked dependencies, syntax checks, all unit/DOM regression tests, and a static build.
2. Vercel's native GitHub integration independently runs the **same build gate** for that commit before publishing production.
3. Successful Vercel builds replace `https://eclipseesports.vercel.app`. Failed builds leave the previous deployment live.

GitHub and Vercel checks may run concurrently. Vercel does not wait for the GitHub Actions status: its own `npm run build` executes the same checks. No production secret or Vercel token needs to be added to GitHub Actions.

Only `main` triggers native Vercel deployment. Pull requests run secret-free CI but do not automatically deploy previews. This avoids giving public pull-request code access to deployment environment variables. GitHub may require approval for a first-time external contributor's CI run.

Saving a local file is not enough: commit and push, or merge the change. Edits to workflows/build settings can change or remove these gates; repository admins remain trusted. This setup does not add branch protection or promise that tests catch every bug.

## Reproducible checks

Use Node.js 24:

```sh
npm ci --include=dev --ignore-scripts
npm run build
```

`jsdom` is a pinned, development-only dependency, so DOM tests cannot silently skip on a clean runner. The CI runner strips production credentials from test subprocess environments and rejects skipped/cancelled test summaries. Tests mock external services; no browser automation or production writes are required.

The build publishes only selected frontend files into generated `public/`. `/api` functions stay in Vercel's serverless pipeline; `tests`, `scripts`, `lib`, `.github`, and local settings are not copied to static output. Existing API paths, headers, cron schedule and domain stay unchanged.

## One-time connection

Vercel project **eclipse-esports-stats** → Settings → Git → connect **SleepyDeveloperuz/eclipse-esports-stats**. Approve the Vercel GitHub app for this repository if requested. Set/confirm production branch **main**. The repository's `vercel.json` controls the install command, build gate and `public` output directory.

Check GitHub → Actions → Eclipse CI and Vercel → Deployments. A Git-triggered deployment should identify the same commit SHA as the GitHub push. A manual CLI deploy is not evidence that auto-deployment works.

## Failed deployments

Read the failed check/build logs, fix the commit, and push again. Do not disable tests to get a release out. To undo a bad source change, revert its commit and push the revert to `main`; this goes through the same checks. Vercel's dashboard can promote a known-good deployment for urgent recovery.
