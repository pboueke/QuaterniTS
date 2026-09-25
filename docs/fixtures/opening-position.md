# Starting position

QuaterniTS starts with 64 pieces on a 12 × 12 board: 16 pieces per army,
including two advanced central pawns per player. White moves first; turns
continue clockwise through Red, Black and Green. The coordinates below use
files `a`–`l` from left to right and ranks `1`–`12` from bottom to top.

## Sources

- [Official illustrated quick rules](https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf): the pictured board governs the opening.
- [Official tutorial, chapter 1](https://play.quaternity.com/how-to-play/quick-start/chapter1): its pictured board and `basicPosition` data give the 64 square, colour and piece-type facts.
- [Official basic rules](https://www.quaternity.com/play-quaternity): turn order and game overview.
- [Patent US20150352433A1](https://patents.google.com/patent/US20150352433A1/en): supporting background only; its conflicting corners and incomplete pawn listings do not override the pictured board.

The tutorial's 64 `basicPosition` facts agree with the pictured corner
arrangement: White bottom-left (`a1`), Red top-left (`a12`), Black top-right
(`l12`), Green bottom-right (`l1`).

## Pieces by army

### White (bottom-left; king a1)

| Type   | Squares                        |
| ------ | ------------------------------ |
| King   | a1                             |
| Queen  | b2                             |
| Rook   | a4, d1                         |
| Knight | b4, c4                         |
| Bishop | d2, d3                         |
| Pawn   | a5, b5, c5, d4, e5, e1, e2, e3 |

Advanced central pawns: **d4, e5**.

### Red (top-left; king a12)

| Type   | Squares                           |
| ------ | --------------------------------- |
| King   | a12                               |
| Queen  | b11                               |
| Rook   | a9, d12                           |
| Knight | d10, d11                          |
| Bishop | b9, c9                            |
| Pawn   | a8, b8, c8, d9, e8, e10, e11, e12 |

Advanced central pawns: **d9, e8**.

### Black (top-right; king l12)

| Type   | Squares                           |
| ------ | --------------------------------- |
| King   | l12                               |
| Queen  | k11                               |
| Rook   | i12, l9                           |
| Knight | j9, k9                            |
| Bishop | i10, i11                          |
| Pawn   | h8, h10, h11, h12, i9, j8, k8, l8 |

Advanced central pawns: **i9, h8**.

### Green (bottom-right; king l1)

| Type   | Squares                        |
| ------ | ------------------------------ |
| King   | l1                             |
| Queen  | k2                             |
| Rook   | i1, l4                         |
| Knight | i2, i3                         |
| Bishop | j4, k4                         |
| Pawn   | h1, h2, h3, h5, i4, j5, k5, l5 |

Advanced central pawns: **i4, h5**.

## Position checks

Each army has one king, one queen, two rooks, two knights, two bishops and
eight pawns. Across four armies that is 64 occupied squares; the opening
fixture and its tests assert every square, colour and piece type.

### Source/exception table

The picture and tutorial data currently agree on all 64 squares. No exception
is needed:

| Square | Discrepancy | Resolution | Source |
| ------ | ----------- | ---------- | ------ |
| _none_ | —           | —          | —      |

If a future discrepancy appears, the official illustrated board takes
precedence. Advanced central pawn direction is chosen during play, not fixed
by the opening position; see [Pawns](../rules/pawn-vectors.md).
