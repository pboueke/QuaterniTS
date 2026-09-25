/**
 * Checks the opt-in git hooks in `.githooks/` and the `make install-hooks`
 * installer that opts a checkout into them.
 *
 * Git hooks are plain Bash because Git runs them outside the toolkit image, so
 * these tests assert shell syntax, the executable bit and — with a stub `make`
 * on the child's PATH — the exact targets each hook invokes. They deliberately
 * run no Podman and claim no real hook run inside a Git repository.
 *
 * The installer runs on the host, where the pinned toolkit image ships neither
 * `git` nor `make`, so its decision logic is exercised with a stub `git` that
 * records invocations and keeps `core.hooksPath` state in a file. This is a
 * test double, not an integration run: the real `make install-hooks` target is
 * proven separately with real host `git`/`make` in a disposable repository
 * (reported as host-only integration, never against this checkout).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASH = "/bin/bash";
const HOOKS_DIR = fileURLToPath(new URL("../../.githooks/", import.meta.url));
const HOOKS = ["pre-commit", "pre-push"];
const INSTALL_HOOKS = fileURLToPath(
  new URL("./install-hooks.sh", import.meta.url),
);
const MAKEFILE = fileURLToPath(new URL("../../Makefile", import.meta.url));

interface HookRun {
  readonly status: number | null;
  readonly calls: string[];
}

/**
 * Runs `hook` from a temporary worktree root with a stub `make` that records
 * its arguments. `makeExit` is the stub's exit status, or null to leave `make`
 * off the PATH entirely. Git runs hooks from the worktree root, so the
 * temporary directory is also the child's working directory.
 */
