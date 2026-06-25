# Contact Discovery Agent

Find the right people at a company you already have in your CRM. Point the agent at an existing account, tell it which job titles you care about, and it pulls matching contacts from Apollo first — falling back to a LinkedIn web search when Apollo is unavailable — then saves them as new contact records attached to that account.

**Install:** add `@cinatra-ai/contact-discovery-agent` via the Cinatra marketplace or Extensions page. No extra packages are required.

**Configuration:** the only required input is `accountId` (the CRM provider-native id, e.g. a Twenty Company id). Optional inputs: `titlePatterns` (default `["founder", "CEO", "CTO"]`), `maxContacts` (default `3`, capped at `5`), and `apolloFirst` (default `true`; set to `false` to skip Apollo and go straight to the LinkedIn fallback).

**API contract:** inputs are `accountId` (string, required), `titlePatterns` (array of strings), `maxContacts` (integer), and `apolloFirst` (boolean). Outputs are `contactIds` (array of CRM contact ids), `apolloHitCount` (integer), `webFallbackUsed` (boolean), and `failures` (array of `{name, error}` objects).

**Troubleshooting:** if Apollo returns zero results, verify the account has a domain name in your CRM — that domain drives the people-search query. Contacts without an email or LinkedIn URL are skipped and appear in `failures[]`. Re-running over the same account creates duplicates; dedup at the orchestrator level using `crm_contact_search`.

**Development:** the flow is defined in `cinatra/oas.json` and the LLM instructions live in `skills/contact-discovery-agent/SKILL.md`. Run `node extension-kind-gate.mjs` at the repo root before publishing.

## Works with

- Apollo
- LinkedIn

## Capabilities

- Discover decision-makers at a target account by job title
- Use Apollo people-search as the primary source when the Apollo connector is connected
- Fall back to a LinkedIn web search when Apollo is unavailable or returns no usable results
- Require email or LinkedIn URL before persisting a contact; include Apollo person id when present
- Save discovered people as contacts attached to the right account via the CRM facade
- Return a structured summary of contact ids, Apollo hit count, fallback status, and per-contact failures
- Cap contacts persisted per run at five regardless of the `maxContacts` input
