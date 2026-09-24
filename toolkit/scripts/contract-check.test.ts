/**
 * Tests for the snapshot contract gate (`./contract-check.ts`).
 *
 * The gate's job is to prove the shipped schema, the runtime serializer/loader
 * and the committed fixtures still agree, so these tests check both directions:
 * the real gate really passes over the repository's schema and fixtures, and
 * every failure mode reports loudly instead of passing falsely. The injected
 * dependencies are the same test seams the audit and version gates use, so a
 * broken schema, an empty fixture directory, a non-canonical document and a
 * loosened validator are all exercised without touching the repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Quaternity } from "../../src/index.ts";
import {
  CONTRACT_DIR,
  ContractCheckError,
  SCHEMA_DIALECT,
  SCHEMA_FILE,
  assertStrictObjects,
  compileSchema,
  defaultDeps,
  driftFixtureProblem,
  invalidFixtureProblem,
  parseSchema,
  rejectionOf,
  roundTripProblem,
  runContractCheck,
  runtimeDocuments,
  schemaFileOf,
  type CompiledSchema,
  type ContractCheckDeps,
} from "./contract-check.ts";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = path.join(REPO_ROOT, "toolkit/scripts/contract-check.ts");
const SCHEMA_TEXT = defaultDeps().readText(SCHEMA_FILE);

/** A compiled schema that rejects every document. */
const REJECT_ALL: CompiledSchema = {
  accepts: () => false,
  detail: () => "synthetic rejection",
};

interface Capture {
  readonly deps: ContractCheckDeps;
  readonly logs: string[];
  readonly errors: string[];
}

type Json = Record<string, unknown>;

function captureDeps(): Capture {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    deps: {
      ...defaultDeps(),
      log: (text) => logs.push(text),
      error: (text) => errors.push(text),
    },
    logs,
    errors,
  };
}

/** Dependencies over an in-memory file map, keyed by absolute path. */
function fakeDeps(
  files: Readonly<Record<string, string>>,
  capture: Capture,
): ContractCheckDeps {
  return {
    readText: (file) => {
      const text = files[file];
      if (text === undefined) {
        throw new Error(`fake file is missing: ${file}`);
      }
      return text;
    },
    listJson: (dir) =>
      Object.keys(files).filter((file) => file.startsWith(`${dir}/`)),
    log: (text) => capture.logs.push(text),
    error: (text) => capture.errors.push(text),
  };
}

function fixturePath(category: string, name: string): string {
  return path.join(CONTRACT_DIR, category, name);
}

function fixtureText(category: string, name: string): Json {
  return JSON.parse(
    defaultDeps().readText(fixturePath(category, name)),
  ) as Json;
}

/** A minimal, strict draft 2020-12 schema that accepts any object. */
const ACCEPT_OBJECT_SCHEMA = JSON.stringify({
  $schema: SCHEMA_DIALECT,
  $id: "urn:test:accept-object",
  type: "object",
});

test("the shipped schema compiles and accepts a runtime document", () => {
  const schema = parseSchema(SCHEMA_TEXT);
  assert.equal(schema.$schema, SCHEMA_DIALECT);
  assert.equal(schema.$id, "urn:quaternits:schema:snapshot:v1");
  const compiled = compileSchema(schema);
  for (const document of runtimeDocuments()) {
    assert.equal(compiled.accepts(document.value), true, document.name);
  }
});

test("runtimeDocuments covers the supported action surface", () => {
  const documents = runtimeDocuments();
  assert.deepEqual(
    documents.map((document) => document.name),
    [
      "opening",
      "after-opening-ply",
      "after-draw-offer",
      "after-freeze",
      "lone-active-winner",
      "after-undo",
    ],
  );
  for (const document of documents) {
    assert.equal(typeof document.value, "object");
  }
});

test("parseSchema rejects a schema that cannot be trusted", () => {
  assert.throws(() => parseSchema("{"), ContractCheckError);
  assert.throws(() => parseSchema("[]"), ContractCheckError);
  assert.throws(
    () =>
      parseSchema(
        JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#" }),
      ),
    /dialect/,
  );
  assert.throws(
    () => parseSchema(JSON.stringify({ $schema: SCHEMA_DIALECT })),
    /\$id/,
  );
  assert.throws(
    () =>
      parseSchema(
        JSON.stringify({
          $schema: SCHEMA_DIALECT,
          $id: "urn:test:loose",
          type: "object",
          properties: { kind: { type: "string" } },
        }),
      ),
    /additionalProperties/,
  );
});

