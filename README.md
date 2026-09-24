# QuaterniTS

**QuaterniTS is an unofficial, community-driven headless TypeScript library for
Quaternity, a four-player chess-inspired game. It is not affiliated with,
sponsored by, or endorsed by the rights holders of the official Quaternity game
or project.**

The MIT license in [`LICENSE`](LICENSE) covers this project's original work,
not third-party names, rules text, trademarks, artwork or other assets. This
repository uses no official logos or visual assets.

**Free of charge, no monetization.** As a project intention, QuaterniTS is
developed and offered free of charge: no advertisements, no paywalls, no paid
or gated access and no other project monetization. This is an intention about
this project's own development and distribution, not a license condition or a
binding commitment, and it promises nothing about a release date. It is
**not** a restriction on anyone's rights under the MIT license, which permits
recipients to use, copy, modify, merge, publish, distribute, sublicense and/or
sell copies of this project's original code. It asserts no right or clearance
regarding any third-party game name, rules text, trademark, artwork or other
asset.

The library is headless: it generates and validates legal moves, holds a
position and reports game state. It is inspired by chess.js's ergonomic API but
claims no chess.js, FEN, PGN or SAN compatibility (spec 001/D4). It is not a UI,
server, AI or board renderer.

## What exists today

Small, independently unit-tested modules plus one bounded public façade over
them. Each is one slice with its own tests; together they are still not a
complete engine:

- `src/board.ts` — the 12×12 coordinate vocabulary: files `a`–`l`, ranks
  `1`–`12`, army colours and piece types.
- `src/geometry.ts` — attack squares and pseudo-legal destinations for king,
  queen, rook, bishop and knight (Phase 2A).
- `src/pawn.ts` — pawn orientation, ordinary and advanced pawn state, one-square
  moves, captures, commitment and promotion (Phase 2).
- `src/position.ts` — the validated four-army position (occupancy, controller
  mapping, player status, turn) plus pure attack and check queries (Phase 3A).
  `createPosition` is the single validator authority for a custom position.
- `src/legalMoves.ts` — legal moves for one controller and pre-adjudication move
  application (Phase 3B). This is the internal pre-adjudication set used by mate
  detection, not the public committed move set (spec 001/D38–001/D41).
- `src/mate.ts` — king-by-king checkmate detection, including hypothetical
  defenses for a frozen player (Phase 3C).
- `src/batchAdjudication.ts` — the pure snapshot/batch mate adjudication driver
  (Phase 3D).
- `src/assimilation.ts` — the pure assimilation transfer unit (Phase 3D1).
- `src/turn.ts` — the pure internal turn-order and last-active-winner selector
  over a caller-supplied status map (spec 001/D35). It skips frozen and
  eliminated players, returns the sole active controller as the winner and
  rejects the zero-active state rather than fabricating a draw; it is not the
  committed turn path.
- `src/committedMove.ts` — the guarded internal committed-action seam: the
  public committable set, an atomic commit, the board-less pass, the
  `resign`/`recordTimeLoss`/`recordWalkover` freeze and the on-turn load bound
  (spec 001/D38–001/D41 as approved by 001/D44; 001/D45).
- `src/quaternity.ts` — the bounded public `Quaternity` class: opening or
  custom position, committable moves, commit/pass, history/undo/reset, draw
  offers/responses and the three freeze actions (001/D45), the
  attack/check queries `attackers(square, controller)`,
  `isAttacked(square, controller)` and `inCheck(player)`, and only the results
  the rules authorize (spec 001/D25, 001/D35, 001/D45). An attacker record keeps
  the attacking piece's square, retained army colour and controller, so an
  assimilated piece attacks for its controller while its army colour stays
  (001/D33); a frozen controller's pieces exert no attacks but still block
  sliding rays (001/D26/001/D34), and `inCheck` evaluates every king a controller
  owns (001/D31) (`docs/rules/multiplayer-adjudication.md` §0/§1/§3). All three
  queries reject an unknown square or controller instead of answering an
  implicit no-attack. The class re-validates and isolates any position it is
  given through `createPosition`, refuses to adopt an already-unresolved one at
  load (001/D40(3)), hands out frozen copies of its state and history events,
  and round-trips its whole state through the versioned V1 JSON snapshot below.
