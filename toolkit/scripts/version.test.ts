import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_TARGETS,
  VersionError,
  changelogVersion,
  lockfileVersions,
  main,
  packageVersion,
  readmeBadgeDrift,
  synchronizeReadmeBadge,
  synchronizeVersions,
  versionDrift,
  type VersionDeps,
} from "./version.ts";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = path.join(REPO_ROOT, "toolkit/scripts/version.ts");

function changelog(version = "0.1.0"): string {
  return [
    `## ${version}`,
    "",
    "- feat: an internal module.",
    "- chore: the package stays private and unpublished.",
    "",
  ].join("\n");
}

function packageJson(version = "0.1.0"): string {
  return `${JSON.stringify(
    {
      name: "quaternits",
      version,
      private: true,
      license: "MIT",
    },
    null,
    2,
  )}\n`;
}

function readme(version = "0.1.0"): string {
  return [
    "# QuaterniTS",
    "",
    `[![Version: ${version}](https://img.shields.io/static/v1?label=version&message=${encodeURIComponent(version)}&color=blue)](CHANGELOG.md)`,
    "",
    "Library overview.",
    "",
  ].join("\n");
}

function lockfile(version = "0.1.0", rootVersion = version): string {
  return `${JSON.stringify(
    {
      name: "quaternits",
      version,
      lockfileVersion: 3,
      packages: {
        "": {
          name: "quaternits",
          version: rootVersion,
          license: "MIT",
        },
        "node_modules/example": { version: "9.9.9", dev: true },
      },
    },
    null,
    2,
  )}\n`;
}

interface TempFixtures {
  readonly dir: string;
  readonly changelog: string;
  readonly package: string;
  readonly lock: string;
  readonly readme: string;
}

function tempFixtures(version = "0.1.0"): TempFixtures {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-version-"));
  const files: TempFixtures = {
    dir,
    changelog: path.join(dir, "CHANGELOG.md"),
    package: path.join(dir, "package.json"),
    lock: path.join(dir, "package-lock.json"),
    readme: path.join(dir, "README.md"),
  };
  writeFileSync(files.changelog, changelog(version));
  writeFileSync(files.package, packageJson(version));
  writeFileSync(files.lock, lockfile(version));
  writeFileSync(files.readme, readme(version));
  return files;
}

function fixtureArgs(files: TempFixtures): string[] {
  return [
    "--changelog",
    files.changelog,
    "--package",
    files.package,
    "--lock",
    files.lock,
    "--readme",
    files.readme,
  ];
}

interface CapturedDeps extends VersionDeps {
  readonly written: Record<string, string>;
}

function makeDeps(
  files: Record<string, string>,
  overrides: Partial<VersionDeps> = {},
): CapturedDeps {
  const written: Record<string, string> = {};
  return {
    readText: (file) => {
      const text = files[file];
      if (text === undefined) {
        throw new Error(`missing test fixture for ${file}`);
      }
      return text;
    },
    writeText: (file, text) => {
      written[file] = text;
    },
    log: () => {},
    error: () => {},
    ...overrides,
    written,
  };
}

const TARGET_ARGS = [
  "--changelog",
  "CHANGELOG.md",
  "--package",
  "package.json",
  "--lock",
  "package-lock.json",
  "--readme",
  "README.md",
];

test("DEFAULT_TARGETS point at the repository changelog and package metadata", () => {
  assert.deepEqual(DEFAULT_TARGETS, {
    changelog: path.join(REPO_ROOT, "CHANGELOG.md"),
    package: path.join(REPO_ROOT, "package.json"),
    lock: path.join(REPO_ROOT, "package-lock.json"),
    readme: path.join(REPO_ROOT, "README.md"),
  });
});

test("changelogVersion reads the top semver release heading", () => {
  assert.equal(changelogVersion(changelog("0.1.0")), "0.1.0");
});

