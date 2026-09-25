/**
 * Version authority for QuaterniTS.
 *
 * `CHANGELOG.md`'s top `## <semver>` release heading is the single authored
 * version. The changelog grammar is deliberately narrow — blank lines, exact
 * `## <semver>` headings and typed semantic bullets (with indented wrap lines)
 * below them — so a title, subheading, free prose, untyped bullet or annotated
 * heading is rejected instead of being silently ignored. `--check` (the
 * default, run by `make version-check`) fails closed when `package.json`,
 * either lockfile version or the README badge disagrees with the authority.
 * `--sync` (run by the opt-in pre-commit hook or explicit `make version-sync`,
 * never by `make verify`) rewrites only those fields and the managed badge;
 * `private`, `license` and unrelated content remain untouched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

/** Raised when changelog or package metadata cannot be trusted. */
export class VersionError extends Error {}

/**
 * Bullet type prefixes allowed on changelog entries: the Conventional Commits
 * vocabulary, so each entry states whether it is a feature, fix, chore, etc.
 */
const BULLET_TYPES: readonly string[] = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];

/** A typed semantic bullet: `- <type>: <description>` with single spaces. */
const TYPED_BULLET = /^- [a-z]+: \S/;

/** An indented line that wraps the preceding bullet's description. */
const BULLET_CONTINUATION = /^ {2,}\S/;

/** Semantic version with optional prerelease and build metadata. */
const SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * The version authority: the top `## <semver>` heading of the changelog.
 *
 * Throws `VersionError` for anything outside the narrow grammar above, so an
 * unparseable changelog can never silently supply a version.
 */
