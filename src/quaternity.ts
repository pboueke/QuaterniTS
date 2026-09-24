/**
 * The bounded public `Quaternity` class: a thin, atomic façade over the guarded
 * committed-move seam (spec 001/D38–001/D41 as approved by 001/D44;
 * `docs/rules/multiplayer-adjudication.md` §4–§7).
 *
 * What it provides:
 *
 * - Construction from the reviewed opening position (001/D9/001/D24) or from a
 *   caller-supplied `Position`. Whatever it is given, the constructor re-runs
 *   `createPosition` over `positionInputOf(position)` and holds the result, so
 *   `createPosition` stays the single validation authority: a forged or
 *   later-mutated value cannot bypass it, and the class never adopts a caller's
 *   object. It then applies the 001/D40(3) load bound: a position whose on-turn
 *   controller already has internal moves but no public committable move is
 *   rejected with {@link UnresolvedAdjudicationError} instead of being adopted.
 *   A terminal position is still loadable, and no outcome is invented for it.
 * - Read-only state: `position()`, `turn()`, `status()` (each controller's
 *   `active`/`frozen`/`eliminated` lifecycle) and `history()`, which returns a
 *   fresh array of frozen event records whose award, capture and pawn-transition
 *   data are frozen copies.
 * - Attack/check queries: `attackers(square, controller)` returns frozen records
 *   carrying each attacking piece's square, retained army colour and controller
 *   (001/D33; `docs/rules/multiplayer-adjudication.md` §0),
 *   `isAttacked(square, controller)` reports the same query as a boolean and
 *   `inCheck(player)` evaluates **every** king the player currently controls
 *   (001/D31, §1). A frozen controller's pieces exert no attacks but still
 *   occupy their squares and block sliding rays (001/D26/001/D34, §3). All three
 *   reject an unknown square or controller instead of answering an implicit
 *   no-attack.
 * - `moves()`: the **public committable** set only — the seam's 001/D38
 *   actor-safety and 001/D39–001/D41 checked-successor filters applied, one entry
 *   per surviving explicit promotion choice (001/D28). Internal Tier0 moves and
 *   rejected promotion choices are never advertised (001/D40).
 * - `move(input)` and `pass()`: the seam's atomic commit and board-less pass,
 *   imported as `commitMove`/`passTurn`. The recorded `move` keeps the canonical
 *   from/to, army, controller, capture, pawn transition and explicit promotion
 *   choice; the recorded `awards` are the §4 fixed-point mate awards
 *   (001/D30/001/D32); `selection` is the next active controller or the lone
 *   active winner (001/D35).
 * - `outcome()`: only the rules-authorized results — the lone active controller
 *   wins (001/D35, §7 Fixture 7), a stalemate with exactly two active controllers
 *   is a draw (001/D25, §5 Fixture 5b) and an offer accepted unanimously is a
 *   draw (§6 Fixture 6, 001/D45). Every other state is `in-progress`. An on-turn
 *   controller with internal moves but no public move fails closed with
 *   {@link UnresolvedAdjudicationError} (001/D40(3)), as does a guard-vetoed
 *   commit, pass or turn-advancing freeze.
 * - Administrative actions (001/D45; `docs/rules/administrative-actions.md` §1–§2):
 *   `proposeDraw()` by the controller on turn, `respondToDraw(player, accept)` by
 *   each other **active** player once, the read-only `pendingDraw()` snapshot of
 *   the offer and its recorded acceptances, and the three interchangeable
 *   freeze actions `resign`/`recordTimeLoss`/`recordWalkover`, which may freeze
 *   any active target. A proposal and its responses change no turn and no board
 *   square. A pending offer expires on the next move, pass or participant freeze
 *   — folded into that **one** event, so a single `undo()` restores the offer and
 *   its recorded votes — and a response against a non-pending offer is a stale
 *   vote rejected atomically. A freeze keeps the board exactly as it is (no
 *   phantom mate/assimilation batch, frozen kings stay), advances the turn
 *   clockwise for an on-turn target and preserves it for an off-turn one, awards a
 *   remaining lone active controller, and rejects an already-inactive target or a
 *   terminal game atomically. Once the game is over — a lone active winner, an
 *   agreed draw or a two-active stalemate draw — board and administrative actions
 *   are rejected, while `undo()` and `reset()` still work.
 * - `snapshot()` renders the versioned V1 JSON document of 001/D10 — the replay
 *   origin, the deterministic coordinate action log, the canonical event records
 *   and the resulting state — as one deeply frozen JSON value.
 *   `loadSnapshot(value)` is its strict inverse and the **only** load path for a
 *   document: it parses and validates the document, replays the actions through
 *   the very same public methods against a fresh instance, and adopts that
 *   result only when the replayed state and event records agree with the
 *   serialized ones. A serialized state is therefore never trusted as authority:
 *   a tampered outcome, award, capture, promotion or pending offer is rejected,
 *   and the loaded instance keeps the replay origin so a later snapshot and
 *   `undo()` still work. Every rejection is atomic.
 * - `undo()` reverses exactly **one** history event, restoring the position it
 *   replaced together with the pending offer and the agreed-draw state;
 *   `reset()` restores the reviewed opening position and clears the log.

 * Atomicity and isolation: every rejection — an illegal move, both
 * `UnresolvedAdjudicationError` states, an empty-log `undo` — throws before any
 * change, so the current position, the log and the outcome all stay untouched.
 * The class holds only validated, frozen `Position` values and hands them out
 * unmodified, so no caller can mutate held state, and it keeps no mutable module
 * state. Each recorded event is a frozen copy of the seam's result: its nested
 * award records, captured piece and pawn transition (before/after/state) are
 * frozen copies, so mutating a returned event, its nested objects or a
 * `history()` element cannot rewrite the log or a later return. Reversing a
 * capture, promotion or assimilation is not an algebraic inverse, so each event
 * privately journals the position it replaced; that journal is not the versioned
 * JSON snapshot/replay of 001/D10.
 *
 * Deliberately absent (documented gaps, not silent omissions): the browser
 * built-package consumer and installed-package gates (Phase 4); and
 * repeated-position, move-count and
 * insufficient-material draws (not authorized by any source, §5). It also does
 * not adjudicate a mate that no action produced: a `Position` constructed
 * directly, or reached through §5's `|Tier0| = 0` pass case, whose on-turn
 * controller is checked with no move is reported `in-progress` rather than given
 * an invented mate (001/D27). The class is therefore **not** a complete engine,
 * and the official game rule for the checked-non-actor edge stays `[open]`:
 * `UnresolvedAdjudicationError` is a software error and never a game outcome
 * (001/D39–001/D41, 001/D44).
 */
