/**
 * Public entry point for QuaterniTS: the bounded `Quaternity` class, the
 * `createPosition` validator and the types their surfaces expose.
 *
 * This is the whole public API. It is deliberately partial and claims no
 * complete engine: the class reports only the rules-authorized results
 * (001/D25, 001/D35, 001/D45), resolves moves through the guarded committed-move
 * seam (001/D38–001/D41 as approved by 001/D44), records draw offers/responses
 * and the `resign`/`recordTimeLoss`/`recordWalkover` freezes
 * (`docs/rules/administrative-actions.md`, 001/D45), answers attack/check queries
 * by attacker controller with records that keep each attacker's retained army
 * colour (`docs/rules/multiplayer-adjudication.md` §0/§1/§3) and fails closed on
 * the `[open]` checked-non-actor edge. `createPosition` stays the single
 * validation authority for a custom `Position`, which `Quaternity` re-validates,
 * isolates and rejects at load when it is already unresolved (001/D40(3)). The
 * class also owns the versioned V1 JSON snapshot of 001/D10: `snapshot()`
 * serializes the replay origin, the coordinate action log, the canonical event
 * records and the state, and `loadSnapshot(value)` replays the actions against a
 * fresh instance and adopts the result only when it agrees with the serialized
 * state, so a serialized result is never authoritative. The package ships a
 * `package.json` export map over built ESM/CJS entry points and declarations
 * plus the strict JSON Schema of that document in `schema/`, while the browser
 * consumer and installed-package gates stay Phase 4 gaps; there is still no mate
 * adjudication for a position no action produced. See the module note in
 * `./quaternity.ts` for the full list of deliberate gaps.
 */
export { Quaternity, UnresolvedAdjudicationError } from "./quaternity.ts";
export { SNAPSHOT_VERSION } from "./snapshot.ts";
export { createPosition } from "./position.ts";
export type {
  DrawProposalEvent,
  DrawResponseEvent,
  FreezeAction,
  FreezeEvent,
  GameOutcome,
  HistoryEvent,
  MoveEvent,
  PassEvent,
  PendingDraw,
} from "./quaternity.ts";
export type { CommittableMove } from "./committedMove.ts";
export type {
  QuaternitySnapshot,
  SnapshotAction,
  SnapshotEvent,
  SnapshotOutcome,
  SnapshotPosition,
  SnapshotState,
} from "./snapshot.ts";
export type { ArmyColor, PieceType, Square } from "./board.ts";
export type {
  Attacker,
  PlacedEntry,
  Position,
  PositionInput,
  PlayerStatus,
} from "./position.ts";
export type { LegalMove, PositionMoveInput } from "./legalMoves.ts";
export type { PromotionPieceType } from "./pawn.ts";
export type { AwardEvent } from "./batchAdjudication.ts";
export type { TurnSelection } from "./turn.ts";
