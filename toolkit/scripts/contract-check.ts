/**
 * Contract gate between the runtime snapshot contract and the shipped JSON
 * Schema (spec 001/D10/D15, Phase 4).
 *
 * It answers one question: do the shipped schema, the runtime serializer/loader
 * and the committed fixtures still agree? Five real checks:
 *
 * 1. **Schema self-checks.** The file must be valid draft 2020-12 JSON Schema
 *    with an `$id`, and every object shape that declares `properties` must also
 *    set `additionalProperties: false`. The subtrees of `if`/`then`/`else` are
 *    partial constraints rather than object shapes, so they are exempt. A
 *    loosened schema fails here instead of quietly accepting more documents.
 * 2. **Runtime documents.** Snapshots built by driving the public `Quaternity`
 *    API must be accepted by the schema, accepted by `loadSnapshot` and survive
 *    the round trip byte-for-byte, so the shipped schema describes the documents
 *    the library really writes.
 * 3. **`toolkit/contract/valid/*.json`.** Committed runtime documents (opening,
 *    cascade mate, promotion, pawn commitment, pass, pending/agreed draw, freeze
 *    sequence, lone-active winner) must satisfy the same three properties. A
 *    serializer change that drifts from the committed documents fails here.
 * 4. **`toolkit/contract/invalid/*.json`.** Documents the schema must reject and
 *    which `loadSnapshot` must also reject, so a shape-invalid document can never
 *    reach the runtime loader through the schema.
 * 5. **`toolkit/contract/drift/*.json`.** Documents the schema accepts but the
 *    runtime rejects because they are semantically broken (duplicate square,
 *    missing king, illegal action, duplicate or stale vote, tampered award or
 *    state, unresolved position). This is the drift sentinel: if the schema starts
 *    accepting less or the runtime starts accepting more, the gate fails and the
 *    fixture must be reviewed rather than silently drifting.
 *
 * Accepting a document is never weaker than the runtime: schema acceptance means
 * the *shape* is valid only. `Quaternity.loadSnapshot` stays the authority on
 * legality, awards, the once-per-vote rules and the fail-closed `[open]` edge.
 *
 * `--schema <path>` validates a different schema file; it exists so the gate's
 * own tests can point at a deliberately broken schema without editing the repo.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

import { Quaternity } from "../../src/index.ts";

/** The shipped schema this gate checks the runtime against. */
export const SCHEMA_FILE = fileURLToPath(
  new URL("../../schema/quaternits-snapshot-v1.schema.json", import.meta.url),
);

/** The fixture root: `valid/`, `invalid/` and `drift/` documents. */
export const CONTRACT_DIR = fileURLToPath(
  new URL("../contract", import.meta.url),
);

/** The only schema dialect this gate accepts. */
export const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/** A contract problem: a schema that cannot be trusted or a fixture mismatch. */
export class ContractCheckError extends Error {}

type JsonObject = Record<string, unknown>;

/** One named snapshot document. */
export interface ContractDocument {
  readonly name: string;
  readonly value: unknown;
}

/** A compiled schema: the acceptance predicate and its error detail. */
export interface CompiledSchema {
  readonly accepts: (value: unknown) => boolean;
  readonly detail: () => string;
}

/** Injectable process boundaries, so the gate's own tests need no real files. */
export interface ContractCheckDeps {
  readonly readText: (file: string) => string;
  readonly listJson: (dir: string) => readonly string[];
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The real filesystem and stream boundaries. */
export function defaultDeps(): ContractCheckDeps {
  return {
    readText: (file) => readFileSync(file, "utf8"),
    listJson: (dir) =>
      readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => path.join(dir, name)),
    log: (text) => {
      process.stdout.write(`${text}\n`);
    },
    error: (text) => {
      process.stderr.write(`${text}\n`);
    },
  };
}

/** The command-line schema override, or the shipped schema path. */
export function schemaFileOf(argv: readonly string[]): string {
  const flag = argv.indexOf("--schema");
  return flag === -1 ? SCHEMA_FILE : (argv[flag + 1] as string);
}

/**
 * Parse and self-check a schema document: valid JSON object, draft 2020-12, an
 * `$id`, and `additionalProperties: false` on every object that declares
 * `properties`. Any violation throws {@link ContractCheckError}.
 */
