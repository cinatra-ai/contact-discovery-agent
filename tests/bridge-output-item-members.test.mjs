// Bridge output member declarations — every array output of this flow declares
// what its items carry, so a consumer reading the value never has to guess.
//
// The failures list is the one that used to read free-form (an items object
// with no properties). Its shape is spelled out by the discover node's own
// system prompt: failures: Array<{name: string, error: string}>, and every
// push site in that prompt appends exactly a name/error string pair. The
// declaration below is that shape, asserted at all three places the output
// appears in one flow: the flow-level outputs, the discover node, the end node.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const oas = JSON.parse(readFileSync(join(root, "cinatra/oas.json"), "utf8"));
const components = oas.$referenced_components ?? {};

function outputNamed(outputs, title) {
  return (outputs ?? []).find((o) => o?.title === title);
}

const failuresOutputs = [
  ["flow-level outputs", outputNamed(oas.outputs, "failures")],
  ["discover node outputs", outputNamed(components.discover?.outputs, "failures")],
  ["end node outputs", outputNamed(components.end?.outputs, "failures")],
];

test("the failures output is present at all three places in the flow", () => {
  for (const [where, output] of failuresOutputs) {
    assert.ok(output, `no failures output at ${where}`);
    assert.equal(output.type, "array", `failures is not an array at ${where}`);
  }
});

test("the failures items declare the name and error members its consumers read", () => {
  for (const [where, output] of failuresOutputs) {
    const items = output?.json_schema?.items;
    assert.ok(items, `no items schema at ${where}`);
    assert.equal(items.type, "object", `items is not an object at ${where}`);
    assert.deepEqual(
      Object.keys(items.properties ?? {}).sort(),
      ["error", "name"],
      `items declare no name/error members at ${where}`,
    );
    assert.equal(items.properties.name.type, "string", `name is not a string at ${where}`);
    assert.equal(items.properties.error.type, "string", `error is not a string at ${where}`);
    assert.deepEqual(
      [...(items.required ?? [])].sort(),
      ["error", "name"],
      `name and error are not both required at ${where}`,
    );
  }
});

test("no array output of this flow is left free-form", () => {
  const seen = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.title === "string" && value.type === "array") {
      const items = value.json_schema?.items;
      const declared =
        items &&
        (items.type !== "object" || Object.keys(items.properties ?? {}).length > 0);
      if (!declared) seen.push(value.title);
    }
    for (const v of Object.values(value)) walk(v);
  };
  walk(oas);
  assert.deepEqual(seen, []);
});