test("changelogVersion accepts a prerelease semver", () => {
  assert.equal(changelogVersion(changelog("0.2.0-rc.1")), "0.2.0-rc.1");
});

test("changelogVersion returns the top version when older headings follow", () => {
  assert.equal(
    changelogVersion(changelog("0.2.0") + changelog("0.1.0")),
    "0.2.0",
  );
});

test("changelogVersion accepts a bullet wrapped onto indented lines", () => {
  const text = [
    "## 0.1.0",
    "",
    "- feat: a module whose description wraps onto a",
    "  second indented line.",
    "",
  ].join("\n");
  assert.equal(changelogVersion(text), "0.1.0");
});

test("changelogVersion rejects a changelog with no release heading", () => {
  assert.throws(() => changelogVersion("\n"), VersionError);
  assert.throws(
    () => changelogVersion("\n"),
    /has no "## <semver>" release heading/,
  );
});

test("changelogVersion rejects a CRLF changelog", () => {
  assert.throws(
    () => changelogVersion("## 0.1.0\r\n\r\n- feat: an internal module.\r\n"),
    /CHANGELOG\.md contains CRLF line endings/,
  );
});

test("changelogVersion rejects a title or subheading", () => {
  assert.throws(
    () => changelogVersion(`# Changelog\n\n${changelog()}`),
    /line 1 is the heading "# Changelog"; only exact "## <semver>" release headings are allowed/,
  );
  assert.throws(
    () =>
      changelogVersion(
        "## 0.1.0\n\n### Added\n\n- feat: an internal module.\n",
      ),
    /line 3 is the heading "### Added"/,
  );
});

test("changelogVersion rejects an annotated release heading", () => {
  assert.throws(
    () =>
      changelogVersion(
        "## 0.1.0 - unreleased\n\n- feat: an internal module.\n",
      ),
    /release heading "0\.1\.0 - unreleased" has extra text/,
  );
});

test("changelogVersion rejects a nonsemver release heading", () => {
  for (const version of ["v1.0.0", "1.0", "0.1.0.0", "01.2.3", "next"]) {
    assert.throws(
      () => changelogVersion(`## ${version}\n\n- feat: an internal module.\n`),
      /is not a semantic version/,
      `expected ${version} to be rejected`,
    );
  }
});

test("changelogVersion rejects free prose", () => {
  assert.throws(
    () => changelogVersion("## 0.1.0\n\nPlanned first version.\n"),
    /line 3 is free prose/,
  );
});

test("changelogVersion rejects an untyped bullet", () => {
  assert.throws(
    () => changelogVersion("## 0.1.0\n\n- An internal module.\n"),
    /line 3 is not a typed semantic bullet/,
  );
  assert.throws(
    () => changelogVersion("## 0.1.0\n\n- feat:\n"),
    /line 3 is not a typed semantic bullet/,
  );
});

test("changelogVersion rejects an unknown bullet type", () => {
  assert.throws(
    () => changelogVersion("## 0.1.0\n\n- feature: an internal module.\n"),
    /line 3 uses unknown bullet type "feature"/,
  );
});

test("changelogVersion rejects a bullet before any release heading", () => {
  assert.throws(
    () => changelogVersion("- feat: an internal module.\n"),
    /line 1 is a bullet before any "## <semver>" release heading/,
  );
});

test("changelogVersion rejects an indented line that continues no bullet", () => {
  assert.throws(
    () => changelogVersion("## 0.1.0\n\n  stray continuation\n"),
    /line 3 is an indented line that continues no bullet/,
  );
});

test("changelogVersion rejects a release heading without bullets", () => {
  assert.throws(
    () => changelogVersion("## 0.1.0\n"),
    /release heading "0\.1\.0" has no typed semantic bullet/,
  );
  assert.throws(
    () =>
      changelogVersion("## 0.2.0\n\n## 0.1.0\n\n- feat: an internal module.\n"),
    /release heading "0\.2\.0" has no typed semantic bullet/,
  );
});

