# 002 — Checked non-actor official outcome

Status: **proposed spec-only follow-up; not implementation authorization**.

## Question

What do the official Quaternity rules require when a checked controller has an
internal pre-batch defence, but every defence is unsafe after the resulting
mate/assimilation cascade? The constructed P → Q position in
[`docs/rules/d38-coordinate-search.md`](../../../rules/d38-coordinate-search.md)
§2 gives a concrete witness: White's `l2–l1` checks Red; Red's only internal
defence `a9–i1` removes Black's king, exposing Red's king to White's rook on
`a12`. P → Q is an **internal hypothetical successor**, not a committed public
move or a position proven reachable from the official opening.

Spec 001's `001/D38`–`001/D41`, `001/D44` and `001/D46` govern the current
bounded library. `UnresolvedAdjudicationError` rejects the unresolved action
atomically; it is a **software error, not a Quaternity result**. No rule decides
mate, pass, draw, elimination or award for this witness.

## Research and decision boundary

1. Ask an authoritative game-rule source to adjudicate the precise P → Q
   situation, including whether the post-transfer attack on Red's king is
   assessed immediately and what turn or terminal result follows. Preserve the
   source and distinguish its explicit ruling from inference. A search that
   finds no ruling does not prove a game outcome.
2. Record an additive, numbered decision and a reviewed, source-linked
   coordinate expected-outcome fixture before changing gameplay code. Write a
   failing test first. Check whether the ruling also applies to reachable
   opening positions and to other accepted custom positions; do not infer
   global reachability from this constructed witness.
3. If authority is inconclusive, retain the 001 fail-closed behavior and
   publish no complete-game-rule or complete-engine claim. Any optional
   variant or house rule would require a separately approved, visibly
   non-official contract; it must not silently replace the default.

## Completion criteria

The official outcome is supported by explicit authority, decided in the spec,
exercised by reviewed coordinate tests and integrated without weakening the
existing safety or quality gates. Until then this spec remains open, even if
bounded spec 001 is archived or the repository/package is published.

## Tracker

none
