/**
 * Pure assimilation **transfer unit** for the multiplayer adjudication slice
 * (spec 001/D36 as corrected by 001/D37; `docs/rules/multiplayer-adjudication.md`
 * §0/§1/§4c).
 *
 * This is the Phase 3D1 internal seam. It is deliberately narrow and is **not**
 * a committed action, a public move endpoint or a rules-complete engine:
 *
 * - {@link assimilateMatedKings} takes a validated `Position` and a caller-
 *   supplied canonical batch of the retained armies of **existing mated kings**
 *   and returns a **new** validated `Position` plus one award per removed king.
 *   It never judges mate and never reads geometry: the caller supplies the
 *   batch, so no adapter silently decides checkmate here. Production mate
 *   detection is `src/mate.ts`.
 * - Atomic and snapshot-based (001/D32/001/D37): every batch king is removed first and
 *   each controller's survivor status is decided from that full post-batch
 *   snapshot, never per king.
 * - 001/D36: a controller that still has a king on the board transfers only the
 *   surviving pieces of each mated king's retained **army colour** and keeps
 *   every other army it controls.
 * - 001/D37: a controller whose **last** king is removed becomes `eliminated` and
 *   **every** army it still controls transfers to the actor — including a
 *   previously assimilated kingless army — each army colour retained and each
 *   piece transferred at most once. "A king" means a king still on the board,
 *   so a frozen player's king counts (001/D32).
 * - Immutable army colours are retained; only `controller` changes, and only
 *   the army-to-controller mapping is re-pointed. The turn is unchanged.
 * - Fail closed and atomic: an invalid or duplicated batch army, a batch army
 *   with no king on the board, an inactive actor, or a batch that would credit
 *   the actor with its own king all throw and change nothing. (The last is
 *   001/D38 clause (a)'s self-credit guard; the rest of 001/D38 is out of scope.)
 *
 * Out of scope here (withheld by 001/D38/001/D27): the assembled commit path, 001/D38's
 * post-batch safety filter, turn advancement, history, draw/win resolution and
 * the `[blocked]` checked-non-actor edge.
 *
 * There is no mutable module state.
 */
import { ARMY_COLORS, type ArmyColor } from "./board.ts";
import {
  createPosition,
  type PlacedEntry,
  type PlacedPiece,
  type PlayerStatus,
  type Position,
} from "./position.ts";
import type { Square } from "./board.ts";

/** One mate award: the removed king's retained army, credited to the actor. */
export interface AssimilationAward {
  readonly king: ArmyColor;
  readonly to: ArmyColor;
}

/** The transfer unit's result: the next Position and its award log. */
export interface AssimilationResult {
  readonly position: Position;
  readonly awards: readonly AssimilationAward[];
}

/** Canonical player order index (white, red, black, green). */
function playerOrder(player: ArmyColor): number {
  return ARMY_COLORS.indexOf(player);
}

/** A PlacedPiece back into a createPosition entry, preserving pawn state. */
function entryOf(square: Square, placed: PlacedPiece): PlacedEntry {
  return placed.type === "pawn"
    ? { square, army: placed.army, type: "pawn", state: placed.state }
    : { square, army: placed.army, type: placed.type };
}

/** The batch as a deduplicated set, rejecting unknown or repeated armies. */
function validateBatch(matedKingArmies: readonly ArmyColor[]): Set<ArmyColor> {
  const batch = new Set<ArmyColor>();
  for (const army of matedKingArmies) {
    if (!ARMY_COLORS.includes(army)) {
      throw new Error(`assimilateMatedKings: unknown army ${String(army)}`);
    }
    if (batch.has(army)) {
      throw new Error(`assimilateMatedKings: duplicated army ${army}`);
    }
    batch.add(army);
  }
  return batch;
}

/**
 * Whether every batch army has a king on the board and none is controlled by
 * the actor. Both are atomic rejections (001/D38 clause (a) self-credit guard).
 */
function validateMatedKings(
  position: Position,
  batch: ReadonlySet<ArmyColor>,
  actor: ArmyColor,
): void {
  const kingArmies = new Set<ArmyColor>();
  for (const placed of position.board.values()) {
    if (placed.type === "king") {
      kingArmies.add(placed.army);
    }
  }
  for (const army of batch) {
    if (!kingArmies.has(army)) {
      throw new Error(
        `assimilateMatedKings: no king of army ${army} is on the board`,
      );
    }
    if (position.controllers[army] === actor) {
      throw new Error(
        `assimilateMatedKings: actor ${actor} may not be credited with its own king ${army}`,
      );
    }
  }
}

/**
 * Remove the batch kings and transfer their controllers' armies to `actor`
 * (001/D36/001/D37), returning a new validated Position. The input is never mutated;
 * the turn is unchanged. See the module note for the full scope.
 */
export function assimilateMatedKings(
  position: Position,
  matedKingArmies: readonly ArmyColor[],
  actor: ArmyColor,
): AssimilationResult {
  if (position.players[actor] !== "active") {
    throw new Error(`assimilateMatedKings: actor ${actor} is not active`);
  }
  const batch = validateBatch(matedKingArmies);
  validateMatedKings(position, batch, actor);

  // The post-batch snapshot: kings removed, pieces and controllers unchanged.
  const pieces: PlacedEntry[] = [];
  const survivingControllers = new Set<ArmyColor>();
  for (const [square, placed] of position.board) {
    if (placed.type === "king" && batch.has(placed.army)) {
      continue;
    }
    if (placed.type === "king") {
      survivingControllers.add(position.controllers[placed.army]);
    }
    pieces.push(entryOf(square, placed));
  }

  // Mated armies grouped by the controller that owned each mated king, in the
  // canonical batch order the caller supplied (already validated).
  const matedByController = new Map<ArmyColor, ArmyColor[]>();
  for (const army of batch) {
    const controller = position.controllers[army];
    const armies = matedByController.get(controller) ?? [];
    armies.push(army);
    matedByController.set(controller, armies);
  }

  const controllers: Record<ArmyColor, ArmyColor> = {
    ...position.controllers,
  };
  const players: Record<ArmyColor, PlayerStatus> = { ...position.players };
  for (const [controller, matedArmies] of matedByController) {
    if (survivingControllers.has(controller)) {
      // 001/D36: only each mated king's retained army colour transfers.
      for (const army of matedArmies) {
        controllers[army] = actor;
      }
      continue;
    }
    // 001/D37: the last king is gone, so the controller is eliminated and every
    // army it still controls transfers.
    players[controller] = "eliminated";
    for (const army of ARMY_COLORS) {
      if (controllers[army] === controller) {
        controllers[army] = actor;
      }
    }
  }

  const next = createPosition({
    pieces,
    controllers,
    players,
    turn: position.turn,
  });
  const awards: AssimilationAward[] = [...batch]
    .sort(
      (a, b) =>
        playerOrder(position.controllers[a]) -
          playerOrder(position.controllers[b]) ||
        playerOrder(a) - playerOrder(b),
    )
    .map((army) => ({ king: army, to: actor }));
  return { position: next, awards };
}
