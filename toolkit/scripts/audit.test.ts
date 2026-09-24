import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  advisoryId,
  collectAdvisories,
  evaluateAudit,
  loadExceptions,
  main,
  parseAuditReport,
  runAuditCommand,
  type AuditDeps,
} from "./audit.ts";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = path.join(REPO_ROOT, "toolkit/scripts/audit.ts");
const NOW = new Date("2030-01-01T00:00:00Z");

const CLEAN_REPORT = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
  },
});

function blockingReport(id = "GHSA-AAAA-BBBB-CCCC"): string {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      leftpad: {
        name: "leftpad",
        severity: "high",
        via: [
          "transitive-pkg",
          {
            source: 1,
            name: "leftpad",
            title: "Prototype pollution",
            url: `https://github.com/advisories/${id}`,
            severity: "high",
          },
        ],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
    },
  });
}

function lowOnlyReport(): string {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      minor: {
        name: "minor",
        severity: "low",
        via: [{ source: 9, severity: "low" }],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0 },
    },
  });
}

function makeDeps(
  files: Record<string, string>,
  overrides: Partial<AuditDeps> = {},
): AuditDeps {
  return {
    runNpmAudit: () => ({ stdout: "", status: 0 }),
    readText: (file) => {
      const text = files[file];
      if (text === undefined) {
        throw new Error(`missing test fixture for ${file}`);
      }
      return text;
    },
    log: () => {},
    error: () => {},
    now: () => NOW,
    exceptionsFile: "exceptions.json",
    ...overrides,
  };
}

test("advisoryId prefers the GHSA identifier from the advisory URL", () => {
  assert.equal(
    advisoryId({ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }),
    "GHSA-AAAA-BBBB-CCCC",
  );
});

test("advisoryId falls back to the numeric npm source", () => {
  assert.equal(advisoryId({ source: 1097 }), "npm:1097");
});

test("advisoryId falls back to the title", () => {
  assert.equal(
    advisoryId({ title: "Prototype pollution" }),
    "Prototype pollution",
  );
});

test("advisoryId returns 'unknown' when nothing identifies the advisory", () => {
  assert.equal(advisoryId({}), "unknown");
});

test("parseAuditReport accepts a real audit payload", () => {
  assert.ok(parseAuditReport(CLEAN_REPORT).metadata?.vulnerabilities);
});

test("parseAuditReport rejects non-JSON output loudly", () => {
  assert.throws(() => parseAuditReport("not json"), /did not return JSON/);
});

test("parseAuditReport rejects a non-object payload", () => {
  assert.throws(() => parseAuditReport("42"), /non-object payload/);
});

test("parseAuditReport rejects a null payload", () => {
  assert.throws(() => parseAuditReport("null"), /non-object payload/);
});

test("parseAuditReport rejects a missing vulnerability report with the reason", () => {
  assert.throws(
    () => parseAuditReport(JSON.stringify({ message: "ECONNREFUSED" })),
    /registry may be unreachable/,
  );
});

test("parseAuditReport rejects a metadata object without a vulnerabilities map", () => {
  assert.throws(
    () => parseAuditReport(JSON.stringify({ metadata: {} })),
    /no vulnerability report;/,
  );
});

test("parseAuditReport rejects a null vulnerability report without a reason", () => {
  assert.throws(
    () =>
      parseAuditReport(JSON.stringify({ metadata: { vulnerabilities: null } })),
    /no vulnerability report;/,
  );
});

test("parseAuditReport rejects metadata that counts HIGH but lists no advisory", () => {
  assert.throws(
    () =>
      parseAuditReport(
        JSON.stringify({
          metadata: { vulnerabilities: { high: 1, critical: 0 } },
          vulnerabilities: {},
        }),
      ),
    /contradictory/,
  );
});

test("parseAuditReport rejects metadata that counts CRITICAL with no map", () => {
  assert.throws(
    () =>
      parseAuditReport(
        JSON.stringify({
          metadata: { vulnerabilities: { high: 0, critical: 1 } },
        }),
      ),
    /contradictory/,
  );
});

test("loadExceptions parses a reviewed exception", () => {
  const exceptions = loadExceptions(
    JSON.stringify([
      {
        advisory: "GHSA-AAAA-BBBB-CCCC",
        reason: "not reachable",
        expires: "2999-01-01",
      },
    ]),
  );
  assert.equal(exceptions[0]?.reason, "not reachable");
});

