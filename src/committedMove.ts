/**
 * The bounded, guarded internal committed-move seam for the multiplayer
 * adjudication slice (spec 001/D38–001/D41 as approved by 001/D44;
 * `docs/rules/multiplayer-adjudication.md` §4/§8).
 *
 * This seam composes the existing internal units — {@link applyPositionMove}
 * (./legalMoves.ts), {@link matedKings} (./mate.ts), {@link adjudicateBatch}
 * (./batchAdjudication.ts), {@link assimilateMatedKings} (./assimilation.ts)
 * and {@link selectTurn} (./turn.ts) — into **public move enumeration**, an
 * **atomic commit**, the **board-less pass**, the **administrative freeze** and
 * the **on-turn resolvability check**. It is deliberately narrow and is
 * **not** the public `Quaternity` class, history, draw offers/responses,
 * snapshots, persistence or a rules-complete engine:
 *
 * - {@link committableMoves} derives the public set from the internal Tier0 set
 *   (`legalMoves`) by filtering it first for 001/D38 actor safety and then for
 *   the 001/D39–001/D41 nonrecursive checked-successor guard. Internal moves that
 *   are rejected are never advertised as committable (001/D40). A promoting move
 *   is enumerated once per permitted explicit promotion choice (001/D28) and every
 *   choice is evaluated independently, so an unqualified from/to is never
 *   advertised while only some choices survive.
 * - {@link commitMove} validates the requested move against the same public set,
 *   applies it, runs the §4 mate fixed point, assimilates every award and advances
 *   the turn cursor with {@link selectTurn}. The input position and `input` are
 *   never mutated: a rejection throws and changes nothing.
 * - {@link pass} is the board-less turn-advancing action of §5 for an on-turn
 *   active, un-checked player with zero Tier0 moves while more than two players are
 *   active (001/D25). It carries no batch — no phantom 001/D30/001/D32 batch is
 *   invented — and preserves the board, pawn state, controller mapping and player
 *   statuses. It still observes the same 001/D39–001/D41 checked-successor guard on
 *   the next active controller (001/D40). A two-player stalemate is a **draw**
 *   (001/D25) that the deferred outcome API must decide; this seam never fabricates
 *   it.
 * - {@link freezePlayer} is the administrative freeze shared by
 *   `resign`/`recordTimeLoss`/`recordWalkover` (001/D45, §7). It sets the target's
 *   status to `frozen` and changes nothing else: no board square, no pawn state,
 *   no controller mapping and **no mate/assimilation batch**, so every frozen king
 *   stays in place (001/D26). It advances the turn clockwise when the target was
 *   on turn and preserves the cursor when the target was off turn, observes the
 *   same 001/D39–001/D41 guard for the advancing case only, and is rejected
 *   atomically for an inactive target or a terminal game (001/D35, §7 Fixture 7b).
 * - {@link assertResolvableOnTurn} is the load bound of the same on-turn state:
 *   it rejects a position whose on-turn controller already has internal moves but
 *   no public committable move, so a caller cannot adopt the unresolved state. A
 *   terminal position passes it unchanged, because a finished game is a legitimate
 *   position and no outcome is invented for it.
 * - The 001/D38 actor-safety filter rejects a candidate atomically as an
 *   **ordinary illegal move** (a plain `Error`) when the hypothetical complete
 *   cascade removes one of the acting controller's kings (clause (a)) or leaves
 *   one in hostile check (clause (b)). It is never `UnresolvedAdjudicationError`
 *   (001/D41 error taxonomy).
 * - The 001/D39–001/D41 guard rejects an otherwise-safe action atomically with
 *   {@link UnresolvedAdjudicationError} only when its successor's next active
 *   controller is **checked** with a nonempty internal set and an empty
 *   001/D38-safe set; an unchecked successor does not veto its predecessor. The
 *   same error covers the on-turn state where the actor has internal moves but no
 *   public move (checked or not). A checked next active controller with **no**
 *   internal move is mated and left to the ordinary 001/D31 rules, so the guard
 *   never fires for it (§5). This is a software fail-closed policy, never a game
 *   outcome: the official rule for the edge stays `[open]` and no mate, pass,
 *   draw, elimination or award is decided (001/D39–001/D41, 001/D44).
 * - The guard is stated only over Tier0 and the 001/D38 filter, so it is
 *   nonrecursive (no fixed point, no global reachability claim).
 *
 * Deferred and out of scope (documented gaps, not silent omissions):
 *
 * - The two-player stalemate **draw** (001/D25), draw proposals/responses and
 *   every other outcome decision belong to the class. A pass or a freeze never
 *   fabricates their result.
 * - The history events of §5, §6 and §7 are not recorded here.
 * - The public `Quaternity` class, history/undo, JSON snapshots/replay and the
 *   complete-engine claim remain withheld.
 *
 * There is no mutable module state.
 */
