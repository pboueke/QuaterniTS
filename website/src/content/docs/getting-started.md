---
title: Getting started
description: Build the package with the pinned rootless-Podman toolkit and run your first coordinate move.
---

QuaterniTS is a **headless TypeScript rules library**, not an application. You
build the package and consume it from your own code. Nothing here asks you to
publish anything: the package keeps `"private": true` as an accidental-publish
safeguard until the owner performs a deliberate release (`001/D43`).

## Prerequisites

Every tool command in this repository runs inside a **digest-pinned Node
container** through **rootless Podman**. The host needs only `podman` (rootless),
`make`, `bash` and `git` — no host Node or npm install.

```sh
make preflight        # fail loudly unless rootless Podman is usable
make toolkit-image    # build the pinned image once (also runs on demand)
make toolkit-deps     # npm ci from the frozen lockfile
```

## Build the package

`make build` emits the dual ESM/CJS package and its TypeScript declarations into
`dist/`:

```sh
make build
```

Then exercise the built package the way a consumer does:

```sh
make consumer-test    # pack and run Node ESM/CJS + TypeScript consumers
make integration      # run the installed package through its lifecycle fixture
make browser-consumer # run the installed package in a real headless Chromium
```

## Use the library

The default position is the reviewed 64-piece opening; White is on turn. Set up a
game and commit a coordinate move:

```ts
import { Quaternity } from "quaternits";

const game = new Quaternity();
console.log("turn:", game.turn(), "pieces:", game.position().board.size);
console.log("in check:", game.inCheck("white"));

const event = game.move({ from: "b4", to: "c2" });
console.log("selection:", event.selection);
```

Every TypeScript example in the [usage reference](/QuaterniTS/reference/usage/)
is executed against the real public API by `toolkit/scripts/docs-examples.test.ts`
inside `make test`, so an example that drifts from the code fails the gate
instead of misleading you.

## Install from npm (after a release)

The npm package id is `quaternits`, but it is **not published yet**:

```sh
npm install quaternits
```

That command resolves only after a deliberate package release. Until then, build
and pack the current checkout with the toolkit as shown above.

## Next steps

- [Public API](/QuaterniTS/api/) — the class, queries and typed events.
- [Usage examples](/QuaterniTS/reference/usage/) — runnable, verified examples.
- [Snapshots](/QuaterniTS/snapshots/) — the versioned V1 persistence document.
- [Compatibility](/QuaterniTS/reference/compatibility/) — the chess.js-style
  matrix and the deliberate gaps.
- [Contributing](/QuaterniTS/contributing/) — the spec workflow and quality gates.
