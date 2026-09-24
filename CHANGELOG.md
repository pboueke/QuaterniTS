## 0.1.0

- feat: add the 12×12 coordinate vocabulary in `src/board.ts` — files `a`–`l`,
  ranks `1`–`12`, army colours and piece types.
- feat: add pseudo-legal movement and attack squares for king, queen, rook,
  bishop and knight in `src/geometry.ts`.
- feat: add pawn orientation, ordinary and advanced pawn state, one-square
  moves, captures, direction commitment and promotion in `src/pawn.ts`.
- feat: add the validated four-army position — occupancy, controller mapping,
  player status and turn — plus pure attack and check queries in
  `src/position.ts`.
- feat: add internal pre-adjudication legal moves for one controller in
  `src/legalMoves.ts`.
- feat: add king-by-king checkmate detection in `src/mate.ts` and the pure
  snapshot/batch mate adjudication driver in `src/batchAdjudication.ts`.
- feat: add the assimilation transfer unit in `src/assimilation.ts`.
- feat: add the pure internal turn-order and last-active-winner selector in
  `src/turn.ts`, advancing clockwise from White over the frozen/eliminated
  players and rejecting the zero-active state instead of fabricating a draw
  (spec 001/D35; `docs/rules/multiplayer-adjudication.md` §7 Fixture 7/7b).
- feat: add the reviewed 64-piece opening fixture in
  `src/fixtures/openingPosition.ts`.
- docs: record the fixture's source and exception table in
  `docs/fixtures/opening-position.md`.
- docs: add the reviewed rules artifacts `docs/rules/pawn-vectors.md` and
  `docs/rules/multiplayer-adjudication.md`, plus the `docs/spec/` workflow that
  records each appended decision.
- docs: record the rules authority order — official basic rules, then the
  official illustrated quick rules, with the patent as supporting evidence only
  — so no two-player chess convention is inherited silently (spec 001/D2, 001/D9).
- chore: add the reproducible toolkit under `toolkit/` — a digest-pinned Node 24
  rootless Podman image, `npm ci` from the committed `package-lock.json`, and
  independently runnable `fmt-check`, `lint`, `types`, `test` and `audit`
  targets orchestrated by `make verify`.
- chore: enforce 100% line and branch coverage over `src/**` and `toolkit/**`
  with the Node test runner, plus `toolkit/scripts/sourceInventory.test.ts`
  failing when a source file is not reachable from the test suite.
- chore: add the dependency-audit gate in `toolkit/scripts/audit.ts` that blocks
  unexcepted HIGH/CRITICAL advisories with a reason-plus-expiry exception list
  and fails loudly when no real audit report can be obtained.
- chore: add the version-authority checker in `toolkit/scripts/version.ts` with
  the `make version-check` and explicit `make version-sync` targets, so package
  metadata is derived from this changelog instead of a second hand-edited
  version.
- chore: adopt the QuaterniTS identity, npm name `quaternits`, MIT license and
  `git@github.com:pboueke/QuaterniTS.git` origin (`001/D42`).
- chore: prepare for open distribution while keeping npm `"private": true`
  until the deliberate package-release step; use `quaternits-` toolkit image
  and cache names (`001/D43`).
- docs: publish the unofficial, community-driven disclaimer, original-work
  license scope and free, non-monetized project intention (`001/D42`).
- docs: make spec 001 and its numbered decisions concise and citable.
- fix: mark the pre-adjudication legal-move set as internal rather than the
  public committed move set (spec 001/D38).
- fix: let the official illustrated quick rules govern the opening fixture's
  corner colours, over the patent's contradictory corner and pawn listings
  (spec 001/D2, 001/D9).
- fix: re-check the pawn capture and advanced-pawn commitment vectors against
  the official tutorial examples after independent review, and apply the
  findings to `docs/rules/pawn-vectors.md` (spec 001/D28, 001/D29).
- ci: add `.github/workflows/ci.yml`, which checks out a fresh tree on pull
  requests and pushes to `main`, installs only the rootless Podman host
  prerequisite, and runs `make preflight` plus the same `make verify` gate with
  `contents: read`, no secrets and no service stack (spec 001/D8, 001/D12).
- chore: add the rootless Podman preflight in `toolkit/scripts/preflight.sh`
  and start `make verify` with it, so an unusable container runtime fails
  loudly instead of skipping a check.
- chore: add the opt-in Bash hooks `.githooks/pre-commit` (preflight,
  formatting, lint, types, changelog/version check) and `.githooks/pre-push`
  (full `make verify`), installed explicitly with the host-side
  `make install-hooks` target (spec 001/D19).
- test: cover the preflight's fail-closed outcomes, the hooks' syntax, mode and
  invoked targets, and the workflow's YAML structure under `toolkit/scripts/`.
- docs: document the workflow and the opt-in hooks in `README.md` and
  `toolkit/README.md`, and record that no GitHub run has been observed yet.
- chore: add the host-side `make install-hooks` target and
  `toolkit/scripts/install-hooks.sh`, which opt a checkout into the
  version-controlled `.githooks` through a repo-local `core.hooksPath`; the
  installer is idempotent, refuses to overwrite a different hooks path and never
  reads or writes global or system config, and it needs no Podman.