test("loadExceptions accepts an empty list", () => {
  assert.deepEqual(loadExceptions("[]"), []);
});

test("loadExceptions rejects invalid JSON", () => {
  assert.throws(() => loadExceptions("{"), /not valid JSON/);
});

test("loadExceptions rejects a non-array document", () => {
  assert.throws(() => loadExceptions("{}"), /must be a JSON array/);
});

test("loadExceptions rejects a non-object entry", () => {
  assert.throws(() => loadExceptions("[1]"), /must be an object/);
});

test("loadExceptions rejects a null entry", () => {
  assert.throws(() => loadExceptions("[null]"), /must be an object/);
});

test("loadExceptions rejects a non-string field", () => {
  assert.throws(
    () =>
      loadExceptions(
        JSON.stringify([{ advisory: 1, reason: "x", expires: "2999-01-01" }]),
      ),
    /non-empty string "advisory"/,
  );
});

test("loadExceptions rejects a missing or empty field", () => {
  assert.throws(
    () =>
      loadExceptions(
        JSON.stringify([{ advisory: "X", reason: "", expires: "2999-01-01" }]),
      ),
    /non-empty string "reason"/,
  );
});

test("collectAdvisories extracts blocking advisories and skips transitive names", () => {
  const report = parseAuditReport(blockingReport());
  const advisories = collectAdvisories(report);
  assert.equal(advisories.length, 1);
  assert.equal(advisories[0]?.id, "GHSA-AAAA-BBBB-CCCC");
  assert.equal(advisories[0]?.package, "leftpad");
});

test("collectAdvisories falls back to the package severity and empty strings", () => {
  const report = parseAuditReport(
    JSON.stringify({
      vulnerabilities: {
        pkg: { name: "pkg", severity: "critical", via: [{ source: 5 }] },
      },
      metadata: { vulnerabilities: {} },
    }),
  );
  const [advisory] = collectAdvisories(report);
  assert.equal(advisory?.severity, "critical");
  assert.equal(advisory?.title, "");
  assert.equal(advisory?.url, "");
  assert.equal(advisory?.id, "npm:5");
});

test("collectAdvisories falls back to the vulnerability key as the package", () => {
  const report = parseAuditReport(
    JSON.stringify({
      vulnerabilities: {
        keyname: { severity: "high", via: [{ source: 6, severity: "high" }] },
      },
      metadata: { vulnerabilities: {} },
    }),
  );
  assert.equal(collectAdvisories(report)[0]?.package, "keyname");
});

test("collectAdvisories ignores an advisory with no severity anywhere", () => {
  const report = parseAuditReport(
    JSON.stringify({
      vulnerabilities: { pkg: { name: "pkg", via: [{ source: 8 }] } },
      metadata: { vulnerabilities: {} },
    }),
  );
  assert.deepEqual(collectAdvisories(report), []);
});

test("collectAdvisories ignores non-blocking severities", () => {
  const report = parseAuditReport(
    JSON.stringify({
      vulnerabilities: {
        x: {
          name: "x",
          severity: "low",
          via: [{ source: 2, severity: "low" }],
        },
      },
      metadata: { vulnerabilities: {} },
    }),
  );
  assert.deepEqual(collectAdvisories(report), []);
});

test("collectAdvisories de-duplicates the same advisory for one package", () => {
  const via = {
    source: 3,
    title: "dup",
    url: "https://github.com/advisories/GHSA-9999-8888-7777",
    severity: "critical",
  };
  const report = parseAuditReport(
    JSON.stringify({
      vulnerabilities: { pkg: { name: "pkg", via: [via, via] } },
      metadata: { vulnerabilities: {} },
    }),
  );
  assert.equal(collectAdvisories(report).length, 1);
});

test("collectAdvisories blocks a HIGH transitive via-string that names no advisory", () => {
  const report = parseAuditReport(
    JSON.stringify({
      vulnerabilities: { foo: { name: "foo", severity: "high", via: ["bar"] } },
      metadata: { vulnerabilities: { high: 1 } },
    }),
  );
  const advisories = collectAdvisories(report);
  assert.equal(advisories.length, 1);
  assert.equal(advisories[0]?.id, "unresolved:foo");
  assert.equal(advisories[0]?.package, "foo");
  assert.equal(advisories[0]?.severity, "high");
});

