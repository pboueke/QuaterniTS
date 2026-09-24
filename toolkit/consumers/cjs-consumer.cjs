/**
 * Node CommonJS consumer smoke for the packed `quaternits` package.
 *
 * Run from a disposable directory that installed the packed tarball, never from
 * the repository sources, by `toolkit/scripts/consumer-test.sh`. It asserts the
 * `require` condition resolves to the built CJS entry point (marked CommonJS by
 * the nested `dist/cjs/package.json`), exercises the reviewed opening position
 * and a validated custom position, checks atomic rejection by the guarded
 * committed-move seam (spec 001/D18), and round-trips the versioned V1 JSON
 * snapshot through the shipped export map and the strict loader (spec 001/D10).
 */
"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const {
  Quaternity,
  UnresolvedAdjudicationError,
  createPosition,
} = require("quaternits");

const packageRoot = path.join(__dirname, "node_modules", "quaternits");
const entry = require.resolve("quaternits");
assert.equal(
  entry,
  path.join(packageRoot, "dist", "cjs", "index.js"),
  "CommonJS `require` must resolve to the built dist/cjs entry point",
);
assert.ok(
  !existsSync(path.join(packageRoot, "src")),
  "the packed package must not ship sources, so no source-only fallback exists",
);
assert.equal(typeof UnresolvedAdjudicationError, "function");

// Reviewed 64-piece opening position (001/D9/001/D24).
const game = new Quaternity();
assert.equal(game.turn(), "white");
assert.equal(game.position().board.size, 64);
assert.ok(
  game.moves().length > 0,
  "the opening position has committable moves",
);
assert.deepEqual(game.outcome(), { kind: "in-progress" });

const move = game.move({ from: "d4", to: "d5" });
assert.equal(move.kind, "move");
assert.equal(game.history().length, 1);
assert.equal(game.position().board.get("d5").army, "white");
assert.equal(game.position().board.has("d4"), false);

// The guarded move seam rejects an illegal move without changing the position.
assert.throws(() => game.move({ from: "d4", to: "d7" }), /is not a legal move/);
assert.equal(game.history().length, 1);
assert.equal(game.position().board.get("d5").army, "white");

game.undo();
assert.equal(game.history().length, 0);
assert.equal(game.position().board.has("d4"), true);

// Validated custom position: one white king and rook, the three other kings.
const custom = createPosition({
  pieces: [
    { square: "a1", army: "white", type: "king" },
    { square: "e1", army: "white", type: "rook" },
    { square: "a12", army: "red", type: "king" },
    { square: "l12", army: "black", type: "king" },
    { square: "l1", army: "green", type: "king" },
  ],
  controllers: { white: "white", red: "red", black: "black", green: "green" },
  players: { white: "active", red: "active", black: "active", green: "active" },
  turn: "white",
});
const customGame = new Quaternity(custom);
assert.deepEqual(
  customGame.attackers("e2", "white").map((attacker) => attacker.square),
  ["e1"],
);
assert.equal(customGame.isAttacked("e2", "white"), true);
assert.equal(customGame.inCheck("white"), false);
assert.ok(
  customGame
    .moves()
    .some((candidate) => candidate.from === "e1" && candidate.to === "e12"),
  "the custom rook can slide up the e-file",
);

// Versioned V1 JSON snapshot, the shipped schema export and the strict loader
// (spec 001/D10/D15) through the packaged public surface.
const schemaFile =
  require.resolve("quaternits/schema/quaternits-snapshot-v1.schema.json");
assert.equal(
  schemaFile,
  path.join(packageRoot, "schema", "quaternits-snapshot-v1.schema.json"),
  "the schema export must resolve to the shipped JSON Schema",
);
const schema = JSON.parse(readFileSync(schemaFile, "utf8"));
assert.equal(
  schema.$schema,
  "https://json-schema.org/draft/2020-12/schema",
  "the shipped contract must be a strict draft 2020-12 schema",
);

const snapshotGame = new Quaternity();
snapshotGame.move({ from: "d4", to: "d5" });
const snapshot = snapshotGame.snapshot();
assert.equal(snapshot.version, 1);
assert.deepEqual(snapshot.actions, [
  { kind: "move", from: "d4", to: "d5", promotion: null },
]);
const reloaded = new Quaternity();
reloaded.loadSnapshot(JSON.parse(JSON.stringify(snapshot)));
assert.deepEqual(reloaded.snapshot(), snapshot);
assert.deepEqual(reloaded.outcome(), snapshotGame.outcome());

// The loader replays the actions and never trusts a serialized result.
const tampered = JSON.parse(JSON.stringify(snapshot));
tampered.state.outcome = { kind: "draw" };
assert.throws(() => reloaded.loadSnapshot(tampered), /does not match/);
assert.deepEqual(reloaded.snapshot(), snapshot);