import {
  ARMY_COLORS,
  parseSquare,
  type ArmyColor,
  type Square,
} from "./board.ts";
import {
  attackerRecords,
  createPosition,
  defaultPosition,
  inCheck as positionInCheck,
  positionInputOf,
  type Attacker,
  type PlacedPiece,
  type PlayerStatus,
  type Position,
} from "./position.ts";
import type { PawnMoveState, PositionMoveInput } from "./legalMoves.ts";
import { selectTurn, type TurnSelection } from "./turn.ts";
import type { AwardEvent } from "./batchAdjudication.ts";
import type { PawnState } from "./pawn.ts";
import {
  assertResolvableOnTurn,
  commitMove,
  committableMoves,
  freezePlayer,
  pass as passTurn,
  type CommittableMove,
} from "./committedMove.ts";
import {
  deepFreeze,
  parseSnapshot,
  sameJson,
  snapshotOf,
  type QuaternitySnapshot,
  type SnapshotAction,
} from "./snapshot.ts";

/**
 * The named software error of the `[open]` adjudication edge, re-exported from
 * the seam that defines and throws it (./committedMove.ts). It is never a game
 * outcome (001/D39–001/D41).
 */
export { UnresolvedAdjudicationError } from "./committedMove.ts";

/** The current game result; the `[open]` edge is an error, never a result. */
export type GameOutcome =
  | { readonly kind: "in-progress" }
  | { readonly kind: "winner"; readonly winner: ArmyColor }
  | { readonly kind: "draw" };

/** One committed board move, as recorded history (001/D28/001/D30/001/D35). */
export interface MoveEvent {
  readonly kind: "move";
  /** The canonical committable move with its explicit promotion choice. */
  readonly move: CommittableMove;
  /** Every mate award of the §4 fixed point, in canonical order. */
  readonly awards: readonly AwardEvent[];
  /** The next active controller, or the lone active winner (001/D35). */
  readonly selection: TurnSelection;
}

