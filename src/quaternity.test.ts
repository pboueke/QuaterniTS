/**
 * The bounded public `Quaternity` class and its `src/index.ts` entry point
 * (spec 001/D38–001/D41 as approved by 001/D44) as executable tests.
 *
 * Scope and provenance:
 *
 * - The class is a bounded façade over the pure, guarded internal seam
 *   (`./committedMove.ts`): `moves()` is the seam's public committable set,
 *   `move()`/`pass()` are the seam's atomic commit and board-less pass, and the
 *   only game results the class reports are the two the rules authorize — the
 *   lone active controller's win (001/D35, §7 Fixture 7) and the
 *   two-active-player stalemate draw (001/D25, §5 Fixture 5b).
 * - Every `[open]`-edge case is error-only: the tests assert the named
 *   `UnresolvedAdjudicationError` and atomicity, never a mate, pass, draw,
 *   elimination or award (001/D39–001/D41). The official game rule for that
 *   edge stays `[open]`.
 * - The coordinate fixtures are `docs/rules/multiplayer-adjudication.md` §4
 *   Fixture 4d, §5 Fixtures 5a/5b and §7 Fixture 7, the P/Q witness of
 *   `docs/rules/d38-coordinate-search.md` §2 and the P4/Ps/Pl/Pt bases of
 *   `docs/rules/administrative-actions.md` §1–§2. `promotionChoiceFixture`,
 *   `promotingWhite`, `loneActive`, `siblingR` and
 *   `checkedSuccessorBoard` are constructed coordinate positions used only to
 *   exercise the approved 001/D28 promotion choices, the 001/D35 terminal read
 *   and the 001/D41 own-turn scope; they decide **no** official game outcome.
 * - The public attack/check queries (`attackers`, `isAttacked`, `inCheck`) are
 *   sourced from `docs/rules/multiplayer-adjudication.md` §0 (an attack query
 *   is by attacker **controller** and its records keep the attacking army's
 *   colour), §1 (every king of a controller is evaluated, 001/D31/001/D33) and
 *   §3 Fixtures 3a/3d (frozen pieces exert no attacks but still block sliding
 *   rays, 001/D26/001/D34). They decide no game outcome.
 * - The administrative actions — `proposeDraw`/`respondToDraw` and the three
 *   freeze actions `resign`/`recordTimeLoss`/`recordWalkover` — are sourced from
 *   `docs/rules/multiplayer-adjudication.md` §6 Fixture 6 and §7 Fixture 7b and
 *   from the owner-approved policy table `docs/rules/administrative-actions.md`
 *   §1–§2 (spec 001/D45): offer expiry folded into one move/pass/freeze event,
 *   stale votes, freeze-any-active-target, on-turn/off-turn turn sequencing and
 *   the lone-active award. They decide no other game outcome.
 * - An already-unresolved position (001/D40(3)) is rejected **at load** by the
 *   constructor; an unresolved state *reached* through play still fails closed
 *   on every query, so no outcome is invented either way (001/D41).
 * - Deliberately absent here (documented gaps, not claims): versioned JSON
 *   snapshots/replay (001/D10), an export map beyond Node, and the packaged
 *   browser consumer/schema gates (Phase 4). The class is not a complete engine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  Quaternity,
  UnresolvedAdjudicationError,
  createPosition,
  type Attacker,
  type CommittableMove,
  type HistoryEvent,
  type PlacedEntry,
  type PositionInput,
  type PositionMoveInput,
  type SnapshotAction,
} from "./index.ts";
import { ARMY_COLORS, type ArmyColor, type Square } from "./board.ts";
import {
  defaultPosition,
  inCheck,
  type PlacedPiece,
  type PlayerStatus,
  type Position,
} from "./position.ts";
import { legalMoves } from "./legalMoves.ts";
import { committableMoves } from "./committedMove.ts";
import type { TurnSelection } from "./turn.ts";
import { PROMOTION_CHOICES, type PromotionPieceType } from "./pawn.ts";

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
/** An ordinary pawn facing down the board, for the frozen-obstacle fixtures. */
function downPawn(square: Square, army: ArmyColor): PlacedEntry {
  return {
    square,
    army,
    type: "pawn",
    state: { kind: "ordinary", direction: "down" },
  };
}

/** Board occupancy with pawn state, for comparing two positions by pieces only. */
function boardKey(current: Position): string {
  return [...current.board.entries()]
    .map(([square, placed]) => `${square}:${JSON.stringify(placed)}`)
    .sort()
    .join(" ");
}

