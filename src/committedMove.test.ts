/**
 * The bounded, guarded internal committed-move seam (spec 001/D38–001/D41 as
 * approved by 001/D44) as executable tests.
 *
 * Scope and provenance:
 *
 * - The seam under test composes the existing internal units —
 *   `applyPositionMove` (./legalMoves.ts), `matedKings` (./mate.ts),
 *   `adjudicateBatch` (./batchAdjudication.ts), `assimilateMatedKings`
 *   (./assimilation.ts) and `selectTurn` (./turn.ts) — into public move
 *   enumeration and an atomic commit. It is **not** the public `Quaternity`
 *   class, history, snapshots or persistence, and it claims no complete engine.
 * - The coordinate fixtures are `docs/rules/multiplayer-adjudication.md`
 *   Fixtures 4a, 4b, 4d and 5a, and the P/Q witness of
 *   `docs/rules/d38-coordinate-search.md` §2. The unchecked sibling R, the
 *   clause-(a) variant Q', the promotion-choice fixture, the `|Tier0| = 0`
 *   successor fixture and the frozen-on-turn fixture are constructed coordinate
 *   positions used only to exercise the approved 001/D28 promotion choices and
 *   the 001/D38–001/D41 clauses; they decide **no** official game outcome.
 * - The open edge's tests are error-only: they assert the named
 *   `UnresolvedAdjudicationError` and atomicity, never a mate, pass, draw,
 *   elimination or award (spec 001/D39–001/D41). The two-player stalemate draw of
 *   Fixture 5b is asserted only as **not** a pass here; its draw outcome belongs
 *   to the deferred outcome API (001/D25).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { type ArmyColor, type Square } from "./board.ts";
import {
  createPosition,
  inCheck,
  type PlacedEntry,
  type PlayerStatus,
  type Position,
} from "./position.ts";
import { applyPositionMove, legalMoves } from "./legalMoves.ts";
import { matedKings } from "./mate.ts";
import { PROMOTION_CHOICES, type PromotionPieceType } from "./pawn.ts";
import {
  commitMove,
  committableMoves,
  pass,
  UnresolvedAdjudicationError,
  type CommittableMove,
} from "./committedMove.ts";

const ALL_ACTIVE: Readonly<Record<ArmyColor, PlayerStatus>> = {
  white: "active",
  red: "active",
  black: "active",
  green: "active",
};
const IDENTITY_CONTROLLERS: Readonly<Record<ArmyColor, ArmyColor>> = {
  white: "white",
  red: "red",
  black: "black",
  green: "green",
};

function position(
  pieces: readonly PlacedEntry[],
  turn: ArmyColor,
  players: Readonly<Record<ArmyColor, PlayerStatus>> = ALL_ACTIVE,
): Position {
  return createPosition({
    pieces,
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...players },
    turn,
  });
}

function king(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "king" };
}
function rook(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "rook" };
}
function knight(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "knight" };
}
function bishop(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "bishop" };
}
function upPawn(square: Square, army: ArmyColor): PlacedEntry {
  return {
    square,
    army,
    type: "pawn",
    state: { kind: "ordinary", direction: "up" },
  };
}

function hasMove(
  moves: readonly { readonly from: Square; readonly to: Square }[],
  from: Square,
  to: Square,
): boolean {
  return moves.some((move) => move.from === from && move.to === to);
}

/** The promotion choices enumerated for one from/to, in enumeration order. */
function listedPromotions(
  moves: readonly CommittableMove[],
  from: Square,
  to: Square,
): (PromotionPieceType | undefined)[] {
  return moves
    .filter((move) => move.from === from && move.to === to)
    .map((move) => move.promotion);
}

/** An ordinary rejection, never `UnresolvedAdjudicationError` (001/D41). */
function isOrdinaryError(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.ok(!(error instanceof UnresolvedAdjudicationError));
  return true;
}

/** The board occupancy key, for comparing two positions by pieces only. */
function occupancyKey(position: Position): string {
  return [...position.board.entries()]
    .map(([square, placed]) => `${square}:${placed.army}:${placed.type}`)
    .sort()
    .join(" ");
}