export function parseSchema(text: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ContractCheckError(
      `the schema is not valid JSON: ${message(error)}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ContractCheckError("the schema is not a JSON object");
  }
  const schema = parsed as JsonObject;
  if (schema.$schema !== SCHEMA_DIALECT) {
    throw new ContractCheckError(
      `the schema dialect is ${JSON.stringify(schema.$schema)}; expected ${SCHEMA_DIALECT}`,
    );
  }
  if (typeof schema.$id !== "string") {
    throw new ContractCheckError("the schema has no string $id");
  }
  assertStrictObjects(schema, "schema", false);
  return schema;
}

/** The schema keywords whose subtree is a partial constraint, not an object shape. */
const CONDITION_KEYWORDS: readonly string[] = ["if", "then", "else"];

/**
 * Reject any schema object shape that declares `properties` without
 * `additionalProperties: false`. A subtree under `if`, `then` or `else` states a
 * partial constraint on an instance another branch already shapes, so adding
 * `additionalProperties: false` there would wrongly reject the other keys; those
 * subtrees are therefore exempt from the shape rule.
 */
export function assertStrictObjects(
  node: unknown,
  at: string,
  insideCondition: boolean,
): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => {
      assertStrictObjects(entry, `${at}[${index}]`, insideCondition);
    });
    return;
  }
  if (node === null || typeof node !== "object") {
    return;
  }
  const record = node as JsonObject;
  if (
    record.properties !== undefined &&
    !insideCondition &&
    record.additionalProperties !== false
  ) {
    throw new ContractCheckError(
      `${at} declares properties without additionalProperties: false`,
    );
  }
  for (const [key, value] of Object.entries(record)) {
    assertStrictObjects(
      value,
      `${at}.${key}`,
      CONDITION_KEYWORDS.includes(key),
    );
  }
}

/** Compile a checked schema with Ajv in strict mode. */
export function compileSchema(schema: JsonObject): CompiledSchema {
  const ajv = new Ajv2020({ strict: true, allErrors: false });
  const validate: ValidateFunction = ajv.compile(schema);
  return {
    accepts: (value) => validate(value),
    detail: () => ajv.errorsText(validate.errors),
  };
}

/** The runtime document set: snapshots built from the public API only. */
export function runtimeDocuments(): readonly ContractDocument[] {
  return [
    { name: "opening", value: new Quaternity().snapshot() },
    { name: "after-opening-ply", value: openingAfterFirstPly().snapshot() },
    { name: "after-draw-offer", value: afterDrawOffer().snapshot() },
    { name: "after-freeze", value: afterFreeze().snapshot() },
    { name: "lone-active-winner", value: loneActiveWinner().snapshot() },
    { name: "after-undo", value: afterUndo().snapshot() },
  ];
}

/** The reviewed opening position after the deterministic first ply `a1–a2`. */
function openingAfterFirstPly(): Quaternity {
  const game = new Quaternity();
  game.move({ from: "a1", to: "a2" });
  return game;
}

/** A pending offer with one recorded acceptance. */
function afterDrawOffer(): Quaternity {
  const game = new Quaternity();
  game.proposeDraw();
  game.respondToDraw("red", true);
  return game;
}

/** An off-turn administrative freeze. */
function afterFreeze(): Quaternity {
  const game = new Quaternity();
  game.recordTimeLoss("green");
  return game;
}

/** Three freezes that leave White the lone active controller. */
function loneActiveWinner(): Quaternity {
  const game = new Quaternity();
  game.resign("red");
  game.recordWalkover("black");
  game.recordTimeLoss("green");
  return game;
}

/** A two-event log reduced to one event by `undo`. */
function afterUndo(): Quaternity {
  const game = new Quaternity();
  game.move({ from: "a1", to: "a2" });
  game.proposeDraw();
  game.undo();
  return game;
}

/** The rejection message when `loadSnapshot` refuses `value`, else `undefined`. */
export function rejectionOf(value: unknown): string | undefined {
  try {
    new Quaternity().loadSnapshot(value);
    return undefined;
  } catch (error) {
    return message(error);
  }
}

/**
 * The problem with a runtime-written or committed-valid document, or
 * `undefined` when the schema accepts it, `loadSnapshot` accepts it and the
 * reloaded snapshot is byte-identical to the document.
 */
export function roundTripProblem(
  schema: CompiledSchema,
  name: string,
  value: unknown,
): string | undefined {
  if (!schema.accepts(value)) {
    return `the schema rejects the document ${name}: ${schema.detail()}`;
  }
  const rejection = rejectionOf(value);
  if (rejection !== undefined) {
    return `the loader rejects the document ${name}: ${rejection}`;
  }
  const reloaded = new Quaternity();
  reloaded.loadSnapshot(value);
  if (JSON.stringify(reloaded.snapshot()) !== JSON.stringify(value)) {
    return `the document ${name} is not canonical: reloading it yields a different document`;
  }
  return undefined;
}

/** The problem with an invalid fixture, or `undefined` when both gates reject it. */
export function invalidFixtureProblem(
  schema: CompiledSchema,
  name: string,
  value: unknown,
): string | undefined {
  if (schema.accepts(value)) {
    return `the schema accepts the invalid fixture ${name}; the schema is too loose`;
  }
  if (rejectionOf(value) === undefined) {
    return `the loader accepts the invalid fixture ${name}; the loader is too loose`;
  }
  return undefined;
}

/** The problem with a drift fixture, or `undefined` when only the loader rejects it. */
export function driftFixtureProblem(
  schema: CompiledSchema,
  name: string,
  value: unknown,
): string | undefined {
  if (!schema.accepts(value)) {
    return `the schema rejects the drift fixture ${name}; a drift fixture must stay shape-valid`;
  }
  if (rejectionOf(value) === undefined) {
    return `the loader accepts the drift fixture ${name}; the runtime validator is too loose`;
  }
  return undefined;
}

/** One category's fixtures, failing loudly when a category is empty. */
function readFixtures(
  deps: ContractCheckDeps,
  category: string,
): readonly ContractDocument[] {
  const dir = path.join(CONTRACT_DIR, category);
  const files = deps.listJson(dir);
  if (files.length === 0) {
    throw new ContractCheckError(
      `no ${category} fixtures under ${dir}; an empty fixture set would pass falsely`,
    );
  }
  return files.map((file) => ({
    name: path.basename(file),
    value: JSON.parse(deps.readText(file)) as unknown,
  }));
}

function report(deps: ContractCheckDeps, problem: string): number {
  deps.error(`contract-check: FAILED — ${problem}`);
  return 1;
}

/**
 * Run every check and return the process exit code: `0` when the schema, the
 * runtime documents and every fixture agree, `1` with a loud reason otherwise.
 */
export function runContractCheck(
  deps: ContractCheckDeps,
  argv: readonly string[] = [],
): number {
  try {
    const schema = compileSchema(
      parseSchema(deps.readText(schemaFileOf(argv))),
    );
    const runtime = runtimeDocuments();
    for (const document of runtime) {
      const problem = roundTripProblem(schema, document.name, document.value);
      if (problem !== undefined) {
        return report(deps, problem);
      }
    }
    const valid = readFixtures(deps, "valid");
    for (const fixture of valid) {
      const problem = roundTripProblem(schema, fixture.name, fixture.value);
      if (problem !== undefined) {
        return report(deps, problem);
      }
    }
    const invalid = readFixtures(deps, "invalid");
    for (const fixture of invalid) {
      const problem = invalidFixtureProblem(
        schema,
        fixture.name,
        fixture.value,
      );
      if (problem !== undefined) {
        return report(deps, problem);
      }
    }
    const drift = readFixtures(deps, "drift");
    for (const fixture of drift) {
      const problem = driftFixtureProblem(schema, fixture.name, fixture.value);
      if (problem !== undefined) {
        return report(deps, problem);
      }
    }
    deps.log(
      `contract-check: OK (${runtime.length} runtime documents, ${valid.length} valid, ${invalid.length} invalid and ${drift.length} drift fixtures against ${path.basename(schemaFileOf(argv))})`,
    );
    return 0;
  } catch (error) {
    deps.error(`contract-check: FAILED loudly — ${message(error)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = runContractCheck(defaultDeps(), process.argv.slice(2));
}
