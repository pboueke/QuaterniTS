/**
 * The versioned V1 JSON snapshot, its coordinate action log and the strict
 * `loadSnapshot` loader (spec 001/D10/D15) as executable tests.
 *
 * Scope and provenance:
 *
 * - `snapshot()` serializes the replay origin, the coordinate actions, the
 *   canonical event records and the resulting state. `loadSnapshot(value)`
 *   **replays the actions against a fresh instance** and adopts the result only
 *   after the replayed state and event records agree with the serialized ones,
 *   so no serialized result is ever trusted as authority.
 * - The coordinate fixtures are `docs/rules/multiplayer-adjudication.md` §4
 *   Fixture 4a and 4b (simultaneous and cascade mate awards, 001/D30/001/D32),
 *   §5 Fixture 5a (`[policy]` pass), §6 Fixture 6 (draw offer/consent) and the
 *   P4 base of `docs/rules/administrative-actions.md` §1–§2 (001/D45). The
 *   custom promotion position, the P/Q witness position of
 *   `docs/rules/d38-coordinate-search.md` §2 and the `[open]`-edge sibling
 *   position are constructed coordinates used only to exercise the approved
 *   promotion and fail-closed load paths; they decide no game outcome.
 * - Every rejection asserts atomicity: the loaded instance keeps its position,
 *   history, pending offer and outcome.
 * - The shipped JSON Schema and the `make contract-check` gate validate the same
 *   documents against `schema/quaternits-snapshot-v1.schema.json`; this file
 *   pins the runtime contract the schema must accept.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Quaternity,
  SNAPSHOT_VERSION,
  UnresolvedAdjudicationError,
  createPosition,
  type PlacedEntry,
  type Position,
  type PositionInput,
} from "./index.ts";
import { ARMY_COLORS, type ArmyColor, type Square } from "./board.ts";
import { defaultPosition, type PlayerStatus } from "./position.ts";
import { serializePosition } from "./snapshot.ts";

const ALL_ACTIVE: Readonly<Record<ArmyColor, PlayerStatus>> = {
  white: "active",
  red: "active",
  black: "active",
  green: "active",
};
const IDENTITY_CONTROLLERS: Readonly<Record<ArmyColor, ArmyColor>> = {
  white: "white",
  red: "red",
  black: "black",
  green: "green",
};

function position(
  pieces: readonly PlacedEntry[],
  turn: ArmyColor,
  players: Readonly<Record<ArmyColor, PlayerStatus>> = ALL_ACTIVE,
): Position {
  return createPosition({
    pieces,
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...players },
    turn,
  });
}

function king(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "king" };
}
function rook(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "rook" };
}
function knight(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "knight" };
}
function bishop(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "bishop" };
}
function upPawn(square: Square, army: ArmyColor): PlacedEntry {
  return {
    square,
    army,
    type: "pawn",
    state: { kind: "ordinary", direction: "up" },
  };
}

/** Board occupancy with pawn state, for comparing two positions by pieces only. */
function boardKey(current: Position): string {
  return [...current.board.entries()]
    .map(([square, placed]) => `${square}:${JSON.stringify(placed)}`)
    .sort()
    .join(" ");
}

/** The whole readable state of a game, for an atomicity check across a call. */
function stateKey(game: Quaternity): string {
  const current = game.position();
  return [
    boardKey(current),
    `turn=${current.turn}`,
    ARMY_COLORS.map((player) => `${player}:${current.players[player]}`).join(
      ",",
    ),
    `history=${game.history().length}`,
    `offer=${JSON.stringify(game.pendingDraw())}`,
    `outcome=${JSON.stringify(game.outcome())}`,
  ].join(" ");
}

/** §4 Fixture 4a: one White action mates the Red `a12` and Black `l12` kings. */
function fixture4a(): Position {
  return position(
    [
      king("e1", "white"),
      rook("f1", "white"),
      knight("c10", "white"),
      knight("d10", "white"),
      knight("i10", "white"),
      knight("j10", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("g6", "green"),
    ],
    "white",
  );
}

/** §4 Fixture 4b: the White cascade `c5–d3` mates Red and then Black. */
function fixture4b(): Position {
  return position(
    [
      king("e6", "white"),
      rook("a1", "white"),
      knight("b3", "white"),
      knight("c5", "white"),
      knight("d4", "white"),
      knight("j4", "white"),
      knight("k4", "white"),
      king("b1", "red"),
      king("l1", "black"),
      king("g6", "green"),
    ],
    "white",
  );
}

/** §5 Fixture 5a: four active players and a White king stalemated at `a1`. */
function fixture5a(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
      rook("b5", "black"),
      rook("c2", "black"),
    ],
    "white",
  );
}

