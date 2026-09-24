/**
 * Structural checks for `.github/workflows/ci.yml`.
 *
 * Prettier is already the repository's formatting authority and parses YAML, so
 * `make fmt-check` — and the explicit re-format below — rejects a malformed
 * workflow without adding a YAML dependency. The remaining assertions pin the
 * delivery requirements: a fresh checkout, the same `make verify` gate a
 * developer runs, least permissions, and no secrets, service stack or host
 * Node/npm substitute.
 *
 * These checks cannot prove a GitHub run: the workflow is UNPROVEN until the
 * owner pushes it and watches a run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const WORKFLOW = fileURLToPath(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
);
const workflowText = readFileSync(WORKFLOW, "utf8");
const lines = workflowText.split("\n");

function hasLine(expected: string): boolean {
  return lines.includes(expected);
}

test("the workflow is valid, repository-formatted YAML", async () => {
  const options = (await prettier.resolveConfig(WORKFLOW)) ?? {};
  const formatted = await prettier.format(workflowText, {
    ...options,
    parser: "yaml",
  });
  assert.equal(formatted, workflowText);
});

test("the workflow runs on pull requests and pushes to main", () => {
  assert.ok(hasLine("on:"), "expected an explicit trigger block");
  assert.ok(hasLine("  push:"), "expected a push trigger");
  assert.ok(hasLine("    branches: [main]"), "expected the main branch filter");
  assert.ok(hasLine("  pull_request:"), "expected a pull_request trigger");
});

test("the workflow runs the toolkit gate on a fresh checkout", () => {
  assert.ok(
    hasLine("    runs-on: ubuntu-24.04"),
    "expected a pinned runner image",
  );
  assert.match(workflowText, /actions\/checkout@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.ok(
    workflowText.includes("run: make preflight"),
    "expected the rootless Podman preflight",
  );
  assert.ok(
    workflowText.includes("run: make verify"),
    "expected the same gate a developer runs",
  );
});

test("the workflow keeps least permissions and no secrets or services", () => {
  assert.ok(hasLine("permissions:"), "expected an explicit permissions block");
  assert.ok(
    hasLine("  contents: read"),
    "expected read-only repository permissions",
  );
  for (const forbidden of ["secrets.", "services:"]) {
    assert.ok(
      !workflowText.includes(forbidden),
      `workflow must not contain ${forbidden}`,
    );
  }
});

test("the workflow never installs or runs Node and npm on the runner", () => {
  for (const forbidden of ["setup-node", "npm ci", "npm install", "npm test"]) {
    assert.ok(
      !workflowText.includes(forbidden),
      `workflow must not contain ${forbidden}`,
    );
  }
});

test("the workflow is tab-free YAML", () => {
  assert.ok(!workflowText.includes("\t"), "YAML forbids tab indentation");
});
