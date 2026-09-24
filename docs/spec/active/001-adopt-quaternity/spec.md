# 001 — QuaterniTS rules library

QuaterniTS is an unofficial, community-driven, headless TypeScript library for
Quaternity. It models the four-player 12 × 12 game; it does not provide a UI, server,
clock, opponent or board renderer. The API may resemble chess.js where useful, but
chess.js notation, data formats and rules are not compatibility promises. This
specification describes the intended library and release checks, not features already
shipped.

The [numbered decisions](decisions.md) (`001/D1`–`001/D45`) are the current decision
index. Source-linked examples and detailed rule fixtures live in
[`docs/fixtures/opening-position.md`](../../../fixtures/opening-position.md),
[`docs/fixtures/opening-to-terminal-administrative-match.md`](../../../fixtures/opening-to-terminal-administrative-match.md)
(the executed match from that opening to the owner-approved `001/D45`
administrative finish — the full-match fixture, **not** a proof of
opening-to-mate),
[`docs/rules/pawn-vectors.md`](../../../rules/pawn-vectors.md),
[`docs/rules/multiplayer-adjudication.md`](../../../rules/multiplayer-adjudication.md),
[`docs/rules/administrative-actions.md`](../../../rules/administrative-actions.md)
and [`docs/rules/d38-coordinate-search.md`](../../../rules/d38-coordinate-search.md).
When these disagree with an older provisional decision, use the later correction and the
current policy. Cite decisions as `001/D<n>`.

## Rules and model

