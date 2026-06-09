# Testing Patterns

**Analysis Date:** 2026-06-09

## Repo Type Note

This is a **content-only Cinatra agent extension** repo. There are no `src/` TypeScript files — the only testable runtime code is `extension-kind-gate.mjs`. No test runner config files (`jest.config.*`, `vitest.config.*`) were detected, and no test files (`*.test.*`, `*.spec.*`) exist in the repo.

## Test Framework

**Runner:**
- Not configured in this repo
- CI runs `corepack pnpm test --if-present` for standalone repos; since this is a host-internal-peer (source mirror) repo, tests are skipped in standalone CI and run by the cinatra monorepo instead

**Assertion Library:**
- Not applicable — no test files present

**Run Commands:**
```bash
# No test script defined in package.json
# In the monorepo context, the gate is exercised via:
node extension-kind-gate.mjs --package-root .
```

## Test File Organization

**Location:**
- No test files detected in this repo

**Naming:**
- Not applicable

## Test Structure

**Suite Organization:**
- Not applicable — no test files

**Patterns:**
- Not applicable

## Mocking

**Framework:** Not applicable

**What to Mock (if tests were added):**
- `node:fs` functions (`readFileSync`, `existsSync`, `readdirSync`) — all I/O in `extension-kind-gate.mjs` routes through these
- `process.argv` — for testing `parseArgs` with different argument vectors

**What NOT to Mock:**
- The pure validation functions (`validateAgent`, `validateBpmnSanity`, `validateWorkflowPackageShape`) — these take plain strings/objects and return `string[]`; test them directly with fixture inputs

## Fixtures and Factories

**Test Data:**
- Not applicable — no test files

**Location:**
- Not applicable

## Coverage

**Requirements:** Not enforced (no coverage configuration)

**View Coverage:**
```bash
# Not configured
```

## Test Types

**Unit Tests:**
- Not present, but `extension-kind-gate.mjs` exports pure functions designed for unit testing:
  - `validateAgent(packageRoot)` — pure except for `readFileSync`/`existsSync` calls
  - `validateBpmnSanity(xml: string)` — fully pure; takes a string, returns `string[]`
  - `validateWorkflowPackageShape(pkg: object)` — fully pure; takes a parsed object, returns `string[]`
  - `parseArgs(argv: string[])` — fully pure
  - `findWorkflowSidecars(packageRoot)` — impure (walks filesystem)

**Integration Tests:**
- Not present

**E2E Tests:**
- Not present; the CI `kind-gates` job acts as an integration smoke test:
  - `node extension-kind-gate.mjs --package-root .` runs against the real `cinatra/oas.json` on every push/PR (`.github/workflows/ci.yml`, line 145)

## CI Gate as Functional Test

The primary quality validation is the CI pipeline (`.github/workflows/ci.yml`):

1. **Package shape check** — validates no `@cinatra-ai/*` packages leaked into `dependencies`/`devDependencies`, and first-party peers are marked `peerDependenciesMeta.optional`
2. **Typecheck** — skipped for this repo (source mirror with host-internal peers)
3. **Pack dry run** — `npm pack --dry-run` validates publish payload shape
4. **Agent OAS gate** — `node extension-kind-gate.mjs --package-root .` scans `cinatra/oas.json` for banned/retired CRM primitives in LLM-visible fields (`system`, `user`, `description`)

The banned primitives list enforced by the gate (in `extension-kind-gate.mjs`, lines 65–71):
- Legacy `lists_*`, `accounts_*`, `contacts_*` primitives — must be routed through `crm_*` facade
- Legacy entity typeHints `@cinatra-ai/entity-accounts:account`, `@cinatra-ai/entity-contacts:contact`
- `objects_list` over CRM entity types

## Common Patterns (Recommended for Future Tests)

**Testing pure validators:**
```javascript
// extension-kind-gate.mjs exports are directly importable
import { validateBpmnSanity, validateWorkflowPackageShape, parseArgs } from './extension-kind-gate.mjs';

// Fully pure — no mocking needed
const errors = validateBpmnSanity('<valid-bpmn-xml>');
assert.deepEqual(errors, []);
```

**Testing OAS scan with fixture files:**
```javascript
import { validateAgent } from './extension-kind-gate.mjs';
// Point at a temp directory containing a cinatra/oas.json fixture
const errors = validateAgent('/tmp/test-agent-fixture');
```

---

*Testing analysis: 2026-06-09*