/** `administrative-actions.md` §1 P4: four active corner kings, White on turn. */
function p4(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    "white",
  );
}

/** A White advanced central pawn on the main diagonal (001/D28). */
function advancedWhite(square: Square): PlacedEntry {
  return {
    square,
    army: "white",
    type: "pawn",
    state: {
      kind: "advanced",
      vertical: "up",
      horizontal: "right",
      committed: undefined,
    },
  };
}

/**
 * `pawn-vectors.md` §5: the White side capture `d4×e3` commits the advanced pawn
 * to the direction "right" from its landing square `e3` (001/D28, 001/D29), so a
 * snapshot carries a committed advanced pawn state.
 */
function committingCapture(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
      advancedWhite("d4"),
      knight("e3", "green"),
    ],
    "white",
  );
}

/** A White advanced-edge pawn with the promoting move `a11–a12` (001/D28). */
function promotingWhite(): Position {
  return position(
    [
      king("e1", "white"),
      rook("a1", "white"),
      upPawn("a11", "white"),
      king("l12", "black"),
      king("b6", "red"),
      king("g6", "green"),
    ],
    "white",
  );
}

/**
 * The P/Q witness position of `docs/rules/d38-coordinate-search.md` §2: Red is
 * on turn, checked, with a nonempty internal set and no public committable move,
 * so it is the 001/D40(3) unresolved state (never a game outcome).
 */
function witnessQ(): Position {
  return position(
    [
      king("h7", "white"),
      rook("a12", "white"),
      rook("l1", "white"),
      knight("c3", "white"),
      knight("c4", "white"),
      knight("d8", "white"),
      king("a1", "red"),
      bishop("a9", "red"),
      knight("b5", "red"),
      king("a6", "black"),
      king("j6", "green"),
    ],
    "red",
  );
}

/**
 * The `docs/rules/d38-coordinate-search.md` §2 predecessor P': the White move
 * `a11–a12` reaches the unchecked unresolved sibling through play, so a game can
 * hold an unresolved state its constructor never accepted (001/D41).
 */
function siblingPredecessor(): Position {
  return position(
    [
      king("h7", "white"),
      rook("a11", "white"),
      knight("c3", "white"),
      knight("c4", "white"),
      knight("d8", "white"),
      king("a1", "red"),
      bishop("a9", "red"),
      king("a6", "black"),
      king("j6", "green"),
    ],
    "white",
  );
}

/** A mutable JSON view of a snapshot document, for tampering in the tests. */
type Json = Record<string, unknown>;

function clone(value: unknown): Json {
  return structuredClone(value) as Json;
}
function at(value: unknown, key: string): Json {
  return (value as Json)[key] as Json;
}
function list(value: unknown): Json[] {
  return value as Json[];
}
function put(target: unknown, key: string, value: unknown): void {
  (target as Json)[key] = value;
}
function remove(target: unknown, key: string): void {
  delete (target as Json)[key];
}

/** A snapshot document as a plain, mutable JSON value (the wire form). */
function json(game: Quaternity): Json {
  return clone(JSON.parse(JSON.stringify(game.snapshot())) as unknown);
}

/** A fresh instance loaded from `value`, for the round-trip assertions. */
function loadedFrom(value: unknown): Quaternity {
  const game = new Quaternity();
  game.loadSnapshot(value);
  return game;
}

/** Every rejection must leave the target instance exactly as it was. */
function assertAtomic(
  game: Quaternity,
  act: () => void,
  expected?: RegExp | (new (message: string) => Error),
  description = "the rejected load",
): void {
  const before = stateKey(game);
  const snapshotBefore = JSON.stringify(game.snapshot());
  if (expected === undefined) {
    assert.throws(act, Error, description);
  } else {
    assert.throws(act, expected, description);
  }
  assert.equal(stateKey(game), before);
  assert.equal(JSON.stringify(game.snapshot()), snapshotBefore);
}

/** A committed game whose log holds several event kinds, for load tests. */
function multiEventGame(): Quaternity {
  const game = new Quaternity(p4());
  game.proposeDraw();
  game.respondToDraw("black", true);
  game.move({ from: "a1", to: "a2" });
  game.recordTimeLoss("green");
  return game;
}

