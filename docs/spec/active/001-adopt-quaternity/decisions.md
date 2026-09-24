# 001 — Decisions

This is the concise **current** decision index for [spec 001](spec.md). IDs stay stable;
later entries refine earlier ones. Source-linked fixtures supply detailed examples, not
alternate rules. No historical review transcript is retained in this document. Cite a
decision as `001/D<n>`; add future decisions without renumbering existing IDs.

## Product and delivery

- **001/D1** — Start a fresh repository and adopt selected reference-template practices,
  not its service code or history.
- **001/D2** — Official basic and illustrated rules take precedence; the patent only
  supports them. Resolve ambiguities explicitly.
- **001/D3** — Build a complete headless four-player TypeScript rules library, not an
  app, service or AI.
- **001/D4** — Use chess.js-like ergonomics where meaningful, without claiming FEN, PGN,
  SAN or two-player API parity.
- **001/D5** — Use a digest-pinned, rootless Podman/Node toolkit with a frozen npm
  lockfile; no host Node requirement.
- **001/D6** — Require 100% line and branch coverage over product and toolkit source,
  including unimported-file detection.
- **001/D7** — Keep `CHANGELOG.md` as the new `0.1.0` version authority. The provisional
  identity and license are superseded by `001/D42`; publication policy by `001/D43`.
- **001/D8** — Use GitHub Actions as the backstop to local hooks, running the same
  toolkit gate; tracker is none.
- **001/D9** — The official opening illustration governs the reviewed, 64-piece golden
  fixture over conflicting patent prose; see
  [`opening-position.md`](../../../fixtures/opening-position.md).
- **001/D10** — Persist with strictly validated versioned JSON snapshots and
  deterministic coordinate/event logs, not variant FEN or PGN.
- **001/D11** — Before implementing an ambiguous rule, record a source-linked reviewed
  outcome fixture and a failing test; never silently inherit chess rules.
- **001/D12** — Prove that the pinned local toolkit runs in CI; an unavailable runner is
  not permission to bypass it.
- **001/D13** — Write original library code; provisional identity/license and a blanket
  publication hold are superseded by `001/D42` and `001/D43`.
- **001/D14** — Make `src/` a TypeScript rules library and test suite.
- **001/D15** — Replace the HTTP/OpenAPI contract with a JSON snapshot schema and
  package contract tests.
- **001/D16** — Keep active/archive specs and stable, citable numbered decisions;
  archive only when the contract holds. The owner-approved readability rewrite
  establishes this concise index; future entries remain additive.
- **001/D17** — Use disposable Podman/Node tools rather than a copied Python toolchain.
- **001/D18** — Test built-package Node ESM/CJS and browser consumers instead of a live
  HTTP stack.
- **001/D19** — Provide make-backed hooks, changelog checks and fail-closed dependency
  audit, with CI as the backstop.
- **001/D20** — No application container, service stack or deployment driver.
- **001/D21** — Defer agent sandbox/proxy/broker infrastructure; if introduced, preserve
  least privilege.
- **001/D22** — Use portable `AGENTS.md`; agents do not commit, push, tag or revert.
- **001/D23** — Do not introduce inherited reference-template product identifiers into
  this repository.

## Fixtures and rules

- **001/D24** — Accept the opening fixture on delegated evidence: 64 tutorial facts
  match, pictured corners match and an independent review found no blocking issue. See
  [`opening-position.md`](../../../fixtures/opening-position.md).
- **001/D25** — With exactly two active controllers, stalemate is a draw (official
  tutorial chapter 21); with more than two, an immobile non-mated player may pass.
- **001/D26** — Frozen pieces neither move nor exert ordinary attacks/defences; evaluate
  a frozen king's hypothetical active defence for checkmate (official tutorial chapters
  18–20).
- **001/D27** — Do not infer unaddressed multiplayer outcomes; mark them open and
  document/verify a policy before claiming that game outcome. Later entries decide
  specific cases.
- **001/D28** — Ordinary pawns capture on both forward diagonals. Advanced pawns retain
  choice after a central diagonal capture, commit to the unique direction on a side
  capture, rotate symmetrically by corner and promote on the relevant far edge. See
  [`pawn-vectors.md`](../../../rules/pawn-vectors.md); `001/D29` corrects the
  side-capture wording.
