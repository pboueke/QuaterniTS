/**
 * The versioned V1 JSON snapshot, its coordinate action log and the strict
 * document parser behind `Quaternity.snapshot()` / `Quaternity.loadSnapshot`
 * (spec 001/D10/D15).
 *
 * This module is deliberately narrow. It owns three things and nothing else:
 *
 * - **Serialization.** {@link snapshotOf} renders the replay origin, the
 *   coordinate actions, the canonical event records and the resulting state as
 *   one deterministic JSON value. Boards are ordered by file then rank, optional
 *   values are explicit `null`s, and a pawn state always states its `committed`
 *   direction (or `null`), so the same game always produces byte-identical
 *   output.
 * - **Strict parsing.** {@link parseSnapshot} rejects a non-object document, a
 *   missing or unknown key at any level, an unsupported version, a malformed
 *   value and an invalid position, and it re-validates both positions through
 *   `createPosition`, which stays the single position authority. Nothing is
 *   defaulted and no key is ignored.
 * - **Comparison.** {@link sameJson} compares two JSON values structurally and
 *   key-order-insensitively, so the loader can reject a serialized state or event
 *   record that disagrees with the replay.
 *
 * What it does **not** own: the replay itself. `Quaternity.loadSnapshot` replays
 * the parsed coordinates through the public actions against a fresh instance and
 * only then adopts the result, so a serialized state is never trusted as
 * authority (001/D10). The engine's rule surface — legality, awards, the
 * fail-closed `[open]` edge — lives in the existing seams; this module decides no
 * game outcome and never fabricates one.
 *
 * The JSON shape here is the runtime half of
 * `schema/quaternits-snapshot-v1.schema.json`, which `make contract-check`
 * compares against runtime-built documents and committed fixtures.
 */
import {
  ARMY_COLORS,
  PIECE_TYPES,
  parseSquare,
  type ArmyColor,
  type PieceType,
  type Square,
} from "./board.ts";
import {
  PROMOTION_CHOICES,
  type PawnDirection,
  type PawnState,
  type PromotionPieceType,
} from "./pawn.ts";
import {
  createPosition,
  type PlacedEntry,
  type PlacedPiece,
  type PlayerStatus,
  type Position,
  type PositionInput,
} from "./position.ts";
import type { PawnMoveState } from "./legalMoves.ts";
import type { AwardEvent } from "./batchAdjudication.ts";
import type { TurnSelection } from "./turn.ts";
import type {
  FreezeAction,
  GameOutcome,
  HistoryEvent,
  PendingDraw,
} from "./quaternity.ts";

/** The only snapshot version this build reads and writes (spec 001/D10). */
export const SNAPSHOT_VERSION = 1;

/** The pawn directions a serialized pawn state may name. */
const PAWN_DIRECTIONS: readonly PawnDirection[] = [
  "up",
  "down",
  "left",
  "right",
];

/**
 * The freeze actions in canonical order. The `Record` key type keeps this list
 * complete: adding a member to `FreezeAction` fails to compile until the list is
 * extended, so the parser cannot silently reject a new action.
 */
const FREEZE_ACTION_ORDER: Readonly<Record<FreezeAction, number>> = {
  resign: 0,
  "time-loss": 1,
  walkover: 2,
};
const FREEZE_ACTIONS = Object.keys(
  FREEZE_ACTION_ORDER,
) as readonly FreezeAction[];

/** One pawn state as JSON: a direction, or both axes and the commitment. */
export type SnapshotPawnState =
  | { readonly kind: "ordinary"; readonly direction: PawnDirection }
  | {
      readonly kind: "advanced";
      readonly vertical: PawnDirection;
      readonly horizontal: PawnDirection;
      readonly committed: PawnDirection | null;
    };

/**
 * A placed piece without its square: the shape of a captured piece. `state` is
 * `null` exactly for a non-pawn, so the key set is uniform.
 */
export type SnapshotPlacedPiece =
  | {
      readonly army: ArmyColor;
      readonly type: "pawn";
      readonly state: SnapshotPawnState;
    }
  | {
      readonly army: ArmyColor;
      readonly type: Exclude<PieceType, "pawn">;
      readonly state: null;
    };

/** One placed piece: its square and the retained-placed piece fields. */
export type SnapshotPiece = SnapshotPlacedPiece & { readonly square: Square };