- `src/snapshot.ts` — the versioned V1 JSON snapshot (spec 001/D10): the replay
  origin, the deterministic coordinate action log, the canonical event records
  (awards, captures, pawn transitions, promotion choices, turn selections) and
  the resulting state, plus the strict document parser.
  `Quaternity.snapshot()` writes it; `Quaternity.loadSnapshot(value)` parses it,
  re-validates both positions through `createPosition`, **replays the actions
  through the public API** and adopts the result only when the replayed state and
  event records agree with the serialized ones, so a serialized result is never
  trusted as authority. A malformed document, an unsupported version, an unknown
  key, an invalid position, an illegal or duplicate action, a stale vote and any
  mismatch are rejected atomically; an unresolved document state fails closed
  with `UnresolvedAdjudicationError`.
- `schema/quaternits-snapshot-v1.schema.json` — the strict draft 2020-12 JSON
  Schema of that document, shipped with the package and exercised by
  `make contract-check`.
- `src/index.ts` — the library entry point, re-exporting that class, the
  `createPosition` validator, the snapshot version and the public types of their
  surfaces. The build emits it to `dist/esm` and `dist/cjs`, and the
  `package.json` export map points consumers at those built entry points plus the
  shipped schema.
- `src/fixtures/openingPosition.ts` — the reviewed 64-piece opening fixture the
  tests build on.

## What does not exist yet

- No complete engine, and only a **partial** public API. `src/index.ts` exposes
  the bounded `Quaternity` class and the `createPosition` validator with its
  `PositionInput`/`PlacedEntry` types, and `package.json` exports the built ESM
  and CommonJS entry points with their declarations, so the packed package can
  be consumed as an installed Node library (`make build`, `make consumer-test`).
  The class reports a result only for the three cases the rules authorize — a
  lone active controller wins (`001/D35`), a two-active-controller stalemate is
  a draw (`001/D25`) and a unanimously accepted draw offer is a draw (`001/D45`)
  — and reports `in-progress` elsewhere instead of adjudicating a mate that no
  action produced.
- Every executable gate of the packed-package contract now exists and runs in
  `make verify`: `make consumer-test` really builds the package, packs it,
  installs the tarball in a disposable directory and runs Node ESM, Node
  CommonJS and TypeScript declaration consumers against it, including a snapshot
  round trip; `make integration` installs the same tarball and plays a compact
  complete-game lifecycle fixture (validated custom position, snapshot batch
  mate, freeze, winner, snapshot round trip, atomic invalid load, undo and
  reset) against it; `make contract-check` really compiles the shipped schema
  and checks runtime snapshots plus committed valid/invalid/drift fixtures; and
  `make browser-consumer` loads the same installed tarball in a real headless
  Chromium through an import map in an offline container. Its first run pulls a
  ~2.8 GB Playwright base image once to build the project-owned
  `quaternits-browser:local` image.
- No proven continuous integration: `.github/workflows/ci.yml` runs the same
  gate on a fresh checkout, but no GitHub run has been observed yet, and the
  opt-in hooks in `.githooks/` are installed only by the explicit host-side
  `make install-hooks` target, never automatically.
- No release automation yet: `CHANGELOG.md` holds `0.1.0` and
  `make version-check` enforces version drift. The npm `private` flag prevents
  accidental package publication until the owner deliberately prepares a release
  (`001/D43`).
- The checked-non-actor adjudication edge has no established game outcome
  (`001/D38`–`001/D41`). Its software policy fails closed with
  `UnresolvedAdjudicationError` for a checked successor or an on-turn empty
  public set with internal moves; ordinary actor-safety rejections are illegal
  moves instead. The same on-turn state is rejected **at load**, and no outcome
  is invented for it. This policy does not complete the engine or authorize an
  invented game outcome.