/** One board-less pass, as recorded history (§5). */
export interface PassEvent {
  readonly kind: "pass";
  /** The on-turn controller that passed. */
  readonly player: ArmyColor;
  /** The next active controller, or the lone active winner (001/D35). */
  readonly selection: TurnSelection;
}

/** One draw proposal, as recorded history (§6). */
export interface DrawProposalEvent {
  readonly kind: "draw-proposal";
  /** The on-turn controller that proposed; it is still on turn. */
  readonly proposer: ArmyColor;
}

/** One response to the pending draw offer, as recorded history (§6). */
export interface DrawResponseEvent {
  readonly kind: "draw-response";
  /** The other active controller that responded. */
  readonly player: ArmyColor;
  /** `false` rejects the proposal, which clears the offer and ends nothing. */
  readonly accept: boolean;
}

/** The three interchangeable administrative freeze actions (§7, 001/D45). */
export type FreezeAction = "resign" | "time-loss" | "walkover";

/** One administrative freeze, as recorded history (§7, 001/D45). */
export interface FreezeEvent {
  readonly kind: "freeze";
  /** Which administrative action performed the freeze. */
  readonly action: FreezeAction;
  /** The frozen target; the board is unchanged. */
  readonly player: ArmyColor;
  /** The next active controller, or the lone active winner (001/D35). */
  readonly selection: TurnSelection;
}

/** One recorded history event: exactly one committed action. */
export type HistoryEvent =
  MoveEvent | PassEvent | DrawProposalEvent | DrawResponseEvent | FreezeEvent;

/**
 * The read-only pending draw offer (§6, 001/D45). A rejection clears the offer
 * instead of being stored, so every entry of `acceptedBy` is an acceptance, and
 * frozen or eliminated players never appear.
 */
export interface PendingDraw {
  /** The on-turn controller that proposed; the turn never changed. */
  readonly proposer: ArmyColor;
  /** The other active controllers that have recorded an accepting vote. */
  readonly acceptedBy: readonly ArmyColor[];
}

/** The class-held administrative state a recorded event can change. */
interface AdminState {
  readonly offer: PendingDraw | null;
  readonly drawAgreed: boolean;
}

/** The private pre-event journal entry `undo` restores from. */
interface PriorState extends AdminState {
  readonly position: Position;
}

/** Freeze a value the class hands out, so no caller can rewrite it. */
function frozen<T extends object>(value: T): T {
  Object.freeze(value);
  return value;
}

/** A frozen copy of one pawn state, so a history record shares no nested value. */
function frozenState(state: PawnState): PawnState {
  return frozen({ ...state });
}

/** A frozen copy of a placed piece, including a pawn's nested state. */
function frozenPiece(placed: PlacedPiece | undefined): PlacedPiece | undefined {
  if (placed === undefined) {
    return undefined;
  }
  if (placed.type === "pawn") {
    const pawn: PlacedPiece = {
      army: placed.army,
      type: "pawn",
      state: frozenState(placed.state),
    };
    return frozen(pawn);
  }
  return frozen({ army: placed.army, type: placed.type });
}

/** A frozen copy of a move's pawn transition, `undefined` for a non-pawn move. */
function frozenPawn(
  pawn: PawnMoveState | undefined,
): PawnMoveState | undefined {
  return pawn === undefined
    ? undefined
    : frozen({
        before: frozenState(pawn.before),
        after: frozenState(pawn.after),
      });
}

/** A frozen copy of one mate award record. */
function frozenAward(award: AwardEvent): AwardEvent {
  return frozen({ ...award });
}

/** The number of controllers still active (001/D25). */
function activeCount(position: Position): number {
  return ARMY_COLORS.filter((player) => position.players[player] === "active")
    .length;
}

/** A frozen copy of one attacker record, so no caller can rewrite a query result. */
function frozenAttacker(attacker: Attacker): Attacker {
  return frozen({ ...attacker });
}

/**
 * Reject an unknown square at the public query boundary instead of answering an
 * implicit "not attacked" for a square that does not exist on the board.
 */