/** The whole state a caller can read, for equality checks across a call. */
function stateKey(current: Position): string {
  return [
    boardKey(current),
    `turn=${current.turn}`,
    ARMY_COLORS.map((player) => `${player}:${current.players[player]}`).join(
      ",",
    ),
    ARMY_COLORS.map((army) => `${army}:${current.controllers[army]}`).join(","),
  ].join("|");
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

/** The caller input for one publicly listed move (001/D28 promotion choice). */
function inputOf(move: CommittableMove): PositionMoveInput {
  return move.promotion === undefined
    ? { from: move.from, to: move.to }
    : { from: move.from, to: move.to, promotion: move.promotion };
}

/** The first publicly listed move as an input, asserting one exists. */
function firstInput(game: Quaternity): PositionMoveInput {
  const [move] = game.moves();
  assert.ok(move !== undefined, "expected at least one committable move");
  return inputOf(move);
}

/** An ordinary rejection, never `UnresolvedAdjudicationError` (001/D41). */
function isOrdinaryError(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.ok(!(error instanceof UnresolvedAdjudicationError));
  return true;
}

/**
 * Attempt an in-place write to a supposedly immutable value. Module code runs
 * in strict mode, so a frozen target must reject the write with a `TypeError`.
 */
function mutate(target: object, key: string, value: unknown): void {
  (target as Record<string, unknown>)[key] = value;
}

/** §4 Fixture 4a: one White action mates the Red `a12` and Black `l12` kings. */
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

/** §7 Fixture 7: White to move, Black and Green frozen (§7). */
function fixture7(): Position {
  return position(
    [
      king("a1", "white"),
      rook("b10", "white"),
      knight("c10", "white"),
      knight("d10", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    "white",
    { white: "active", red: "active", black: "frozen", green: "frozen" },
  );
}

/** §5 Fixture 5a: four active players and a White king stalemated at `a1`. */
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

/** §5 Fixture 5b: Fixture 5a with Red and Green eliminated (001/D25 draw). */
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
 * A constructed two-active state whose on-turn White king is checked with no
 * move (the §5 `|Tier0| = 0` mate case): no action produced it, so the class
 * must report neither a mate nor the 001/D25 stalemate draw.
 */
function matedOnTurnTwoActive(): Position {
  return position(
    [
      king("a1", "white"),
      rook("a2", "black"),
      rook("b2", "black"),
      king("l12", "black"),
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

/** A constructed already-decided state: White is the only active controller. */
function loneActive(): Position {
  return position([king("a1", "white")], "white", {
    white: "active",
    red: "eliminated",
    black: "eliminated",
    green: "eliminated",
  });
}

/** §4 Fixture 4d: White `d4–e4` would leave the acting White king checked. */
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
 * The unchecked sibling R of `docs/rules/d38-coordinate-search.md` §2: Red is
 * **unchecked** with internal moves but no public committable move, so its own
 * turn fails closed (001/D40(3)/001/D41).
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

/**
 * `administrative-actions.md` §1 P4: the four active corner kings with White on
 * turn, where White can play `a1–a2`. Constructed `[fixture]`.
 */
function p4(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    "white",
  );
}

/**
 * P4 with Red already frozen (001/D45 F4): an inactive target cannot be frozen
 * again, and a frozen player is not a draw voter (§6).
 */
function p4RedFrozen(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    "white",
    {
      white: "active",
      red: "frozen",
      black: "active",
      green: "active",
    },
  );
}

/**
 * `administrative-actions.md` §2 Pl: White on turn, Red and Black frozen, Green
 * active, so freezing Green leaves White the lone active controller.
 * Constructed `[fixture]`.
 */
function plOffTurn(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    "white",
    {
      white: "active",
      red: "frozen",
      black: "frozen",
      green: "active",
    },
  );
}

/**
 * `administrative-actions.md` §2 Pt (= §7 Fixture 7b): White is already the only
 * active controller, so the game is terminal before any further action.
 */
function ptTerminal(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
    ],
    "white",
    {
      white: "active",
      red: "frozen",
      black: "frozen",
      green: "frozen",
    },
  );
}

/**
 * The `docs/rules/d38-coordinate-search.md` §2.2 checked-successor board with
 * White on turn and the checker owned by the still-active Black: a turn-advancing
 * freeze of White therefore hands Red the checked, unresolved successor
 * (001/D39–001/D41). Constructed `[fixture]`; it decides no game outcome.
 */
function checkedSuccessorBoard(): Position {
  return position(
    [
      king("h7", "white"),
      knight("d2", "white"),
      king("a1", "red"),
      bishop("a9", "red"),
      knight("b5", "red"),
      rook("l1", "black"),
      king("a6", "black"),
      rook("a12", "green"),
      knight("c3", "green"),
      knight("c4", "green"),
      knight("d8", "green"),
      king("j6", "green"),
    ],
    "white",
  );
}

/**
 * The `docs/rules/d38-coordinate-search.md` §2 predecessor P': the 001/D38-safe
 * White move `a11–a12` reaches the unchecked unresolved state R through play, so
 * the class can hold an unresolved state the constructor never accepted.
 */
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

/** A White advanced-edge pawn with a promoting move `a11–a12` (001/D28). */
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
 * The constructed position of `./committedMove.test.ts` where only the rook,
 * bishop and knight promotions of `a11–a12` survive 001/D38 (the queen mates Red
 * and the removal exposes the White king). Constructed `[fixture]`; it decides
 * no game outcome.
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

/**
 * A constructed assimilated state (§0): the eliminated Red and Green players'
 * armies are controlled by White (001/D33), so White commands the Red `a12`
 * king and the Green `d12` rook. The rook keeps its Green army colour while it
 * attacks for White. Constructed `[fixture]`; it decides no game outcome.
 */
function assimilated(): Position {
  return createPosition({
    pieces: [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
      rook("d12", "green"),
    ],
    controllers: {
      white: "white",
      red: "white",
      black: "black",
      green: "white",
    },
    players: {
      white: "active",
      red: "eliminated",
      black: "active",
      green: "eliminated",
    },
    turn: "white",
  });
}

/**
 * `assimilated()` with a Black rook `b12` checking White's assimilated `a12`
 * king while White's other king `a1` stays safe: the §1/§0 multi-king scope
 * (001/D31, 001/D33). Constructed `[fixture]`; it decides no game outcome.
 */
function assimilatedChecked(): Position {
  return createPosition({
    pieces: [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
      rook("b12", "black"),
    ],
    controllers: {
      white: "white",
      red: "white",
      black: "black",
      green: "white",
    },
    players: {
      white: "active",
      red: "eliminated",
      black: "active",
      green: "eliminated",
    },
    turn: "white",
  });
}

/**
 * §3 Fixtures 3a/3d setup: White rook `a2` and a frozen Red ordinary pawn `a6`
 * facing down the board. The frozen pawn exerts no attacks, but it still
 * occupies `a6` and blocks the White rook's file-`a` ray above it.
 */
function frozenBlocker(): Position {
  return position(
    [
      king("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
      rook("a2", "white"),
      downPawn("a6", "red"),
    ],
    "white",
    { ...ALL_ACTIVE, red: "frozen" },
  );
}

test("the default constructor starts from the reviewed opening fixture with an empty log", () => {
  const game = new Quaternity();
  const opening = defaultPosition();
  assert.equal(stateKey(game.position()), stateKey(opening));
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.status(), opening.players);
  assert.equal([...game.position().board.values()].length, 64);
  assert.deepEqual(game.history(), []);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.deepEqual(game.moves(), committableMoves(opening));
});

test("a custom validated Position is adopted as the current state", () => {
  const before = witnessP();
  const game = new Quaternity(before);
  assert.equal(stateKey(game.position()), stateKey(before));
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.status(), before.players);
  assert.deepEqual(game.history(), []);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
});

test("createPosition is exported through the public entry for custom positions", () => {
  const pieces: readonly PlacedEntry[] = [
    { square: "a1", army: "white", type: "king" },
    { square: "a12", army: "red", type: "king" },
    { square: "l12", army: "black", type: "king" },
    { square: "l1", army: "green", type: "king" },
  ];
  const input: PositionInput = {
    pieces,
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  };
  const custom = createPosition(input);
  const game = new Quaternity(custom);
  assert.equal(game.turn(), "white");
  assert.equal(stateKey(game.position()), stateKey(custom));
  assert.equal([...game.position().board.keys()].length, 4);
  assert.throws(
    () => createPosition({ ...input, pieces: [] }),
    /createPosition/,
  );
});

test("the constructor revalidates a caller-supplied Position through createPosition", () => {
  // Structurally a Position, but an active controller has no king on the board.
  const withoutBlackKing = {
    board: new Map<Square, PlacedPiece>([
      ["a1", { army: "white", type: "king" }],
      ["a12", { army: "red", type: "king" }],
      ["l1", { army: "green", type: "king" }],
    ]),
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
  } as unknown as Position;
  assert.throws(() => new Quaternity(withoutBlackKing), /createPosition/);

  // Structurally a Position, but the controller mapping is not an army colour.
  const unknownController = {
    board: new Map<Square, PlacedPiece>([
      ["a1", { army: "white", type: "king" }],
      ["a12", { army: "red", type: "king" }],
      ["l12", { army: "black", type: "king" }],
      ["l1", { army: "green", type: "king" }],
    ]),
    controllers: {
      white: "white",
      red: "red",
      black: "purple",
      green: "green",
    },
    players: { ...ALL_ACTIVE },
    turn: "white",
  } as unknown as Position;
  assert.throws(() => new Quaternity(unknownController), /createPosition/);
});

test("the constructor keeps an isolated copy of a caller-supplied Position", () => {
  const board = new Map<Square, PlacedPiece>([
    ["a1", { army: "white", type: "king" }],
    ["a12", { army: "red", type: "king" }],
    ["l12", { army: "black", type: "king" }],
    ["l1", { army: "green", type: "king" }],
    [
      "b2",
      {
        army: "white",
        type: "pawn",
        state: { kind: "ordinary", direction: "up" },
      },
    ],
  ]);
  const controllers: Record<ArmyColor, ArmyColor> = { ...IDENTITY_CONTROLLERS };
  const players: Record<ArmyColor, PlayerStatus> = { ...ALL_ACTIVE };
  const forged = { board, controllers, players, turn: "white" };
  const game = new Quaternity(forged as unknown as Position);
  const state = stateKey(game.position());
  assert.equal(game.turn(), "white");
  assert.notEqual(game.position(), forged);

  board.clear();
  controllers.black = "white";
  players.green = "eliminated";
  forged.turn = "black";

  assert.equal(stateKey(game.position()), state);
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.status(), ALL_ACTIVE);
  assert.deepEqual([...game.position().board.keys()].sort(), [
    "a1",
    "a12",
    "b2",
    "l1",
    "l12",
  ]);
});