- **Authority:** the [official basic rules](https://www.quaternity.com/play-quaternity)
  and
  [illustrated quick rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf)
  govern; the [patent](https://patents.google.com/patent/US20150352433A1/en) is
  supporting evidence only. A reviewed 64-piece fixture transcribes the official opening
  illustration and tutorial data, including four kings and eight advanced central pawns.
  Record any source ambiguity rather than inventing a two-player chess rule (`001/D2`,
  `001/D9`, `001/D24`).
- **Identity:** pieces retain their original army colour and pawn orientation after
  assimilation. Controllers own turns and may command several armies; players may be
  active, frozen or eliminated. Turns advance clockwise from White to the next active
  controller, one action at a time.
- **Moves:** orthodox non-pawn geometry on the 12 × 12 board; no castling. Pawns move
  one square, never double-step or en passant. Ordinary pawns capture on both forward
  diagonals. Advanced central pawns choose and keep a direction when they leave their
  central main diagonal; a capture toward the centre leaves them uncommitted, while a
  side capture commits to a direction **from its landing square**. Promotion is an
  explicit same-army queen, rook, bishop or knight choice at the applicable edge
  (`001/D28`, `001/D29`).
- **Safety and adjudication:** check uses hostile **controllers**, not merely piece
  colours; every king owned by the moving controller must remain safe. Kings cannot be
  captured directly. A mate is credited to the player completing the position, including
  indirect mate. Evaluate all on-board kings, including frozen kings under hypothetical
  active defence, in atomic snapshot batches; then resolve cascades. If a controller
  survives with another king, only the mated king's army transfers. If it loses its last
  king, all its controlled armies transfer, with piece-level deduplication (`001/D26`,
  `001/D30`–`001/D38`). Frozen non-king pieces remain inert, blocking and capturable. A
  two-active-player stalemate is a draw; with more than two active players an immobile,
  non-mated player may pass. A lone active controller wins. Draw offers require the
  active turn and unanimous acceptance, and a pending offer expires on the next move or
  pass or when a participant is frozen; `resign`/time loss/walkover may freeze any active
  target with the `001/D45` turn and undo sequencing; administrative actions after game
  over are rejected.
- **Unresolved game edge:** the official outcome for a controller with a nonempty
  internal pre-batch defence set but no safe public committed move remains unknown. The
  decided software policy is fail-closed, not a fabricated mate, pass or draw.
  `UnresolvedAdjudicationError` is reserved for the checked-successor guard or an
  on-turn nonempty internal set with an empty public set; an actor-safety rejection is
  an ordinary illegal move. The guard is checked after **every** turn-advancing action
  (including a pass without a phantom batch), only when the next active controller is
  checked. An unchecked successor is not vetoed; its own on-turn unresolved state fails
  closed. Internal moves must not be advertised as committable. The owner approved
  this fail-closed handling and authorized the bounded, guarded implementation to
  proceed test-first; the **official game rule for the edge stays open** and no
  complete game-rule coverage is claimed. `UnresolvedAdjudicationError` is a software
  error, never a game outcome. The complete-engine claim remains withheld; this is a
  **rules/completeness limitation**, not a prohibition on making the repository public
  (`001/D38`–`001/D41`, `001/D44`).

An ambiguous gameplay policy needs an official source or clearly labelled inference, a
reviewed coordinate/algorithmic expected-outcome fixture and a failing test before
implementation. Do not silently substitute ordinary chess rules (`001/D11`).

## Library contract

- Provide a `Quaternity` class, typed pieces/moves/status/events, legal move enumeration
  and commit, attack/check queries, pass/resign/time-loss/walkover/draw actions,
  validated opening and custom positions, history/undo and reset. Illegal input and
  invalid actions must be atomic. Public `moves()` must report **committable** moves,
  not the internal mate-oracle set; document analogous and deliberately unsupported
  chess.js methods.
- Define deterministic unambiguous long-coordinate actions and a versioned JSON snapshot
  with a schema, strict load validation, an event log, replay and full undo. Preserve
  controllers, army colours, advanced-pawn direction, statuses, votes and outcomes. No
  exposed mutable board may bypass validation. Invalid snapshots and replays leave the
  current instance unchanged (`001/D10`).
- Package strict TypeScript declarations and a documented export map for Node ESM/CJS
  and browser consumers; no filesystem, network or Node-only runtime dependency in move
  calculation. Tests import the built package as a consumer, not just source.

## Tooling and delivery

The local toolchain is a digest-pinned Node image in rootless Podman with `npm ci` from
a frozen lockfile. Its image and cache names begin `quaternits-`. `make verify` checks
formatting, lint, types, version drift, tests/coverage and the fail-closed HIGH/CRITICAL
dependency audit; add real `contract-check`, `consumer-test` and installed-package
integration gates before claiming those checks pass. Require **100% line and branch
coverage**, including detection of source files omitted from test imports. Git hooks
provide fast feedback; GitHub Actions must execute the same toolkit gate against a fresh
checkout. Do not weaken a gate or invent a green CI result (`001/D5`–`001/D8`,
`001/D12`, `001/D18`, `001/D19`).

Use `CHANGELOG.md`'s top `## <semver>` heading as the single authored version, initially
`0.1.0`; version sync is explicit. Ship examples, compatibility matrix, rule/fixture
provenance, snapshot schema, public types and consumer smoke tests. The package is
MIT-licensed for this project's original work, unofficial and intended for open
distribution. `private: true` remains a temporary guard against accidental npm
publication until the owner performs a deliberate release step; **publication is not
blocked by a standing name/trademark/license approval gate**. Do not imply that MIT
grants third-party game-name, rulebook or asset rights (`001/D42`, `001/D43`).

## Completion criteria

Before describing the engine as complete: prove the opening fixture, movement, pawn
directions, assimilation, frozen kings, mate batches, passes/draws and the unresolved
edge against executable fixtures; ship the committed-action API, history/undo,
snapshots/replay and a full-match test; pass local and CI toolkit gates, built-package
ESM/CJS/browser consumers and schema-drift checks from a fresh supported checkout. Do
not archive spec 001 until these checks and the stated API contract hold. Publishing the
**repository** and claiming a **complete game engine** are separate decisions; the open
rule edge must not acquire an invented game outcome, and only the bounded, guarded path
is authorized (`001/D44`).

## Tracker

none
