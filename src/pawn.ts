/**
 * Pure pawn geometry and movement state for the Quaternity 12x12 board.
 *
 * Pawns are stateful in a way the non-pawn geometry is not: each pawn moves
 * perpendicular to the line it stands on, and an advanced central pawn chooses
 * (then keeps) a forward direction. That direction/commitment is carried as
 * immutable explicit data on the piece, never re-derived from the square it
 * happens to occupy, so a capture cannot silently change a pawn's axis.
 *
 * This slice is deliberately narrow: one-square forward moves, both forward
 * diagonal captures, the advanced pawn's three-square attack set and the
 * commitment/promotion state transitions. There is no en passant, castling or
 * double-step, no check/mate/frozen-army/turn legality, no history, and no
 * mutable module state.
 */
import { offsetSquare, type ArmyColor, type Square } from "./board.ts";
import type { Board, BoardPiece, GeometricPieceType } from "./geometry.ts";

/** One forward axis of a pawn's movement, independent of the board square. */
export type PawnDirection = "up" | "down" | "left" | "right";

/** An ordinary pawn: one fixed forward direction for its whole life. */
export interface OrdinaryPawnState {
  readonly kind: "ordinary";
  readonly direction: PawnDirection;
}

/**
 * An advanced central pawn. It may move along `vertical` or `horizontal` until
 * its first straight move or side capture sets `committed`; a toward-center
 * main-diagonal capture leaves `committed` undefined.
 */
export interface AdvancedPawnState {
  readonly kind: "advanced";
  readonly vertical: PawnDirection;
  readonly horizontal: PawnDirection;
  readonly committed: PawnDirection | undefined;
}

export type PawnState = OrdinaryPawnState | AdvancedPawnState;

/** A pawn on the board: identity plus its explicit movement state. */
export interface PawnPiece {
  /** Army that currently controls the pawn (differs from `army` when assimilated). */
  readonly controller: ArmyColor;
  /** Army colour the pawn was created with; retained through captures. */
  readonly army: ArmyColor;
  readonly type: "pawn";
  readonly state: PawnState;
}

/** A piece an advanced pawn may promote to: never a king or a pawn. */
export type PromotionPieceType = Exclude<GeometricPieceType, "king">;

/** The same-army promotion choices, in a fixed order (chapter 12 / PDF rule 6). */
export const PROMOTION_CHOICES: readonly PromotionPieceType[] = [
  "queen",
  "rook",
  "bishop",
  "knight",
];

/** The two forward axes of each army's advanced central pawns (spec 001/D28). */
export const ADVANCED_PAWN_AXES: Readonly<
  Record<ArmyColor, readonly [PawnDirection, PawnDirection]>
> = {
  white: ["up", "right"],
  red: ["down", "right"],
  black: ["down", "left"],
  green: ["up", "left"],
};

/** The result of moving a pawn: its new state and whether promotion is due. */
export interface PawnTransition {
  readonly state: PawnState;
  readonly promotes: boolean;
}

type Offset = readonly [fileDelta: number, rankDelta: number];