test("the class never hands out a mutable position", () => {
  const game = new Quaternity();
  const current = game.position();
  assert.ok(Object.isFrozen(current));
  assert.throws(() => {
    (current as { turn: string }).turn = "red";
  }, TypeError);
  const board = current.board;
  assert.notEqual(board, current.board);
  (board as Map<Square, unknown>).clear();
  assert.equal([...current.board.keys()].length, 64);
  assert.equal(game.turn(), "white");
  assert.ok(Object.isFrozen(game.status()));
});

test("§0: an attack record keeps the attacker's retained army and controller after assimilation", () => {
  const game = new Quaternity(assimilated());
  assert.equal(game.position().board.get("d12")?.army, "green");
  assert.equal(game.position().controllers.green, "white");
  assert.deepEqual(game.attackers("l12", "white"), [
    { square: "d12", army: "green", controller: "white" },
  ]);
  assert.equal(game.isAttacked("l12", "white"), true);
  assert.equal(game.isAttacked("l12", "black"), false);
  assert.equal(game.inCheck("black"), true);
});

test("§1: inCheck evaluates every king a controller owns", () => {
  const safe = new Quaternity(assimilated());
  assert.equal(safe.attackers("a1", "black").length, 0);
  assert.equal(safe.inCheck("white"), false);

  const checked = new Quaternity(assimilatedChecked());
  assert.deepEqual(checked.attackers("a12", "black"), [
    { square: "b12", army: "black", controller: "black" },
  ]);
  assert.equal(checked.attackers("a1", "black").length, 0);
  assert.equal(checked.inCheck("white"), true);
  assert.equal(checked.inCheck("black"), false);
});

test("§3: a frozen attacker is inert but still blocks a sliding ray", () => {
  const game = new Quaternity(frozenBlocker());
  assert.deepEqual(game.attackers("a6", "white"), [
    { square: "a2", army: "white", controller: "white" },
  ]);
  assert.deepEqual(game.attackers("a12", "white"), []);
  assert.equal(game.isAttacked("a12", "white"), false);
  assert.deepEqual(game.attackers("b5", "red"), []);
  assert.equal(game.isAttacked("b5", "red"), false);
  assert.equal(game.attackers("a6", "red").length, 0);
});

test("a query rejects an unknown square or controller instead of answering no attack", () => {
  const game = new Quaternity();
  const before = stateKey(game.position());
  assert.throws(
    () => game.attackers("z9" as Square, "white"),
    /attackers: unknown square z9/,
  );
  assert.throws(
    () => game.isAttacked("z9" as Square, "white"),
    /isAttacked: unknown square z9/,
  );
  assert.throws(
    () => game.attackers("a1", "purple" as ArmyColor),
    /attackers: unknown controller purple/,
  );
  assert.throws(
    () => game.isAttacked("a1", "purple" as ArmyColor),
    /isAttacked: unknown controller purple/,
  );
  assert.throws(
    () => game.inCheck("purple" as ArmyColor),
    /inCheck: unknown controller purple/,
  );
  assert.equal(stateKey(game.position()), before);
});

test("a query result is a fresh, frozen copy a caller cannot rewrite", () => {
  const game = new Quaternity(assimilated());
  const first = game.attackers("l12", "white");
  assert.ok(Object.isFrozen(first));
  assert.ok(first[0] !== undefined && Object.isFrozen(first[0]));
  assert.notEqual(game.attackers("l12", "white"), first);
  assert.throws(() => mutate(first[0] as object, "army", "black"), TypeError);
  assert.throws(() => {
    (first as Attacker[]).pop();
  }, TypeError);
  assert.deepEqual(game.attackers("l12", "white"), [
    { square: "d12", army: "green", controller: "white" },
  ]);
});

test("moves() lists only committable choices", () => {
  const before = fixture4d();
  const game = new Quaternity(before);
  assert.ok(hasMove(legalMoves(before, "white"), "d4", "e4"));
  assert.ok(!hasMove(game.moves(), "d4", "e4"));

  const witness = witnessP();
  const second = new Quaternity(witness);
  assert.ok(hasMove(legalMoves(witness, "white"), "l2", "l1"));
  assert.ok(!hasMove(second.moves(), "l2", "l1"));
  assert.deepEqual(second.moves(), committableMoves(witness));
});

test("move() commits one seam result and records one immutable event", () => {
  const game = new Quaternity(witnessP());
  const event = game.move({ from: "h7", to: "h6" });
  assert.equal(event.kind, "move");
  assert.equal(event.move.from, "h7");
  assert.equal(event.move.to, "h6");
  assert.equal(event.move.army, "white");
  assert.equal(event.move.promotion, undefined);
  assert.deepEqual(event.awards, []);
  assert.deepEqual(event.selection, { kind: "next", player: "red" });
  assert.equal(game.turn(), "red");
  assert.ok(!hasMove(game.moves(), "h7", "h6"));
  assert.deepEqual(game.history(), [event]);
  assert.ok(Object.isFrozen(event));
  assert.throws(() => {
    (event as { kind: string }).kind = "pass";
  }, TypeError);
});

test("history() returns a copy, so a caller cannot rewrite the log", () => {
  const game = new Quaternity(fixture4a());
  const event = game.move({ from: "f1", to: "f12" });
  assert.deepEqual(
    event.awards.map((award) => `${award.army}->${award.to}`),
    ["red->white", "black->white"],
  );
  const returned = [...game.history()];
  returned.length = 0;
  assert.deepEqual(game.history(), [event]);
});

test("a committed pawn transition is frozen and cannot rewrite history", () => {
  const game = new Quaternity();
  const event = game.move({ from: "d4", to: "d5" });
  const pawn = event.move.pawn;
  assert.ok(pawn !== undefined, "d4-d5 records a pawn transition");
  assert.deepEqual(pawn.before, {
    kind: "advanced",
    vertical: "up",
    horizontal: "right",
    committed: undefined,
  });
  assert.deepEqual(pawn.after, {
    kind: "advanced",
    vertical: "up",
    horizontal: "right",
    committed: "up",
  });
  assert.ok(Object.isFrozen(pawn));
  assert.ok(Object.isFrozen(pawn.before));
  assert.ok(Object.isFrozen(pawn.after));
  assert.throws(() => mutate(pawn.after, "committed", "right"), TypeError);
  assert.throws(() => mutate(pawn.before, "kind", "ordinary"), TypeError);
  assert.throws(() => mutate(event, "kind", "pass"), TypeError);
  const [logged] = game.history();
  assert.ok(logged !== undefined);
  assert.throws(() => mutate(logged, "kind", "pass"), TypeError);
  assert.deepEqual(game.history(), [event]);

  game.undo();
  assert.deepEqual(game.move({ from: "d4", to: "d5" }), event);
});

