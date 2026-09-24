/**
 * Pure, snapshot-agnostic driver for the deterministic §4 mate batch (001/D30/001/D32).
 *
 * This is the Phase 3D1 internal seam of the multiplayer adjudication slice.
 * It is deliberately narrow and is **not** a committed action, a public move
 * endpoint or a rules-complete engine:
 *
 * - {@link adjudicateBatch} repeats one fixed-point step: ask the caller's
 *   `mateCandidates` for the mated kings of the **current** snapshot, hand the
 *   **entire** candidate list to the caller's single atomic `applyBatch`, emit
 *   one award per removed king in canonical order, then re-evaluate the result
 *   until a snapshot reports no mate (001/D30/001/D32).
 * - Snapshot semantics (001/D32): candidates are taken from one snapshot and passed
 *   together, so removing one mated king can never revoke another snapshot
 *   mate; only the next iteration may add a cascade mate.
 * - Canonical order: candidates are ordered by controller
 *   `white → red → black → green`, ties broken by king `id` (001/D30/001/D31) — never
 *   board, hash or enumeration order. Two kings under one controller are two
 *   distinct awards.
 * - The driver never judges mate and never reads geometry. `mateCandidates`
 *   and `applyBatch` are injected; production mate detection is
 *   `src/mate.ts`, and the Fixture 4c synthetic oracle lives only in tests
 *   (001/D32/001/D38).
 * - Adapter misuse fails closed instead of looping or double-awarding: a
 *   duplicate king id, an unknown or duplicated candidate, a batch that keeps a
 *   mated king, removes no king, introduces an unknown king or removes a
 *   non-candidate king without an award all throw. The post-batch king identity
 *   set must be exactly the pre-batch ids minus the candidate ids, so a removed
 *   king record cannot reappear and termination follows from the strictly
 *   decreasing distinct king count with no awarded-set filter.
 *
 * Out of scope here (withheld by 001/D38/001/D27): the assembled commit path, 001/D38's
 * post-batch safety filter, turn advancement, history, draw/win resolution and
 * the `[blocked]` checked-non-actor edge.
 *
 * There is no mutable module state.
 */
import { ARMY_COLORS, type ArmyColor } from "./board.ts";

/** The king fields the driver needs: stable identity plus scope and order. */
export interface SnapshotKing {
  /** Stable per-king identity; never a player. */
  readonly id: string;
  /** Immutable army colour the king was created with. */
  readonly army: ArmyColor;
  /** Player that currently controls the king (its "player" per 001/D33). */
  readonly controller: ArmyColor;
}

/** The minimum snapshot shape the driver can count and order kings in. */
export interface KingSnapshot {
  readonly kings: readonly SnapshotKing[];
}

/** One mate award: the removed king's identity and army, credited to the actor. */
export interface AwardEvent {
  readonly kingId: string;
  readonly army: ArmyColor;
  readonly to: ArmyColor;
}

/** The driver's result: the final snapshot and every award in canonical order. */
export interface BatchAdjudication<S extends KingSnapshot> {
  readonly snapshot: S;
  readonly events: readonly AwardEvent[];
}

/** Canonical player order index (white, red, black, green). */
function playerOrder(player: ArmyColor): number {
  return ARMY_COLORS.indexOf(player);
}

/** Deterministic string order, branch-free so every path is exercised. */
function compareIds(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

/** Kings by id, rejecting a snapshot that gives one id to two kings. */
function kingsById(snapshot: KingSnapshot): Map<string, SnapshotKing> {
  const byId = new Map<string, SnapshotKing>();
  for (const king of snapshot.kings) {
    if (byId.has(king.id)) {
      throw new Error(
        `adjudicateBatch: snapshot has duplicate king id ${king.id}`,
      );
    }
    byId.set(king.id, king);
  }
  return byId;
}

/**
 * Resolve candidate ids against the snapshot and order them canonically. A
 * duplicated or unknown candidate is adapter misuse and throws.
 */
function canonicalCandidates(
  candidates: readonly string[],
  kings: ReadonlyMap<string, SnapshotKing>,
): SnapshotKing[] {
  const seen = new Set<string>();
  const resolved: SnapshotKing[] = [];
  for (const id of candidates) {
    if (seen.has(id)) {
      throw new Error(`adjudicateBatch: mate candidate ${id} is duplicated`);
    }
    seen.add(id);
    const king = kings.get(id);
    if (king === undefined) {
      throw new Error(
        `adjudicateBatch: mate candidate ${id} is not a king in the snapshot`,
      );
    }
    resolved.push(king);
  }
  return resolved.sort(
    (a, b) =>
      playerOrder(a.controller) - playerOrder(b.controller) ||
      compareIds(a.id, b.id),
  );
}

/**
 * Run the §4 mate fixed point over `initial`, crediting every award to `actor`.
 *
 * `mateCandidates(snapshot)` returns the ids of the snapshot's mated kings and
 * `applyBatch(snapshot, kingIds, actor)` returns the next snapshot after the
 * whole batch is applied atomically. One `applyBatch` call happens per
 * iteration, with the entire candidate list. Returns the final snapshot and the
 * award log; throws on adapter misuse (see the module note).
 */
export function adjudicateBatch<S extends KingSnapshot>(
  initial: S,
  actor: ArmyColor,
  mateCandidates: (snapshot: S) => readonly string[],
  applyBatch: (snapshot: S, kingIds: readonly string[], actor: ArmyColor) => S,
): BatchAdjudication<S> {
  let snapshot = initial;
  const events: AwardEvent[] = [];
  for (;;) {
    const kings = kingsById(snapshot);
    const candidates = canonicalCandidates(mateCandidates(snapshot), kings);
    if (candidates.length === 0) {
      return { snapshot, events };
    }
    const next = applyBatch(
      snapshot,
      candidates.map((king) => king.id),
      actor,
    );
    const nextKings = kingsById(next);
    for (const id of nextKings.keys()) {
      if (!kings.has(id)) {
        throw new Error(
          `adjudicateBatch: applyBatch introduced unknown king ${id}`,
        );
      }
    }
    if (nextKings.size >= kings.size) {
      throw new Error(
        `adjudicateBatch: applyBatch removed no king from ${kings.size} on the board`,
      );
    }
    for (const king of candidates) {
      if (nextKings.has(king.id)) {
        throw new Error(
          `adjudicateBatch: applyBatch kept the mated king ${king.id} on the board`,
        );
      }
      events.push({ kingId: king.id, army: king.army, to: actor });
    }
    const candidateIds = new Set(candidates.map((king) => king.id));
    for (const id of kings.keys()) {
      if (!nextKings.has(id) && !candidateIds.has(id)) {
        throw new Error(
          `adjudicateBatch: applyBatch removed the unawarded king ${id}; a batch may only remove its candidate kings`,
        );
      }
    }
    snapshot = next;
  }
}
