import { test } from "node:test";
import assert from "node:assert/strict";

import { type ArmyColor, type Square } from "./board.ts";
import {
  PROMOTION_CHOICES,
  type PawnDirection,
  type PawnState,
  type PromotionPieceType,
} from "./pawn.ts";
import {
  attackers,
  createPosition,
  inCheck,
  type PlacedEntry,
  type PlayerStatus,
  type Position,
  type PositionInput,
} from "./position.ts";
import { applyPositionMove, legalMoves, type LegalMove } from "./legalMoves.ts";

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
function advanced(
  vertical: PawnDirection,
  horizontal: PawnDirection,
  committed?: PawnDirection,
): PawnState {
  return { kind: "advanced", vertical, horizontal, committed };
}

const FOUR_KINGS: readonly PlacedEntry[] = [
  king("a1", "white"),
  king("a12", "red"),
  king("l12", "black"),
  king("l1", "green"),
];

function baseInput(overrides: Partial<PositionInput> = {}): PositionInput {
  return {
    pieces: [...FOUR_KINGS],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
    ...overrides,
  };
}

function hasMove(
  moves: readonly LegalMove[],
  from: Square,
  to: Square,
): boolean {
  return moves.some((move) => move.from === from && move.to === to);
}

function findMove(
  moves: readonly LegalMove[],
  from: Square,
  to: Square,
): LegalMove {
  const move = moves.find((m) => m.from === from && m.to === to);
  assert.ok(move, `expected a legal move ${from}-${to}`);
  return move;
}

function squareOrder(square: Square): number {
  return square.charCodeAt(0) * 100 + Number(square.slice(1));
}
function moveOrder(move: LegalMove): number {
  return squareOrder(move.from) * 10000 + squareOrder(move.to);
}

/**
 * docs/rules/multiplayer-adjudication.md Fixture 1: White controls both the
 * White king `a1` and an assimilated Red king `a5`; a White rook `b5` blocks the
 * Black rook `h5`'s rank-5 line. Red and Green are eliminated.
 */
