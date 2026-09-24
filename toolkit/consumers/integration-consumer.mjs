/**
 * Node ESM installed-package lifecycle consumer for the packed `quaternits`
 * package (spec 001/D18, Phase 4).
 *
 * Run from a disposable directory that installed the packed tarball, never from
 * the repository sources, by `toolkit/scripts/consumer-test.sh --integration`.
 * Where the consumer smokes assert one action each, this fixture drives one
 * **compact complete-game lifecycle** through the installed public surface:
 * a validated four-active custom position (`docs/rules/multiplayer-adjudication.md`
 * §4 Fixture 4a) is played into a real snapshot-batch mate that removes two
 * controllers, the next active controller then loses on time, and the resulting
 * winner is checked through the board, retained armies, controllers, statuses,
 * history order, awards, selection, post-terminal rejection, the shipped schema
 * subpath, a versioned V1 snapshot round trip, an atomic invalid load, both
 * `undo()` steps and `reset()`.
 *
 * This is deliberately a **lifecycle** fixture, not proof that the official
 * opening position can reach this custom position, and it decides no outcome for
 * the `[open]` checked-non-actor edge (001/D39–001/D41, 001/D44): every action
 * here is an ordinary legal move or the 001/D45 administrative freeze. The
 * packaging-level "no sources shipped" checks stay in `consumer-test.sh`, which
 * tars the same artifact this consumer runs against.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Quaternity, createPosition } from "quaternits";

const consumerRoot = import.meta.dirname;
const packageRoot = path.join(consumerRoot, "node_modules", "quaternits");

const entry = fileURLToPath(import.meta.resolve("quaternits"));
assert.equal(
  entry,
  path.join(packageRoot, "dist", "esm", "index.js"),
  "the lifecycle consumer must run against the built dist/esm entry point",
);
assert.ok(
  !existsSync(path.join(packageRoot, "src")),
  "the packed package must not ship sources, so no source-only fallback exists",
);

/**
 * `docs/rules/multiplayer-adjudication.md` §4 Fixture 4a: four active corner-army
 * kings, four White knights and the White `f1` rook, White on turn.
 */
const fixture4a = createPosition({
  pieces: [
    { square: "e1", army: "white", type: "king" },
    { square: "f1", army: "white", type: "rook" },
    { square: "c10", army: "white", type: "knight" },
    { square: "d10", army: "white", type: "knight" },
    { square: "i10", army: "white", type: "knight" },
    { square: "j10", army: "white", type: "knight" },
    { square: "a12", army: "red", type: "king" },
    { square: "l12", army: "black", type: "king" },
    { square: "g6", army: "green", type: "king" },
  ],
  controllers: { white: "white", red: "red", black: "black", green: "green" },
  players: { white: "active", red: "active", black: "active", green: "active" },
  turn: "white",
});

/** The whole readable state of a game, for the atomicity checks. */
function stateKey(game) {
  return JSON.stringify(game.snapshot());
}

/** Every rejection must leave the instance exactly as it was. */
function assertAtomic(game, act, expected, description) {
  const before = stateKey(game);
  assert.throws(act, expected, description);
  assert.equal(stateKey(game), before, `${description}: state changed`);
}

const game = new Quaternity(fixture4a);
assert.equal(game.turn(), "white");
assert.equal(game.position().board.size, 9);
assert.deepEqual(game.status(), {
  white: "active",
  red: "active",
  black: "active",
  green: "active",
});
assert.deepEqual(game.outcome(), { kind: "in-progress" });
assert.equal(game.history().length, 0);

// One real committed board move: `f1–f12` checks both corner kings at once, so
// the §4 snapshot batch mates Red and Black and credits both awards to White.
const mate = game.move({ from: "f1", to: "f12" });
assert.deepEqual(mate.awards, [
  { kingId: "red", army: "red", to: "white" },
  { kingId: "black", army: "black", to: "white" },
]);
assert.deepEqual(mate.selection, { kind: "next", player: "green" });
assert.equal(game.turn(), "green");
assert.equal(game.position().board.has("a12"), false);
assert.equal(game.position().board.has("l12"), false);
assert.equal(game.position().board.size, 7);
assert.equal(game.position().board.get("f12")?.army, "white");
assert.equal(game.position().board.get("g6")?.army, "green");
assert.deepEqual(game.status(), {
  white: "active",
  red: "eliminated",
  black: "eliminated",
  green: "active",
});
// Both mated armies transfer to the actor; a piece keeps its own army colour.
assert.deepEqual(game.position().controllers, {
  white: "white",
  red: "white",
  black: "white",
  green: "green",
});
assert.deepEqual(game.outcome(), { kind: "in-progress" });

// The next active controller loses on time (001/D45 freeze action), leaving one
// active controller: the game is over and White has won.
const freeze = game.recordTimeLoss("green");
assert.deepEqual(freeze.selection, { kind: "winner", winner: "white" });
assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
assert.deepEqual(game.status(), {
  white: "active",
  red: "eliminated",
  black: "eliminated",
  green: "frozen",
});
assert.equal(game.turn(), "white");
assert.equal(
  game.position().board.get("g6")?.army,
  "green",
  "the frozen king stays on the board with its army colour",
);
assert.equal(game.position().board.size, 7);