test("a fresh game snapshots the opening position with no actions and no log", () => {
  const game = new Quaternity();
  const snapshot = game.snapshot();

  assert.equal(SNAPSHOT_VERSION, 1);
  assert.equal(snapshot.version, SNAPSHOT_VERSION);
  assert.deepEqual(snapshot.actions, []);
  assert.deepEqual(snapshot.log, []);
  assert.deepEqual(snapshot.initial, snapshot.state.position);
  assert.equal(snapshot.state.pendingDraw, null);
  assert.equal(snapshot.state.drawAgreed, false);
  assert.deepEqual(snapshot.state.outcome, { kind: "in-progress" });

  const opening = defaultPosition();
  assert.equal(snapshot.state.position.pieces.length, 64);
  assert.equal(snapshot.state.position.turn, "white");
  assert.deepEqual(snapshot.state.position.controllers, opening.controllers);
  assert.deepEqual(snapshot.state.position.players, opening.players);

  const squares = snapshot.state.position.pieces.map((piece) => piece.square);
  assert.deepEqual(
    squares,
    [...squares].sort(
      (left, right) =>
        left.charCodeAt(0) - right.charCodeAt(0) ||
        Number(left.slice(1)) - Number(right.slice(1)),
    ),
  );
  const advanced = snapshot.state.position.pieces.find(
    (piece) => piece.state?.kind === "advanced",
  );
  assert.ok(advanced !== undefined);
  assert.ok(advanced.state?.kind === "advanced");
  assert.equal(advanced.state.committed, null);
  const kingPiece = snapshot.state.position.pieces.find(
    (piece) => piece.type === "king",
  );
  assert.equal(kingPiece?.state, null);

  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test("§4 Fixture 4a: a snapshot replays the simultaneous mate awards", () => {
  const game = new Quaternity(fixture4a());
  const before = boardKey(game.position());
  game.move({ from: "f1", to: "f12" });
  const snapshot = game.snapshot();

  assert.deepEqual(snapshot.actions, [
    { kind: "move", from: "f1", to: "f12", promotion: null },
  ]);
  assert.equal(snapshot.log[0]?.kind, "move");
  assert.deepEqual(
    list(at(snapshot.log[0], "awards")).map((award) => award.kingId),
    ["red", "black"],
  );
  assert.deepEqual(at(snapshot.log[0], "selection"), {
    kind: "next",
    player: "green",
  });
  assert.deepEqual(snapshot.state.position.players, {
    white: "active",
    red: "eliminated",
    black: "eliminated",
    green: "active",
  });

  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot(), snapshot);
  assert.deepEqual(loaded.history(), game.history());
  assert.equal(stateKey(loaded), stateKey(game));

  loaded.undo();
  assert.equal(boardKey(loaded.position()), before);
  assert.equal(loaded.turn(), "white");
  assert.deepEqual(loaded.history(), []);
  assert.deepEqual(loaded.outcome(), { kind: "in-progress" });
});

test("§4 Fixture 4b: a snapshot records a cascade mate in one action", () => {
  const game = new Quaternity(fixture4b());
  game.move({ from: "c5", to: "d3" });
  const snapshot = game.snapshot();

  assert.deepEqual(
    list(at(snapshot.log[0], "awards")).map((award) => award.army),
    ["red", "black"],
  );
  assert.equal(game.turn(), "green");
  assert.deepEqual(loadedFrom(json(game)).snapshot(), snapshot);
  assert.equal(loadedFrom(json(game)).history()[0]?.kind, "move");
});

test("§5 Fixture 5a: a pass snapshot replays the board-less pass", () => {
  const game = new Quaternity(fixture5a());
  const before = boardKey(game.position());
  game.pass();
  const snapshot = game.snapshot();

  assert.deepEqual(snapshot.actions, [{ kind: "pass" }]);
  assert.deepEqual(snapshot.log[0], {
    kind: "pass",
    player: "white",
    selection: { kind: "next", player: "red" },
  });

  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot(), snapshot);
  assert.equal(loaded.turn(), "red");
  assert.equal(boardKey(loaded.position()), before);
  loaded.undo();
  assert.equal(loaded.turn(), "white");
});