import { ARMY_COLORS, type ArmyColor, type Square } from "./board.ts";
import {
  createPosition,
  inCheck,
  type PlacedEntry,
  type PlacedPiece,
  type PlayerStatus,
  type Position,
} from "./position.ts";
import {
  applyPositionMove,
  legalMoves,
  type LegalMove,
  type PositionMoveInput,
} from "./legalMoves.ts";
import { matedKings } from "./mate.ts";
import {
  adjudicateBatch,
  type AwardEvent,
  type KingSnapshot,
  type SnapshotKing,
} from "./batchAdjudication.ts";
import { assimilateMatedKings } from "./assimilation.ts";
import { selectTurn, type TurnSelection } from "./turn.ts";
import { PROMOTION_CHOICES, type PromotionPieceType } from "./pawn.ts";

/**
 * The named software error for the two unresolved states of the `[open]` edge:
 * the checked-successor guard and the on-turn internal-moves/empty-public state
 * (spec 001/D40/001/D41). It is never an official game outcome.
 */
export class UnresolvedAdjudicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnresolvedAdjudicationError";
  }
}

/** The committed-action result: the next Position, its awards and the turn selection. */
export interface CommittedMove {
  /** The canonical internal move that was committed. */
  readonly move: LegalMove;
  /** The post-batch Position with the turn cursor advanced (or the winner on turn). */
  readonly position: Position;
  /** Every mate award of the fixed point, in canonical order (001/D30/001/D32). */
  readonly awards: readonly AwardEvent[];
  /** The next active controller, or the lone active winner (001/D35). */
  readonly selection: TurnSelection;
}

/**
 * One publicly committable action: an internal Tier0 move plus the explicit
 * promotion choice it is committable with (001/D28). `promotion` is `undefined`
 * exactly for a non-promoting move; a promoting move yields one entry per
 * surviving choice, so the caller can pass the entry straight to
 * {@link commitMove} without an unqualified from/to.
 */
export interface CommittableMove extends LegalMove {
  /** The explicit promotion choice when `promotes`, else `undefined`. */
  readonly promotion: PromotionPieceType | undefined;
}

/** The pass result: the advanced Position (board and statuses unchanged) and the selection. */
export interface PassedTurn {
  /** The same board and player statuses, with the turn cursor advanced (001/D30). */
  readonly position: Position;
  /** The next active controller, or the lone active winner (001/D35). */
  readonly selection: TurnSelection;
}

/** A Position paired with the king records `adjudicateBatch` needs (id = army). */
interface PositionSnapshot extends KingSnapshot {
  readonly position: Position;
}

/** A PlacedPiece back into a createPosition entry, preserving pawn state. */
function entryOf(square: Square, placed: PlacedPiece): PlacedEntry {
  return placed.type === "pawn"
    ? { square, army: placed.army, type: "pawn", state: placed.state }
    : { square, army: placed.army, type: placed.type };
}

/** The `createPosition` entries of `position`, preserving pawn state. */
function piecesOf(position: Position): PlacedEntry[] {
  return [...position.board.entries()].map(([square, placed]) =>
    entryOf(square, placed),
  );
}

/**
 * A validated copy of `position` with `players` and the turn cursor `turn`
 * applied; the pieces and the controller mapping are unchanged.
 */
