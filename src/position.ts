/**
 * In-memory Quaternity position and its pure attack/check queries.
 *
 * This is the Phase 3A slice: the four-army position (board occupancy, the
 * army-to-controller mapping, player active/frozen/eliminated status and the
 * turn) plus the attack queries the spec defines by attacker *controller*.
 *
 * Deliberately narrow. There is no move application, no full legality, no
 * checkmate/adjudication, no voting, no history, no snapshot/JSON persistence
 * and no public `Quaternity` class here. Attack queries are geometry only:
 *
 * - only an **active** controller's pieces exert actual attacks;
 * - a frozen piece exerts no attacks but still occupies its square, so it
 *   blocks sliding rays until it is captured (spec 001/D26/001/D34);
 * - a frozen king never attacks but remains on the board and can still be in
 *   check; the hypothetical frozen-mate evaluation is a later slice (spec 001/D26);
 * - attacks include squares held by any piece, including a king, while
 *   pseudo-legal destinations (./geometry.ts) still exclude king squares, so a
 *   king is attacked but never captured directly;
 * - friend/foe is by `controller`, not the retained `army` colour, so an
 *   assimilated piece attacks for whoever controls it (spec 001/D33).
 *
 * There is no mutable module state.
 */
import {
  ARMY_COLORS,
  PIECE_TYPES,
  parseSquare,
  type ArmyColor,
  type File,
  type PieceType,
  type Rank,
  type Square,
} from "./board.ts";
import {
  attackSquares,
  type Board,
  type BoardOccupant,
  type GeometricPieceType,
} from "./geometry.ts";
import {
  ADVANCED_PAWN_AXES,
  pawnAttackSquares,
  type PawnDirection,
  type PawnState,
} from "./pawn.ts";
import {
  ADVANCED_CENTRAL_PAWNS,
  OPENING_POSITION,
  type OpeningPiece,
} from "./fixtures/openingPosition.ts";

/** Lifecycle of one player: active, frozen (resigned/timeout/walkover) or eliminated. */
export type PlayerStatus = "active" | "frozen" | "eliminated";

/**
 * A piece in a position: its immutable army colour and what it is. The
 * controller is not stored here; it is resolved from the position's
 * army-to-controller mapping, so army identity and control stay separate.
 */
export type PlacedPiece =
  | { readonly army: ArmyColor; readonly type: GeometricPieceType }
  | {
      readonly army: ArmyColor;
      readonly type: "pawn";
      readonly state: PawnState;
    };

/** A piece together with the square it occupies, as supplied to createPosition. */
export type PlacedEntry = PlacedPiece & { readonly square: Square };

/** Everything {@link createPosition} needs to build a validated position. */
export interface PositionInput {
  readonly pieces: readonly PlacedEntry[];
  /** Army colour -> the player that currently controls it (differs after assimilation). */
  readonly controllers: Readonly<Record<ArmyColor, ArmyColor>>;
  /** Lifecycle status of each player. */
  readonly players: Readonly<Record<ArmyColor, PlayerStatus>>;
  /** The active player whose turn it is. */
  readonly turn: ArmyColor;
}

/** A validated, immutable-by-convention position. */
export interface Position {
  /**
   * A defensive copy of the occupancy: each access returns a new map whose
   * values are frozen pieces, so mutating it never changes this position.
   */
  readonly board: ReadonlyMap<Square, PlacedPiece>;
  readonly controllers: Readonly<Record<ArmyColor, ArmyColor>>;
  readonly players: Readonly<Record<ArmyColor, PlayerStatus>>;
  readonly turn: ArmyColor;
}

/** The two ordinary-pawn lines of each army and their official forward direction. */
const RANK_LINE_PAWNS: Readonly<
  Record<ArmyColor, { readonly rank: Rank; readonly direction: PawnDirection }>
> = {
  white: { rank: 5, direction: "up" },
  red: { rank: 8, direction: "down" },
  black: { rank: 8, direction: "down" },
  green: { rank: 5, direction: "up" },
};
const FILE_LINE_PAWNS: Readonly<
  Record<ArmyColor, { readonly file: File; readonly direction: PawnDirection }>