test("changelogVersion rejects a duplicated version heading", () => {
  assert.throws(
    () =>
      changelogVersion(
        "## 0.1.0\n\n- feat: an internal module.\n\n## 0.1.0\n\n- feat: again.\n",
      ),
    /declares 0\.1\.0 in more than one release heading/,
  );
});

test("packageVersion reads the package version", () => {
  assert.equal(packageVersion(packageJson("0.1.0")), "0.1.0");
});

test("packageVersion rejects invalid JSON", () => {
  assert.throws(() => packageVersion("{"), /package\.json is not valid JSON/);
});

test("packageVersion rejects a non-object document", () => {
  assert.throws(
    () => packageVersion("42"),
    /package\.json must contain a JSON object/,
  );
});

test("packageVersion rejects a null document", () => {
  assert.throws(
    () => packageVersion("null"),
    /package\.json must contain a JSON object/,
  );
});

test("packageVersion rejects a missing version field", () => {
  assert.throws(
    () => packageVersion(JSON.stringify({ name: "quaternits" })),
    /package\.json has no non-empty string "version" field/,
  );
});

test("packageVersion rejects an empty version field", () => {
  assert.throws(
    () => packageVersion(JSON.stringify({ version: "" })),
    /package\.json has no non-empty string "version" field/,
  );
});

test("lockfileVersions reads the top-level and root package versions", () => {
  assert.deepEqual(lockfileVersions(lockfile("0.1.0", "0.2.0")), {
    version: "0.1.0",
    root: "0.2.0",
  });
});

test("lockfileVersions rejects invalid JSON", () => {
  assert.throws(
    () => lockfileVersions("{"),
    /package-lock\.json is not valid JSON/,
  );
});

test("lockfileVersions rejects a missing top-level version", () => {
  assert.throws(
    () => lockfileVersions(JSON.stringify({ packages: { "": {} } })),
    /package-lock\.json has no non-empty string "version" field/,
  );
});

test("lockfileVersions rejects a missing packages map", () => {
  assert.throws(
    () => lockfileVersions(JSON.stringify({ version: "0.1.0" })),
    /package-lock\.json has no "packages" object/,
  );
});

test("lockfileVersions rejects a null packages map", () => {
  assert.throws(
    () =>
      lockfileVersions(JSON.stringify({ version: "0.1.0", packages: null })),
    /package-lock\.json has no "packages" object/,
  );
});

test("lockfileVersions rejects a missing root package entry", () => {
  assert.throws(
    () => lockfileVersions(JSON.stringify({ version: "0.1.0", packages: {} })),
    /package-lock\.json has no root "" package entry/,
  );
});

test("lockfileVersions rejects a null root package entry", () => {
  assert.throws(
    () =>
      lockfileVersions(
        JSON.stringify({ version: "0.1.0", packages: { "": null } }),
      ),
    /package-lock\.json has no root "" package entry/,
  );
});

test("lockfileVersions rejects a root package without a version", () => {
  assert.throws(
    () =>
      lockfileVersions(
        JSON.stringify({ version: "0.1.0", packages: { "": { name: "x" } } }),
      ),
    /package-lock\.json root package has no non-empty string "version" field/,
  );
});

test("README badge drift reports missing, stale and malformed versions", () => {
  assert.deepEqual(readmeBadgeDrift("0.1.0", readme("0.1.0")), []);
  assert.deepEqual(readmeBadgeDrift("0.2.0", readme("0.1.0")), [
    { source: "README.md version badge", expected: "0.2.0", actual: "0.1.0" },
  ]);
  assert.deepEqual(readmeBadgeDrift("0.1.0", "# QuaterniTS\n\nOverview.\n"), [
    {
      source: "README.md version badge",
      expected: "0.1.0",
      actual: "(missing)",
    },
  ]);
  assert.deepEqual(
    readmeBadgeDrift(
      "0.1.0",
      readme("0.1.0").replace("message=0.1.0", "message=wrong"),
    ),
    [
      {
        source: "README.md version badge",
        expected: "0.1.0",
        actual: "(malformed)",
      },
    ],
  );
});

