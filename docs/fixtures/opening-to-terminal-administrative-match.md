# Example match

This example plays four ordinary moves from the [starting
position](opening-position.md), then ends the match through administrative
actions. It was executed through the public `Quaternity` API. The game ends
because White is the only active controller, **not** because a king was
checkmated. The particular sequence is an example, not an official game record.

## 1. Sources and notation

- [Official basic rules](https://www.quaternity.com/play-quaternity) and
  [illustrated quick rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf): movement, turn order and frozen armies.
- [Starting position](opening-position.md): the pictured 64-piece opening.
- [Draws and other actions](../rules/administrative-actions.md): offer expiry,
  freezes and undo behavior.

Coordinates use files `a`–`l`, ranks `1`–`12` and long `from`–`to` notation.
The library does not interpret SAN, FEN or PGN. The moves below involve
knights and one king; they do not exercise pawn promotion or assimilation.

## 2. Starting context

Start with White on turn and all four controllers active. The next active
controller is selected clockwise: White → Red → Black → Green.

## 3. Actions

| #   | Player | Public action             | Expected after | Notes                      |
| --- | ------ | ------------------------- | -------------- | -------------------------- |
| 1   | White  | commit `b4–c2` (knight)   | next: Red      |                            |
| 2   | Red    | commit `d11–b10` (knight) | next: Black    |                            |
| 3   | Black  | commit `j9–l10` (knight)  | next: Green    |                            |
| 4   | Green  | commit `i2–g3` (knight)   | next: White    |                            |
| 5   | White  | `proposeDraw()`           | offer pending  | White stays on turn        |
| 6   | White  | commit `a1–a2` (king)     | next: Red      | Offer expires in this move |
| 7   | Red    | `recordTimeLoss(red)`     | next: Black    | Freeze: `time-loss red`    |
| 8   | Black  | `resign(black)`           | next: Green    | Freeze: `resign black`     |
| 9   | Green  | `recordWalkover(green)`   | winner: White  | Freeze: `walkover green`   |

No action captures a piece or produces a mate award, so each recorded
`awards` list is empty. The freezes do not trigger a mate or assimilation
batch and leave all four kings on the board.

## 4. Final state

- `outcome()` is `{ kind: "winner", winner: "white" }` because White is the
  only active controller; Red, Black and Green are frozen.
- The board still has 64 pieces. Its kings are at `a2` (White), `a12` (Red),
  `l12` (Black) and `l1` (Green).
- `turn()` remains `white`. History kinds are `move`, `move`, `move`, `move`,
  `draw-proposal`, `move`, `freeze`, `freeze`, `freeze`.
- A new move or administrative action after the terminal result is rejected
  without changing state. `undo()` and `reset()` remain available.

## 5. History, undo and snapshot

The pending offer expires as part of action 6's single move event. Undoing
that event restores the offer and any votes already recorded. The versioned
snapshot replays the following action log into a fresh instance:

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

One `undo()` per event reverses the three freezes, the `a1–a2` move (restoring
the pending offer), the proposal and then the first four moves. `reset()`
restores the starting position and clears the history.

This match demonstrates an **administrative finish**, not an opening-to-mate
line or proof that assimilation and promotion are reachable from the opening.
It does not settle the [unresolved checked-controller
position](../rules/d38-coordinate-search.md); the library never invents a
game outcome for that edge.