function withPlayersAndTurn(
  position: Position,
  players: Readonly<Record<ArmyColor, PlayerStatus>>,
  turn: ArmyColor,
): Position {
  return createPosition({
    pieces: piecesOf(position),
    controllers: position.controllers,
    players,
    turn,
  });
}

/**
 * The driver snapshot for `position`. Each king is keyed by its immutable
 * retained army, which is unique on the board, so the ids the driver orders and
 * the ids the transfer unit receives are exactly the batch armies.
 */
function snapshotOf(position: Position): PositionSnapshot {
  const kings: SnapshotKing[] = [];
  for (const placed of position.board.values()) {
    if (placed.type === "king") {
      kings.push({
        id: placed.army,
        army: placed.army,
        controller: position.controllers[placed.army],
      });
    }
  }
  return { position, kings };
}

/** The turn-advance result: the cursor position and the selection. */
interface TurnAdvance {
  readonly position: Position;
  readonly selection: TurnSelection;
}

/** Advance the turn cursor from `actor` with `selectTurn` (001/D30/001/D35). */
function advance(position: Position, actor: ArmyColor): TurnAdvance {
  return advancePlayers(position, position.players, actor);
}

/**
 * Advance the cursor from `actor` over `players`, which may differ from
 * `position.players` (the freeze of the on-turn target freezes it first). The
 * selected turn is a validated position value, so it is applied with the same
 * `createPosition` authority as every other position this seam returns.
 */
function advancePlayers(
  position: Position,
  players: Readonly<Record<ArmyColor, PlayerStatus>>,
  actor: ArmyColor,
): TurnAdvance {
  const selection = selectTurn(players, actor);
  const turn = selection.kind === "next" ? selection.player : selection.winner;
  return { position: withPlayersAndTurn(position, players, turn), selection };
}

/**
 * The §4 mate fixed point over `position`, using the production driver and the
 * production transfer unit (001/D30/001/D32/001/D36/001/D37). The input position
 * is never mutated; the turn cursor is unchanged.
 */
function runBatch(
  position: Position,
  actor: ArmyColor,
): { readonly position: Position; readonly awards: readonly AwardEvent[] } {
  const result = adjudicateBatch(
    snapshotOf(position),
    actor,
    (snapshot) => matedKings(snapshot.position),
    (snapshot, kingIds, batchActor) => {
      // kingIds are the driver's own mate candidates, i.e. retained armies.
      const { position: next } = assimilateMatedKings(
        snapshot.position,
        kingIds as readonly ArmyColor[],
        batchActor,
      );
      return snapshotOf(next);
    },
  );
  return { position: result.snapshot.position, awards: result.events };
}

/** The caller input for `move` with the explicit `promotion` choice (001/D28). */
function inputOf(
  move: LegalMove,
  promotion: PromotionPieceType | undefined,
): PositionMoveInput {
  return promotion === undefined
    ? { from: move.from, to: move.to }
    : { from: move.from, to: move.to, promotion };
}

/**
 * The explicit choices to evaluate for `move`: every permitted promotion piece
 * for a promoting move, or the single implicit non-promoting action (001/D28).
 */
function promotionChoices(
  move: LegalMove,
): readonly (PromotionPieceType | undefined)[] {
  return move.promotes ? PROMOTION_CHOICES : [undefined];
}

/**
 * Whether at least one explicit promotion choice of `move` is 001/D38-safe for
 * `actor`. The 001/D38-safe set counts a promoting move once per choice, so a
 * controller whose only safe reply is a non-first promotion choice is not
 * treated as having an empty safe set.
 */
function hasActorSafeChoice(
  position: Position,
  actor: ArmyColor,
  move: LegalMove,
): boolean {
  return promotionChoices(move).some((promotion) =>
    isActorSafe(position, actor, inputOf(move, promotion)),
  );
}

/**
 * The 001/D38 actor-safety verdict for `input`: over the full hypothetical
 * cascade, clause (a) no king whose controller is `actor` is removed and
 * clause (b) every surviving king of `actor` is free of hostile check. `position`
 * must have `actor` on turn (the seam always passes such a position).
 */
