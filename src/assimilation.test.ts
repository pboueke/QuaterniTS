/**
 * Tests for the pure 001/D36/001/D37 assimilation **transfer unit**
 * (`src/assimilation.ts`), driven by the abstract expected outcomes of spec
 * 001/D37 and `docs/rules/multiplayer-adjudication.md` §0/§1/§4c.
 *
 * Scope:
 *
 * - Every state is a validated `Position` built with `createPosition`; the unit
 *   never judges mate, so the tests supply the mated-king batch directly.
 * - Covered: the 001/D37 default-play-reachable last-king elimination, the 001/D37
 *   custom surviving multi-king controller, both kings mated in one batch, a
 *   frozen defeated king, canonical award order and input atomicity.
 * - Out of scope (withheld by 001/D38/001/D27): the assembled commit path, 001/D38's
 *   post-batch safety filter, turn advancement, history, draw/win and the
 *   `[blocked]` checked-non-actor edge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { type ArmyColor, type PieceType, type Square } from "./board.ts";
import {
  createPosition,
  type PlacedEntry,
  type PlayerStatus,
  type Position,
} from "./position.ts";
import { assimilateMatedKings } from "./assimilation.ts";

const IDENTITY_CONTROLLERS: Readonly<Record<ArmyColor, ArmyColor>> = {
  white: "white",
  red: "red",
  black: "black",
  green: "green",
};
const ALL_ACTIVE: Readonly<Record<ArmyColor, PlayerStatus>> = {
  white: "active",
  red: "active",
  black: "active",
  green: "active",
};

function king(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "king" };
}
function rook(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "rook" };
}
function pawn(square: Square, army: ArmyColor): PlacedEntry {
  return {
    square,
    army,
    type: "pawn",
    state: { kind: "ordinary", direction: "up" },
  };
}

/** A board piece with its square, for compact assertions. */
interface PieceView {
  readonly square: Square;
  readonly army: ArmyColor;
  readonly type: PieceType;
}

function pieceAt(position: Position, square: Square): PieceView {
  const placed = position.board.get(square);
  assert.ok(placed !== undefined, `expected a piece on ${square}`);
  return { square, army: placed.army, type: placed.type };
}

/**
 * 001/D37 outcome (1), the default-play-reachable case: White controls the White
 * king, the White army and a previously assimilated Green rook whose Green king
 * is already gone. Black mates the White king, so White loses its **last** king
 * and both armies transfer to Black.
 */