test("§6 Fixture 6: a pending offer and its votes survive a load, and one undo restores them", () => {
  const game = new Quaternity(p4());
  game.proposeDraw();
  game.respondToDraw("black", true);
  const snapshot = game.snapshot();

  assert.deepEqual(snapshot.state.pendingDraw, {
    proposer: "white",
    acceptedBy: ["black"],
  });
  assert.deepEqual(snapshot.actions, [
    { kind: "draw-proposal" },
    { kind: "draw-response", player: "black", accept: true },
  ]);

  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["black"],
  });
  assert.deepEqual(loaded.snapshot(), snapshot);

  loaded.move({ from: "a1", to: "a2" });
  assert.equal(loaded.pendingDraw(), null);
  loaded.undo();
  assert.deepEqual(loaded.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["black"],
  });
});

test("§6: an agreed draw survives a load and stays terminal", () => {
  const game = new Quaternity(p4());
  game.proposeDraw();
  for (const voter of ["red", "black", "green"] as const) {
    game.respondToDraw(voter, true);
  }
  const snapshot = game.snapshot();

  assert.equal(snapshot.state.drawAgreed, true);
  assert.deepEqual(snapshot.state.pendingDraw, null);
  assert.deepEqual(snapshot.state.outcome, { kind: "draw" });
  assert.equal(snapshot.actions.length, 4);

  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot(), snapshot);
  assert.deepEqual(loaded.outcome(), { kind: "draw" });
  assert.throws(() => loaded.move({ from: "a1", to: "a2" }), /game is over/);
  assert.throws(() => loaded.proposeDraw(), /game is over/);
  loaded.undo();
  assert.deepEqual(loaded.outcome(), { kind: "in-progress" });
  assert.deepEqual(loaded.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["red", "black"],
  });
});

test("§2 F1/F2: freeze snapshots keep the board, the statuses and the turn", () => {
  const game = new Quaternity(p4());
  const before = boardKey(game.position());
  game.resign("white");
  game.recordTimeLoss("black");
  const snapshot = game.snapshot();

  assert.deepEqual(snapshot.actions, [
    { kind: "freeze", action: "resign", player: "white" },
    { kind: "freeze", action: "time-loss", player: "black" },
  ]);
  assert.deepEqual(snapshot.state.position.players, {
    white: "frozen",
    red: "active",
    black: "frozen",
    green: "active",
  });
  assert.equal(snapshot.state.position.turn, "red");

  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot(), snapshot);
  assert.equal(boardKey(loaded.position()), before);
  assert.deepEqual(loaded.status(), game.status());
  loaded.undo();
  assert.equal(loaded.turn(), "red");
  assert.equal(loaded.status().black, "active");
});

test("§1 O3: a freeze expiry folded into its event survives the load with its undo", () => {
  const game = new Quaternity(p4());
  game.proposeDraw();
  game.respondToDraw("black", true);
  game.resign("black");
  const snapshot = game.snapshot();

  assert.equal(snapshot.state.pendingDraw, null);
  assert.equal(snapshot.log[2]?.kind, "freeze");

  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot(), snapshot);
  loaded.undo();
  assert.equal(loaded.status().black, "active");
  assert.deepEqual(loaded.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["black"],
  });
  const withoutFreeze = new Quaternity(p4());
  withoutFreeze.proposeDraw();
  withoutFreeze.respondToDraw("black", true);
  assert.deepEqual(loaded.snapshot(), withoutFreeze.snapshot());
});

test("custom pawn promotion: a snapshot records the explicit choice and the transition", () => {
  const game = new Quaternity(promotingWhite());
  game.move({ from: "a11", to: "a12", promotion: "queen" });
  const snapshot = game.snapshot();

  assert.deepEqual(snapshot.actions, [
    { kind: "move", from: "a11", to: "a12", promotion: "queen" },
  ]);
  assert.equal(at(snapshot.log[0], "promotes"), true);
  assert.equal(at(snapshot.log[0], "promotion"), "queen");
  assert.deepEqual(at(at(snapshot.log[0], "pawn"), "before"), {
    kind: "ordinary",
    direction: "up",
  });
  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot(), snapshot);
  assert.deepEqual(
    [...loaded.position().board.entries()].find(([square]) => square === "a12"),
    ["a12", { army: "white", type: "queen" }],
  );
  loaded.undo();
  assert.deepEqual(loaded.snapshot().actions, []);
});