test("a committed capture is recorded as an isolated frozen copy", () => {
  const before = position(
    [
      king("e1", "white"),
      rook("a1", "white"),
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
      {
        square: "a5",
        army: "black",
        type: "pawn",
        state: { kind: "ordinary", direction: "down" },
      },
    ],
    "white",
  );
  const game = new Quaternity(before);
  const event = game.move({ from: "a1", to: "a5" });
  const captured = event.move.captured;
  assert.ok(captured !== undefined, "a1-a5 captures the black pawn");
  assert.ok(captured.type === "pawn", "the captured piece is a pawn");
  assert.deepEqual(captured, {
    army: "black",
    type: "pawn",
    state: { kind: "ordinary", direction: "down" },
  });
  assert.notEqual(captured, before.board.get("a5"));
  assert.ok(Object.isFrozen(captured));
  assert.ok(Object.isFrozen(captured.state));
  assert.throws(() => mutate(captured.state, "direction", "up"), TypeError);
  assert.throws(() => mutate(captured, "army", "white"), TypeError);
  assert.deepEqual(game.history(), [event]);

  // The reviewed opening's one capture takes a non-pawn piece (`d3-j9`).
  const opening = defaultPosition();
  const openingGame = new Quaternity(opening);
  const knightEvent = openingGame.move({ from: "d3", to: "j9" });
  const knight = knightEvent.move.captured;
  assert.ok(knight !== undefined, "d3-j9 captures the black knight");
  assert.deepEqual(knight, { army: "black", type: "knight" });
  assert.notEqual(knight, opening.board.get("j9"));
  assert.ok(Object.isFrozen(knight));
  assert.throws(() => mutate(knight, "army", "white"), TypeError);
  assert.deepEqual(openingGame.history(), [knightEvent]);
});

test("committed award records are frozen, so no caller can rewrite history", () => {
  const game = new Quaternity(fixture4a());
  const event = game.move({ from: "f1", to: "f12" });
  const award = event.awards[0];
  assert.ok(award !== undefined, "the §4 fixture awards a mated king");
  assert.deepEqual(
    event.awards.map((entry) => `${entry.army}->${entry.to}`),
    ["red->white", "black->white"],
  );
  assert.ok(Object.isFrozen(event.awards));
  assert.ok(event.awards.every((entry) => Object.isFrozen(entry)));
  assert.throws(() => mutate(award, "army", "green"), TypeError);
  assert.throws(() => mutate(award, "to", "green"), TypeError);
  assert.throws(() => mutate(event.awards, "0", award), TypeError);
  assert.deepEqual(
    event.awards.map((entry) => `${entry.army}->${entry.to}`),
    ["red->white", "black->white"],
  );
  const [logged] = game.history();
  assert.ok(logged !== undefined);
  assert.deepEqual(logged, event);
  assert.deepEqual(game.history(), [event]);
});

test("§5 Fixture 5b: a two-player stalemate reports a draw and rejects both actions atomically", () => {
  const before = twoPlayerStalemate();
  const game = new Quaternity(before);
  assert.deepEqual(legalMoves(before, "white"), []);
  assert.equal(inCheck(before, "white"), false);
  assert.deepEqual(game.moves(), []);
  assert.deepEqual(game.outcome(), { kind: "draw" });
  const state = stateKey(game.position());
  assert.throws(() => game.move({ from: "a1", to: "a2" }), isOrdinaryError);
  assert.throws(() => game.pass(), isOrdinaryError);
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.history(), []);
  assert.equal(stateKey(game.position()), state);
  assert.deepEqual(game.outcome(), { kind: "draw" });
});

test("a two-active mate that no action produced is neither a draw nor an invented mate", () => {
  const before = matedOnTurnTwoActive();
  const game = new Quaternity(before);
  assert.equal(inCheck(before, "white"), true);
  assert.deepEqual(legalMoves(before, "white"), []);
  assert.deepEqual(game.moves(), []);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.throws(() => game.move({ from: "a1", to: "a2" }), isOrdinaryError);
  assert.throws(() => game.pass(), isOrdinaryError);
  assert.deepEqual(game.history(), []);
});

test("§7 Fixture 7: the last active controller wins although frozen kings remain", () => {
  const game = new Quaternity(fixture7());
  assert.deepEqual(game.move({ from: "b10", to: "a10" }).selection, {
    kind: "winner",
    winner: "white",
  });
  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.status(), {
    white: "active",
    red: "eliminated",
    black: "frozen",
    green: "frozen",
  });
  assert.deepEqual(
    [...game.position().board.entries()]
      .filter(([, placed]) => placed.type === "king")
      .map(([square]) => square)
      .sort(),
    ["a1", "l1", "l12"],
  );
});

test("a lone active controller is a winner before any action and all actions are rejected", () => {
  const game = new Quaternity(loneActive());
  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
  assert.throws(() => game.moves(), isOrdinaryError);
  assert.throws(() => game.move({ from: "a1", to: "a2" }), isOrdinaryError);
  assert.throws(() => game.pass(), isOrdinaryError);
  assert.deepEqual(game.history(), []);
  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
});

test("post-terminal actions after a won game are rejected atomically (001/D35, Fixture 7b)", () => {
  const game = new Quaternity(fixture7());
  game.move({ from: "b10", to: "a10" });
  const state = stateKey(game.position());
  assert.throws(() => game.moves(), isOrdinaryError);
  assert.throws(() => game.move({ from: "a1", to: "a2" }), isOrdinaryError);
  assert.throws(() => game.pass(), isOrdinaryError);
  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
  assert.equal(game.history().length, 1);
  assert.equal(stateKey(game.position()), state);
});

test("the P/Q checked-successor guard rejects through the class atomically (001/D39/D44)", () => {
  const game = new Quaternity(witnessP());
  const state = stateKey(game.position());
  assert.throws(
    () => game.move({ from: "l2", to: "l1" }),
    UnresolvedAdjudicationError,
  );
  assert.equal(stateKey(game.position()), state);
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.history(), []);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.ok(!hasMove(game.moves(), "l2", "l1"));
  assert.deepEqual(game.move({ from: "h7", to: "h6" }).selection, {
    kind: "next",
    player: "red",
  });
  assert.equal(game.turn(), "red");
});

test("an already-unresolved position is rejected atomically at load (001/D40(3)/001/D41)", () => {
  for (const before of [witnessQ(), siblingR()]) {
    // The class refuses to adopt the on-turn unresolved state at all: loading it
    // fails closed instead of reporting moves or inventing an outcome. The seam
    // keeps its own coverage of the identical state.
    assert.throws(() => new Quaternity(before), UnresolvedAdjudicationError);
    assert.throws(() => committableMoves(before), UnresolvedAdjudicationError);
  }
});

test("a terminal win, a stalemate draw and the reviewed opening are still loadable", () => {
  assert.deepEqual(new Quaternity(loneActive()).outcome(), {
    kind: "winner",
    winner: "white",
  });
  assert.deepEqual(new Quaternity(twoPlayerStalemate()).outcome(), {
    kind: "draw",
  });
  assert.deepEqual(new Quaternity().outcome(), { kind: "in-progress" });
});