function assertKnownSquare(operation: string, square: Square): void {
  if (parseSquare(square) === undefined) {
    throw new Error(
      `Quaternity.${operation}: unknown square ${String(square)}`,
    );
  }
}

/**
 * Reject an unknown controller at the public query boundary instead of
 * answering an implicit "no attack" for a player that does not exist; an army
 * colour is the player identity (001/D33).
 */
function assertKnownController(operation: string, controller: ArmyColor): void {
  if (!ARMY_COLORS.includes(controller)) {
    throw new Error(
      `Quaternity.${operation}: unknown controller ${String(controller)}`,
    );
  }
}

/**
 * The bounded public game: the current validated `Position`, the history log and
 * the private pre-event journal `undo` restores from. See the module note for
 * the intended surface, its atomicity and its deliberate gaps.
 */
export class Quaternity {
  #position: Position;
  #events: HistoryEvent[] = [];
  #prior: PriorState[] = [];
  #offer: PendingDraw | null = null;
  #drawAgreed = false;

  /**
   * Start from `position`, re-validated and copied through `createPosition`,
   * when the caller supplies one, otherwise from the reviewed opening fixture
   * (001/D9/001/D24). The constructor never adopts a caller's object: a forged
   * or later-mutated `Position` cannot bypass the validator or reach the held
   * state. It then applies the 001/D40(3) load bound: a position whose on-turn
   * controller already has internal moves but no public committable move is
   * rejected with `UnresolvedAdjudicationError` instead of being adopted. A
   * terminal position is still loadable and gains no invented outcome.
   */
  constructor(position: Position = defaultPosition()) {
    const loaded = createPosition(positionInputOf(position));
    assertResolvableOnTurn(loaded);
    this.#position = loaded;
  }

  /** The current validated position; never a mutable reference. */
  position(): Position {
    return this.#position;
  }

  /** The controller whose turn it is (the winner's seat once a player has won). */
  turn(): ArmyColor {
    return this.#position.turn;
  }

  /** Every controller's lifecycle status, active/frozen/eliminated. */
  status(): Readonly<Record<ArmyColor, PlayerStatus>> {
    return this.#position.players;
  }

