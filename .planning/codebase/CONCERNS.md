# Codebase Concerns

**Analysis Date:** 2026-06-09

## Tech Debt

**No server-side deduplication in crm_contact_create:**
- Issue: `crm_contact_create` is a plain create — repeated agent runs over the same `accountId` will produce duplicate contact records. Dedup responsibility is explicitly punted to the orchestrator layer, but no orchestrator-level cleanup logic exists in this repo.
- Files: `skills/contact-discovery-agent/SKILL.md` (Step 4 comment), `cinatra/oas.json` (description field)
- Impact: Production data quality degrades silently on re-runs; downstream CRM views show duplicate contacts unless caller implements their own `crm_contact_search` + dedup pass.
- Fix approach: Add a pre-check step using `crm_contact_search` by email/linkedinUrl/apolloPersonId before calling `crm_contact_create`, or document a mandatory orchestrator-level dedup wrapper pattern.

**tsconfig.json targets `src/` but no `src/` directory exists:**
- Issue: `tsconfig.json` declares `"rootDir": "src"` and `"include": ["src/**/*.ts", "src/**/*.tsx"]` but this is a content-only extension — there are no TypeScript source files. CI explicitly detects and skips typecheck for content-only repos.
- Files: `tsconfig.json`
- Impact: Dead configuration. Misleads contributors into thinking TypeScript compilation is expected. `tsc` would error TS18003 "No inputs were found" if run naively.
- Fix approach: Remove `tsconfig.json` entirely (content-only extension has no TS sources), or replace with a minimal no-op config that documents its purpose.

**`apollo_validate` primitive referenced in OAS comment but is ambiguous:**
- Issue: `cinatra/oas.json` metadata description mentions `apollo_validate` alongside `apollo_administration_get` as if they are alternatives. SKILL.md instructs the LLM to prefer `apollo_administration_get` because it takes no args. The legacy `apollo_validate` name may still be attempted if the LLM pattern-matches on the OAS comment.
- Files: `cinatra/oas.json` (line 209 metadata.cinatra.description)
- Impact: LLM may invoke a retired/unavailable primitive causing avoidable failures in the Apollo pre-check step.
- Fix approach: Remove the `apollo_validate` reference from the OAS description string entirely; keep only `apollo_administration_get`.

**Web-search name derivation is LLM-guessed:**
- Issue: In the Step 3 fallback, the agent derives a contact `name` from "the search snippet — first+last or the page title" — an instruction that relies on the LLM accurately parsing unstructured LinkedIn snippet text. There is no schema, no validation, and no minimum quality bar for the derived name before it is passed to `crm_contact_create`.
- Files: `skills/contact-discovery-agent/SKILL.md` (Step 3)
- Impact: Garbage names (page titles, truncated text, "LinkedIn" as a name) can be persisted as real contact records.
- Fix approach: Add an explicit validation step: if the derived name does not match a `<FirstName> <LastName>` pattern (≥2 tokens, no special chars), append to `failures[]` with `error: "unparseable_name"` instead of persisting.

## Known Bugs

**`effectiveMaxContacts` cap not enforced across the Apollo + web fallback boundary:**
- Symptoms: If Apollo returns 2 contacts and then the fallback is also triggered (e.g., `apolloFirst=false`), the web-search loop adds up to `effectiveMaxContacts` MORE candidates, potentially persisting up to 2× the cap.
- Files: `skills/contact-discovery-agent/SKILL.md` (Step 3 — "Stop once we have `effectiveMaxContacts` candidates total" counts only web candidates, not the combined running total from Step 2)
- Trigger: `apolloFirst=false` with `maxContacts > 1` and a non-empty Apollo result from a prior step (not a normal execution path, but possible if Step 2 is partially executed before `webFallbackUsed=true` is set).
- Workaround: In practice, the Step 2/3 mutual exclusion (`if apolloHitCount > 0: SKIP Step 3`) prevents simultaneous execution; risk is low but the wording is ambiguous.

## Security Considerations

**LLM prompt injection via accountName and titlePatterns:**
- Risk: `accountName` (resolved from `crm_account_get`) and `titlePatterns` (caller-supplied) are interpolated directly into the LLM `user` prompt string in `cinatra/oas.json` (line 172). A malicious account name or title pattern could attempt to redirect agent behavior via prompt injection.
- Files: `cinatra/oas.json` (data.user template, lines 172-175)
- Current mitigation: None. The cinatra llm-bridge platform may apply its own sanitization, but there is no evidence of input sanitization at this layer.
- Recommendations: Validate `titlePatterns` entries against an allowlist of expected job-title strings. Wrap interpolated account data in explicit delimiters and instruct the system prompt to treat them as data, not instructions.

**`.npmrc` file present:**
- `.npmrc` exists in the repo root. Contents not read (forbidden). Its presence alongside a scoped `@cinatra-ai/` package may contain registry auth tokens.
- Files: `.npmrc`
- Current mitigation: The file is committed to the repository — verify it contains no auth tokens (e.g., `//registry.npmjs.org/:_authToken=...`) before treating this repo as public.
- Recommendations: Ensure `.npmrc` only contains the `@cinatra-ai:registry=` scope redirect and no embedded credentials.

## Performance Bottlenecks