test("an unresolved state reached through play still fails closed on every read", () => {
  const game = new Quaternity(siblingPredecessor());
  assert.equal(game.move({ from: "a11", to: "a12" }).kind, "move");
  assert.equal(game.turn(), "red");
  assert.throws(() => game.moves(), UnresolvedAdjudicationError);
  assert.throws(() => game.outcome(), UnresolvedAdjudicationError);
  assert.throws(() => game.pass(), UnresolvedAdjudicationError);
  assert.throws(() => game.proposeDraw(), UnresolvedAdjudicationError);
  assert.throws(() => game.resign("white"), UnresolvedAdjudicationError);
  assert.equal(game.history().length, 1);
  game.undo();
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.history(), []);
});

test("a 001/D38 actor-safety rejection is an ordinary illegal move and changes nothing", () => {
  const game = new Quaternity(fixture4d());
  const state = stateKey(game.position());
  const outcome = game.outcome();
  assert.throws(() => game.move({ from: "d4", to: "e4" }), isOrdinaryError);
  assert.equal(stateKey(game.position()), state);
  assert.deepEqual(game.history(), []);
  assert.deepEqual(game.outcome(), outcome);
});

test("a promoting move enumerates every permitted choice and records the committed one", () => {
  const game = new Quaternity(promotingWhite());
  assert.deepEqual(listedPromotions(game.moves(), "a11", "a12"), [
    ...PROMOTION_CHOICES,
  ]);
  const event = game.move({ from: "a11", to: "a12", promotion: "queen" });
  assert.equal(event.kind, "move");
  assert.equal(event.move.promotes, true);
  assert.equal(event.move.promotion, "queen");
  assert.equal(game.turn(), "red");
});

test("an unsafe promotion choice is never listed and is rejected atomically", () => {
  const game = new Quaternity(promotionChoiceFixture());
  assert.deepEqual(listedPromotions(game.moves(), "a11", "a12"), [
    "rook",
    "bishop",
    "knight",
  ]);
  const state = stateKey(game.position());
  assert.throws(
    () => game.move({ from: "a11", to: "a12", promotion: "queen" }),
    isOrdinaryError,
  );
  assert.throws(() => game.move({ from: "a11", to: "a12" }), isOrdinaryError);
  assert.equal(stateKey(game.position()), state);
  assert.deepEqual(game.history(), []);
  assert.equal(
    game.move({ from: "a11", to: "a12", promotion: "knight" }).move.promotion,
    "knight",
  );
});

test("§5 Fixture 5a: pass records one event and advances the turn without touching the board", () => {
  const before = fixture5a();
  const game = new Quaternity(before);
  assert.deepEqual(game.moves(), []);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  const event = game.pass();
  assert.equal(event.kind, "pass");
  assert.equal(event.player, "white");
  assert.deepEqual(event.selection, { kind: "next", player: "red" });
  assert.equal(game.turn(), "red");
  assert.equal(boardKey(game.position()), boardKey(before));
  assert.deepEqual(game.status(), before.players);
  assert.deepEqual(game.history(), [event]);
});

test("pass is an ordinary rejection for a player that has a committable move", () => {
  const game = new Quaternity();
  assert.throws(() => game.pass(), isOrdinaryError);
  assert.deepEqual(game.history(), []);
  assert.equal(game.turn(), "white");
});

test("undo reverses exactly one event and restores the pre-event state", () => {
  const game = new Quaternity(fixture7());
  const state = stateKey(game.position());
  const first = game.move({ from: "b10", to: "a10" });
  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
  game.undo();
  assert.equal(stateKey(game.position()), state);
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.history(), []);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.deepEqual(game.move({ from: "b10", to: "a10" }), first);
  game.undo();
  assert.throws(() => game.undo(), isOrdinaryError);
  assert.deepEqual(game.history(), []);
  assert.equal(stateKey(game.position()), state);
});

test("one undo of a multi-event log reverses only the last event", () => {
  const game = new Quaternity();
  game.move(firstInput(game));
  const afterFirst = stateKey(game.position());
  game.move(firstInput(game));
  assert.equal(game.history().length, 2);
  game.undo();
  assert.equal(game.history().length, 1);
  assert.equal(stateKey(game.position()), afterFirst);
  game.undo();
  assert.equal(game.history().length, 0);
  assert.equal(stateKey(game.position()), stateKey(defaultPosition()));
});

test("reset restores the opening position and clears the log", () => {
  const game = new Quaternity(fixture7());
  game.move({ from: "b10", to: "a10" });
  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
  game.reset();
  assert.equal(stateKey(game.position()), stateKey(defaultPosition()));
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.status(), defaultPosition().players);
  assert.deepEqual(game.history(), []);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.throws(() => game.undo(), isOrdinaryError);
});

/*
 * Administrative actions: draw offers/responses and the three freeze actions
 * `resign`/`recordTimeLoss`/`recordWalkover` (spec 001/D45;
 * `docs/rules/administrative-actions.md` §1–§2 and
 * `docs/rules/multiplayer-adjudication.md` §6 Fixture 6 / §7 Fixture 7b). The
 * P4/Ps/Pl/Pt bases are constructed minimal positions from that table, not
 * pictured official positions.
 */

/** Assert a rejection left the position, history, offer and outcome untouched. */
function assertUnchanged(
  game: Quaternity,
  state: string,
  history: number,
  outcome: unknown,
): void {
  assert.equal(stateKey(game.position()), state);
  assert.equal(game.history().length, history);
  assert.deepEqual(game.outcome(), outcome);
}

test("§6 Fixture 6 Action A: unanimous acceptance completes the draw without changing the board", () => {
  // The fixture's preconditions are the four-army opening position, turn White.
  const game = new Quaternity();
  const opening = stateKey(game.position());
  const proposal = game.proposeDraw();
  assert.deepEqual(proposal, { kind: "draw-proposal", proposer: "white" });
  assert.deepEqual(game.pendingDraw(), { proposer: "white", acceptedBy: [] });
  assert.equal(game.turn(), "white");

  const red = game.respondToDraw("red", true);
  assert.deepEqual(red, { kind: "draw-response", player: "red", accept: true });
  assert.deepEqual(game.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["red"],
  });
  const black = game.respondToDraw("black", true);
  const green = game.respondToDraw("green", true);
  assert.deepEqual(game.pendingDraw(), null);
  assert.deepEqual(game.outcome(), { kind: "draw" });
  assert.equal(game.turn(), "white");
  assert.equal(stateKey(game.position()), opening);
  assert.deepEqual(game.history(), [proposal, red, black, green]);

  // One undo reverses exactly the last administrative event (Green's vote).
  game.undo();
  assert.deepEqual(game.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["red", "black"],
  });
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.equal(game.history().length, 3);
  game.undo();
  game.undo();
  game.undo();
  assert.deepEqual(game.pendingDraw(), null);
  assert.deepEqual(game.history(), []);
  assert.equal(stateKey(game.position()), opening);
});

test("§6 Fixture 6 Action B: a rejection clears the offer and consumes only its own undo", () => {
  const game = new Quaternity();
  const proposal = game.proposeDraw();
  const rejection = game.respondToDraw("green", false);
  assert.deepEqual(rejection, {
    kind: "draw-response",
    player: "green",
    accept: false,
  });
  assert.equal(game.pendingDraw(), null);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.history(), [proposal, rejection]);

  game.undo();
  assert.deepEqual(game.pendingDraw(), { proposer: "white", acceptedBy: [] });
  assert.deepEqual(game.history(), [proposal]);
});