const DIRECTION_OFFSET: Readonly<Record<PawnDirection, Offset>> = {
  up: [0, 1],
  down: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

/** The two diagonals forward of a single movement direction. */
function diagonalOffsets(direction: PawnDirection): readonly [Offset, Offset] {
  const [fileDelta, rankDelta] = DIRECTION_OFFSET[direction];
  if (fileDelta === 0) {
    return [
      [-1, rankDelta],
      [1, rankDelta],
    ];
  }
  return [
    [fileDelta, -1],
    [fileDelta, 1],
  ];
}

/** The on-board diagonals forward of `direction`; off-board ones are clipped. */
function diagonalSquares(from: Square, direction: PawnDirection): Square[] {
  const squares: Square[] = [];
  for (const [fileDelta, rankDelta] of diagonalOffsets(direction)) {
    const target = offsetSquare(from, fileDelta, rankDelta);
    if (target !== undefined) {
      squares.push(target);
    }
  }
  return squares;
}

/** The forward directions still open to a pawn before its move. */
function openDirections(state: PawnState): readonly PawnDirection[] {
  if (state.kind === "ordinary") {
    return [state.direction];
  }
  return state.committed === undefined
    ? [state.vertical, state.horizontal]
    : [state.committed];
}

/**
 * Squares `pawn` attacks from `from`: the forward diagonals of each open
 * direction, clipped at the board edge. Occupancy does not matter, so an empty
 * or friendly square is still attacked; a pawn never attacks its forward square.
 */
export function pawnAttackSquares(
  from: Square,
  pawn: PawnPiece,
): readonly Square[] {
  const squares = new Set<Square>();
  for (const direction of openDirections(pawn.state)) {
    for (const target of diagonalSquares(from, direction)) {
      squares.add(target);
    }
  }
  return [...squares];
}

/**
 * Squares `pawn` may move to from `from`, ignoring check, pins and turn order.
 *
 * A forward square is kept only when it is empty (one square, never two), and a
 * diagonal square only when it holds an enemy-controlled, non-king piece. This
 * is not a legality filter: it does not consider check, frozen armies or history.
 */
export function pawnPseudoLegalDestinations(
  board: Board,
  from: Square,
  pawn: PawnPiece,
): readonly Square[] {
  const destinations: Square[] = [];
  for (const direction of openDirections(pawn.state)) {
    const [fileDelta, rankDelta] = DIRECTION_OFFSET[direction];
    const target = offsetSquare(from, fileDelta, rankDelta);
    if (target !== undefined && !board.has(target)) {
      destinations.push(target);
    }
  }
  for (const square of pawnAttackSquares(from, pawn)) {
    const occupant = board.get(square);
    if (
      occupant !== undefined &&
      occupant.controller !== pawn.controller &&
      occupant.type !== "king"
    ) {
      destinations.push(square);
    }
  }
  return destinations;
}

/** The direction an uncommitted advanced pawn commits to for `from` -> `to`. */
function commitmentFor(
  state: AdvancedPawnState,
  fileDelta: number,
  rankDelta: number,
): PawnDirection | undefined {
  const verticalDelta = DIRECTION_OFFSET[state.vertical][1];
  const horizontalDelta = DIRECTION_OFFSET[state.horizontal][0];
  if (fileDelta === 0 && rankDelta === verticalDelta) {
    return state.vertical;
  }
  if (rankDelta === 0 && fileDelta === horizontalDelta) {
    return state.horizontal;
  }
  if (fileDelta === horizontalDelta && rankDelta === verticalDelta) {
    return undefined;
  }
  return rankDelta === verticalDelta ? state.vertical : state.horizontal;
}

/** The state a pawn holds after `from` -> `to`; commitment is applied here. */
function committedState(from: Square, to: Square, state: PawnState): PawnState {
  if (state.kind === "ordinary" || state.committed !== undefined) {
    return state;
  }
  const fileDelta = to.charCodeAt(0) - from.charCodeAt(0);
  const rankDelta = Number(to.slice(1)) - Number(from.slice(1));
  const committed = commitmentFor(state, fileDelta, rankDelta);
  return committed === undefined
    ? state
    : {
        kind: "advanced",
        vertical: state.vertical,
        horizontal: state.horizontal,
        committed,
      };
}

/** True when `to` is the furthest edge of `direction` (the promotion boundary). */
function isEdge(to: Square, direction: PawnDirection): boolean {
  const [fileDelta, rankDelta] = DIRECTION_OFFSET[direction];
  return offsetSquare(to, fileDelta, rankDelta) === undefined;
}

/**
 * Whether reaching `to` forces promotion for `pawn`. A committed pawn promotes
 * on the edge of its direction; an uncommitted advanced pawn promotes on the
 * far edge of either axis (spec 001/D28 item 6).
 */
function isPromotionSquare(to: Square, pawn: PawnPiece): boolean {
  const state = pawn.state;
  if (state.kind === "ordinary") {
    return isEdge(to, state.direction);
  }
  if (state.committed !== undefined) {
    return isEdge(to, state.committed);
  }
  return isEdge(to, state.vertical) || isEdge(to, state.horizontal);
}

/**
 * The pawn state and promotion obligation after moving `pawn` from `from` to
 * `to`. The direction is stored explicitly, so it is never re-derived from `to`
 * after a capture: a side capture commits from the landing square, a
 * toward-center main-diagonal capture keeps the choice open, and an ordinary or
 * already committed pawn is unchanged.
 *
 * This is not a validator: it assumes `from` -> `to` is a pseudo-legal pawn
 * destination (see {@link pawnPseudoLegalDestinations}) and does not check the
 * turn, occupancy, check or the board edge. Callers must reject an illegal
 * `from` -> `to` before applying its result.
 */
export function pawnTransition(
  from: Square,
  to: Square,
  pawn: PawnPiece,
): PawnTransition {
  return {
    state: committedState(from, to, pawn.state),
    promotes: isPromotionSquare(to, pawn),
  };
}

/**
 * The same-army piece `pawn` becomes on promotion. It keeps the pawn's army
 * (never the controller) and may be a queen, rook, bishop or knight only.
 */
export function promotedPiece(
  pawn: PawnPiece,
  type: PromotionPieceType,
): BoardPiece {
  return { controller: pawn.controller, army: pawn.army, type };
}
