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
- feat: add the guarded internal committed-move seam in `src/committedMove.ts` —
  the public committable set, an atomic commit, the board-less pass and the
  administrative freeze, with the
  001/D38 actor-safety filter and the fail-closed 001/D39–001/D41
  checked-successor guard (spec 001/D38–001/D41 as approved by 001/D44;
  `docs/rules/multiplayer-adjudication.md` §4–§5).
- feat: reject an already-unresolved position at load — the `Quaternity`
  constructor now applies the 001/D40(3) on-turn bound, so a position whose
  on-turn controller has internal moves but no public committable move throws
  `UnresolvedAdjudicationError` instead of being adopted, while a terminal
  position stays loadable and gains no invented outcome (spec 001/D40, 001/D41,
  001/D44). An unresolved state _reached_ through play still fails closed on
  every query.
- feat: add the administrative actions to `Quaternity` (spec 001/D45;
  `docs/rules/administrative-actions.md` §1–§2) — `proposeDraw()` by the
  on-turn player, `respondToDraw(player, accept)` by each other active player
  once, the read-only `pendingDraw()` snapshot, and `resign`,
  `recordTimeLoss` and `recordWalkover`, which may freeze any active target with
  no phantom mate/assimilation batch. A proposal and its votes change no turn; a
  pending offer expires inside the single move, pass or freeze event that ends it
  (so one `undo()` restores it with its recorded votes); a response against a
  non-pending offer is a stale vote rejected atomically; an on-turn freeze
  advances the turn clockwise, an off-turn freeze preserves it, and a remaining
  lone active controller wins. Every rejection — an already-inactive target, a
  terminal game, or a turn-advancing freeze vetoed by the existing
  001/D39–001/D41 guard — is atomic.
- feat: record draw offers/responses and freezes as typed frozen history events
  (`DrawProposalEvent`, `DrawResponseEvent`, `FreezeEvent`) and treat an agreed
  draw as terminal for board and administrative actions, while `undo()` and
  `reset()` still work.
- feat: add the bounded public `Quaternity` class in `src/quaternity.ts` and its
  `src/index.ts` entry point — opening or custom position, committable moves,
  commit/pass, history/undo/reset and only the rules-authorized results
  (spec 001/D25, 001/D35, 001/D45). The `[open]` checked-non-actor edge fails
  closed with `UnresolvedAdjudicationError` rather than an invented outcome
  (001/D44).
- feat: add the public attack/check queries `attackers(square, controller)`,
  `isAttacked(square, controller)` and `inCheck(player)` to `Quaternity`.
  Attacker records keep each attacking piece's square, retained army colour and
  controller, so an assimilated piece attacks for its controller while its army
  colour stays (spec 001/D33); a frozen controller's pieces exert no attacks but
  still block sliding rays (001/D26/001/D34). `inCheck` evaluates every king a
  controller owns (001/D31), and all three queries reject an unknown square or
  controller instead of answering an implicit no-attack
  (`docs/rules/multiplayer-adjudication.md` §0/§1/§3).
- feat: add the reviewed 64-piece opening fixture in
  `src/fixtures/openingPosition.ts`.
- docs: record the fixture's source and exception table in
  `docs/fixtures/opening-position.md`.
- docs: add the reviewed rules artifacts `docs/rules/pawn-vectors.md` and
  `docs/rules/multiplayer-adjudication.md`, plus the `docs/spec/` workflow that
  records each appended decision.
- docs: add `docs/rules/administrative-actions.md`, the source-linked
  expected-outcome table for the owner-approved draw-offer expiry and
  resign/time-loss/walkover freeze sequencing (spec 001/D45), and register it in
  spec 001's fixture list.
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
- build: emit the dual ESM/CommonJS package (`tsconfig.build.esm.json`,
  `tsconfig.build.cjs.json`) with per-module type declarations under `dist/`,
  and rewrite the relative `.ts` specifiers that `tsc` keeps in the emitted
  declarations to their emitted `.js` targets in
  `toolkit/scripts/finalize-build.mjs`, which also marks `dist/cjs` CommonJS.
- build: add the `package.json` export map with built ESM/CJS entry points and
  declarations, `main`/`module`/`types` fallbacks and `files: ["dist"]`, so the
  packed tarball ships no sources and `npm private`, the MIT license and the
  `0.1.0` version stay unchanged (`001/D15`, `001/D43`).
- test: add the real Node half of the built-package consumer test in
  `toolkit/scripts/consumer-test.sh` and `make consumer-test` — it builds, packs
  and installs the tarball in a disposable directory, then runs Node ESM, Node
  CommonJS and TypeScript declaration consumers that assert the reviewed opening
  position, a validated custom position, the guarded move seam and the absence
  of a source-only import fallback; the browser leg remains intentionally absent
  (`001/D18`).