/** A pawn's state before and after one move. */
export interface SnapshotPawnTransition {
  readonly before: SnapshotPawnState;
  readonly after: SnapshotPawnState;
}

/** One mate award: the removed king's id and army, credited to the actor. */
export interface SnapshotAward {
  readonly kingId: string;
  readonly army: ArmyColor;
  readonly to: ArmyColor;
}

/** The next active controller, or the lone active winner (001/D35). */
export type SnapshotSelection = TurnSelection;

/** The current result; the `[open]` edge is a load error, never a result. */
export type SnapshotOutcome = GameOutcome;

/** The pending draw offer and its recorded acceptances (§6, 001/D45). */
export type SnapshotPendingDraw = PendingDraw;

/** One committed board move, as a canonical event record. */
export interface SnapshotMoveEvent {
  readonly kind: "move";
  readonly from: Square;
  readonly to: Square;
  readonly army: ArmyColor;
  readonly controller: ArmyColor;
  readonly promotes: boolean;
  readonly promotion: PromotionPieceType | null;
  readonly captured: SnapshotPlacedPiece | null;
  readonly pawn: SnapshotPawnTransition | null;
  readonly awards: readonly SnapshotAward[];
  readonly selection: SnapshotSelection;
}

/** One board-less pass, as a canonical event record (§5). */
export interface SnapshotPassEvent {
  readonly kind: "pass";
  readonly player: ArmyColor;
  readonly selection: SnapshotSelection;
}

/** One draw proposal, as a canonical event record (§6). */
export interface SnapshotProposalEvent {
  readonly kind: "draw-proposal";
  readonly proposer: ArmyColor;
}

/** One response to the pending draw offer, as a canonical event record (§6). */
export interface SnapshotResponseEvent {
  readonly kind: "draw-response";
  readonly player: ArmyColor;
  readonly accept: boolean;
}

/** One administrative freeze, as a canonical event record (§7, 001/D45). */
export interface SnapshotFreezeEvent {
  readonly kind: "freeze";
  readonly action: FreezeAction;
  readonly player: ArmyColor;
  readonly selection: SnapshotSelection;
}

/** One canonical event record: exactly one recorded action. */
export type SnapshotEvent =
  | SnapshotMoveEvent
  | SnapshotPassEvent
  | SnapshotProposalEvent
  | SnapshotResponseEvent
  | SnapshotFreezeEvent;

/** One validated position as JSON: pieces, army mapping, statuses and turn. */
export interface SnapshotPosition {
  readonly pieces: readonly SnapshotPiece[];
  readonly controllers: Readonly<Record<ArmyColor, ArmyColor>>;
  readonly players: Readonly<Record<ArmyColor, PlayerStatus>>;
  readonly turn: ArmyColor;
}

/** The resulting state: the position plus the administrative and outcome state. */
export interface SnapshotState {
  readonly position: SnapshotPosition;
  readonly pendingDraw: SnapshotPendingDraw | null;
  readonly drawAgreed: boolean;
  readonly outcome: SnapshotOutcome;
}

/** One coordinate replay action: the deterministic long-coordinate log. */
export type SnapshotAction =
  | {
      readonly kind: "move";
      readonly from: Square;
      readonly to: Square;
      readonly promotion: PromotionPieceType | null;
    }
  | { readonly kind: "pass" }
  | { readonly kind: "draw-proposal" }
  | {
      readonly kind: "draw-response";
      readonly player: ArmyColor;
      readonly accept: boolean;
    }
  | {
      readonly kind: "freeze";
      readonly action: FreezeAction;
      readonly player: ArmyColor;
    };

/** A parsed, validated snapshot document: replay input, records and state. */
export interface QuaternitySnapshot {
  readonly version: typeof SNAPSHOT_VERSION;
  /** The position the action log starts from; the replay origin. */
  readonly initial: SnapshotPosition;
  /** The coordinate actions, in order; the authoritative replay input. */
  readonly actions: readonly SnapshotAction[];
  /** The canonical event records the actions must reproduce. */
  readonly log: readonly SnapshotEvent[];
  /** The serialized result the replay must reproduce. */
  readonly state: SnapshotState;
}

/** Everything {@link snapshotOf} needs; all of it comes from the live game. */
export interface SnapshotInput {
  readonly initial: Position;
  readonly events: readonly HistoryEvent[];
  readonly position: Position;
  readonly pendingDraw: PendingDraw | null;
  readonly drawAgreed: boolean;
  readonly outcome: GameOutcome;
}

