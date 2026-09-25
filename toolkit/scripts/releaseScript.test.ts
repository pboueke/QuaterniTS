import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../release.sh", import.meta.url));
const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const HASH = "9".repeat(64);

function fixture(run: (dir: string, bin: string, calls: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-release-script-"));
  try {
    const bin = path.join(dir, "bin");
    const calls = path.join(dir, "calls");
    mkdirSync(bin);
    mkdirSync(path.join(dir, ".release"));
    copyFileSync(SCRIPT, path.join(dir, "release.sh"));
    writeFileSync(path.join(dir, ".release/quaternits-0.1.0.tgz"), "fixture");
    writeFileSync(
      path.join(dir, ".release/SHA256SUMS"),
      `${HASH}  .release/quaternits-0.1.0.tgz\n`,
    );
    const fakeGit = `#!/bin/bash
printf 'git %s\\n' "$*" >> "$QTS_CALLS"
case "$1 $2" in
  'status --porcelain') ;;
  'rev-parse HEAD') printf '%s\\n' '${HEAD}' ;;
  'ls-remote --exit-code')
    if [[ "\${QTS_TAG_MODE:-present}" == missing ]]; then exit 2; fi
    if [[ "\${QTS_TAG_MODE:-present}" == other ]]; then
      printf '%s\\trefs/tags/v0.1.0\\n' '${OTHER}'
    else
      printf '%s\\trefs/tags/v0.1.0\\n' '${HEAD}'
    fi ;;
  *) exit 98 ;;
esac
`;
    const fakePodman = `#!/bin/bash
printf 'podman %s\\n' "$*" >> "$QTS_CALLS"
if [[ "$*" == *'node -e '* ]]; then
  printf '%s\\n' '0.1.0'
elif [[ "$*" == *'sha256sum -c '* ]]; then
  printf '%s\\n' '.release/quaternits-0.1.0.tgz: OK'
elif [[ "$*" == *'npm pack --pack-destination /tmp'* ]]; then
  printf '%s  /tmp/quaternits-0.1.0.tgz\\n' "\${QTS_REPACK_HASH:-${HASH}}"
else
  exit 98
fi
`;
    const stubs: readonly (readonly [string, string])[] = [
      ["git", fakeGit],
      ["podman", fakePodman],
      ["make", '#!/bin/bash\nprintf "make %s\\n" "$*" >> "$QTS_CALLS"\n'],
    ];
    writeFileSync(calls, "");
    for (const [name, body] of stubs) {
      const executable = path.join(bin, name);
      writeFileSync(executable, body);
      chmodSync(executable, 0o755);
    }
    run(dir, bin, calls);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function execute(
  dir: string,
  bin: string,
  calls: string,
  mode: string,
  env: Readonly<Record<string, string>> = {},
): RunResult {
  const result = spawnSync("bash", [path.join(dir, "release.sh"), mode], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      QTS_CALLS: calls,
      ...env,
    },
  });
  return {
    status: result.status,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
}

test("release.sh is syntactically valid bash and check is the default", () => {
  const checked = spawnSync("bash", ["-n", SCRIPT], { encoding: "utf8" });
  assert.equal(checked.status, 0, String(checked.stderr));
  const text = readFileSync(SCRIPT, "utf8");
  assert.match(text, /mode="\$\{1:---check\}"/);
  assert.ok(!text.includes("git tag") && !text.includes("git push"));
  assert.match(text, /read -r confirmation/);
  assert.match(text, /npm_toolkit publish "\.\/\$artifact" --access public/);
});

test("check mode validates the remote tag, checksum and fresh pack without publishing", () => {
  fixture((dir, bin, calls) => {
    const result = execute(dir, bin, calls, "--check");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /check-only; nothing was published/);
    const recorded = readFileSync(calls, "utf8");
    assert.match(
      recorded,
      /git ls-remote --exit-code origin refs\/tags\/v0\.1\.0/,
    );
    assert.match(recorded, /make version-check build/);
    assert.match(recorded, /sha256sum -c \.release\/SHA256SUMS/);
    assert.match(recorded, /npm pack --pack-destination \/tmp/);
    assert.ok(
      !recorded.includes("npm publish") && !recorded.includes("npm login"),
    );
  });
});

test("missing or mismatched tags stop before packing or publishing", () => {
  for (const tagMode of ["missing", "other"]) {
    fixture((dir, bin, calls) => {
      const result = execute(dir, bin, calls, "--check", {
        QTS_TAG_MODE: tagMode,
      });
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /tag is missing|does not identify this checkout/,
      );
      assert.ok(!readFileSync(calls, "utf8").includes("npm pack"));
    });
  }
});

test("tampered checksum entry or mismatched rebuilt tarball stops the release", () => {
  fixture((dir, bin, calls) => {
    writeFileSync(
      path.join(dir, ".release/SHA256SUMS"),
      `${HASH}  wrong.tgz\n`,
    );
    const result = execute(dir, bin, calls, "--check");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SHA256SUMS must name only/);
    assert.ok(!readFileSync(calls, "utf8").includes("npm pack"));
  });
  fixture((dir, bin, calls) => {
    const result = execute(dir, bin, calls, "--check", {
      QTS_REPACK_HASH: "b".repeat(64),
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate differs from a fresh pack/);
    assert.ok(!readFileSync(calls, "utf8").includes("npm publish"));
  });
});

test("publishing refuses a noninteractive invocation before any tool command", () => {
  fixture((dir, bin, calls) => {
    const result = execute(dir, bin, calls, "--publish");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires an interactive terminal/);
    assert.ok(!readFileSync(calls, "utf8").includes("npm publish"));
  });
});
