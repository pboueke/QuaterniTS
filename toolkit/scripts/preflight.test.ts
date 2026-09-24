/**
 * Behavioural tests for `toolkit/scripts/preflight.sh`.
 *
 * The script runs on the host, where the pinned toolkit image is not
 * available, so these tests put a stub `podman` on the child's PATH and assert
 * all three outcomes: usable rootless Podman passes, and a missing or
 * non-rootless Podman fails loudly instead of letting a gate skip a check or
 * report a fake result.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASH = "/bin/bash";
const PREFLIGHT = fileURLToPath(new URL("./preflight.sh", import.meta.url));

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs the preflight with `stub` (or no `podman` at all) as the only command
 * on the child's PATH, so the test never needs a real container runtime.
 */
function runPreflight(stub: string | null): RunResult {
  const bin = mkdtempSync(path.join(tmpdir(), "quaternits-preflight-"));
  try {
    if (stub !== null) {
      const podman = path.join(bin, "podman");
      writeFileSync(podman, stub);
      chmodSync(podman, 0o755);
    }
    const result = spawnSync(BASH, [PREFLIGHT], {
      encoding: "utf8",
      env: { PATH: bin },
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test("the preflight script is syntactically valid bash", () => {
  const result = spawnSync(BASH, ["-n", PREFLIGHT], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("usable rootless Podman passes", () => {
  const result = runPreflight("#!/bin/sh\necho true\n");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /rootless Podman is available/);
});

test("a host without podman fails loudly", () => {
  const result = runPreflight(null);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /podman is not installed on the host/);
});

test("an unusable podman fails loudly and keeps its own error visible", () => {
  const result = runPreflight(
    "#!/bin/sh\necho 'cannot connect' >&2\nexit 125\n",
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /'podman info' failed/);
  assert.match(result.stderr, /cannot connect/);
});

test("a non-rootless podman fails loudly", () => {
  const result = runPreflight("#!/bin/sh\necho false\n");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Podman is not rootless \(reported 'false'\)/);
});
