import { test } from "node:test";
import assert from "node:assert/strict";

import { type ArmyColor, type Square } from "./board.ts";
import {
  attackers,
  createPosition,
  defaultPosition,
  inCheck,
  type PlacedEntry,
  type PlayerStatus,
  type Position,
} from "./position.ts";
import { applyPositionMove, legalMoves, type LegalMove } from "./legalMoves.ts";
import { type PawnDirection, type PawnState } from "./pawn.ts";
import { isMatedKing, matedKings } from "./mate.ts";

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

function king(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "king" };
}
function rook(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "rook" };
}
function knight(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "knight" };
}
function pawn(square: Square, army: ArmyColor, state: PawnState): PlacedEntry {
  return { square, army, type: "pawn", state };
}
function ordinary(direction: PawnDirection): PawnState {
  return { kind: "ordinary", direction };
}

function hasMove(
  moves: readonly LegalMove[],
  from: Square,
  to: Square,
): boolean {
  return moves.some((move) => move.from === from && move.to === to);
}

test("the opening position has no mated king", () => {
  const position = defaultPosition();
  assert.deepEqual(matedKings(position), []);
  assert.equal(isMatedKing(position, "white"), false);
});

/**
 * docs/rules/multiplayer-adjudication.md Fixture 3b: White king `c3-b2` steps
 * next to the frozen Green king `a1`, which is mated as if its army were active
 * (spec 001/D26/001/D32).
 */
test("Fixture 3b: a frozen king with no hypothetical defense is mated", () => {
  const position = applyPositionMove(
    createPosition({
      pieces: [
        king("c3", "white"),
        king("a12", "red"),
        king("l12", "black"),
        king("a1", "green"),
      ],
      controllers: { ...IDENTITY_CONTROLLERS },
      players: { ...ALL_ACTIVE, green: "frozen" },
      turn: "white",
    }),
    { from: "c3", to: "b2" },
  );
  assert.equal(isMatedKing(position, "green"), true);
  assert.deepEqual(matedKings(position), ["green"]);
});

/**
 * Fixture 3b: the frozen Green king does not attack the adjacent White king
 * `b2`; a frozen piece exerts no actual attacks (spec 001/D26), so the mating White
 * king is not itself in check or mated.
 */
test("Fixture 3b: a frozen king never attacks the mating White king", () => {
  const position = applyPositionMove(
    createPosition({
      pieces: [
        king("c3", "white"),
        king("a12", "red"),
        king("l12", "black"),
        king("a1", "green"),
      ],
      controllers: { ...IDENTITY_CONTROLLERS },
      players: { ...ALL_ACTIVE, green: "frozen" },
      turn: "white",
    }),
    { from: "c3", to: "b2" },
  );
  assert.deepEqual(attackers(position, "b2", "green"), []);
  assert.equal(inCheck(position, "white"), false);
  assert.equal(isMatedKing(position, "white"), false);
});

function fixture3cPieces(): PlacedEntry[] {
  return [
    king("c2", "white"),
    knight("c1", "white"),
    rook("b2", "white"),
    king("a12", "red"),
    king("l12", "black"),
    king("a1", "green"),
    rook("a5", "green"),
  ];
}

/**
 * docs/rules/multiplayer-adjudication.md Fixture 3c: White rook `b2-a2` checks
 * the frozen Green king `a1`, but treating the frozen Green army as active the
 * rook `a5` can capture `a2` (`a4`, `a3` empty), so the mate test fails and the
 * frozen king is in check but not mated (spec 001/D26/001/D32).
 */
