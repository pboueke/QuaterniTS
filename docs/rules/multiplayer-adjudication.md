# Checkmate and assimilation

QuaterniTS evaluates check and mate by **controller**, not just by the
original colour of a piece. A piece retains its army colour when another
controller gains it through assimilation. The rules below cover simultaneous
mates, frozen kings, passes and draws. The examples are constructed positions
designed to show a particular outcome; they are not official game records.
The library also has a [known unresolved checked-position
boundary](d38-coordinate-search.md), for which it fails closed rather than
inventing a game result.

## 0. Sources and conventions

- [Official illustrated quick rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf): turns, checkmate, frozen armies, draws and transfers.
- [Official basic rules](https://www.quaternity.com/play-quaternity): game overview.
- [Tutorial chapters 16–17](https://play.quaternity.com/how-to-play/quick-start/chapter16): indirect checkmate and credit to the player completing the position.
- [Tutorial chapters 18–20](https://play.quaternity.com/how-to-play/quick-start/chapter18): frozen pieces and hypothetical defence of frozen kings.
- [Tutorial chapter 21](https://play.quaternity.com/how-to-play/quick-start/chapter21): two-player stalemate is a draw.
- [Pawns](pawn-vectors.md) and [Starting position](../fixtures/opening-position.md): movement and the 64-piece board.

Coordinates use files `a`–`l`, ranks `1`–`12`, with White's opening king at
`a1`. Turns go White → Red → Black → Green, skipping frozen and eliminated
controllers. An **active** controller may take a turn; **frozen** pieces stay
on their squares but cannot move, attack or defend; an **eliminated**
controller has lost its last king. Kings are never captured directly: mate
removes them through adjudication.

## 1. Controllers, kings and army transfer

Every king controlled by the acting player must remain safe from all hostile
controllers. This includes kings of other original colours in a validated
custom position. A king is checked or mated according to its **current
controller**, while its army colour remains unchanged.

When one controller still has another king after a mate batch, only the
mated king's retained-colour army transfers to the player who completed the
position; other armies it controls remain under its command. If its **last**
king is removed, every piece it still controls transfers, including previously
assimilated, kingless armies. Each piece transfers at most once, and the
survival decision uses the entire batch snapshot, including frozen kings
still on the board.

**Multiple-king example.** White controls its own king `a1` and a Red-army
king `a5`, plus White rook `b5`; Black controls king `l12` and rook `h5`.
Only White and Black are active. White `b5–b6` is illegal because it exposes
the Red-army king on `a5` to Black's rook along rank 5. White `a5–a4` is a
legal move by the same controller, leaving both of its kings safe.

## 2. Indirect checkmate

The player whose action **completes** a mating position receives the mated
army's surviving pieces, even if a different player's piece supplies the
check. The tutorial's indirect-mate examples establish this attribution.

In a constructed position, White has king `e1`, knight `a3`, queen `b7`;
Red has king `j12`; Black has king `l12`, rook `a5`; Green has king `a1`,
rook `g8`. No king starts in check: White's knight blocks Black's rook on
file `a`. White moves the knight `a3–c4`, uncovering Black's rook attack
on Green's king. Green cannot escape, block or capture the checker. Green's
king is removed and rook `g8` transfers to **White's control**, retaining
its Green army colour. White made the action; Black's rook delivered the
check. Red and Black remain active, so there is no winner yet.

## 3. Frozen pieces and frozen kings

Frozen pieces occupy and block their squares but do not attack, defend or
move. A non-king frozen piece can be captured; a frozen king cannot be
captured directly. For **mate evaluation only**, a frozen king is assessed
as though its own pieces could defend it. This avoids calling a frozen king
mated when an otherwise legal hypothetical defence exists.

### Fixture 3a: frozen pieces do not attack

With frozen Black king `l12` and rook `a5`, active White king `a1`, Red king
`a12` and Green king `l1`, White may move `a1–a2`. The inert rook does not
attack `a2`; Red moves next.

### Fixture 3b: a frozen king can be mated

With frozen Green king `a1` alone, active White king `c3`, Red king `a12`
and Black king `l12`, White `c3–b2` mates Green. White's king attacks
`a1`, `a2` and `b1`; the frozen king's reciprocal attack does not make
`b2` unsafe. Green's king is removed and Red moves next.

### Fixture 3c: hypothetical defence prevents mate

White has king `c2`, knight `c1` and rook `b2`; Red and Black have kings
`a12` and `l12`. Frozen Green has king `a1` and rook `a5`. White
`b2–a2` checks Green's king. Its escapes are covered, but under
hypothetical active defence Green's rook could capture the checker on
`a2` along the open file `a`. Green remains frozen and is **not mated**.

### Fixture 3d: frozen pieces block and can be captured

White king `a1` and rook `d4` face frozen Black king `l12` and ordinary
pawn `d6`; Red king `j12` and Green king `l1` are active. The frozen pawn
blocks White's rook until White captures it with `d4×d6` along an open
`d5`. It did not attack or move, but its occupied square was a real
obstacle. The frozen Black king remains on the board.

A frozen king still on the board counts when evaluating whether its
controller retains a king, even though that controller is not active.

## 4. Mate batches and actor safety

After a committed action, evaluate all on-board kings in the **same
post-action snapshot**. Award all kings mated in that snapshot to the
player who made the action, in fixed White → Red → Black → Green order,
then remove/transfer them together. Re-evaluate the resulting position
for newly revealed mates and repeat until none remain. Removing one king
must not retroactively revoke another mate from the same snapshot.

### Fixture 4a: two simultaneous mates

White king `e1`, rook `f1`, knights `c10`,
`d10`, `i10`, `j10`; Red king `a12`; Black king `l12`; Green king `g6`.
White `f1–f12` checks Red and Black along rank 12. The knights cover
their escape squares, so both kings are mated in one snapshot. White
receives both armies; Green remains active and moves next.

### Fixture 4b: a cascade

White king `e6`, rook `a1`, knights `b3`, `c5`, `d4`, `j4`,
`k4`; Red king `b1`; Black king `l1`; Green king `g6`. White `c5–d3`
removes Red's last escape `b2`. Red is mated, so its king is removed.
That removal opens the White rook's rank-1 attack on Black; the knights
cover Black's remaining escapes. Black is mated in the next batch.
Both awards go to White; Green moves next.

### Fixture 4c: why a snapshot matters

This is an **abstract attack example**, not a playable board position. It
isolates the order of operations: the tokens `qR`, `qB` and `qG` stand for
Red's, Black's and Green's king squares, while `eR1/eR2`, `eB1/eB2` and
`eG1/eG2` stand for their escape squares. White also has a king `qW`.
Each controller initially has one king and one non-king piece: White rook,
Red rook, Black knight and Green bishop.

| State                                   | Attacks and resulting mates                                                                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before White's action                   | Red's square `qR` is safe; Black's square `qB` is attacked but escape `eB1` is free; Green's `qG` is safe. No king is mated.                                                                                                                         |
| After White's action, **same snapshot** | White attacks `qR`, `eR1`, `eR2`, `qB`, `eB1` and both Green escapes. Red's king attacks `eB2`. Both Red and Black have their king square attacked and **both** escapes covered. Red and Black are mated together; Green's king is not yet attacked. |
| If Red were removed **first**           | Red's attack on `eB2` disappears. Black's king is still checked but can escape to `eB2`; this incorrect sequential process misses Black's mate.                                                                                                      |
| After the proper Red-and-Black batch    | Both kings are removed. Their rook and knight transfer to White, retaining Red and Black army colours. The open line lets White's rook attack `qG`; both Green escapes are covered, so Green is mated in the next batch.                             |
| After the Green batch                   | Green's king is removed and bishop transfers to White without changing its army colour. White is the only active controller and wins.                                                                                                                |

The simultaneous snapshot awards **both Red and Black**, even though
Black ceases to be mated if Red is removed alone. Each king and piece is
awarded or transferred once. This example illustrates the batch algorithm;
actual mate detection also considers captures and blocks, not just king
escapes.

### Fixture 4d: post-batch safety

The acting controller's **own** kings must still be safe after the complete
hypothetical cascade. If a batch would remove one of its kings or leave
one in hostile check, the candidate is an ordinary illegal move: no
board, turn, history or award change. For example, in a constructed
position with White king `a1`, rook `d4`, knights `b2`, `f3`, `d3`, `h2`;
Red king `e1`; Black king `l12`, rook `h1`, knight `b4`; Green king
`a12`, White `d4–e4` would mate Red. Removing Red's king `e1`,
however, opens Black rook `h1`'s attack along rank 1 to White king
`a1`. The move is **rejected atomically**, with no Red award or removal.

Internal pre-batch defences are not necessarily publicly committable
moves. The [unresolved checked position](d38-coordinate-search.md)
explains the distinct `UnresolvedAdjudicationError` guard; the software
error is **not** a mate, pass or draw.

## 5. Passing and stalemate

With **more than two active controllers**, an on-turn controller that is
not in check and has no legal move may `pass()`. The board stays unchanged,
a pass event is recorded and the turn advances clockwise. Passing while
checked is not allowed. With **exactly two active controllers**, no legal
move while not in check is a **stalemate draw**, as specified in tutorial
chapter 21. A checked king with no internal defence is instead mated.
No repeated-position, move-count or insufficient-material draw is inferred.

### Fixture 5a: pass with four active players

Start with active kings White `a1` (on turn), Red `a12`, Black `l12` and
Green `l1`, plus Black rooks `b5`, `c2`. White is not checked, but all
its escapes are covered (`a2` by `c2`, `b1` by `b5`, `b2` by both). White
may pass and Red moves next.

### Fixture 5b: two-player stalemate

If Red and Green are eliminated from the same setup, leaving only White
and Black active, White is still not checked and has no legal move. The
result is a **stalemate draw**, not a pass.

A pass is a turn-advancing action and cannot hand the next checked
controller an unresolved position: the library rejects such a pass
atomically with `UnresolvedAdjudicationError`. It does not invent a mate
batch for a pass, because no piece moved.

## 6. Draw proposals and responses

A draw offer must come from the controller on turn and requires unanimous
agreement from all other active controllers. A rejection leaves play in
progress; frozen and eliminated controllers do not vote. The proposal and
responses are undoable administrative events. For example, from the
four-army starting position White proposes; Red, Black and Green accept:
the game ends in a draw. If Green rejects, White remains on turn. One
`undo()` after Red accepts reverses only that response, leaving the
proposal pending. See [Draws and other actions](administrative-actions.md)
for offer expiry and freeze sequencing.

### Fixture 6: offer acceptance, rejection and undo

From the four-army starting position with White on turn, White proposes a
draw. If Red, Black and Green all accept, the game ends in a draw. If
Green rejects, the offer clears and White stays on turn. In a separate
proposal, Red accepts and one `undo()` reverses only that response: the
offer remains pending with Red's vote restored to outstanding. None of
these operations changes the board or advances the turn.

## 7. Last active controller

The last active controller wins even if frozen kings remain on the board.

### Fixture 7: mate leaves one active player

White king `a1`, rook `b10`, knights `c10`, `d10`; Red king
`a12` active; Black king `l12` and Green king `l1` frozen. White
`b10–a10` mates Red: `a11` is covered by the rook, `b12` by `c10`,
`b11` by `d10`. Red's king is removed and White wins as the sole active
controller; frozen Black and Green kings stay on the board.

### Fixture 7b: actions after the winner

With White king `a1` active and Red `a12`, Black `l12` and Green `l1`
frozen, White has already won as the only active controller. A subsequent
`resign("white")` is rejected without changing the winner, board or
history. A match cannot reach zero active controllers through valid
sequential play: the game ends when only one remains. A validated
in-progress snapshot with none is rejected rather than treated as a
draw. See the [example
match](../fixtures/opening-to-terminal-administrative-match.md) for an
administrative finish instead of a mate.