/** Fixture 4a: one action mates two kings at once (constructed `[fixture]`). */
function fixture4a(): Position {
  return position(
    [
      king("e1", "white"),
      rook("f1", "white"),
      knight("c10", "white"),
      knight("d10", "white"),
      knight("i10", "white"),
      knight("j10", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("g6", "green"),
    ],
    "white",
  );
}

/** Fixture 4b: a cascade where a removal reveals a second mate. */
function fixture4b(): Position {
  return position(
    [
      king("e6", "white"),
      rook("a1", "white"),
      knight("b3", "white"),
      knight("c5", "white"),
      knight("d4", "white"),
      knight("j4", "white"),
      knight("k4", "white"),
      king("b1", "red"),
      king("l1", "black"),
      king("g6", "green"),
    ],
    "white",
  );
}

/** Fixture 4d: an action whose own batch leaves the actor checked (clause (b)). */
function fixture4d(): Position {
  return position(
    [
      king("a1", "white"),
      rook("d4", "white"),
      knight("b2", "white"),
      knight("f3", "white"),
      knight("d3", "white"),
      knight("h2", "white"),
      king("e1", "red"),
      king("l12", "black"),
      rook("h1", "black"),
      knight("b4", "black"),
      king("a12", "green"),
    ],
    "white",
  );
}

/**
 * The P/Q witness of `docs/rules/d38-coordinate-search.md` §2. P is the
 * constructed pre-action position (turn White); Q is the internal constructed
 * successor (turn Red) with Red checked and the singleton Tier0 `a9–i1`.
 */
function witnessP(): Position {
  return position(
    [
      king("h7", "white"),
      rook("a12", "white"),
      rook("l2", "white"),
      knight("c3", "white"),
      knight("c4", "white"),
      knight("d8", "white"),
      king("a1", "red"),
      bishop("a9", "red"),
      knight("b5", "red"),
      king("a6", "black"),
      king("j6", "green"),
    ],
    "white",
  );
}
function witnessQ(): Position {
  return position(
    [
      king("h7", "white"),
      rook("a12", "white"),
      rook("l1", "white"),
      knight("c3", "white"),
      knight("c4", "white"),
      knight("d8", "white"),
      king("a1", "red"),
      bishop("a9", "red"),
      knight("b5", "red"),
      king("a6", "black"),
      king("j6", "green"),
    ],
    "red",
  );
}

/**
 * The clause-(a) variant Q': the witness minus the Red knight `b5`. Red's only
 * Tier0 move `a9–i1` is rejected because the cascade would mate Red's own king
 * (001/D38 clause (a)).
 */
function witnessQClauseA(): Position {
  return position(
    [
      king("h7", "white"),
      rook("a12", "white"),
      rook("l1", "white"),
      knight("c3", "white"),
      knight("c4", "white"),
      knight("d8", "white"),
      king("a1", "red"),
      bishop("a9", "red"),
      king("a6", "black"),
      king("j6", "green"),
    ],
    "red",
  );
}

/**
 * The unchecked sibling R: Red is **unchecked** with 11 internal bishop moves,
 * every one of which is 001/D38-rejected once the bishop leaves file `a` and the
 * Black king's removal exposes Red. Red has internal moves but no public move.
 */
function siblingR(): Position {
  return position(
    [
      king("h7", "white"),
      rook("a12", "white"),
      knight("c3", "white"),
      knight("c4", "white"),
      knight("d8", "white"),
      king("a1", "red"),
      bishop("a9", "red"),
      king("a6", "black"),
      king("j6", "green"),
    ],
    "red",
  );
}

/** P' reaches R by the 001/D38-safe White move `a11–a12` (turn White). */
function siblingPredecessor(): Position {
  return position(
    [
      king("h7", "white"),
      rook("a11", "white"),
      knight("c3", "white"),
      knight("c4", "white"),
      knight("d8", "white"),
      king("a1", "red"),
      bishop("a9", "red"),
      king("a6", "black"),
      king("j6", "green"),
    ],
    "white",
  );
}

/** A position where one action leaves a lone active controller (winner). */
function loneWinner(): Position {
  return position(
    [
      king("e1", "white"),
      rook("f1", "white"),
      knight("c10", "white"),
      knight("d10", "white"),
      king("a12", "red"),
    ],
    "white",
    {
      white: "active",
      red: "active",
      black: "eliminated",
      green: "eliminated",
    },
  );
}

/** A normal check: after the action the next active controller is checked but has a reply. */
function checkedSuccessorWithReply(): Position {
  return position(
    [
      king("e1", "white"),
      rook("f1", "white"),
      knight("c10", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("g6", "green"),
    ],
    "white",
  );
}

/** A mated controller on turn: zero internal moves, so enumeration is empty. */
function matedWhite(): Position {
  return position(
    [
      king("a1", "white"),
      rook("a2", "black"),
      rook("b2", "black"),
      king("l12", "black"),
      king("a12", "red"),
      king("g6", "green"),
    ],
    "white",
  );
}

/** A White advanced-edge pawn with a promoting move `a11–a12`. */
function promotingWhite(): Position {
  return position(
    [
      king("e1", "white"),
      rook("a1", "white"),
      upPawn("a11", "white"),
      king("l12", "black"),
      king("b6", "red"),
      king("g6", "green"),
    ],
    "white",
  );
}

/**
 * A constructed coordinate position where one promoting move's post-batch
 * 001/D38 safety depends on the explicit promotion choice (001/D28). White's pawn
 * `a11–a12` promotes; the Black rook `b12` checks the Red king `b10` down file
 * `b`, and only a **queen** on `a12` also covers Red's remaining escapes
 * (`a9`/`a10`/`a11` by file `a`, `c10` by the `b11` diagonal) on top of the White
 * rook `h9` (rank 9) and bishop `f8` (`c11`). So only the queen promotion mates
 * Red, and Red's removal then opens the rook's file to the White king `b1` (001/D38
 * clause (b)). Rook, bishop and knight leave `a10` (or `c10`) as a Red escape, so
 * they stay 001/D38-safe. Constructed `[fixture]`; it decides no game outcome.
 */
function promotionChoiceFixture(): Position {
  return position(
    [
      king("b1", "white"),
      upPawn("a11", "white"),
      rook("h9", "white"),
      bishop("f8", "white"),
      king("b10", "red"),
      king("l12", "black"),
      rook("b12", "black"),
      king("g2", "green"),
    ],
    "white",
  );
}

/** Fixture 5a: four active players and a White king stalemated at `a1` (§5). */
function fixture5a(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
      rook("b5", "black"),
      rook("c2", "black"),
    ],
    "white",
  );
}

