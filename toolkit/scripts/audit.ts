/**
 * Dependency-audit gate for QuaterniTS.
 *
 * Runs `npm audit --json`, blocks on HIGH and CRITICAL advisories, and allows a
 * reviewed, reason-plus-expiry exception per advisory in
 * `toolkit/audit-exceptions.json`. Any inability to obtain a real audit report
 * (offline registry, npm error, unparseable output) fails loudly instead of
 * passing, so a broken scanner is never mistaken for a clean result.
 *
 * `--report <path>` reads a captured `npm audit --json` payload instead of
 * invoking npm. It exists so the gate can be exercised without network access.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

/** Severities that block unless a reviewed exception covers them. */
export const BLOCKING_SEVERITIES: readonly string[] = ["high", "critical"];

/** Path to the reviewed exception list, resolved next to this script. */
export const EXCEPTIONS_FILE = fileURLToPath(
  new URL("../audit-exceptions.json", import.meta.url),
);

export interface AuditAdvisory {
  readonly id: string;
  readonly package: string;
  readonly severity: string;
  readonly title: string;
  readonly url: string;
}

export interface AuditException {
  readonly advisory: string;
  readonly reason: string;
  readonly expires: string;
}

export interface ExpiredException {
  /** The advisory the exception covered, absent when no current advisory matches. */
  readonly advisory?: AuditAdvisory;
  readonly exception: AuditException;
}

export interface AuditEvaluation {
  readonly blocking: readonly AuditAdvisory[];
  readonly excepted: readonly AuditAdvisory[];
  readonly expired: readonly ExpiredException[];
  readonly ok: boolean;
}

interface RawViaAdvisory {
  readonly source?: number;
  readonly name?: string;
  readonly title?: string;
  readonly url?: string;
  readonly severity?: string;
}

interface RawVulnerability {
  readonly name?: string;
  readonly severity?: string;
  readonly via?: readonly (RawViaAdvisory | string)[];
}

export interface RawAuditReport {
  readonly vulnerabilities?: Readonly<Record<string, RawVulnerability>>;
  readonly metadata?: {
    readonly vulnerabilities?: Readonly<Record<string, number>> | null;
  } | null;
  readonly message?: string;
}

/** Raised when npm did not produce a usable vulnerability report. */
export class AuditUnavailableError extends Error {}

/** Best stable identifier for an advisory: GHSA id, npm source id, or title. */
export function advisoryId(via: RawViaAdvisory): string {
  const ghsa = /GHSA-[0-9a-z-]+/i.exec(via.url ?? "");
  if (ghsa) {
    return ghsa[0].toUpperCase();
  }
  if (typeof via.source === "number") {
    return `npm:${via.source}`;
  }
  return via.title ?? "unknown";
}

/**
 * HIGH/CRITICAL advisories from an audit report, de-duplicated per package.
 *
 * A transitive `via` string names the dependency that pulled an advisory in; it
 * is only a pointer, so it is resolved against the other vulnerability entries.
 * A blocking severity whose advisory cannot be resolved that way still produces
 * a blocking advisory with a stable `unresolved:<package>` id: silently dropping
 * it would turn a real HIGH/CRITICAL finding into a green gate.
 */