export function changelogVersion(text: string): string {
  if (text.includes("\r")) {
    throw new VersionError(
      "CHANGELOG.md contains CRLF line endings; the changelog is LF-only",
    );
  }
  const versions: string[] = [];
  let current: string | undefined;
  let entries = 0;
  let continuation = false;
  for (const [index, line] of text.split("\n").entries()) {
    const at = `CHANGELOG.md line ${index + 1}`;
    if (line.trim() === "") {
      continuation = false;
      continue;
    }
    if (line.startsWith("#")) {
      if (!line.startsWith("## ")) {
        throw new VersionError(
          `${at} is the heading "${line}"; only exact "## <semver>" release headings are allowed`,
        );
      }
      const version = line.slice(3);
      if (/\s/.test(version)) {
        throw new VersionError(
          `${at} release heading "${version}" has extra text; expected exactly "## <semver>"`,
        );
      }
      if (!SEMVER.test(version)) {
        throw new VersionError(
          `${at} release heading "${version}" is not a semantic version`,
        );
      }
      if (current !== undefined && entries === 0) {
        throw new VersionError(
          `CHANGELOG.md release heading "${current}" has no typed semantic bullet`,
        );
      }
      if (versions.includes(version)) {
        throw new VersionError(
          `CHANGELOG.md declares ${version} in more than one release heading; the version authority must be unique`,
        );
      }
      versions.push(version);
      current = version;
      entries = 0;
      continuation = false;
      continue;
    }
    if (line.startsWith("-")) {
      if (!TYPED_BULLET.test(line)) {
        throw new VersionError(
          `${at} is not a typed semantic bullet; expected "- <type>: <description>" with a type such as feat, fix, chore or docs`,
        );
      }
      const type = line.slice(2, line.indexOf(": "));
      if (!BULLET_TYPES.includes(type)) {
        throw new VersionError(
          `${at} uses unknown bullet type "${type}"; expected one of ${BULLET_TYPES.join(", ")}`,
        );
      }
      if (current === undefined) {
        throw new VersionError(
          `${at} is a bullet before any "## <semver>" release heading`,
        );
      }
      entries += 1;
      continuation = true;
      continue;
    }
    if (BULLET_CONTINUATION.test(line)) {
      if (!continuation) {
        throw new VersionError(
          `${at} is an indented line that continues no bullet`,
        );
      }
      continue;
    }
    throw new VersionError(
      `${at} is free prose; only "## <semver>" release headings and typed semantic bullets are allowed`,
    );
  }
  const authority = versions[0];
  if (authority === undefined) {
    throw new VersionError(
      'CHANGELOG.md has no "## <semver>" release heading; the top heading is the version authority',
    );
  }
  if (entries === 0) {
    throw new VersionError(
      `CHANGELOG.md release heading "${current}" has no typed semantic bullet`,
    );
  }
  return authority;
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VersionError(`${label} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new VersionError(`${label} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function readVersionField(
  record: Record<string, unknown>,
  label: string,
): string {
  const version = record.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new VersionError(`${label} has no non-empty string "version" field`);
  }
  return version;
}

function rootPackage(lock: Record<string, unknown>): Record<string, unknown> {
  const packages = lock.packages;
  if (typeof packages !== "object" || packages === null) {
    throw new VersionError('package-lock.json has no "packages" object');
  }
  const root = (packages as Record<string, unknown>)[""];
  if (typeof root !== "object" || root === null) {
    throw new VersionError('package-lock.json has no root "" package entry');
  }
  return root as Record<string, unknown>;
}

/** The `version` field of `package.json`. */
export function packageVersion(text: string): string {
  return readVersionField(
    parseJsonObject(text, "package.json"),
    "package.json",
  );
}

export interface LockfileVersions {
  /** Top-level lockfile `version`. */
  readonly version: string;
  /** `packages[""]` root package `version`. */
  readonly root: string;
}

/** Both lockfile version fields, each validated. */
export function lockfileVersions(text: string): LockfileVersions {
  const lock = parseJsonObject(text, "package-lock.json");
  return {
    version: readVersionField(lock, "package-lock.json"),
    root: readVersionField(rootPackage(lock), "package-lock.json root package"),
  };
}

export interface VersionDrift {
  /** Which authored field disagrees with the changelog. */
  readonly source: string;
  /** The changelog authority. */
  readonly expected: string;
  /** The value found in package metadata. */
  readonly actual: string;
}

/** The static badge is derived from the changelog, never from the npm registry. */
function versionBadge(authority: string): string {
  return `[![Version: ${authority}](https://img.shields.io/static/v1?label=version&message=${encodeURIComponent(authority)}&color=blue)](CHANGELOG.md)`;
}

function existingBadge(readmeText: string): string | undefined {
  const lines = readmeText
    .split("\n")
    .filter((line) => line.startsWith("[![Version: "));
  if (lines.length > 1) {
    throw new VersionError("README.md has multiple version badges");
  }
  return lines[0];
}

/** A missing, stale or malformed README version badge fails the read-only gate. */
export function readmeBadgeDrift(
  authority: string,
  readmeText: string,
): VersionDrift[] {
  const current = existingBadge(readmeText);
  if (current === versionBadge(authority)) {
    return [];
  }
  const parsed =
    current === undefined
      ? null
      : /^\[!\[Version: ([^\]]+)\]\(https:\/\/img\.shields\.io\/static\/v1\?label=version&message=([^&)]+)&color=blue\)\]\(CHANGELOG\.md\)$/.exec(
          current,
        );
  const matchedVersion = parsed?.[1];
  const matchedMessage = parsed?.[2];
  let actual: string;
  if (current === undefined) {
    actual = "(missing)";
  } else if (
    matchedVersion !== undefined &&
    matchedMessage === encodeURIComponent(matchedVersion)
  ) {
    actual = matchedVersion;
  } else {
    actual = "(malformed)";
  }
  return [{ source: "README.md version badge", expected: authority, actual }];
}

/** Update only the managed badge; insert it below the project heading once. */
export function synchronizeReadmeBadge(
  authority: string,
  readmeText: string,
): string {
  const current = existingBadge(readmeText);
  const replacement = versionBadge(authority);
  if (current !== undefined) {
    return readmeText
      .split("\n")
      .map((line) => (line === current ? replacement : line))
      .join("\n");
  }
  if (!readmeText.startsWith("# QuaterniTS\n\n")) {
    throw new VersionError("README.md must start with # QuaterniTS");
  }
  return readmeText.replace(
    "# QuaterniTS\n\n",
    `# QuaterniTS\n\n${replacement}\n`,
  );
}

/** Every version field that disagrees with the changelog authority. */
export function versionDrift(
  authority: string,
  packageText: string,
  lockText: string,
): VersionDrift[] {
  const drift: VersionDrift[] = [];
  const pkg = packageVersion(packageText);
  if (pkg !== authority) {
    drift.push({
      source: "package.json version",
      expected: authority,
      actual: pkg,
    });
  }
  const lock = lockfileVersions(lockText);
  if (lock.version !== authority) {
    drift.push({
      source: "package-lock.json version",
      expected: authority,
      actual: lock.version,
    });
  }
  if (lock.root !== authority) {
    drift.push({
      source: 'package-lock.json packages[""] version',
      expected: authority,
      actual: lock.root,
    });
  }
  return drift;
}

