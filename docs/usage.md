# Usage examples

Examples of the public API, from opening moves to snapshots and draw offers.
QuaterniTS does not support SAN, FEN or PGN; see the
[compatibility guide](compatibility.md) for the nearest alternatives.

## Install

```sh
npm install quaternits
```

The package includes ESM and CommonJS entry points, TypeScript declarations and
a JSON Schema for its snapshots. The examples below use ESM.

## Create a game and commit a move

```ts
import { Quaternity } from "quaternits";

// The default position is the reviewed 64-piece opening; White is on turn.
const game = new Quaternity();
console.log("turn:", game.turn(), "pieces:", game.position().board.size);

// moves() lists only the publicly committable moves, as long coordinates.
const knightMove = game
  .moves()
  .find((move) => move.from === "b4" && move.to === "c2");
console.log("knight move is committable:", knightMove !== undefined);

// Commit a move: the event records the next active controller and every mate
// award the action produced.
const event = game.move({ from: "b4", to: "c2" });
console.log("selection:", event.selection, "awards:", event.awards.length);
```

A rejected action throws and changes nothing: an illegal move, an unknown square
or an action after the game is over. A move that a pawn promotes on requires an
explicit `promotion: "queen" | "rook" | "bishop" | "knight"` choice.

## Query attacks and check

```ts
import { Quaternity } from "quaternits";

const game = new Quaternity();
console.log("is White in check?", game.inCheck("white"));
console.log("attacked by Red at a1:", game.attackers("a1", "red"));

// A frozen controller's pieces exert no attacks but still block sliding rays.
game.recordTimeLoss("red");
console.log(
  "after Red is frozen, a1 attacked by red?",
  game.isAttacked("a1", "red"),
);
```

An attacker record keeps the attacking piece's square, its retained army colour
and its current controller, and `inCheck(player)` evaluates **every** king that
player owns.

## End a game administratively

```ts
import { Quaternity } from "quaternits";

// Freezing every other active controller leaves one active controller, who wins
// This is an administrative finish, not a mate.
const game = new Quaternity();
game.recordTimeLoss("red");
game.resign("black");
game.recordWalkover("green");
console.log("outcome:", game.outcome());
console.log("status:", game.status());
```

A freeze never changes a square: frozen kings stay on the board and are still
checkmateable by a later action. Once the game is over, board and administrative
actions are rejected, while `undo()` and `reset()` still work.

The repository also ships one executed full match from the reviewed opening
position, [`fixtures/opening-to-terminal-administrative-match.md`](fixtures/opening-to-terminal-administrative-match.md),
which plays one real committed move per army and then ends through these three
freezes. It is plainly an **opening-to-terminal administrative match**: the
winner comes from a freeze, not from a mate, so it is **not a proof of
opening-to-mate**.

## Save, restore and undo

```ts
import { Quaternity } from "quaternits";

const game = new Quaternity();
game.move({ from: "b4", to: "c2" });

// snapshot() is the versioned V1 JSON document: the replay origin, the
// coordinate action log, the event records and the resulting state.
const document = game.snapshot();

// loadSnapshot() replays the actions through a fresh instance and adopts the
// result only when the replay agrees with the document; a tampered, malformed,
// unsupported or illegal document is rejected atomically.
const restored = new Quaternity();
restored.loadSnapshot(JSON.parse(JSON.stringify(document)));
console.log("version:", document.version, "actions:", document.actions.length);
console.log("restored:", restored.turn(), restored.history().length);
```

## Draw offers, one-event undo and reset

```ts
import { Quaternity } from "quaternits";

const game = new Quaternity();
game.proposeDraw();
console.log("offer:", game.pendingDraw());

// The next move expires the offer inside its own single event, so one undo()
// restores the offer with its recorded votes.
game.move({ from: "b4", to: "c2" });
console.log("after the move:", game.pendingDraw());

game.undo();
console.log("after one undo:", game.pendingDraw());

game.reset();
console.log("after reset:", game.position().board.size, game.history().length);
```

`proposeDraw()` is available to the controller on turn and `respondToDraw(player, accept)`
to every other active player; unanimous acceptance is a draw, and a single
rejection clears the offer without ending play.

## Error handling

```ts
import { Quaternity, UnresolvedAdjudicationError } from "quaternits";

const game = new Quaternity();
try {
  game.move({ from: "a1", to: "a12" });
} catch (error) {
  console.log("rejected:", error instanceof Error ? error.message : error);
}

// If a checked controller has internal defenses but no safe public move,
// the unresolved position fails closed instead of inventing an outcome.
console.log(
  "UnresolvedAdjudicationError is a software error:",
  UnresolvedAdjudicationError.name,
);
```

There is **no established game outcome** for that checked-non-actor edge. The
library fails closed, and no mate, pass, draw, elimination or award is decided
for it.