test("collectAdvisories does not double-count a via-string resolved by its package", () => {
  const report = parseAuditReport(
    JSON.stringify({
      vulnerabilities: {
        foo: { name: "foo", severity: "high", via: ["bar"] },
        bar: {
          name: "bar",
          severity: "high",
          via: [
            {
              source: 1,
              severity: "high",
              url: "https://github.com/advisories/GHSA-AAAA-BBBB-CCCC",
            },
          ],
        },
      },
      metadata: { vulnerabilities: { high: 2 } },
    }),
  );
  const advisories = collectAdvisories(report);
  assert.equal(advisories.length, 1);
  assert.equal(advisories[0]?.id, "GHSA-AAAA-BBBB-CCCC");
  assert.equal(advisories[0]?.package, "bar");
});

test("collectAdvisories tolerates a report with no vulnerabilities", () => {
  const report = parseAuditReport(
    JSON.stringify({ metadata: { vulnerabilities: {} } }),
  );
  assert.deepEqual(collectAdvisories(report), []);
});

test("collectAdvisories blocks a blocking severity that names no advisory at all", () => {
  const noVia = parseAuditReport(
    JSON.stringify({
      vulnerabilities: { pkg: { name: "pkg", severity: "high" } },
      metadata: { vulnerabilities: { high: 1 } },
    }),
  );
  const [advisory] = collectAdvisories(noVia);
  assert.equal(advisory?.id, "unresolved:pkg");
  assert.equal(advisory?.package, "pkg");
  assert.equal(advisory?.severity, "high");
});

test("evaluateAudit passes a clean report", () => {
  const evaluation = evaluateAudit(parseAuditReport(CLEAN_REPORT), [], NOW);
  assert.equal(evaluation.ok, true);
  assert.deepEqual(evaluation.blocking, []);
});

test("evaluateAudit blocks an unexcepted advisory", () => {
  const evaluation = evaluateAudit(parseAuditReport(blockingReport()), [], NOW);
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.blocking.length, 1);
});

test("evaluateAudit blocks an advisory whose exception matches neither id nor URL", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(blockingReport()),
    [{ advisory: "GHSA-ZZZZ-ZZZZ-ZZZZ", reason: "n/a", expires: "2999-01-01" }],
    NOW,
  );
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.blocking.length, 1);
});

test("evaluateAudit blocks an advisory with no URL and a non-matching exception", () => {
  const report = parseAuditReport(
    JSON.stringify({
      vulnerabilities: {
        pkg: {
          name: "pkg",
          severity: "high",
          via: [{ source: 7, severity: "high" }],
        },
      },
      metadata: { vulnerabilities: {} },
    }),
  );
  const evaluation = evaluateAudit(
    report,
    [{ advisory: "GHSA-ZZZZ-ZZZZ-ZZZZ", reason: "n/a", expires: "2999-01-01" }],
    NOW,
  );
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.blocking.length, 1);
});

test("evaluateAudit accepts a matching, unexpired exception", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(blockingReport()),
    [
      {
        advisory: "GHSA-AAAA-BBBB-CCCC",
        reason: "not reachable",
        expires: "2999-01-01",
      },
    ],
    NOW,
  );
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.excepted.length, 1);
});

test("evaluateAudit accepts an exception matched by advisory URL", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(blockingReport()),
    [
      {
        advisory: "https://github.com/advisories/GHSA-AAAA-BBBB-CCCC",
        reason: "not reachable",
        expires: "2999-01-01",
      },
    ],
    NOW,
  );
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.excepted.length, 1);
});

test("evaluateAudit rejects an expired exception", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(blockingReport()),
    [
      {
        advisory: "GHSA-AAAA-BBBB-CCCC",
        reason: "not reachable",
        expires: "2000-01-01",
      },
    ],
    NOW,
  );
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.expired.length, 1);
});

test("evaluateAudit rejects an invalid expiry date", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(blockingReport()),
    [
      {
        advisory: "GHSA-AAAA-BBBB-CCCC",
        reason: "not reachable",
        expires: "soon",
      },
    ],
    NOW,
  );
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.expired.length, 1);
});

test("evaluateAudit rejects a blank reason", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(blockingReport()),
    [{ advisory: "GHSA-AAAA-BBBB-CCCC", reason: "   ", expires: "2999-01-01" }],
    NOW,
  );
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.expired.length, 1);
});