export interface SynchronizedVersions {
  /** Rewritten `package.json` text. */
  readonly package: string;
  /** Rewritten `package-lock.json` text. */
  readonly lock: string;
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Rewrite the three version fields from the changelog authority.
 *
 * Only `version`, the lockfile `version` and `packages[""].version` change;
 * every other key (including `private`, `license` and unrelated lock metadata)
 * is preserved. Re-serializing is stable, so text that already matches the
 * authority comes back byte-identical and a sync is idempotent.
 */
export function synchronizeVersions(
  authority: string,
  packageText: string,
  lockText: string,
): SynchronizedVersions {
  const pkg = parseJsonObject(packageText, "package.json");
  readVersionField(pkg, "package.json");
  const lock = parseJsonObject(lockText, "package-lock.json");
  readVersionField(lock, "package-lock.json");
  const root = rootPackage(lock);
  readVersionField(root, "package-lock.json root package");
  pkg.version = authority;
  lock.version = authority;
  root.version = authority;
  return { package: serializeJson(pkg), lock: serializeJson(lock) };
}

export interface VersionTargets {
  readonly changelog: string;
  readonly package: string;
  readonly lock: string;
  readonly readme: string;
}

/** Repository files whose versions the changelog authority governs. */
export const DEFAULT_TARGETS: VersionTargets = {
  changelog: fileURLToPath(new URL("../../CHANGELOG.md", import.meta.url)),
  package: fileURLToPath(new URL("../../package.json", import.meta.url)),
  lock: fileURLToPath(new URL("../../package-lock.json", import.meta.url)),
  readme: fileURLToPath(new URL("../../README.md", import.meta.url)),
};

const PATH_FLAGS: Readonly<Record<string, keyof VersionTargets>> = {
  "--changelog": "changelog",
  "--package": "package",
  "--lock": "lock",
  "--readme": "readme",
};

export interface VersionDeps {
  readonly readText: (file: string) => string;
  readonly writeText: (file: string, text: string) => void;
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

/** Real process dependencies, injectable so the gate can be unit tested. */
export function defaultDeps(): VersionDeps {
  return {
    readText: (file) => readFileSync(file, "utf8"),
    writeText: (file, text) => writeFileSync(file, text),
    log: (message) => console.log(message),
    error: (message) => console.error(message),
  };
}

/** Entry point; returns the process exit code. */
export function main(argv: readonly string[], deps: VersionDeps): number {
  const targets: {
    changelog: string;
    package: string;
    lock: string;
    readme: string;
  } = {
    ...DEFAULT_TARGETS,
  };
  let sync = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sync") {
      sync = true;
      continue;
    }
    if (arg === "--check") {
      continue;
    }
    const key = PATH_FLAGS[String(arg)];
    if (key === undefined) {
      deps.error(`version: unknown argument ${String(arg)}`);
      return 1;
    }
    const value = argv[index + 1];
    if (value === undefined) {
      deps.error(`version: ${arg} requires a path`);
      return 1;
    }
    targets[key] = value;
    index += 1;
  }

  try {
    const authority = changelogVersion(deps.readText(targets.changelog));
    const packageText = deps.readText(targets.package);
    const lockText = deps.readText(targets.lock);
    const readmeText = deps.readText(targets.readme);
    if (sync) {
      // Validate every input before writing any of the generated files.
      const synced = synchronizeVersions(authority, packageText, lockText);
      const syncedReadme = synchronizeReadmeBadge(authority, readmeText);
      let changed = 0;
      if (synced.package !== packageText) {
        deps.writeText(targets.package, synced.package);
        changed += 1;
      }
      if (synced.lock !== lockText) {
        deps.writeText(targets.lock, synced.lock);
        changed += 1;
      }
      if (syncedReadme !== readmeText) {
        deps.writeText(targets.readme, syncedReadme);
        changed += 1;
      }
      if (changed === 0) {
        deps.log(`version: package metadata already matches ${authority}`);
        return 0;
      }
      deps.log(
        `version: updated ${changed} file(s) from changelog authority ${authority}`,
      );
      return 0;
    }
    const drift = [
      ...versionDrift(authority, packageText, lockText),
      ...readmeBadgeDrift(authority, readmeText),
    ];
    for (const item of drift) {
      deps.error(
        `version: ${item.source} is ${item.actual}, expected ${item.expected}`,
      );
    }
    if (drift.length > 0) {
      deps.error(
        `version: FAILED — ${drift.length} version field(s) disagree with CHANGELOG.md authority ${authority}; run \`make version-sync\``,
      );
      return 1;
    }
    deps.log(
      `version: CHANGELOG.md ${authority} matches package.json, package-lock.json and README.md`,
    );
    return 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deps.error(`version: FAILED — ${detail}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), defaultDeps());
}
