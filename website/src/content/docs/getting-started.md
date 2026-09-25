---
title: Getting started
description: Install QuaterniTS and make your first move.
---

QuaterniTS is a headless rules library: bring your own interface, storage and
players. It starts from the reviewed 64-piece opening on a 12 × 12 board.

## Install

```sh
npm install quaternits
```

The package includes TypeScript declarations and supports both ESM and CommonJS.

## Make a move

```ts
import { Quaternity } from "quaternits";

const game = new Quaternity();
console.log(game.turn()); // "white"

// Only moves that can be committed by the current controller are listed.
const available = game.moves();
console.log(available.some(({ from, to }) => from === "b4" && to === "c2"));

const event = game.move({ from: "b4", to: "c2" });
console.log(event.selection, game.turn());
```

Moves use long coordinates with files `a`–`l` and ranks `1`–`12`. A pawn
promoting on a move needs an explicit choice of `queen`, `rook`, `bishop` or
`knight`. Invalid actions throw without changing the game.

## Inspect and save a game

```ts
console.log(game.position().board.size);
console.log(game.inCheck(game.turn()));
console.log(game.history());

const snapshot = game.snapshot();
const restored = new Quaternity();
restored.loadSnapshot(snapshot);
console.log(restored.turn());
```

Snapshots are versioned JSON documents containing the position, action log and
resulting state. Loading one validates and replays the recorded actions.

## Keep exploring

- [Usage examples](/QuaterniTS/reference/usage/) — moves, checks, draw offers,
  snapshots and undo.
- [Public API](/QuaterniTS/api/) and
  [compatibility guide](/QuaterniTS/reference/compatibility/).
- [Rules and fixtures](/QuaterniTS/rules/) — the opening position and
  source-linked examples.
- [Scope](/QuaterniTS/scope/) — supported outcomes and known limitations.