test("§5 pawn commitment: a snapshot records a committed advanced pawn state", () => {
  const game = new Quaternity(committingCapture());
  game.move({ from: "d4", to: "e3" });
  const snapshot = game.snapshot();

  assert.deepEqual(at(at(snapshot.log[0], "pawn"), "after"), {
    kind: "advanced",
    vertical: "up",
    horizontal: "right",
    committed: "right",
  });
  const committed = snapshot.state.position.pieces.find(
    (piece) => piece.square === "e3",
  );
  assert.ok(committed !== undefined);
  assert.ok(committed.state?.kind === "advanced");
  assert.equal(committed.state.committed, "right");

  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot(), snapshot);
  assert.deepEqual(
    loaded.position().board.get("e3")?.type === "pawn"
      ? loaded.position().board.get("e3")
      : undefined,
    {
      army: "white",
      type: "pawn",
      state: {
        kind: "advanced",
        vertical: "up",
        horizontal: "right",
        committed: "right",
      },
    },
  );
});

test("a snapshot is a frozen JSON value that holds no reference into the game", () => {
  const game = new Quaternity(fixture5a());
  game.pass();
  const snapshot = game.snapshot();
  const first = JSON.stringify(snapshot);

  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.state.position.pieces));
  assert.ok(Object.isFrozen(snapshot.log[0]));
  assert.throws(() => put(snapshot.state, "drawAgreed", true), TypeError);
  assert.throws(() => list(snapshot.actions).push({ kind: "pass" }), TypeError);
  assert.throws(
    () => put(snapshot.state.pendingDraw, "proposer", "red"),
    TypeError,
  );

  assert.equal(JSON.stringify(game.snapshot()), first);
  assert.equal(game.history().length, 1);
  assert.equal(game.turn(), "red");
});

test("loadSnapshot replaces the instance state from a plain JSON document", () => {
  const source = multiEventGame();
  const target = new Quaternity();
  const document = json(source);
  const documentText = JSON.stringify(document);
  target.loadSnapshot(document);

  assert.deepEqual(target.snapshot(), source.snapshot());
  assert.deepEqual(target.history(), source.history());
  assert.equal(stateKey(target), stateKey(source));
  assert.equal(
    JSON.stringify(document),
    documentText,
    "the loader must not mutate the document it is given",
  );
  put(at(document, "state"), "drawAgreed", true);
  assert.equal(
    JSON.stringify(target.snapshot()),
    JSON.stringify(source.snapshot()),
    "the loaded state must not alias the document it was loaded from",
  );

  const events = target.history().length;
  target.undo();
  assert.equal(target.history().length, events - 1);
  for (let index = 0; index < events - 1; index += 1) {
    target.undo();
  }
  assert.equal(target.turn(), "white");
  assert.equal(boardKey(target.position()), boardKey(p4()));
  assert.deepEqual(target.snapshot().actions, []);
  assert.equal(stateKey(target), stateKey(new Quaternity(p4())));
});