export function collectAdvisories(report: RawAuditReport): AuditAdvisory[] {
  const entries = Object.entries(report.vulnerabilities ?? {});
  const advisories: AuditAdvisory[] = [];
  const seen = new Set<string>();
  const add = (advisory: AuditAdvisory): void => {
    const key = `${advisory.id}|${advisory.package}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    advisories.push(advisory);
  };

  const blockingPackages = new Set<string>();
  for (const [name, vulnerability] of entries) {
    const pkg = vulnerability.name ?? name;
    for (const via of vulnerability.via ?? []) {
      if (typeof via === "string") {
        continue;
      }
      const severity = via.severity ?? vulnerability.severity ?? "unknown";
      if (BLOCKING_SEVERITIES.includes(severity)) {
        blockingPackages.add(pkg);
        break;
      }
    }
  }

  for (const [name, vulnerability] of entries) {
    const pkg = vulnerability.name ?? name;
    for (const via of vulnerability.via ?? []) {
      if (typeof via === "string") {
        continue;
      }
      const severity = via.severity ?? vulnerability.severity ?? "unknown";
      if (!BLOCKING_SEVERITIES.includes(severity)) {
        continue;
      }
      add({
        id: advisoryId(via),
        package: pkg,
        severity,
        title: via.title ?? "",
        url: via.url ?? "",
      });
    }
  }

  for (const [name, vulnerability] of entries) {
    const pkg = vulnerability.name ?? name;
    const severity = vulnerability.severity ?? "unknown";
    if (!BLOCKING_SEVERITIES.includes(severity) || blockingPackages.has(pkg)) {
      continue;
    }
    const viaNames = (vulnerability.via ?? []).filter(
      (via): via is string => typeof via === "string",
    );
    const unresolved = viaNames.filter(
      (viaName) => !blockingPackages.has(viaName),
    );
    if (viaNames.length > 0 && unresolved.length === 0) {
      continue;
    }
    add({
      id: `unresolved:${pkg}`,
      package: pkg,
      severity,
      title:
        unresolved.length > 0
          ? `unresolved transitive advisory via ${unresolved.sort().join(", ")}`
          : "unresolved advisory with no identifying via",
      url: "",
    });
  }

  return advisories;
}

/** Parse an `npm audit --json` payload, refusing anything unusable. */
export function parseAuditReport(text: string): RawAuditReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AuditUnavailableError(
      "npm audit did not return JSON; an unavailable audit is not a passing audit",
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new AuditUnavailableError("npm audit returned a non-object payload");
  }
  const report = parsed as RawAuditReport;
  const metadata = report.metadata;
  if (
    !metadata ||
    typeof metadata.vulnerabilities !== "object" ||
    metadata.vulnerabilities === null
  ) {
    const detail = report.message ? `: ${report.message}` : "";
    throw new AuditUnavailableError(
      `npm audit returned no vulnerability report${detail}; the registry may be unreachable`,
    );
  }
  const counts = metadata.vulnerabilities;
  if (
    (counts.high ?? 0) + (counts.critical ?? 0) > 0 &&
    collectAdvisories(report).length === 0
  ) {
    throw new AuditUnavailableError(
      "npm audit metadata counts HIGH/CRITICAL vulnerabilities but the report lists none; refusing to treat a contradictory report as clean",
    );
  }
  return report;
}

/** Parse and validate the reviewed exception list. */
export function loadExceptions(text: string): AuditException[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("toolkit/audit-exceptions.json is not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("toolkit/audit-exceptions.json must be a JSON array");
  }
  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`audit exception #${index} must be an object`);
    }
    const record = entry as Record<string, unknown>;
    for (const field of ["advisory", "reason", "expires"] as const) {
      if (typeof record[field] !== "string" || record[field] === "") {
        throw new Error(
          `audit exception #${index} needs a non-empty string "${field}"`,
        );
      }
    }
    return {
      advisory: record.advisory as string,
      reason: record.reason as string,
      expires: record.expires as string,
    };
  });
}

function isUnexpired(expires: string, now: Date): boolean {
  const expiry = Date.parse(`${expires}T00:00:00Z`);
  if (Number.isNaN(expiry)) {
    return false;
  }
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return expiry >= today;
}

function exceptionMatches(
  advisory: AuditAdvisory,
  exception: AuditException,
): boolean {
  return (
    exception.advisory.toUpperCase() === advisory.id.toUpperCase() ||
    (advisory.url !== "" && exception.advisory === advisory.url)
  );
}

function exceptionFor(
  advisory: AuditAdvisory,
  exceptions: readonly AuditException[],
): AuditException | undefined {
  return exceptions.find((candidate) => exceptionMatches(advisory, candidate));
}