> = {
  white: { file: "e", direction: "right" },
  red: { file: "e", direction: "right" },
  black: { file: "h", direction: "left" },
  green: { file: "h", direction: "left" },
};

function isArmyColor(value: unknown): value is ArmyColor {
  return ARMY_COLORS.includes(value as ArmyColor);
}

function isPieceType(value: unknown): value is PieceType {
  return PIECE_TYPES.includes(value as PieceType);
}

function isPlayerStatus(value: unknown): value is PlayerStatus {
  return value === "active" || value === "frozen" || value === "eliminated";
}

/** A direction is possible only when it is one of the army's two forward axes. */
function isAllowedDirection(
  army: ArmyColor,
  value: unknown,
): value is PawnDirection {
  return (ADVANCED_PAWN_AXES[army] as readonly unknown[]).includes(value);
}

function validatePlayers(
  players: Readonly<Record<ArmyColor, PlayerStatus>>,
): void {
  for (const player of ARMY_COLORS) {
    if (!isPlayerStatus(players[player])) {
      throw new Error(`createPosition: player ${player} has no valid status`);
    }
  }
}

function validateControllers(
  controllers: Readonly<Record<ArmyColor, ArmyColor>>,
): void {
  for (const army of ARMY_COLORS) {
    if (!isArmyColor(controllers[army])) {
      throw new Error(`createPosition: army ${army} has no valid controller`);
    }
  }
}

function validatePawnState(army: ArmyColor, state: unknown): PawnState {
  if (typeof state !== "object" || state === null) {
    throw new Error(`createPosition: ${army} pawn state is not an object`);
  }
  const candidate = state as {
    readonly kind?: unknown;
    readonly direction?: unknown;
    readonly vertical?: unknown;
    readonly horizontal?: unknown;
    readonly committed?: unknown;
  };
  if (candidate.kind === "ordinary") {
    if (!isAllowedDirection(army, candidate.direction)) {
      throw new Error(
        `createPosition: impossible ${army} pawn direction ${String(candidate.direction)}`,
      );
    }
    return { kind: "ordinary", direction: candidate.direction };
  }
  if (candidate.kind === "advanced") {
    const [vertical, horizontal] = ADVANCED_PAWN_AXES[army];
    if (
      candidate.vertical !== vertical ||
      candidate.horizontal !== horizontal
    ) {
      throw new Error(`createPosition: impossible ${army} advanced pawn axes`);
    }
    if (
      candidate.committed !== undefined &&
      !isAllowedDirection(army, candidate.committed)
    ) {
      throw new Error(
        `createPosition: impossible ${army} committed direction ${String(candidate.committed)}`,
      );
    }
    return {
      kind: "advanced",
      vertical,
      horizontal,
      committed: candidate.committed,
    };
  }
  throw new Error(
    `createPosition: unknown pawn kind ${String(candidate.kind)}`,
  );
}

/** Freeze a freshly validated piece and its nested pawn state for isolation. */
function freezePiece(placed: PlacedPiece): PlacedPiece {
  if (placed.type === "pawn") {
    Object.freeze(placed.state);
  }
  return Object.freeze(placed);
}

function validatePiece(entry: PlacedEntry): PlacedPiece {
  if (!isArmyColor(entry.army)) {
    throw new Error(`createPosition: unknown army ${String(entry.army)}`);
  }
  if (!isPieceType(entry.type)) {
    throw new Error(`createPosition: unknown piece type ${String(entry.type)}`);
  }
  if (entry.type === "pawn") {
    return freezePiece({
      army: entry.army,
      type: "pawn",
      state: validatePawnState(entry.army, entry.state),
    });
  }
  return freezePiece({ army: entry.army, type: entry.type });
}

/**
 * Every active or frozen controller must still have a king on the board; an
 * eliminated controller may not own any piece (checked per piece). This is the
 * king/controller linkage rule (spec 001/D31/001/D33). An immutable army colour created
 * exactly one king, so a custom position may hold at most one king of any army;
 * two kings of different armies under one controller remain valid (001/D31).
 */