- **001/D29** — Side-capture commitment is a **direction from the landing square**,
  never the original file or rank: White `d4×c5` continues up from `c5`, while `d4×e3`
  continues right from `e3`.
- **001/D30** — Credit mates to the player completing an action; adjudicate snapshot
  batches and repeat for cascades in fixed White/Red/Black/Green order.
  `001/D32`–`001/D37` refine scope and transfer semantics.
- **001/D31** — A controller with multiple kings must keep **every** controlled king
  safe; evaluate each king's mate independently, using the internal pre-batch legal-move
  oracle. See
  [`multiplayer-adjudication.md`](../../../rules/multiplayer-adjudication.md).
- **001/D32** — Each snapshot batch includes frozen kings under hypothetical defence;
  award **all** mates in that snapshot before removing/transferring anything, then
  re-evaluate for cascades.
- **001/D33** — A king's **current controller**, not its retained army colour,
  determines mate evaluation and all-kings safety, including assimilated kings.
- **001/D34** — A frozen non-king piece is an inert, capturable line-blocker. Kings are
  never captured directly; frozen kings are removed only by mate.
- **001/D35** — One active controller wins immediately. Reject post-terminal
  administrative actions and in-progress snapshots with zero active controllers; do not
  fabricate a draw.
- **001/D36** — If a controller survives a king's mate, transfer only that mated king's
  retained-colour army to the actor; other controlled armies remain. `001/D37` governs
  last-king loss.
- **001/D37** — If a batch removes a controller's last king, transfer **all** armies it
  still controls (including assimilated kingless pieces) to the actor, each piece once;
  determine survival from the full snapshot.
- **001/D38** — Reject a candidate action atomically as an **ordinary illegal move** if
  its hypothetical complete mate cascade removes any acting-controller king or leaves
  one in hostile check. The internal pre-batch defence set is not the public committable
  set; `001/D39`–`001/D41` define the unresolved-successor policy. See
  [`multiplayer-adjudication.md`](../../../rules/multiplayer-adjudication.md) Fixture
  4d.
- **001/D39** — A constructed, validated custom-position witness shows a checked next
  controller with a nonempty internal pre-batch set but no `001/D38`-safe committable
  move. The official game outcome is **open**; choose a local fail-closed software guard
  rather than inventing mate/pass/draw. See
  [`d38-coordinate-search.md`](../../../rules/d38-coordinate-search.md). The witness is
  not proof of opening reachability.
- **001/D40** — Derive public committable moves by filtering the internal set first for
  `001/D38` actor safety, then for the **nonrecursive** checked-successor guard (defined
  using only the internal set and `001/D38` filter). Observe every turn-advancing
  action, including pass without a phantom batch. If the on-turn actor has internal
  moves but no public moves, enumeration/pass/draw evaluation fails closed; ordinary
  zero-internal-move mate or stalemate rules remain. Scope load/query detection to the
  state's own next active controller, not every player.
- **001/D41** — `UnresolvedAdjudicationError` applies **only** to the checked-successor
  guard and the on-turn nonempty-internal/empty-public state; `001/D38` actor rejection
  uses ordinary illegal-move handling. An unchecked successor does **not** veto its
  predecessor: any unresolved mismatch fails closed on its **own** turn. The constructed
  successor in `001/D39` is internal, not a successful public commit. Tests for the open
  case assert only error and atomicity, not a game outcome. No general committed-action
  or complete-engine claim is authorized by this software policy.

## Identity and release preparation

- **001/D42** — The project is **QuaterniTS**, npm name `quaternits`, origin
  `git@github.com:pboueke/QuaterniTS.git`. License this project's original work under
  MIT (`LICENSE`); include a prominent unofficial/non-affiliation disclaimer, use no
  official logos or visual assets, and intend free, non-monetized project development.
  These intentions do not limit MIT recipients or assert third-party
  intellectual-property rights.
- **001/D43** — Prepare openly for publication; no standing name, trademark or
  license-approval gate blocks publishing this repository. Keep `private: true` solely
  as protection from an **accidental npm publish** until the owner explicitly starts a
  release. Do not confuse that safeguard or missing engine/consumer/CI work with legal
  clearance or a public-release prohibition. Name the toolkit image and npm cache
  `quaternits-*`; remove the former local image and cache after the replacement toolkit
  passes verification. This decision supersedes the provisional release clauses in
  `001/D7` and `001/D13`, and the old toolkit-handle clause in `001/D42`.
