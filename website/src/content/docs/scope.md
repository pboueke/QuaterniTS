---
title: Notation & scope
description: Unofficial, MIT-licensed, deliberately partial — what QuaterniTS claims and what it refuses to claim.
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
condition, and it limits no one's MIT rights (`001/D42`, `001/D43`).

## Honest limits

1. **Not a complete engine.** Only the outcomes the rules authorize are
   reported: a lone active controller wins, and a two-active-controller
   stalemate or a unanimously accepted draw offer is a draw. Everything else
   stays `in-progress` instead of adjudicating a mate that no action produced.
2. **One provisional rule edge is open.** A checked controller that has
   **internal defensive moves but no safe publicly committable move** has no
   official outcome. Only that edge fails closed with
   `UnresolvedAdjudicationError`, while ordinary checkmate (a checked controller
   with no internal defenses) still applies (`001/D38`–`001/D41`,
   [multiplayer adjudication](/QuaterniTS/reference/rules/multiplayer-adjudication/)).
   `UnresolvedAdjudicationError` is a **software error, never a game outcome**:
   no mate, pass, draw, elimination or award is decided for it.
3. **No notation compatibility.** Long coordinates in, typed event records out;
   there is **no** FEN, PGN or SAN support in any form, and no chess.js API
   parity (`001/D4`). See the
   [compatibility matrix](/QuaterniTS/reference/compatibility/).
4. **No board renderer.** The library is headless and ships no UI, server,
   clock, opponent or AI.

The official game rule for the open edge stays `[open]`; no complete game-rule
or complete-engine coverage is claimed.

## What this site is

This is a static documentation site — a presentation and delivery layer for the
library. It contains no game logic and no game UI, and it depends on no CDN or
remote runtime asset. It is built inside the repository's pinned toolkit by
`make docs-build` and deployed from `.github/workflows/pages.yml`.

The published URL, <https://pboueke.github.io/QuaterniTS/>, serves content only
after the owner enables the Pages **GitHub Actions** source and a deployment
succeeds; until then this site exists as a buildable, tested artifact in the
repository.