- test: add `make integration` — the installed-package complete-game lifecycle
  gate. It reuses the consumer script's build/pack/install leg through an
  optional `--integration` argument (so the packaging logic exists once) and
  then runs `toolkit/consumers/integration-consumer.mjs` against the installed
  tarball: the §4 Fixture 4a four-active custom position is played into one real
  move whose snapshot batch mates two controllers, the next active controller
  loses on time (001/D45) to reach the winner, and the board, retained armies,
  controllers, statuses, history order/awards/selection, post-terminal atomic
  rejection, shipped schema subpath, V1 snapshot round trip, atomic invalid
  load, both `undo()` steps and `reset()` are asserted. It is a lifecycle
  fixture, not opening-derived reachability, and it decides nothing on the
  `[open]` checked-non-actor edge. The target stays outside `make verify` while
  the browser consumer leg is missing.
- test: extend the packaged consumers to exercise the administrative surface
  (`pendingDraw`/`proposeDraw`/`respondToDraw`/`recordTimeLoss`/`undo`/`reset`)
  and its shipped declarations (spec 001/D45).
- feat: add the versioned V1 JSON snapshot and its strict loader to
  `Quaternity` (spec 001/D10). `snapshot()` serializes the replay origin, the
  deterministic coordinate action log, the canonical event records — awards,
  captures, pawn transitions, explicit promotion choices and turn selections —
  and the resulting state with its pending offer, agreed draw and outcome;
  `loadSnapshot(value)` parses and validates the document, re-validates both
  positions through `createPosition`, replays the actions through the public API
  against a fresh instance and adopts the result **only** when the replayed state
  and event records agree with the serialized ones, so no serialized result is
  ever authoritative. Malformed documents, an unsupported version, unknown keys,
  invalid positions, illegal or duplicate actions, stale votes and any
  state/record mismatch are rejected atomically, and an unresolved loaded state
  fails closed with `UnresolvedAdjudicationError`.
- feat: ship `schema/quaternits-snapshot-v1.schema.json`, a strict draft
  2020-12 JSON Schema of the snapshot document, exported from the package and
  included in the packed tarball.
- test: add `make contract-check` and `toolkit/scripts/contract-check.ts`, a real
  contract gate over a pinned `ajv` dev dependency — it compiles the shipped
  schema and checks runtime-built snapshots plus the committed
  `toolkit/contract/valid`, `invalid` and `drift` fixtures for schema
  acceptance, runtime agreement and drift, failing loudly on a broken schema or
  an empty fixture set. It stays outside `make verify` while the browser gate is
  still missing.
- test: cover the snapshot contract with source-linked fixtures — §4 Fixtures 4a
  and 4b, §5 Fixture 5a, §6 Fixture 6 and the 001/D45 freeze/expiry cases, the
  custom promotion and advanced-pawn commitment cases, snapshot mutation
  isolation, load atomicity and the fail-closed unresolved load.
- test: extend the packaged Node ESM/CJS consumers with a snapshot round trip, a
  tampered-document rejection and the shipped schema export, and assert in
  `make consumer-test` that the schema reaches the packed tarball.
- build: export the snapshot schema from `package.json` and add `schema` to the
  package `files`, so the tarball still ships no sources.
- chore: add the pinned `ajv` dev dependency and update the frozen
  `package-lock.json` for the contract gate.
- docs: document the snapshot contract and the real `contract-check` gate in
  `README.md`, `toolkit/README.md` and `AGENTS.md`, and record the remaining
  browser-consumer gap.
- test: keep the new `integration` target/script wiring inside `make verify` by
  checking the `integration` npm script, the `--integration` consumer leg and the
  Makefile target in `toolkit/scripts/packageManifest.test.ts`, and update
  `README.md`, `toolkit/README.md`, `AGENTS.md` and `CHANGELOG.md` so
  `integration` is advertised as a real gate while the browser consumer leg
  stays honestly pending.
- test: add the real browser consumer gate `make browser-consumer` (spec
  001/D18, Phase 4). The `consumer-test` build/pack/disposable-install leg runs
  with `--browser` inside the digest-pinned official Playwright image, tagged as
  the project-owned `quaternits-browser:local` and derived by
  `toolkit/Containerfile.browser`, with `--network=none` and uid 1000; a real
  headless Chromium then loads the installed tarball's `dist/esm` over an import
  map served from the disposable install directory, so the browser can never
  fall back to sources. The page fixture asserts the 64-piece opening position,
  one committed opening move, an atomic illegal-move rejection, the V1 snapshot
  round trip, an atomic tampered-document rejection, the attack/check queries on
  a validated custom position and the fail-closed unresolved-position load. The
  driver fails loudly on a page error, a failed request, a console error, a
  failed assertion, a missing browser or a `playwright-core` version that does
  not match the image's Playwright driver.
