# QuaterniTS

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Line coverage: 100%](https://img.shields.io/badge/lines-100%25-brightgreen)](Makefile)
[![Branch coverage: 100%](https://img.shields.io/badge/branches-100%25-brightgreen)](Makefile)

QuaterniTS is an unofficial, community-driven **headless TypeScript rules
library for Quaternity**, a four-player chess-inspired game. It models the
12 × 12 board, piece movement, pawn rules, check and mate adjudication and the
administrative actions, so it can be embedded in applications to
study, teach and research how the game's rules work.

It is **not affiliated with, sponsored by, or endorsed by** the rights holders
of the official Quaternity game or project, and it uses no official logos or
visual assets. The MIT [`LICENSE`](LICENSE) covers this project's original work
only — not third-party names, rules text, trademarks, artwork or other assets.
QuaterniTS is developed free of charge with no monetization; that is a project
intention, not a license condition, and it does not limit anyone's MIT rights.

The library is headless: it generates and validates legal moves, holds a
position and reports game state. It is inspired by chess.js's ergonomic API but
claims **no** chess.js, FEN, PGN or SAN compatibility. It is not a
UI, server, AI or board renderer.

## Quick start

```ts
import { Quaternity } from "quaternits";

// The default position is the reviewed 64-piece opening; White is on turn.
const game = new Quaternity();
console.log("turn:", game.turn());

// Commit a coordinate move; the event records the next active controller and
// any mate awards the action produced.
game.move({ from: "b4", to: "c2" });
console.log("outcome:", game.outcome().kind);

// snapshot() is the versioned V1 JSON persistence document (001/D10).
console.log("snapshot version:", game.snapshot().version);
```

The package ships built ESM and CommonJS entry points, TypeScript declarations
and the snapshot JSON Schema. [`docs/usage.md`](docs/usage.md) exercises the
full public API, and [`docs/compatibility.md`](docs/compatibility.md) lists what
is equivalent, renamed, partial or deliberately unsupported.

## Install

The npm package id is `quaternits`, but it is **not published yet**.
[`package.json`](package.json) keeps `"private": true` as an accidental-publish
safeguard until the owner performs a deliberate release,
so `npm install quaternits` does not resolve today. Without a host Node install,
use the toolkit to build and exercise the package against a disposable consumer:

```sh
make build           # emit dist/ (ESM + CJS + declarations)
make consumer-test   # pack the build and run Node ESM/CJS + TypeScript consumers
```

If you do have host Node, you can instead `npm pack` the build yourself; see
[`docs/usage.md`](docs/usage.md) for both routes.

## Honest limits

- **Not a complete engine.** Only the outcomes the rules authorize are reported:
  a lone active controller wins, and a two-active-controller stalemate or a
  unanimously accepted draw offer is a draw. Everything else stays `in-progress`
  instead of adjudicating a mate that no action produced.
- **No notation compatibility.** Long coordinates in, typed event records out;
  no FEN, PGN or SAN (spec 001/D4).
- **One provisional rule edge is open.** A checked controller that has
  **internal defensive moves but no safe publicly committable move** has no
  official outcome; only that edge fails closed with
  `UnresolvedAdjudicationError` instead of inventing one, while ordinary
  checkmate (a checked controller with no internal defenses) still applies
  (`001/D38`–`001/D41`,
  [`docs/rules/multiplayer-adjudication.md`](docs/rules/multiplayer-adjudication.md)).

## Quality gates

Every tool command runs inside a digest-pinned Node container through rootless
Podman, so the host needs only Podman, make, bash and git. `make test` enforces
**100% line and branch coverage** over `src/**` and `toolkit/**` (see
[`package.json`](package.json)), and the badges above cite that local gate, not
a CI service or Codecov. `make verify` runs every gate:

```sh
make verify  # fmt-check, lint, types, version-check, test (100% coverage),
             # audit, contract-check, docs-build, consumer-test, integration,
             # browser leg
```

That includes a real headless-Chromium leg, whose first run pulls a ~2.8 GB
Playwright base image once to build the project-owned browser image.

## Documentation site

The browsable documentation is a static [Astro](https://astro.build/) +
[Starlight](https://starlight.astro.build/) site under [`website/`](website).
`make docs-build` copies the canonical `docs/` pages into the site with their
links rewritten, builds it for the `/QuaterniTS/` base path inside the pinned
toolkit and verifies every page path, internal link, asset and canonical-source
marker; it is part of `make verify`. The site ships no game logic and no CDN
dependency.

To view the site locally, run `make docs-preview`. It rebuilds and re-verifies
the site with `make docs-build` and then serves the built output from a pinned
toolkit container at **<http://127.0.0.1:4321/QuaterniTS/>** — the `/QuaterniTS/`
base path, so that URL, not the bare port, is the site. The port is published on
loopback only and the server is foreground, so **Ctrl-C** stops it. It is
interactive and deliberately not part of `make verify`.

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds the same
verified artifact on pushes to `main` and manual dispatch, then deploys it with
the official Pages Actions. The site is published at
**<https://pboueke.github.io/QuaterniTS/>** — that URL serves content only after
the owner enables the repository's Pages **GitHub Actions** source
(**Settings → Pages → Build and deployment → Source: GitHub Actions**) and a
deployment succeeds. No GitHub Pages run has been observed yet.

## Learn more

- [`docs/usage.md`](docs/usage.md) — runnable public-API examples.
- [`docs/compatibility.md`](docs/compatibility.md) — chess.js-style matrix and the deliberate gaps.
- [`docs/fixtures/opening-position.md`](docs/fixtures/opening-position.md) — reviewed opening fixture and its source/exception table.
- [`docs/rules/`](docs/rules) — rule policy with source-linked expected-outcome fixtures, including the open edge in [`multiplayer-adjudication.md`](docs/rules/multiplayer-adjudication.md).
- [`docs/spec/README.md`](docs/spec/README.md) and [`spec.md`](docs/spec/active/001-adopt-quaternity/spec.md) — the spec workflow and the active library contract.
- [`toolkit/README.md`](toolkit/README.md) — the pinned toolchain and every gate target.
- [`website/`](website) — the Astro/Starlight documentation site ([live](https://pboueke.github.io/QuaterniTS/), once Pages is enabled).
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — prerequisites, rule policy and pull-request etiquette.
- [`AGENTS.md`](AGENTS.md) — working rules for coding agents.
- [`LICENSE`](LICENSE) — MIT, covering this project's original work only.
- **Official rules:** [basic rules](https://www.quaternity.com/play-quaternity) and [illustrated quick rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf); the [patent](https://patents.google.com/patent/US20150352433A1/en) supports them only.