test("§1 O1: a move expires the pending offer inside its own event and one undo restores it", () => {
  const game = new Quaternity(p4());
  const opening = stateKey(game.position());
  game.proposeDraw();
  const move = game.move({ from: "a1", to: "a2" });
  assert.equal(move.kind, "move");
  assert.equal(game.turn(), "red");
  assert.equal(game.pendingDraw(), null);
  assert.equal(game.history().length, 2);

  game.undo();
  assert.equal(game.turn(), "white");
  assert.equal(stateKey(game.position()), opening);
  assert.deepEqual(game.pendingDraw(), { proposer: "white", acceptedBy: [] });
  assert.deepEqual(game.history().length, 1);
});

test("§1 O2: a pass expires the pending offer inside its own event and one undo restores it", () => {
  const game = new Quaternity(fixture5a());
  const opening = stateKey(game.position());
  game.proposeDraw();
  const event = game.pass();
  assert.equal(event.player, "white");
  assert.equal(game.turn(), "red");
  assert.equal(game.pendingDraw(), null);

  game.undo();
  assert.equal(game.turn(), "white");
  assert.equal(stateKey(game.position()), opening);
  assert.deepEqual(game.pendingDraw(), { proposer: "white", acceptedBy: [] });
});

test("§1 O3: freezing a participant expires the offer inside its own event, and one undo restores both", () => {
  const game = new Quaternity(p4());
  const opening = stateKey(game.position());
  game.proposeDraw();
  game.respondToDraw("black", true);
  const freeze = game.resign("black");
  assert.deepEqual(freeze, {
    kind: "freeze",
    action: "resign",
    player: "black",
    selection: { kind: "next", player: "white" },
  });
  assert.equal(game.status().black, "frozen");
  assert.equal(game.turn(), "white");
  assert.equal(game.pendingDraw(), null);

  game.undo();
  assert.equal(game.status().black, "active");
  assert.equal(stateKey(game.position()), opening);
  assert.deepEqual(game.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["black"],
  });
  assert.equal(game.history().length, 2);
});

test("§1 O4: a response against an expired offer is a stale vote rejected atomically", () => {
  const game = new Quaternity(p4());
  game.proposeDraw();
  game.respondToDraw("black", true);
  game.move({ from: "a1", to: "a2" });
  const state = stateKey(game.position());
  const outcome = game.outcome();
  const history = game.history().length;

  assert.throws(() => game.respondToDraw("black", true), isOrdinaryError);
  assert.equal(game.pendingDraw(), null);
  assertUnchanged(game, state, history, outcome);
});

test("a proposal changes no turn and a second proposal is rejected atomically", () => {
  const game = new Quaternity(p4());
  const state = stateKey(game.position());
  game.proposeDraw();
  assert.equal(game.turn(), "white");
  assert.equal(stateKey(game.position()), state);
  assert.throws(() => game.proposeDraw(), isOrdinaryError);
  assert.equal(game.history().length, 1);
  assert.deepEqual(game.pendingDraw(), { proposer: "white", acceptedBy: [] });
});

test("the proposer does not vote, each voter votes once and a frozen player does not vote", () => {
  const game = new Quaternity(p4RedFrozen());
  game.proposeDraw();
  const history = game.history().length;
  const state = stateKey(game.position());
  const outcome = game.outcome();

  assert.throws(() => game.respondToDraw("white", true), isOrdinaryError);
  assert.throws(() => game.respondToDraw("red", true), isOrdinaryError);
  assertUnchanged(game, state, history, outcome);

  game.respondToDraw("black", true);
  assert.throws(() => game.respondToDraw("black", true), isOrdinaryError);
  assert.deepEqual(game.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["black"],
  });

  // Red is frozen, so Black and Green alone complete the unanimous consent.
  game.respondToDraw("green", true);
  assert.deepEqual(game.outcome(), { kind: "draw" });
  assert.equal(game.pendingDraw(), null);
});

test("an unknown player is rejected atomically for every administrative action", () => {
  const game = new Quaternity(p4());
  const state = stateKey(game.position());
  const outcome = game.outcome();
  for (const action of [
    () => game.respondToDraw("blue" as ArmyColor, true),
    () => game.resign("blue" as ArmyColor),
    () => game.recordTimeLoss("blue" as ArmyColor),
    () => game.recordWalkover("blue" as ArmyColor),
  ]) {
    assert.throws(action, /unknown controller/);
  }
  assertUnchanged(game, state, 0, outcome);
});

test("§2 F1: resigning on turn freezes the target, leaves the board and advances clockwise", () => {
  const game = new Quaternity(p4());
  const board = boardKey(game.position());
  const event = game.resign("white");
  assert.deepEqual(event, {
    kind: "freeze",
    action: "resign",
    player: "white",
    selection: { kind: "next", player: "red" },
  });
  assert.ok(Object.isFrozen(event));
  assert.throws(() => mutate(event, "action", "walkover"), TypeError);
  assert.equal(game.status().white, "frozen");
  assert.equal(game.turn(), "red");
  assert.equal(boardKey(game.position()), board);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
});

test("§2 F2: an off-turn time loss freezes the target and preserves the turn", () => {
  const game = new Quaternity(p4());
  const board = boardKey(game.position());
  const event = game.recordTimeLoss("red");
  assert.deepEqual(event, {
    kind: "freeze",
    action: "time-loss",
    player: "red",
    selection: { kind: "next", player: "white" },
  });
  assert.equal(game.status().red, "frozen");
  assert.equal(game.turn(), "white");
  assert.equal(boardKey(game.position()), board);
});

test("§2 F3: a walkover leaving one active controller wins without a phantom batch", () => {
  const game = new Quaternity(plOffTurn());
  const board = boardKey(game.position());
  const event = game.recordWalkover("green");
  assert.deepEqual(event, {
    kind: "freeze",
    action: "walkover",
    player: "green",
    selection: { kind: "winner", winner: "white" },
  });
  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
  assert.equal(game.turn(), "white");
  assert.deepEqual(game.status(), {
    white: "active",
    red: "frozen",
    black: "frozen",
    green: "frozen",
  });
  // No assimilation batch: every frozen king stays on its square.
  assert.equal(boardKey(game.position()), board);
  assert.equal(game.position().board.size, 4);
});

test("§2 F4: freezing an already-inactive target is rejected atomically", () => {
  const game = new Quaternity(p4RedFrozen());
  const state = stateKey(game.position());
  const outcome = game.outcome();
  for (const action of [
    () => game.resign("red"),
    () => game.recordTimeLoss("red"),
    () => game.recordWalkover("red"),
  ]) {
    assert.throws(action, isOrdinaryError);
  }
  assertUnchanged(game, state, 0, outcome);
});

test("§2 F5: an administrative action in a terminal game is rejected atomically", () => {
  const game = new Quaternity(ptTerminal());
  const state = stateKey(game.position());
  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
  assert.throws(() => game.resign("white"), isOrdinaryError);
  assert.throws(() => game.recordTimeLoss("black"), isOrdinaryError);
  assert.throws(() => game.proposeDraw(), isOrdinaryError);
  assertUnchanged(game, state, 0, { kind: "winner", winner: "white" });
});

test("a stalemate draw rejects administrative actions atomically", () => {
  const game = new Quaternity(twoPlayerStalemate());
  const state = stateKey(game.position());
  assert.deepEqual(game.outcome(), { kind: "draw" });
  assert.throws(() => game.proposeDraw(), isOrdinaryError);
  assert.throws(() => game.respondToDraw("red", true), isOrdinaryError);
  assert.throws(() => game.resign("white"), isOrdinaryError);
  assertUnchanged(game, state, 0, { kind: "draw" });
});

