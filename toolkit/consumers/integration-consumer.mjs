/**
 * Node ESM installed-package lifecycle consumer for the packed `quaternits`
 * package (spec 001/D18, Phase 4).
 *
 * Run from a disposable directory that installed the packed tarball, never from
 * the repository sources, by `toolkit/scripts/consumer-test.sh --integration`.
 * Where the consumer smokes assert one action each, this fixture drives two
 * **compact complete-game lifecycles** through the installed public surface.
 *
 * 1. A validated four-active custom position
 *    (`docs/rules/multiplayer-adjudication.md` §4 Fixture 4a) is played into a
 *    real snapshot-batch mate that removes two controllers, the next active
 *    controller then loses on time, and the resulting winner is checked through
 *    the board, retained armies, controllers, statuses, history order, awards,
 *    selection, post-terminal rejection, the shipped schema subpath, a versioned
 *    V1 snapshot round trip, an atomic invalid load, both `undo()` steps and
 *    `reset()`.
 * 2. An **opening-to-terminal administrative match**
 *    (`docs/fixtures/opening-to-terminal-administrative-match.md`, the executable
 *    twin of the match in `src/quaternity.test.ts`) starts from the package's own
 *    reviewed opening position, plays one real public committed move per army,
 *    expires a pending draw offer inside White's next move and ends through the
 *    three `001/D45` freezes; the winner, the untouched board, the offer
 *    expiry/undo coupling, the V1 snapshot replay and `reset()` are asserted.
 *
 * Fixture 1 is deliberately a **lifecycle** fixture, not proof that the official
 * opening position can reach that custom position. Fixture 2 is deliberately
 * labelled an **administrative** match: its winner comes from a freeze, not from
 * a mate, so it is **not a proof of opening-to-mate** and claims no complete
 * engine. Neither fixture decides an outcome for the `[open]` checked-non-actor
 * edge (001/D39–001/D41, 001/D44): every action here is an ordinary legal move or
 * the 001/D45 administrative freeze. The packaging-level "no sources shipped"
 * checks stay in `consumer-test.sh`, which tars the same artifact this consumer
 * runs against.
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

// --- Opening-to-terminal administrative match ---------------------------------
//
// The reviewed opening position (001/D9) is played with one real committed move
// per army and then ended by the three 001/D45 freezes, so the winner is an
// administrative winner, not a mate.

/** Commit one documented match move after checking the public committable set. */
function commitDocumented(game, from, to, next) {
  assert.ok(
    game.moves().some((move) => move.from === from && move.to === to),
    `${from}-${to} must be publicly committable`,
  );
  const event = game.move({ from, to });
  assert.deepEqual(event.awards, []);
  assert.deepEqual(event.selection, { kind: "next", player: next });
}

const match = new Quaternity();
assert.equal(
  match.position().board.size,
  64,
  "the opening fixture has 64 pieces",
);
assert.equal(match.turn(), "white");
assert.deepEqual(match.outcome(), { kind: "in-progress" });

commitDocumented(match, "b4", "c2", "red");
commitDocumented(match, "d11", "b10", "black");
commitDocumented(match, "j9", "l10", "green");
commitDocumented(match, "i2", "g3", "white");

// White offers a draw and then moves: the offer expires inside that one move
// event, so a single undo() will restore it (001/D45 §1 O1).
assert.deepEqual(match.proposeDraw(), {
  kind: "draw-proposal",
  proposer: "white",
});
assert.deepEqual(match.pendingDraw(), { proposer: "white", acceptedBy: [] });
commitDocumented(match, "a1", "a2", "red");
assert.equal(match.pendingDraw(), null);

