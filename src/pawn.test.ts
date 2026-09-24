import { test } from "node:test";
import assert from "node:assert/strict";

import { offsetSquare, type ArmyColor, type Square } from "./board.ts";
import {
  ADVANCED_CENTRAL_PAWNS,
  ARMY_COLORS,
} from "./fixtures/openingPosition.ts";
import type {
  Board,
  BoardOccupant,
  BoardPiece,
  GeometricPieceType,
} from "./geometry.ts";
import {
  ADVANCED_PAWN_AXES,
  PROMOTION_CHOICES,
  pawnAttackSquares,
  pawnPseudoLegalDestinations,
  pawnTransition,
  promotedPiece,
  type PawnDirection,
  type PawnPiece,
  type PawnState,
} from "./pawn.ts";

const DIRECTION_STEP = new Map<PawnDirection, readonly [number, number]>([
  ["up", [0, 1]],
  ["down", [0, -1]],
  ["left", [-1, 0]],
  ["right", [1, 0]],
]);

function directionStep(
  direction: PawnDirection,
): readonly [fileDelta: number, rankDelta: number] {
  const offset = DIRECTION_STEP.get(direction);
  assert.ok(offset, `direction step for ${direction}`);
  return offset;
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

function pawn(
  state: PawnState,
  controller: ArmyColor = "white",
  army: ArmyColor = "white",
): PawnPiece {
  return { controller, army, type: "pawn", state };
}

function foe(
  controller: ArmyColor,
  army: ArmyColor,
  type: GeometricPieceType,
): BoardPiece {
  return { controller, army, type };
}

function board(entries: readonly (readonly [Square, BoardOccupant])[]): Board {
  return new Map(entries);
}

function sorted(squares: readonly Square[]): Square[] {
  return [...squares].sort();
}

function step(from: Square, direction: PawnDirection): Square {
  const [fileDelta, rankDelta] = directionStep(direction);
  const target = offsetSquare(from, fileDelta, rankDelta);
  assert.ok(target, `step ${direction} from ${from}`);
  return target;
}

interface OrdinaryCase {
  readonly army: ArmyColor;
  readonly square: Square;
  readonly direction: PawnDirection;
  readonly forward: Square;
  readonly wrongAxis: readonly Square[];
  readonly backward: Square;
}

/** §1/§2 of docs/rules/pawn-vectors.md: the eight ordinary orientations. */
const ORDINARY_CASES: readonly OrdinaryCase[] = [
  {
    army: "white",
    square: "c5",
    direction: "up",
    forward: "c6",
    wrongAxis: ["d5", "b5"],
    backward: "c4",
  },
  {
    army: "white",
    square: "e3",
    direction: "right",
    forward: "f3",
    wrongAxis: ["e4", "e2"],
    backward: "d3",
  },
  {
    army: "red",
    square: "c8",
    direction: "down",
    forward: "c7",
    wrongAxis: ["d8", "b8"],
    backward: "c9",
  },
  {
    army: "red",
    square: "e10",
    direction: "right",
    forward: "f10",
    wrongAxis: ["e9", "e11"],
    backward: "d10",
  },
  {
    army: "black",
    square: "j8",
    direction: "down",
    forward: "j7",
    wrongAxis: ["i8", "k8"],
    backward: "j9",
  },
  {
    army: "black",
    square: "h10",
    direction: "left",
    forward: "g10",
    wrongAxis: ["h9", "h11"],
    backward: "i10",
  },
  {
    army: "green",
    square: "j5",
    direction: "up",
    forward: "j6",
    wrongAxis: ["i5", "k5"],
    backward: "j4",
  },
  {
    army: "green",
    square: "h3",
    direction: "left",
    forward: "g3",
    wrongAxis: ["h4", "h2"],
    backward: "i3",
  },
];

test("all eight ordinary orientations move one square perpendicular to their line", () => {
  for (const {
    army,
    square,
    direction,
    forward,
    wrongAxis,
    backward,
  } of ORDINARY_CASES) {
    const mover = pawn(ordinary(direction), army, army);
    const occupied = board([[square, mover]]);
    const destinations = pawnPseudoLegalDestinations(occupied, square, mover);
    assert.deepEqual(destinations, [forward], `${army} ${square} forward`);
    for (const illegal of [...wrongAxis, backward]) {
      assert.ok(
        !destinations.includes(illegal),
        `${army} ${square} must not move to ${illegal}`,
      );
    }
    assert.ok(
      !pawnAttackSquares(square, mover).includes(forward),
      `${army} ${square} does not attack its forward square`,
    );
  }
});

test("pawns move exactly one square, never two", () => {
  const mover = pawn(ordinary("up"), "white", "white");
  const occupied = board([["c5", mover]]);
  assert.deepEqual(pawnPseudoLegalDestinations(occupied, "c5", mover), ["c6"]);
});

test("a pawn cannot enter an occupied forward square", () => {
  const mover = pawn(ordinary("up"), "white", "white");
  const occupied = board([
    ["c5", mover],
    ["c6", foe("black", "black", "knight")],
  ]);
  assert.deepEqual(pawnPseudoLegalDestinations(occupied, "c5", mover), []);
});

test("a pawn captures on both forward diagonals but never straight", () => {
  const mover = pawn(ordinary("up"), "white", "white");
  const occupied = board([
    ["c5", mover],
    ["b6", foe("black", "black", "knight")],
    ["d6", foe("black", "black", "bishop")],
    ["c6", foe("black", "black", "rook")],
    ["c4", foe("black", "black", "knight")],
  ]);
  assert.deepEqual(sorted(pawnPseudoLegalDestinations(occupied, "c5", mover)), [
    "b6",
    "d6",
  ]);
  assert.deepEqual(sorted(pawnAttackSquares("c5", mover)), ["b6", "d6"]);
});

test("a pawn attacks friendly and empty squares but captures only enemy, non-king pieces", () => {
  const mover = pawn(ordinary("up"), "white", "white");
  const occupied = board([
    ["c5", mover],
    ["b6", foe("white", "green", "knight")],
    ["d6", foe("black", "black", "king")],
  ]);
  assert.deepEqual(sorted(pawnAttackSquares("c5", mover)), ["b6", "d6"]);
  assert.deepEqual(pawnPseudoLegalDestinations(occupied, "c5", mover), ["c6"]);
});

test("a pawn captures by controller, not by retained army colour", () => {
  const mover = pawn(ordinary("up"), "white", "white");
  const occupied = board([
    ["c5", mover],
    ["b6", foe("black", "white", "knight")],
  ]);
  assert.deepEqual(sorted(pawnPseudoLegalDestinations(occupied, "c5", mover)), [
    "b6",
    "c6",
  ]);
});

test("advanced pawn axes follow the four army corners", () => {
  assert.deepEqual(ADVANCED_PAWN_AXES, {
    white: ["up", "right"],
    red: ["down", "right"],
    black: ["down", "left"],
    green: ["up", "left"],
  });
});

/** §5 of docs/rules/pawn-vectors.md: each advanced pawn's three attack squares. */
const ADVANCED_ATTACKS = new Map<Square, readonly Square[]>([
  ["d4", ["c5", "e3", "e5"]],
  ["e5", ["d6", "f4", "f6"]],
  ["d9", ["c8", "e8", "e10"]],
  ["e8", ["d7", "f7", "f9"]],
  ["i9", ["h8", "h10", "j8"]],
  ["h8", ["g7", "g9", "i7"]],
  ["i4", ["h3", "h5", "j5"]],
  ["h5", ["g4", "g6", "i6"]],
]);

test("each advanced central pawn starts uncommitted with two forward axes and three attacks", () => {
  for (const army of ARMY_COLORS) {
    const [vertical, horizontal] = ADVANCED_PAWN_AXES[army];
    for (const square of ADVANCED_CENTRAL_PAWNS[army]) {
      const mover = pawn(advanced(vertical, horizontal), army, army);
      const attacks = pawnAttackSquares(square, mover);
      assert.equal(attacks.length, 3, `${army} ${square} attack count`);
      const expected = ADVANCED_ATTACKS.get(square);
      assert.ok(expected, `expected attacks for ${army} ${square}`);
      assert.deepEqual(sorted(attacks), sorted(expected));
      const occupied = board([[square, mover]]);
      assert.deepEqual(
        sorted(pawnPseudoLegalDestinations(occupied, square, mover)),
        sorted([step(square, vertical), step(square, horizontal)]),
        `${army} ${square} forward axes`,
      );
    }
  }
});

test("an advanced pawn's first straight move commits it to that axis", () => {
  for (const army of ARMY_COLORS) {
    const [vertical, horizontal] = ADVANCED_PAWN_AXES[army];
    for (const square of ADVANCED_CENTRAL_PAWNS[army]) {
      const mover = pawn(advanced(vertical, horizontal), army, army);
      const verticalTarget = step(square, vertical);
      const horizontalTarget = step(square, horizontal);
      assert.deepEqual(
        pawnTransition(square, verticalTarget, mover).state,
        advanced(vertical, horizontal, vertical),
        `${army} ${square} vertical commitment`,
      );
      assert.deepEqual(
        pawnTransition(square, horizontalTarget, mover).state,
        advanced(vertical, horizontal, horizontal),
        `${army} ${square} horizontal commitment`,
      );
    }
  }
});

test("a committed advanced pawn moves and captures only along its committed direction", () => {
  const up = pawn(advanced("up", "right", "up"), "white", "white");
  assert.deepEqual(pawnPseudoLegalDestinations(board([["c5", up]]), "c5", up), [
    "c6",
  ]);
  assert.deepEqual(sorted(pawnAttackSquares("c5", up)), ["b6", "d6"]);
  const right = pawn(advanced("up", "right", "right"), "white", "white");
  assert.deepEqual(
    pawnPseudoLegalDestinations(board([["e3", right]]), "e3", right),
    ["f3"],
  );
  assert.deepEqual(sorted(pawnAttackSquares("e3", right)), ["f2", "f4"]);
});

test("a committed advanced pawn cannot enter an occupied forward square", () => {
  const mover = pawn(advanced("up", "right", "up"), "white", "white");
  const occupied = board([
    ["d5", mover],
    ["d6", foe("black", "black", "knight")],
  ]);
  assert.deepEqual(pawnPseudoLegalDestinations(occupied, "d5", mover), []);
});

test("a diagonal square is a capture only: an empty diagonal is not a destination", () => {
  const mover = pawn(advanced("up", "right"), "white", "white");
  assert.deepEqual(
    sorted(pawnPseudoLegalDestinations(board([["d4", mover]]), "d4", mover)),
    ["d5", "e4"],
  );
});

test("a toward-center main-diagonal capture keeps the advanced pawn uncommitted", () => {
  const mover = pawn(advanced("up", "right"), "white", "white");
  const occupied = board([
    ["d4", mover],
    ["e5", foe("green", "green", "knight")],
  ]);
  assert.ok(pawnPseudoLegalDestinations(occupied, "d4", mover).includes("e5"));
  const result = pawnTransition("d4", "e5", mover);
  assert.deepEqual(result.state, advanced("up", "right"));
  assert.equal(result.promotes, false);
  assert.deepEqual(sorted(pawnAttackSquares("e5", mover)), ["d6", "f4", "f6"]);
  assert.deepEqual(
    pawnTransition("e5", "f6", mover).state,
    advanced("up", "right"),
  );
});

test("a side capture commits the pawn to a persistent direction from its landing square", () => {
  const mover = pawn(advanced("up", "right"), "white", "white");
  assert.deepEqual(
    pawnTransition("d4", "c5", mover).state,
    advanced("up", "right", "up"),
  );
  assert.deepEqual(
    pawnTransition("d4", "e3", mover).state,
    advanced("up", "right", "right"),
  );
  assert.deepEqual(
    pawnTransition("e5", "d6", mover).state,
    advanced("up", "right", "up"),
  );
  assert.deepEqual(
    pawnTransition("e5", "f4", mover).state,
    advanced("up", "right", "right"),
  );
});

test("a Phase 2B side capture continues on the committed axis from the landing square", () => {
  const mover = pawn(advanced("up", "right"), "white", "white");

  const up = pawn(pawnTransition("e5", "d6", mover).state, "white", "white");
  assert.deepEqual(pawnPseudoLegalDestinations(board([["d6", up]]), "d6", up), [
    "d7",
  ]);
  assert.deepEqual(sorted(pawnAttackSquares("d6", up)), ["c7", "e7"]);
  assert.ok(
    pawnPseudoLegalDestinations(
      board([
        ["d6", up],
        ["c7", foe("black", "black", "knight")],
      ]),
      "d6",
      up,
    ).includes("c7"),
  );

  const right = pawn(pawnTransition("e5", "f4", mover).state, "white", "white");
  assert.deepEqual(
    pawnPseudoLegalDestinations(board([["f4", right]]), "f4", right),
    ["g4"],
  );
  assert.deepEqual(sorted(pawnAttackSquares("f4", right)), ["g3", "g5"]);
  assert.ok(
    pawnPseudoLegalDestinations(
      board([
        ["f4", right],
        ["g5", foe("black", "black", "knight")],
      ]),
      "f4",
      right,
    ).includes("g5"),
  );
});

test("after a side capture the pawn continues from the landing square, never its old line", () => {
  const up = pawn(advanced("up", "right", "up"), "white", "white");
  assert.deepEqual(pawnPseudoLegalDestinations(board([["c5", up]]), "c5", up), [
    "c6",
  ]);
  assert.deepEqual(sorted(pawnAttackSquares("c5", up)), ["b6", "d6"]);
  const blocked = board([
    ["c5", up],
    ["d5", foe("black", "black", "knight")],
    ["b5", foe("black", "black", "knight")],
    ["c4", foe("black", "black", "knight")],
    ["d4", foe("black", "black", "knight")],
  ]);
  assert.deepEqual(pawnPseudoLegalDestinations(blocked, "c5", up), ["c6"]);

  const right = pawn(advanced("up", "right", "right"), "white", "white");
  assert.deepEqual(
    pawnPseudoLegalDestinations(board([["e3", right]]), "e3", right),
    ["f3"],
  );
  assert.deepEqual(sorted(pawnAttackSquares("e3", right)), ["f2", "f4"]);
});

test("pawn state keeps the original army when the controller differs", () => {
  const mover = pawn(ordinary("up"), "red", "white");
  const occupied = board([
    ["c5", mover],
    ["b6", foe("white", "green", "knight")],
    ["d6", foe("red", "black", "knight")],
  ]);
  assert.deepEqual(sorted(pawnPseudoLegalDestinations(occupied, "c5", mover)), [
    "b6",
    "c6",
  ]);
  assert.equal(mover.army, "white");
  assert.deepEqual(promotedPiece(mover, "queen"), {
    controller: "red",
    army: "white",
    type: "queen",
  });
});

interface PromotionCase {
  readonly pawn: PawnPiece;
  readonly from: Square;
  readonly to: Square;
}

const PROMOTION_CASES: readonly PromotionCase[] = [
  { pawn: pawn(ordinary("up")), from: "d11", to: "d12" },
  { pawn: pawn(ordinary("right")), from: "k3", to: "l3" },
  { pawn: pawn(ordinary("down")), from: "c2", to: "c1" },
  { pawn: pawn(ordinary("left")), from: "b3", to: "a3" },
  { pawn: pawn(advanced("up", "right", "up")), from: "d11", to: "d12" },
  { pawn: pawn(advanced("up", "right", "right")), from: "k3", to: "l3" },
  { pawn: pawn(advanced("up", "right")), from: "k11", to: "k12" },
  { pawn: pawn(advanced("up", "right")), from: "k11", to: "l11" },
];

test("promotion is triggered on the boundary of the pawn's direction", () => {
  for (const { pawn: mover, from, to } of PROMOTION_CASES) {
    assert.equal(
      pawnTransition(from, to, mover).promotes,
      true,
      `${from}-${to}`,
    );
  }
});

test("a move that does not reach the boundary does not promote", () => {
  assert.equal(
    pawnTransition("d10", "d11", pawn(ordinary("up"))).promotes,
    false,
  );
  assert.equal(
    pawnTransition("e5", "f5", pawn(advanced("up", "right"))).promotes,
    false,
  );
});

test("an occupied promotion edge cannot be entered", () => {
  const mover = pawn(advanced("up", "right", "up"), "white", "white");
  const occupied = board([
    ["d11", mover],
    ["d12", foe("red", "red", "knight")],
  ]);
  assert.deepEqual(pawnPseudoLegalDestinations(occupied, "d11", mover), []);
});

test("a capture onto the promotion edge promotes in the same move for the same army", () => {
  const mover = pawn(advanced("up", "right", "up"), "white", "white");
  const occupied = board([
    ["a1", foe("white", "white", "king")],
    ["l1", foe("green", "green", "king")],
    ["a10", foe("red", "red", "king")],
    ["l10", foe("black", "black", "king")],
    ["d11", mover],
    ["e12", foe("red", "red", "knight")],
  ]);
  assert.ok(
    pawnPseudoLegalDestinations(occupied, "d11", mover).includes("e12"),
  );
  const result = pawnTransition("d11", "e12", mover);
  assert.equal(result.promotes, true);
  assert.deepEqual(result.state, advanced("up", "right", "up"));
  assert.deepEqual(
    [...PROMOTION_CHOICES],
    ["queen", "rook", "bishop", "knight"],
  );
  for (const choice of PROMOTION_CHOICES) {
    assert.deepEqual(promotedPiece(mover, choice), {
      controller: "white",
      army: "white",
      type: choice,
    });
  }
});

test("an uncommitted pawn reaching the far edge by a center capture also promotes", () => {
  const mover = pawn(advanced("up", "right"), "white", "white");
  const occupied = board([
    ["k11", mover],
    ["l12", foe("black", "black", "knight")],
  ]);
  assert.ok(
    pawnPseudoLegalDestinations(occupied, "k11", mover).includes("l12"),
  );
  const result = pawnTransition("k11", "l12", mover);
  assert.equal(result.promotes, true);
  assert.deepEqual(result.state, advanced("up", "right"));
});

test("pawn geometry clips at the board edge", () => {
  const up = pawn(ordinary("up"), "white", "white");
  assert.deepEqual(pawnAttackSquares("c12", up), []);
  assert.deepEqual(
    pawnPseudoLegalDestinations(board([["c12", up]]), "c12", up),
    [],
  );
  const right = pawn(ordinary("right"), "white", "white");
  assert.deepEqual(pawnAttackSquares("l3", right), []);
  assert.deepEqual(
    pawnPseudoLegalDestinations(board([["l3", right]]), "l3", right),
    [],
  );
  assert.deepEqual(pawnAttackSquares("a5", up), ["b6"]);
});
