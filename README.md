# QuaterniTS

[![Version: 0.1.0](https://img.shields.io/static/v1?label=version&message=0.1.0&color=blue)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Line coverage: 100%](https://img.shields.io/badge/lines-100%25-brightgreen)](Makefile)
[![Branch coverage: 100%](https://img.shields.io/badge/branches-100%25-brightgreen)](Makefile)

QuaterniTS is an unofficial, community-driven **headless TypeScript rules
library for Quaternity**, a four-player chess-inspired game. It models the
12 × 12 board, legal moves and game state for applications, education and
research. It is not a UI, server, AI or board renderer.

QuaterniTS is **not affiliated with, sponsored by, or endorsed by** the rights
holders of the official game. The MIT [license](LICENSE) covers this project's
original work, not third-party names, rules text, trademarks or artwork. The
project is developed free of charge without monetization; this intention does
not limit anyone's rights under the MIT license.

## Install

```sh
npm install quaternits
```

## Quick start

```ts
import { Quaternity } from "quaternits";

const game = new Quaternity(); // 64-piece starting position; White moves first.
console.log(game.turn(), game.moves());

const event = game.move({ from: "b4", to: "c2" });
console.log(event.selection, game.outcome());

const saved = game.snapshot(); // Versioned JSON for replay and restoration.
const restored = new Quaternity();
restored.loadSnapshot(saved);
```

The package provides typed moves, attack and check queries, draw and
administrative actions, history, undo, and versioned snapshots. Its API is
inspired by chess.js where useful but does **not** support chess.js notation or
formats such as SAN, FEN or PGN. Where an official game outcome is unknown,
the library fails closed with `UnresolvedAdjudicationError` rather than inventing
a result; see its [bounded rules scope](https://pboueke.github.io/QuaterniTS/scope/).

## Links

- [Getting started](https://pboueke.github.io/QuaterniTS/getting-started/) and [public API](https://pboueke.github.io/QuaterniTS/api/)
- [Usage examples](https://pboueke.github.io/QuaterniTS/reference/usage/) and [compatibility guide](https://pboueke.github.io/QuaterniTS/reference/compatibility/)
- [Rules and examples](https://pboueke.github.io/QuaterniTS/rules/) and [scope](https://pboueke.github.io/QuaterniTS/scope/)
- [Contributing](CONTRIBUTING.md) and [license](LICENSE)
- Official [basic rules](https://www.quaternity.com/play-quaternity) and [illustrated quick rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf)
