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

Small, pure, independently unit-tested modules. Each is one slice with its own
tests; none of them is an assembled engine:

- `src/board.ts` — the 12×12 coordinate vocabulary: files `a`–`l`, ranks
  `1`–`12`, army colours and piece types.
- `src/geometry.ts` — attack squares and pseudo-legal destinations for king,
  queen, rook, bishop and knight (Phase 2A).
- `src/pawn.ts` — pawn orientation, ordinary and advanced pawn state, one-square
  moves, captures, commitment and promotion (Phase 2).
- `src/position.ts` — the validated four-army position (occupancy, controller
  mapping, player status, turn) plus pure attack and check queries (Phase 3A).
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
- `src/fixtures/openingPosition.ts` — the reviewed 64-piece opening fixture the
  tests build on.

## What does not exist yet

- No assembled engine and no public API: there is no `Quaternity` class, no
  `src/index.ts` entry point and no export map, so the package cannot be
  consumed as a library yet.
- No committed action path, no history/undo and no versioned JSON snapshot
  persistence (spec 001/D10).
- No packaged consumer tests and no JSON schema/contract drift check
  (`contract-check`, `consumer-test` and `integration` are Phase 4 work and are
  intentionally absent rather than stubbed).
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
  moves instead. This policy does not complete the engine or authorize an
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
make audit       # block on unexcepted HIGH/CRITICAL npm advisories
make version-check # CHANGELOG.md version vs package metadata
make version-sync  # explicit rewrite of package version fields (never in verify)
make verify      # preflight + fmt-check + lint + types + version-check + test + audit
```

`CHANGELOG.md` is the only hand-edited version (spec 001/D7): it holds exact
`## <semver>` headings with typed semantic bullets (`feat:`, `fix:`, `chore:`,
`docs:`, …) below them, and its top heading is the version authority.
`make version-check` fails when the changelog is not in that format, or when
`package.json` or either version field of `package-lock.json` disagrees with the
authority; `make version-sync` is the explicit way to update exactly those
fields. `make verify` never rewrites files.

`make verify` runs only the gates that exist today. `contract-check`,
`consumer-test` and `integration` are Phase 4 work and are intentionally absent
rather than stubbed.

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
toolchain stays inside the digest-pinned image, so CI runs the same gate a
developer runs.

**No GitHub run has been observed yet.** The workflow is unproven until the
owner pushes it and watches a run; a green local `make verify` is not evidence
of a green CI run, and CI is a backstop rather than a substitute for the local
gate.

## Publishing

QuaterniTS is MIT-licensed and being prepared for open distribution. The npm
package id is `quaternits`; `package.json` keeps `"private": true` as a safeguard
against an accidental npm release, not a standing prohibition on publishing the
repository. The owner will remove that safeguard as part of a deliberate package
release (`001/D42`, `001/D43`). The library is not yet a complete engine or an
installable package; the packaged consumer and schema checks above remain to be
built, and the CI workflow stays unproven until the owner pushes it and watches
a run.