/** Fixture 5b: the same stalemate with Red and Green eliminated (001/D25 draw). */
function twoPlayerStalemate(): Position {
  return position(
    [
      king("a1", "white"),
      king("l12", "black"),
      rook("b5", "black"),
      rook("c2", "black"),
    ],
    "white",
    {
      white: "active",
      red: "eliminated",
      black: "active",
      green: "eliminated",
    },
  );
}

/**
 * A constructed position for §5's `|Tier0(N)| = 0` clause: the White king `l1` is
 * stalemated while the next active controller Red is checked on `a12` (rook `a5`,
 * rook `h12`) with **no** Tier0 move — mated but still on the board. §5 leaves
 * that case to the ordinary 001/D31 mate rules, so the pass advances instead of
 * failing closed, and it resolves no mate itself.
 */
function matedSuccessorPass(): Position {
  return position(
    [
      king("l1", "white"),
      rook("k5", "black"),
      rook("b2", "black"),
      king("a12", "red"),
      rook("a5", "black"),
      rook("h12", "black"),
      knight("c9", "black"),
      king("g1", "black"),
      king("f6", "green"),
    ],
    "white",
  );
}

test("Fixture 4a: one action awards both snapshot mates in canonical order", () => {
  const before = fixture4a();
  const result = commitMove(before, { from: "f1", to: "f12" });
  assert.deepEqual(
    result.awards.map((award) => award.army),
    ["red", "black"],
  );
  assert.deepEqual(
    result.awards.map((award) => award.to),
    ["white", "white"],
  );
  assert.deepEqual(result.selection, { kind: "next", player: "green" });
  assert.equal(result.position.turn, "green");
  assert.deepEqual(
    [...result.position.board.values()]
      .filter((placed) => placed.type === "king")
      .map((placed) => placed.army)
      .sort(),
    ["green", "white"],
  );
  assert.equal(result.move.from, "f1");
  assert.equal(result.move.to, "f12");
});

test("Fixture 4b: a cascade awards the snapshot mate then the revealed mate", () => {
  const before = fixture4b();
  const result = commitMove(before, { from: "c5", to: "d3" });
  assert.deepEqual(
    result.awards.map((award) => award.army),
    ["red", "black"],
  );
  assert.deepEqual(result.selection, { kind: "next", player: "green" });
  assert.deepEqual(
    [...result.position.board.values()]
      .filter((placed) => placed.type === "king")
      .map((placed) => placed.army)
      .sort(),
    ["green", "white"],
  );
});