test("README badge sync inserts once and encodes prerelease metadata", () => {
  const initial = "# QuaterniTS\n\nLibrary overview.\n";
  const synced = synchronizeReadmeBadge("0.2.0-beta.1+build.5", initial);
  assert.match(synced, /Version: 0\.2\.0-beta\.1\+build\.5/);
  assert.match(synced, /message=0\.2\.0-beta\.1%2Bbuild\.5/);
  assert.equal(synchronizeReadmeBadge("0.2.0-beta.1+build.5", synced), synced);
  assert.match(synced, /Library overview\./);
});

test("README badge sync fails before writing when the marker is ambiguous", () => {
  assert.throws(
    () => synchronizeReadmeBadge("0.2.0", `${readme()}${readme()}`),
    /multiple version badges/,
  );
  assert.throws(
    () => synchronizeReadmeBadge("0.2.0", "No project heading\n"),
    /README.md must start with # QuaterniTS/,
  );
});

test("versionDrift returns nothing when every field agrees", () => {
  assert.deepEqual(
    versionDrift("0.1.0", packageJson("0.1.0"), lockfile("0.1.0")),
    [],
  );
});

test("versionDrift reports every drifting field with its source", () => {
  assert.deepEqual(
    versionDrift("0.1.0", packageJson("0.0.9"), lockfile("0.0.8", "0.0.7")),
    [
      { source: "package.json version", expected: "0.1.0", actual: "0.0.9" },
      {
        source: "package-lock.json version",
        expected: "0.1.0",
        actual: "0.0.8",
      },
      {
        source: 'package-lock.json packages[""] version',
        expected: "0.1.0",
        actual: "0.0.7",
      },
    ],
  );
});

test("synchronizeVersions rewrites only the three version fields", () => {
  const synced = synchronizeVersions(
    "0.2.0",
    packageJson("0.1.0"),
    lockfile("0.1.0", "0.1.0"),
  );
  const pkg = JSON.parse(synced.package);
  assert.equal(pkg.version, "0.2.0");
  assert.equal(pkg.name, "quaternits");
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, "MIT");
  const lock = JSON.parse(synced.lock);
  assert.equal(lock.version, "0.2.0");
  assert.equal(lock.packages[""].version, "0.2.0");
  assert.equal(lock.packages[""].license, "MIT");
});

test("synchronizeVersions preserves unrelated lock metadata", () => {
  const synced = synchronizeVersions(
    "0.2.0",
    packageJson("0.1.0"),
    lockfile("0.1.0"),
  );
  const lock = JSON.parse(synced.lock);
  assert.equal(lock.name, "quaternits");
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages["node_modules/example"], {
    version: "9.9.9",
    dev: true,
  });
});

test("synchronizeVersions returns identical text when already in sync", () => {
  const synced = synchronizeVersions(
    "0.1.0",
    packageJson("0.1.0"),
    lockfile("0.1.0"),
  );
  assert.equal(synced.package, packageJson("0.1.0"));
  assert.equal(synced.lock, lockfile("0.1.0"));
});

test("synchronizeVersions fails closed on invalid package JSON", () => {
  assert.throws(
    () => synchronizeVersions("0.2.0", "{", lockfile("0.1.0")),
    /package\.json is not valid JSON/,
  );
});

test("synchronizeVersions fails closed when the lock has no root entry", () => {
  assert.throws(
    () =>
      synchronizeVersions(
        "0.2.0",
        packageJson("0.1.0"),
        JSON.stringify({ version: "0.1.0", packages: {} }),
      ),
    /no root "" package entry/,
  );
});