test("assertStrictObjects accepts a strict subschema and rejects a loose one", () => {
  assertStrictObjects(
    {
      $defs: {
        strict: {
          type: "object",
          properties: { kind: { const: "move" } },
          additionalProperties: false,
        },
      },
      allOf: [
        {
          if: { properties: { type: { const: "pawn" } } },
          then: {
            properties: { state: { type: "object" } },
            additionalProperties: false,
          },
        },
      ],
    },
    "schema",
    false,
  );
  assert.throws(
    () =>
      assertStrictObjects(
        { type: "object", properties: { kind: {} } },
        "schema",
        false,
      ),
    /additionalProperties/,
  );
  assert.throws(
    () => assertStrictObjects([{ properties: { kind: {} } }], "schema", false),
    /additionalProperties/,
  );
});

test("the gate passes over the shipped schema and every committed fixture", () => {
  const capture = captureDeps();
  assert.equal(runContractCheck(capture.deps), 0);
  assert.deepEqual(capture.errors, []);
  assert.equal(capture.logs.length, 1);
  assert.match(capture.logs[0] ?? "", /^contract-check: OK \(/);
  assert.match(capture.logs[0] ?? "", /6 runtime documents/);
  assert.match(capture.logs[0] ?? "", /13 valid/);
  assert.match(capture.logs[0] ?? "", /15 invalid/);
  assert.match(capture.logs[0] ?? "", /8 drift fixtures/);
  assert.match(capture.logs[0] ?? "", /quaternits-snapshot-v1\.schema\.json/);
});

test("the gate fails loudly on a broken or unreadable schema", () => {
  const capture = captureDeps();
  assert.equal(
    runContractCheck({
      ...capture.deps,
      readText: () => {
        throw "registry is offline";
      },
    }),
    1,
  );
  assert.match(capture.errors[0] ?? "", /FAILED loudly — registry is offline/);

  const second = captureDeps();
  const broken = JSON.stringify({
    $schema: SCHEMA_DIALECT,
    $id: "urn:test:reject-all",
    type: "null",
  });
  const files = { [SCHEMA_FILE]: broken };
  assert.equal(
    runContractCheck(fakeDeps(files, second)),
    1,
    "a schema that rejects the runtime documents must fail the gate",
  );
  assert.match(second.errors[0] ?? "", /schema rejects the document opening/);
});

test("the gate fails on an empty fixture directory instead of passing falsely", () => {
  const capture = captureDeps();
  const deps = fakeDeps({ [SCHEMA_FILE]: SCHEMA_TEXT }, capture);
  assert.equal(runContractCheck(deps), 1);
  assert.match(capture.errors[0] ?? "", /no valid fixtures under/);
});

test("the gate fails when a valid fixture is rejected or not canonical", () => {
  const rejected = captureDeps();
  assert.equal(
    runContractCheck(
      fakeDeps(
        {
          [SCHEMA_FILE]: SCHEMA_TEXT,
          [fixturePath("valid", "unresolved.json")]: defaultDeps().readText(
            fixturePath("drift", "unresolved-position.json"),
          ),
          [fixturePath("invalid", "a.json")]: "{",
          [fixturePath("drift", "a.json")]: "{}",
        },
        rejected,
      ),
    ),
    1,
  );
  assert.match(rejected.errors[0] ?? "", /the loader rejects the document/);

  const notCanonical = captureDeps();
  const document = new Quaternity().snapshot();
  const pieces = [...document.initial.pieces].reverse();
  const nonCanonical = JSON.stringify({
    ...document,
    initial: { ...document.initial, pieces },
  });
  assert.equal(
    runContractCheck(
      fakeDeps(
        {
          [SCHEMA_FILE]: SCHEMA_TEXT,
          [fixturePath("valid", "reversed.json")]: nonCanonical,
          [fixturePath("invalid", "a.json")]: "{",
          [fixturePath("drift", "a.json")]: "{}",
        },
        notCanonical,
      ),
    ),
    1,
  );
  assert.match(notCanonical.errors[0] ?? "", /is not canonical/);
});

test("the gate fails when a schema accepts an invalid fixture", () => {
  const capture = captureDeps();
  assert.equal(
    runContractCheck(
      fakeDeps(
        {
          [SCHEMA_FILE]: ACCEPT_OBJECT_SCHEMA,
          [fixturePath("valid", "opening.json")]: JSON.stringify(
            new Quaternity().snapshot(),
          ),
          [fixturePath("invalid", "unknown.json")]: JSON.stringify({
            kind: "surprise",
          }),
          [fixturePath("drift", "a.json")]: "{}",
        },
        capture,
      ),
    ),
    1,
  );
  assert.match(
    capture.errors[0] ?? "",
    /the schema accepts the invalid fixture/,
  );
});

test("the gate fails when a drift fixture stops drifting", () => {
  const capture = captureDeps();
  const validOpening = JSON.stringify(new Quaternity().snapshot());
  assert.equal(
    runContractCheck(
      fakeDeps(
        {
          [SCHEMA_FILE]: SCHEMA_TEXT,
          [fixturePath("valid", "opening.json")]: validOpening,
          [fixturePath("invalid", "unknown.json")]: JSON.stringify({
            kind: "surprise",
          }),
          [fixturePath("drift", "not-drift.json")]: validOpening,
        },
        capture,
      ),
    ),
    1,
  );
  assert.match(capture.errors[0] ?? "", /the loader accepts the drift fixture/);
});

test("the gate accepts --schema and the shipped schema path by default", () => {
  assert.equal(schemaFileOf([]), SCHEMA_FILE);
  assert.equal(
    schemaFileOf(["--schema", "/tmp/other.json"]),
    "/tmp/other.json",
  );

  const capture = captureDeps();
  const rejected = JSON.stringify({
    $schema: SCHEMA_DIALECT,
    $id: "urn:test:reject-all",
    type: "null",
  });
  const files = { "/tmp/other.json": rejected };
  assert.equal(
    runContractCheck(fakeDeps(files, capture), ["--schema", "/tmp/other.json"]),
    1,
  );
  assert.match(capture.errors[0] ?? "", /schema rejects the document opening/);
});

test("roundTripProblem reports a rejected, unloadable or non-canonical document", () => {
  const document = new Quaternity().snapshot();
  assert.equal(
    roundTripProblem(REJECT_ALL, "opening", document),
    "the schema rejects the document opening: synthetic rejection",
  );
  assert.match(
    roundTripProblem(compileSchema(parseSchema(SCHEMA_TEXT)), "drift", {
      ...document,
      initial: fixtureText("drift", "unresolved-position.json").initial,
    }) ?? "",
    /the loader rejects the document drift/,
  );
  assert.match(
    roundTripProblem(compileSchema(parseSchema(SCHEMA_TEXT)), "reversed", {
      ...document,
      initial: {
        ...document.initial,
        pieces: [...document.initial.pieces].reverse(),
      },
    }) ?? "",
    /is not canonical/,
  );
  assert.equal(
    roundTripProblem(
      compileSchema(parseSchema(SCHEMA_TEXT)),
      "opening",
      document,
    ),
    undefined,
  );
});

test("invalidFixtureProblem and driftFixtureProblem report a loosened gate", () => {
  const document = new Quaternity().snapshot();
  const compiled = compileSchema(parseSchema(SCHEMA_TEXT));
  const invalid = fixtureText("invalid", "unsupported-version.json");
  const drift = fixtureText("drift", "mismatched-state-turn.json");

  assert.match(
    invalidFixtureProblem(
      compileSchema(parseSchema(SCHEMA_TEXT)),
      "x",
      document,
    ) ?? "",
    /the schema accepts the invalid fixture x/,
  );
  assert.match(
    invalidFixtureProblem(REJECT_ALL, "x", document) ?? "",
    /the loader accepts the invalid fixture x/,
  );
  assert.equal(invalidFixtureProblem(compiled, "invalid", invalid), undefined);
  assert.equal(driftFixtureProblem(compiled, "drift", drift), undefined);
  assert.match(
    driftFixtureProblem(compiled, "invalid", invalid) ?? "",
    /the schema rejects the drift fixture invalid/,
  );
  assert.match(
    driftFixtureProblem(compiled, "opening", document) ?? "",
    /the loader accepts the drift fixture opening/,
  );
});

test("rejectionOf reports the loader's rejection and accepts a valid document", () => {
  assert.equal(rejectionOf(new Quaternity().snapshot()), undefined);
  assert.match(
    rejectionOf(fixtureText("invalid", "bad-square.json")) ?? "",
    /loadSnapshot/,
  );
});

test("defaultDeps reads a file and lists only JSON files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-contract-deps-"));
  try {
    writeFileSync(path.join(dir, "b.json"), "{}");
    writeFileSync(path.join(dir, "a.json"), "{}");
    writeFileSync(path.join(dir, "notes.txt"), "ignored");
    const deps = defaultDeps();
    assert.deepEqual(deps.listJson(dir), [
      path.join(dir, "a.json"),
      path.join(dir, "b.json"),
    ]);
    assert.equal(deps.readText(path.join(dir, "notes.txt")), "ignored");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the contract-check command exits 0 over the repository", () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /contract-check: OK \(/);
});

test("the contract-check command fails loudly on a bad schema", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-contract-cli-"));
  try {
    const schema = path.join(dir, "broken.json");
    writeFileSync(schema, JSON.stringify({ type: "object" }));
    const result = spawnSync(process.execPath, [SCRIPT, "--schema", schema], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /contract-check: FAILED loudly/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
