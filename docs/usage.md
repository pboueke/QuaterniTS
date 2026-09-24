# Usage examples

Runnable examples of the public API. Every TypeScript block below is executed
against the library by `toolkit/scripts/docs-examples.test.ts` in `make test`, so
an example that drifts from the real API fails the gate instead of misleading a
reader. The examples show a **partial** API: this library is not a complete
engine, and it claims no SAN, FEN or PGN compatibility (spec 001/D4). See
[`compatibility.md`](compatibility.md) for what is deliberately unsupported.

## Install and import

```sh
npm install quaternits
```

That registry install applies **only after a deliberate package release**: the
package is **not published yet**. `package.json` still carries `"private": true`
as the accidental-publish safeguard, so this command does not resolve today,
and nothing here asks anyone to publish it (`001/D42`, `001/D43`; see the
repository's **Publishing** section).

To use the current checkout, build and pack the package locally instead:

```sh
make build   # emit dist/ (ESM + CJS + declarations)
npm pack     # pack that same build into an installable tarball
```

`make consumer-test` builds, packs and installs that tarball in a disposable
directory and runs Node ESM, CommonJS and TypeScript consumers against it;
`make integration` runs the installed package through its lifecycle fixtures.

The package ships built ESM and CommonJS entry points plus TypeScript
declarations and the snapshot JSON Schema; the examples below use the ESM entry
point.

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
explicit `promotion: "queen" | "rook" | "bishop" | "knight"` choice (spec
001/D28).

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
player owns (spec 001/D31, 001/D33).

## End a game administratively

```ts
import { Quaternity } from "quaternits";

// Freezing every other active controller leaves one active controller, who wins
// (spec 001/D35, 001/D45). This is an administrative finish, not a mate.
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
// coordinate action log, the event records and the resulting state (001/D10).
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
// restores the offer with its recorded votes (spec 001/D45).
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

// An unresolved on-turn state (a checked controller with no committable move)
// fails closed with UnresolvedAdjudicationError instead of an invented outcome.
console.log(
  "UnresolvedAdjudicationError is a software error:",
  UnresolvedAdjudicationError.name,
);
```

There is **no established game outcome** for that checked-non-actor edge
(spec 001/D38–001/D41): the library fails closed, and no mate, pass, draw,
elimination or award is decided for it.