function isActorSafe(
  position: Position,
  actor: ArmyColor,
  input: PositionMoveInput,
): boolean {
  let current = applyPositionMove(position, input);
  for (;;) {
    const mated = matedKings(current);
    if (mated.length === 0) {
      break;
    }
    if (mated.some((army) => current.controllers[army] === actor)) {
      return false;
    }
    current = assimilateMatedKings(current, mated, actor).position;
  }
  return !inCheck(current, actor);
}

/**
 * Whether the 001/D39–001/D41 checked-successor guard fires for `successor`.
 *
 * It fires only for a **checked** next active controller with a nonempty
 * internal set and an empty 001/D38-safe set. The `|Tier0(N)| > 0` precondition
 * is an invariant of a post-batch state — a checked active controller with no
 * internal move would be mated and removed by the fixed point — but a pass
 * observes the same guard on an unchanged board, so the guard states the
 * precondition explicitly and never vetoes a checked-but-mated controller (§5).
 * A `winner` successor (no next active controller) never fires.
 */
function successorGuardFires(
  successor: Position,
  selection: TurnSelection,
): boolean {
  if (selection.kind !== "next") {
    return false;
  }
  const next = selection.player;
  if (!inCheck(successor, next)) {
    return false;
  }
  const internal = legalMoves(successor, next);
  if (internal.length === 0) {
    return false;
  }
  return internal.every((move) => !hasActorSafeChoice(successor, next, move));
}

/**
 * Run the 001/D39–001/D41 checked-successor guard for one turn-advancing action
 * and throw {@link UnresolvedAdjudicationError} when it fires. Shared by
 * {@link commitMove} and {@link pass} so a board move and a board-less pass
 * observe the identical nonrecursive guard (001/D40, §5).
 */
function observeSuccessorGuard(
  successor: Position,
  selection: TurnSelection,
  action: string,
): void {
  if (successorGuardFires(successor, selection)) {
    throw new UnresolvedAdjudicationError(
      `${action} leaves the next active controller checked with no 001/D38-safe move; rejected atomically (001/D39)`,
    );
  }
}

/**
 * Reject every action once exactly one active controller remains (001/D35): that
 * player has won, so enumeration, commits and passes are post-terminal. The
 * zero-active state is already rejected by {@link selectTurn}.
 */
function assertNotTerminal(position: Position): void {
  const selection = selectTurn(position.players, position.turn);
  if (selection.kind === "winner") {
    throw new Error(
      `the game is over: ${selection.winner} is the lone active controller (001/D35)`,
    );
  }
}

/** Whether one explicit promotion choice of `move` is publicly committable. */
function isCommittableChoice(
  position: Position,
  actor: ArmyColor,
  move: LegalMove,
  promotion: PromotionPieceType | undefined,
): boolean {
  const input = inputOf(move, promotion);
  if (!isActorSafe(position, actor, input)) {
    return false;
  }
  const post = applyPositionMove(position, input);
  const { position: successor, selection } = advance(
    runBatch(post, actor).position,
    actor,
  );
  return !successorGuardFires(successor, selection);
}

/**
 * The public committable subset of `tier0`, one entry per surviving explicit
 * promotion choice, in Tier0 then promotion-choice order. The result is empty
 * exactly for the on-turn unresolved state (001/D40).
 */
function committableSubset(
  position: Position,
  actor: ArmyColor,
  tier0: readonly LegalMove[],
): CommittableMove[] {
  const publicMoves: CommittableMove[] = [];
  for (const move of tier0) {
    for (const promotion of promotionChoices(move)) {
      if (isCommittableChoice(position, actor, move, promotion)) {
        publicMoves.push({ ...move, promotion });
      }
    }
  }
  return publicMoves;
}

