/**
 * Fixture 4c of `docs/rules/multiplayer-adjudication.md` (reviewed seam) as an
 * executable test: the 001/D32 **snapshot** reading of the §4 mate batch versus the
 * wrong per-removal re-evaluation, plus the adapter-misuse guards of
 * {@link adjudicateBatch}.
 *
 * Scope and provenance:
 *
 * - The snapshot type, the tabulated `attacksOf` stub, the synthetic
 *   `isMatedByTestOracle` and `mateCandidates` oracle, `removeKing` and the
 *   reference `applyBatch` all live **in this test file**. They are the
 *   fixture's test-side synthetic oracle, fully tabulated (no geometry, no
 *   computation), and are deliberately **not** production mate detection:
 *   production mate detection is `src/mate.ts`, and the production evaluator
 *   must never reuse this oracle (spec 001/D32/001/D38).
 * - {@link adjudicateBatch} is the production driver under test. It is
 *   snapshot-agnostic: the oracle and the atomic batch arrive as callbacks.
 * - The batch/transfer semantics this fixture exercises are 001/D30/001/D32 as
 *   corrected by 001/D33, with the 001/D36/001/D37 transfer unit. The assembled commit
 *   path, 001/D38's post-batch safety filter, turn advancement, history, draw/win
 *   and the `[blocked]` checked-non-actor edge are out of scope and stay
 *   unresolved (spec 001/D38/001/D27).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ARMY_COLORS, type ArmyColor } from "./board.ts";
import {
  adjudicateBatch,
  type AwardEvent,
  type KingSnapshot,
} from "./batchAdjudication.ts";

/** One abstract king of the fixture seam. */
interface FixtureKing {
  readonly id: string;
  readonly army: ArmyColor;
  readonly controller: ArmyColor;
  readonly square: string;
  readonly escapeCandidates: readonly string[];
}

/** One abstract non-king piece of the fixture seam. */
interface FixturePiece {
  readonly id: string;
  readonly army: ArmyColor;
  readonly controller: ArmyColor;
  readonly square: string;
}

/** One abstract attack record: controller `by` attacks `square` from `source`. */
interface FixtureAttack {
  readonly square: string;
  readonly by: ArmyColor;
  readonly source: string;
}

/** A fixture snapshot: kings, pieces and the attacks the oracle reads. */
interface FixtureSnapshot extends KingSnapshot {
  readonly kings: readonly FixtureKing[];
  readonly pieces: readonly FixturePiece[];
  readonly attacks: readonly FixtureAttack[];
}

function king(
  id: string,
  army: ArmyColor,
  square: string,
  escapeCandidates: readonly string[],
): FixtureKing {
  return { id, army, controller: army, square, escapeCandidates };
}

function piece(id: string, army: ArmyColor, square: string): FixturePiece {
  return { id, army, controller: army, square };
}

function attack(square: string, by: ArmyColor, source: string): FixtureAttack {
  return { square, by, source };
}

// Exact inputs of Fixture 4c, S0. The fixture's abstract tokens are the square
// and id strings themselves; no board geometry is implied.
const WHITE_KING = king("white/king", "white", "qW", []);
const RED_KING = king("red/king", "red", "qR", ["eR1", "eR2"]);
const BLACK_KING = king("black/king", "black", "qB", ["eB1", "eB2"]);
const GREEN_KING = king("green/king", "green", "qG", ["eG1", "eG2"]);
const WHITE_ROOK = piece("white/rook", "white", "pWr");
const RED_ROOK = piece("red/rook", "red", "pRr");
const BLACK_KNIGHT = piece("black/knight", "black", "pBk");
const GREEN_BISHOP = piece("green/bishop", "green", "pGb");

const S0_ATTACKS: readonly FixtureAttack[] = [
  attack("eR1", "white", "white/rook"),
  attack("eR2", "white", "white/rook"),
  attack("eB2", "red", "red/king"),
  attack("qB", "white", "white/rook"),
  attack("eG1", "white", "white/rook"),
  attack("eG2", "white", "white/rook"),
];
const S1_ATTACKS: readonly FixtureAttack[] = [
  ...S0_ATTACKS,
  attack("qR", "white", "white/rook"),
  attack("eB1", "white", "white/rook"),
];
const S1R_ATTACKS: readonly FixtureAttack[] = S1_ATTACKS.filter(
  (entry) => !(entry.square === "eB2" && entry.by === "red"),
);
const S2_ATTACKS: readonly FixtureAttack[] = [
  ...S1R_ATTACKS,
  attack("qG", "white", "white/rook"),
];

