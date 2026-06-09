# Technology Stack

**Analysis Date:** 2026-06-09

## Languages

**Primary:**
- TypeScript (ES2023 target) - Agent logic and type definitions (compiled via `tsconfig.json`, outputs to `dist/`)

**Secondary:**
- JavaScript (ESNext modules) - CI gate script `extension-kind-gate.mjs` (zero-dependency, plain Node)
- JSON - Agent flow specification `cinatra/oas.json`, package manifest

## Runtime

**Environment:**
- Node.js 24 (pinned in CI via `.github/workflows/ci.yml`)

**Package Manager:**
- pnpm (managed via corepack)
- `.npmrc`: `auto-install-peers=false`
- No committed lockfile (CI installs with `--no-frozen-lockfile`)

## Frameworks

**Core:**
- Cinatra Agent Framework (`cinatra.ai/v1`) - Stateless LLM-driven flow defined in `cinatra/oas.json`; the agent runs via the Cinatra `llm-bridge` API endpoint, not as a standalone server

**Testing:**
- Not applicable — this is a source-mirror repo; the parent cinatra monorepo owns test execution. No test files present.

**Build/Dev:**
- TypeScript compiler (`tsc`) - Configured via `tsconfig.json`; targets `src/` (no `src/` files currently tracked — content-only extension)
- corepack - Manages pnpm version for CI

## Key Dependencies

**Critical:**
- No runtime `dependencies` or `devDependencies` declared in `package.json`
- `@cinatra-ai/*` packages are used at runtime but are host-internal to the cinatra monorepo; they are declared as `peerDependencies` (optional) and resolved only within the monorepo workspace

**Infrastructure:**
- `extension-kind-gate.mjs` - Self-contained zero-dependency gate script that validates the `cinatra/oas.json` agent surface for retired primitives; runs in CI `kind-gates` job

## Configuration

**Environment:**
- `CINATRA_BASE_URL` - Runtime template variable injected into the flow's `discover` ApiNode URL (`{{CINATRA_BASE_URL}}/api/llm-bridge`); provided by the Cinatra platform at execution time, not a local `.env`
- No `.env` file detected

**Build:**
- `tsconfig.json` - Standalone strict TypeScript config; `strict: true`, `noImplicitAny: false`, module `ESNext`, `moduleResolution: bundler`, outputs declarations + sourcemaps to `dist/`

## Platform Requirements

**Development:**
- Node.js 24, pnpm via corepack
- Source mirror: standalone install/typecheck/test are skipped when host-internal `@cinatra-ai/*` peers are declared; the cinatra monorepo provides these

**Production:**
- Hosted on Cinatra platform; the agent flow is executed by the Cinatra `llm-bridge` API
- Published to Cinatra Marketplace via GitHub Release trigger (see `release.yml`); submission goes through the marketplace MCP proxy, not direct npm publish

---

*Stack analysis: 2026-06-09*
