/**
 * Pure legal-move generation and pre-adjudication move application.
 *
 * This is the Phase 3B slice that sits on top of the position (./position.ts),
 * non-pawn geometry (./geometry.ts) and pawn state (./pawn.ts). It is
 * deliberately narrow and NOT a committed action:
 *
 * - {@link legalMoves} is a pure query for one **active** controller, resolved
 *   from the current army-to-controller mapping, so an assimilated army's moves
 *   are generated for whoever controls it (spec 001/D33). A frozen or eliminated
 *   controller has no legal moves.
 * - {@link applyPositionMove} validates a caller's from/to/promotion against the
 *   moves of the controller **on turn** and returns a **new validated Position**
 *   with the board, pawn state, promotion and capture applied. It leaves the
 *   input position, its records and the turn unchanged and does not mutate its
 *   argument. It does **not** advance the turn, resolve mate or adjudicate
 *   assimilation; the committed action, history and public `Quaternity` API come
 *   later.
 *
 * Legality is the pseudo-legal geometry of the existing modules filtered by one
 * rule: a move is legal only when, in the resulting position, no king still
 * controlled by the acting controller is attacked by any different **active**
 * controller (spec 001/D31/001/D33). That covers pins, self-check, check evasion and a
 * multi-king controller's all-kings safety; a frozen controller's pieces exert
 * no attacks but still block, and a king is never captured (spec 001/D26/001/D34).
 *
 * Move records are deterministic: they are ordered by `from` square then `to`
 * square, comparing file letter then rank number (`a1`, `a2`, …, `l12`). There
 * is no mutable module state.
 */
import { type ArmyColor, type Square } from "./board.ts";
import {
  pseudoLegalDestinations,
  type Board,
  type BoardOccupant,
  type BoardPiece,
} from "./geometry.ts";
import {
  PROMOTION_CHOICES,
  pawnPseudoLegalDestinations,
  pawnTransition,
  type PawnPiece,
  type PawnState,
  type PromotionPieceType,
} from "./pawn.ts";
import {
  createPosition,
  inCheck,
  type PlacedEntry,
  type PlacedPiece,
  type Position,
} from "./position.ts";

/** How a pawn's movement state changes across one legal move. */
export interface PawnMoveState {
  readonly before: PawnState;
  readonly after: PawnState;
}

/**
 * One legal move generated for an active controller.
 *
 * `army` is the moved piece's retained colour and `controller` is the acting
 * player that controls it (they differ for an assimilated army). `captured`
 * retains the captured piece, or is `undefined` for a quiet move. `pawn` records
 * a pawn's before/after state and is `undefined` for a non-pawn move. `promotes`
 * is true only when the destination is the pawn's promotion edge, where
 * {@link applyPositionMove} requires an explicit choice.
 */
export interface LegalMove {
  readonly from: Square;
  readonly to: Square;
  readonly army: ArmyColor;
  readonly controller: ArmyColor;
  readonly captured: PlacedPiece | undefined;
  readonly pawn: PawnMoveState | undefined;
  readonly promotes: boolean;
}

/** A caller-requested move for {@link applyPositionMove}. */
export interface PositionMoveInput {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PromotionPieceType;
}

/** A generated move together with the source piece and its un-promoted landing. */
interface Candidate {
  readonly move: LegalMove;
  readonly army: ArmyColor;
  readonly landing: PlacedPiece;
}

/** A board occupant with its controller resolved from the position's mapping. */
function occupantOf(position: Position, placed: PlacedPiece): BoardOccupant {
  const controller = position.controllers[placed.army];
  return placed.type === "pawn"
    ? { controller, army: placed.army, type: "pawn", state: placed.state }
    : { controller, army: placed.army, type: placed.type };
}

/** A PlacedPiece back into a createPosition entry, preserving pawn state. */
function entryOf(square: Square, placed: PlacedPiece): PlacedEntry {
  return placed.type === "pawn"
    ? { square, army: placed.army, type: "pawn", state: placed.state }
    : { square, army: placed.army, type: placed.type };
}

/** The position after `from` -> `to`, with `landing` occupying `to`. */
function applyToPosition(
  position: Position,
  from: Square,
  to: Square,
  landing: PlacedPiece,
): Position {
  const pieces: PlacedEntry[] = [];
  for (const [square, placed] of position.board) {
    if (square === from || square === to) {
      continue;
    }
    pieces.push(entryOf(square, placed));
  }
  pieces.push(entryOf(to, landing));
  return createPosition({
    pieces,
    controllers: position.controllers,
    players: position.players,
    turn: position.turn,
  });
}

/** Whether the acting controller's kings all stay safe after the candidate. */
function isLegal(
  position: Position,
  actor: ArmyColor,
  candidate: Candidate,
): boolean {
  const result = applyToPosition(
    position,
    candidate.move.from,
    candidate.move.to,
    candidate.landing,
  );
  return !inCheck(result, actor);
}