const S2_PIECES: readonly FixturePiece[] = [
  WHITE_ROOK,
  { ...RED_ROOK, controller: "white" },
  { ...BLACK_KNIGHT, controller: "white" },
  GREEN_BISHOP,
];
const S3_PIECES: readonly FixturePiece[] = [
  WHITE_ROOK,
  { ...RED_ROOK, controller: "white" },
  { ...BLACK_KNIGHT, controller: "white" },
  { ...GREEN_BISHOP, controller: "white" },
];

const S0: FixtureSnapshot = {
  kings: [WHITE_KING, RED_KING, BLACK_KING, GREEN_KING],
  pieces: [WHITE_ROOK, RED_ROOK, BLACK_KNIGHT, GREEN_BISHOP],
  attacks: S0_ATTACKS,
};
const S1: FixtureSnapshot = { ...S0, attacks: S1_ATTACKS };
const S2: FixtureSnapshot = {
  kings: [WHITE_KING, GREEN_KING],
  pieces: S2_PIECES,
  attacks: S2_ATTACKS,
};
const S3: FixtureSnapshot = {
  kings: [WHITE_KING],
  pieces: S3_PIECES,
  attacks: S2_ATTACKS,
};

// A second, independent abstract state: three kings under one controller
// (001/D31/001/D33), all mated in one snapshot. It exercises the canonical id
// tie-break and per-king deduplication. Fully tabulated as well.
const ASSIMILATED_KINGS: readonly FixtureKing[] = [
  {
    id: "green/king",
    army: "green",
    controller: "white",
    square: "qG",
    escapeCandidates: [],
  },
  {
    id: "white/king",
    army: "white",
    controller: "white",
    square: "qW",
    escapeCandidates: [],
  },
  {
    id: "red/king",
    army: "red",
    controller: "white",
    square: "qR",
    escapeCandidates: [],
  },
];
const MULTI_BLACK_KING = king("black/king", "black", "qB", []);
const MULTI_BLACK_ROOK = piece("black/rook", "black", "pBk");
const MULTI_GREEN_ROOK: FixturePiece = {
  id: "green/rook",
  army: "green",
  controller: "white",
  square: "pGb",
};
const MULTI_ATTACKS: readonly FixtureAttack[] = [
  attack("qG", "black", "black/rook"),
  attack("qW", "black", "black/rook"),
  attack("qR", "black", "black/rook"),
];
const MULTI: FixtureSnapshot = {
  kings: [...ASSIMILATED_KINGS, MULTI_BLACK_KING],
  pieces: [MULTI_BLACK_ROOK, MULTI_GREEN_ROOK],
  attacks: MULTI_ATTACKS,
};

/** The tabulated `attacksOf` stub: keyed by the exact king/piece state. */
const ATTACK_TABLE: ReadonlyMap<string, readonly FixtureAttack[]> = new Map([
  [snapshotKey(S1.kings, S1.pieces), S1_ATTACKS],
  [snapshotKey([WHITE_KING, BLACK_KING, GREEN_KING], S1.pieces), S1R_ATTACKS],
  [snapshotKey(S2.kings, S2.pieces), S2_ATTACKS],
  [snapshotKey(S3.kings, S3.pieces), S2_ATTACKS],
  [
    snapshotKey(
      [MULTI_BLACK_KING],
      [MULTI_BLACK_ROOK, { ...MULTI_GREEN_ROOK, controller: "black" }],
    ),
    [],
  ],
]);

function snapshotKey(
  kings: readonly FixtureKing[],
  pieces: readonly FixturePiece[],
): string {
  const kingIds = kings.map((entry) => entry.id).join(",");
  const pieceIds = pieces
    .map((entry) => `${entry.id}@${entry.controller}`)
    .join(",");
  return `${kingIds}|${pieceIds}`;
}

