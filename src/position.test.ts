import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARMY_COLORS, type ArmyColor, type Square } from "./board.ts";
import { pseudoLegalDestinations, type Board } from "./geometry.ts";
import {
  ADVANCED_PAWN_AXES,
  type PawnDirection,
  type PawnState,
} from "./pawn.ts";
import {
  ADVANCED_CENTRAL_PAWNS,
  OPENING_POSITION,
} from "./fixtures/openingPosition.ts";
import {
  attackers,
  createPosition,
  defaultPosition,
  inCheck,
  isAttacked,
  type PlacedEntry,
  type PlacedPiece,
  type PlayerStatus,
  type Position,
  type PositionInput,
} from "./position.ts";

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

function king(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "king" };
}
function rook(square: Square, army: ArmyColor): PlacedEntry {
  return { square, army, type: "rook" };
}
function pawn(square: Square, army: ArmyColor, state: PawnState): PlacedEntry {
  return { square, army, type: "pawn", state };
}
function ordinary(direction: PawnDirection): PawnState {
  return { kind: "ordinary", direction };
}
function advanced(
  vertical: PawnDirection,
  horizontal: PawnDirection,
  committed?: PawnDirection,
): PawnState {
  return { kind: "advanced", vertical, horizontal, committed };
}

const FOUR_KINGS: readonly PlacedEntry[] = [
  king("a1", "white"),
  king("a12", "red"),
  king("l12", "black"),
  king("l1", "green"),
];

function baseInput(overrides: Partial<PositionInput> = {}): PositionInput {
  return {
    pieces: [...FOUR_KINGS],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE },
    turn: "white",
    ...overrides,
  };
}

function pawnStateAt(
  position: Position,
  square: Square,
): PawnState | undefined {
  const placed = position.board.get(square);
  return placed?.type === "pawn" ? placed.state : undefined;
}

/** The eight ordinary-pawn orientations from docs/rules/pawn-vectors.md §1. */
const ORIENTATION_CASES: readonly (readonly [Square, PawnDirection])[] = [
  ["c5", "up"],
  ["e3", "right"],
  ["c8", "down"],
  ["e10", "right"],
  ["j8", "down"],
  ["h10", "left"],
  ["j5", "up"],
  ["h3", "left"],
];

test("the default position is the 64-piece opening with White to move", () => {
  const position = defaultPosition();
  assert.equal(position.board.size, 64);
  assert.equal(position.turn, "white");
  for (const army of ARMY_COLORS) {
    assert.equal(position.players[army], "active", `${army} status`);
    assert.equal(position.controllers[army], army, `${army} controller`);
  }
  for (const { square, army, type } of OPENING_POSITION) {
    const placed = position.board.get(square);
    assert.ok(placed, `piece at ${square}`);
    assert.equal(placed.army, army, `army at ${square}`);
    assert.equal(placed.type, type, `type at ${square}`);
  }
});

test("the default position has the fixture's piece-type composition", () => {
  const counts = new Map<string, number>();
  for (const placed of defaultPosition().board.values()) {
    counts.set(placed.type, (counts.get(placed.type) ?? 0) + 1);
  }
  assert.equal(counts.get("king"), 4);
  assert.equal(counts.get("queen"), 4);
  assert.equal(counts.get("rook"), 8);
  assert.equal(counts.get("knight"), 8);
  assert.equal(counts.get("bishop"), 8);
  assert.equal(counts.get("pawn"), 32);
  assert.equal(counts.size, 6);
});

test("every opening ordinary pawn carries its official forward direction", () => {
  const position = defaultPosition();
  for (const [square, direction] of ORIENTATION_CASES) {
    assert.deepEqual(
      pawnStateAt(position, square),
      ordinary(direction),
      `${square} direction`,
    );
  }
});

test("every opening advanced central pawn starts uncommitted on its army axes", () => {
  const position = defaultPosition();
  for (const army of ARMY_COLORS) {
    const [vertical, horizontal] = ADVANCED_PAWN_AXES[army];
    for (const square of ADVANCED_CENTRAL_PAWNS[army]) {
      assert.deepEqual(
        pawnStateAt(position, square),
        advanced(vertical, horizontal),
        `${army} ${square} advanced state`,
      );
    }
  }
});

test("kings and pawns attack exactly the squares the rules give them", () => {
  const position = createPosition(
    baseInput({ pieces: [...FOUR_KINGS, pawn("c5", "white", ordinary("up"))] }),
  );
  assert.deepEqual(attackers(position, "a2", "white"), ["a1"]);
  assert.deepEqual(attackers(position, "b2", "white"), ["a1"]);
  assert.deepEqual(attackers(position, "b6", "white"), ["c5"]);
  assert.deepEqual(attackers(position, "d6", "white"), ["c5"]);
  assert.deepEqual(attackers(position, "c6", "white"), []);
  assert.equal(isAttacked(position, "b6", "white"), true);
  assert.equal(isAttacked(position, "c6", "white"), false);
});