/** Pseudo-legal candidates for one piece, before the king-safety filter. */
function candidatesFrom(
  position: Position,
  board: Board,
  placedBySquare: ReadonlyMap<Square, PlacedPiece>,
  actor: ArmyColor,
  from: Square,
  placed: PlacedPiece,
): Candidate[] {
  const controller = position.controllers[placed.army];
  const candidates: Candidate[] = [];
  if (placed.type === "pawn") {
    const pawnPiece: PawnPiece = {
      controller,
      army: placed.army,
      type: "pawn",
      state: placed.state,
    };
    for (const to of pawnPseudoLegalDestinations(board, from, pawnPiece)) {
      const transition = pawnTransition(from, to, pawnPiece);
      candidates.push({
        army: placed.army,
        landing: {
          army: placed.army,
          type: "pawn",
          state: transition.state,
        },
        move: {
          from,
          to,
          army: placed.army,
          controller,
          captured: placedBySquare.get(to),
          pawn: { before: placed.state, after: transition.state },
          promotes: transition.promotes,
        },
      });
    }
  } else {
    const piece: BoardPiece = {
      controller,
      army: placed.army,
      type: placed.type,
    };
    for (const to of pseudoLegalDestinations(board, from, piece)) {
      candidates.push({
        army: placed.army,
        landing: { army: placed.army, type: placed.type },
        move: {
          from,
          to,
          army: placed.army,
          controller,
          captured: placedBySquare.get(to),
          pawn: undefined,
          promotes: false,
        },
      });
    }
  }
  return candidates.filter((candidate) => isLegal(position, actor, candidate));
}

/** Every legal candidate for `actor`; `[]` unless `actor` is active. */
function candidates(position: Position, actor: ArmyColor): Candidate[] {
  if (position.players[actor] !== "active") {
    return [];
  }
  const entries = [...position.board];
  const board = new Map<Square, BoardOccupant>();
  for (const [square, placed] of entries) {
    board.set(square, occupantOf(position, placed));
  }
  const placedBySquare = new Map<Square, PlacedPiece>(entries);
  const result: Candidate[] = [];
  for (const [from, placed] of entries) {
    if (position.controllers[placed.army] !== actor) {
      continue;
    }
    result.push(
      ...candidatesFrom(position, board, placedBySquare, actor, from, placed),
    );
  }
  return result;
}

/** Canonical square order: file letter, then rank number. */
function compareSquares(a: Square, b: Square): number {
  return (
    a.charCodeAt(0) - b.charCodeAt(0) || Number(a.slice(1)) - Number(b.slice(1))
  );
}

/** Deterministic move order: by `from`, then by `to`. */
function compareMoves(a: LegalMove, b: LegalMove): number {
  return compareSquares(a.from, b.from) || compareSquares(a.to, b.to);
}

/**
 * Every legal move for `actor`, resolved from the current controller mapping.
 *
 * `actor` need not be on turn: the query is pure and answers for any active
 * controller, so a future hypothetical evaluator can reuse it. A frozen or
 * eliminated controller has no moves. The result is ordered by `from` then `to`.
 */
export function legalMoves(position: Position, actor: ArmyColor): LegalMove[] {
  return candidates(position, actor)
    .map((candidate) => candidate.move)
    .sort(compareMoves);
}

/** The validated promotion choice, or `undefined` for a non-promoting move. */
function resolvePromotion(
  move: LegalMove,
  input: PositionMoveInput,
): PromotionPieceType | undefined {
  if (!move.promotes) {
    if (input.promotion !== undefined) {
      throw new Error(
        `applyPositionMove: ${move.from}-${move.to} is not a promotion move`,
      );
    }
    return undefined;
  }
  if (input.promotion === undefined) {
    throw new Error(
      `applyPositionMove: ${move.from}-${move.to} requires a promotion choice (${PROMOTION_CHOICES.join("/")})`,
    );
  }
  if (!PROMOTION_CHOICES.includes(input.promotion)) {
    throw new Error(
      `applyPositionMove: ${move.from}-${move.to} has an invalid promotion ${String(input.promotion)}`,
    );
  }
  return input.promotion;
}

/**
 * Validate and apply `input` for the controller on turn, returning a **new**
 * validated Position. This is a pre-adjudication apply, not a committed action:
 * the turn, player statuses and controller mappings are unchanged and no mate or
 * assimilation is resolved. The input position and `input` are never mutated;
 * an illegal move, a missing or extra promotion choice throws atomically.
 */
export function applyPositionMove(
  position: Position,
  input: PositionMoveInput,
): Position {
  const actor = position.turn;
  const candidate = candidates(position, actor).find(
    ({ move }) => move.from === input.from && move.to === input.to,
  );
  if (candidate === undefined) {
    throw new Error(
      `applyPositionMove: ${input.from}-${input.to} is not a legal move for ${actor}`,
    );
  }
  const promotion = resolvePromotion(candidate.move, input);
  const landing: PlacedPiece =
    promotion === undefined
      ? candidate.landing
      : { army: candidate.army, type: promotion };
  return applyToPosition(
    position,
    candidate.move.from,
    candidate.move.to,
    landing,
  );
}