function validateKingLinks(
  players: Readonly<Record<ArmyColor, PlayerStatus>>,
  controllers: Readonly<Record<ArmyColor, ArmyColor>>,
  board: ReadonlyMap<Square, PlacedPiece>,
): void {
  const byController = new Map<ArmyColor, number>();
  const byArmy = new Map<ArmyColor, number>();
  for (const placed of board.values()) {
    if (placed.type === "king") {
      const controller = controllers[placed.army];
      byController.set(controller, (byController.get(controller) ?? 0) + 1);
      byArmy.set(placed.army, (byArmy.get(placed.army) ?? 0) + 1);
    }
  }
  for (const army of ARMY_COLORS) {
    if ((byArmy.get(army) ?? 0) > 1) {
      throw new Error(`createPosition: army ${army} has more than one king`);
    }
  }
  for (const player of ARMY_COLORS) {
    if (
      players[player] !== "eliminated" &&
      (byController.get(player) ?? 0) === 0
    ) {
      throw new Error(
        `createPosition: ${players[player]} controller ${player} has no king on the board`,
      );
    }
  }
}

/** Zero active controllers is unreachable and rejected (spec 001/D35). */
function validateActivePlayers(
  players: Readonly<Record<ArmyColor, PlayerStatus>>,
): void {
  if (!ARMY_COLORS.some((player) => players[player] === "active")) {
    throw new Error("createPosition: position has no active controller");
  }
}

/**
 * Validate and freeze a custom position. Throws an actionable `Error` on any
 * malformed input and never mutates its argument or any existing position.
 *
 * The returned position is defensively isolated: its controller and status
 * records are copied and frozen, its pieces and pawn states are frozen, `board`
 * is a getter that yields a fresh map each access, and the position object
 * itself is frozen. A caller therefore cannot reach or mutate validated state
 * through the returned value or through an aliased input.
 *
 * Validation: on-board squares and unique occupancy; valid army/type/pawn
 * state; an army-to-controller mapping and player statuses for all four
 * players; a turn that is active; no piece under an eliminated controller; at
 * most one king per immutable army colour; every active or frozen controller
 * has a king; at least one active controller.
 */
export function createPosition(input: PositionInput): Position {
  validatePlayers(input.players);
  validateControllers(input.controllers);
  validateActivePlayers(input.players);
  if (input.players[input.turn] !== "active") {
    throw new Error(
      `createPosition: turn ${String(input.turn)} is not an active player`,
    );
  }
  const internal = new Map<Square, PlacedPiece>();
  for (const entry of input.pieces) {
    const square = parseSquare(entry.square);
    if (square === undefined) {
      throw new Error(`createPosition: unknown square ${String(entry.square)}`);
    }
    if (internal.has(square)) {
      throw new Error(`createPosition: duplicate square ${square}`);
    }
    const placed = validatePiece(entry);
    if (input.players[input.controllers[placed.army]] === "eliminated") {
      throw new Error(
        `createPosition: eliminated controller owns a piece on ${square}`,
      );
    }
    internal.set(square, placed);
  }
  validateKingLinks(input.players, input.controllers, internal);
  const position: Position = {
    get board(): ReadonlyMap<Square, PlacedPiece> {
      return new Map(internal);
    },
    controllers: Object.freeze({ ...input.controllers }),
    players: Object.freeze({ ...input.players }),
    turn: input.turn,
  };
  return Object.freeze(position);
}

/** The ordinary forward direction of an army's opening pawn on `square`. */
function openingOrdinaryDirection(
  army: ArmyColor,
  square: Square,
): PawnDirection {
  return Number(square.slice(1)) === RANK_LINE_PAWNS[army].rank
    ? RANK_LINE_PAWNS[army].direction
    : FILE_LINE_PAWNS[army].direction;
}