- chore: add the exact `playwright-core` `1.63.0` dev dependency, matching the
  browser image's Playwright driver, and derive the project-owned
  `quaternits-browser:local` image in `toolkit/Containerfile.browser` from the
  vendor image's multi-arch manifest-list digest.
- build: run every real gate in `make verify` — `contract-check`,
  `consumer-test`, `integration` and `browser-consumer` now join the fast gates
  instead of staying outside the mandatory gate, so a green `make verify` means
  the packed-package, schema-contract and real-browser checks really ran.
- test: extend `toolkit/scripts/packageManifest.test.ts` to pin the browser
  gate's wiring inside `make verify` — the `browser-consumer` npm script and
  `--browser` leg, the `quaternits-browser:local` tag and digest-pinned
  `toolkit/Containerfile.browser`, the `--network=none` runner, the page
  fixture's real API assertions, the driver's image/version checks and the
  absence of a pending-gate advertisement.
- docs: document the browser gate in `README.md`, `toolkit/README.md` and
  `AGENTS.md`, including the `browser-image` target, the pinned browser image
  digest, the deliberate `--network=none` and non-root run, the image's pull
  cost and the still-unproven CI run.
- fix: close the real-browser driver's loopback server on **every** path. A
  `chromium.launch()` that failed, or a `browser.close()` that threw, used to
  skip `server.close()`; the leaked listening server kept the Node event loop
  alive, so `make browser-consumer` would hang until the surrounding tool gave up
  instead of failing. The launch now sits inside the guarded block and the server
  is closed in an outer `finally` that also releases leftover connections.
- test: add `toolkit/scripts/browser-consumer-failure-probe.sh`, run by the
  `--browser` leg of `consumer-test.sh` after the real browser run, which injects
  a launch failure and a failing browser close out of a disposable temporary
  `playwright-core` override and asserts each fails within a `timeout` bound with
  a loud `browser-consumer: FAILED — …` line, so that hang cannot come back
  silently. `toolkit/scripts/packageManifest.test.ts` pins the probe's wiring
  inside `make verify`.
- docs: add `docs/fixtures/opening-to-terminal-administrative-match.md`, the
  executed expected-outcome fixture (spec 001/D11) of one match from the reviewed
  opening position to a terminal winner. It records nine actions: one real
  committed coordinate move by each army, a draw proposal, the move that expires
  it and the three `001/D45` freezes. The document labels the result plainly as
  an **opening-to-terminal administrative match** — the winner comes from a
  freeze, not a mate — and states that it is **not a proof of opening-to-mate**,
  proves no assimilation from the opening, decides nothing for the `[open]`
  checked-non-actor edge and claims no complete engine. The fixture is
  registered in spec 001's fixture list; no decision record was added and no
  rule policy changed.
- test: add the opening-to-terminal administrative match to
  `src/quaternity.test.ts` as a full-match test with its source-linked fixture.
  It commits one publicly committable move per army from the reviewed opening
  position, offers a draw and expires it inside White's next move, then freezes
  Red on time, Black by resignation and Green by walkover into the lone-active
  winner; the terminal outcome, statuses and untouched 64-piece board, the
  terminal atomic rejection of every board and administrative action, the
  one-event undo (including the offer restored by undoing the expiry move), the
  V1 snapshot replay into a fresh instance and `reset()` are asserted. The
  document-sync test parses the fixture's own fenced JSON action log and its §3
  "Expected after" column and requires both to equal the actions and turn
  selections the engine recorded, so a wrong, missing or extra documented action
  fails the gate. No engine change was needed: the red step was the missing
  fixture document, and no code was invented for it.
- test: extend the installed-package integration consumer
  (`toolkit/consumers/integration-consumer.mjs`) with the same
  opening-to-terminal administrative match, so `make integration` now proves the
  published built package plays both complete-game lifecycles: the constructed
  §4 Fixture 4a mate-and-freeze lifecycle and the reviewed-opening administrative
  match with its offer expiry, undo coupling, snapshot replay and reset.
- docs: add `docs/usage.md` — concise runnable examples of the public API
  (opening position and committed moves, attack/check queries, an administrative
  finish, snapshot save/restore, draw offers with one-event undo, and error
  handling) — and `docs/compatibility.md`, the chess.js-style compatibility
  matrix for this four-player library, which marks each analogue as equivalent,
  renamed, partial or unsupported and restates that there is no SAN, FEN or PGN
  compatibility (001/D4). `toolkit/scripts/docs-examples.test.ts` executes every
  fenced `ts` example in both documents through a child Node process in
  `make test`, so a documented example that drifts from the real API fails the
  gate. Its install section states that the package is not yet published
  (`"private": true` until the owner performs a deliberate release), that
  `npm install quaternits` applies only after that release and that checkout
  users build and pack locally with `make build`/`npm pack` or exercise the
  packed package through `make consumer-test`; it asks for no npm publish. The
  documents are linked from `README.md`.
