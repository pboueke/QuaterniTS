import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const TAG_WORKFLOW = fileURLToPath(
  new URL("../../.github/workflows/release-tag.yml", import.meta.url),
);
const CI_WORKFLOW = fileURLToPath(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
);
const tag = readFileSync(TAG_WORKFLOW, "utf8");
const ci = readFileSync(CI_WORKFLOW, "utf8");

test("release tag workflow is valid, repository-formatted YAML", async () => {
  const config = (await prettier.resolveConfig(TAG_WORKFLOW)) ?? {};
  assert.equal(await prettier.format(tag, { ...config, parser: "yaml" }), tag);
});

test("the tag job follows the full CI gate only on main pushes", () => {
  assert.match(tag, /^on:\n {2}push:\n {4}branches: \[main\]/m);
  assert.ok(
    !tag.includes("workflow_run:"),
    "do not elevate CI artifacts through workflow_run",
  );
  assert.match(ci, /^ {2}workflow_call:$/m);
  assert.match(
    tag,
    / {2}verify:\n {4}name: Reuse the full CI gate\n {4}uses: \.\/\.github\/workflows\/ci\.yml/,
  );
  assert.match(
    tag,
    / {2}tag:\n {4}name: Tag verified merged release\n {4}needs: verify/,
  );
  assert.match(ci, /run: make verify/);
  assert.match(
    ci,
    /group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/,
  );
});

test("only the tag job may write contents and checkout never persists credentials", () => {
  assert.match(tag, /^permissions:\n {2}contents: read$/m);
  assert.match(tag, / {2}tag:[\s\S]*? {4}permissions:\n {6}contents: write/);
  assert.match(tag, /actions\/checkout@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.match(tag, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(tag, /persist-credentials: false/);
  assert.match(tag, /CI_SHA: \$\{\{ github\.sha \}\}/);
  assert.ok(!tag.includes("git push") && !tag.includes("--force"));
});

test("tagging uses the pinned toolkit, GitHub API and merged-PR guard, never npm publish", () => {
  assert.match(tag, /make preflight toolkit-image/);
  assert.match(tag, /quaternits-toolkit:local node --input-type=module/);
  assert.match(tag, /-v "\$PWD":\/work:ro,Z/);
  assert.match(tag, /createVersionTag\(/);
  assert.match(tag, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(tag, /Authorization: `Bearer \$\{token\}`/);
  assert.ok(!tag.includes("npm publish"));
  assert.ok(!tag.includes("setup-node"));
  assert.ok(!tag.includes("pull_request_target"));
});