test("main passes when every version field agrees with the changelog", () => {
  const logs: string[] = [];
  const code = main(
    ["--check", ...TARGET_ARGS],
    makeDeps(
      {
        "CHANGELOG.md": changelog("0.1.0"),
        "package.json": packageJson("0.1.0"),
        "package-lock.json": lockfile("0.1.0"),
        "README.md": readme("0.1.0"),
      },
      { log: (message: string) => logs.push(message) },
    ),
  );
  assert.equal(code, 0);
  assert.match(
    logs.join("\n"),
    /CHANGELOG\.md 0\.1\.0 matches package\.json, package-lock\.json and README\.md/,
  );
});

test("main lists every drifting field and fails", () => {
  const errors: string[] = [];
  const code = main(
    TARGET_ARGS,
    makeDeps(
      {
        "CHANGELOG.md": changelog("0.1.0"),
        "package.json": packageJson("0.0.9"),
        "package-lock.json": lockfile("0.0.8", "0.0.7"),
        "README.md": readme("0.1.0"),
      },
      { error: (message: string) => errors.push(message) },
    ),
  );
  assert.equal(code, 1);
  const output = errors.join("\n");
  assert.match(output, /package\.json version is 0\.0\.9, expected 0\.1\.0/);
  assert.match(
    output,
    /package-lock\.json version is 0\.0\.8, expected 0\.1\.0/,
  );
  assert.match(output, /packages\[""\] version is 0\.0\.7, expected 0\.1\.0/);
  assert.match(output, /FAILED — 3 version field\(s\) disagree/);
});

test("main fails closed on an unusable changelog", () => {
  const errors: string[] = [];
  const code = main(
    TARGET_ARGS,
    makeDeps(
      {
        "CHANGELOG.md": "# Changelog\n\nNothing yet.\n",
        "package.json": packageJson("0.1.0"),
        "package-lock.json": lockfile("0.1.0"),
        "README.md": readme("0.1.0"),
      },
      { error: (message: string) => errors.push(message) },
    ),
  );
  assert.equal(code, 1);
  assert.match(
    errors.join("\n"),
    /FAILED — CHANGELOG\.md line 1 is the heading "# Changelog"/,
  );
});

test("main syncs drifting files and reports how many changed", () => {
  const logs: string[] = [];
  const deps = makeDeps(
    {
      "CHANGELOG.md": changelog("0.2.0"),
      "package.json": packageJson("0.1.0"),
      "package-lock.json": lockfile("0.1.0"),
      "README.md": readme("0.1.0"),
    },
    { log: (message: string) => logs.push(message) },
  );
  const code = main(["--sync", ...TARGET_ARGS], deps);
  assert.equal(code, 0);
  assert.match(logs.join("\n"), /updated 3 file\(s\) from changelog/);
  assert.equal(Object.keys(deps.written).length, 3);
  assert.match(deps.written["README.md"] ?? "", /Version: 0\.2\.0/);
  assert.equal(JSON.parse(deps.written["package.json"] ?? "").version, "0.2.0");
  assert.equal(
    JSON.parse(deps.written["package-lock.json"] ?? "").packages[""].version,
    "0.2.0",
  );
});

test("main writes nothing when sync is already clean", () => {
  const logs: string[] = [];
  const deps = makeDeps(
    {
      "CHANGELOG.md": changelog("0.1.0"),
      "package.json": packageJson("0.1.0"),
      "package-lock.json": lockfile("0.1.0"),
      "README.md": readme("0.1.0"),
    },
    { log: (message: string) => logs.push(message) },
  );
  const code = main(["--sync", ...TARGET_ARGS], deps);
  assert.equal(code, 0);
  assert.deepEqual(deps.written, {});
  assert.match(logs.join("\n"), /already matches 0\.1\.0/);
});

