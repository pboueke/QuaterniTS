import { test } from "node:test";
import assert from "node:assert/strict";

import { offsetSquare, type ArmyColor, type Square } from "./board.ts";
import {
  attackSquares,
  pseudoLegalDestinations,
  type BoardPiece,
  type GeometricPieceType,
} from "./geometry.ts";

/** The geometry tests only build non-pawn boards; pawns have their own suite. */
type NonPawnBoard = ReadonlyMap<Square, BoardPiece>;

const A_CODE = "a".charCodeAt(0);
const ARMY_CYCLE: readonly ArmyColor[] = ["white", "red", "black", "green"];

function piece(
  controller: ArmyColor,
  army: ArmyColor,
  type: GeometricPieceType,
): BoardPiece {
  return { controller, army, type };
}

function board(
  entries: readonly (readonly [Square, BoardPiece])[],
): NonPawnBoard {
  return new Map(entries);
}

function sorted(squares: readonly Square[]): Square[] {
  return [...squares].sort();
}

function rotateSquare(square: Square, turns: number): Square {
  let file = square.charCodeAt(0) - A_CODE;
  let rank = Number(square.slice(1)) - 1;
  for (let turn = 0; turn < turns; turn += 1) {
    [file, rank] = [rank, 11 - file];
  }
  return `${String.fromCharCode(A_CODE + file)}${rank + 1}` as Square;
}

function rotateArmy(army: ArmyColor, turns: number): ArmyColor {
  const index = ARMY_CYCLE.indexOf(army);
  return ARMY_CYCLE[(index + turns) % ARMY_CYCLE.length] as ArmyColor;
}

function rotateBoard(source: NonPawnBoard, turns: number): NonPawnBoard {
  return new Map(
    [...source].map(([square, onSquare]) => [
      rotateSquare(square, turns),
      {
        controller: rotateArmy(onSquare.controller, turns),
        army: rotateArmy(onSquare.army, turns),
        type: onSquare.type,
      },
    ]),
  );
}

test("king attacks the eight surrounding squares", () => {
  assert.deepEqual(sorted(attackSquares(board([]), "f6", "king")), [
    "e5",
    "e6",
    "e7",
    "f5",
    "f7",
    "g5",
    "g6",
    "g7",
  ]);
});

test("king attacks are clipped at the board corner", () => {
  assert.deepEqual(sorted(attackSquares(board([]), "a1", "king")), [
    "a2",
    "b1",
    "b2",
  ]);
});

test("knight jumps in eight L-shapes", () => {
  assert.deepEqual(sorted(attackSquares(board([]), "c4", "knight")), [
    "a3",
    "a5",
    "b2",
    "b6",
    "d2",
    "d6",
    "e3",
    "e5",
  ]);
});

test("knight attacks are clipped at the board corner", () => {
  assert.deepEqual(sorted(attackSquares(board([]), "a1", "knight")), [
    "b3",
    "c2",
  ]);
});

test("rook sweeps its whole rank and file on an empty board", () => {
  assert.deepEqual(sorted(attackSquares(board([]), "d4", "rook")), [
    "a4",
    "b4",
    "c4",
    "d1",
    "d10",
    "d11",
    "d12",
    "d2",
    "d3",
    "d5",
    "d6",
    "d7",
    "d8",
    "d9",
    "e4",
    "f4",
    "g4",
    "h4",
    "i4",
    "j4",
    "k4",
    "l4",
  ]);
});

test("bishop sweeps both diagonals on an empty board", () => {
  assert.deepEqual(sorted(attackSquares(board([]), "d4", "bishop")), [
    "a1",
    "a7",
    "b2",
    "b6",
    "c3",
    "c5",
    "e3",
    "e5",
    "f2",
    "f6",
    "g1",
    "g7",
    "h8",
    "i9",
    "j10",
    "k11",
    "l12",
  ]);
});

test("queen combines the rook and bishop sweeps", () => {
  assert.deepEqual(sorted(attackSquares(board([]), "d4", "queen")), [
    "a1",
    "a4",
    "a7",
    "b2",
    "b4",
    "b6",
    "c3",
    "c4",
    "c5",
    "d1",
    "d10",
    "d11",
    "d12",
    "d2",
    "d3",
    "d5",
    "d6",
    "d7",
    "d8",
    "d9",
    "e3",
    "e4",
    "e5",
    "f2",
    "f4",
    "f6",
    "g1",
    "g4",
    "g7",
    "h4",
    "h8",
    "i4",
    "i9",
    "j10",
    "j4",
    "k11",
    "k4",
    "l12",
    "l4",
  ]);
});

