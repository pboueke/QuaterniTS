import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ARMY_COLORS,
  FILES,
  PIECE_TYPES,
  RANKS,
  offsetSquare,
  parseSquare,
  type Square,
} from "./board.ts";

test("the board vocabulary is the 12 files by 12 ranks of Quaternity", () => {
  assert.deepEqual(
    [...FILES],
    ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"],
  );
  assert.deepEqual([...RANKS], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual([...ARMY_COLORS], ["white", "red", "black", "green"]);
  assert.deepEqual(
    [...PIECE_TYPES],
    ["king", "queen", "rook", "knight", "bishop", "pawn"],
  );
});

test("parseSquare accepts every on-board coordinate", () => {
  for (const file of FILES) {
    for (const rank of RANKS) {
      const square: Square = `${file}${rank}`;
      assert.equal(parseSquare(square), square);
    }
  }
  assert.equal(parseSquare("a1"), "a1");
  assert.equal(parseSquare("j10"), "j10");
  assert.equal(parseSquare("l12"), "l12");
});

test("parseSquare rejects off-board files, off-board ranks and malformed text", () => {
  const rejected = [
    "m1",
    "n12",
    "a0",
    "a13",
    "l13",
    "A1",
    "a01",
    "1a",
    "",
    "a",
    "12",
    "aa1",
    "a1 ",
  ];
  for (const text of rejected) {
    assert.equal(parseSquare(text), undefined, `parseSquare(${text})`);
  }
});

test("offsetSquare walks the board by file and rank deltas", () => {
  assert.equal(offsetSquare("d4", 1, 2), "e6");
  assert.equal(offsetSquare("d4", -1, -2), "c2");
  assert.equal(offsetSquare("a1", 0, 0), "a1");
  assert.equal(offsetSquare("l12", 0, 0), "l12");
});

test("offsetSquare returns undefined when the target leaves the board", () => {
  assert.equal(offsetSquare("a1", -1, 0), undefined);
  assert.equal(offsetSquare("l12", 1, 0), undefined);
  assert.equal(offsetSquare("a1", 0, -1), undefined);
  assert.equal(offsetSquare("l12", 0, 1), undefined);
  assert.equal(offsetSquare("a1", -1, -1), undefined);
  assert.equal(offsetSquare("l12", 1, 1), undefined);
});
