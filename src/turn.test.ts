/**
 * §7 of `docs/rules/multiplayer-adjudication.md` as an executable test: the
 * internal turn-order and last-active-winner selector (spec 001/D35).
 *
 * Scope and provenance:
 *
 * - Turn order is clockwise from White, `white → red → black → green`, and the
 *   cursor skips frozen and eliminated players (§0, 001/D25/001/D35).
 * - Exactly one active controller is already the winner, even while frozen
 *   kings of other players stay on the board; frozen and eliminated players
 *   never win (§7, Fixture 7/7b, 001/D35).
 * - The zero-active state is unreachable through sequential valid play and is
 *   rejected instead of fabricating a draw or a winner (§7, Fixture 7b, 001/D35).
 * - This exercises {@link selectTurn} only. The assembled commit path, turn
 *   application, history, general draw/win resolution and the `[open]`
 *   checked-non-actor edge (001/D27/001/D38–001/D41) are out of scope.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import type { ArmyColor } from "./board.ts";
import type { PlayerStatus } from "./position.ts";
import { selectTurn } from "./turn.ts";

/** A complete status map, defaulting every omitted player to active. */
function statuses(
  overrides: Partial<Record<ArmyColor, PlayerStatus>> = {},
): Record<ArmyColor, PlayerStatus> {
  return {
    white: overrides.white ?? "active",
    red: overrides.red ?? "active",
    black: overrides.black ?? "active",
    green: overrides.green ?? "active",
  };
}

test("the turn advances clockwise White, Red, Black, Green and wraps to White", () => {
  const players = statuses();
  assert.deepEqual(selectTurn(players, "white"), {
    kind: "next",
    player: "red",
  });
  assert.deepEqual(selectTurn(players, "red"), {
    kind: "next",
    player: "black",
  });
  assert.deepEqual(selectTurn(players, "black"), {
    kind: "next",
    player: "green",
  });
  assert.deepEqual(selectTurn(players, "green"), {
    kind: "next",
    player: "white",
  });
});

test("the cursor skips frozen and eliminated players", () => {
  const players = statuses({ red: "frozen", black: "eliminated" });
  // White's successor Red is frozen and Black is eliminated, so Green moves.
  assert.deepEqual(selectTurn(players, "white"), {
    kind: "next",
    player: "green",
  });
  // The scan starts at the preceding actor and skips the non-active ones after it.
  assert.deepEqual(selectTurn(players, "red"), {
    kind: "next",
    player: "green",
  });
  assert.deepEqual(selectTurn(players, "black"), {
    kind: "next",
    player: "green",
  });
  assert.deepEqual(selectTurn(players, "green"), {
    kind: "next",
    player: "white",
  });
});

test("the cursor wraps past the end of the fixed order to the next active player", () => {
  const players = statuses({ white: "frozen" });
  // Green is the last seat; White is frozen, so the wrap lands on Red.
  assert.deepEqual(selectTurn(players, "green"), {
    kind: "next",
    player: "red",
  });
});

test("§7 Fixture 7b: one active controller wins while frozen kings remain on the board", () => {
  // White is the only active controller; Red, Black and Green are frozen, so
  // their kings still sit on the board but the game is already over (001/D35).
  const players = statuses({
    red: "frozen",
    black: "frozen",
    green: "frozen",
  });
  assert.deepEqual(selectTurn(players, "white"), {
    kind: "winner",
    winner: "white",
  });
});

test("§7 Fixture 7: White wins as the last active controller after Red is eliminated", () => {
  // After White plays b10–a10 and mates Red, Red is eliminated and its army
  // transfers to White; Black and Green were already frozen, so exactly one
  // controller (White) is active and the frozen kings do not delay the win
  // (001/D35/001/D37).
  const players = statuses({
    red: "eliminated",
    black: "frozen",
    green: "frozen",
  });
  assert.deepEqual(selectTurn(players, "white"), {
    kind: "winner",
    winner: "white",
  });
});

test("the sole active controller is the winner regardless of the preceding actor", () => {
  const players = statuses({
    white: "frozen",
    red: "eliminated",
    green: "frozen",
  });
  assert.deepEqual(selectTurn(players, "white"), {
    kind: "winner",
    winner: "black",
  });
});

test("§7 Fixture 7b: zero active controllers is rejected, never a fabricated draw", () => {
  const players = statuses({
    white: "frozen",
    red: "frozen",
    black: "frozen",
    green: "eliminated",
  });
  assert.throws(() => selectTurn(players, "white"), /001\/D35/);
});

test("an unknown preceding player fails closed", () => {
  const players = statuses();
  const preceding = "orange" as ArmyColor;
  assert.throws(() => selectTurn(players, preceding), /unknown preceding/);
});

test("an invalid player status fails closed", () => {
  const players = statuses();
  const malformed = {
    ...players,
    green: "retired" as PlayerStatus,
  };
  assert.throws(() => selectTurn(malformed, "white"), /no valid status/);
});
