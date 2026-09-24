/**
 * Board vocabulary and coordinate helpers for the Quaternity 12x12 board.
 *
 * This is the single authority for the file/rank/square/army/piece vocabulary.
 * The opening fixture re-exports it so existing callers keep their paths. Only
 * pure functions live here: no board state, no mutable module state.
 *
 * Files run `a`–`l` (left to right) and ranks `1`–`12` (bottom to top), with
 * `a1` at White's pictured bottom-left corner.
 */

export type File =
  "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type Square = `${File}${Rank}`;

export type ArmyColor = "white" | "red" | "black" | "green";
export type PieceType =
  "king" | "queen" | "rook" | "knight" | "bishop" | "pawn";

export const FILES: readonly File[] = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
];
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const ARMY_COLORS: readonly ArmyColor[] = [
  "white",
  "red",
  "black",
  "green",
];
export const PIECE_TYPES: readonly PieceType[] = [
  "king",
  "queen",
  "rook",
  "knight",
  "bishop",
  "pawn",
];

/** Exactly one on-board coordinate: file `a`–`l` and rank `1`–`12`. */
const SQUARE_PATTERN = /^[a-l](?:[1-9]|1[0-2])$/;

const FILE_CODE = "a".charCodeAt(0);
const FILE_COUNT = FILES.length;
const RANK_MIN = 1;
const RANK_MAX = RANKS.length;

/** Parse `text` into a Square, or `undefined` when off-board or malformed. */
export function parseSquare(text: string): Square | undefined {
  return SQUARE_PATTERN.test(text) ? (text as Square) : undefined;
}

/**
 * The square `fileDelta` files and `rankDelta` ranks from `from`, or `undefined`
 * when the result leaves the board. Deltas may be negative.
 */
export function offsetSquare(
  from: Square,
  fileDelta: number,
  rankDelta: number,
): Square | undefined {
  const file = from.charCodeAt(0) - FILE_CODE + fileDelta;
  const rank = Number(from.slice(1)) + rankDelta;
  if (file < 0 || file >= FILE_COUNT || rank < RANK_MIN || rank > RANK_MAX) {
    return undefined;
  }
  return `${String.fromCharCode(FILE_CODE + file)}${rank}` as Square;
}
