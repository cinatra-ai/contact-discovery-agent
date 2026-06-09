# External Integrations

**Analysis Date:** 2026-06-09

## APIs & External Services

**Apollo (People Intelligence):**
- Apollo - Primary contact discovery source; queries people by organization domain and title patterns
  - SDK/Client: Cinatra MCP primitive `apollo_administration_get` (connectivity check) and `apollo_people_search` (people query)
  - Auth: Managed by the Cinatra platform connector; the agent checks connectivity via `apollo_administration_get({})` before use
  - Used in: Step 2 of the agent recipe defined in `skills/contact-discovery-agent/SKILL.md`

**LinkedIn (Web Fallback):**
- LinkedIn - Fallback contact discovery when Apollo is unavailable or returns no results
  - SDK/Client: OpenAI native `web_search` tool with site-restricted query `site:linkedin.com/in "<accountName>" "<titlePattern>"`
  - Auth: Provided by the OpenAI `gpt-5.5` model's built-in tool capability; not a Cinatra MCP primitive
  - Used in: Step 3 of the agent recipe defined in `skills/contact-discovery-agent/SKILL.md`

**Cinatra LLM Bridge:**
- Cinatra `/api/llm-bridge` - The platform endpoint that executes the agent's LLM reasoning loop
  - Endpoint: `{{CINATRA_BASE_URL}}/api/llm-bridge` (template variable injected at runtime)
  - Invoked by: The `discover` ApiNode in `cinatra/oas.json`
  - Model: OpenAI `gpt-5.5` (preferred provider `openai`, preferred model `gpt-5.5` per `cinatra/oas.json` metadata)

## Data Storage

**Databases:**
- Provider-agnostic CRM facade (e.g., Twenty CRM) - Contacts and accounts are read/written through Cinatra MCP primitives, not direct DB access
  - Read: `crm_account_get({ id })` - resolves the target account row
  - Write: `crm_contact_create({ name, accountId, email?, linkedinUrl?, title?, apolloPersonId? })` - persists each discovered contact
  - Note: `crm_contact_create` is a plain create with no server-side dedup; repeated runs over the same account will create duplicate contacts

**File Storage:**
- Not applicable

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- Cinatra platform - All authentication (Apollo connector, CRM provider) is managed by the Cinatra platform. The agent itself carries no credentials; it relies on the platform's self-MCP injection to surface authenticated tool calls.
- Apollo connector connectivity is verified at runtime via `apollo_administration_get`; if `connected !== true`, the agent falls back to web search

## Monitoring & Observability

**Error Tracking:**
- Not detected at the repo level; error accumulation is handled within the agent recipe itself via a `failures[]` array returned in the output JSON

**Logs:**
- Agent run tracing is managed by the Cinatra platform via `cinatra_run_id` / `agent_run_id` passed through the flow (see `cinatra/oas.json` data flow connections)

## CI/CD & Deployment

**Hosting:**
- Cinatra platform (cloud-hosted; agent is executed by `llm-bridge`)

**CI Pipeline:**
- GitHub Actions
  - `ci.yml`: Runs on push/PR to `main`; validates package shape, runs typecheck and tests (skipped for source-mirror repos with host-internal peers), dry-run pack, and the agent OAS validation gate via `extension-kind-gate.mjs`
  - `release.yml`: Triggered on GitHub Release publish; delegates to the reusable workflow `cinatra-ai/.github/.github/workflows/reusable-extension-release.yml@main` for marketplace submission

## Environment Configuration

**Required env vars:**
- `CINATRA_BASE_URL` - Injected by the Cinatra platform at flow execution time; used in the `discover` ApiNode URL
- `CINATRA_MARKETPLACE_VENDOR_TOKEN` - Org-level GitHub secret consumed by the release reusable workflow for marketplace submission

**Secrets location:**
- No `.env` file in this repo; all secrets are managed as GitHub Actions org secrets or injected by the Cinatra platform at runtime

## Webhooks & Callbacks

**Incoming:**
- None — this is a stateless leaf agent invoked synchronously by the Cinatra platform

**Outgoing:**
- None — all external calls are MCP primitive invocations routed through the Cinatra platform (Apollo, CRM) or the OpenAI native `web_search` tool

---

*Integration audit: 2026-06-09*
