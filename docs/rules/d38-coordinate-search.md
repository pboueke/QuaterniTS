# Unresolved checked positions

Most positions have a definite supported continuation or outcome. There is
one known boundary: a checked controller may have a move that blocks the
current attack, but the move's resulting mate and army transfer can expose
that controller's king again. The official sources do not specify the result
for this situation. QuaterniTS **fails closed** with
`UnresolvedAdjudicationError`; it does not turn the position into a mate,
pass, draw, elimination or award.

The example below is a constructed, valid custom position, **not** a position
pictured by the official sources or proven reachable from the opening. It
illustrates why a defence considered before a mate batch can differ from a
move safe to commit. See [Checkmate and
assimilation](multiplayer-adjudication.md) for the ordinary rules.

## 2. Constructed position P and hypothetical Q

All four controllers are active and control their own armies. No king is
currently checked or mated.

| Army  | Pieces                                                 |
| ----- | ------------------------------------------------------ |
| White | king `h7`; rooks `a12`, `l2`; knights `c3`, `c4`, `d8` |
| Red   | king `a1`; bishop `a9`; knight `b5`                    |
| Black | king `a6`                                              |
| Green | king `j6`                                              |

White's rook move `l2–l1` would check Red's king `a1` along rank 1. The
ordinary pre-batch analysis finds no mate in the resulting position, which
we call **Q**. Red would be the next controller, and its sole immediate
response to the rank-1 attack would be bishop `a9–i1`, blocking the rook.

Q is an **internal hypothetical successor**, not a successful public commit:
QuaterniTS detects the unresolved checked successor and rejects White's
attempted `l2–l1` atomically before it changes the board, turn or history.

### Why the apparent defence cannot be committed

In hypothetical Q, Red's king has no escape: `a2` is covered by White's
knight `c3`; `b1` by rook `l1` and knight `c3`; `b2` by knight `c4`. Red
cannot capture the checking rook. Its only pre-batch defensive move is
bishop `a9–i1`, along the clear diagonal `b8 c7 d6 e5 f4 g3 h2 i1`.

That bishop move clears file `a` above Black's king `a6`. White's rook on
`a12` now checks Black. Every Black escape is covered (`a5` by `c4`, `a7`
by rook `a12`, `b5` by `c3`, `b6` by `c4`, `b7` by `d8`). The snapshot
batch removes Black's king and transfers Black's army to Red.

Removing Black's king opens the same file from White's rook `a12` down to
Red's king `a1`. Red is checked again after the batch. Its knight `b5`
could later interpose at `a3` or `a7`, so this is **not** an ordinary
checkmate, but Red's attempted `a9–i1` does not leave its king safe at the
end of the committed action. That move is not publicly committable.

| Hypothetical stage    | Red's internal defence      | Safe public move | Supported result                  |
| --------------------- | --------------------------- | ---------------- | --------------------------------- |
| Q, before Red's batch | `a9–i1`                     | none             | unknown official outcome          |
| After trying `a9–i1`  | file `a` exposes Red's king | move rejected    | no board, history or award change |

The library distinguishes this mismatch from ordinary checkmate (a checked
king with **no** internal defence). It also refuses to advertise an internal
move as playable. The same error can arise on turn in a validated custom
position with internal moves but no committable move; queries and actions
fail closed instead of fabricating a game result.

## 3. Evidence and scope

The board geometry above was checked against the actual move, attack,
checkmate and assimilation routines. The official [basic
rules](https://www.quaternity.com/play-quaternity) and [illustrated quick
rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf)
do not specify the final game outcome for this constructed sequence. Until an
authoritative ruling is available, the library's software error is the
bounded contract for this edge, **not** an official Quaternity rule or a
complete-engine claim.
