/**
 * Pure internal turn-order and last-active-winner selector for the multiplayer
 * slice (spec 001/D35; `docs/rules/multiplayer-adjudication.md` §0/§7).
 *
 * This is a small internal seam. It is not a committed action, a turn
 * applicator, a general game-outcome resolver or a rules-complete engine:
 *
 * - {@link selectTurn} takes a caller-supplied player-status map and the
 *   preceding actor and returns either the next active controller to move or
 *   the winner once only one active controller remains. It reads no board, no
 *   `Position` and no history, and it mutates nothing.
 * - Turn order is clockwise from White: `white → red → black → green`. The scan
 *   starts immediately after the preceding actor and skips every frozen and
 *   eliminated player (§0).
 * - Exactly one active controller has already won, even while frozen kings of
 *   other players stay on the board; frozen and eliminated players never win
 *   (§7, Fixture 7/7b, 001/D35). This unit never returns a draw.
 * - The zero-active state is unreachable through sequential valid play, so it is
 *   rejected atomically instead of fabricating a draw or a winner (§7,
 *   Fixture 7b, 001/D35).
 * - Malformed runtime input fails closed: an unknown preceding player or an
 *   invalid status value throws before any decision is returned.
 *
 * Out of scope here (withheld by 001/D27/001/D38–001/D41): the assembled commit path,
 * turn application, history, general draw/win resolution beyond the last-active
 * winner and the `[open]` checked-non-actor edge.
 *
 * There is no mutable module state.
 */
import { ARMY_COLORS, type ArmyColor } from "./board.ts";
import type { PlayerStatus } from "./position.ts";

/** The selector's discriminated result: the next active controller or the winner. */
export type TurnSelection =
  | { readonly kind: "next"; readonly player: ArmyColor }
  | { readonly kind: "winner"; readonly winner: ArmyColor };

const PLAYER_STATUSES: readonly PlayerStatus[] = [
  "active",
  "frozen",
  "eliminated",
];

function isPlayerStatus(value: unknown): value is PlayerStatus {
  return PLAYER_STATUSES.includes(value as PlayerStatus);
}

/** Reject a status map with a missing or unknown lifecycle value. */
function validatePlayers(
  players: Readonly<Record<ArmyColor, PlayerStatus>>,
): void {
  for (const player of ARMY_COLORS) {
    if (!isPlayerStatus(players[player])) {
      throw new Error(`selectTurn: player ${player} has no valid status`);
    }
  }
}

/**
 * The next active controller clockwise from `preceding`, or the only active
 * controller as the winner (001/D35).
 *
 * `preceding` is the actor the turn advances from; it need not itself be active,
 * because a player can leave the game frozen on its own turn and its seat still
 * anchors the clockwise scan. Frozen and eliminated players are skipped. The
 * returned `kind` is `"winner"` exactly when one active controller remains, and
 * the zero-active state throws instead of returning a fabricated result.
 */
export function selectTurn(
  players: Readonly<Record<ArmyColor, PlayerStatus>>,
  preceding: ArmyColor,
): TurnSelection {
  validatePlayers(players);
  const start = ARMY_COLORS.indexOf(preceding);
  if (start === -1) {
    throw new Error(
      `selectTurn: unknown preceding player ${String(preceding)}`,
    );
  }
  // Clockwise order starting just after the preceding actor.
  const order = [
    ...ARMY_COLORS.slice(start + 1),
    ...ARMY_COLORS.slice(0, start + 1),
  ];
  let firstActive: ArmyColor | undefined;
  for (const player of order) {
    if (players[player] !== "active") {
      continue;
    }
    if (firstActive === undefined) {
      firstActive = player;
      continue;
    }
    // A second active controller exists, so the turn advances to the first.
    return { kind: "next", player: firstActive };
  }
  if (firstActive === undefined) {
    throw new Error(
      "selectTurn: no active controller remains; the zero-active state is rejected (001/D35)",
    );
  }
  return { kind: "winner", winner: firstActive };
}
