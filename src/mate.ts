/**
 * King-by-king checkmate **detection** for the multiplayer adjudication slice.
 *
 * This is the Phase 3C slice: a pure, detection-only mate query on top of the
 * position (./position.ts) and legal-move (./legalMoves.ts) modules. It is
 * deliberately narrow and is NOT the committed adjudication:
 *
 * - {@link isMatedKing} reports whether the single king of retained army
 *   `army` is checkmated. The king is keyed by its immutable army colour and
 *   evaluated by its **current controller** from the position's mapping, so an
 *   assimilated king is always in scope (spec 001/D31/001/D33).
 * - {@link matedKings} reports the retained armies of every mated king on the
 *   board, ordered white, red, black, green by **current controller** then by
 *   retained army for a tie (spec 001/D30/001/D31).
 *
 * Scope and semantics (spec 001/D26/001/D31/001/D32/001/D33; policy table
 * `docs/rules/multiplayer-adjudication.md` §1 and §3):
 *
 * - Every king still on the board is in scope, including a **frozen** player's
 *   king (001/D32). A king that is not on the board is never reported.
 * - A checked king is mated only when **no** move by its current controller can
 *   make it safe while keeping all of that controller's other kings safe (001/D31).
 *   An active controller's defenses are its real {@link legalMoves}; a frozen
 *   controller's defenses are **hypothetical** active ones — a temporary, fully
 *   validated Position marks only that controller active and on turn, so its
 *   frozen army may hypothetically move, block, capture or escape. The real
 *   position is never mutated and frozen pieces still exert no actual attacks
 *   in normal queries (001/D26).
 * - Multiple simultaneous mates are only **detected**, never removed or
 *   awarded; this slice does not cascade, transfer, advance the turn or resolve
 *   a draw, pass or win (001/D30/001/D32/001/D35).
 *
 * There is no mutable module state.
 */
import { ARMY_COLORS, type ArmyColor, type Square } from "./board.ts";
import { legalMoves, type LegalMove } from "./legalMoves.ts";
import {
  attackers,
  createPosition,
  type PlacedEntry,
  type PlacedPiece,
  type PlayerStatus,
  type Position,
} from "./position.ts";

/** The on-board square of the single king of retained army `army`, or undefined. */
function kingSquare(position: Position, army: ArmyColor): Square | undefined {
  for (const [square, placed] of position.board) {
    if (placed.type === "king" && placed.army === army) {
      return square;
    }
  }
  return undefined;
}

/** Whether any active hostile controller attacks `square` (spec 001/D26/001/D33). */
function isChecked(
  position: Position,
  square: Square,
  controller: ArmyColor,
): boolean {
  for (const other of ARMY_COLORS) {
    if (other !== controller && attackers(position, square, other).length > 0) {
      return true;
    }
  }
  return false;
}

/** A PlacedPiece back into a createPosition entry, preserving pawn state. */
function entryOf(square: Square, placed: PlacedPiece): PlacedEntry {
  return placed.type === "pawn"
    ? { square, army: placed.army, type: "pawn", state: placed.state }
    : { square, army: placed.army, type: placed.type };
}

/**
 * A fresh, fully validated copy of `position` with `controller` marked active
 * and on turn, so a frozen army can be evaluated for hypothetical active
 * defense (spec 001/D26/001/D32). The input position is never mutated.
 */
function activeDefensePosition(
  position: Position,
  controller: ArmyColor,
): Position {
  const players: Record<ArmyColor, PlayerStatus> = {
    ...position.players,
    [controller]: "active",
  };
  return createPosition({
    pieces: [...position.board].map(([square, placed]) =>
      entryOf(square, placed),
    ),
    controllers: position.controllers,
    players,
    turn: controller,
  });
}

/**
 * The defenses available to `controller`: its real moves when active, or the
 * hypothetical active moves of its frozen army when frozen (spec 001/D26/001/D31).
 */
function defenses(position: Position, controller: ArmyColor): LegalMove[] {
  if (position.players[controller] === "active") {
    return legalMoves(position, controller);
  }
  return legalMoves(activeDefensePosition(position, controller), controller);
}

/**
 * Whether the single king of retained army `army` is checkmated (spec 001/D31).
 *
 * Returns `false` when no such king is on the board. A king is mated only when
 * it is in check and its controller has no legal move that keeps every one of
 * its kings safe; a frozen controller is judged on hypothetical active
 * defenses (spec 001/D26/001/D32).
 */
export function isMatedKing(position: Position, army: ArmyColor): boolean {
  const square = kingSquare(position, army);
  if (square === undefined) {
    return false;
  }
  const controller = position.controllers[army];
  if (!isChecked(position, square, controller)) {
    return false;
  }
  return defenses(position, controller).length === 0;
}

/** Canonical player order index (white, red, black, green). */
function playerOrder(army: ArmyColor): number {
  return ARMY_COLORS.indexOf(army);
}

/**
 * The retained armies of every mated king on the board, ordered white, red,
 * black, green by current controller then by retained army (spec 001/D30/001/D31).
 *
 * Detection only: no king is removed and no army is transferred.
 */
export function matedKings(position: Position): ArmyColor[] {
  const armies = [...position.board.values()]
    .filter((placed) => placed.type === "king")
    .map((placed) => placed.army)
    .filter((army) => isMatedKing(position, army));
  return armies.sort(
    (a, b) =>
      playerOrder(position.controllers[a]) -
        playerOrder(position.controllers[b]) || playerOrder(a) - playerOrder(b),
  );
}
