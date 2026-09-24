# Opening-to-terminal administrative match

Status: **EXECUTED EXPECTED-OUTCOME FIXTURE (spec 001/D11).** This is a `[fixture]`
record of one small match played from the reviewed official opening position
(`docs/fixtures/opening-position.md`, spec 001/D9/001/D24) to a terminal winner.
Every action below was executed against the public `Quaternity` API, and each
expected outcome was read back from that execution; the coordinate log in §5 is
the snapshot the engine really writes. It is **not** an official game record: the
official sources fix the opening position and the rules, not these particular
moves.

**What it is:** an **opening-to-terminal administrative match**. Real public
committed moves open the game, and the winner is then decided by the
owner-approved `001/D45` administrative freezes (`resign`, `recordTimeLoss`,
`recordWalkover`).

**What it is not** (see §6 for the full limitation list): it is **not a proof of
opening-to-mate**, not a line that assimilates a piece from the opening, and not a
complete-engine claim. It decides no outcome for the `[open]` checked-non-actor
edge (`001/D39`–`001/D41`, `001/D44`) and never invents one.

## 1. Sources

| Source                                 | URL                                                                       | Role                                                         |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Official basic rules / play page       | <https://www.quaternity.com/play-quaternity>                              | Rules authority (spec)                                       |
| Official illustrated quick rules (PDF) | <https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf> | Move, turn-order and freeze rules text                       |
| Opening position fixture               | `docs/fixtures/opening-position.md`                                       | The reviewed 64-piece starting position (001/D9, 001/D24)    |
| Administrative action sequencing       | `docs/rules/administrative-actions.md`                                    | `001/D45` freeze and draw-offer-sequencing expected outcomes |
| Adopt spec decisions                   | `docs/spec/active/001-adopt-quaternity/decisions.md`                      | 001/D9, 001/D11, 001/D34, 001/D35, 001/D45                   |
| Executable twin                        | `src/quaternity.test.ts`                                                  | The tests that play this match and assert §3–§5              |

## 2. Conventions and starting position

- Board: files `a`–`l` (left to right), ranks `1`–`12` (bottom to top), `a1` at
  White's pictured bottom-left corner. All coordinates are long coordinates
  (`from`–`to`); this library has no SAN, FEN or PGN notation (spec 001/D4).
- The start is the reviewed opening fixture: 64 pieces, four active controllers,
  White on turn, turn order `White → Red → Black → Green`.
- Pieces moved below: White `b4` knight and `a1` king, Red `d11` knight, Black
  `j9` knight, Green `i2` knight. Each is a pawn-free orthodox move, so no pawn
  direction, commitment or promotion rule is exercised here (see §6).
- `[official]` is stated or summarized by the sources above, or fixed by spec 001
  and 001/D25/001/D35. `[policy]` is the owner-approved `001/D45` software
  inference. `[fixture]` is this particular choice of moves, which no official
  source names.

## 3. Action table

Nine actions in order. "Expected after" is the recorded turn selection (the next
active controller, or the lone active winner), read back from the engine.

| #   | Player on turn | Public action             | Expected after                         | Tag                                            |
| --- | -------------- | ------------------------- | -------------------------------------- | ---------------------------------------------- |
| 1   | White          | commit `b4–c2` (knight)   | next: Red                              | `[fixture]` move; `[official]` knight geometry |
| 2   | Red            | commit `d11–b10` (knight) | next: Black                            | `[fixture]` move; `[official]` knight geometry |
| 3   | Black          | commit `j9–l10` (knight)  | next: Green                            | `[fixture]` move; `[official]` knight geometry |
| 4   | Green          | commit `i2–g3` (knight)   | next: White                            | `[fixture]` move; `[official]` knight geometry |
| 5   | White          | `proposeDraw()`           | offer pending, turn stays White        | `[official]` proposal §6; `[policy]` 001/D45   |
| 6   | White          | commit `a1–a2` (king)     | next: Red, offer expired in this event | `[policy]` 001/D45 expiry; §1 O1               |
| 7   | Red            | `recordTimeLoss(red)`     | next: Black                            | `[policy]` 001/D45 freeze                      |
| 8   | Black          | `resign(black)`           | next: Green                            | `[policy]` 001/D45 freeze                      |
| 9   | Green          | `recordWalkover(green)`   | winner: White                          | `[policy]` 001/D45, 001/D35 lone active winner |

