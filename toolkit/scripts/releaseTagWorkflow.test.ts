import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const WORKFLOW = fileURLToPath(
  new URL("../../.github/workflows/release-tag.yml", import.meta.url),
);
const workflow = readFileSync(WORKFLOW, "utf8");

test("release tag workflow is valid, repository-formatted YAML", async () => {
  const config = (await prettier.resolveConfig(WORKFLOW)) ?? {};
  assert.equal(
    await prettier.format(workflow, { ...config, parser: "yaml" }),
    workflow,
  );
});

test("main pushes trigger one short host-side tagging job", () => {
  assert.match(workflow, /^on:\n {2}push:\n {4}branches: \[main\]/m);
  assert.match(workflow, / {2}tag:\n {4}name: Tag current version/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 5/);
  for (const forbidden of [
    "workflow_run:",
    "pull_request_target:",
    "make verify",
    "podman",
    "setup-node",
    "npm publish",
    "secrets.",
  ]) {
    assert.ok(!workflow.includes(forbidden), `unexpected ${forbidden}`);
  }
});

test("the job uses a pinned checkout and only the repository-write permission", () => {
  assert.match(workflow, /^permissions:\n {2}contents: write$/m);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: true/);
  assert.ok(!workflow.includes("--force"));
  assert.ok(!workflow.includes("needs: verify"));
});

test("the tag is derived from the changelog, checked against the manifest, and never moved", () => {
  assert.match(workflow, /IFS= read -r heading < CHANGELOG\.md/);
  assert.match(workflow, /version="\$\{heading#\\#\\# \}"/);
  assert.match(workflow, /expected=.*version.*\$version/);
  assert.match(workflow, /Private package: no release tag/);
  assert.match(workflow, /git rev-parse FETCH_HEAD/);
  assert.match(workflow, /git ls-remote origin "refs\/tags\/\$tag"/);
  assert.match(workflow, /already exists; not moving it/);
  assert.match(workflow, /git tag "\$tag" "\$GITHUB_SHA"/);
  assert.match(workflow, /git push origin "refs\/tags\/\$tag"/);
});

const SHA = "a".repeat(40);
const script = workflow
  .split("\n")
  .slice(workflow.split("\n").indexOf("        run: |") + 1)
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n");

function runTag(
  options: {
    readonly existing?: boolean;
    readonly main?: string;
    readonly private?: boolean;
    readonly packageVersion?: string;
  } = {},
): { status: number | null; stdout: string; stderr: string; calls: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-tag-workflow-"));
  try {
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    const calls = path.join(dir, "calls");
    const executable = path.join(bin, "git");
    writeFileSync(calls, "");
    writeFileSync(path.join(dir, "tag.sh"), script);
    writeFileSync(
      path.join(dir, "CHANGELOG.md"),
      "## 0.1.0\n\n- feat: test.\n",
    );
    writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: "quaternits", version: options.packageVersion ?? "0.1.0", ...(options.private ? { private: true } : {}), type: "module" }, null, 2)}\n`,
    );
    writeFileSync(
      executable,
      `#!/bin/bash
printf '%s\\n' "$*" >> "$QTS_CALLS"
case "$1 $2" in
  'fetch --no-tags') ;;
  'rev-parse FETCH_HEAD') printf '%s\\n' "$QTS_MAIN_SHA" ;;
  'ls-remote origin') if [[ "$QTS_TAG_EXISTS" == 1 ]]; then printf '%s\\trefs/tags/v0.1.0\\n' "${SHA}"; fi ;;
  'tag v0.1.0'|'push origin') ;;
  *) exit 99 ;;
esac
`,
    );
    chmodSync(executable, 0o755);
    const result = spawnSync("bash", [path.join(dir, "tag.sh")], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        GITHUB_SHA: SHA,
        QTS_MAIN_SHA: options.main ?? SHA,
        QTS_TAG_EXISTS: options.existing ? "1" : "0",
        QTS_CALLS: calls,
      },
    });
    return {
      status: result.status,
      stdout: String(result.stdout),
      stderr: String(result.stderr),
      calls: readFileSync(calls, "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the host-side tag script is valid bash and tags direct main pushes", () => {
  assert.ok(script.startsWith("set -euo pipefail"));
  const result = runTag();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /tag v0\.1\.0/);
  assert.match(result.calls, /push origin refs\/tags\/v0\.1\.0/);
});

test("existing tag or newer main commit never moves a tag", () => {
  for (const options of [{ existing: true }, { main: "b".repeat(40) }]) {
    const result = runTag(options);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.calls.includes("tag v0.1.0"));
    assert.ok(!result.calls.includes("push origin"));
  }
});

test("a private or version-drifted package cannot be tagged", () => {
  const privateRun = runTag({ private: true });
  assert.equal(privateRun.status, 0, privateRun.stderr);
  assert.ok(!privateRun.calls.includes("tag v0.1.0"));
  const drift = runTag({ packageVersion: "0.2.0" });
  assert.equal(drift.status, 1);
  assert.match(drift.stderr, /does not match CHANGELOG/);
  assert.ok(!drift.calls.includes("tag v0.1.0"));
});