test("loadSnapshot rejects a malformed or unsupported snapshot without mutating the instance", () => {
  const source = multiEventGame();
  const valid = json(source);

  const badVersion = clone(valid);
  put(badVersion, "version", 2);
  const badValue = clone(valid);
  put(badValue, "version", "1");
  const missingState = clone(valid);
  remove(missingState, "state");
  const unknownTopKey = clone(valid);
  put(unknownTopKey, "variant", "fen");
  const unknownStateKey = clone(valid);
  put(at(unknownStateKey, "state"), "extra", 1);
  const badInitialTurn = clone(valid);
  put(at(badInitialTurn, "initial"), "turn", "purple");
  const nonStringTurn = clone(valid);
  put(at(nonStringTurn, "initial"), "turn", 7);
  const badSquare = clone(valid);
  put(list(at(badSquare, "initial").pieces)[0] ?? {}, "square", "z1");
  const kingWithState = clone(valid);
  put(list(at(kingWithState, "initial").pieces)[0] ?? {}, "state", {
    kind: "ordinary",
    direction: "up",
  });
  const pawnWithoutState = clone(valid);
  put(list(at(pawnWithoutState, "initial").pieces)[0] ?? {}, "type", "pawn");
  put(list(at(pawnWithoutState, "initial").pieces)[0] ?? {}, "state", null);
  const badPawnState = clone(valid);
  put(at(badPawnState, "initial"), "pieces", [
    {
      square: "a1",
      army: "white",
      type: "pawn",
      state: { kind: "ordinary", direction: "north" },
    },
  ]);
  const unknownPawnKind = clone(valid);
  put(at(unknownPawnKind, "initial"), "pieces", [
    {
      square: "a1",
      army: "white",
      type: "pawn",
      state: { kind: "slippery" },
    },
  ]);
  const unknownAction = clone(valid);
  put(unknownAction, "actions", [{ kind: "castle" }]);
  const badAccept = clone(valid);
  put(badAccept, "actions", [
    { kind: "draw-response", player: "black", accept: "yes" },
  ]);
  const unknownOutcome = clone(valid);
  put(at(unknownOutcome, "state"), "outcome", { kind: "stalemate" });
  const badOutcomeWinner = clone(valid);
  put(at(badOutcomeWinner, "state"), "outcome", { kind: "winner" });
  const badLog = clone(valid);
  put(badLog, "log", [{ kind: "resignation", player: "white" }]);
  const badLogSelection = clone(valid);
  put(list(at(badLogSelection, "log"))[0] ?? {}, "selection", {
    kind: "next",
  });
  const badLogAward = clone(valid);
  put(list(at(badLogAward, "log"))[2] ?? {}, "awards", [
    { kingId: "red", army: "red" },
  ]);
  const badAwardKingId = clone(valid);
  put(list(at(badAwardKingId, "log"))[2] ?? {}, "awards", [
    { kingId: 7, army: "red", to: "white" },
  ]);
  const badSelectionKind = clone(valid);
  put(list(at(badSelectionKind, "log"))[2] ?? {}, "selection", {
    kind: "draw",
  });
  const badPendingDraw = clone(valid);
  put(at(badPendingDraw, "state"), "pendingDraw", {
    proposer: "white",
    acceptedBy: "black",
  });
  const badDrawAgreed = clone(valid);
  put(at(badDrawAgreed, "state"), "drawAgreed", "yes");

  const cases: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["a number", 7],
    ["a string", "snapshot"],
    ["an array", []],
    ["a missing version", { ...valid, version: undefined }],
    ["an unsupported version", badVersion],
    ["a non-numeric version", badValue],
    ["a missing state", missingState],
    ["an unknown top-level key", unknownTopKey],
    ["an unknown state key", unknownStateKey],
    ["a bad initial turn", badInitialTurn],
    ["a non-string initial turn", nonStringTurn],
    ["a bad square", badSquare],
    ["a king with pawn state", kingWithState],
    ["a pawn without pawn state", pawnWithoutState],
    ["a bad pawn direction", badPawnState],
    ["an unknown pawn kind", unknownPawnKind],
    ["an unknown action kind", unknownAction],
    ["a non-boolean vote", badAccept],
    ["an unknown outcome kind", unknownOutcome],
    ["a winner outcome without a winner", badOutcomeWinner],
    ["an unknown log event kind", badLog],
    ["a selection without a player", badLogSelection],
    ["an award without an army", badLogAward],
    ["an award with a non-string king id", badAwardKingId],
    ["a selection with an unknown kind", badSelectionKind],
    ["a pending offer with a non-array vote list", badPendingDraw],
    ["a non-boolean draw flag", badDrawAgreed],
  ];

  const target = new Quaternity(p4());
  const before = stateKey(target);
  for (const [description, value] of cases) {
    assert.throws(
      () => target.loadSnapshot(value),
      /loadSnapshot:/,
      `expected rejection for ${description}`,
    );
    assert.equal(stateKey(target), before, `mutated by ${description}`);
  }
  // The same loader accepts the untouched document, so the rejections above are
  // about the tampering, not about the document being unloadable.
  target.loadSnapshot(valid);
  assert.deepEqual(target.snapshot(), source.snapshot());
});