// History order, recorded awards and selection.
assert.deepEqual(
  game.history().map((event) => event.kind),
  ["move", "freeze"],
);
assert.deepEqual(game.history()[0]?.awards, [
  { kingId: "red", army: "red", to: "white" },
  { kingId: "black", army: "black", to: "white" },
]);
assert.deepEqual(game.history()[0]?.selection, {
  kind: "next",
  player: "green",
});
assert.deepEqual(game.history()[1]?.selection, {
  kind: "winner",
  winner: "white",
});
assert.equal(game.history()[1]?.action, "time-loss");

// Post-terminal actions are rejected atomically (001/D35, 001/D45).
assertAtomic(
  game,
  () => game.move({ from: "e1", to: "e2" }),
  /the game is over/,
  "a move after the win",
);
assertAtomic(
  game,
  () => game.proposeDraw(),
  /the game is over/,
  "a draw proposal after the win",
);
assertAtomic(
  game,
  () => game.recordTimeLoss("white"),
  /the game is over/,
  "a freeze after the win",
);
assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });

// The shipped JSON Schema subpath resolves from the installed package.
const schemaFile = fileURLToPath(
  import.meta.resolve("quaternits/schema/quaternits-snapshot-v1.schema.json"),
);
assert.equal(
  schemaFile,
  path.join(packageRoot, "schema", "quaternits-snapshot-v1.schema.json"),
  "the schema export must resolve to the shipped JSON Schema",
);
const schema = JSON.parse(readFileSync(schemaFile, "utf8"));
assert.equal(schema.$id, "urn:quaternits:schema:snapshot:v1");
assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");

// Versioned V1 snapshot: the whole lifecycle replays into a fresh instance.
const snapshot = JSON.parse(JSON.stringify(game.snapshot()));
assert.equal(snapshot.version, 1);
assert.deepEqual(snapshot.actions, [
  { kind: "move", from: "f1", to: "f12", promotion: null },
  { kind: "freeze", action: "time-loss", player: "green" },
]);
assert.deepEqual(snapshot.state.outcome, { kind: "winner", winner: "white" });
assert.deepEqual(snapshot.state.position.players, {
  white: "active",
  red: "eliminated",
  black: "eliminated",
  green: "frozen",
});
const reloaded = new Quaternity();
reloaded.loadSnapshot(snapshot);
assert.deepEqual(reloaded.snapshot(), snapshot);
assert.deepEqual(reloaded.outcome(), { kind: "winner", winner: "white" });
assert.deepEqual(reloaded.history(), game.history());
assert.deepEqual(reloaded.status(), game.status());

// An invalid document is rejected atomically and the loader never trusts the
// serialized state (001/D10).
const tampered = JSON.parse(JSON.stringify(snapshot));
tampered.state.outcome = { kind: "draw" };
assertAtomic(
  reloaded,
  () => reloaded.loadSnapshot(tampered),
  /does not match/,
  "a tampered outcome load",
);
const unsupported = JSON.parse(JSON.stringify(snapshot));
unsupported.version = 2;
assertAtomic(
  reloaded,
  () => reloaded.loadSnapshot(unsupported),
  /not supported/,
  "an unsupported version load",
);

// Undo the last event (the freeze) and then the first event (the mate).
reloaded.undo();
assert.deepEqual(reloaded.outcome(), { kind: "in-progress" });
assert.equal(reloaded.turn(), "green");
assert.deepEqual(reloaded.status(), {
  white: "active",
  red: "eliminated",
  black: "eliminated",
  green: "active",
});
assert.deepEqual(
  reloaded.history().map((event) => event.kind),
  ["move"],
);
assert.equal(reloaded.position().board.size, 7);

reloaded.undo();
assert.deepEqual(reloaded.outcome(), { kind: "in-progress" });
assert.equal(reloaded.turn(), "white");
assert.deepEqual(reloaded.status(), {
  white: "active",
  red: "active",
  black: "active",
  green: "active",
});
assert.deepEqual(reloaded.position().controllers, {
  white: "white",
  red: "red",
  black: "black",
  green: "green",
});
assert.equal(reloaded.position().board.size, 9);
assert.equal(reloaded.position().board.get("f1")?.army, "white");
assert.equal(reloaded.position().board.has("f12"), false);
assert.deepEqual(reloaded.history(), []);

reloaded.reset();
assert.equal(reloaded.turn(), "white");
assert.equal(reloaded.position().board.size, 64);
assert.deepEqual(reloaded.status(), {
  white: "active",
  red: "active",
  black: "active",
  green: "active",
});
assert.deepEqual(reloaded.outcome(), { kind: "in-progress" });
assert.deepEqual(reloaded.history(), []);