/**
 * The injected, fully tabulated geometry stub. It only looks up states the
 * fixture enumerates and throws on anything else, so it never approximates
 * geometry or mate detection.
 */
function attacksOf(
  kings: readonly FixtureKing[],
  pieces: readonly FixturePiece[],
): readonly FixtureAttack[] {
  const attacks = ATTACK_TABLE.get(snapshotKey(kings, pieces));
  if (attacks === undefined) {
    throw new Error(
      `attacksOf: untabulated state ${snapshotKey(kings, pieces)}`,
    );
  }
  return attacks;
}

function inCheck(entry: FixtureKing, snapshot: FixtureSnapshot): boolean {
  return snapshot.attacks.some(
    (record) =>
      record.square === entry.square && record.by !== entry.controller,
  );
}

/** The fixture's synthetic oracle, valid only for the tabulated states. */
function isMatedByTestOracle(
  entry: FixtureKing,
  snapshot: FixtureSnapshot,
): boolean {
  return (
    inCheck(entry, snapshot) &&
    entry.escapeCandidates.every((escape) =>
      snapshot.attacks.some(
        (record) => record.square === escape && record.by !== entry.controller,
      ),
    )
  );
}

/** Mate candidate king ids, canonical controller order then id (001/D30/001/D31). */
function mateCandidates(snapshot: FixtureSnapshot): string[] {
  return snapshot.kings
    .filter((entry) => isMatedByTestOracle(entry, snapshot))
    .sort(
      (a, b) =>
        ARMY_COLORS.indexOf(a.controller) - ARMY_COLORS.indexOf(b.controller) ||
        (a.id < b.id ? -1 : 1),
    )
    .map((entry) => entry.id);
}

/** The fixture's single-removal probe, the wrong per-removal reading. */
function removeKing(snapshot: FixtureSnapshot, id: string): FixtureSnapshot {
  const kings = snapshot.kings.filter((entry) => entry.id !== id);
  return {
    kings,
    pieces: snapshot.pieces,
    attacks: attacksOf(kings, snapshot.pieces),
  };
}

/**
 * The reference atomic batch over the fixture state: delete every candidate
 * king first, then decide transfers from that full post-batch snapshot
 * (001/D32/001/D36/001/D37). An absent candidate leaves the snapshot unchanged with no
 * events, as the fixture specifies.
 */
function applyBatch(
  snapshot: FixtureSnapshot,
  kingIds: readonly string[],
  actor: ArmyColor,
): FixtureSnapshot {
  const removed = snapshot.kings.filter((entry) => kingIds.includes(entry.id));
  if (removed.length !== kingIds.length) {
    return snapshot;
  }
  const kings = snapshot.kings.filter((entry) => !kingIds.includes(entry.id));
  const matedControllers = new Set(removed.map((entry) => entry.controller));
  const survivingControllers = new Set(kings.map((entry) => entry.controller));
  const pieces = snapshot.pieces.map((entry) => {
    if (!matedControllers.has(entry.controller)) {
      return entry;
    }
    if (survivingControllers.has(entry.controller)) {
      const matedArmies = new Set(
        removed
          .filter((kingEntry) => kingEntry.controller === entry.controller)
          .map((kingEntry) => kingEntry.army),
      );
      return matedArmies.has(entry.army)
        ? { ...entry, controller: actor }
        : entry;
    }
    return { ...entry, controller: actor };
  });
  return { kings, pieces, attacks: attacksOf(kings, pieces) };
}

function eventOf(kingId: string, army: ArmyColor): AwardEvent {
  return { kingId, army, to: "white" };
}

test("Fixture 4c (1): S0 has no mate candidate", () => {
  assert.deepEqual(mateCandidates(S0), []);
});

test("Fixture 4c (2): S1 snapshot mates Red and Black in canonical order", () => {
  assert.deepEqual(mateCandidates(S1), ["red/king", "black/king"]);
});

test("Fixture 4c (3): the per-removal probe drops Black", () => {
  const afterRedRemoved = removeKing(S1, "red/king");
  assert.equal(isMatedByTestOracle(BLACK_KING, afterRedRemoved), false);
  assert.deepEqual(mateCandidates(afterRedRemoved), []);
});

