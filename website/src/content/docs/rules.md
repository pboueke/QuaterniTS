---
title: Rule policy index
description: How ambiguous rules are resolved, which sources govern, and where the source-linked fixtures live.
sidebar:
  order: 0
---

QuaterniTS decides no rule silently. The **official basic rules** and the
**illustrated quick rules** govern, the pictured board settles the opening
position, and the patent is supporting evidence only. Every ambiguous rule needs
an additive decision in the spec's decision record, a reviewed source-linked
expected-outcome fixture, and a test written before implementation (`001/D11`).

## Sources

- [Official basic rules](https://www.quaternity.com/play-quaternity)
- [Illustrated quick rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf)
- [Patent US20150352433A1](https://patents.google.com/patent/US20150352433A1/en) — supporting evidence only; never overrides the official rules or the pictured board.

## Source-linked fixtures on this site

These pages are the repository's canonical `docs/` files, copied into the site at
build time with their links rewritten. Edits are made in the repository files,
never here.

- [Opening position fixture](/QuaterniTS/reference/fixtures/opening-position/) —
  the reviewed 64-piece opening and its source/exception table.
- [Opening-to-terminal administrative match](/QuaterniTS/reference/fixtures/opening-to-terminal-administrative-match/) —
  the executed match from that opening to the owner-approved administrative
  finish. It is **not** a proof of opening-to-mate.
- [Pawn move vectors](/QuaterniTS/reference/rules/pawn-vectors/) — orientation,
  ordinary and advanced central pawns, commitment and promotion.
- [Multiplayer adjudication](/QuaterniTS/reference/rules/multiplayer-adjudication/) —
  multiple kings, indirect mate, frozen armies, cascades and the open edge.
- [Administrative action sequencing](/QuaterniTS/reference/rules/administrative-actions/) —
  draw-offer lifetime, undo coupling and the freeze actions.
- [D38 coordinate search](/QuaterniTS/reference/rules/d38-coordinate-search/) —
  the bounded coordinate search that found the checked-non-actor edge.

## Decision records

The numbered decisions (`001/D1`–`001/D45`) and the active spec stay in the
repository, where they are kept byte-stable for review:

- [Spec 001 — QuaterniTS rules library](https://github.com/pboueke/QuaterniTS/blob/main/docs/spec/active/001-adopt-quaternity/spec.md)
- [Decisions 001/D1–001/D45](https://github.com/pboueke/QuaterniTS/blob/main/docs/spec/active/001-adopt-quaternity/decisions.md)
- [Spec workflow](https://github.com/pboueke/QuaterniTS/blob/main/docs/spec/README.md)
