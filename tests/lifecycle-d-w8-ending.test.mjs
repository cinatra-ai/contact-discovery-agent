// Lifecycle D W8 — the contact discovery agent's own steps
// (cinatra#3096 items 19 and 20).
//
// (19) A run that ends closes with a plain sentence — how many contacts were
// saved and where they came from, or, when none were, why: the company is not
// in the CRM, Apollo is not connected or knows no such company, a web search
// found no profile for a job title, or a person had no email or profile link
// to save — never with the bare ids, counts and error codes the run hands on.
// The account step answers in the flow's declared shape, because the runtime
// asks every bridge step for exactly its declared outputs.
//
// (20) The failures list is left to the default road with nothing declared:
// no produces entry, no binding and no artifact dependency.
//
// The last two arms re-state the runtime loader's two mount rules over this
// flow, as cinatra-ai/email-recipient-selection-agent holds them in its own
// suite: (A) every input a step requires has a source on every path that
// reaches it, and (B) an OutputMessageNode declares only inputs its template
// reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));
const oas = read("cinatra/oas.json");
const pkg = read("package.json");

const refs = oas.$referenced_components;
const nodesOfType = (type) => Object.values(refs).filter((n) => n.component_type === type);
const controlEdges = (oas.control_flow_connections ?? []).map((e) => ({
  from: e.from_node.$component_ref,
  to: e.to_node.$component_ref,
  branch: e.from_branch,
}));
const hasEdge = (from, to) => controlEdges.some((e) => e.from === from && e.to === to);
const dataEdges = (oas.data_flow_connections ?? []).map((e) => [
  e.source_node.$component_ref + "." + e.source_output,
  e.destination_node.$component_ref + "." + e.destination_input,
]);
const countDataEdges = (from, to) => dataEdges.filter(([f, t]) => f === from && t === to).length;
const outsideComment = (message) => String(message ?? "").replace(/\{#[\s\S]*?#\}/g, "");
const systemText = () => String(refs.discover?.data?.system ?? "");

const FAILURE_CODES = ["account_not_found", "no_dedup_key", "no_org_match", "no_web_result", "not_connected"];

const MESSAGE =
  "{# pyagentspec-input-hint (do not remove): {{ contactIds }} {{ failures }} {{ webFallbackUsed }} #}" +
  "{% if contactIds %}" +
  "{% if contactIds | length == 1 %}One contact was found and saved to the CRM" +
  "{% else %}{{ contactIds | length }} contacts were found and saved to the CRM{% endif %}" +
  "{% if webFallbackUsed %} from a web search{% else %} from Apollo{% endif %}." +
  "{% if failures %} {{ failures | length }} other people or searches could not be used; they are listed with the run.{% endif %}" +
  "{% elif failures and failures[0].error == 'account_not_found' %}" +
  "No contacts were searched for: the company could not be found in the CRM." +
  "{% elif failures %}No contacts were saved for this company." +
  "{% for f in failures %}" +
  "{% if f.error == 'not_connected' %} Apollo is not connected, so only the web was searched." +
  "{% elif f.error == 'no_org_match' %} Apollo found no company of this name." +
  "{% elif f.error == 'no_web_result' %} A web search found no profile for the job title {{ f.name }}." +
  "{% elif f.error == 'no_dedup_key' %} {{ f.name }} was found but has no email address or profile link to save." +
  "{% else %} A search or a save for {{ f.name }} did not succeed.{% endif %}" +
  "{% endfor %}" +
  "{% else %}No contacts were found for this company for the job titles you set.{% endif %}";

const FAILURES_SCHEMA = {
  items: {
    type: "object",
    properties: { name: { type: "string" }, error: { type: "string" } },
    required: ["name", "error"],
  },
};

// ---------------------------------------------------------------------------
// (19) a plain-language ending on an empty, failed or found run
// ---------------------------------------------------------------------------

test("(19) the run ends in plain language, never in the envelope", () => {
  const summary = refs.discovery_summary;
  assert.ok(summary, "the run has no closing statement");
  assert.equal(summary.component_type, "OutputMessageNode");
  assert.ok(oas.nodes.some((n) => n.$component_ref === "discovery_summary"), "the closing statement is not a step of the flow");
  assert.ok(hasEdge("discover", "discovery_summary"), "the run's last step does not pass the closing statement");
  assert.ok(hasEdge("discovery_summary", "end"), "the closing statement does not lead to the end");
  assert.ok(!hasEdge("discover", "end"), "the run still jumps straight to its end");
  assert.deepEqual(
    refs.end.outputs.map((o) => o.title),
    ["contactIds", "apolloHitCount", "webFallbackUsed", "failures"],
    "the end node no longer carries the values the run hands on",
  );
});

test("(19) an empty, failed or found run ends in plain language", () => {
  const summary = refs.discovery_summary;
  assert.ok(summary, "the run has no closing statement");
  const message = String(summary.message ?? "");
  assert.equal(message, MESSAGE, "each outcome does not reach its own sentence");
  const rendered = outsideComment(message);
  assert.match(rendered, /\bcontactIds\b/, "the sentence never reads the saved contacts");
  assert.match(rendered, /\bfailures\b/, "the sentence never reads the failures");
  assert.match(rendered, /\bwebFallbackUsed\b/, "the sentence never reads where the contacts came from");
  assert.equal(summary.metadata?.cinatra?.purpose, "plain-language-contact-discovery-ending");
  assert.deepEqual(summary.inputs, [
    { title: "contactIds", type: "array", json_schema: { items: { type: "string" } }, default: [] },
    { title: "failures", type: "array", json_schema: FAILURES_SCHEMA, default: [] },
    { title: "webFallbackUsed", type: "boolean", default: false },
  ]);
  for (const input of ["contactIds", "failures", "webFallbackUsed"]) {
    assert.equal(
      countDataEdges(`discover.${input}`, `discovery_summary.${input}`),
      1,
      `the closing statement's ${input} is not fed exactly once by the discovery step`,
    );
  }
});

test("(19) every failure code the discovery step names reaches a plain sentence", () => {
  const summary = refs.discovery_summary;
  assert.ok(summary, "the run has no closing statement");
  const system = systemText();
  const named = new Set();
  for (const m of system.matchAll(/\berror:\s*"([a-z_]+)"/g)) named.add(m[1]);
  for (const m of system.matchAll(/"error"\s*:\s*"([a-z_]+)"/g)) named.add(m[1]);
  assert.deepEqual([...named].sort(), FAILURE_CODES, "the discovery step names a failure code the census does not know");
  const rendered = outsideComment(summary.message);
  const spoken = new Set([...rendered.matchAll(/\.error == '([a-z_]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...spoken].sort(), FAILURE_CODES, "a failure code of the discovery step has no plain sentence");
  assert.match(
    rendered,
    /\{% else %\}[^{]*\{\{ f\.name \}\}[^{]*\{% endif %\}\{% endfor %\}/,
    "an error text the step does not name has no fallback sentence",
  );
  assert.ok(!/\{\{\s*f\.error\s*\}\}/.test(rendered), "the sentence prints a raw error code");
  assert.ok(!/\{\{\s*failures\s*\}\}/.test(rendered), "the sentence prints the raw failures list");
});

test("(19) an account that cannot be found ends in the declared shape", () => {
  const system = systemText();
  assert.ok(
    !system.includes('{"error":"account_not_found"'),
    "the account step still answers in a bare error envelope",
  );
  const step1 = system.slice(system.indexOf("### Step 1"), system.indexOf("### Step 2"));
  const fence = step1.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(fence, "the account step shows no JSON answer");
  const answer = JSON.parse(fence[1]);
  assert.deepEqual(
    Object.keys(answer),
    refs.discover.outputs.map((o) => o.title),
    "the account step's answer is not the step's declared shape",
  );
  assert.equal(answer.failures.length, 1);
  assert.equal(answer.failures[0].error, "account_not_found");
});

// ---------------------------------------------------------------------------
// (20) the failures list goes the default road, nothing declared
// ---------------------------------------------------------------------------

test("(20) the failures list is left to the default road, nothing declared", () => {
  assert.equal(pkg.cinatra?.produces, undefined, "the manifest declares a produces entry");
  assert.equal(oas.metadata?.cinatra?.produces, undefined, "the flow declares a produces entry");
  const bound = [];
  for (const end of nodesOfType("EndNode")) {
    for (const out of end.outputs ?? []) if (out?.cinatra?.artifact) bound.push(`${end.id}.${out.title}`);
  }
  assert.deepEqual(bound, [], "an end output carries an artifact block");
  assert.deepEqual(
    (pkg.cinatra?.dependencies ?? []).filter((d) => d.kind === "artifact"),
    [],
    "the manifest carries an artifact dependency",
  );
});

// ---------------------------------------------------------------------------
// (A) every required step input has a source on every path that reaches it
// ---------------------------------------------------------------------------

/** The inputs a node CONSUMES: an EndNode names them under `outputs`, every
 *  other node declares `inputs`. */
function consumedInputs(node) {
  if (node.component_type === "EndNode") return node.outputs ?? [];
  return node.inputs ?? [];
}

/** Walk the flow the way the runtime loader does, returning each input it
 *  would demand from the StartStep. */
function unsourcedInputs() {
  const steps = new Map();
  for (const ref of oas.nodes ?? []) steps.set(ref.$component_ref, refs[ref.$component_ref]);
  const beginId = oas.start_node.$component_ref;
  const startTitles = new Set((steps.get(beginId)?.inputs ?? []).map((i) => i.title));
  const flowDataEdges = (oas.data_flow_connections ?? []).map((e) => ({
    from: e.source_node.$component_ref,
    key: `${e.destination_node.$component_ref}.${e.destination_input}`,
  }));
  const successors = (id) => controlEdges.filter((e) => e.from === id).map((e) => e.to);

  const violations = [];
  const visited = new Map();
  const queue = [[beginId, new Set()]];
  while (queue.length > 0) {
    const [id, incoming] = queue.pop();
    let produced = incoming;
    if (visited.has(id)) {
      const seen = visited.get(id);
      if ([...seen].every((k) => produced.has(k))) continue;
      produced = new Set([...produced].filter((k) => seen.has(k)));
    }
    visited.set(id, produced);

    const node = steps.get(id);
    if (!node) continue;
    if (id !== beginId) {
      for (const descriptor of consumedInputs(node)) {
        const key = `${id}.${descriptor.title}`;
        if (produced.has(key)) continue;
        if (Object.hasOwn(descriptor, "default")) continue;
        if (startTitles.has(descriptor.title)) continue;
        violations.push(key);
      }
    }

    const next = new Set(produced);
    for (const edge of flowDataEdges) if (edge.from === id) next.add(edge.key);
    for (const child of successors(id)) queue.push([child, new Set(next)]);
  }
  return violations;
}

test("every required step input has a source on every path that reaches it", () => {
  const found = unsourcedInputs();
  assert.deepEqual(
    found,
    [],
    "the runtime refuses to mount a flow whose step requires an input the StartStep does not carry: " + found.join(", "),
  );
});

// ---------------------------------------------------------------------------
// (B) an OutputMessageNode declares only inputs its template reads
// ---------------------------------------------------------------------------

test("an output message declares only inputs its template reads", () => {
  const offenders = [];
  for (const node of nodesOfType("OutputMessageNode")) {
    const rendered = outsideComment(node.message);
    for (const { title } of node.inputs ?? []) {
      if (!new RegExp(`\\b${title}\\b`).test(rendered)) offenders.push(`${node.id}.${title}`);
    }
  }
  assert.deepEqual(offenders, [], "the runtime rejects an input the template never reads: " + offenders.join(", "));
});