test("main fails closed when sync input is unusable", () => {
  const errors: string[] = [];
  const deps = makeDeps(
    {
      "CHANGELOG.md": changelog("0.2.0"),
      "package.json": "{",
      "package-lock.json": lockfile("0.1.0"),
      "README.md": readme("0.1.0"),
    },
    { error: (message: string) => errors.push(message) },
  );
  const code = main(["--sync", ...TARGET_ARGS], deps);
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /FAILED — package\.json is not valid JSON/);
  assert.deepEqual(deps.written, {});
});

test("main validates README badge before writing any version field", () => {
  const errors: string[] = [];
  const deps = makeDeps(
    {
      "CHANGELOG.md": changelog("0.2.0"),
      "package.json": packageJson("0.1.0"),
      "package-lock.json": lockfile("0.1.0"),
      "README.md": `${readme()}${readme()}`,
    },
    { error: (message: string) => errors.push(message) },
  );
  assert.equal(main(["--sync", ...TARGET_ARGS], deps), 1);
  assert.match(errors.join("\n"), /README.md has multiple version badges/);
  assert.deepEqual(deps.written, {});
});

test("main requires a path after a path flag", () => {
  const errors: string[] = [];
  const code = main(
    ["--package"],
    makeDeps({}, { error: (message: string) => errors.push(message) }),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /--package requires a path/);
});

test("main rejects an unknown argument", () => {
  const errors: string[] = [];
  const code = main(
    ["--bogus"],
    makeDeps({}, { error: (message: string) => errors.push(message) }),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /unknown argument --bogus/);
});

test("main reports a non-Error failure loudly", () => {
  const errors: string[] = [];
  const code = main(
    TARGET_ARGS,
    makeDeps(
      {},
      {
        readText: () => {
          throw "boom";
        },
        error: (message: string) => errors.push(message),
      },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /FAILED — boom/);
});

test("the CLI passes against the repository's own changelog and metadata", () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /matches package\.json, package-lock\.json and README\.md/,
  );
});

test("the CLI exits nonzero on drift in temp fixtures without writing", () => {
  const files = tempFixtures("0.2.0");
  try {
    writeFileSync(files.package, packageJson("0.1.0"));
    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--check", ...fixtureArgs(files)],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAILED/);
    assert.equal(
      JSON.parse(readFileSync(files.package, "utf8")).version,
      "0.1.0",
    );
  } finally {
    rmSync(files.dir, { recursive: true, force: true });
  }
});

test("the CLI syncs temp fixtures, preserves flags and is idempotent", () => {
  const files = tempFixtures("0.2.0");
  try {
    writeFileSync(files.package, packageJson("0.1.0"));
    const first = spawnSync(
      process.execPath,
      [SCRIPT, "--sync", ...fixtureArgs(files)],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    assert.equal(first.status, 0, first.stderr);
    const pkg = JSON.parse(readFileSync(files.package, "utf8"));
    assert.equal(pkg.version, "0.2.0");
    assert.equal(pkg.private, true);
    assert.equal(pkg.license, "MIT");
    const lock = JSON.parse(readFileSync(files.lock, "utf8"));
    assert.equal(lock.version, "0.2.0");
    assert.equal(lock.packages[""].version, "0.2.0");
    assert.equal(lock.packages[""].license, "MIT");

    const packageText = readFileSync(files.package, "utf8");
    const lockText = readFileSync(files.lock, "utf8");
    const readmeText = readFileSync(files.readme, "utf8");
    assert.match(readmeText, /Version: 0\.2\.0/);
    const second = spawnSync(
      process.execPath,
      [SCRIPT, "--sync", ...fixtureArgs(files)],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already matches 0\.2\.0/);
    assert.equal(readFileSync(files.package, "utf8"), packageText);
    assert.equal(readFileSync(files.lock, "utf8"), lockText);
    assert.equal(readFileSync(files.readme, "utf8"), readmeText);
  } finally {
    rmSync(files.dir, { recursive: true, force: true });
  }
});