test("Fixture 4c (4): one atomic batch awards Red then Black", () => {
  const next = applyBatch(S1, ["red/king", "black/king"], "white");
  assert.deepEqual(
    next.kings.map((entry) => entry.id),
    ["white/king", "green/king"],
  );
  assert.deepEqual(next.pieces, S2_PIECES);
  const result = adjudicateBatch(S1, "white", mateCandidates, applyBatch);
  assert.deepEqual(result.events.slice(0, 2), [
    eventOf("red/king", "red"),
    eventOf("black/king", "black"),
  ]);
});

test("Fixture 4c (5): assimilation re-points only the mated armies", () => {
  const next = applyBatch(S1, ["red/king", "black/king"], "white");
  const byId = new Map(next.pieces.map((entry) => [entry.id, entry]));
  assert.deepEqual(byId.get("red/rook"), {
    ...RED_ROOK,
    controller: "white",
  });
  assert.deepEqual(byId.get("black/knight"), {
    ...BLACK_KNIGHT,
    controller: "white",
  });
  assert.deepEqual(byId.get("white/rook"), WHITE_ROOK);
  assert.deepEqual(byId.get("green/bishop"), GREEN_BISHOP);
});

test("Fixture 4c (6): S2 reveals the Green cascade", () => {
  assert.deepEqual(mateCandidates(S2), ["green/king"]);
});

test("Fixture 4c (7): the driver awards Red, Black then Green and ends on White", () => {
  const result = adjudicateBatch(S1, "white", mateCandidates, applyBatch);
  assert.deepEqual(result.events, [
    eventOf("red/king", "red"),
    eventOf("black/king", "black"),
    eventOf("green/king", "green"),
  ]);
  assert.deepEqual(
    result.snapshot.kings.map((entry) => entry.id),
    ["white/king"],
  );
  assert.deepEqual(result.snapshot.pieces, S3_PIECES);
});

test("Fixture 4c (8): no king id is awarded twice", () => {
  const result = adjudicateBatch(S1, "white", mateCandidates, applyBatch);
  const ids = result.events.map((entry) => entry.kingId);
  assert.deepEqual(ids, [...new Set(ids)]);
});

test("Fixture 4c (9): an absent candidate changes no state", () => {
  assert.equal(applyBatch(S1, ["absent/king"], "white"), S1);
  assert.throws(
    () => adjudicateBatch(S1, "white", () => ["absent/king"], applyBatch),
    /is not a king/,
  );
  assert.deepEqual(S1, {
    kings: [WHITE_KING, RED_KING, BLACK_KING, GREEN_KING],
    pieces: [WHITE_ROOK, RED_ROOK, BLACK_KNIGHT, GREEN_BISHOP],
    attacks: S1_ATTACKS,
  });
});

test("Fixture 4c (10): the driver awards Black even though the per-removal probe drops it", () => {
  const result = adjudicateBatch(S1, "white", mateCandidates, applyBatch);
  assert.ok(
    result.events.some((entry) => entry.kingId === "black/king"),
    "the snapshot reading must award black/king",
  );
  assert.deepEqual(mateCandidates(removeKing(S1, "red/king")), []);
});

test("the driver stops without applying a batch when no king is mated", () => {
  let calls = 0;
  const result = adjudicateBatch(
    S0,
    "white",
    mateCandidates,
    (snapshot, ids, actor) => {
      calls += 1;
      return applyBatch(snapshot, ids, actor);
    },
  );
  assert.deepEqual(result.events, []);
  assert.equal(result.snapshot, S0);
  assert.equal(calls, 0);
});

test("the driver terminates after one batch per distinct king count", () => {
  let calls = 0;
  const result = adjudicateBatch(
    S1,
    "white",
    mateCandidates,
    (snapshot, ids, actor) => {
      calls += 1;
      return applyBatch(snapshot, ids, actor);
    },
  );
  assert.equal(calls, 2, "S1 needs the snapshot batch plus the Green cascade");
  assert.equal(result.snapshot.kings.length, 1);
});