test("loadSnapshot rejects a state or log that disagrees with the replayed actions", () => {
  const source = multiEventGame();
  const target = new Quaternity(p4());

  const badTurn = json(source);
  put(at(at(badTurn, "state"), "position"), "turn", "black");
  const badOutcome = json(source);
  put(at(badOutcome, "state"), "outcome", { kind: "draw" });
  const badOffer = json(source);
  put(at(badOffer, "state"), "pendingDraw", {
    proposer: "white",
    acceptedBy: [],
  });
  const badAgreed = json(source);
  put(at(badAgreed, "state"), "drawAgreed", true);
  const badPieces = json(source);
  put(
    list(at(at(badPieces, "state"), "position").pieces).find(
      (piece) => piece.army === "white" && piece.type === "king",
    ) ?? {},
    "square",
    "b1",
  );
  const badLogEvent = json(source);
  put(badLogEvent, "log", list(at(badLogEvent, "log")).slice(0, 2));
  const badLogCapture = json(source);
  put(list(at(badLogCapture, "log"))[2] ?? {}, "captured", {
    army: "black",
    type: "bishop",
    state: null,
  });

  const cascade = new Quaternity(fixture4a());
  cascade.move({ from: "f1", to: "f12" });
  const tamperedAward = json(cascade);
  put(
    list(at(at(tamperedAward, "log")[0] ?? {}, "awards"))[0] ?? {},
    "to",
    "green",
  );

  for (const [description, value] of [
    ["a tampered turn", badTurn],
    ["a tampered outcome", badOutcome],
    ["a tampered pending offer", badOffer],
    ["a tampered draw flag", badAgreed],
    ["a tampered state board", badPieces],
    ["a truncated log", badLogEvent],
    ["a tampered capture", badLogCapture],
    ["a tampered award", tamperedAward],
  ] satisfies readonly (readonly [string, Json])[]) {
    assertAtomic(
      target,
      () => {
        target.loadSnapshot(value);
      },
      /loadSnapshot: the (state|log) does not match/,
      description,
    );
  }
});

test("loadSnapshot rejects an invalid position through createPosition", () => {
  const source = new Quaternity(p4());
  const target = new Quaternity();

  const duplicateSquare = json(source);
  const pieces = list(at(at(duplicateSquare, "initial"), "pieces"));
  pieces[1] = structuredClone(pieces[0] ?? {});
  const unknownSquare = json(source);
  put(
    list(at(at(unknownSquare, "initial"), "pieces"))[1] ?? {},
    "square",
    "a1x",
  );
  const missingKing = json(source);
  put(
    at(missingKing, "initial"),
    "pieces",
    list(at(at(missingKing, "initial"), "pieces")).slice(1),
  );
  const badController = json(source);
  put(at(at(badController, "initial"), "controllers"), "red", "purple");
  const badStatus = json(source);
  put(at(at(badStatus, "initial"), "players"), "green", "retired");
  const badStatePosition = json(source);
  const statePosition = at(at(badStatePosition, "state"), "position");
  put(list(at(statePosition, "pieces")).slice(0, 1), "length", 1);
  put(statePosition, "players", {
    white: "active",
    red: "eliminated",
    black: "eliminated",
    green: "eliminated",
  });

  for (const value of [
    duplicateSquare,
    unknownSquare,
    missingKing,
    badController,
    badStatus,
    badStatePosition,
  ]) {
    assertAtomic(target, () => {
      target.loadSnapshot(value);
    });
  }
  assert.equal(stateKey(target), stateKey(new Quaternity()));
});

test("loadSnapshot rejects duplicate, stale and illegal coordinate actions", () => {
  const source = new Quaternity(p4());
  source.proposeDraw();
  source.respondToDraw("black", true);
  const valid = json(source);
  const target = new Quaternity();

  const duplicateVote = clone(valid);
  put(duplicateVote, "actions", [
    { kind: "draw-proposal" },
    { kind: "draw-response", player: "black", accept: true },
    { kind: "draw-response", player: "black", accept: true },
  ]);
  const staleVote = clone(valid);
  put(staleVote, "actions", [
    { kind: "draw-proposal" },
    { kind: "draw-response", player: "black", accept: true },
    { kind: "move", from: "a1", to: "a2", promotion: null },
    { kind: "draw-response", player: "black", accept: true },
  ]);
  const illegalMove = clone(valid);
  put(illegalMove, "actions", [
    { kind: "move", from: "b2", to: "b3", promotion: null },
  ]);
  const unqualifiedPromotion = clone(valid);
  put(unqualifiedPromotion, "actions", [
    { kind: "move", from: "a11", to: "a12", promotion: null },
  ]);
  const postTerminal = clone(valid);
  put(postTerminal, "actions", [
    { kind: "freeze", action: "resign", player: "white" },
    { kind: "freeze", action: "resign", player: "red" },
    { kind: "freeze", action: "resign", player: "black" },
    { kind: "freeze", action: "resign", player: "green" },
  ]);

  assertAtomic(
    target,
    () => {
      target.loadSnapshot(duplicateVote);
    },
    /already voted/,
  );
  assertAtomic(
    target,
    () => {
      target.loadSnapshot(staleVote);
    },
    /stale vote/,
  );
  assertAtomic(
    target,
    () => {
      target.loadSnapshot(illegalMove);
    },
    /not a legal move/,
  );
  assertAtomic(
    target,
    () => {
      target.loadSnapshot(unqualifiedPromotion);
    },
    /not a legal move/,
  );
  assertAtomic(
    target,
    () => {
      target.loadSnapshot(postTerminal);
    },
    /game is over/,
  );
});