## Reviewed rules artifacts

Rules authority is the official basic rules and the official illustrated quick
rules, in that order; the patent is supporting evidence only and never overrides
them (spec 001/D2, 001/D9). Ambiguous cases are resolved by appended spec decisions with
source-linked expected-outcome tables and tests written before the code (001/D11).

- `docs/fixtures/opening-position.md` — the reviewed 64-piece opening fixture
  and its source/exception table (delegated review, 001/D24).
- `docs/rules/pawn-vectors.md` — the Phase 2 pawn movement expected-outcome
  table (owner-delegated policy, 001/D28/001/D29).
- `docs/rules/multiplayer-adjudication.md` — the Phase 3 adjudication policy
  table (001/D30–001/D41), including the `[open]` edge above and its fail-closed guard.
- `docs/rules/administrative-actions.md` — the owner-approved draw-offer expiry
  and freeze-sequencing table for `proposeDraw`/`respondToDraw` and the three
  freeze actions (001/D45, §6/§7 of the adjudication table).
- `docs/spec/README.md` — the spec workflow.
- `docs/spec/active/001-adopt-quaternity/spec.md` — the concise library contract;
  its `decisions.md` records citable `001/D<n>` decisions.
- `AGENTS.md` — the working rules for this repository.
- `toolkit/README.md` — the toolchain's purpose, gates and replacement path.

## Toolchain

Every tool command runs inside the digest-pinned Node 24 toolkit image through
rootless Podman. The host needs only Podman, make, bash and git, and no host
Node install (spec 001/D5). These targets are the local gate:

```sh
make help        # list available targets
make preflight   # fail loudly unless rootless Podman is usable
make fmt-check   # Prettier check
make lint        # ESLint
make types       # tsc --noEmit
make test        # node --test with the 100% line/branch coverage gate
make build       # emit the dual ESM/CJS package and declarations into dist/
make consumer-test # pack the build and run Node ESM/CJS + TypeScript consumers
make integration # pack the build and run the installed-package lifecycle fixture
make browser-consumer # pack the build and run it in a real browser (headless Chromium)
make browser-image # build the pinned browser image (large: one Playwright base pull)
make contract-check # runtime snapshots and fixtures vs the shipped JSON Schema
make audit       # block on unexcepted HIGH/CRITICAL npm advisories
make version-check # CHANGELOG.md version vs package metadata
make version-sync  # explicit rewrite of package version fields (never in verify)
make verify      # preflight + fmt-check + lint + types + version-check + test
                 # + audit + contract-check + consumer-test + integration
                 # + browser-consumer: every real gate
```

`CHANGELOG.md` is the only hand-edited version (spec 001/D7): it holds exact
`## <semver>` headings with typed semantic bullets (`feat:`, `fix:`, `chore:`,
`docs:`, …) below them, and its top heading is the version authority.
`make version-check` fails when the changelog is not in that format, or when
`package.json` or either version field of `package-lock.json` disagrees with the
authority; `make version-sync` is the explicit way to update exactly those
fields. `make verify` never rewrites files.