// The three interchangeable freezes, in clockwise order, leave White the lone
// active controller. No board square changes and no batch is applied.
assert.deepEqual(match.recordTimeLoss("red").selection, {
  kind: "next",
  player: "black",
});
assert.deepEqual(match.resign("black").selection, {
  kind: "next",
  player: "green",
});
assert.deepEqual(match.recordWalkover("green").selection, {
  kind: "winner",
  winner: "white",
});
assert.deepEqual(match.outcome(), { kind: "winner", winner: "white" });
assert.deepEqual(match.status(), {
  white: "active",
  red: "frozen",
  black: "frozen",
  green: "frozen",
});
assert.equal(
  match.position().board.size,
  64,
  "an administrative freeze touches no square",
);
assert.deepEqual(
  [...match.position().board.entries()]
    .filter(([, piece]) => piece.type === "king")
    .map(([square]) => square)
    .sort(),
  ["a12", "a2", "l1", "l12"],
  "every king, including the frozen ones, stays on the board",
);
assert.deepEqual(
  match.history().map((event) => event.kind),
  [
    "move",
    "move",
    "move",
    "move",
    "draw-proposal",
    "move",
    "freeze",
    "freeze",
    "freeze",
  ],
);

// Terminal atomicity: every board and administrative action is rejected and
// changes nothing (001/D35, 001/D45).
for (const action of [
  () => match.move({ from: "a1", to: "a2" }),
  () => match.pass(),
  () => match.moves(),
  () => match.proposeDraw(),
  () => match.resign("white"),
  () => match.recordTimeLoss("black"),
  () => match.recordWalkover("green"),
]) {
  assertAtomic(match, action, /the game is over/, "a terminal match action");
}
assert.deepEqual(match.outcome(), { kind: "winner", winner: "white" });

// The V1 snapshot replays the whole match into a fresh instance (001/D10).
const matchSnapshot = JSON.parse(JSON.stringify(match.snapshot()));
assert.deepEqual(matchSnapshot.actions, [
  { kind: "move", from: "b4", to: "c2", promotion: null },
  { kind: "move", from: "d11", to: "b10", promotion: null },
  { kind: "move", from: "j9", to: "l10", promotion: null },
  { kind: "move", from: "i2", to: "g3", promotion: null },
  { kind: "draw-proposal" },
  { kind: "move", from: "a1", to: "a2", promotion: null },
  { kind: "freeze", action: "time-loss", player: "red" },
  { kind: "freeze", action: "resign", player: "black" },
  { kind: "freeze", action: "walkover", player: "green" },
]);
const matchReplay = new Quaternity();
matchReplay.loadSnapshot(matchSnapshot);
assert.deepEqual(matchReplay.snapshot(), matchSnapshot);
assert.deepEqual(matchReplay.history(), match.history());
assert.deepEqual(matchReplay.outcome(), { kind: "winner", winner: "white" });

// One undo() per event: the three freezes, then the move that expired the offer,
// which restores the pending offer with its recorded votes (001/D45).
matchReplay.undo();
assert.deepEqual(matchReplay.outcome(), { kind: "in-progress" });
assert.equal(matchReplay.turn(), "green");
matchReplay.undo();
matchReplay.undo();
assert.equal(matchReplay.status().red, "active");
matchReplay.undo();
assert.deepEqual(matchReplay.pendingDraw(), {
  proposer: "white",
  acceptedBy: [],
});
assert.equal(matchReplay.turn(), "white");
assert.equal(matchReplay.position().board.get("a1")?.type, "king");
assert.equal(matchReplay.history().length, 5);
for (let remaining = 0; remaining < 5; remaining += 1) {
  matchReplay.undo();
}
assert.deepEqual(matchReplay.history(), []);
assert.equal(matchReplay.position().board.size, 64);
assert.deepEqual(matchReplay.outcome(), { kind: "in-progress" });

match.reset();
assert.equal(match.turn(), "white");
assert.equal(match.position().board.size, 64);
assert.equal(match.pendingDraw(), null);
assert.deepEqual(match.history(), []);
assert.deepEqual(match.outcome(), { kind: "in-progress" });