test("a sliding ray stops at the first occupied square, friend or foe alike", () => {
  const occupied = board([
    ["d6", piece("white", "white", "knight")],
    ["d2", piece("black", "black", "knight")],
  ]);
  const attacks = sorted(attackSquares(occupied, "d4", "rook"));
  assert.ok(attacks.includes("d5"));
  assert.ok(attacks.includes("d6"));
  assert.ok(!attacks.includes("d7"));
  assert.ok(attacks.includes("d3"));
  assert.ok(attacks.includes("d2"));
  assert.ok(!attacks.includes("d1"));
});

test("knight jumps: surrounding pieces do not block its eight L-moves", () => {
  const mover = piece("white", "white", "knight");
  const occupied = board([
    ["d4", mover],
    ["c3", piece("white", "white", "bishop")],
    ["c4", piece("white", "white", "bishop")],
    ["c5", piece("white", "white", "bishop")],
    ["d3", piece("white", "white", "bishop")],
    ["d5", piece("white", "white", "bishop")],
    ["e4", piece("white", "white", "bishop")],
    ["f5", piece("black", "black", "bishop")],
  ]);
  const expected = ["b3", "b5", "c2", "c6", "e2", "e6", "f3", "f5"];
  assert.deepEqual(sorted(attackSquares(occupied, "d4", "knight")), expected);
  assert.deepEqual(
    sorted(pseudoLegalDestinations(occupied, "d4", mover)),
    expected,
  );
});

test("pseudo-legal destinations drop friendly squares and keep enemy ones", () => {
  const mover = piece("white", "white", "rook");
  const occupied = board([
    ["d4", mover],
    ["d6", piece("white", "red", "knight")],
    ["d2", piece("red", "white", "knight")],
    ["b4", piece("white", "green", "knight")],
    ["f4", piece("black", "black", "knight")],
  ]);
  const destinations = sorted(pseudoLegalDestinations(occupied, "d4", mover));
  // Up: d5 empty is kept, d6 is controlled by White (its army is Red) so dropped.
  assert.ok(destinations.includes("d5"));
  assert.ok(!destinations.includes("d6"));
  assert.ok(!destinations.includes("d7"));
  // Down: d3 empty, d2 is controlled by Red (its army is White) so capturable.
  assert.ok(destinations.includes("d3"));
  assert.ok(destinations.includes("d2"));
  // Left: c4 empty, b4 is controlled by White (its army is Green) so dropped.
  assert.ok(destinations.includes("c4"));
  assert.ok(!destinations.includes("b4"));
  assert.ok(!destinations.includes("a4"));
  // Right: e4 empty, f4 is controlled by Black so capturable.
  assert.ok(destinations.includes("e4"));
  assert.ok(destinations.includes("f4"));
  for (const square of destinations) {
    const occupant = occupied.get(square);
    if (occupant) {
      assert.notEqual(occupant.controller, mover.controller);
    }
  }
});

test("attacks include friendly-occupied squares that destinations exclude", () => {
  const mover = piece("white", "white", "rook");
  const occupied = board([
    ["d4", mover],
    ["d6", piece("white", "white", "bishop")],
  ]);
  assert.ok(attackSquares(occupied, "d4", "rook").includes("d6"));
  assert.ok(!pseudoLegalDestinations(occupied, "d4", mover).includes("d6"));
});

test("an enemy king square is attacked but is never a pseudo-legal destination", () => {
  const mover = piece("white", "white", "rook");
  const occupied = board([
    ["d4", mover],
    ["d6", piece("black", "black", "king")],
  ]);
  const attacks = attackSquares(occupied, "d4", "rook");
  assert.ok(attacks.includes("d6"));
  const destinations = pseudoLegalDestinations(occupied, "d4", mover);
  assert.ok(destinations.includes("d5"));
  assert.ok(!destinations.includes("d6"));
  assert.ok(!destinations.includes("d7"));
});