  /**
   * Every piece controlled by `controller` that attacks `square`, by geometry
   * and occupancy only, as frozen records carrying each attacker's square, its
   * retained army colour and its controller (§0, 001/D33). A frozen or
   * eliminated controller attacks nothing, while its pieces still occupy their
   * squares and block sliding rays (001/D26/001/D34, §3). An unknown square or
   * controller is rejected rather than answered with an implicit no-attack.
   */
  attackers(square: Square, controller: ArmyColor): readonly Attacker[] {
    assertKnownSquare("attackers", square);
    assertKnownController("attackers", controller);
    return frozen(
      attackerRecords(this.#position, square, controller).map(frozenAttacker),
    );
  }

  /**
   * Whether any piece controlled by `controller` attacks `square`; the same
   * geometry, controller scope and boundary validation as {@link attackers}.
   */
  isAttacked(square: Square, controller: ArmyColor): boolean {
    assertKnownSquare("isAttacked", square);
    assertKnownController("isAttacked", controller);
    return attackerRecords(this.#position, square, controller).length > 0;
  }

  /**
   * Whether any king currently controlled by `player` is attacked by a hostile
   * active controller. Kings are matched by their current controller, not their
   * retained army colour, so an assimilated king counts and both kings of a
   * multi-king controller are evaluated (001/D31, 001/D33, §1).
   */
  inCheck(player: ArmyColor): boolean {
    assertKnownController("inCheck", player);
    return positionInCheck(this.#position, player);
  }

  /** A copy of the append-only history log of frozen move/pass events. */
  history(): readonly HistoryEvent[] {
    return [...this.#events];
  }

  /**
   * The versioned V1 JSON snapshot of this game (001/D10): the replay origin
   * position, the coordinate action log, the canonical event records and the
   * current state, including the pending offer, the agreed draw and the derived
   * outcome. The returned value is JSON-safe and deeply frozen, and it shares no
   * mutable object with the game, so a caller cannot rewrite held state through
   * it. An on-turn unresolved state fails closed with
   * `UnresolvedAdjudicationError` instead of serializing an invented outcome
   * (001/D40/001/D41).
   */
  snapshot(): QuaternitySnapshot {
    return deepFreeze(this.#snapshot());
  }

  /**
   * Replace this game's state from a snapshot document, atomically (001/D10).
   *
   * The document is parsed strictly, both positions are re-validated through
   * `createPosition`, and its coordinate actions are replayed through this
   * class's own public methods against a fresh instance. Only when the replayed
   * position, pending offer, agreed draw, outcome and canonical event records all
   * agree with the serialized ones is the result adopted; a malformed document, an
   * unsupported version, an unknown key, an invalid position, an illegal or
   * duplicate action, a stale vote and any mismatch between the document and the
   * replay are rejected before this instance changes at all. An unresolved
   * document state — the 001/D40(3) on-turn state or a checked successor — fails
   * closed with `UnresolvedAdjudicationError`, never an invented outcome.
   */
  loadSnapshot(value: unknown): void {
    const parsed = parseSnapshot(value);
    const replayed = new Quaternity(parsed.initial);
    for (const action of parsed.actions) {
      replayed.#replay(action);
    }
    const derived = replayed.#snapshot();
    if (!sameJson(derived.log, parsed.log)) {
      throw new Error(
        "loadSnapshot: the log does not match the events the actions replay; the snapshot is rejected (001/D10)",
      );
    }
    if (!sameJson(derived.state, parsed.state)) {
      throw new Error(
        "loadSnapshot: the state does not match the state the actions replay; the snapshot is rejected (001/D10)",
      );
    }
    this.#position = replayed.#position;
    this.#events = replayed.#events;
    this.#prior = replayed.#prior;
    this.#offer = replayed.#offer;
    this.#drawAgreed = replayed.#drawAgreed;
  }

  /**
   * The publicly committable moves for the controller on turn. Rejected Tier0
   * moves and rejected promotion choices are absent (001/D38–001/D41); an
   * on-turn nonempty-internal/empty-public state fails closed. Once the draw
   * offer was accepted the game is over and no move is enumerated.
   */
  moves(): CommittableMove[] {
    this.#assertNotDrawn("moves");
    return committableMoves(this.#position);
  }

  /**
   * The current result: the lone active controller's win (001/D35), the
   * unanimously agreed draw (§6, 001/D45), the two-active-controller stalemate
   * draw (001/D25) or `in-progress`. An on-turn unresolved state fails closed
   * with `UnresolvedAdjudicationError`.
   */
  outcome(): GameOutcome {
    return this.#outcome();
  }

  /**
   * The pending draw offer and its recorded acceptances, or `null` when no offer
   * is pending (§6, 001/D45). The returned snapshot is a frozen copy, so a caller
   * cannot rewrite the held offer or a later return.
   */
  pendingDraw(): PendingDraw | null {
    const offer = this.#offer;
    if (offer === null) {
      return null;
    }
    return frozen({
      proposer: offer.proposer,
      acceptedBy: frozen([...offer.acceptedBy]),
    });
  }

  /**
   * Record a draw proposal by the controller on turn (§6). A proposal changes no
   * board square and no turn; the proposer still owes a move if the draw fails.
   * A second proposal while one is pending, and a proposal in a game that is
   * already over, are rejected atomically.
   */
  proposeDraw(): DrawProposalEvent {
    this.#assertActionable("proposeDraw");
    if (this.#offer !== null) {
      throw new Error(
        "proposeDraw: a draw offer is already pending; the on-turn player must move or pass first (001/D45)",
      );
    }
    const proposer = this.#position.turn;
    return this.#record({ kind: "draw-proposal", proposer }, this.#position, {
      offer: { proposer, acceptedBy: [] },
      drawAgreed: false,
    });
  }

  /**
   * Record one response to the pending draw offer (§6, 001/D45). Only another
   * **active** controller may respond, and only once: the proposer votes never, a
   * frozen or eliminated player does not vote, and a repeated vote is rejected.
   * A rejection clears the offer and ends nothing; an acceptance is recorded, and
   * the unanimous consent of every other active controller completes the draw. A
   * response against a non-pending offer is a stale vote rejected atomically
   * (001/D45). The turn never changes.
   */
  respondToDraw(player: ArmyColor, accept: boolean): DrawResponseEvent {
    assertKnownController("respondToDraw", player);
    this.#assertActionable("respondToDraw");
    const offer = this.#offer;
    if (offer === null) {
      throw new Error(
        "respondToDraw: there is no pending draw offer; a stale vote is rejected (001/D45)",
      );
    }
    if (player === offer.proposer) {
      throw new Error(
        "respondToDraw: the proposer does not vote on its own offer (§6)",
      );
    }
    if (this.#position.players[player] !== "active") {
      throw new Error(
        `respondToDraw: ${player} is not an active player, so it does not vote (§6)`,
      );
    }
    if (offer.acceptedBy.includes(player)) {
      throw new Error(`respondToDraw: ${player} has already voted`);
    }
    const event: DrawResponseEvent = { kind: "draw-response", player, accept };
    if (!accept) {
      return this.#record(event, this.#position, {
        offer: null,
        drawAgreed: false,
      });
    }
    const acceptedBy = [...offer.acceptedBy, player];
    const unanimous = this.#votersOf(offer.proposer).every((voter) =>
      acceptedBy.includes(voter),
    );
    return this.#record(event, this.#position, {
      offer: unanimous ? null : { proposer: offer.proposer, acceptedBy },
      drawAgreed: unanimous,
    });
  }

  /** Freeze `player` as a resignation (§7, 001/D45); see `freezePlayer`. */
  resign(player: ArmyColor): FreezeEvent {
    return this.#freeze("resign", player);
  }

  /** Freeze `player` for a time loss (§7, 001/D45); see `freezePlayer`. */
  recordTimeLoss(player: ArmyColor): FreezeEvent {
    return this.#freeze("time-loss", player);
  }

  /** Freeze `player` for a walkover (§7, 001/D45); see `freezePlayer`. */
  recordWalkover(player: ArmyColor): FreezeEvent {
    return this.#freeze("walkover", player);
  }

  /**
   * Commit `input` through the seam atomically and record one move event. An
   * illegal, 001/D38-rejected or guard-vetoed move throws before anything —
   * position, history, offer or outcome — changes, as does a move after an agreed
   * draw. The move expires any pending draw offer inside this one event
   * (001/D45).
   */
  move(input: PositionMoveInput): MoveEvent {
    this.#assertNotDrawn("move");
    const result = commitMove(this.#position, input);
    return this.#record(
      {
        kind: "move",
        move: frozen({
          ...result.move,
          promotion: input.promotion,
          captured: frozenPiece(result.move.captured),
          pawn: frozenPawn(result.move.pawn),
        }),
        awards: frozen(result.awards.map(frozenAward)),
        selection: frozen(result.selection),
      },
      result.position,
      { offer: null, drawAgreed: false },
    );
  }

  /**
   * Pass through the seam atomically and record one pass event. The board,
   * pawn state, controller mapping and statuses are unchanged and no batch is
   * invented (§5); every rejection throws before any change. The pass expires any
   * pending draw offer inside this one event (001/D45).
   */
  pass(): PassEvent {
    this.#assertNotDrawn("pass");
    const player = this.#position.turn;
    const result = passTurn(this.#position);
    return this.#record(
      {
        kind: "pass",
        player,
        selection: frozen(result.selection),
      },
      result.position,
      { offer: null, drawAgreed: false },
    );
  }

  /**
   * Reverse exactly one history event, restoring the position it replaced and the
   * pending offer and agreed-draw state it carried. One `undo()` of a move, pass
   * or freeze that expired an offer therefore restores that offer with its
   * recorded votes (001/D45).
   */
  undo(): void {
    const previous = this.#prior.at(-1);
    if (previous === undefined) {
      throw new Error("undo: there is no history event to reverse");
    }
    this.#position = previous.position;
    this.#offer = previous.offer;
    this.#drawAgreed = previous.drawAgreed;
    this.#prior.pop();
    this.#events.pop();
  }

  /** Restore the reviewed opening position (001/D9) and clear the log. */
  reset(): void {
    this.#position = defaultPosition();
    this.#events = [];
    this.#prior = [];
    this.#offer = null;
    this.#drawAgreed = false;
  }

  /**
   * The canonical snapshot of the current state. The replay origin is the
   * position the first logged event replaced, or the current position when the
   * log is empty, so `undo()` back to an empty log still snapshots correctly.
   */
  #snapshot(): QuaternitySnapshot {
    const initial = this.#prior[0]?.position ?? this.#position;
    return snapshotOf({
      initial,
      events: this.#events,
      position: this.#position,
      pendingDraw: this.#offer,
      drawAgreed: this.#drawAgreed,
      outcome: this.#outcome(),
    });
  }

  /**
   * Replay one coordinate action through this class's own public action, so a
   * loaded document is validated by exactly the rules a live action passes. An
   * illegal, duplicate, stale or guard-vetoed action throws before any state is
   * adopted.
   */
  #replay(action: SnapshotAction): void {
    switch (action.kind) {
      case "move":
        this.move(
          action.promotion === null
            ? { from: action.from, to: action.to }
            : {
                from: action.from,
                to: action.to,
                promotion: action.promotion,
              },
        );
        return;
      case "pass":
        this.pass();
        return;
      case "draw-proposal":
        this.proposeDraw();
        return;
      case "draw-response":
        this.respondToDraw(action.player, action.accept);
        return;
      case "freeze":
        this.#freeze(action.action, action.player);
        return;
    }
  }

  /** Record one freeze action and expire any pending draw offer (001/D45). */
  #freeze(action: FreezeAction, player: ArmyColor): FreezeEvent {
    assertKnownController(action, player);
    this.#assertActionable(action);
    const result = freezePlayer(this.#position, player);
    return this.#record(
      {
        kind: "freeze",
        action,
        player,
        selection: frozen(result.selection),
      },
      result.position,
      { offer: null, drawAgreed: false },
    );
  }

  /**
   * The active controllers that still owe a vote on `proposer`'s offer. Freezing
   * any active player expires the offer, so this set is stable while the offer is
   * pending; a player already frozen or eliminated at the proposal never votes
   * (§6).
   */
  #votersOf(proposer: ArmyColor): ArmyColor[] {
    return ARMY_COLORS.filter(
      (player) =>
        player !== proposer && this.#position.players[player] === "active",
    );
  }

  /** The single game-over authority: winner, agreed draw, stalemate draw or play. */
  #outcome(): GameOutcome {
    const current = this.#position;
    const selection = selectTurn(current.players, current.turn);
    if (selection.kind === "winner") {
      return { kind: "winner", winner: selection.winner };
    }
    if (this.#drawAgreed) {
      return { kind: "draw" };
    }
    if (committableMoves(current).length > 0) {
      return { kind: "in-progress" };
    }
    const stalemateDraw =
      activeCount(current) === 2 && !positionInCheck(current, current.turn);
    return stalemateDraw ? { kind: "draw" } : { kind: "in-progress" };
  }

  /**
   * Reject every administrative action once the game is over — a lone active
   * winner (001/D35), an agreed draw (§6, 001/D45) or a two-active stalemate draw
   * (001/D25). An unresolved on-turn state is not a result, so it still fails
   * closed with `UnresolvedAdjudicationError`.
   */
  #assertActionable(operation: string): void {
    const result = this.#outcome();
    if (result.kind === "winner") {
      throw new Error(
        `${operation}: the game is over; ${result.winner} is the lone active controller (001/D35)`,
      );
    }
    if (result.kind === "draw") {
      throw new Error(
        `${operation}: the game is over; the draw is agreed or a two-active stalemate (001/D25/001/D45)`,
      );
    }
  }

  /**
   * Reject a board action after the draw offer was accepted. The winner and
   * stalemate cases are already rejected by the seam and by move legality.
   */
  #assertNotDrawn(operation: string): void {
    if (this.#drawAgreed) {
      throw new Error(
        `${operation}: the game is over; the draw was agreed unanimously (001/D45)`,
      );
    }
  }

  /** Adopt `position` and `admin`, append `event`, keeping log and state in step. */
  #record<E extends HistoryEvent>(
    event: E,
    position: Position,
    admin: AdminState,
  ): E {
    this.#prior.push({
      position: this.#position,
      offer: this.#offer,
      drawAgreed: this.#drawAgreed,
    });
    this.#position = position;
    this.#offer = admin.offer;
    this.#drawAgreed = admin.drawAgreed;
    this.#events.push(frozen(event));
    return event;
  }
}
