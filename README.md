# PatchBay & Skeleton Debugger

A browser-based repository inspection studio. **This build contains repository ingestion only** (Phase 1 wireframe): paste a public GitHub repository URL, and the app indexes the whole file tree, loads supported text files within fixed limits, and reports exactly what was and was not analysed. The Studio screen is a placeholder. Preview, editing, audit, Journal, and AI features are later specs.

The app never runs the imported code, never writes to GitHub, and never changes the original repository.

## Commands

```bash
npm install
npm run dev        # Vite dev server; serves /api/repo itself, no Vercel CLI needed
npm run typecheck
npm test           # vitest, offline: every GitHub call is mocked
npm run build
```

Node 20 or newer.

## Using a GitHub token (optional, server-side only)

Without a token the app uses GitHub's anonymous API, which allows only 60 requests per hour per IP address. Set `GITHUB_TOKEN` on the server to raise that limit:

- **Use a token that can read public repositories only.** With GitHub fine-grained personal access tokens, choose "Public repositories (read-only)" and grant no private repository permissions. Do not use a classic token with the `repo` scope.
- **The server also enforces this.** When a token is configured, `/api/repo` loads only repositories GitHub confirms are public, and answers `not_found` for anything else (the same answer as a missing repository, so a private repository's existence is not revealed). This is a second safeguard, not a replacement for a public-only token.
- The token is read from the server environment only. It is sent to `api.github.com` only, never to the file-content host, never returned to the browser, and never logged. The browser cannot supply one.
- Locally: copy `.env.example` to `.env` (git-ignored). On Vercel: add `GITHUB_TOKEN` as an environment variable.

## What it does and does not promise

- Only **public** GitHub repositories. Private repositories are not supported.
- Every path GitHub returns appears in the inventory. File contents are loaded progressively within limits (200 KB per file prefix, 1 MB hard ceiling, 3 MB total, 25 files per batch, 15 s per request). **These limits are provisional** until benchmarked.
- The coverage report is derived from per-file status and says "complete for supported file types" only when the tree is complete and every supported file was fully read. Files skipped by folder or file-type rules, files over the ceiling, binary files, truncated files, and failed files are all listed with reasons.
- If GitHub truncates a very large tree, the app says so. Loading only some folders cannot recover missing paths in this version, so the folder picker is shown only when the tree is complete.
- If loading fails, the app shows the error. It never substitutes a sample repository; samples load only when you choose one.
- In development builds only, if the server route fails, the browser may load directly from GitHub and says so on screen. Production builds use the server route only.

## Layout

```
api/repo.ts          POST /api/repo, streams NDJSON events (Vercel function)
src/engine/          URL parsing, GitHub client, inventory, file selection, pipeline, fetcher
src/types, config    contracts (zod schemas) and limits
src/store, hooks     shared state and the ingestion controller
src/components       wireframe screens
src/data             three bundled sample repositories
tests/               offline unit tests
.kiro/specs/         requirements, design, tasks
traceability/        PLAN.md
```

## Status

Verified by automated tests and by a headless-browser run. **Not yet verified:** a real Vercel deployment (including request cancellation), branch names containing `/` on the tree endpoint, and a physical phone.