test("adjacent kings attack each other's squares but cannot capture", () => {
  const occupied = board([
    ["e5", piece("white", "white", "king")],
    ["e6", piece("black", "black", "king")],
  ]);
  assert.ok(attackSquares(occupied, "e5", "king").includes("e6"));
  assert.ok(attackSquares(occupied, "e6", "king").includes("e5"));
  assert.ok(
    !pseudoLegalDestinations(
      occupied,
      "e5",
      piece("white", "white", "king"),
    ).includes("e6"),
  );
  assert.ok(
    !pseudoLegalDestinations(
      occupied,
      "e6",
      piece("black", "black", "king"),
    ).includes("e5"),
  );
});

test("king geometry has no castling: no two-square destination on the home rank", () => {
  const mover = piece("white", "white", "king");
  const occupied = board([
    ["e1", mover],
    ["a1", piece("white", "white", "rook")],
    ["l1", piece("white", "white", "rook")],
  ]);
  assert.deepEqual(sorted(pseudoLegalDestinations(occupied, "e1", mover)), [
    "d1",
    "d2",
    "e2",
    "f1",
    "f2",
  ]);
});

interface RotationBlocker {
  readonly fileDelta: number;
  readonly rankDelta: number;
  readonly controller: ArmyColor;
  readonly army: ArmyColor;
}

interface RotationCase {
  readonly from: Square;
  readonly type: GeometricPieceType;
  readonly blockers: readonly RotationBlocker[];
}

const ROTATION_CASES: readonly RotationCase[] = [
  {
    from: "f6",
    type: "king",
    blockers: [
      { fileDelta: -1, rankDelta: -1, controller: "white", army: "green" },
      { fileDelta: 1, rankDelta: 1, controller: "red", army: "red" },
    ],
  },
  {
    from: "c4",
    type: "knight",
    blockers: [
      { fileDelta: 0, rankDelta: 1, controller: "white", army: "green" },
      { fileDelta: 1, rankDelta: 0, controller: "red", army: "red" },
    ],
  },
  {
    from: "d4",
    type: "rook",
    blockers: [
      { fileDelta: 0, rankDelta: 2, controller: "white", army: "green" },
      { fileDelta: -2, rankDelta: 0, controller: "red", army: "red" },
    ],
  },
  {
    from: "d4",
    type: "bishop",
    blockers: [
      { fileDelta: 2, rankDelta: 2, controller: "white", army: "green" },
      { fileDelta: -2, rankDelta: -2, controller: "red", army: "red" },
    ],
  },
  {
    from: "f6",
    type: "queen",
    blockers: [
      { fileDelta: 0, rankDelta: 3, controller: "white", army: "green" },
      { fileDelta: -3, rankDelta: 3, controller: "red", army: "red" },
    ],
  },
];

test("representative positions rotate across all four armies", () => {
  for (const { from, type, blockers } of ROTATION_CASES) {
    const mover = piece("white", "white", type);
    const entries: (readonly [Square, BoardPiece])[] = [[from, mover]];
    for (const blocker of blockers) {
      const square = offsetSquare(from, blocker.fileDelta, blocker.rankDelta);
      assert.ok(square, `blocker offset for ${type} from ${from}`);
      entries.push([square, piece(blocker.controller, blocker.army, "bishop")]);
    }
    const base = board(entries);
    const expected = sorted(pseudoLegalDestinations(base, from, mover));

    for (let turns = 1; turns < 4; turns += 1) {
      const rotated = rotateBoard(base, turns);
      const rotatedFrom = rotateSquare(from, turns);
      const rotatedMover = rotated.get(rotatedFrom);
      assert.ok(rotatedMover, `mover survives rotation ${turns}`);
      // The claim "all four armies" only holds if the mover's army/controller
      // actually rotate with the board, not just the destination geometry.
      assert.equal(
        rotatedMover.controller,
        rotateArmy("white", turns),
        `mover controller rotates to ${rotateArmy("white", turns)}`,
      );
      assert.equal(
        rotatedMover.army,
        rotateArmy("white", turns),
        `mover army rotates to ${rotateArmy("white", turns)}`,
      );
      assert.equal(rotatedMover.type, type, "mover type survives rotation");
      assert.deepEqual(
        sorted(pseudoLegalDestinations(rotated, rotatedFrom, rotatedMover)),
        sorted(expected.map((square) => rotateSquare(square, turns))),
        `${type} from ${from} rotated ${turns} quarter-turn(s)`,
      );
    }
  }
});