**Sequential per-contact `crm_contact_create` calls:**
- Problem: Step 4 issues one `crm_contact_create` call per usable result, sequentially. With `maxContacts=5` this is up to 5 sequential write RPCs in a single agent turn.
- Files: `skills/contact-discovery-agent/SKILL.md` (Step 4)
- Cause: LLM-native tool calling is inherently sequential unless the platform supports parallel tool calls. The SKILL.md recipe does not indicate parallelism is expected.
- Improvement path: If the cinatra llm-bridge supports parallel tool calls (OpenAI parallel function calling), the SKILL.md recipe could be amended to batch all `crm_contact_create` calls in a single turn, reducing latency by up to 4× at the maximum cap.

## Fragile Areas

**LLM behavioral contract enforced only by SKILL.md prose:**
- Files: `skills/contact-discovery-agent/SKILL.md`, `cinatra/oas.json`
- Why fragile: The entire agent logic (step ordering, cap enforcement, fallback conditions, output JSON shape) lives as natural-language instructions to the LLM. There is no code, schema, or runtime that enforces these rules — a model regression or misinterpretation silently produces wrong output.
- Safe modification: Any change to SKILL.md step logic must be tested end-to-end with the target model (gpt-5.5). Step numbering and conditional logic must be unambiguous — prefer numbered lists over nested prose conditionals.
- Test coverage: No automated tests exist in this repo for agent behavior.

**Output JSON shape is LLM-generated with no schema validation:**
- Files: `cinatra/oas.json` (outputs schema), `skills/contact-discovery-agent/SKILL.md` (Step 5)
- Why fragile: The LLM is instructed to return exactly one JSON object. There is no structured output enforcement (e.g., OpenAI `response_format: json_schema`) visible in the OAS. If the model returns prose or a slightly different key name, the cinatra bridge's output extraction may fail or silently return null.
- Safe modification: Add `response_format: { type: "json_schema", json_schema: { ... } }` to the llm-bridge call in `cinatra/oas.json` to hard-enforce the output envelope shape.
- Test coverage: None in this repo.

## Scaling Limits

**Hard cap of 5 contacts per run:**
- Current capacity: Maximum 5 contacts per agent invocation.
- Limit: Encoded in the SKILL.md recipe (`Math.min(maxContacts, 5)`). An orchestrator that needs more contacts must invoke the agent multiple times with different `titlePatterns` segments.
- Scaling path: Cap is a deliberate design constraint (leaf-agent scope). Remove requires renegotiating the agent contract at the orchestrator level and updating the OAS `maxContacts` input default/description.

**Apollo `perPage` equals `effectiveMaxContacts` (max 5):**
- Current capacity: Apollo query retrieves at most 5 results per run.
- Limit: No pagination — a single Apollo page fetch only. If the first page returns fewer usable results than requested (due to the `email`/`linkedinUrl` filter), the agent cannot fetch the next page to compensate.
- Scaling path: Add a pagination retry loop in the SKILL.md Apollo step that fetches additional pages until `effectiveMaxContacts` usable results are collected or Apollo is exhausted.

## Dependencies at Risk

**No runtime dependencies — risk: none.**
- The package declares `"dependencies": []` in `package.json`. All tool access is via the cinatra platform's injected MCP server at runtime.
- Risk: If the cinatra MCP server changes the `apollo_administration_get`, `apollo_people_search`, `crm_account_get`, or `crm_contact_create` primitive signatures, this agent has no version pin and will break silently.
- Impact: Step 2 or Step 4 failures manifest as entries in `failures[]`, which the calling orchestrator may not monitor.
- Migration plan: Add integration-level smoke tests triggered on MCP primitive schema changes; version-pin the expected primitive API surface in the OAS or a contract test.

## Missing Critical Features

**No orchestrator-level dedup wrapper:**
- Problem: The agent's own documentation (README and OAS) warns that re-runs create duplicates and says cleanup is "out of scope." No companion agent or utility is provided.
- Blocks: Safe repeated invocation over the same account (e.g., scheduled enrichment pipelines).

**No contact existence pre-check:**
- Problem: Before persisting via `crm_contact_create`, the agent never calls `crm_contact_search` to verify the contact does not already exist.
- Blocks: Idempotent operation — every invocation over the same account creates new records regardless of prior runs.

## Test Coverage Gaps

**No tests of any kind:**
- What's not tested: Agent step logic (account resolution, Apollo path, web fallback, cap enforcement, error accumulation), OAS gate behavior for agent-kind validation, output JSON shape conformance.
- Files: Entire repo — no `*.test.*` or `*.spec.*` files exist.
- Risk: LLM behavioral regressions, OAS schema drift, and cap-enforcement bugs would be undetected until production failures.
- Priority: High

**extension-kind-gate.mjs has no unit tests in this repo:**
- What's not tested: `validateAgent`, `validateBpmnSanity`, `validateWorkflowPackageShape`, `findWorkflowSidecars`, `parseArgs` exports — all are pure functions suitable for unit testing.
- Files: `extension-kind-gate.mjs`
- Risk: A regression in the gate logic (e.g., a banned-primitive regex change) could silently stop catching retired-CRM-primitive violations in extracted agent repos.
- Priority: Medium

---

*Concerns audit: 2026-06-09*