/**
 * The **public** committable moves for the controller on turn: the internal
 * Tier0 set filtered by 001/D38 actor safety and then by the 001/D39–001/D41
 * checked-successor guard, one entry per surviving explicit promotion choice.
 * Internal but uncommittable moves and choices are never listed.
 *
 * A controller with no internal move returns `[]` (ordinary mate/stalemate
 * handling is the caller's). A controller with internal moves but no public move
 * fails closed with {@link UnresolvedAdjudicationError}, checked or not (001/D40).
 * Once one active controller has won, enumeration is rejected (001/D35).
 */
export function committableMoves(position: Position): CommittableMove[] {
  assertNotTerminal(position);
  const actor = position.turn;
  const tier0 = legalMoves(position, actor);
  if (tier0.length === 0) {
    return [];
  }
  const publicMoves = committableSubset(position, actor, tier0);
  if (publicMoves.length === 0) {
    throw new UnresolvedAdjudicationError(
      `committableMoves: ${actor} has internal moves but no public committable move; the unresolved state fails closed (001/D40)`,
    );
  }
  return publicMoves;
}

/**
 * Validate and commit `input` for the controller on turn, returning the next
 * Position, its mate awards and the turn selection. The move is validated
 * against the same public set as {@link committableMoves}, so a 001/D38-rejected
 * candidate is an ordinary illegal move (a plain `Error`) and a guard-vetoed
 * candidate is an {@link UnresolvedAdjudicationError}. Every rejection is
 * atomic: the input position and `input` are never mutated and nothing is
 * awarded, transferred or advanced. Once one active controller has won, a commit
 * is post-terminal and rejected (001/D35).
 */
export function commitMove(
  position: Position,
  input: PositionMoveInput,
): CommittedMove {
  assertNotTerminal(position);
  const actor = position.turn;
  const move = legalMoves(position, actor).find(
    (candidate) => candidate.from === input.from && candidate.to === input.to,
  );
  if (move === undefined || !isActorSafe(position, actor, input)) {
    throw new Error(
      `commitMove: ${input.from}-${input.to} is not a legal move for ${actor}`,
    );
  }
  const batch = runBatch(applyPositionMove(position, input), actor);
  const { position: successor, selection } = advance(batch.position, actor);
  observeSuccessorGuard(
    successor,
    selection,
    `commitMove: ${input.from}-${input.to}`,
  );
  return { move, position: successor, awards: batch.awards, selection };
}

/**
 * Pass for the controller on turn: legal only when the player is active, not in
 * check, has no internal move and more than two players are still active (§5,
 * 001/D25). The board, pawn state, controller mapping and player statuses are
 * unchanged — a pass carries no 001/D30/001/D32 batch, so no phantom batch is
 * invented and no mate is resolved by it. The turn advances with
 * {@link selectTurn} and the resulting next active controller is observed by the
 * same 001/D39–001/D41 checked-successor guard as a board move (001/D40, §5).
 *
 * Every rejection is atomic. The on-turn nonempty-internal/empty-public state
 * fails closed with {@link UnresolvedAdjudicationError} (001/D40); a checked
 * successor fails closed with the same error. An ordinary `Error` covers a player
 * with a legal move, a checked player with no move (checkmate, not stalemate), an
 * already-decided game (001/D35) and the two-player stalemate. The two-player
 * stalemate **draw** is a game outcome the deferred outcome API must decide; this
 * seam never fabricates it (001/D25). A validated Position always has an active
 * turn, so the on-turn player needs no separate activity check.
 */
export function pass(position: Position): PassedTurn {
  assertNotTerminal(position);
  const actor = position.turn;
  const tier0 = legalMoves(position, actor);
  if (tier0.length > 0) {
    if (committableSubset(position, actor, tier0).length === 0) {
      throw new UnresolvedAdjudicationError(
        `pass: ${actor} has internal moves but no public committable move; the unresolved state fails closed (001/D40)`,
      );
    }
    throw new Error(`pass: ${actor} has a legal move and cannot pass`);
  }
  if (inCheck(position, actor)) {
    throw new Error(
      `pass: ${actor} is in check with no legal move, which is checkmate rather than a stalemate pass`,
    );
  }
  const activeCount = ARMY_COLORS.filter(
    (player) => position.players[player] === "active",
  ).length;
  if (activeCount <= 2) {
    throw new Error(
      `pass: ${actor} has no legal move but only ${activeCount} active controller(s) remain; a two-player stalemate is a draw (001/D25) for the outcome API, never a pass`,
    );
  }
  const { position: successor, selection } = advance(position, actor);
  observeSuccessorGuard(successor, selection, `pass: ${actor}`);
  return { position: successor, selection };
}