test("Fixture 4d: an action whose own batch leaves the actor checked is an ordinary illegal move", () => {
  const before = fixture4d();
  assert.throws(
    () => commitMove(before, { from: "d4", to: "e4" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(
        !(error instanceof UnresolvedAdjudicationError),
        "001/D38 actor-safety rejection is never UnresolvedAdjudicationError (001/D41)",
      );
      return true;
    },
  );
  // Atomic: the input position is unchanged, and the move is not public.
  assert.equal(before.turn, "white");
  assert.ok(hasMove(legalMoves(before, "white"), "d4", "e4"));
  assert.ok(!hasMove(committableMoves(before), "d4", "e4"));
});

test("P/Q: a 001/D38-safe candidate whose checked successor is unresolved is rejected atomically", () => {
  const before = witnessP();
  const boardBefore = occupancyKey(before);
  assert.throws(
    () => commitMove(before, { from: "l2", to: "l1" }),
    UnresolvedAdjudicationError,
  );
  // Atomic: the input position is unchanged.
  assert.equal(occupancyKey(before), boardBefore);
  assert.equal(before.turn, "white");
  // The move is internal (Tier0-legal) but never advertised as public.
  assert.ok(hasMove(legalMoves(before, "white"), "l2", "l1"));
  assert.ok(!hasMove(committableMoves(before), "l2", "l1"));
});

test("Q: the checked on-turn unresolved state fails closed", () => {
  const q = witnessQ();
  assert.equal(inCheck(q, "red"), true);
  assert.deepEqual(matedKings(q), []);
  assert.deepEqual(
    legalMoves(q, "red").map((move) => `${move.from}-${move.to}`),
    ["a9-i1"],
  );
  assert.throws(() => committableMoves(q), UnresolvedAdjudicationError);
});

test("Q clause (a): a candidate whose cascade would remove the actor's own king is an ordinary illegal move", () => {
  const q = witnessQClauseA();
  assert.throws(
    () => commitMove(q, { from: "a9", to: "i1" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!(error instanceof UnresolvedAdjudicationError));
      return true;
    },
  );
});

test("R: an unchecked controller with internal moves but no public move fails closed on its own turn", () => {
  const r = siblingR();
  assert.equal(inCheck(r, "red"), false);
  assert.equal(legalMoves(r, "red").length, 11);
  assert.throws(() => committableMoves(r), UnresolvedAdjudicationError);
});

test("P' to R: an unchecked successor does not veto the predecessor", () => {
  const before = siblingPredecessor();
  const result = commitMove(before, { from: "a11", to: "a12" });
  assert.deepEqual(result.selection, { kind: "next", player: "red" });
  assert.equal(result.position.turn, "red");
  // The successor is exactly R's occupancy, still Red to move and unchecked.
  assert.equal(occupancyKey(result.position), occupancyKey(siblingR()));
  assert.equal(inCheck(result.position, "red"), false);
});

test("a checked successor with a public reply does not veto the predecessor", () => {
  const before = checkedSuccessorWithReply();
  const result = commitMove(before, { from: "f1", to: "f12" });
  assert.deepEqual(result.selection, { kind: "next", player: "red" });
  assert.equal(inCheck(result.position, "red"), true);
  assert.deepEqual(result.awards, []);
});

test("a move that leaves a lone active controller reports a winner", () => {
  const result = commitMove(loneWinner(), { from: "f1", to: "f12" });
  assert.deepEqual(result.selection, { kind: "winner", winner: "white" });
  assert.deepEqual(
    result.awards.map((award) => award.army),
    ["red"],
  );
});

test("a move outside the internal set is an ordinary illegal move", () => {
  const before = witnessP();
  assert.throws(() => commitMove(before, { from: "a1", to: "a2" }), Error);
});

test("committableMoves is empty when the actor has no internal move", () => {
  const mated = matedWhite();
  assert.equal(legalMoves(mated, "white").length, 0);
  assert.deepEqual(committableMoves(mated), []);
});

test("a promoting internal move enumerates every permitted choice", () => {
  const before = promotingWhite();
  assert.ok(hasMove(legalMoves(before, "white"), "a11", "a12"));
  assert.deepEqual(listedPromotions(committableMoves(before), "a11", "a12"), [
    ...PROMOTION_CHOICES,
  ]);
});

test("a promoting move's post-batch 001/D38 safety depends on the promotion choice", () => {
  const before = promotionChoiceFixture();
  // Only the queen mates Red; Red's removal then exposes the White king.
  assert.deepEqual(
    matedKings(
      applyPositionMove(before, { from: "a11", to: "a12", promotion: "queen" }),
    ),
    ["red"],
  );
  assert.deepEqual(
    matedKings(
      applyPositionMove(before, {
        from: "a11",
        to: "a12",
        promotion: "knight",
      }),
    ),
    [],
  );
  const listed = listedPromotions(committableMoves(before), "a11", "a12");
  assert.deepEqual(listed, ["rook", "bishop", "knight"]);
  for (const promotion of PROMOTION_CHOICES) {
    const commit = () =>
      commitMove(before, { from: "a11", to: "a12", promotion });
    if (listed.includes(promotion)) {
      const result = commit();
      assert.equal(result.move.promotes, true);
      assert.deepEqual(result.selection, { kind: "next", player: "red" });
    } else {
      // The advertised verdict and the commit verdict agree for every choice.
      assert.throws(commit, isOrdinaryError);
    }
  }
});

test("a promoting capture enumerates every choice when all of them survive", () => {
  const before = promotionChoiceFixture();
  assert.deepEqual(listedPromotions(committableMoves(before), "a11", "b12"), [
    ...PROMOTION_CHOICES,
  ]);
});

test("Fixture 5a: an active, un-checked, stalemated player with four active players passes", () => {
  const before = fixture5a();
  const boardBefore = occupancyKey(before);
  assert.deepEqual(legalMoves(before, "white"), []);
  assert.equal(inCheck(before, "white"), false);
  const result = pass(before);
  assert.deepEqual(result.selection, { kind: "next", player: "red" });
  assert.equal(result.position.turn, "red");
  // No phantom batch: board, pawn state and statuses are unchanged.
  assert.equal(occupancyKey(result.position), boardBefore);
  assert.deepEqual(result.position.players, before.players);
  assert.equal(before.turn, "white");
});

test("Fixture 5b: a two-player stalemate is a draw for the outcome API, never a pass", () => {
  const before = twoPlayerStalemate();
  assert.deepEqual(legalMoves(before, "white"), []);
  assert.equal(inCheck(before, "white"), false);
  assert.throws(() => pass(before), isOrdinaryError);
  assert.equal(before.turn, "white");
});

test("pass fails closed on the on-turn nonempty-internal/empty-public state (001/D40)", () => {
  assert.throws(() => pass(siblingR()), UnresolvedAdjudicationError);
  assert.throws(() => pass(witnessQ()), UnresolvedAdjudicationError);
});

test("pass is an ordinary rejection for a player that has a legal move", () => {
  assert.throws(() => pass(promotionChoiceFixture()), isOrdinaryError);
});

test("pass is an ordinary rejection for a checked player with no legal move (checkmate)", () => {
  const mated = matedWhite();
  assert.equal(inCheck(mated, "white"), true);
  assert.throws(() => pass(mated), isOrdinaryError);
});

test("a non-active turn is rejected by createPosition, so pass needs no activity branch", () => {
  // `createPosition` rejects a non-active turn, so the frozen-on-turn case is
  // unreachable through a validated Position and needs no branch in `pass`.
  assert.throws(
    () =>
      position(
        [
          king("a1", "white"),
          king("a12", "red"),
          king("l12", "black"),
          king("l1", "green"),
        ],
        "white",
        {
          white: "frozen",
          red: "active",
          black: "active",
          green: "active",
        },
      ),
    Error,
  );
});

test("pass does not veto a checked successor with no Tier0 move (§5 |Tier0| = 0)", () => {
  const before = matedSuccessorPass();
  assert.deepEqual(legalMoves(before, "white"), []);
  assert.equal(inCheck(before, "white"), false);
  assert.equal(inCheck(before, "red"), true);
  assert.deepEqual(legalMoves(before, "red"), []);
  const result = pass(before);
  assert.deepEqual(result.selection, { kind: "next", player: "red" });
  // No phantom batch: the mated Red king is still on the board after the pass.
  assert.ok(
    [...result.position.board.values()].some(
      (placed) => placed.type === "king" && placed.army === "red",
    ),
  );
});

test("enumeration, commits and passes are rejected once a lone active controller has won (001/D35)", () => {
  const over = commitMove(loneWinner(), { from: "f1", to: "f12" }).position;
  assert.equal(over.turn, "white");
  assert.throws(() => committableMoves(over), isOrdinaryError);
  assert.throws(
    () => commitMove(over, { from: "e1", to: "e2" }),
    isOrdinaryError,
  );
  assert.throws(() => pass(over), isOrdinaryError);
});