test("evaluateAudit rejects an expired exception even with no matching advisory", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(CLEAN_REPORT),
    [
      {
        advisory: "GHSA-XXXX-YYYY-ZZZZ",
        reason: "temp",
        expires: "2020-01-01",
      },
    ],
    new Date("2026-09-23T00:00:00Z"),
  );
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.expired.length, 1);
  assert.equal(evaluation.expired[0]?.advisory, undefined);
});

test("evaluateAudit rejects an invalid expiry even with no matching advisory", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(CLEAN_REPORT),
    [
      {
        advisory: "GHSA-XXXX-YYYY-ZZZZ",
        reason: "temp",
        expires: "not-a-date",
      },
    ],
    new Date("2026-09-23T00:00:00Z"),
  );
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.expired.length, 1);
});

test("evaluateAudit rejects a blank reason even with no matching advisory", () => {
  const evaluation = evaluateAudit(
    parseAuditReport(CLEAN_REPORT),
    [
      {
        advisory: "GHSA-XXXX-YYYY-ZZZZ",
        reason: "   ",
        expires: "2999-01-01",
      },
    ],
    new Date("2026-09-23T00:00:00Z"),
  );
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.expired.length, 1);
});

test("main passes a clean audit", () => {
  const logs: string[] = [];
  const code = main(
    ["--report", "audit.json"],
    makeDeps(
      { "audit.json": CLEAN_REPORT, "exceptions.json": "[]" },
      { log: (m) => logs.push(m) },
    ),
  );
  assert.equal(code, 0);
  assert.match(logs.join("\n"), /no unexcepted HIGH\/CRITICAL advisories/);
});