/** Apply reviewed exceptions to a report and decide whether the gate passes. */
export function evaluateAudit(
  report: RawAuditReport,
  exceptions: readonly AuditException[],
  now: Date,
): AuditEvaluation {
  const advisories = collectAdvisories(report);
  const blocking: AuditAdvisory[] = [];
  const excepted: AuditAdvisory[] = [];
  const expired: ExpiredException[] = [];
  const invalid = new Set<AuditException>();
  for (const exception of exceptions) {
    if (!exception.reason.trim() || !isUnexpired(exception.expires, now)) {
      invalid.add(exception);
    }
  }
  const reported = new Set<AuditException>();
  for (const advisory of advisories) {
    const exception = exceptionFor(advisory, exceptions);
    if (!exception) {
      blocking.push(advisory);
      continue;
    }
    if (invalid.has(exception)) {
      expired.push({ advisory, exception });
      reported.add(exception);
      continue;
    }
    excepted.push(advisory);
  }
  // An expired, blank or malformed exception fails even when no current advisory
  // matches it: stale policy must be renewed or removed, never left to rot.
  for (const exception of exceptions) {
    if (invalid.has(exception) && !reported.has(exception)) {
      expired.push({ exception });
    }
  }
  return {
    blocking,
    excepted,
    expired,
    ok: blocking.length === 0 && expired.length === 0,
  };
}

export interface AuditCommandResult {
  readonly stdout: string;
  readonly status: number;
}

/** Run a command and capture both its stdout and its exit status. */
export function runAuditCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): AuditCommandResult {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8" });
  if (result.error) {
    throw new Error(`failed to run \`${command}\`: ${result.error.message}`);
  }
  // A signal-terminated process reports a null status; treat it as a failure.
  return { stdout: result.stdout, status: result.status ?? 1 };
}

export interface AuditDeps {
  readonly runNpmAudit: () => AuditCommandResult;
  readonly readText: (file: string) => string;
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
  readonly now: () => Date;
  readonly exceptionsFile: string;
}

/** Real process dependencies, injectable so the gate can be unit tested. */
export function defaultDeps(): AuditDeps {
  return {
    runNpmAudit: () =>
      runAuditCommand("npm", ["audit", "--json"], process.cwd()),
    readText: (file) => readFileSync(file, "utf8"),
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    now: () => new Date(),
    exceptionsFile: EXCEPTIONS_FILE,
  };
}

/** Entry point; returns the process exit code. */
export function main(argv: readonly string[], deps: AuditDeps): number {
  let reportPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--report") {
      reportPath = argv[index + 1];
      if (reportPath === undefined) {
        deps.error("audit: --report requires a path");
        return 1;
      }
      index += 1;
    }
  }
  try {
    let reportText: string;
    let invocation: AuditCommandResult | undefined;
    if (reportPath) {
      reportText = deps.readText(reportPath);
    } else {
      invocation = deps.runNpmAudit();
      reportText = invocation.stdout;
    }
    const report = parseAuditReport(reportText);
    const exceptions = loadExceptions(deps.readText(deps.exceptionsFile));
    const evaluation = evaluateAudit(report, exceptions, deps.now());
    for (const advisory of evaluation.excepted) {
      deps.log(
        `audit: excepted ${advisory.id} (${advisory.package}) by reviewed policy`,
      );
    }
    for (const { advisory, exception } of evaluation.expired) {
      const subject = advisory
        ? `${advisory.id} (${advisory.package})`
        : exception.advisory;
      deps.error(
        `audit: exception for ${subject} expired ${exception.expires}; renew or remove it`,
      );
    }
    for (const advisory of evaluation.blocking) {
      deps.error(
        `audit: ${advisory.severity.toUpperCase()} ${advisory.id} (${advisory.package}) ${advisory.url}`,
      );
    }
    if (!evaluation.ok) {
      deps.error("audit: FAILED — blocking HIGH/CRITICAL dependency policy");
      return 1;
    }
    // A nonzero npm exit normally means advisories were found, which the report
    // above already handles. A nonzero exit over a report that lists no
    // vulnerabilities at all is a broken scan, not a clean one.
    if (
      invocation !== undefined &&
      invocation.status !== 0 &&
      Object.keys(report.vulnerabilities ?? {}).length === 0
    ) {
      deps.error(
        `audit: npm audit exited ${invocation.status} while listing no vulnerabilities; refusing to treat a failed scan as clean`,
      );
      return 1;
    }
    deps.log("audit: no unexcepted HIGH/CRITICAL advisories");
    return 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deps.error(`audit: FAILED loudly — ${detail}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), defaultDeps());
}