function defaultPathPosition(): Position {
  return createPosition({
    pieces: [
      king("a1", "white"),
      rook("a2", "white"),
      pawn("a3", "white"),
      rook("b1", "green"),
      king("l12", "black"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS, green: "white" },
    players: { ...ALL_ACTIVE, red: "eliminated", green: "eliminated" },
    turn: "black",
  });
}

/**
 * 001/D37 outcome (2), the custom non-default multi-king controller: White controls
 * the White king plus an assimilated Red king and both armies; Black mates only
 * the Red king, so White survives and only the Red army transfers.
 */
function multiKingPosition(): Position {
  return createPosition({
    pieces: [
      king("a1", "white"),
      rook("b5", "white"),
      king("a5", "red"),
      rook("c5", "red"),
      king("l12", "black"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS, red: "white" },
    players: { ...ALL_ACTIVE, red: "eliminated", green: "eliminated" },
    turn: "black",
  });
}

/** Two frozen players whose kings are mated by the active Black player. */
function frozenKingsPosition(): Position {
  return createPosition({
    pieces: [
      king("a1", "white"),
      king("e1", "red"),
      rook("e5", "red"),
      king("l1", "green"),
      rook("g5", "green"),
      king("l12", "black"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, red: "frozen", green: "frozen" },
    turn: "black",
  });
}

test("001/D37 default path: losing the last king eliminates and transfers every army", () => {
  const position = defaultPathPosition();
  const result = assimilateMatedKings(position, ["white"], "black");

  assert.deepEqual(result.awards, [{ king: "white", to: "black" }]);
  assert.deepEqual(result.position.controllers, {
    white: "black",
    red: "red",
    black: "black",
    green: "black",
  });
  assert.deepEqual(result.position.players, {
    white: "eliminated",
    red: "eliminated",
    black: "active",
    green: "eliminated",
  });
  assert.equal(result.position.board.has("a1"), false);
  assert.deepEqual(pieceAt(result.position, "a2"), {
    square: "a2",
    army: "white",
    type: "rook",
  });
  assert.deepEqual(pieceAt(result.position, "b1"), {
    square: "b1",
    army: "green",
    type: "rook",
  });
  assert.deepEqual(result.position.board.get("a3"), {
    army: "white",
    type: "pawn",
    state: { kind: "ordinary", direction: "up" },
  });
  assert.equal(result.position.turn, "black");
});

test("001/D37 custom case: a surviving controller keeps its other army", () => {
  const position = multiKingPosition();
  const result = assimilateMatedKings(position, ["red"], "black");

  assert.deepEqual(result.awards, [{ king: "red", to: "black" }]);
  assert.deepEqual(result.position.controllers, {
    white: "white",
    red: "black",
    black: "black",
    green: "green",
  });
  assert.deepEqual(result.position.players, {
    white: "active",
    red: "eliminated",
    black: "active",
    green: "eliminated",
  });
  assert.deepEqual(pieceAt(result.position, "c5"), {
    square: "c5",
    army: "red",
    type: "rook",
  });
  assert.deepEqual(pieceAt(result.position, "a1"), {
    square: "a1",
    army: "white",
    type: "king",
  });
  assert.deepEqual(pieceAt(result.position, "b5"), {
    square: "b5",
    army: "white",
    type: "rook",
  });
  assert.equal(result.position.board.has("a5"), false);
});

test("001/D37 same batch: both kings of one controller transfer every army once", () => {
  const position = multiKingPosition();
  const result = assimilateMatedKings(position, ["red", "white"], "black");

  assert.deepEqual(result.awards, [
    { king: "white", to: "black" },
    { king: "red", to: "black" },
  ]);
  assert.deepEqual(result.position.controllers, {
    white: "black",
    red: "black",
    black: "black",
    green: "green",
  });
  assert.deepEqual(result.position.players, {
    white: "eliminated",
    red: "eliminated",
    black: "active",
    green: "eliminated",
  });
  assert.equal(result.position.board.has("a1"), false);
  assert.equal(result.position.board.has("a5"), false);
  assert.deepEqual(pieceAt(result.position, "b5").army, "white");
  assert.deepEqual(pieceAt(result.position, "c5").army, "red");
});

test("a frozen defeated king transfers and its player is eliminated", () => {
  const position = frozenKingsPosition();
  const result = assimilateMatedKings(position, ["green", "red"], "black");

  assert.deepEqual(result.awards, [
    { king: "red", to: "black" },
    { king: "green", to: "black" },
  ]);
  assert.deepEqual(result.position.players, {
    white: "active",
    red: "eliminated",
    black: "active",
    green: "eliminated",
  });
  assert.deepEqual(result.position.controllers, {
    white: "white",
    red: "black",
    black: "black",
    green: "black",
  });
  assert.equal(result.position.board.has("e1"), false);
  assert.equal(result.position.board.has("l1"), false);
});

test("the input Position is never mutated", () => {
  const position = defaultPathPosition();
  assimilateMatedKings(position, ["white"], "black");

  assert.deepEqual(pieceAt(position, "a1"), {
    square: "a1",
    army: "white",
    type: "king",
  });
  assert.equal(position.controllers.white, "white");
  assert.equal(position.controllers.green, "white");
  assert.equal(position.players.white, "active");
  assert.equal(position.turn, "black");
});

test("an empty batch is a no-op that returns an equal Position", () => {
  const position = multiKingPosition();
  const result = assimilateMatedKings(position, [], "black");

  assert.deepEqual(result.awards, []);
  assert.deepEqual(result.position.controllers, position.controllers);
  assert.deepEqual(result.position.players, position.players);
  assert.deepEqual(result.position.board, position.board);
});

test("an inactive actor is rejected atomically", () => {
  const position = defaultPathPosition();
  assert.throws(
    () => assimilateMatedKings(position, ["white"], "red"),
    /actor red is not active/,
  );
  assert.equal(position.board.has("a1"), true);
});

test("an unknown army in the batch is rejected", () => {
  const position = defaultPathPosition();
  assert.throws(
    () => assimilateMatedKings(position, ["purple" as ArmyColor], "black"),
    /unknown army purple/,
  );
});

test("a duplicated army in the batch is rejected", () => {
  const position = multiKingPosition();
  assert.throws(
    () => assimilateMatedKings(position, ["red", "red"], "black"),
    /duplicated army red/,
  );
});

test("a batch army with no king on the board is rejected", () => {
  const position = defaultPathPosition();
  assert.throws(
    () => assimilateMatedKings(position, ["green"], "black"),
    /no king of army green/,
  );
});

test("the actor may never be credited with its own king", () => {
  const position = multiKingPosition();
  assert.throws(
    () => assimilateMatedKings(position, ["red"], "white"),
    /own king/,
  );
  assert.equal(position.board.has("a5"), true);
});