function fixture1(): Position {
  return createPosition({
    pieces: [
      king("a1", "white"),
      king("a5", "red"),
      rook("b5", "white"),
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
}

/**
 * docs/rules/multiplayer-adjudication.md Fixture 3d: a frozen Black pawn `d6`
 * blocks and can be captured by the White rook `d4`; the frozen Black king
 * `l12` stays uncapturable.
 */
function fixture3d(): Position {
  return createPosition({
    pieces: [
      king("a1", "white"),
      rook("d4", "white"),
      king("l12", "black"),
      pawn("d6", "black", ordinary("down")),
      king("j12", "red"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, black: "frozen" },
    turn: "white",
  });
}

test("Fixture 1: a move that exposes one of the controller's two kings is illegal", () => {
  const position = fixture1();
  const moves = legalMoves(position, "white");
  assert.ok(
    !hasMove(moves, "b5", "b6"),
    "b5-b6 opens the h5 rook's rank-5 line onto the assimilated Red king a5",
  );
  assert.ok(hasMove(moves, "a5", "a4"), "a5-a4 keeps both White kings safe");
});

test("Fixture 1: an illegal move throws atomically and leaves the position unchanged", () => {
  const position = fixture1();
  const before = [...position.board.entries()];
  const input = { from: "b5" as Square, to: "b6" as Square };
  const inputBefore = { ...input };
  assert.throws(
    () => applyPositionMove(position, input),
    /not a legal move for white/,
  );
  assert.deepEqual([...position.board.entries()], before);
  assert.equal(position.turn, "white");
  assert.deepEqual(input, inputBefore);
});

test("Fixture 1: a legal move returns a new position with the same turn and records", () => {
  const position = fixture1();
  const applied = applyPositionMove(position, { from: "a5", to: "a4" });
  assert.notEqual(applied, position);
  assert.deepEqual(applied.board.get("a4"), { army: "red", type: "king" });
  assert.equal(applied.board.has("a5"), false);
  assert.equal(position.board.has("a5"), true, "original position untouched");
  assert.equal(
    applied.turn,
    "white",
    "pre-adjudication apply never advances turn",
  );
  assert.deepEqual(applied.controllers, position.controllers);
  assert.deepEqual(applied.players, position.players);
});

test("Fixture 3d: a frozen non-king piece is a capturable inert blocker", () => {
  const position = fixture3d();
  const moves = legalMoves(position, "white");
  assert.ok(
    !hasMove(moves, "d4", "d7"),
    "the frozen pawn blocks the d-file ray",
  );
  const capture = findMove(moves, "d4", "d6");
  assert.equal(capture.army, "white");
  assert.equal(capture.controller, "white");
  assert.deepEqual(capture.captured, {
    army: "black",
    type: "pawn",
    state: ordinary("down"),
  });
  assert.equal(capture.pawn, undefined);
  assert.equal(capture.promotes, false);

  const applied = applyPositionMove(position, { from: "d4", to: "d6" });
  assert.deepEqual(applied.board.get("d6"), { army: "white", type: "rook" });
  assert.equal(applied.board.has("d4"), false);
  assert.equal(
    applied.board.has("l12"),
    true,
    "the frozen king is not captured",
  );
});

test("a pinned piece may not expose its king to a hostile non-next controller", () => {
  const position = createPosition({
    pieces: [
      king("e1", "white"),
      rook("e2", "white"),
      king("a12", "red"),
      king("l12", "black"),
      rook("e8", "black"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  const moves = legalMoves(position, "white");
  assert.ok(!hasMove(moves, "e2", "d2"), "e2-d2 exposes the White king e1");
  assert.ok(hasMove(moves, "e2", "e3"), "the pin line stays blocked");
});

/**
 * Starting in check, the active White king must evade it: a destination that
 * stays on the Black rook's open e-file ray is filtered out, while the four
 * squares off the ray and off every hostile king stay legal (spec 001/D31).
 */
test("a king that starts in check may only move to squares no hostile controller attacks", () => {
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
  assert.equal(inCheck(position, "white"), true, "the Black rook e8 checks e1");
  assert.deepEqual(
    attackers(position, "e1", "black"),
    ["e8"],
    "only the Black rook attacks the checked king",
  );
  assert.deepEqual(
    attackers(position, "e2", "black"),
    ["e8"],
    "e2 is still on the rook's ray because e3..e7 are empty",
  );
  assert.deepEqual(
    legalMoves(position, "white").map((move) => `${move.from}-${move.to}`),
    ["e1-d1", "e1-d2", "e1-f1", "e1-f2"],
    "e1-e2 stays attacked; d1/d2/f1/f2 leave the ray and no hostile king attacks them",
  );
  assert.throws(
    () => applyPositionMove(position, { from: "e1", to: "e2" }),
    /not a legal move for white/,
  );
});

/**
 * The adjacent squares of a hostile king are attacked, so a king may not step
 * onto one even when the position is otherwise quiet; only a1-a2 is safe, and
 * the Red king a12 and Green king l1 attack none of the candidates (spec
 * 001/D31).
 */
test("a king may not step onto a square a hostile king attacks", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      king("c2", "black"),
      king("a12", "red"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.equal(inCheck(position, "white"), false, "a1 is not attacked");
  assert.deepEqual(attackers(position, "b1", "black"), ["c2"]);
  assert.deepEqual(attackers(position, "b2", "black"), ["c2"]);
  for (const controller of ["black", "red", "green"] as const) {
    assert.deepEqual(
      attackers(position, "a2", controller),
      [],
      `no ${controller} piece attacks the a1-a2 destination`,
    );
  }
  assert.deepEqual(
    legalMoves(position, "white").map((move) => `${move.from}-${move.to}`),
    ["a1-a2"],
    "b1 and b2 are attacked by the Black king c2; a2 is the only safe square",
  );
});

/**
 * A king is never captured: a hostile king standing next to the White king is
 * not a destination, and with every neighbouring square attacked the checked
 * king has no legal move at all (spec 001/D26).
 */
test("a king never captures a hostile king and has no move when every square is attacked", () => {
  const position = createPosition({
    pieces: [
      king("b1", "white"),
      king("b2", "black"),
      king("a12", "red"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  });
  assert.equal(
    inCheck(position, "white"),
    true,
    "the Black king b2 attacks b1",
  );
  assert.ok(!hasMove(legalMoves(position, "white"), "b1", "b2"));
  assert.throws(
    () => applyPositionMove(position, { from: "b1", to: "b2" }),
    /not a legal move for white/,
  );
  assert.deepEqual(
    legalMoves(position, "white"),
    [],
    "a1, a2, c1 and c2 are all attacked by the Black king b2",
  );
});

test("an assimilated army's pieces move for their controller and keep their army colour", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      rook("d4", "red"),
      king("l12", "black"),
      king("l1", "green"),
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
      green: "active",
    },
    turn: "white",
  });
  const rookMoves = legalMoves(position, "white").filter(
    (move) => move.from === "d4",
  );
  assert.ok(rookMoves.length > 0, "the assimilated rook has moves");
  for (const move of rookMoves) {
    assert.equal(move.army, "red", "the retained army colour is recorded");
    assert.equal(
      move.controller,
      "white",
      "the current controller is recorded",
    );
  }
  assert.deepEqual(
    legalMoves(position, "red"),
    [],
    "an eliminated controller has no moves",
  );
});

test("a controller may not capture a piece it already controls, whatever its army", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      rook("a2", "white"),
      rook("a5", "red"),
      king("l12", "black"),
      king("l1", "green"),
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
      green: "active",
    },
    turn: "white",
  });
  assert.ok(!hasMove(legalMoves(position, "white"), "a2", "a5"));
  assert.ok(hasMove(legalMoves(position, "white"), "a2", "a3"));
});

test("a frozen controller has no legal moves", () => {
  const position = createPosition(
    baseInput({ players: { ...ALL_ACTIVE, red: "frozen" } }),
  );
  assert.ok(legalMoves(position, "white").length > 0);
  assert.deepEqual(legalMoves(position, "red"), []);
});

test("a frozen piece exerts no attack, so it never makes a king unsafe", () => {
  const position = createPosition({
    pieces: [
      king("b6", "white"),
      pawn("c7", "black", ordinary("down")),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, black: "frozen" },
    turn: "white",
  });
  assert.equal(inCheck(position, "white"), false);
  const moves = legalMoves(position, "white");
  assert.ok(hasMove(moves, "b6", "c7"), "the frozen pawn is still capturable");
});

test("a king is never a legal destination, not even a frozen king", () => {
  const position = createPosition({
    pieces: [
      king("a1", "white"),
      rook("d4", "white"),
      king("d6", "black"),
      king("a12", "red"),
      king("l1", "green"),
    ],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, black: "frozen" },
    turn: "white",
  });
  const moves = legalMoves(position, "white");
  assert.ok(
    !hasMove(moves, "d4", "d6"),
    "a king square is never a destination",
  );
  assert.ok(hasMove(moves, "d4", "d5"));
});

/** docs/rules/pawn-vectors.md §1: the eight ordinary orientations. */
const ORIENTATION_CASES: readonly (readonly [
  ArmyColor,
  Square,
  PawnDirection,
  Square,
])[] = [
  ["white", "c5", "up", "c6"],
  ["white", "e3", "right", "f3"],
  ["red", "c8", "down", "c7"],
  ["red", "e10", "right", "f10"],
  ["black", "j8", "down", "j7"],
  ["black", "h10", "left", "g10"],
  ["green", "j5", "up", "j6"],
  ["green", "h3", "left", "g3"],
];

test("all four armies' ordinary pawns generate exactly their one-square forward move", () => {
  for (const [army, square, direction, forward] of ORIENTATION_CASES) {
    const position = createPosition(
      baseInput({
        pieces: [...FOUR_KINGS, pawn(square, army, ordinary(direction))],
      }),
    );
    const pawnMoves = legalMoves(position, army).filter(
      (move) => move.from === square,
    );
    assert.equal(pawnMoves.length, 1, `${army} ${square} has one move`);
    const move = pawnMoves[0] as LegalMove;
    assert.equal(move.to, forward, `${army} ${square} moves forward`);
    assert.equal(move.army, army);
    assert.equal(move.controller, army);
    assert.equal(move.captured, undefined);
    assert.deepEqual(move.pawn, {
      before: ordinary(direction),
      after: ordinary(direction),
    });
    assert.equal(move.promotes, false);
  }
});

test("an ordinary pawn captures on both forward diagonals but never straight", () => {
  const position = createPosition(
    baseInput({
      pieces: [
        ...FOUR_KINGS,
        pawn("c5", "white", ordinary("up")),
        knight("b6", "black"),
        knight("d6", "black"),
      ],
    }),
  );
  const moves = legalMoves(position, "white");
  assert.ok(hasMove(moves, "c5", "c6"));
  assert.ok(hasMove(moves, "c5", "b6"));
  assert.ok(hasMove(moves, "c5", "d6"));
});

test("an advanced pawn's side capture commits it and changes its later vectors", () => {
  const position = createPosition(
    baseInput({
      pieces: [
        ...FOUR_KINGS,
        pawn("e5", "white", advanced("up", "right")),
        knight("d6", "black"),
        knight("c7", "black"),
        knight("e7", "black"),
      ],
    }),
  );
  const capture = findMove(legalMoves(position, "white"), "e5", "d6");
  assert.deepEqual(capture.pawn, {
    before: advanced("up", "right"),
    after: advanced("up", "right", "up"),
  });

  const applied = applyPositionMove(position, { from: "e5", to: "d6" });
  assert.deepEqual(applied.board.get("d6"), {
    army: "white",
    type: "pawn",
    state: advanced("up", "right", "up"),
  });
  const pawnMoves = legalMoves(applied, "white").filter(
    (move) => move.from === "d6",
  );
  assert.deepEqual(pawnMoves.map((move) => move.to).sort(), ["c7", "d7", "e7"]);
  assert.ok(!hasMove(legalMoves(applied, "white"), "d6", "d5"));
  assert.ok(!hasMove(legalMoves(applied, "white"), "d6", "c6"));
  assert.ok(!hasMove(legalMoves(applied, "white"), "d6", "e6"));
});

test("an advanced pawn's toward-center capture keeps its direction choice open", () => {
  const position = createPosition(
    baseInput({
      pieces: [
        ...FOUR_KINGS,
        pawn("e5", "white", advanced("up", "right")),
        knight("f6", "black"),
      ],
    }),
  );
  const capture = findMove(legalMoves(position, "white"), "e5", "f6");
  assert.deepEqual(capture.pawn, {
    before: advanced("up", "right"),
    after: advanced("up", "right"),
  });
  const applied = applyPositionMove(position, { from: "e5", to: "f6" });
  assert.deepEqual(applied.board.get("f6"), {
    army: "white",
    type: "pawn",
    state: advanced("up", "right"),
  });
});

test("a pawn promotes on its far edge with an explicit same-army choice", () => {
  const position = createPosition(
    baseInput({
      pieces: [...FOUR_KINGS, pawn("d11", "white", ordinary("up"))],
    }),
  );
  const promotion = findMove(legalMoves(position, "white"), "d11", "d12");
  assert.equal(promotion.promotes, true);
  assert.deepEqual(promotion.pawn, {
    before: ordinary("up"),
    after: ordinary("up"),
  });
  for (const choice of PROMOTION_CHOICES) {
    const applied = applyPositionMove(position, {
      from: "d11",
      to: "d12",
      promotion: choice,
    });
    assert.deepEqual(applied.board.get("d12"), { army: "white", type: choice });
  }
});

test("a promoting move rejects a missing or invalid promotion choice", () => {
  const position = createPosition(
    baseInput({
      pieces: [...FOUR_KINGS, pawn("d11", "white", ordinary("up"))],
    }),
  );
  assert.throws(
    () => applyPositionMove(position, { from: "d11", to: "d12" }),
    /requires a promotion choice/,
  );
  assert.throws(
    () =>
      applyPositionMove(position, {
        from: "d11",
        to: "d12",
        promotion: "king" as unknown as PromotionPieceType,
      }),
    /invalid promotion/,
  );
});

test("a non-promoting move rejects an extra promotion choice", () => {
  const position = createPosition(
    baseInput({
      pieces: [...FOUR_KINGS, pawn("d10", "white", ordinary("up"))],
    }),
  );
  assert.throws(
    () =>
      applyPositionMove(position, {
        from: "d10",
        to: "d11",
        promotion: "queen",
      }),
    /not a promotion move/,
  );
});

test("a capture onto the promotion edge promotes with the pawn's army colour", () => {
  const position = createPosition({
    pieces: [
      ...FOUR_KINGS,
      pawn("c2", "red", ordinary("down")),
      knight("b1", "black"),
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
      green: "active",
    },
    turn: "white",
  });
  const promotion = findMove(legalMoves(position, "white"), "c2", "b1");
  assert.equal(promotion.promotes, true);
  assert.equal(promotion.army, "red");
  const applied = applyPositionMove(position, {
    from: "c2",
    to: "b1",
    promotion: "knight",
  });
  assert.deepEqual(applied.board.get("b1"), { army: "red", type: "knight" });
});

test("applyPositionMove applies only the on-turn controller's move", () => {
  const position = createPosition(baseInput({ turn: "red" }));
  assert.ok(
    legalMoves(position, "white").length > 0,
    "legalMoves is pure and answers for any active controller",
  );
  assert.throws(
    () => applyPositionMove(position, { from: "a1", to: "a2" }),
    /not a legal move for red/,
  );
  const applied = applyPositionMove(position, { from: "a12", to: "a11" });
  assert.equal(applied.turn, "red");
});

test("legal moves are deterministically ordered by from square then to square", () => {
  const moves = legalMoves(fixture1(), "white");
  const order = moves.map(moveOrder);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.deepEqual(
    moves.map((move) => `${move.from}-${move.to}`),
    [
      "a1-a2",
      "a1-b1",
      "a1-b2",
      "a5-a4",
      "a5-a6",
      "a5-b4",
      "a5-b6",
      "b5-c5",
      "b5-d5",
      "b5-e5",
      "b5-f5",
      "b5-g5",
      "b5-h5",
    ],
  );
});