test("loadSnapshot fails closed on an unresolved snapshot (001/D40/001/D41)", () => {
  const openTarget = new Quaternity();
  const witnessed = json(openTarget);
  put(witnessed, "initial", serializePosition(witnessQ()));

  const target = new Quaternity(p4());
  const before = stateKey(target);
  assert.throws(
    () => target.loadSnapshot(witnessed),
    UnresolvedAdjudicationError,
  );
  assert.equal(stateKey(target), before);

  const predecessor = new Quaternity(siblingPredecessor());
  const base = json(predecessor);
  put(base, "actions", [
    { kind: "move", from: "a11", to: "a12", promotion: null },
  ]);
  assertAtomic(
    target,
    () => {
      target.loadSnapshot(base);
    },
    UnresolvedAdjudicationError,
  );

  const played = new Quaternity(siblingPredecessor());
  played.move({ from: "a11", to: "a12" });
  assert.throws(() => played.snapshot(), UnresolvedAdjudicationError);
  assert.throws(() => played.moves(), UnresolvedAdjudicationError);
  assert.throws(() => played.outcome(), UnresolvedAdjudicationError);
});

test("a loaded game keeps its replay origin for a later snapshot and reset", () => {
  const game = new Quaternity(fixture4a());
  game.move({ from: "f1", to: "f12" });
  const loaded = loadedFrom(json(game));

  assert.equal(loaded.snapshot().initial.turn, "white");
  assert.equal(
    list(at(at(loaded.snapshot(), "initial"), "pieces")).length,
    fixture4a().board.size,
  );
  loaded.reset();
  assert.equal(stateKey(loaded), stateKey(new Quaternity()));
  assert.deepEqual(loaded.snapshot(), new Quaternity().snapshot());
  assert.throws(() => loaded.undo(), /no history event/);
});

test("a snapshot of a custom position keeps its own origin after a load", () => {
  const game = new Quaternity(fixture5a());
  game.pass();
  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot().initial, game.snapshot().initial);
  assert.equal(at(at(loaded.snapshot(), "initial"), "turn"), "white");
  assert.deepEqual(
    (at(at(loaded.snapshot(), "initial"), "players") as Json).white,
    "active",
  );
});

test("loadSnapshot accepts a snapshot of a terminal game and keeps it terminal", () => {
  const game = new Quaternity(p4());
  game.resign("red");
  game.resign("black");
  game.resign("green");
  const snapshot = game.snapshot();

  assert.deepEqual(snapshot.state.outcome, { kind: "winner", winner: "white" });
  const loaded = loadedFrom(json(game));
  assert.deepEqual(loaded.snapshot(), snapshot);
  assert.deepEqual(loaded.outcome(), { kind: "winner", winner: "white" });
  assert.throws(() => loaded.resign("red"), /game is over/);
  assert.throws(() => loaded.moves(), /game is over/);
  loaded.undo();
  assert.deepEqual(loaded.outcome(), { kind: "in-progress" });
});

test("the loader is the single validation authority for a loaded document", () => {
  const source = new Quaternity(fixture5a());
  source.pass();
  const value = json(source);
  put(value, "log", []);

  const target = new Quaternity(p4());
  assert.throws(() => target.loadSnapshot(value), /the log does not match/);
  assert.equal(stateKey(target), stateKey(new Quaternity(p4())));
});

/** The public entry exposes the snapshot version and the snapshot types. */
test("the snapshot contract types are exported through the public entry", () => {
  const input: PositionInput = {
    pieces: [king("a1", "white")],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: {
      white: "active",
      red: "eliminated",
      black: "eliminated",
      green: "eliminated",
    },
    turn: "white",
  };
  const game = new Quaternity(createPosition(input));
  const snapshot = game.snapshot();
  assert.deepEqual(snapshot.state.outcome, { kind: "winner", winner: "white" });
  assert.deepEqual(snapshot.actions, []);
});
