import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ADVANCED_CENTRAL_PAWNS,
  ARMY_COLORS,
  FILES,
  HOME_KING_SQUARE,
  OPENING_POSITION,
  RANKS,
  TURN_ORDER,
  openingPieceAt,
  openingPiecesOf,
  type ArmyColor,
  type PieceType,
  type Square,
} from "./openingPosition.ts";

const SQUARE_PATTERN = /^[a-l](?:[1-9]|1[0-2])$/;

const EXPECTED_PIECE_COUNTS: Readonly<Record<PieceType, number>> = {
  king: 1,
  queen: 1,
  rook: 2,
  knight: 2,
  bishop: 2,
  pawn: 8,
};

const KNOWN_OPENING_FACTS: readonly (readonly [
  Square,
  ArmyColor,
  PieceType,
])[] = [
  ["a1", "white", "king"],
  ["a12", "red", "king"],
  ["l12", "black", "king"],
  ["l1", "green", "king"],
  ["d4", "white", "pawn"],
  ["e5", "white", "pawn"],
  ["d9", "red", "pawn"],
  ["e8", "red", "pawn"],
  ["i9", "black", "pawn"],
  ["h8", "black", "pawn"],
  ["i4", "green", "pawn"],
  ["h5", "green", "pawn"],
];

test("fixture holds exactly 64 pieces", () => {
  assert.equal(OPENING_POSITION.length, 64);
});

test("each army contributes exactly 16 pieces", () => {
  assert.equal(ARMY_COLORS.length, 4);
  for (const army of ARMY_COLORS) {
    assert.equal(openingPiecesOf(army).length, 16, `${army} piece count`);
  }
  const total = ARMY_COLORS.reduce(
    (sum, army) => sum + openingPiecesOf(army).length,
    0,
  );
  assert.equal(total, OPENING_POSITION.length);
});

test("every occupied square is unique", () => {
  const squares = OPENING_POSITION.map((piece) => piece.square);
  assert.equal(new Set(squares).size, squares.length);
});

test("every square is a valid on-board coordinate", () => {
  for (const { square } of OPENING_POSITION) {
    assert.match(square, SQUARE_PATTERN, `square ${square}`);
    const file = square.slice(0, 1) as (typeof FILES)[number];
    const rank = Number(square.slice(1));
    assert.ok(FILES.includes(file), `file of ${square}`);
    assert.ok((RANKS as readonly number[]).includes(rank), `rank of ${square}`);
  }
});

test("each army has exactly one king on its pictured home square", () => {
  for (const army of ARMY_COLORS) {
    const kings = openingPiecesOf(army).filter(
      (piece) => piece.type === "king",
    );
    assert.equal(kings.length, 1, `${army} kings`);
    assert.equal(kings[0]?.square, HOME_KING_SQUARE[army]);
  }
});

test("each army has the standard piece composition", () => {
  for (const army of ARMY_COLORS) {
    const counts = new Map<PieceType, number>();
    for (const piece of openingPiecesOf(army)) {
      counts.set(piece.type, (counts.get(piece.type) ?? 0) + 1);
    }
    for (const [type, expected] of Object.entries(EXPECTED_PIECE_COUNTS)) {
      assert.equal(
        counts.get(type as PieceType) ?? 0,
        expected,
        `${army} ${type} count`,
      );
    }
    assert.equal(counts.size, Object.keys(EXPECTED_PIECE_COUNTS).length);
  }
});

test("both advanced central pawns of each army are on the pictured squares", () => {
  for (const army of ARMY_COLORS) {
    for (const square of ADVANCED_CENTRAL_PAWNS[army]) {
      const piece = openingPieceAt(square);
      assert.ok(piece, `piece at ${square}`);
      assert.equal(piece.army, army, `army at ${square}`);
      assert.equal(piece.type, "pawn", `type at ${square}`);
    }
  }
});

test("documented opening facts are present exactly as cited", () => {
  for (const [square, army, type] of KNOWN_OPENING_FACTS) {
    const piece = openingPieceAt(square);
    assert.ok(piece, `piece at ${square}`);
    assert.equal(piece.army, army, `army at ${square}`);
    assert.equal(piece.type, type, `type at ${square}`);
  }
});

test("turn order begins with White and is clockwise over four armies", () => {
  assert.deepEqual([...TURN_ORDER], ["white", "red", "black", "green"]);
  assert.equal(new Set(TURN_ORDER).size, TURN_ORDER.length);
});

test("no opening piece sits outside the four armies or the six piece types", () => {
  for (const { army, type } of OPENING_POSITION) {
    assert.ok(ARMY_COLORS.includes(army), `army ${army}`);
    assert.ok(type in EXPECTED_PIECE_COUNTS, `type ${type}`);
  }
});
