<!-- refreshed: 2026-06-09 -->
# Architecture

**Analysis Date:** 2026-06-09

## System Overview

```text
┌────────────────────────────────────────────────────────┐
│              Caller / Orchestrator                      │
│   (passes accountId, titlePatterns, maxContacts,        │
│    apolloFirst via Cinatra Flow invocation)             │
└────────────────────┬───────────────────────────────────┘
                     │  POST /api/llm-bridge
                     ▼
┌────────────────────────────────────────────────────────┐
│          Cinatra Flow: contact-discovery-agent          │
│          `cinatra/oas.json`  (StartNode → ApiNode →     │
│           EndNode)                                      │
└───────────┬────────────────────────────────────────────┘
            │  LLM execution (OpenAI gpt-5.5)
            │  system prompt + SKILL.md step-by-step
            ▼
┌────────────────────────────────────────────────────────┐
│              LLM Agent (stateless)                      │
│    `skills/contact-discovery-agent/SKILL.md`            │
├────────────────────────────────────────────────────────┤
│  Step 1: crm_account_get          (MCP primitive)       │
│  Step 2: apollo_administration_get (MCP pre-check)      │
│          apollo_people_search      (MCP primary path)   │
│  Step 3: web_search               (OpenAI native tool,  │
│                                    fallback only)       │
│  Step 4: crm_contact_create       (MCP primitive, ×N)  │
│  Step 5: return JSON envelope                           │
└────────────────────────────────────────────────────────┘
            │
            ▼
  {contactIds, apolloHitCount, webFallbackUsed, failures}
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Flow definition (OAS) | Declares inputs/outputs, 3-node DAG (start → discover → end), wires data edges | `cinatra/oas.json` |
| SKILL.md | Stateless LLM system prompt; owns the 5-step recipe, tool discipline, error policy | `skills/contact-discovery-agent/SKILL.md` |
| StartNode | Accepts caller inputs; exposes accountId (required), titlePatterns, maxContacts, apolloFirst, cinatra_run_id | `cinatra/oas.json` → `$referenced_components.start` |
| ApiNode (`discover`) | POSTs to `/api/llm-bridge`; injects agent_id so bridge auto-discovers SKILL.md; omits explicit toolboxes so default self-MCP injection runs | `cinatra/oas.json` → `$referenced_components.discover` |
| EndNode | Collects outputs from `discover`; provides defaults (contactIds:[], apolloHitCount:0, etc.) | `cinatra/oas.json` → `$referenced_components.end` |
| CI gate | Node.js script; validates OAS parses, scans for banned/retired CRM primitives in LLM-visible prompt strings | `extension-kind-gate.mjs` |
| package.json | Declares npm package identity, `cinatra.kind: "agent"`, zero dependencies | `package.json` |

## Pattern Overview

**Overall:** Stateless LLM Leaf Agent on a Cinatra Flow runtime

**Key Characteristics:**
- No persistent state; all side-effects performed via MCP tool calls to external CRM and Apollo connectors
- Single ApiNode flow (3-node DAG: start → discover → end) — no branching, no loops, no HITL screens
- Agent behaviour fully encoded in `SKILL.md`; the flow OAS is pure plumbing
- Apollo primary path with LinkedIn `web_search` fallback; selection driven by `apolloFirst` boolean + Apollo connectivity check
- Hard defensive cap: `effectiveMaxContacts = Math.min(maxContacts, 5)` — never persists more than 5 contacts per run
- Failures accumulate in `failures[]`; only Step 1 (`account_not_found`) aborts execution

## Layers

**Flow orchestration layer:**
- Purpose: Declare the runnable Cinatra Flow — inputs, outputs, 3-node control DAG, data wiring
- Location: `cinatra/oas.json`
- Contains: StartNode, ApiNode (discover), EndNode, ControlFlowEdges, DataFlowEdges
- Depends on: Cinatra runtime (`agentspec_version: 26.1.0`), `/api/llm-bridge` endpoint
- Used by: Cinatra marketplace / orchestrator invoking this agent

**Agent behaviour layer:**
- Purpose: System prompt containing the step-by-step recipe executed by the LLM
- Location: `skills/contact-discovery-agent/SKILL.md`
- Contains: Inputs spec, tool discipline, 5-step recipe, error handling policy, defensive caps
- Depends on: MCP primitives (`crm_account_get`, `apollo_administration_get`, `apollo_people_search`, `crm_contact_create`) and OpenAI native `web_search`
- Used by: The `discover` ApiNode via `agent_id: "contact-discovery-agent"` — the bridge auto-discovers SKILL.md

**CI validation layer:**
- Purpose: Pre-publish sanity gate for extracted extension repos
- Location: `extension-kind-gate.mjs`
- Contains: `validateAgent` (OAS parse + retired-primitive scan), `validateWorkflow` (BPMN shape check), `runGate` dispatcher
- Depends on: Node.js builtins only (no `@cinatra-ai/*` deps)
- Used by: `.github/workflows/ci.yml` (`node extension-kind-gate.mjs --package-root .`)

## Data Flow

### Primary Request Path (Apollo)

1. Caller invokes Flow with `accountId` (required) + optional overrides → **StartNode** (`cinatra/oas.json` → `start`)
2. DataFlowEdges wire all inputs to **ApiNode** (`discover`) → POST to `/api/llm-bridge` with `agent_id: "contact-discovery-agent"` and templated `user` prompt
3. LLM reads SKILL.md (`skills/contact-discovery-agent/SKILL.md`), calls `crm_account_get({ id: accountId })` → resolves `accountName`, `websiteHost`; caps `effectiveMaxContacts`
4. LLM calls `apollo_administration_get({})` → confirms Apollo connected
5. LLM calls `apollo_people_search({ organizationDomains: [websiteHost], personTitles: titlePatterns, perPage: effectiveMaxContacts })` → filters results to entries with `email` OR `linkedin_url`
6. LLM calls `crm_contact_create(...)` once per usable result → collects returned `id` into `contactIds[]`
7. LLM returns JSON envelope → **EndNode** (`end`) surfaces `contactIds`, `apolloHitCount`, `webFallbackUsed`, `failures`

### Fallback Path (web_search)

1. Steps 1–3 same as above, except Apollo is unavailable/disconnected/returns zero usable results OR `apolloFirst === false`
2. For each `titlePattern`, LLM calls native `web_search` with `site:linkedin.com/in "<accountName>" "<titlePattern>"`
3. Top LinkedIn profile URL extracted; candidate built with `linkedinUrl` + `title` (no email)
4. `crm_contact_create` called per candidate (Step 4 identical)
5. `webFallbackUsed` set to `true` in result

**State Management:**
- No in-process state. All tracking variables (`contactIds`, `failures`, `apolloHitCount`, `webFallbackUsed`) are maintained in LLM context within a single `agent_run` and emitted in the final JSON. No database or cache is written by the agent itself — contacts are persisted in the CRM via `crm_contact_create`.

## Key Abstractions

**CRM facade (`crm_*` primitives):**
- Purpose: Provider-agnostic CRM interface; hides Twenty (or other CRM) specifics
- Examples: `crm_account_get`, `crm_contact_create` (called from SKILL.md)
- Pattern: MCP tool calls; results are `CrmAccount` / `CrmContact` typed objects

**Apollo connector:**
- Purpose: B2B contact enrichment data source (primary path)
- Examples: `apollo_administration_get`, `apollo_people_search` (SKILL.md Step 2)
- Pattern: MCP tool calls; connectivity pre-checked before search

**`failures[]` accumulator:**
- Purpose: Non-fatal error collection; every per-result failure appended without aborting
- Pattern: `{ name: string, error: string }` objects accumulated in LLM context; surfaced in output

## Entry Points

**Flow invocation:**
- Location: `cinatra/oas.json` → `start` StartNode
- Triggers: Cinatra marketplace or orchestrator calling the flow with `accountId`
- Responsibilities: Validate required input (`accountId`), apply defaults, forward to `discover` ApiNode

**CI gate:**
- Location: `extension-kind-gate.mjs` → `main()`
- Triggers: `node extension-kind-gate.mjs --package-root .` (from `.github/workflows/ci.yml`)
- Responsibilities: Detect `cinatra.kind`, dispatch to `validateAgent` or `validateWorkflow`, exit 0/1

## Architectural Constraints

- **Stateless execution:** The agent has no persistent state between runs. `crm_contact_create` is a plain create — no server-side dedup. Repeated runs over the same account produce duplicates; dedup is caller responsibility.
- **Contact cap:** Hard cap of 5 contacts per run (`effectiveMaxContacts = Math.min(maxContacts, 5)`). LLM must not persist more than 5 regardless of input.
- **Tool surface:** Exactly 4 MCP primitives + 1 OpenAI native tool (`web_search`). No `objects_*`, `accounts_*`, `contacts_*`, or legacy primitives.
- **No src/ directory:** This is a pure SKILL.md + OAS agent with no compiled TypeScript. `tsconfig.json` is present for future use but `src/` does not exist.
- **Zero dependencies:** `package.json` declares `"dependencies": []`. CI gate is self-contained Node.js builtins only.
- **LLM model:** `openai / gpt-5.5` (declared in `cinatra/oas.json` `cinatra_llm` and flow `metadata`)

## Anti-Patterns

### Using legacy CRM primitives

**What happens:** Calling `accounts_*`, `contacts_*`, `objects_*`, or `lists_*` primitives in SKILL.md or OAS prompt strings
**Why it's wrong:** These are retired; `extension-kind-gate.mjs` will flag them and CI fails; the CRM facade (`crm_*`) is the correct surface
**Do this instead:** Use `crm_account_get`, `crm_account_search`, `crm_contact_create`, `crm_contact_search` via the MCP facade

### Fabricating identifiers

**What happens:** LLM inventing a contact id or account id instead of letting the CRM assign it
**Why it's wrong:** SKILL.md explicitly forbids this; creates phantom records
**Do this instead:** Call `crm_contact_create` and use the returned `id` field

### Aborting on Step 2–4 failures

**What happens:** Throwing or stopping execution when Apollo or `crm_contact_create` fails
**Why it's wrong:** Steps 2–4 are best-effort; failures should accumulate in `failures[]` and the run should continue
**Do this instead:** Append `{ name, error }` to `failures[]` and continue to the next result or step

## Error Handling

**Strategy:** Single hard abort (Step 1 `account_not_found`); all other failures are soft and accumulated in `failures[]`

**Patterns:**
- Step 1: `crm_account_get` throws or returns null → return `{"error":"account_not_found","accountId":"<input>"}` immediately
- Step 2: Apollo not connected → append to `failures[]`, set `webFallbackUsed = true`, fall through to Step 3
- Step 2: `apollo_people_search` throws → append to `failures[]`, fall through to Step 3
- Step 2: result missing `email` AND `linkedin_url` → append `{ name, error: "no_dedup_key" }`, skip result
- Step 3: no LinkedIn result for a title pattern → append `{ name: titlePattern, error: "no_web_result" }`, continue
- Step 4: `crm_contact_create` throws → append `{ name, error }`, continue to next result

## Cross-Cutting Concerns

**Logging:** Not applicable — stateless LLM agent; no application-level logging layer
**Validation:** Input validation via SKILL.md recipe (Step 1 account resolution); OAS `required: ["accountId"]` enforced by StartNode
**Authentication:** Handled by Cinatra platform (self-MCP injection); agent never handles credentials directly

---

*Architecture analysis: 2026-06-09*
