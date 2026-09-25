# Draws and other actions

The administrative API handles draw offers, resignations, time losses and
walkovers. These actions use the same atomic history and undo model as moves.
Where the official rules do not specify software sequencing, the behavior
below is the library's documented interpretation, not a new official game
rule.

## Sources

- [Official illustrated quick rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf): draw, freeze and winner rules.
- [Official basic rules](https://www.quaternity.com/play-quaternity): turn and player status.
- [Tutorial chapter 18](https://play.quaternity.com/how-to-play/quick-start/chapter18),
  [chapter 19](https://play.quaternity.com/how-to-play/quick-start/chapter19)
  and [chapter 20](https://play.quaternity.com/how-to-play/quick-start/chapter20):
  frozen pieces and frozen kings.
- [Checkmate and assimilation](multiplayer-adjudication.md): turn advance,
  passes and outcomes.

The constructed positions below use files `a`–`l` and ranks `1`–`12`. Turns
continue clockwise from White, skipping frozen or eliminated controllers.

## 1. Draw offer lifetime

Only the controller on turn may call `proposeDraw()`. Other active controllers
may accept or reject with `respondToDraw(player, accept)`. Unanimous acceptance
ends the match in a draw; a rejection does not end play. Frozen or eliminated
controllers do not vote, and a proposal itself does not advance the turn.

A pending offer expires on the next **move or pass**, or when any participant
is frozen. Expiry is part of that one move, pass or freeze event; one `undo()`
restores the previous offer and its recorded votes. Responding after expiry
is a stale vote and fails without changing state.

For the examples, **P4** has active kings White `a1` (on turn), Red `a12`,
Black `l12`, Green `l1`, with no check. **Ps** has the same kings plus Black
rooks `b5` and `c2`; White is not in check but has no legal move, so `pass()`
is permitted while four controllers are active.

| Case | Position | Actions                                                             | Result                                                                                                      |
| ---- | -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| O1   | P4       | `proposeDraw()`; White `a1–a2`                                      | Move committed, Red next; offer expires in the move. One `undo()` restores the offer.                       |
| O2   | Ps       | `proposeDraw()`; White `pass()`                                     | White stays active, Red next; offer expires in the pass. One `undo()` restores the offer.                   |
| O3   | P4       | `proposeDraw()`; Black accepts; Black `resign(black)`               | Black freezes and the offer expires. Turn stays White; one `undo()` restores Black's acceptance and status. |
| O4   | P4       | `proposeDraw()`; Black accepts; White `a1–a2`; Black responds again | The later response is stale and rejected atomically.                                                        |

## 2. Freezes and turn order

`resign`, `recordTimeLoss` and `recordWalkover` may freeze any **active**
controller, whether on turn or off turn. Freezing changes status but does not
remove pieces, award an army or run a mate batch; a frozen king stays on the
board and can later be checkmated. If the target was on turn, play advances
clockwise to the next active controller. An off-turn freeze preserves the
current turn. A remaining lone active controller wins immediately.

An already inactive target, or any administrative action after a terminal
result, is rejected atomically. A freeze that advances the turn also checks
whether the next controller has an unresolved checked position; it fails
closed rather than passing an illegal state to that controller. An off-turn
freeze does not advance the turn.

Use **P4** as above. In **Pl**, White `a1` is active and on turn, Green `l1`
is active, and Red `a12` and Black `l12` are frozen. In terminal **Pt**,
only White is active; all three other kings remain frozen on the board.

| Case | Position                   | Action                    | Result                                                                          |
| ---- | -------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| F1   | P4                         | White `resign(white)`     | White freezes; board unchanged; Red to move.                                    |
| F2   | P4                         | Red `recordTimeLoss(red)` | Red freezes off turn; White stays on turn.                                      |
| F3   | Pl                         | Green `resign(green)`     | Green freezes; White wins as the lone active controller. No army changes hands. |
| F4   | P4 with Red already frozen | Red `recordWalkover(red)` | Rejected without a new event or state change.                                   |
| F5   | Pt                         | White `resign(white)`     | Rejected: the match is already over and White remains the winner.               |

These cases describe the software behavior for all three freeze actions.
They do not decide the [unresolved checked-controller
position](d38-coordinate-search.md); `UnresolvedAdjudicationError` is a
software error, never a mate, pass or draw.
