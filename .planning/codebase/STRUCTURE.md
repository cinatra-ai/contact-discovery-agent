# Codebase Structure

**Analysis Date:** 2026-06-09

## Directory Layout

```
contact-discovery-agent/
├── cinatra/
│   └── oas.json                  # Cinatra Flow definition (agentspec v26.1.0)
├── skills/
│   └── contact-discovery-agent/
│       └── SKILL.md              # LLM system prompt / step-by-step recipe
├── .github/
│   └── workflows/
│       ├── ci.yml                # CI: runs extension-kind-gate + (optional) tests
│       └── release.yml           # Release pipeline
├── extension-kind-gate.mjs       # Self-contained CI validation gate (Node builtins only)
├── package.json                  # npm manifest; cinatra.kind: "agent"; zero deps
├── tsconfig.json                 # TypeScript config (targets future src/; no src/ exists today)
├── .npmrc                        # npm registry config (existence noted; contents not read)
├── LICENSE                       # Apache-2.0
└── README.md                     # Package documentation
```

## Directory Purposes

**`cinatra/`:**
- Purpose: Cinatra platform artefacts for this extension
- Contains: `oas.json` — the full Flow definition (StartNode, ApiNode, EndNode, control/data flow edges, referenced component specs)
- Key files: `cinatra/oas.json`

**`skills/contact-discovery-agent/`:**
- Purpose: Agent behaviour definition consumed by `/api/llm-bridge` at runtime
- Contains: `SKILL.md` — the LLM system prompt encoding inputs, tool discipline, 5-step recipe, error handling, and output format
- Key files: `skills/contact-discovery-agent/SKILL.md`

**`.github/workflows/`:**
- Purpose: GitHub Actions CI/CD
- Contains: `ci.yml` (runs `node extension-kind-gate.mjs --package-root .`), `release.yml`
- Key files: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

## Key File Locations

**Entry Points:**
- `cinatra/oas.json`: Flow definition — the runnable unit invoked by the Cinatra platform
- `skills/contact-discovery-agent/SKILL.md`: LLM system prompt loaded at runtime via `agent_id: "contact-discovery-agent"`

**Configuration:**
- `package.json`: Package identity (`@cinatra-ai/contact-discovery-agent`), `cinatra.kind: "agent"`, `cinatra.apiVersion: "cinatra.ai/v1"`, zero runtime dependencies
- `tsconfig.json`: TypeScript compiler config (strict, ESNext, bundler module resolution, `outDir: dist`, `rootDir: src`)
- `.npmrc`: Registry configuration (existence noted; contents not read)

**Core Logic:**
- `skills/contact-discovery-agent/SKILL.md`: All agent logic lives here — no compiled TypeScript exists
- `cinatra/oas.json`: Wires inputs/outputs and routes execution to `/api/llm-bridge`

**CI Validation:**
- `extension-kind-gate.mjs`: Self-contained Node.js validation script; exports `validateAgent`, `validateWorkflow`, `validateBpmnSanity`, `runGate`, `parseArgs`

## Naming Conventions

**Files:**
- Flow definition: `cinatra/oas.json` (always this path for agent-kind extensions)
- Skill file: `skills/<agent-id>/SKILL.md` (directory name matches `agent_id` used in OAS ApiNode)
- Gate script: `extension-kind-gate.mjs` (kebab-case `.mjs`)
- Workflows: `.github/workflows/<purpose>.yml` (kebab-case)

**Directories:**
- `cinatra/`: Cinatra platform artefacts (fixed convention across all Cinatra extension repos)
- `skills/<agent-id>/`: One subdirectory per skill, named after the agent id

## Where to Add New Code

**Updating agent behaviour (steps, tool calls, error handling):**
- Edit: `skills/contact-discovery-agent/SKILL.md`
- The LLM bridge auto-discovers this file via `agent_id`; no OAS change required for prompt-only changes

**Changing flow inputs or outputs:**
- Edit: `cinatra/oas.json` — update `inputs`/`outputs` arrays in the top-level flow spec AND in `$referenced_components.start` / `$referenced_components.discover` / `$referenced_components.end`
- Add corresponding DataFlowEdge entries if wiring new fields

**Adding compiled TypeScript utilities (future):**
- Create: `src/` directory at repo root (matches `tsconfig.json` `rootDir: "src"`)
- Output compiles to `dist/` (gitignored by convention)

**Adding tests:**
- Follow existing CI pattern: add test runner invocation in `.github/workflows/ci.yml`
- No test framework is currently configured; `tsconfig.json` is present for when TypeScript is added

**CI gate updates:**
- Edit: `extension-kind-gate.mjs` — add new banned primitives to `BANNED_PRIMITIVES` array or extend `validateAgent` / `validateWorkflow` functions
- Must remain self-contained (Node builtins only; no external deps)

## Special Directories

**`cinatra/`:**
- Purpose: Cinatra platform artefacts (flow OAS)
- Generated: No (hand-authored)
- Committed: Yes

**`skills/`:**
- Purpose: LLM skill/system-prompt definitions
- Generated: No (hand-authored)
- Committed: Yes

**`dist/`:**
- Purpose: TypeScript compiler output (future, when `src/` is added)
- Generated: Yes
- Committed: No (conventional; no `src/` exists today so `dist/` does not exist)

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: Yes (by GSD tooling)
- Committed: Per project convention

---

*Structure analysis: 2026-06-09*
