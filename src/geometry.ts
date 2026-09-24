/**
 * Pure non-pawn piece geometry for the Quaternity 12x12 board.
 *
 * This is the Phase 2A slice: attack squares and pseudo-legal destinations for
 * king, queen, rook, bishop and knight. It is deliberately narrow:
 *
 * - attack squares are geometry plus occupancy: a sliding ray stops at the first
 *   occupied square (which it still attacks), while leapers ignore occupancy and
 *   friendly pieces are still "attacked" squares;
 * - pseudo-legal destinations additionally drop squares held by the mover's own
 *   controller and never allow capturing a king;
 * - friend/foe is decided by `controller`, not the retained `army` colour, so an
 *   assimilated piece is a friendly blocker while an enemy-controlled piece of
 *   the mover's own colour is capturable;
 * - `Board` holds every occupant, pawns included, but this module only generates
 *   geometry for `GeometricPieceType`; pawn geometry and state live in ./pawn.ts.
 *
 * No pawn geometry, check/mate, frozen-army, castling, history or turn legality
 * lives here, and there is no mutable module state.
 */
import {
  offsetSquare,
  type ArmyColor,
  type PieceType,
  type Square,
} from "./board.ts";
import type { PawnPiece } from "./pawn.ts";

/** Non-pawn piece types, derived from the single board vocabulary. */
export type GeometricPieceType = Exclude<PieceType, "pawn">;

/** A non-pawn piece on the board, identified by who controls it and what it is. */
export interface BoardPiece {
  /** Army that currently controls the piece (differs from `army` when assimilated). */
  readonly controller: ArmyColor;
  /** Army colour the piece was created with; retained identity, not read here. */
  readonly army: ArmyColor;
  readonly type: GeometricPieceType;
}

/** Any piece that can occupy a square: a non-pawn piece or a pawn. */
export type BoardOccupant = BoardPiece | PawnPiece;

/** Immutable occupancy: square to occupant. Caller-supplied, never global. */
export type Board = ReadonlyMap<Square, BoardOccupant>;

type Offset = readonly [fileDelta: number, rankDelta: number];

const KING_STEPS: readonly Offset[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
const KNIGHT_JUMPS: readonly Offset[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const ROOK_DIRECTIONS: readonly Offset[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const BISHOP_DIRECTIONS: readonly Offset[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const QUEEN_DIRECTIONS: readonly Offset[] = [
  ...ROOK_DIRECTIONS,
  ...BISHOP_DIRECTIONS,
];

/** Leaper targets: every offset that lands on the board, ignoring occupancy. */
function leapSquares(from: Square, offsets: readonly Offset[]): Square[] {
  const squares: Square[] = [];
  for (const [fileDelta, rankDelta] of offsets) {
    const target = offsetSquare(from, fileDelta, rankDelta);
    if (target !== undefined) {
      squares.push(target);
    }
  }
  return squares;
}

/** Slider targets: each ray runs until it leaves the board or hits a piece. */
function raySquares(
  board: Board,
  from: Square,
  directions: readonly Offset[],
): Square[] {
  const squares: Square[] = [];
  for (const [fileDelta, rankDelta] of directions) {
    let target = offsetSquare(from, fileDelta, rankDelta);
    while (target !== undefined) {
      squares.push(target);
      if (board.has(target)) {
        break;
      }
      target = offsetSquare(target, fileDelta, rankDelta);
    }
  }
  return squares;
}

/**
 * Squares `type` attacks from `from` given the board's occupancy.
 *
 * Occupancy only truncates sliding rays (the first piece is attacked, then the
 * ray stops); leapers ignore occupancy. Friendly pieces are included: whether a
 * square is attacked does not depend on who stands on it.
 */
export function attackSquares(
  board: Board,
  from: Square,
  type: GeometricPieceType,
): readonly Square[] {
  switch (type) {
    case "king":
      return leapSquares(from, KING_STEPS);
    case "knight":
      return leapSquares(from, KNIGHT_JUMPS);
    case "rook":
      return raySquares(board, from, ROOK_DIRECTIONS);
    case "bishop":
      return raySquares(board, from, BISHOP_DIRECTIONS);
    case "queen":
      return raySquares(board, from, QUEEN_DIRECTIONS);
  }
}

/**
 * Squares `piece` may move to, ignoring check, pins and turn order.
 *
 * Starts from {@link attackSquares} and drops squares held by the mover's own
 * controller plus any king square, so a king is never captured. This is not a
 * legality filter: it does not consider check, frozen armies or history.
 */
export function pseudoLegalDestinations(
  board: Board,
  from: Square,
  piece: BoardPiece,
): readonly Square[] {
  return attackSquares(board, from, piece.type).filter((square) => {
    const occupant = board.get(square);
    if (occupant === undefined) {
      return true;
    }
    if (occupant.controller === piece.controller) {
      return false;
    }
    return occupant.type !== "king";
  });
}