No action in the match produces a mate award, a capture or a pawn transition, so
every recorded `awards` list is empty and the board never loses a piece.

## 4. Expected terminal state

- `outcome()` is `{ kind: "winner", winner: "white" }`: White is the **lone
  active controller** (`001/D35`, §7 Fixture 7), not a mate.
- Statuses: `white: "active"`, `red: "frozen"`, `black: "frozen"`,
  `green: "frozen"`. The freezes apply **no** mate/assimilation batch, so the
  frozen kings stay on their squares.
- The board still holds 64 pieces, and the four kings are on `a2` (White, after
  action 6), `a12` (Red), `l12` (Black) and `l1` (Green).
- `turn()` is `white` (the winner's seat) and the recorded history kinds are
  `move`, `move`, `move`, `move`, `draw-proposal`, `move`, `freeze`, `freeze`,
  `freeze`.
- Every board or administrative action after this terminal state is rejected
  atomically: `move`, `pass`, `moves`, `proposeDraw`, `respondToDraw`, `resign`,
  `recordTimeLoss` and `recordWalkover` all throw and change nothing
  (`001/D35`, `001/D45`). `undo()` and `reset()` still work.

## 5. Recorded events, undo and snapshot

- The three freezes are logged as `time-loss red`, `resign black` and
  `walkover green`; the proposal is logged as `proposeDraw()`, and the moves as
  the coordinate pairs above.
- The pending offer from action 5 **expires inside** action 6's single move
  event, so one `undo()` of that move restores the offer with its recorded votes
  (none: the other players never voted; `001/D45` §1 O1).
- The V1 snapshot (`001/D10`) of the terminal match replays into a fresh
  instance and yields the same state, event records and action log:

```json
[
  { "kind": "move", "from": "b4", "to": "c2", "promotion": null },
  { "kind": "move", "from": "d11", "to": "b10", "promotion": null },
  { "kind": "move", "from": "j9", "to": "l10", "promotion": null },
  { "kind": "move", "from": "i2", "to": "g3", "promotion": null },
  { "kind": "draw-proposal" },
  { "kind": "move", "from": "a1", "to": "a2", "promotion": null },
  { "kind": "freeze", "action": "time-loss", "player": "red" },
  { "kind": "freeze", "action": "resign", "player": "black" },
  { "kind": "freeze", "action": "walkover", "player": "green" }
]
```

- One `undo()` per event reverses, in order: the Green walkover, the Black
  resignation, the Red time loss, the `a1–a2` move (which restores the pending
  offer), the proposal, and finally the four committed moves.
- `reset()` restores the reviewed opening position and clears the log.

## 6. Limits and provenance

- **Administrative, not a mate.** The match ends because three controllers were
  frozen by `001/D45` actions. It is therefore evidence for the completion
  criterion "a full-match test" only in the narrow, labelled sense of an
  opening-to-terminal **administrative** match. It is **not a proof of
  opening-to-mate**, and it is not evidence that a mate, an assimilation cascade
  or a promotion is reachable from the official opening.
- **No outcome for the `[open]` edge.** Nothing here exercises or decides the
  checked-non-actor edge (`001/D39`–`001/D41`, `001/D44`); `UnresolvedAdjudicationError`
  remains a software error and never a game outcome, and this fixture asserts no
  such outcome.
- **No notation compatibility.** The coordinates are this library's own long
  coordinates; no SAN, FEN or PGN claim is made or implied (`001/D4`).
- **No complete-engine claim.** The engine, public API and game-rule coverage
  claims stay withheld; this fixture proves one executed match, nothing more.
- The moves were selected as _legal, committable, non-capturing_ moves and each
  was re-checked against the real engine. No move needed to be replaced, no
  engine code was added for this fixture, and no guard was bypassed.