function runHook(
  hook: string,
  makeExit: number | null,
  options: {
    sourceDirty?: boolean;
    generatedDirty?: boolean;
    syncChanges?: boolean;
  } = {},
): HookRun {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-hook-"));
  try {
    const git = path.join(dir, "git");
    writeFileSync(
      git,
      [
        "#!/bin/sh",
        'test "$1" = diff && test "$2" = --quiet && test "$3" = -- || exit 2',
        'if test "$4" = CHANGELOG.md; then',
        '  test "${HOOK_SOURCE_DIRTY:-0}" = 0',
        "else",
        '  test "${HOOK_GENERATED_DIRTY:-0}" = 0 && test ! -e hook-sync-changed',
        "fi",
        "",
      ].join("\n"),
    );
    chmodSync(git, 0o755);
    if (makeExit !== null) {
      const make = path.join(dir, "make");
      writeFileSync(
        make,
        [
          "#!/bin/sh",
          'printf "%s\\n" "$*" >> make-calls',
          'if test "$1" = version-sync && test "${HOOK_SYNC_CHANGES:-0}" = 1; then : > hook-sync-changed; fi',
          `exit ${String(makeExit)}`,
          "",
        ].join("\n"),
      );
      chmodSync(make, 0o755);
    }
    const result = spawnSync(BASH, [path.join(HOOKS_DIR, hook)], {
      encoding: "utf8",
      cwd: dir,
      env: {
        PATH: dir,
        HOOK_SOURCE_DIRTY: options.sourceDirty ? "1" : "0",
        HOOK_GENERATED_DIRTY: options.generatedDirty ? "1" : "0",
        HOOK_SYNC_CHANGES: options.syncChanges ? "1" : "0",
      },
    });
    const callsFile = path.join(dir, "make-calls");
    const recorded = existsSync(callsFile)
      ? readFileSync(callsFile, "utf8")
      : "";
    return {
      status: result.status,
      calls: recorded.split("\n").filter((line) => line !== ""),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("both hooks are executable", () => {
  for (const hook of HOOKS) {
    const mode = statSync(path.join(HOOKS_DIR, hook)).mode;
    assert.notEqual(mode & 0o111, 0, `${hook} must be executable`);
  }
});

test("both hooks are syntactically valid bash", () => {
  for (const hook of HOOKS) {
    const result = spawnSync(BASH, ["-n", path.join(HOOKS_DIR, hook)], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("pre-commit runs the preflight and the fast local checks", () => {
  const { status, calls } = runHook("pre-commit", 0);
  assert.equal(status, 0);
  assert.deepEqual(calls, [
    "version-sync",
    "preflight fmt-check lint types version-check",
  ]);
});

test("pre-commit refuses mixed staged and unstaged version input", () => {
  assert.deepEqual(runHook("pre-commit", 0, { sourceDirty: true }), {
    status: 1,
    calls: [],
  });
  assert.deepEqual(runHook("pre-commit", 0, { generatedDirty: true }), {
    status: 1,
    calls: [],
  });
});

test("pre-commit updates but never stages generated version fields", () => {
  assert.deepEqual(runHook("pre-commit", 0, { syncChanges: true }), {
    status: 1,
    calls: ["version-sync"],
  });
});

test("pre-push runs the same gate as CI", () => {
  const { status, calls } = runHook("pre-push", 0);
  assert.equal(status, 0);
  assert.deepEqual(calls, ["verify"]);
});

test("a failing make target fails the hook instead of being ignored", () => {
  assert.equal(runHook("pre-commit", 2).status, 2);
  assert.equal(runHook("pre-push", 2).status, 2);
});

test("a missing make fails the hook instead of skipping the gate", () => {
  assert.deepEqual(runHook("pre-commit", null), { status: 127, calls: [] });
  assert.deepEqual(runHook("pre-push", null), { status: 127, calls: [] });
});

/**
 * Stub `git` for the installer tests. It records every invocation in
 * `GIT_CALLS_FILE` and keeps the single local `core.hooksPath` value in
 * `GIT_CONFIG_FILE`. `--get` exits non-zero when the file is absent, matching
 * an unset Git key; any other `config --local <key> <value>` writes the value.
 * A missing `.git` directory makes every command fail like real Git outside a
 * repository. `/bin/bash` (not `env bash`) keeps it working with a bare PATH.
 */
const GIT_STUB = [
  "#!/bin/bash",
  "set -u",
  'printf "%s\\n" "$*" >> "$GIT_CALLS_FILE"',
  "if [[ ! -d .git ]]; then",
  '  printf "%s\\n" "fatal: not a git repository" >&2',
  "  exit 128",
  "fi",
  'if [[ "${1:-}" == "rev-parse" ]]; then',
  '  printf "%s\\n" ".git"',
  "  exit 0",
  "fi",
  'if [[ "${1:-}" == "config" && "${2:-}" == "--local" ]]; then',
  '  if [[ "${3:-}" == "--get" ]]; then',
  '    if [[ -f "$GIT_CONFIG_FILE" ]]; then',
  '      value="$(<"$GIT_CONFIG_FILE")"',
  '      printf "%s\\n" "$value"',
  "      exit 0",
  "    fi",
  "    exit 1",
  "  fi",
  '  printf "%s" "${4:-}" > "$GIT_CONFIG_FILE"',
  "  exit 0",
  "fi",
  "exit 0",
  "",
].join("\n");

interface InstallResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly calls: string[];
  readonly hooksPath: string | null;
}

/**
 * Runs `toolkit/scripts/install-hooks.sh` in a disposable directory with the
 * stub `git` as the only command on the child's PATH. `isRepo` controls whether
 * the stub reports a Git repository; `configured` seeds an existing local
 * `core.hooksPath`, or null for unset.
 */
function runInstallHooks(
  isRepo: boolean,
  configured: string | null,
): InstallResult {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-install-hooks-"));
  const bin = path.join(dir, "bin");
  const callsFile = path.join(dir, "git-calls");
  const configFile = path.join(dir, "hooks-path");
  try {
    mkdirSync(bin);
    if (isRepo) {
      mkdirSync(path.join(dir, ".git"));
    }
    if (configured !== null) {
      writeFileSync(configFile, configured);
    }
    const git = path.join(bin, "git");
    writeFileSync(git, GIT_STUB);
    chmodSync(git, 0o755);
    const result = spawnSync(BASH, [INSTALL_HOOKS], {
      encoding: "utf8",
      cwd: dir,
      env: {
        PATH: bin,
        GIT_CALLS_FILE: callsFile,
        GIT_CONFIG_FILE: configFile,
      },
    });
    const recorded = existsSync(callsFile)
      ? readFileSync(callsFile, "utf8")
      : "";
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls: recorded.split("\n").filter((line) => line !== ""),
      hooksPath: existsSync(configFile)
        ? readFileSync(configFile, "utf8")
        : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the installer is syntactically valid bash", () => {
  const result = spawnSync(BASH, ["-n", INSTALL_HOOKS], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the installer enables the repo-local .githooks path", () => {
  const result = runInstallHooks(true, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.hooksPath, ".githooks");
  assert.deepEqual(result.calls, [
    "rev-parse --git-dir",
    "config --local --get core.hooksPath",
    "config --local core.hooksPath .githooks",
  ]);
  assert.match(result.stdout, /enabled local core\.hooksPath=\.githooks/);
});

test("the installer never reads or writes global or system config", () => {
  const { calls } = runInstallHooks(true, null);
  for (const call of calls) {
    assert.ok(!call.includes("--global"), call);
    assert.ok(!call.includes("--system"), call);
  }
});

test("the installer is idempotent when .githooks is already configured", () => {
  const result = runInstallHooks(true, ".githooks");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.hooksPath, ".githooks");
  assert.deepEqual(result.calls, [
    "rev-parse --git-dir",
    "config --local --get core.hooksPath",
  ]);
  assert.match(result.stdout, /already enabled/);
});

test("the installer refuses to overwrite a different local hooks path", () => {
  const result = runInstallHooks(true, "custom/hooks");
  assert.equal(result.status, 1);
  assert.equal(result.hooksPath, "custom/hooks");
  assert.deepEqual(result.calls, [
    "rev-parse --git-dir",
    "config --local --get core.hooksPath",
  ]);
  assert.match(result.stderr, /refusing to overwrite/);
});

test("the installer fails without mutating a non-Git directory", () => {
  const result = runInstallHooks(false, null);
  assert.equal(result.status, 1);
  assert.equal(result.hooksPath, null);
  assert.deepEqual(result.calls, ["rev-parse --git-dir"]);
  assert.match(result.stderr, /not a Git repository/);
});

test("the installer fails loudly when git is not installed", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-install-hooks-"));
  try {
    const result = spawnSync(BASH, [INSTALL_HOOKS], {
      encoding: "utf8",
      cwd: dir,
      env: { PATH: "" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /git is not installed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the installer never invokes Podman", () => {
  const script = readFileSync(INSTALL_HOOKS, "utf8");
  assert.ok(
    !script.includes("podman"),
    "install-hooks must not need the toolkit image",
  );
});

const makefileText = readFileSync(MAKEFILE, "utf8");

/** Returns the tab-indented recipe lines for `target`, or an empty list. */
function recipeFor(target: string): string[] {
  const lines = makefileText.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${target}:`));
  if (start === -1) {
    return [];
  }
  const recipe: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || !line.startsWith("\t")) {
      break;
    }
    recipe.push(line.slice(1));
  }
  return recipe;
}

test("the Makefile exposes install-hooks as a help-listed phony target", () => {
  assert.match(makefileText, /^\.PHONY: install-hooks$/m);
  assert.match(
    makefileText,
    /^install-hooks:.*## .*\.githooks/m,
    "install-hooks must be help-listed with a description",
  );
});

test("install-hooks calls the host installer and never Podman", () => {
  const recipe = recipeFor("install-hooks");
  assert.ok(
    recipe.some((line) => line.includes("scripts/install-hooks.sh")),
    "expected the recipe to invoke the install-hooks script",
  );
  for (const line of recipe) {
    assert.ok(!line.includes("podman"), line);
  }
});