/** The freeze result: the same board with the target frozen, and the turn selection. */
export interface FrozenPlayer {
  /** The unchanged board and controller mapping, with the target's status frozen. */
  readonly position: Position;
  /** The next active controller, the preserved cursor or the lone active winner. */
  readonly selection: TurnSelection;
}

/**
 * Freeze one **active** target: the administrative action `resign`,
 * `recordTimeLoss` and `recordWalkover` share (001/D45, §7).
 *
 * The target's status becomes `frozen` and nothing else changes: no piece moves,
 * no pawn state, controller mapping or square changes, and **no mate/assimilation
 * batch** is run, so every frozen king stays on the board and remains later
 * checkmateable (001/D26, §3). The turn advances clockwise to the next active
 * controller when the target was **on turn**, and the current cursor is
 * **preserved** when the target was off turn. Each result reports the next active
 * controller, or the lone active winner once the freeze leaves exactly one active
 * controller (001/D35, §7).
 *
 * Only the advancing case observes the 001/D39–001/D41 checked-successor guard,
 * exactly like a board move or a pass; an off-turn freeze changes no turn and so
 * takes no observation. Every rejection is atomic: an already-inactive target, a
 * terminal game (001/D35, §7 Fixture 7b) and a guard-vetoed advance leave the
 * input position and `position` untouched.
 */
export function freezePlayer(
  position: Position,
  target: ArmyColor,
): FrozenPlayer {
  assertNotTerminal(position);
  const status = position.players[target];
  if (status !== "active") {
    throw new Error(
      `freezePlayer: ${String(target)} is already ${String(status)} and cannot be frozen again`,
    );
  }
  const players: Readonly<Record<ArmyColor, PlayerStatus>> = {
    ...position.players,
    [target]: "frozen",
  };
  if (target !== position.turn) {
    const selection = selectTurn(players, position.turn);
    return {
      position: withPlayersAndTurn(position, players, position.turn),
      selection:
        selection.kind === "winner"
          ? selection
          : { kind: "next", player: position.turn },
    };
  }
  const advanced = advancePlayers(position, players, target);
  observeSuccessorGuard(
    advanced.position,
    advanced.selection,
    `freezePlayer: ${target}`,
  );
  return advanced;
}

/**
 * Reject a position whose controller on turn already has internal moves but no
 * public committable move — the 001/D40(3) on-turn unresolved state — so a caller
 * that **loads** a position fails closed instead of adopting it (001/D41).
 *
 * A terminal position, and one whose on-turn controller has no internal move
 * (ordinary mate or stalemate), passes: this bound decides no game outcome and
 * never invents a mate, pass or draw (001/D27). The check is the same public set
 * `moves()`/`pass()` evaluate, so it is not a second rule. Enumeration stops at
 * the first committable move, so an ordinary position pays one candidate's
 * batch, while an unresolved one pays the full failed enumeration before the
 * error.
 */
export function assertResolvableOnTurn(position: Position): void {
  const selection = selectTurn(position.players, position.turn);
  if (selection.kind === "winner") {
    return;
  }
  const actor = position.turn;
  const tier0 = legalMoves(position, actor);
  if (tier0.length === 0) {
    return;
  }
  for (const move of tier0) {
    for (const promotion of promotionChoices(move)) {
      if (isCommittableChoice(position, actor, move, promotion)) {
        return;
      }
    }
  }
  throw new UnresolvedAdjudicationError(
    `assertResolvableOnTurn: ${actor} has internal moves but no public committable move; the unresolved state fails closed (001/D40)`,
  );
}
