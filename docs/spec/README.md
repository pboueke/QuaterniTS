# Spec workflow

This directory holds the library's specs and concise, citable decision
records. Specs describe the current contract; rule fixtures carry detailed
examples and evidence.

## Layout

- `active/<NNN>-<slug>/spec.md` — the current contract.
- `active/<NNN>-<slug>/decisions.md` — stable numbered decisions for that spec.
- `archive/<NNN>-<slug>/` — a spec whose definition of done holds.
- `archive/001-adopt-quaternity/` — the bounded, fail-closed library contract;
  its archived scope does not claim a complete game engine.
- `active/002-checked-non-actor-outcome/` — proposed spec-only follow-up for
  the still-unknown official outcome; it authorizes no implementation yet.

## Lifecycle

1. **Spec-only approval first.** A spec is written and reviewed on its own,
   before implementation. Implementation starts only after the spec is approved
   by merge (or, for a solo repository, one clearly marked solo spec-only
   commit). Nothing in a spec authorizes implementation until then.
2. **Implement against the spec.** Each phase is reviewable and preserves a
   single authority for each concern. Implementation evidence (tests, fixtures)
   links back to the spec.
3. **Archive when done.** Move the spec to `archive/` only once the
   implementation is shipped and the definition of done holds.

## Decisions

- Cite decisions with both the spec and decision ID, such as `001/D42`.
  New decisions are additive in `decisions.md`; never recycle an ID. The owner
  approved rewriting spec 001's previously oversized record into concise
  current decisions; future corrections cite the decision they refine.
- Every ambiguous rule needs a decision, a reviewed source-linked outcome
  example and a test written before implementation (`001/D11`). Do not silently
  inherit two-player chess conventions.
- Cite the source (official rules, illustrated rules, tutorial chapter, patent)
  in the decision. The patent is supporting evidence only and never overrides the
  official rules or the pictured board.

## Tracker

Each spec carries a `## Tracker` section. When no external ticket system is in
use, the field is `none` and the spec's review/merge is the record. There is no
separate tracker to reconcile.

## Solo downgrade

On a solo repository, the spec-only PR may be downgraded to a single commit
clearly marked as the spec-only approval, so the intent is still recorded
separately from implementation.

## Rules that bind implementation

- The illustrated opening position is the golden fixture; a source/exception
  table records any square the picture cannot resolve
  (`docs/fixtures/opening-position.md`).
- Quality gates are not weakened to get green. A failing gate is fixed or
  explicitly, justifiedly excluded — never silently skipped.
- Agents must not commit, push, tag or revert (see `AGENTS.md`).