test("an agreed draw is terminal for board and administrative actions, and undo/reset still work", () => {
  const game = new Quaternity(p4());
  game.proposeDraw();
  game.respondToDraw("red", true);
  game.respondToDraw("black", true);
  game.respondToDraw("green", true);
  assert.deepEqual(game.outcome(), { kind: "draw" });
  const state = stateKey(game.position());

  assert.throws(() => game.moves(), isOrdinaryError);
  assert.throws(() => game.move({ from: "a1", to: "a2" }), isOrdinaryError);
  assert.throws(() => game.pass(), isOrdinaryError);
  assert.throws(() => game.proposeDraw(), isOrdinaryError);
  assert.throws(() => game.respondToDraw("red", true), isOrdinaryError);
  assert.throws(() => game.resign("black"), isOrdinaryError);
  assert.throws(() => game.recordTimeLoss("black"), isOrdinaryError);
  assert.throws(() => game.recordWalkover("black"), isOrdinaryError);
  assertUnchanged(game, state, 4, { kind: "draw" });

  game.undo();
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.equal(game.moves().length > 0, true);
  game.reset();
  assert.deepEqual(game.history(), []);
  assert.equal(game.pendingDraw(), null);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.equal(stateKey(game.position()), stateKey(defaultPosition()));
});

test("a pending draw offer is exposed as a frozen read-only snapshot", () => {
  const game = new Quaternity(p4());
  game.proposeDraw();
  const offer = game.pendingDraw();
  assert.ok(offer !== null);
  assert.deepEqual(offer, { proposer: "white", acceptedBy: [] });
  assert.ok(Object.isFrozen(offer));
  assert.throws(() => mutate(offer as object, "proposer", "red"), TypeError);

  game.respondToDraw("black", true);
  const next = game.pendingDraw();
  assert.ok(next !== null);
  assert.notEqual(next, offer);
  assert.ok(Object.isFrozen(next));
  assert.deepEqual(game.pendingDraw(), {
    proposer: "white",
    acceptedBy: ["black"],
  });
});

test("a turn-advancing freeze observes the 001/D39–001/D41 checked-successor guard", () => {
  const game = new Quaternity(checkedSuccessorBoard());
  const state = stateKey(game.position());
  const outcome = game.outcome();
  assert.throws(() => game.resign("white"), UnresolvedAdjudicationError);
  assertUnchanged(game, state, 0, outcome);
  assert.equal(game.status().white, "active");
});

/*
 * Opening-to-terminal administrative match (spec completion criteria;
 * 001/D11 fixture `docs/fixtures/opening-to-terminal-administrative-match.md`).
 *
 * This is the small full match the completion criteria ask for: it starts from
 * the reviewed official opening fixture (001/D9), plays one real public
 * committed move per army, and then ends through the three interchangeable
 * 001/D45 freezes in clockwise order. The winner therefore comes from an
 * administrative freeze, not from a mate: the match is an
 * **opening-to-terminal administrative match** — labelled that way in the
 * fixture document — and it is **not** evidence of an opening-to-mate line, of
 * assimilation from the opening, or of a complete engine. A match that ends
 * administratively is a valid full match, but it proves only what it runs.
 *
 * Every action goes through the real engine (`move`, `proposeDraw`,
 * `recordTimeLoss`, `resign`, `recordWalkover`), so a move this fixture records
 * that the engine rejects as illegal, non-committable or guard-vetoed fails the
 * test instead of being replaced by an invented outcome.
 *
 * The document-sync test reads the fixture's own two machine-readable copies —
 * the §5 fenced JSON action log and the §3 "Expected after" column — and
 * requires both to equal what the engine recorded, so a wrong, missing or extra
 * documented action fails the gate instead of being silently tolerated.
 */

/** The reviewed expected-outcome fixture this test executes. */
const OPENING_MATCH_FIXTURE = new URL(
  "../docs/fixtures/opening-to-terminal-administrative-match.md",
  import.meta.url,
);

/** How the fixture document names one recorded action of this match. */
function documentedAction(action: SnapshotAction): string {
  if (action.kind === "move") {
    return `${action.from}–${action.to}`;
  }
  if (action.kind === "freeze") {
    return `${action.action} ${action.player}`;
  }
  assert.equal(action.kind, "draw-proposal");
  return "proposeDraw()";
}

/**
 * The fixture's §5 fenced JSON action log, parsed. It is the document's own copy
 * of the coordinate actions, so it must equal the engine's `snapshot().actions`
 * action for action.
 */
function fixtureActionLog(markdown: string): unknown {
  const fence = "```json\n";
  const open = markdown.indexOf(fence);
  assert.notEqual(open, -1, "the fixture must carry a fenced json action log");
  const start = open + fence.length;
  const close = markdown.indexOf("```", start);
  assert.notEqual(close, -1, "the fixture's json fence must be closed");
  return JSON.parse(markdown.slice(start, close));
}

/**
 * The fixture's §3 "Expected after" cells as the engine's turn selections, in
 * row order. The cell that names no selection (the draw proposal, which keeps
 * the turn) yields `null`.
 */
function documentedSelections(markdown: string): (TurnSelection | null)[] {
  const lines = markdown.split("\n");
  const header = lines.findIndex(
    (line) => line.startsWith("|") && line.includes("Expected after"),
  );
  assert.notEqual(header, -1, "the fixture must carry the §3 action table");
  const column = (lines[header] ?? "")
    .split("|")
    .findIndex((cell) => cell.trim() === "Expected after");
  assert.notEqual(
    column,
    -1,
    "the §3 action table must name an Expected after column",
  );
  const selections: (TurnSelection | null)[] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line.startsWith("|")) {
      break;
    }
    const cell = (line.split("|")[column] ?? "").trim();
    if (/^-+$/u.test(cell)) {
      continue; // the markdown delimiter row under the header
    }
    const named = /^(next|winner): ([A-Za-z]+)/u.exec(cell);
    const word = named?.[2]?.toLowerCase();
    const player = ARMY_COLORS.find((colour) => colour === word);
    selections.push(
      named === null || player === undefined
        ? null
        : named[1] === "next"
          ? { kind: "next", player }
          : { kind: "winner", winner: player },
    );
  }
  return selections;
}

/** One history event's recorded turn selection, or `null` where it records none. */
function recordedSelection(event: HistoryEvent): TurnSelection | null {
  return "selection" in event ? event.selection : null;
}

/**
 * Commit one documented match move: the public committable set must offer it,
 * it must capture nothing and it must advance the turn to `next`.
 */
function commitDocumentedMove(
  game: Quaternity,
  from: Square,
  to: Square,
  next: ArmyColor,
): void {
  assert.ok(
    hasMove(game.moves(), from, to),
    `${from}–${to} must be publicly committable`,
  );
  const event = game.move({ from, to });
  assert.deepEqual(event.awards, []);
  assert.deepEqual(event.selection, { kind: "next", player: next });
}

/**
 * Play the documented match: the reviewed opening position, four committed
 * moves, the offer-expiring move and the three freezes that end it.
 */