`make verify` runs every gate that exists, including the packed-package ones:
preflight, formatting, lint, types, version check, tests with the 100 %
coverage gate, the dependency audit, `contract-check`, `consumer-test`,
`integration` and `browser-consumer`. A green `make verify` therefore does imply
that the packed package really works for Node and browser consumers and that the
snapshot schema still matches the runtime. `make consumer-test`
is the real Node half of the built-package consumer test: it builds, packs,
installs the tarball in a disposable directory and runs Node ESM, Node CommonJS
and TypeScript declaration consumers, asserting the reviewed opening position, a
validated custom position, the guarded move seam, a versioned V1 snapshot round
trip and that no source-only import fallback exists. `make integration` reuses
that build/pack/install leg (an optional `--integration` argument to the same
script, so packaging logic exists once) and then runs one compact complete-game
lifecycle fixture against the installed tarball: a validated four-active custom
position (`docs/rules/multiplayer-adjudication.md` §4 Fixture 4a) is played into
one real mate batch that removes two controllers, the next active controller
loses on time, and the winner, retained armies, controllers, statuses, history
awards, post-terminal rejection, shipped schema subpath, snapshot round trip,
atomic invalid load, both `undo()` steps and `reset()` are asserted. It is a
lifecycle fixture, not a claim that the official opening position can reach that
custom position. `make contract-check`
compiles `schema/quaternits-snapshot-v1.schema.json` (draft 2020-12) with the
pinned `ajv` dev dependency and checks that runtime-built snapshots and the
committed `toolkit/contract/valid` fixtures are schema-accepted, load and reload
byte-identically, that every `toolkit/contract/invalid` fixture is rejected by
both the schema and the loader, and that every `toolkit/contract/drift` fixture
stays schema-valid while the loader rejects it (the drift sentinel).
`make browser-consumer` runs the same build/pack/install leg with `--browser`
inside the pinned browser image and then loads the installed tarball's `dist/esm`
in a real headless Chromium through an import map, asserting the opening
position, a committed opening move, the snapshot round trip, the attack/check
queries and the atomic rejections in a browser; the container has no network, so
the page can only load the installed package. The leg then runs
`toolkit/scripts/browser-consumer-failure-probe.sh`, which injects a Chromium
launch failure and a failing browser close through a disposable temporary
`playwright-core` override and asserts the driver still exits non-zero within a
`timeout` bound with a loud failure instead of hanging on a leaked loopback
server.

`make preflight` runs `toolkit/scripts/preflight.sh` and fails loudly when
`podman` is missing, when `podman info` cannot report a rootless runtime, or
when Podman is not rootless. It verifies a usable rootless Podman, not that the
pinned image runs; `make verify` starts with it and then executes the image for
every gate, so an unusable container runtime stops the gate instead of skipping
a check.

### Opt-in git hooks

`.githooks/pre-commit` runs `make preflight fmt-check lint types version-check`
for fast feedback, so changelog/version drift is caught at commit (spec
001/D19), and `.githooks/pre-push` runs the full `make verify`. They are opt-in
and installed explicitly from the repository root by a host-side target that
needs no Podman:

```sh
make install-hooks                        # enable (repo-local core.hooksPath)
git config --local --unset core.hooksPath # disable
```

`make install-hooks` runs `toolkit/scripts/install-hooks.sh` and sets only the
repo-local `core.hooksPath` (never global or system). It succeeds when
`.githooks` is already active, refuses to overwrite a different local hooks
path, and fails without mutating a directory that is not a Git repository.

### Continuous integration (UNPROVEN)

`.github/workflows/ci.yml` runs for pull requests and pushes to `main`. It
checks out a fresh tree, installs only the rootless Podman host prerequisite
with apt, then runs `make preflight` and `make verify` as the unprivileged
runner user. It requests `contents: read`, uses no secrets and declares no
service stack, and it never installs Node or runs npm on the runner: the whole
toolchain stays inside the digest-pinned images, so CI runs the same gate a
developer runs. That includes the browser leg, so a fresh runner pulls the
~2.8 GB Playwright base image once to build `quaternits-browser:local` before
`browser-consumer` can run.

**No GitHub run has been observed yet.** The workflow is unproven until the
owner pushes it and watches a run; a green local `make verify` is not evidence
of a green CI run, and CI is a backstop rather than a substitute for the local
gate.

## Publishing

QuaterniTS is MIT-licensed and being prepared for open distribution. The npm
package id is `quaternits`; `package.json` keeps `"private": true` as a safeguard
against an accidental npm release, not a standing prohibition on publishing the
repository. The owner will remove that safeguard as part of a deliberate package
release (`001/D42`, `001/D43`). The library is not yet a complete engine; its
Node-consumable build, its installed-package lifecycle, its snapshot contract
and its real-browser leg are proven by
`make consumer-test`, `make integration`, `make contract-check` and
`make browser-consumer`, and the CI workflow
stays unproven until the owner pushes it and watches a run.