/** The order two squares hold in a serialized board: file, then rank. */
function squareOrder(square: Square): number {
  return (
    (square.charCodeAt(0) - "a".charCodeAt(0)) * 12 + Number(square.slice(1))
  );
}

/** One pawn state as JSON: an absent commitment is an explicit `null`. */
function serializePawnState(state: PawnState): SnapshotPawnState {
  return state.kind === "ordinary"
    ? { kind: "ordinary", direction: state.direction }
    : {
        kind: "advanced",
        vertical: state.vertical,
        horizontal: state.horizontal,
        committed: state.committed ?? null,
      };
}

/** One placed piece without its square, as JSON. */
function serializePlacedPiece(placed: PlacedPiece): SnapshotPlacedPiece {
  return placed.type === "pawn"
    ? {
        army: placed.army,
        type: "pawn",
        state: serializePawnState(placed.state),
      }
    : { army: placed.army, type: placed.type, state: null };
}

/** A captured piece as JSON, or `null` for a quiet move. */
function serializeCaptured(
  captured: PlacedPiece | undefined,
): SnapshotPlacedPiece | null {
  return captured === undefined ? null : serializePlacedPiece(captured);
}

/** A pawn's before/after state as JSON, or `null` for a non-pawn move. */
function serializePawnTransition(
  pawn: PawnMoveState | undefined,
): SnapshotPawnTransition | null {
  return pawn === undefined
    ? null
    : {
        before: serializePawnState(pawn.before),
        after: serializePawnState(pawn.after),
      };
}

/** The turn selection as JSON, copied so no event object is aliased. */
function serializeSelection(selection: TurnSelection): SnapshotSelection {
  return selection.kind === "next"
    ? { kind: "next", player: selection.player }
    : { kind: "winner", winner: selection.winner };
}

/** One mate award as JSON, copied so no event object is aliased. */
function serializeAward(award: AwardEvent): SnapshotAward {
  return { kingId: award.kingId, army: award.army, to: award.to };
}

/** The pending draw offer as JSON, or `null` when none is pending. */
function serializePendingDraw(
  offer: PendingDraw | null,
): SnapshotPendingDraw | null {
  return offer === null
    ? null
    : { proposer: offer.proposer, acceptedBy: [...offer.acceptedBy] };
}

/** The current result as JSON, copied field by field. */
function serializeOutcome(outcome: GameOutcome): SnapshotOutcome {
  switch (outcome.kind) {
    case "in-progress":
      return { kind: "in-progress" };
    case "winner":
      return { kind: "winner", winner: outcome.winner };
    case "draw":
      return { kind: "draw" };
  }
}

/** A validated position as JSON: board ordered by file then rank. */
export function serializePosition(position: Position): SnapshotPosition {
  return {
    pieces: [...position.board.entries()]
      .sort(([left], [right]) => squareOrder(left) - squareOrder(right))
      .map(([square, placed]) => ({
        square,
        ...serializePlacedPiece(placed),
      })),
    controllers: { ...position.controllers },
    players: { ...position.players },
    turn: position.turn,
  };
}

/** One recorded event as its canonical JSON record. */
export function serializeEvent(event: HistoryEvent): SnapshotEvent {
  switch (event.kind) {
    case "move":
      return {
        kind: "move",
        from: event.move.from,
        to: event.move.to,
        army: event.move.army,
        controller: event.move.controller,
        promotes: event.move.promotes,
        promotion: event.move.promotion ?? null,
        captured: serializeCaptured(event.move.captured),
        pawn: serializePawnTransition(event.move.pawn),
        awards: event.awards.map((award) => serializeAward(award)),
        selection: serializeSelection(event.selection),
      };
    case "pass":
      return {
        kind: "pass",
        player: event.player,
        selection: serializeSelection(event.selection),
      };
    case "draw-proposal":
      return { kind: "draw-proposal", proposer: event.proposer };
    case "draw-response":
      return {
        kind: "draw-response",
        player: event.player,
        accept: event.accept,
      };
    case "freeze":
      return {
        kind: "freeze",
        action: event.action,
        player: event.player,
        selection: serializeSelection(event.selection),
      };
  }
}