/** The explicit opening state of `army`'s pawn on `square` (spec 001/D28/001/D29). */
function openingPawnState(army: ArmyColor, square: Square): PawnState {
  if (ADVANCED_CENTRAL_PAWNS[army].includes(square)) {
    const [vertical, horizontal] = ADVANCED_PAWN_AXES[army];
    return { kind: "advanced", vertical, horizontal, committed: undefined };
  }
  return {
    kind: "ordinary",
    direction: openingOrdinaryDirection(army, square),
  };
}

function openingEntry(piece: OpeningPiece): PlacedEntry {
  if (piece.type === "pawn") {
    return {
      square: piece.square,
      army: piece.army,
      type: "pawn",
      state: openingPawnState(piece.army, piece.square),
    };
  }
  return { square: piece.square, army: piece.army, type: piece.type };
}

/** The default four-army opening position with White to move (spec 001/D9/001/D24). */
export function defaultPosition(): Position {
  return createPosition({
    pieces: OPENING_POSITION.map(openingEntry),
    controllers: {
      white: "white",
      red: "red",
      black: "black",
      green: "green",
    },
    players: {
      white: "active",
      red: "active",
      black: "active",
      green: "active",
    },
    turn: "white",
  });
}

/** Resolve a placed piece to a board occupant with its controller. */
function toOccupant(position: Position, placed: PlacedPiece): BoardOccupant {
  const controller = position.controllers[placed.army];
  if (placed.type === "pawn") {
    return { controller, army: placed.army, type: "pawn", state: placed.state };
  }
  return { controller, army: placed.army, type: placed.type };
}

/** Occupancy with resolved controllers, for the shared geometry functions. */
function occupancy(position: Position): Board {
  const board = new Map<Square, BoardOccupant>();
  for (const [square, placed] of position.board) {
    board.set(square, toOccupant(position, placed));
  }
  return board;
}

function attacksSquare(
  board: Board,
  from: Square,
  occupant: BoardOccupant,
  target: Square,
): boolean {
  if (occupant.type === "pawn") {
    return pawnAttackSquares(from, occupant).includes(target);
  }
  return attackSquares(board, from, occupant.type).includes(target);
}

function attackersOnBoard(
  board: Board,
  players: Readonly<Record<ArmyColor, PlayerStatus>>,
  square: Square,
  controller: ArmyColor,
): Square[] {
  if (players[controller] !== "active") {
    return [];
  }
  const squares: Square[] = [];
  for (const [from, occupant] of board) {
    if (occupant.controller !== controller) {
      continue;
    }
    if (attacksSquare(board, from, occupant, square)) {
      squares.push(from);
    }
  }
  return squares;
}

/**
 * The squares of every piece controlled by `controller` that attacks `square`,
 * by geometry and occupancy only. Returns `[]` unless `controller` is active:
 * a frozen or eliminated controller's pieces exert no attacks. Frozen pieces of
 * any controller still occupy their squares and block sliding rays.
 *
 * Provisional shape (reviewer P2): this internal result is squares only. The
 * future public `Quaternity` API may return richer attacker records that retain
 * the attacking army's colour, so callers must not depend on the bare array.
 */
export function attackers(
  position: Position,
  square: Square,
  controller: ArmyColor,
): Square[] {
  return attackersOnBoard(
    occupancy(position),
    position.players,
    square,
    controller,
  );
}

/** Whether any piece controlled by `controller` attacks `square`. */
export function isAttacked(
  position: Position,
  square: Square,
  controller: ArmyColor,
): boolean {
  return attackers(position, square, controller).length > 0;
}

/**
 * Whether any king currently controlled by `player` is attacked by a hostile
 * (different, active) controller. Kings are matched by controller, not retained
 * army colour, so both kings of a multi-king controller are checked (spec 001/D31).
 */
export function inCheck(position: Position, player: ArmyColor): boolean {
  const board = occupancy(position);
  for (const [from, occupant] of board) {
    if (occupant.type !== "king" || occupant.controller !== player) {
      continue;
    }
    for (const other of ARMY_COLORS) {
      if (
        other !== player &&
        attackersOnBoard(board, position.players, from, other).length > 0
      ) {
        return true;
      }
    }
  }
  return false;
}