test("an attack includes a king square while a pseudo-legal move never captures a king", () => {
  const position = createPosition(
    baseInput({
      pieces: [
        king("a1", "white"),
        king("a12", "red"),
        king("d6", "black"),
        king("l1", "green"),
        rook("d4", "white"),
      ],
    }),
  );
  assert.deepEqual(attackers(position, "d6", "white"), ["d4"]);
  const board: Board = new Map([
    ["d4", { controller: "white", army: "white", type: "rook" }],
    ["d6", { controller: "black", army: "black", type: "king" }],
  ]);
  assert.ok(
    !pseudoLegalDestinations(board, "d4", {
      controller: "white",
      army: "white",
      type: "rook",
    }).includes("d6"),
  );
});

test("only an active controller's pieces exert attacks", () => {
  const pieces = [...FOUR_KINGS, rook("d12", "red")];
  const active = createPosition(baseInput({ pieces }));
  assert.deepEqual(attackers(active, "d1", "red"), ["d12"]);
  const frozen = createPosition(
    baseInput({ pieces, players: { ...ALL_ACTIVE, red: "frozen" } }),
  );
  assert.deepEqual(attackers(frozen, "d1", "red"), []);
  assert.equal(isAttacked(frozen, "d1", "red"), false);
});

test("a frozen piece still blocks a sliding ray until it is captured", () => {
  const position = createPosition(
    baseInput({
      pieces: [
        ...FOUR_KINGS,
        rook("a2", "white"),
        pawn("a6", "red", ordinary("down")),
      ],
      players: { ...ALL_ACTIVE, red: "frozen" },
    }),
  );
  assert.deepEqual(attackers(position, "a6", "white"), ["a2"]);
  assert.deepEqual(attackers(position, "a12", "white"), []);
  assert.deepEqual(attackers(position, "b5", "red"), []);
});

test("a frozen king never attacks but remains on the board", () => {
  assert.deepEqual(attackers(createPosition(baseInput()), "b12", "red"), [
    "a12",
  ]);
  const frozen = createPosition(
    baseInput({ players: { ...ALL_ACTIVE, red: "frozen" } }),
  );
  assert.deepEqual(attackers(frozen, "b12", "red"), []);
  assert.equal(frozen.board.has("a12"), true);
});

test("a frozen king can still be in check", () => {
  const position = createPosition(
    baseInput({
      pieces: [...FOUR_KINGS, rook("b12", "black")],
      players: { ...ALL_ACTIVE, red: "frozen" },
    }),
  );
  assert.equal(inCheck(position, "red"), true);
  assert.equal(inCheck(position, "black"), false);
});