test("two kings under one controller are distinct awards in id order", () => {
  const result = adjudicateBatch(MULTI, "black", mateCandidates, applyBatch);
  assert.deepEqual(
    result.events.map((entry) => entry.kingId),
    ["green/king", "red/king", "white/king"],
  );
  assert.deepEqual(
    result.events.map((entry) => entry.to),
    ["black", "black", "black"],
  );
  assert.deepEqual(
    result.snapshot.kings.map((entry) => entry.id),
    ["black/king"],
  );
  const greenRook = result.snapshot.pieces.find(
    (entry) => entry.id === "green/rook",
  );
  assert.deepEqual(greenRook, { ...MULTI_GREEN_ROOK, controller: "black" });
});

test("the driver canonicalizes the candidate order it is given", () => {
  const reversed = (snapshot: FixtureSnapshot): string[] =>
    [...mateCandidates(snapshot)].reverse();
  const result = adjudicateBatch(MULTI, "black", reversed, applyBatch);
  assert.deepEqual(
    result.events.map((entry) => entry.kingId),
    ["green/king", "red/king", "white/king"],
  );
});

test("adapter misuse: a duplicate king id in the snapshot throws", () => {
  const duplicated: FixtureSnapshot = {
    kings: [WHITE_KING, WHITE_KING],
    pieces: [],
    attacks: [],
  };
  assert.throws(
    () => adjudicateBatch(duplicated, "white", () => [], applyBatch),
    /duplicate king id/,
  );
});

test("adapter misuse: a duplicate candidate throws", () => {
  assert.throws(
    () =>
      adjudicateBatch(
        MULTI,
        "black",
        () => ["white/king", "white/king"],
        applyBatch,
      ),
    /duplicated/,
  );
});

test("adapter misuse: a batch that keeps the mated king throws", () => {
  const kings = [WHITE_KING, MULTI_BLACK_KING, GREEN_KING];
  const three: FixtureSnapshot = {
    kings,
    pieces: [],
    attacks: [],
  };
  assert.throws(
    () =>
      adjudicateBatch(
        three,
        "black",
        () => ["green/king"],
        (snapshot) => ({
          kings: snapshot.kings.filter((entry) => entry.id !== "white/king"),
          pieces: snapshot.pieces,
          attacks: [],
        }),
      ),
    /kept the mated king/,
  );
});

test("adapter misuse: a batch that removes no king throws", () => {
  const two: FixtureSnapshot = {
    kings: [WHITE_KING, MULTI_BLACK_KING],
    pieces: [],
    attacks: [],
  };
  assert.throws(
    () =>
      adjudicateBatch(
        two,
        "black",
        () => ["white/king"],
        (snapshot) => snapshot,
      ),
    /removed no king/,
  );
});

test("adapter misuse: a batch that removes a non-candidate king without an award throws", () => {
  // Only Red is mated, but the adapter also drops Black: the removed Black king
  // has no award. A count-only guard passes this (the king count still
  // decreases and no unknown king appears), so the driver must fail closed
  // instead of emitting a single Red award.
  const four: FixtureSnapshot = {
    kings: [WHITE_KING, RED_KING, BLACK_KING, GREEN_KING],
    pieces: [],
    attacks: [],
  };
  const onlyRed = (snapshot: FixtureSnapshot): readonly string[] =>
    snapshot.kings.some((entry) => entry.id === "red/king") ? ["red/king"] : [];
  assert.throws(
    () =>
      adjudicateBatch(four, "white", onlyRed, (snapshot) => ({
        kings: snapshot.kings.filter(
          (entry) => entry.id !== "red/king" && entry.id !== "black/king",
        ),
        pieces: snapshot.pieces,
        attacks: [],
      })),
    /removed the unawarded king black\/king/,
  );
});

test("adapter misuse: a batch that introduces an unknown king throws", () => {
  const two: FixtureSnapshot = {
    kings: [WHITE_KING, MULTI_BLACK_KING],
    pieces: [],
    attacks: [],
  };
  assert.throws(
    () =>
      adjudicateBatch(
        two,
        "black",
        () => ["white/king"],
        (snapshot) => ({
          kings: [snapshot.kings[1] as FixtureKing, GREEN_KING],
          pieces: [],
          attacks: [],
        }),
      ),
    /introduced unknown king/,
  );
});
