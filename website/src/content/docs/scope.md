---
title: Notation & scope
description: The bounded, fail-closed rules contract and its known limitations.
---

## Unofficial and unaffiliated

QuaterniTS is an **unofficial, community-driven** project. It is **not
affiliated with, sponsored by, or endorsed by** the rights holders of the
official Quaternity game or project, and it uses no official logos or visual
assets.

The MIT [`LICENSE`](https://github.com/pboueke/QuaterniTS/blob/main/LICENSE)
covers this project's **original work only** — not third-party names, rules
text, trademarks, artwork or other assets. QuaterniTS is developed free of
charge with no monetization; that is a project intention, not a license
condition, and it limits no one's MIT rights.

## Bounded rules contract

QuaterniTS is a **bounded, fail-closed rules library**, not a complete game
engine. It generates committable moves and applies supported outcomes; it does
not guess an outcome when the official rules leave one unknown. A lone active
controller wins, and a two-active-controller stalemate or unanimously accepted
draw offer is a draw. Other positions remain `in-progress` unless a supported
action produces an outcome.

A checked controller can have **internal defensive moves but no safe publicly
committable move** after mate and army-transfer effects are considered. The
[constructed coordinate witness](/QuaterniTS/reference/rules/d38-coordinate-search/)
shows why this is not ordinary checkmate: its only apparent defence exposes
its own king after another king is removed. The library rejects that unresolved
commit atomically with `UnresolvedAdjudicationError`; it can also raise the
same error when such a state is encountered on turn. Neither case is a game
result. Ordinary checkmate, where there is no internal defence, still applies.
The official outcome for the unresolved position remains **unknown**: no mate,
pass, draw, elimination or award is inferred. Until an authoritative ruling establishes an outcome, this fail-closed
contract remains in place; publishing the package does not make the library
a complete game engine.

## Other limits

- **No notation compatibility.** Long coordinates in, typed event records out;
  there is **no** FEN, PGN or SAN support in any form, and no chess.js API
  parity. See the
  [compatibility matrix](/QuaterniTS/reference/compatibility/).
- **No board renderer.** The library is headless and ships no UI, server,
  clock, opponent or AI.
