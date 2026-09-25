---
title: Public API
description: The Quaternity class, typed events, queries and the deliberately unsupported chess.js-style calls.
---

The public API is the `Quaternity` class, the `createPosition` validator, the
`UnresolvedAdjudicationError` software error, `SNAPSHOT_VERSION`, and the types
their surfaces expose. It is deliberately partial and claims **no complete
engine** (see [honest limits](/QuaterniTS/scope/)).

The runnable, verified examples live in the
[usage reference](/QuaterniTS/reference/usage/). The closest chess.js-style call
for each concept — and every deliberate gap — is in the
[compatibility matrix](/QuaterniTS/reference/compatibility/).

## Constructing and inspecting

| Call                        | Returns                           | Notes                                                                                           |
| --------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `new Quaternity(position?)` | a game                            | Defaults to the reviewed 64-piece opening; a custom `Position` must come from `createPosition`. |
| `position()`                | read-only `Position`              | A 12 × 12 `Map` from square to piece; an empty square is absent.                                |
| `turn()`                    | `ArmyColor`                       | The controller whose turn it is.                                                                |
| `status()`                  | `Record<ArmyColor, PlayerStatus>` | `"active"`, `"frozen"` or `"eliminated"` per army.                                              |
| `history()`                 | `readonly HistoryEvent[]`         | Typed event records — never SAN strings.                                                        |
| `outcome()`                 | `GameOutcome`                     | The rules-authorized result, or `in-progress`.                                                  |
| `pendingDraw()`             | `PendingDraw \| null`             | The offer plus its recorded votes, if any.                                                      |

## Queries

| Call                             | Returns               | Notes                                                                       |
| -------------------------------- | --------------------- | --------------------------------------------------------------------------- |
| `moves()`                        | `CommittableMove[]`   | Only the **publicly committable** moves for the controller on turn.         |
| `inCheck(player)`                | `boolean`             | True when **any** king the player owns is attacked by a hostile controller. |
| `attackers(square, controller)`  | `readonly Attacker[]` | Each attacker's square, retained army colour and current controller.        |
| `isAttacked(square, controller)` | `boolean`             | The same check without the records.                                         |

## Actions

Every action is **atomic**: a rejected action throws and changes nothing. A move
that a pawn promotes on requires an explicit
`promotion: "queen" | "rook" | "bishop" | "knight"` choice.

| Call                             | Event returned      | Notes                                                                                          |
| -------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `move({ from, to, promotion? })` | `MoveEvent`         | Long coordinates only.                                                                         |
| `pass()`                         | `PassEvent`         | A board-less pass; only for an immobile, non-mated controller when more than two are active.   |
| `proposeDraw()`                  | `DrawProposalEvent` | Available to the controller on turn.                                                           |
| `respondToDraw(player, accept)`  | `DrawResponseEvent` | Unanimous acceptance is a draw; a single rejection clears the offer. A stale vote is rejected. |
| `resign(player)`                 | `FreezeEvent`       | Freezes any active target; an administrative finish, not a mate.                               |
| `recordTimeLoss(player)`         | `FreezeEvent`       | Same freeze semantics.                                                                         |
| `recordWalkover(player)`         | `FreezeEvent`       | Same freeze semantics.                                                                         |
| `undo()`                         | `void`              | Reverses exactly one recorded event, including its draw-offer expiry.                          |
| `reset()`                        | `void`              | Restores the opening position and clears the log.                                              |

## Persistence

| Call                  | Returns              | Notes                                                                                                                                                                           |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot()`          | `QuaternitySnapshot` | The versioned V1 JSON document: replay origin, action log, events and state.                                                                                                    |
| `loadSnapshot(value)` | `void`               | Parses, re-validates and **replays** the actions, adopting the result only if the replay agrees. A tampered, malformed, unsupported or illegal document is rejected atomically. |

See [Snapshots](/QuaterniTS/snapshots/) for the document shape and the shipped
JSON Schema.

## Validation and errors

| Export                        | Notes                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `createPosition(input)`       | The single validation authority for a custom `Position`. `Quaternity` re-validates and isolates it.                                  |
| `UnresolvedAdjudicationError` | A **software error**, never a game outcome, reserved for the two unresolved states described in [honest limits](/QuaterniTS/scope/). |
| `SNAPSHOT_VERSION`            | The current snapshot document version (`1`).                                                                                         |

## Deliberately unsupported

There is **no** FEN, PGN or SAN support, no board rendering, no castling, no
en passant, no repetition or move-count draw, and no `isCheckmate()`-style query
that adjudicates a mate no action produced. The [compatibility
matrix](/QuaterniTS/reference/compatibility/) lists each near-miss and its
status.