test("main fails a blocked audit", () => {
  const errors: string[] = [];
  const code = main(
    ["--report", "audit.json"],
    makeDeps(
      { "audit.json": blockingReport(), "exceptions.json": "[]" },
      { error: (m) => errors.push(m) },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /FAILED/);
});

test("main reports an excepted advisory", () => {
  const logs: string[] = [];
  const code = main(
    ["--report", "audit.json"],
    makeDeps(
      {
        "audit.json": blockingReport(),
        "exceptions.json": JSON.stringify([
          {
            advisory: "GHSA-AAAA-BBBB-CCCC",
            reason: "not reachable",
            expires: "2999-01-01",
          },
        ]),
      },
      { log: (m) => logs.push(m) },
    ),
  );
  assert.equal(code, 0);
  assert.match(logs.join("\n"), /excepted GHSA-AAAA-BBBB-CCCC/);
});

test("main reports an expired exception", () => {
  const errors: string[] = [];
  const code = main(
    ["--report", "audit.json"],
    makeDeps(
      {
        "audit.json": blockingReport(),
        "exceptions.json": JSON.stringify([
          {
            advisory: "GHSA-AAAA-BBBB-CCCC",
            reason: "not reachable",
            expires: "2000-01-01",
          },
        ]),
      },
      { error: (m) => errors.push(m) },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /expired 2000-01-01/);
});

test("main fails a clean audit with an expired exception for an absent advisory", () => {
  const errors: string[] = [];
  const code = main(
    ["--report", "audit.json"],
    makeDeps(
      {
        "audit.json": CLEAN_REPORT,
        "exceptions.json": JSON.stringify([
          {
            advisory: "GHSA-ZZZZ-ZZZZ-ZZZZ",
            reason: "temp",
            expires: "2020-01-01",
          },
        ]),
      },
      { error: (m) => errors.push(m) },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /expired 2020-01-01/);
});

test("main requires a path after --report", () => {
  const errors: string[] = [];
  const code = main(
    ["--report"],
    makeDeps({}, { error: (m) => errors.push(m) }),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /--report requires a path/);
});

test("main fails loudly on an unusable report", () => {
  const errors: string[] = [];
  const code = main(
    ["--report", "audit.json"],
    makeDeps(
      { "audit.json": "not json", "exceptions.json": "[]" },
      { error: (m) => errors.push(m) },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /FAILED loudly/);
});

test("main fails loudly on metadata that counts HIGH but lists none", () => {
  const errors: string[] = [];
  const code = main(
    ["--report", "audit.json"],
    makeDeps(
      {
        "audit.json": JSON.stringify({
          metadata: { vulnerabilities: { high: 1, critical: 0 } },
          vulnerabilities: {},
        }),
        "exceptions.json": "[]",
      },
      { error: (m) => errors.push(m) },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /FAILED loudly/);
});

test("main reports a non-Error failure loudly", () => {
  const errors: string[] = [];
  const code = main(
    ["--report", "audit.json"],
    makeDeps(
      {},
      {
        readText: () => {
          throw "boom";
        },
        error: (m) => errors.push(m),
      },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /FAILED loudly — boom/);
});

test("main invokes npm when no report is supplied", () => {
  let invoked = 0;
  const code = main(
    [],
    makeDeps(
      { "exceptions.json": "[]" },
      {
        runNpmAudit: () => {
          invoked += 1;
          return { stdout: CLEAN_REPORT, status: 0 };
        },
      },
    ),
  );
  assert.equal(code, 0);
  assert.equal(invoked, 1);
});

test("main fails when npm exits nonzero but lists no vulnerabilities", () => {
  const errors: string[] = [];
  const code = main(
    [],
    makeDeps(
      { "exceptions.json": "[]" },
      {
        runNpmAudit: () => ({ stdout: CLEAN_REPORT, status: 1 }),
        error: (m) => errors.push(m),
      },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /exited 1/);
});

test("main fails when npm exits nonzero over a report with no vulnerability map", () => {
  const errors: string[] = [];
  const code = main(
    [],
    makeDeps(
      { "exceptions.json": "[]" },
      {
        runNpmAudit: () => ({
          stdout: JSON.stringify({ metadata: { vulnerabilities: {} } }),
          status: 1,
        }),
        error: (m) => errors.push(m),
      },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /exited 1/);
});

test("main passes when npm exits nonzero with only non-blocking advisories", () => {
  const logs: string[] = [];
  const code = main(
    [],
    makeDeps(
      { "exceptions.json": "[]" },
      {
        runNpmAudit: () => ({ stdout: lowOnlyReport(), status: 1 }),
        log: (m) => logs.push(m),
      },
    ),
  );
  assert.equal(code, 0);
  assert.match(logs.join("\n"), /no unexcepted HIGH\/CRITICAL advisories/);
});

test("main blocks when npm exits nonzero with real advisories", () => {
  const errors: string[] = [];
  const code = main(
    [],
    makeDeps(
      { "exceptions.json": "[]" },
      {
        runNpmAudit: () => ({ stdout: blockingReport(), status: 1 }),
        error: (m) => errors.push(m),
      },
    ),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /FAILED — blocking HIGH\/CRITICAL/);
});

test("runAuditCommand returns stdout and the exit status", () => {
  const result = runAuditCommand(
    process.execPath,
    ["-e", "process.stdout.write('ok')"],
    REPO_ROOT,
  );
  assert.equal(result.stdout, "ok");
  assert.equal(result.status, 0);
});

test("runAuditCommand reports a nonzero status", () => {
  const result = runAuditCommand(
    process.execPath,
    ["-e", "process.stdout.write('bad'); process.exit(3)"],
    REPO_ROOT,
  );
  assert.equal(result.stdout, "bad");
  assert.equal(result.status, 3);
});

test("runAuditCommand reports a signal termination as a nonzero status", () => {
  const result = runAuditCommand(
    process.execPath,
    ["-e", "process.kill(process.pid, 'SIGKILL')"],
    REPO_ROOT,
  );
  assert.notEqual(result.status, 0);
});

test("runAuditCommand fails loudly when the command cannot start", () => {
  assert.throws(
    () => runAuditCommand("quaternits-no-such-binary", [], REPO_ROOT),
    /failed to run/,
  );
});

test("the CLI passes a clean report file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-audit-"));
  try {
    const report = path.join(dir, "audit.json");
    writeFileSync(report, CLEAN_REPORT);
    const result = spawnSync(process.execPath, [SCRIPT, "--report", report], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI fails on a blocked report file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-audit-"));
  try {
    const report = path.join(dir, "audit.json");
    writeFileSync(report, blockingReport());
    const result = spawnSync(process.execPath, [SCRIPT, "--report", report], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAILED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI runs npm and exits cleanly through defaultDeps", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-fake-npm-"));
  try {
    const fakeNpm = path.join(dir, "npm");
    writeFileSync(fakeNpm, `#!/bin/sh\ncat <<'JSON'\n${CLEAN_REPORT}\nJSON\n`);
    chmodSync(fakeNpm, 0o755);
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