test("Fixture 3c: a frozen king in check with a hypothetical defense is not mated", () => {
  const position = applyPositionMove(
    createPosition({
      pieces: fixture3cPieces(),
      controllers: { ...IDENTITY_CONTROLLERS },
      players: { ...ALL_ACTIVE, green: "frozen" },
      turn: "white",
    }),
    { from: "b2", to: "a2" },
  );
  assert.equal(inCheck(position, "green"), true);
  assert.equal(isMatedKing(position, "green"), false);
  assert.deepEqual(matedKings(position), []);

  const activeGreen = createPosition({
    pieces: [
      king("c2", "white"),
      knight("c1", "white"),
      rook("a2", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("a1", "green"),
      rook("a5", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.ok(
    hasMove(legalMoves(activeGreen, "green"), "a5", "a2"),
    "the hypothetical active Green rook captures the checking rook a2",
  );
});

/**
 * Fixture 3c: evaluating the frozen king must not mutate the position or make
 * its frozen pieces attack; the Green rook `a5` still exerts no actual attack
 * on the `a2` checker (spec 001/D26).
 */
test("frozen defense evaluation never mutates the position or its actual attacks", () => {
  const position = applyPositionMove(
    createPosition({
      pieces: fixture3cPieces(),
      controllers: { ...IDENTITY_CONTROLLERS },
      players: { ...ALL_ACTIVE, green: "frozen" },
      turn: "white",
    }),
    { from: "b2", to: "a2" },
  );
  const before = [...position.board.entries()];
  assert.deepEqual(attackers(position, "a2", "green"), []);
  assert.deepEqual(matedKings(position), []);
  assert.deepEqual([...position.board.entries()], before);
  assert.equal(position.players.green, "frozen");
  assert.deepEqual(attackers(position, "a2", "green"), []);
});

/**
 * A frozen king in check whose hypothetical army can step to an unattacked
 * square escapes; the checking rook `a2` does not cover `b1`.
 */
test("a frozen king in check with a hypothetical escape is not mated", () => {
  const position = createPosition({
    pieces: [
      rook("a2", "white"),
      king("e5", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("a1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, green: "frozen" },
    turn: "white",
  });
  assert.equal(inCheck(position, "green"), true);
  assert.equal(isMatedKing(position, "green"), false);
  assert.deepEqual(matedKings(position), []);
});

/**
 * A frozen army's pawn is preserved and can supply the hypothetical defense:
 * the frozen Green pawn `c2` (direction `left`) captures the checking White rook
 * `b1`, so the frozen Green king `a1` is in check but not mated (spec 001/D26/001/D32).
 */
test("a frozen pawn supplies the hypothetical defense for its king", () => {
  const pieces = [
    rook("b1", "white"),
    knight("c1", "white"),
    knight("d2", "white"),
    king("e5", "white"),
    king("a12", "red"),
    king("l12", "black"),
    king("a1", "green"),
    pawn("c2", "green", ordinary("left")),
  ];
  const position = createPosition({
    pieces,
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, green: "frozen" },
    turn: "white",
  });
  assert.equal(inCheck(position, "green"), true);
  assert.equal(isMatedKing(position, "green"), false);
  assert.deepEqual(matedKings(position), []);

  const activeGreen = createPosition({
    pieces,
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.ok(
    hasMove(legalMoves(activeGreen, "green"), "c2", "b1"),
    "the hypothetical active Green pawn captures the checking rook b1",
  );
});

/** An active king in check with a legal escape is not mated (spec 001/D31). */
test("an active king in check that can escape is not mated", () => {
  const position = createPosition({
    pieces: [
      king("e1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      rook("e8", "black"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.equal(inCheck(position, "white"), true);
  assert.equal(isMatedKing(position, "white"), false);
  assert.deepEqual(matedKings(position), []);
});

/**
 * An active king with no escape, block or capture is mated: the Black rooks
 * `a2` and `b2` cover `a1`'s every destination and defend each other.
 */
test("an active king with no defense is mated", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      rook("a2", "black"),
      rook("b2", "black"),
      king("e12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.equal(inCheck(position, "white"), true);
  assert.equal(isMatedKing(position, "white"), true);
  assert.deepEqual(matedKings(position), ["white"]);
});

/**
 * Two active players, no legal move and no check is an immobility draw, never a
 * mate (spec 001/D25); mate detection must not report it.
 */
test("a no-move no-check two-player position is not reported as mate", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      rook("b5", "black"),
      rook("c2", "black"),
      king("l12", "black"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, red: "eliminated", green: "eliminated" },
    turn: "white",
  });
  assert.equal(inCheck(position, "white"), false);
  assert.deepEqual(legalMoves(position, "white"), []);
  assert.equal(isMatedKing(position, "white"), false);
  assert.deepEqual(matedKings(position), []);
});

/**
 * docs/rules/multiplayer-adjudication.md Fixture 1 custom shape: White controls
 * the White king `a1` and an assimilated Red-army king `a5`. The Black rook
 * `h5` checks the assimilated king, but the White-army rook `c4` blocks on `c5`,
 * a defense from another army the same controller owns (spec 001/D31/001/D33).
 */
test("a block from another army the controller owns saves the assimilated king", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      king("a5", "red"),
      rook("c4", "white"),
      king("l12", "black"),
      rook("h5", "black"),
    ],
    controllers: {
      white: "white",
      red: "white",
      black: "black",
      green: "green",
    },
    players: {
      white: "active",
      red: "eliminated",
      black: "active",
      green: "eliminated",
    },
    turn: "white",
  });
  assert.deepEqual(attackers(position, "a5", "black"), ["h5"]);
  assert.ok(
    hasMove(legalMoves(position, "white"), "c4", "c5"),
    "the White-army rook c4 blocks the check on the assimilated Red-army king",
  );
  assert.equal(isMatedKing(position, "red"), false);
  assert.equal(isMatedKing(position, "white"), false);
  assert.deepEqual(matedKings(position), []);
});

/**
 * spec 001/D31: one controller with two kings. The Black rook `a2` checks both
 * White-controlled kings `a1` and `a5`; no single move keeps both safe, so both
 * are mated, ordered white then red by retained army (spec 001/D30/001/D31).
 */
test("a two-king controller can have both kings mated, ordered by retained army", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      king("a5", "red"),
      rook("b5", "white"),
      king("l12", "black"),
      rook("a2", "black"),
      rook("b2", "black"),
      rook("h5", "black"),
    ],
    controllers: {
      white: "white",
      red: "white",
      black: "black",
      green: "green",
    },
    players: {
      white: "active",
      red: "eliminated",
      black: "active",
      green: "eliminated",
    },
    turn: "white",
  });
  assert.equal(isMatedKing(position, "white"), true);
  assert.equal(isMatedKing(position, "red"), true);
  assert.deepEqual(matedKings(position), ["white", "red"]);
});

/**
 * spec 001/D31 per-king evaluation: only the assimilated Red-army king `a1` is in
 * check and mated; the White king `l1` is safe and only its safety keeps the
 * Red-army king from escaping, so it is not itself mated.
 */
test("a two-king controller can have exactly one king mated", () => {
  const position = createPosition({
    pieces: [
      king("l1", "white"),
      king("a1", "red"),
      rook("a2", "black"),
      rook("b2", "black"),
      king("l12", "black"),
    ],
    controllers: {
      white: "white",
      red: "white",
      black: "black",
      green: "green",
    },
    players: {
      white: "active",
      red: "eliminated",
      black: "active",
      green: "eliminated",
    },
    turn: "white",
  });
  assert.equal(isMatedKing(position, "white"), false);
  assert.equal(isMatedKing(position, "red"), true);
  assert.deepEqual(matedKings(position), ["red"]);
});

/**
 * spec 001/D30/001/D31 canonical order: two mated kings of different controllers are
 * listed white then green even though the Green king's records come first in
 * the position, so the order is by controller, never by enumeration.
 */
test("mated kings are ordered by current controller, not board order", () => {
  const position = createPosition({
    pieces: [
      king("l1", "green"),
      rook("l2", "black"),
      rook("k2", "black"),
      king("a1", "white"),
      rook("a2", "black"),
      rook("b2", "black"),
      king("e12", "red"),
      king("l12", "black"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.equal(isMatedKing(position, "white"), true);
  assert.equal(isMatedKing(position, "green"), true);
  assert.deepEqual(matedKings(position), ["white", "green"]);
});

/** A king that is not on the board is never reported as mated (spec 001/D32). */
test("an absent king is never reported as mated", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      rook("a2", "black"),
      rook("b2", "black"),
      king("e12", "red"),
      king("l12", "black"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, green: "eliminated" },
    turn: "white",
  });
  assert.equal(isMatedKing(position, "green"), false);
  assert.deepEqual(matedKings(position), ["white"]);
});

/** matedKings is a pure query: repeated calls return an equal result. */
test("matedKings is deterministic across calls", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      rook("a2", "black"),
      rook("b2", "black"),
      king("e12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.deepEqual(matedKings(position), matedKings(position));
});

/** A position with no mated king returns an empty list. */
test("a quiet position reports no mated kings", () => {
  const position: Position = createPosition({
    pieces: [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.deepEqual(matedKings(position), []);
});