/** One recorded event as the coordinate action that replays it. */
export function serializeAction(event: HistoryEvent): SnapshotAction {
  switch (event.kind) {
    case "move":
      return {
        kind: "move",
        from: event.move.from,
        to: event.move.to,
        promotion: event.move.promotion ?? null,
      };
    case "pass":
      return { kind: "pass" };
    case "draw-proposal":
      return { kind: "draw-proposal" };
    case "draw-response":
      return {
        kind: "draw-response",
        player: event.player,
        accept: event.accept,
      };
    case "freeze":
      return { kind: "freeze", action: event.action, player: event.player };
  }
}

/** The complete V1 document of one game: origin, actions, records and state. */
export function snapshotOf(input: SnapshotInput): QuaternitySnapshot {
  return {
    version: SNAPSHOT_VERSION,
    initial: serializePosition(input.initial),
    actions: input.events.map((event) => serializeAction(event)),
    log: input.events.map((event) => serializeEvent(event)),
    state: {
      position: serializePosition(input.position),
      pendingDraw: serializePendingDraw(input.pendingDraw),
      drawAgreed: input.drawAgreed,
      outcome: serializeOutcome(input.outcome),
    },
  };
}

/** Freeze a JSON value in place, so a caller cannot rewrite a returned snapshot. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

/** A JSON value's deterministic, key-order-insensitive text form. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value) as string;
}

/** Whether two JSON values are structurally equal, ignoring key order. */
export function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/** A parsed document: a validated origin, the actions, records and state. */
export interface ParsedSnapshot {
  /** The replay origin, validated by `createPosition` and the load bound. */
  readonly initial: Position;
  readonly actions: readonly SnapshotAction[];
  readonly log: readonly SnapshotEvent[];
  /** The serialized state, normalized to its canonical form. */
  readonly state: SnapshotState;
}

type JsonObject = Record<string, unknown>;

/** Reject a document with the loader's error vocabulary. */
function fail(detail: string): never {
  throw new Error(`loadSnapshot: ${detail}`);
}

/** A JSON object, rejecting an array, `null` and every non-object value. */
function plainObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(`${label} must be a JSON object`);
  }
  return value as JsonObject;
}

/** A JSON object with exactly `keys`: an unknown or missing key is rejected. */
function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): JsonObject {
  const record = plainObject(value, label);
  const present = Object.keys(record);
  const unknownKeys = present.filter((key) => !keys.includes(key));
  if (unknownKeys.length > 0) {
    return fail(`${label} has unknown key(s) ${unknownKeys.join(", ")}`);
  }
  const missingKeys = keys.filter((key) => !present.includes(key));
  if (missingKeys.length > 0) {
    return fail(`${label} is missing key(s) ${missingKeys.join(", ")}`);
  }
  return record;
}

/** A JSON array. */
function arrayOf(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    return fail(`${label} must be a JSON array`);
  }
  return value;
}

/** A string value. */
function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") {
    return fail(`${label} must be a string`);
  }
  return value;
}

/** A boolean value. */
function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    return fail(`${label} must be a boolean`);
  }
  return value;
}

