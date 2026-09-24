/**
 * Golden opening position for the default four-army Quaternity game.
 *
 * Authority (see docs/fixtures/opening-position.md):
 * - Official illustrated quick rules PDF
 *   https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf
 * - Official tutorial quick-start chapter 1
 *   https://play.quaternity.com/how-to-play/quick-start/chapter1
 *
 * The illustrated board picture governs the corner/army arrangement (spec 001/D9/001/D2);
 * the patent is supporting evidence only and its pawn listings are not used.
 *
 * These facts were reviewed on a delegated basis (spec 001/D24): all 64 tutorial
 * `basicPosition` facts were compared against this fixture with zero discrepancies,
 * the pictured corners were checked against the official illustrated rules, and a
 * read-only reviewer returned OK. The owner delegated the decision and did not
 * personally perform the square-by-square check. No movement logic lives here.
 */

import type { ArmyColor, PieceType, Square } from "../board.ts";

// The board vocabulary is owned by ../board.ts (single authority) and re-exported
// here so existing importers keep their paths. This fixture holds only the
// reviewed opening data.
export type { ArmyColor, File, PieceType, Rank, Square } from "../board.ts";

export interface OpeningPiece {
  readonly square: Square;
  readonly army: ArmyColor;
  readonly type: PieceType;
}

export { ARMY_COLORS, FILES, PIECE_TYPES, RANKS } from "../board.ts";

/** Clockwise turn order beginning with White (spec: rules authority). */
export const TURN_ORDER: readonly ArmyColor[] = [
  "white",
  "red",
  "black",
  "green",
];

/**
 * Home corner of each army as pictured (a1 bottom-left): White bottom-left,
 * Red top-left, Black top-right, Green bottom-right.
 */
export const HOME_KING_SQUARE: Readonly<Record<ArmyColor, Square>> = {
  white: "a1",
  red: "a12",
  black: "l12",
  green: "l1",
};

/**
 * The two Advanced Central Pawns in each army, transcribed from the picture.
 * Their forward direction is chosen on first non-main-diagonal move and is not
 * encoded here; this fixture records only their opening squares.
 */
export const ADVANCED_CENTRAL_PAWNS: Readonly<
  Record<ArmyColor, readonly [Square, Square]>
> = {
  white: ["d4", "e5"],
  red: ["d9", "e8"],
  black: ["i9", "h8"],
  green: ["i4", "h5"],
};

const white: readonly OpeningPiece[] = [
  { square: "a1", army: "white", type: "king" },
  { square: "b2", army: "white", type: "queen" },
  { square: "a4", army: "white", type: "rook" },
  { square: "d1", army: "white", type: "rook" },
  { square: "b4", army: "white", type: "knight" },
  { square: "c4", army: "white", type: "knight" },
  { square: "d2", army: "white", type: "bishop" },
  { square: "d3", army: "white", type: "bishop" },
  { square: "a5", army: "white", type: "pawn" },
  { square: "b5", army: "white", type: "pawn" },
  { square: "c5", army: "white", type: "pawn" },
  { square: "d4", army: "white", type: "pawn" },
  { square: "e5", army: "white", type: "pawn" },
  { square: "e1", army: "white", type: "pawn" },
  { square: "e2", army: "white", type: "pawn" },
  { square: "e3", army: "white", type: "pawn" },
];

const red: readonly OpeningPiece[] = [
  { square: "a12", army: "red", type: "king" },
  { square: "b11", army: "red", type: "queen" },
  { square: "a9", army: "red", type: "rook" },
  { square: "d12", army: "red", type: "rook" },
  { square: "d10", army: "red", type: "knight" },
  { square: "d11", army: "red", type: "knight" },
  { square: "b9", army: "red", type: "bishop" },
  { square: "c9", army: "red", type: "bishop" },
  { square: "a8", army: "red", type: "pawn" },
  { square: "b8", army: "red", type: "pawn" },
  { square: "c8", army: "red", type: "pawn" },
  { square: "d9", army: "red", type: "pawn" },
  { square: "e8", army: "red", type: "pawn" },
  { square: "e10", army: "red", type: "pawn" },
  { square: "e11", army: "red", type: "pawn" },
  { square: "e12", army: "red", type: "pawn" },
];

const black: readonly OpeningPiece[] = [
  { square: "l12", army: "black", type: "king" },
  { square: "k11", army: "black", type: "queen" },
  { square: "i12", army: "black", type: "rook" },
  { square: "l9", army: "black", type: "rook" },
  { square: "j9", army: "black", type: "knight" },
  { square: "k9", army: "black", type: "knight" },
  { square: "i10", army: "black", type: "bishop" },
  { square: "i11", army: "black", type: "bishop" },
  { square: "h8", army: "black", type: "pawn" },
  { square: "h10", army: "black", type: "pawn" },
  { square: "h11", army: "black", type: "pawn" },
  { square: "h12", army: "black", type: "pawn" },
  { square: "i9", army: "black", type: "pawn" },
  { square: "j8", army: "black", type: "pawn" },
  { square: "k8", army: "black", type: "pawn" },
  { square: "l8", army: "black", type: "pawn" },
];

const green: readonly OpeningPiece[] = [
  { square: "l1", army: "green", type: "king" },
  { square: "k2", army: "green", type: "queen" },
  { square: "i1", army: "green", type: "rook" },
  { square: "l4", army: "green", type: "rook" },
  { square: "i2", army: "green", type: "knight" },
  { square: "i3", army: "green", type: "knight" },
  { square: "j4", army: "green", type: "bishop" },
  { square: "k4", army: "green", type: "bishop" },
  { square: "h1", army: "green", type: "pawn" },
  { square: "h2", army: "green", type: "pawn" },
  { square: "h3", army: "green", type: "pawn" },
  { square: "h5", army: "green", type: "pawn" },
  { square: "i4", army: "green", type: "pawn" },
  { square: "j5", army: "green", type: "pawn" },
  { square: "k5", army: "green", type: "pawn" },
  { square: "l5", army: "green", type: "pawn" },
];

/** All 64 opening facts, ordered by army (White, Red, Black, Green). */
export const OPENING_POSITION: readonly OpeningPiece[] = [
  ...white,
  ...red,
  ...black,
  ...green,
];

const bySquare: ReadonlyMap<Square, OpeningPiece> = new Map(
  OPENING_POSITION.map((piece) => [piece.square, piece]),
);

/** The opening piece on `square`, or undefined if the square starts empty. */
export function openingPieceAt(square: Square): OpeningPiece | undefined {
  return bySquare.get(square);
}

/** The opening pieces belonging to one army, in fixture order. */
export function openingPiecesOf(army: ArmyColor): readonly OpeningPiece[] {
  return OPENING_POSITION.filter((piece) => piece.army === army);
}