function playOpeningMatch(game: Quaternity): void {
  // One real committed move per army, clockwise from White.
  commitDocumentedMove(game, "b4", "c2", "red");
  commitDocumentedMove(game, "d11", "b10", "black");
  commitDocumentedMove(game, "j9", "l10", "green");
  commitDocumentedMove(game, "i2", "g3", "white");
  // A draw offer by the on-turn controller, expired inside White's next move:
  // one event, so one undo() restores the offer (001/D45 §1 O1).
  assert.deepEqual(game.proposeDraw(), {
    kind: "draw-proposal",
    proposer: "white",
  });
  assert.deepEqual(game.pendingDraw(), {
    proposer: "white",
    acceptedBy: [],
  });
  commitDocumentedMove(game, "a1", "a2", "red");
  assert.equal(game.pendingDraw(), null);
  // The three interchangeable freezes, in clockwise order, leave White the lone
  // active controller. The board keeps every piece and no batch is applied.
  assert.deepEqual(game.recordTimeLoss("red").selection, {
    kind: "next",
    player: "black",
  });
  assert.deepEqual(game.resign("black").selection, {
    kind: "next",
    player: "green",
  });
  assert.deepEqual(game.recordWalkover("green").selection, {
    kind: "winner",
    winner: "white",
  });
}

test("the opening-to-terminal administrative match fixture records every action it plays", () => {
  const document = readFileSync(OPENING_MATCH_FIXTURE, "utf8");
  const game = new Quaternity();
  playOpeningMatch(game);

  // §5's fenced JSON log is the document's copy of the whole coordinate log: it
  // must equal the engine's, so a wrong, missing or extra documented action
  // fails here instead of being played back as if the document agreed.
  assert.deepEqual(
    fixtureActionLog(document),
    JSON.parse(JSON.stringify(game.snapshot().actions)),
  );

  // §3's "Expected after" column is the document's copy of each recorded turn
  // selection; the events the engine recorded must agree with it row for row.
  const recorded = game.history().map(recordedSelection);
  assert.deepEqual(documentedSelections(document), recorded);

  // Whitespace is normalised because the formatter may wrap a documented
  // phrase across lines; the fixture's words are what this test pins.
  const documented = document.replace(/\s+/gu, " ");
  for (const action of game.snapshot().actions) {
    const label = documentedAction(action);
    assert.ok(
      documented.includes(label),
      `the fixture must document the action ${label}`,
    );
  }
  assert.ok(documented.includes("opening-to-terminal administrative match"));
  assert.ok(documented.includes("not a proof of opening-to-mate"));
  assert.ok(documented.includes("winner: White"));
  assert.ok(documented.includes("001/D45"));
});

test("the opening-to-terminal administrative match ends with an administrative winner and is terminal", () => {
  const game = new Quaternity();
  assert.equal(game.position().board.size, 64);
  assert.equal(game.turn(), "white");
  playOpeningMatch(game);

  assert.deepEqual(game.outcome(), { kind: "winner", winner: "white" });
  assert.deepEqual(game.status(), {
    white: "active",
    red: "frozen",
    black: "frozen",
    green: "frozen",
  });
  assert.deepEqual(
    game.history().map((event) => event.kind),
    [
      "move",
      "move",
      "move",
      "move",
      "draw-proposal",
      "move",
      "freeze",
      "freeze",
      "freeze",
    ],
  );
  // The administrative path changes no square: 64 pieces, and all four kings
  // (the White king having made its documented king move) stay on the board.
  assert.equal(game.position().board.size, 64);
  assert.deepEqual(
    [...game.position().board.entries()]
      .filter(([, piece]) => piece.type === "king")
      .map(([square]) => square)
      .sort(),
    ["a12", "a2", "l1", "l12"],
  );

  // Terminal atomicity: every board and administrative action is rejected and
  // changes nothing (001/D35, 001/D45).
  const state = stateKey(game.position());
  const outcome = game.outcome();
  for (const action of [
    () => game.move({ from: "a1", to: "a2" }),
    () => game.pass(),
    () => game.moves(),
    () => game.proposeDraw(),
    () => game.respondToDraw("red", true),
    () => game.resign("white"),
    () => game.recordTimeLoss("black"),
    () => game.recordWalkover("green"),
  ]) {
    assert.throws(action, isOrdinaryError);
  }
  assertUnchanged(game, state, 9, outcome);
});

test("the match keeps one-event undo, the V1 snapshot reload and reset", () => {
  const game = new Quaternity();
  playOpeningMatch(game);

  // The deterministic coordinate log of the whole match (001/D10).
  const terminal = JSON.parse(JSON.stringify(game.snapshot()));
  assert.deepEqual(terminal.actions, [
    { kind: "move", from: "b4", to: "c2", promotion: null },
    { kind: "move", from: "d11", to: "b10", promotion: null },
    { kind: "move", from: "j9", to: "l10", promotion: null },
    { kind: "move", from: "i2", to: "g3", promotion: null },
    { kind: "draw-proposal" },
    { kind: "move", from: "a1", to: "a2", promotion: null },
    { kind: "freeze", action: "time-loss", player: "red" },
    { kind: "freeze", action: "resign", player: "black" },
    { kind: "freeze", action: "walkover", player: "green" },
  ]);

  // A fresh instance replays the whole match through the public API and adopts
  // it only because the replayed state agrees with the serialized one.
  const replayed = new Quaternity();
  replayed.loadSnapshot(terminal);
  assert.deepEqual(replayed.snapshot(), terminal);
  assert.deepEqual(replayed.history(), game.history());
  assert.deepEqual(replayed.outcome(), { kind: "winner", winner: "white" });
  assert.equal(replayed.turn(), "white");

  // One undo() reverses exactly the last event: the freeze that ended the game.
  replayed.undo();
  assert.deepEqual(replayed.outcome(), { kind: "in-progress" });
  assert.equal(replayed.turn(), "green");
  assert.equal(replayed.status().green, "active");
  assert.equal(replayed.history().length, 8);

  // Two more undos remove the other two freezes; the next one reverses the
  // offer-expiring move and restores the pending offer with its recorded votes,
  // because the expiry lives inside that single event (001/D45).
  replayed.undo();
  replayed.undo();
  assert.deepEqual(replayed.status(), {
    white: "active",
    red: "active",
    black: "active",
    green: "active",
  });
  replayed.undo();
  assert.deepEqual(replayed.pendingDraw(), {
    proposer: "white",
    acceptedBy: [],
  });
  assert.equal(replayed.turn(), "white");
  assert.equal(replayed.position().board.get("a1")?.type, "king");
  assert.equal(replayed.history().length, 5);

  // One more undo clears the offer again; the remaining four reverse the moves.
  replayed.undo();
  assert.equal(replayed.pendingDraw(), null);
  assert.equal(replayed.history().length, 4);
  for (let undone = 0; undone < 4; undone += 1) {
    replayed.undo();
  }
  assert.equal(replayed.history().length, 0);
  assert.equal(stateKey(replayed.position()), stateKey(defaultPosition()));
  assert.deepEqual(replayed.outcome(), { kind: "in-progress" });
  assert.throws(() => replayed.undo(), isOrdinaryError);

  // reset() leaves the terminal match behind and restores the opening fixture.
  game.reset();
  assert.equal(stateKey(game.position()), stateKey(defaultPosition()));
  assert.equal(game.position().board.size, 64);
  assert.equal(game.turn(), "white");
  assert.equal(game.pendingDraw(), null);
  assert.deepEqual(game.history(), []);
  assert.deepEqual(game.outcome(), { kind: "in-progress" });
  assert.throws(() => game.undo(), isOrdinaryError);
});