/** One of a fixed vocabulary, rejecting an unknown member and a non-string. */
function enumerated<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return fail(`${label} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

/** A board square, rejecting an off-board or malformed coordinate. */
function squareValue(value: unknown, label: string): Square {
  const text = stringValue(value, label);
  const square = parseSquare(text);
  if (square === undefined) {
    return fail(`${label} ${text} is not a board square`);
  }
  return square;
}

/** A pawn state as JSON: the kind selects its exact key set. */
function parsePawnState(value: unknown, label: string): SnapshotPawnState {
  const kind = plainObject(value, label).kind;
  if (kind === "ordinary") {
    const record = exactObject(value, ["kind", "direction"], label);
    return {
      kind: "ordinary",
      direction: enumerated(
        record.direction,
        PAWN_DIRECTIONS,
        `${label}.direction`,
      ),
    };
  }
  if (kind === "advanced") {
    const record = exactObject(
      value,
      ["kind", "vertical", "horizontal", "committed"],
      label,
    );
    return {
      kind: "advanced",
      vertical: enumerated(
        record.vertical,
        PAWN_DIRECTIONS,
        `${label}.vertical`,
      ),
      horizontal: enumerated(
        record.horizontal,
        PAWN_DIRECTIONS,
        `${label}.horizontal`,
      ),
      committed:
        record.committed === null
          ? null
          : enumerated(record.committed, PAWN_DIRECTIONS, `${label}.committed`),
    };
  }
  return fail(`${label}.kind must be "ordinary" or "advanced"`);
}

/**
 * A placed piece without its square as JSON. The `state` key is `null` for a
 * non-pawn and a pawn state for a pawn, so the two are never confused.
 */
function parsePlacedPiece(
  record: JsonObject,
  label: string,
): SnapshotPlacedPiece {
  const army = enumerated(record.army, ARMY_COLORS, `${label}.army`);
  const type = enumerated(record.type, PIECE_TYPES, `${label}.type`);
  if (type === "pawn") {
    if (record.state === null) {
      return fail(`${label} is a pawn without a pawn state`);
    }
    return {
      army,
      type,
      state: parsePawnState(record.state, `${label}.state`),
    };
  }
  if (record.state !== null) {
    return fail(
      `${label} is a ${type} carrying a pawn state ${JSON.stringify(record.state)}`,
    );
  }
  return { army, type, state: null };
}

/** The runtime pawn state a parsed JSON pawn state stands for. */
function pawnStateOf(state: SnapshotPawnState): PawnState {
  return state.kind === "ordinary"
    ? { kind: "ordinary", direction: state.direction }
    : {
        kind: "advanced",
        vertical: state.vertical,
        horizontal: state.horizontal,
        committed: state.committed ?? undefined,
      };
}

/** One `createPosition` entry parsed from a serialized piece. */
function parsePlacedEntry(value: unknown, label: string): PlacedEntry {
  const record = exactObject(value, ["square", "army", "type", "state"], label);
  const square = squareValue(record.square, `${label}.square`);
  const piece = parsePlacedPiece(record, label);
  return piece.type === "pawn"
    ? {
        square,
        army: piece.army,
        type: "pawn",
        state: pawnStateOf(piece.state),
      }
    : { square, army: piece.army, type: piece.type };
}

/** The army-to-controller mapping, one entry per army. */
function parseControllers(
  value: unknown,
  label: string,
): Readonly<Record<ArmyColor, ArmyColor>> {
  const record = exactObject(value, ARMY_COLORS, label);
  return {
    white: enumerated(record.white, ARMY_COLORS, `${label}.white`),
    red: enumerated(record.red, ARMY_COLORS, `${label}.red`),
    black: enumerated(record.black, ARMY_COLORS, `${label}.black`),
    green: enumerated(record.green, ARMY_COLORS, `${label}.green`),
  };
}

/** The player statuses, one entry per player. */
function parsePlayers(
  value: unknown,
  label: string,
): Readonly<Record<ArmyColor, PlayerStatus>> {
  const statuses: readonly PlayerStatus[] = ["active", "frozen", "eliminated"];
  const record = exactObject(value, ARMY_COLORS, label);
  return {
    white: enumerated(record.white, statuses, `${label}.white`),
    red: enumerated(record.red, statuses, `${label}.red`),
    black: enumerated(record.black, statuses, `${label}.black`),
    green: enumerated(record.green, statuses, `${label}.green`),
  };
}

/** A serialized position as `createPosition` input; it validates the result. */
function parsePositionInput(value: unknown, label: string): PositionInput {
  const record = exactObject(
    value,
    ["pieces", "controllers", "players", "turn"],
    label,
  );
  return {
    pieces: arrayOf(record.pieces, `${label}.pieces`).map((entry, index) =>
      parsePlacedEntry(entry, `${label}.pieces[${index}]`),
    ),
    controllers: parseControllers(record.controllers, `${label}.controllers`),
    players: parsePlayers(record.players, `${label}.players`),
    turn: enumerated(record.turn, ARMY_COLORS, `${label}.turn`),
  };
}

/** The pending draw offer, or `null` when no offer is pending. */
function parsePendingDraw(
  value: unknown,
  label: string,
): SnapshotPendingDraw | null {
  if (value === null) {
    return null;
  }
  const record = exactObject(value, ["proposer", "acceptedBy"], label);
  return {
    proposer: enumerated(record.proposer, ARMY_COLORS, `${label}.proposer`),
    acceptedBy: arrayOf(record.acceptedBy, `${label}.acceptedBy`).map(
      (voter, index) =>
        enumerated(voter, ARMY_COLORS, `${label}.acceptedBy[${index}]`),
    ),
  };
}

/** The current result, by its exact key set per kind. */
function parseOutcome(value: unknown, label: string): SnapshotOutcome {
  const kind = plainObject(value, label).kind;
  if (kind === "in-progress") {
    exactObject(value, ["kind"], label);
    return { kind: "in-progress" };
  }
  if (kind === "winner") {
    const record = exactObject(value, ["kind", "winner"], label);
    return {
      kind: "winner",
      winner: enumerated(record.winner, ARMY_COLORS, `${label}.winner`),
    };
  }
  if (kind === "draw") {
    exactObject(value, ["kind"], label);
    return { kind: "draw" };
  }
  return fail(`${label}.kind must be "in-progress", "winner" or "draw"`);
}

/** The turn selection, by its exact key set per kind. */
function parseSelection(value: unknown, label: string): SnapshotSelection {
  const kind = plainObject(value, label).kind;
  if (kind === "next") {
    const record = exactObject(value, ["kind", "player"], label);
    return {
      kind: "next",
      player: enumerated(record.player, ARMY_COLORS, `${label}.player`),
    };
  }
  if (kind === "winner") {
    const record = exactObject(value, ["kind", "winner"], label);
    return {
      kind: "winner",
      winner: enumerated(record.winner, ARMY_COLORS, `${label}.winner`),
    };
  }
  return fail(`${label}.kind must be "next" or "winner"`);
}

/** One mate award. */
function parseAward(value: unknown, label: string): SnapshotAward {
  const record = exactObject(value, ["kingId", "army", "to"], label);
  return {
    kingId: stringValue(record.kingId, `${label}.kingId`),
    army: enumerated(record.army, ARMY_COLORS, `${label}.army`),
    to: enumerated(record.to, ARMY_COLORS, `${label}.to`),
  };
}

/** A captured piece, or `null` for a quiet move. */
function parseCaptured(
  value: unknown,
  label: string,
): SnapshotPlacedPiece | null {
  if (value === null) {
    return null;
  }
  const record = exactObject(value, ["army", "type", "state"], label);
  return parsePlacedPiece(record, label);
}

/** A pawn's before/after state, or `null` for a non-pawn move. */
function parsePawnTransition(
  value: unknown,
  label: string,
): SnapshotPawnTransition | null {
  if (value === null) {
    return null;
  }
  const record = exactObject(value, ["before", "after"], label);
  return {
    before: parsePawnState(record.before, `${label}.before`),
    after: parsePawnState(record.after, `${label}.after`),
  };
}

/** An explicit promotion choice, or `null` for a non-promoting move. */
function parsePromotion(
  value: unknown,
  label: string,
): PromotionPieceType | null {
  return value === null ? null : enumerated(value, PROMOTION_CHOICES, label);
}

/** One canonical move record. */
function parseMoveEvent(value: unknown, label: string): SnapshotMoveEvent {
  const record = exactObject(
    value,
    [
      "kind",
      "from",
      "to",
      "army",
      "controller",
      "promotes",
      "promotion",
      "captured",
      "pawn",
      "awards",
      "selection",
    ],
    label,
  );
  return {
    kind: "move",
    from: squareValue(record.from, `${label}.from`),
    to: squareValue(record.to, `${label}.to`),
    army: enumerated(record.army, ARMY_COLORS, `${label}.army`),
    controller: enumerated(
      record.controller,
      ARMY_COLORS,
      `${label}.controller`,
    ),
    promotes: booleanValue(record.promotes, `${label}.promotes`),
    promotion: parsePromotion(record.promotion, `${label}.promotion`),
    captured: parseCaptured(record.captured, `${label}.captured`),
    pawn: parsePawnTransition(record.pawn, `${label}.pawn`),
    awards: arrayOf(record.awards, `${label}.awards`).map((award, index) =>
      parseAward(award, `${label}.awards[${index}]`),
    ),
    selection: parseSelection(record.selection, `${label}.selection`),
  };
}

/** One canonical event record, by its exact key set per kind. */
function parseEvent(value: unknown, label: string): SnapshotEvent {
  const kind = plainObject(value, label).kind;
  switch (kind) {
    case "move":
      return parseMoveEvent(value, label);
    case "pass": {
      const record = exactObject(value, ["kind", "player", "selection"], label);
      return {
        kind: "pass",
        player: enumerated(record.player, ARMY_COLORS, `${label}.player`),
        selection: parseSelection(record.selection, `${label}.selection`),
      };
    }
    case "draw-proposal": {
      const record = exactObject(value, ["kind", "proposer"], label);
      return {
        kind: "draw-proposal",
        proposer: enumerated(record.proposer, ARMY_COLORS, `${label}.proposer`),
      };
    }
    case "draw-response": {
      const record = exactObject(value, ["kind", "player", "accept"], label);
      return {
        kind: "draw-response",
        player: enumerated(record.player, ARMY_COLORS, `${label}.player`),
        accept: booleanValue(record.accept, `${label}.accept`),
      };
    }
    case "freeze": {
      const record = exactObject(
        value,
        ["kind", "action", "player", "selection"],
        label,
      );
      return {
        kind: "freeze",
        action: enumerated(record.action, FREEZE_ACTIONS, `${label}.action`),
        player: enumerated(record.player, ARMY_COLORS, `${label}.player`),
        selection: parseSelection(record.selection, `${label}.selection`),
      };
    }
    default:
      return fail(`${label}.kind ${JSON.stringify(kind)} is not a known event`);
  }
}

/** One coordinate replay action, by its exact key set per kind. */
function parseAction(value: unknown, label: string): SnapshotAction {
  const kind = plainObject(value, label).kind;
  switch (kind) {
    case "move": {
      const record = exactObject(
        value,
        ["kind", "from", "to", "promotion"],
        label,
      );
      return {
        kind: "move",
        from: squareValue(record.from, `${label}.from`),
        to: squareValue(record.to, `${label}.to`),
        promotion: parsePromotion(record.promotion, `${label}.promotion`),
      };
    }
    case "pass":
      exactObject(value, ["kind"], label);
      return { kind: "pass" };
    case "draw-proposal":
      exactObject(value, ["kind"], label);
      return { kind: "draw-proposal" };
    case "draw-response": {
      const record = exactObject(value, ["kind", "player", "accept"], label);
      return {
        kind: "draw-response",
        player: enumerated(record.player, ARMY_COLORS, `${label}.player`),
        accept: booleanValue(record.accept, `${label}.accept`),
      };
    }
    case "freeze": {
      const record = exactObject(value, ["kind", "action", "player"], label);
      return {
        kind: "freeze",
        action: enumerated(record.action, FREEZE_ACTIONS, `${label}.action`),
        player: enumerated(record.player, ARMY_COLORS, `${label}.player`),
      };
    }
    default:
      return fail(
        `${label}.kind ${JSON.stringify(kind)} is not a known action`,
      );
  }
}

/** The serialized state, normalized to the canonical serialized form. */
function parseState(value: unknown, label: string): SnapshotState {
  const record = exactObject(
    value,
    ["position", "pendingDraw", "drawAgreed", "outcome"],
    label,
  );
  return {
    position: serializePosition(
      createPosition(parsePositionInput(record.position, `${label}.position`)),
    ),
    pendingDraw: parsePendingDraw(record.pendingDraw, `${label}.pendingDraw`),
    drawAgreed: booleanValue(record.drawAgreed, `${label}.drawAgreed`),
    outcome: parseOutcome(record.outcome, `${label}.outcome`),
  };
}

/**
 * Parse and validate a snapshot document. A non-object, a missing or unknown
 * key, an unsupported version, a malformed value and an invalid position are all
 * rejected with `loadSnapshot: ...`, and both positions are re-validated through
 * `createPosition`, the single position authority. The returned origin is a
 * validated `Position`; the returned state is normalized to the canonical
 * serialized form so it can be compared with the replay result.
 */
export function parseSnapshot(value: unknown): ParsedSnapshot {
  const record = exactObject(
    value,
    ["version", "initial", "actions", "log", "state"],
    "snapshot",
  );
  if (record.version !== SNAPSHOT_VERSION) {
    return fail(
      `snapshot version ${JSON.stringify(record.version)} is not supported; this build reads version ${SNAPSHOT_VERSION}`,
    );
  }
  return {
    initial: createPosition(
      parsePositionInput(record.initial, "snapshot.initial"),
    ),
    actions: arrayOf(record.actions, "snapshot.actions").map((action, index) =>
      parseAction(action, `snapshot.actions[${index}]`),
    ),
    log: arrayOf(record.log, "snapshot.log").map((event, index) =>
      parseEvent(event, `snapshot.log[${index}]`),
    ),
    state: parseState(record.state, "snapshot.state"),
  };
}