test("an assimilated piece attacks for its controller and keeps its army colour", () => {
  const position = createPosition({
    pieces: [...FOUR_KINGS, rook("d12", "green")],
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
  assert.deepEqual(attackers(position, "l12", "white"), ["d12"]);
  assert.equal(position.board.get("d12")?.army, "green");
  assert.equal(position.controllers.green, "white");
  assert.equal(inCheck(position, "black"), true);
});

test("a controller's two kings are both checked for safety", () => {
  const pieces: readonly PlacedEntry[] = [...FOUR_KINGS];
  const controllers: Readonly<Record<ArmyColor, ArmyColor>> = {
    white: "white",
    red: "white",
    black: "black",
    green: "green",
  };
  const players: Readonly<Record<ArmyColor, PlayerStatus>> = {
    white: "active",
    red: "eliminated",
    black: "active",
    green: "active",
  };
  const safe = createPosition({ pieces, controllers, players, turn: "white" });
  assert.equal(inCheck(safe, "white"), false);

  const redKingChecked = createPosition({
    pieces: [...pieces, rook("b12", "black")],
    controllers,
    players,
    turn: "white",
  });
  assert.deepEqual(attackers(redKingChecked, "a12", "black"), ["b12"]);
  assert.equal(inCheck(redKingChecked, "white"), true);

  const whiteKingChecked = createPosition({
    pieces: [...pieces, rook("d1", "black")],
    controllers,
    players,
    turn: "white",
  });
  assert.deepEqual(attackers(whiteKingChecked, "a1", "black"), ["d1"]);
  assert.equal(inCheck(whiteKingChecked, "white"), true);
});

test("a controller's own pieces are not hostile attackers", () => {
  const position = createPosition(
    baseInput({ pieces: [...FOUR_KINGS, rook("a5", "white")] }),
  );
  assert.deepEqual(attackers(position, "a1", "white"), ["a5"]);
  assert.deepEqual(attackers(position, "a1", "black"), []);
  assert.equal(inCheck(position, "white"), false);
});

test("a validated custom position records frozen status, turn and committed pawns", () => {
  const position = createPosition({
    pieces: [...FOUR_KINGS, pawn("c6", "white", advanced("up", "right", "up"))],
    controllers: { ...IDENTITY_CONTROLLERS },
    players: { ...ALL_ACTIVE, red: "frozen" },
    turn: "black",
  });
  assert.equal(position.turn, "black");
  assert.equal(position.players.red, "frozen");
  assert.deepEqual(position.board.get("c6"), {
    army: "white",
    type: "pawn",
    state: advanced("up", "right", "up"),
  });
});

test("a position never exposes its internal mutable board", () => {
  const position = defaultPosition();
  const exposed = position.board as Map<Square, PlacedPiece>;
  exposed.delete("a1");
  exposed.set("a1", { army: "black", type: "king" });
  assert.equal(position.board.size, 64);
  assert.equal(position.board.get("a1")?.army, "white");
});

test("position records, pieces and pawn state are frozen against reassignment", () => {
  const position = defaultPosition();
  assert.throws(() => {
    (position.players as { white: PlayerStatus }).white = "eliminated";
  }, TypeError);
  assert.throws(() => {
    (position.controllers as { white: ArmyColor }).white = "black";
  }, TypeError);
  assert.throws(() => {
    (position as { turn: ArmyColor }).turn = "red";
  }, TypeError);
  assert.throws(() => {
    (position as { board: unknown }).board = new Map();
  }, TypeError);
  const piece = position.board.get("a1");
  assert.ok(piece, "king on a1");
  assert.throws(() => {
    (piece as { army: ArmyColor }).army = "red";
  }, TypeError);
  const state = pawnStateAt(position, "c5");
  assert.ok(state, "pawn state on c5");
  assert.throws(() => {
    (state as { kind: string }).kind = "advanced";
  }, TypeError);
});

test("createPosition isolates the returned position from its input", () => {
  const state = ordinary("up");
  const whiteKing = king("a1", "white");
  const input = baseInput({
    pieces: [
      whiteKing,
      king("a12", "red"),
      king("l12", "black"),
      king("l1", "green"),
      pawn("c5", "white", state),
    ],
  });
  const position = createPosition(input);
  (input.controllers as { white: ArmyColor }).white = "black";
  (input.players as { white: PlayerStatus }).white = "eliminated";
  (whiteKing as { army: ArmyColor }).army = "black";
  (state as { direction: PawnDirection }).direction = "down";
  assert.equal(position.controllers.white, "white");
  assert.equal(position.players.white, "active");
  assert.equal(position.board.get("a1")?.army, "white");
  assert.deepEqual(pawnStateAt(position, "c5"), ordinary("up"));
});

test("repeated defaultPosition calls are independent", () => {
  const first = defaultPosition();
  const second = defaultPosition();
  assert.notEqual(first, second);
  (first.board as Map<Square, PlacedPiece>).delete("a1");
  assert.ok(first.board.has("a1"));
  assert.ok(second.board.has("a1"));
});

test("a custom position rejects two kings of the same army colour", () => {
  assert.throws(
    () =>
      createPosition(
        baseInput({ pieces: [...FOUR_KINGS, king("b1", "white")] }),
      ),
    /more than one king/,
  );
});

interface MalformedCase {
  readonly name: string;
  readonly pattern: RegExp;
  readonly build: () => PositionInput;
}

const MALFORMED_CASES: readonly MalformedCase[] = [
  {
    name: "an off-board square",
    pattern: /unknown square/,
    build: () =>
      baseInput({
        pieces: [{ square: "m1" as Square, army: "white", type: "king" }],
      }),
  },
  {
    name: "duplicate occupancy",
    pattern: /duplicate square/,
    build: () =>
      baseInput({
        pieces: [king("a1", "white"), king("a1", "red"), king("l12", "black")],
      }),
  },
  {
    name: "an unknown army",
    pattern: /unknown army/,
    build: () =>
      baseInput({
        pieces: [
          { square: "a1" as Square, army: "blue" as ArmyColor, type: "king" },
        ],
      }),
  },
  {
    name: "an unknown piece type",
    pattern: /unknown piece type/,
    build: () =>
      baseInput({
        pieces: [
          {
            square: "a1" as Square,
            army: "white",
            type: "dragon" as unknown as "king",
          },
        ],
      }),
  },
  {
    name: "a pawn without state",
    pattern: /pawn state/,
    build: () =>
      baseInput({
        pieces: [
          ...FOUR_KINGS,
          {
            square: "c5",
            army: "white",
            type: "pawn",
          } as unknown as PlacedEntry,
        ],
      }),
  },
  {
    name: "a non-object pawn state",
    pattern: /pawn state/,
    build: () =>
      baseInput({
        pieces: [
          ...FOUR_KINGS,
          pawn("c5", "white", "up" as unknown as PawnState),
        ],
      }),
  },
  {
    name: "a null pawn state",
    pattern: /pawn state/,
    build: () =>
      baseInput({
        pieces: [
          ...FOUR_KINGS,
          pawn("c5", "white", null as unknown as PawnState),
        ],
      }),
  },
  {
    name: "an unknown pawn kind",
    pattern: /unknown pawn kind/,
    build: () =>
      baseInput({
        pieces: [
          ...FOUR_KINGS,
          pawn("c5", "white", { kind: "diagonal" } as unknown as PawnState),
        ],
      }),
  },
  {
    name: "an impossible ordinary direction",
    pattern: /impossible white pawn direction/,
    build: () =>
      baseInput({
        pieces: [...FOUR_KINGS, pawn("c5", "white", ordinary("down"))],
      }),
  },
  {
    name: "impossible advanced axes (vertical)",
    pattern: /advanced pawn axes/,
    build: () =>
      baseInput({
        pieces: [...FOUR_KINGS, pawn("d4", "white", advanced("down", "right"))],
      }),
  },
  {
    name: "impossible advanced axes (horizontal)",
    pattern: /advanced pawn axes/,
    build: () =>
      baseInput({
        pieces: [...FOUR_KINGS, pawn("d4", "white", advanced("up", "left"))],
      }),
  },
  {
    name: "an impossible committed direction",
    pattern: /committed direction/,
    build: () =>
      baseInput({
        pieces: [
          ...FOUR_KINGS,
          pawn("d4", "white", advanced("up", "right", "down")),
        ],
      }),
  },
  {
    name: "an unknown player status",
    pattern: /no valid status/,
    build: () =>
      baseInput({
        players: { ...ALL_ACTIVE, white: "asleep" as PlayerStatus },
      }),
  },
  {
    name: "an unknown controller",
    pattern: /no valid controller/,
    build: () =>
      baseInput({
        controllers: { ...IDENTITY_CONTROLLERS, white: "blue" as ArmyColor },
      }),
  },
  {
    name: "a missing controller",
    pattern: /no valid controller/,
    build: () => baseInput({ controllers: {} as Record<ArmyColor, ArmyColor> }),
  },
  {
    name: "an eliminated controller owning a piece",
    pattern: /eliminated controller/,
    build: () => baseInput({ players: { ...ALL_ACTIVE, red: "eliminated" } }),
  },
  {
    name: "an active controller without a king",
    pattern: /has no king/,
    build: () =>
      baseInput({
        pieces: [
          king("a1", "white"),
          king("l12", "black"),
          king("l1", "green"),
        ],
      }),
  },
  {
    name: "a frozen controller without a king",
    pattern: /has no king/,
    build: () =>
      baseInput({
        pieces: [
          king("a1", "white"),
          king("l12", "black"),
          king("l1", "green"),
        ],
        players: { ...ALL_ACTIVE, red: "frozen" },
      }),
  },
  {
    name: "a turn that is not active",
    pattern: /not an active player/,
    build: () =>
      baseInput({
        players: { ...ALL_ACTIVE, white: "frozen" },
        turn: "white",
      }),
  },
  {
    name: "zero active controllers",
    pattern: /no active controller/,
    build: () =>
      baseInput({
        players: {
          white: "frozen",
          red: "frozen",
          black: "frozen",
          green: "frozen",
        },
      }),
  },
];

test("malformed custom positions are rejected with an actionable error", () => {
  for (const { name, pattern, build } of MALFORMED_CASES) {
    assert.throws(() => createPosition(build()), pattern, name);
  }
});

test("a rejected custom position leaves existing objects unchanged", () => {
  const position = defaultPosition();
  const boardBefore = [...position.board.entries()];
  const input = baseInput({ pieces: [king("a1", "white")] });
  const inputBefore = structuredClone(input);
  assert.throws(() => createPosition(input));
  assert.deepEqual([...position.board.entries()], boardBefore);
  assert.equal(position.turn, "white");
  assert.deepEqual(input, inputBefore);
});

const SRC_ROOT = fileURLToPath(new URL(".", import.meta.url));

function walkTypeScript(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTypeScript(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

test("engine modules have no Node-only runtime dependency", () => {
  const engineFiles = walkTypeScript(SRC_ROOT).filter(
    (file) => !file.endsWith(".test.ts"),
  );
  assert.ok(engineFiles.length > 0, "expected engine source files");
  for (const file of engineFiles) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /["']node:/,
      `${path.relative(SRC_ROOT, file)} imports a Node-only module`,
    );
  }
});
