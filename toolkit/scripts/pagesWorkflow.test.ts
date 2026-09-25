/**
 * Structural checks for `.github/workflows/pages.yml`.
 *
 * Prettier is the repository's YAML authority, so `make fmt-check` — and the
 * explicit re-format below — rejects a malformed workflow without a new
 * dependency. The remaining assertions pin the delivery contract: the site is
 * built by the same pinned toolkit gate a developer runs, deployed with the
 * official Pages actions pinned by full commit SHA, with least privilege and no
 * `gh-pages` branch, `git push` or runner-side Node/npm.
 *
 * These checks validate workflow structure; deployment results come from
 * GitHub Actions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const WORKFLOW = fileURLToPath(
  new URL("../../.github/workflows/pages.yml", import.meta.url),
);
const workflowText = readFileSync(WORKFLOW, "utf8");
const lines = workflowText.split("\n");

function hasLine(expected: string): boolean {
  return lines.includes(expected);
}

/**
 * The lines of one top-level job block (`build` or `deploy`), excluding the
 * job key line itself. A new job starts at the next two-space-indented key.
 */
function jobSection(job: string): string[] {
  const start = lines.indexOf(`  ${job}:`);
  assert.ok(start !== -1, `expected a ${job} job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}[A-Za-z0-9_-]+:$/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

test("the Pages workflow is valid, repository-formatted YAML", async () => {
  const options = (await prettier.resolveConfig(WORKFLOW)) ?? {};
  const formatted = await prettier.format(workflowText, {
    ...options,
    parser: "yaml",
  });
  assert.equal(formatted, workflowText);
});

test("the Pages workflow runs on pushes to main and manual dispatch", () => {
  assert.ok(hasLine("on:"), "expected an explicit trigger block");
  assert.ok(hasLine("  push:"), "expected a push trigger");
  assert.ok(hasLine("    branches: [main]"), "expected the main branch filter");
  assert.ok(hasLine("  workflow_dispatch:"), "expected a manual dispatch");
});

test("the build job runs the pinned toolkit docs gate", () => {
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
    workflowText.includes("run: make docs-build"),
    "expected the same docs gate a developer runs",
  );
  assert.ok(
    !workflowText.includes("run: make verify"),
    "the deploy workflow must not run the full verify gate",
  );
});

test("the build job keeps contents read and the deploy job elevates only Pages", () => {
  assert.ok(hasLine("permissions:"), "expected an explicit permissions block");
  assert.ok(
    hasLine("  contents: read"),
    "expected read-only repository permissions by default",
  );
  assert.ok(
    workflowText.includes("      pages: write"),
    "expected the deploy job to request pages: write",
  );
  assert.ok(
    workflowText.includes("      id-token: write"),
    "expected the deploy job to request id-token: write",
  );
});

test("the build job requests pages: read for configure-pages", () => {
  // actions/configure-pages GETs the Pages site configuration, which on a
  // private repository fails with "Resource not accessible by integration"
  // unless the job also grants `pages: read` (actions/configure-pages#188).
  const build = jobSection("build");
  assert.ok(
    build.includes("      pages: read"),
    "the build job must grant pages: read so configure-pages can read the site",
  );
  assert.ok(
    build.includes("      contents: read"),
    "the build job must keep contents: read",
  );
  assert.ok(
    !jobSection("deploy").includes("      pages: read"),
    "the deploy job needs pages: write, not pages: read",
  );
});

test("the workflow deploys with the official Pages actions pinned by full SHA", () => {
  for (const action of [
    "configure-pages",
    "upload-pages-artifact",
    "deploy-pages",
  ]) {
    assert.match(
      workflowText,
      new RegExp(
        `# v\\d+\\.\\d+\\.\\d+\\n\\s+uses: >-\\n\\s+actions/${action}@[0-9a-f]{40}(?:\\n|$)`,
      ),
      `${action} must be pinned by full commit SHA`,
    );
  }
  assert.ok(
    workflowText.includes("path: website/dist"),
    "expected the verified static site to be uploaded",
  );
  assert.ok(hasLine("    needs: build"), "the deploy job must need the build");
  assert.ok(
    workflowText.includes("name: github-pages"),
    "expected the github-pages environment",
  );
});

test("the workflow never pushes to a branch and never runs Node or npm on the runner", () => {
  for (const forbidden of [
    "gh-pages",
    "git push",
    "setup-node",
    "npm ci",
    "npm install",
    "npm test",
    "secrets.",
    "services:",
  ]) {
    assert.ok(
      !workflowText.includes(forbidden),
      `workflow must not contain ${forbidden}`,
    );
  }
});

test("the Pages workflow is tab-free YAML", () => {
  assert.ok(!workflowText.includes("\t"), "YAML forbids tab indentation");
});
