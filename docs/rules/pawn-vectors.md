# Pawn movement and promotion

The tables give legal and illegal moves for ordinary and advanced central pawns
in each army, using minimal custom positions. `[official]` identifies an
outcome shown or stated by the official sources below; `[inference]` identifies
a documented library interpretation where those sources do not spell out every
orientation. The official tutorial determines pawn direction.

## Sources

| Source                                    | URL                                                                       | Role                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| Official illustrated quick rules (PDF)    | <https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf> | Basic rules 1–17 (rules 3, 6, 9, 10 are pawn rules)      |
| Official tutorial, quick start chapter 5  | <https://play.quaternity.com/how-to-play/quick-start/chapter5>            | Six ordinary pawns per army and their forward moves      |
| Official tutorial, quick start chapter 6  | <https://play.quaternity.com/how-to-play/quick-start/chapter6>            | One-square forward move on the same file or rank         |
| Official tutorial, quick start chapter 7  | <https://play.quaternity.com/how-to-play/quick-start/chapter7>            | Diagonal capture "in the direction of movement"          |
| Official tutorial, quick start chapter 8  | <https://play.quaternity.com/how-to-play/quick-start/chapter8>            | Advanced central pawns; rank-or-file first move          |
| Official tutorial, quick start chapter 9  | <https://play.quaternity.com/how-to-play/quick-start/chapter9>            | Advanced pawn "3 options for an attack"                  |
| Official tutorial, quick start chapter 10 | <https://play.quaternity.com/how-to-play/quick-start/chapter10>           | Commitment to the moved rank/file                        |
| Official tutorial, quick start chapter 11 | <https://play.quaternity.com/how-to-play/quick-start/chapter11>           | Main-diagonal capture keeps the choice open              |
| Official tutorial, quick start chapter 12 | <https://play.quaternity.com/how-to-play/quick-start/chapter12>           | Promotion on the furthest rank/file, same move, same sq. |
| Opening position fixture                  | `docs/fixtures/opening-position.md`                                       | The 64 starting squares and army corners                 |

The tutorial is a public single-page app. Its per-chapter rule-illustration data
(the selected pawn, the `arrowDirection` move arrows and the `xMark` attack
squares) was read as the chapter's pictured content — the same tutorial-data
method used to check the [starting position](../fixtures/opening-position.md).
No vendor engine or move-generation code was copied.

Official rule text quoted verbatim:

- Chapter 5: "Each player has six pawns, three of which are located on a rank and
  three on a file. Any pawn can be moved to the nearest square including the
  first move."
- Chapter 6: "Pawns may move to the unoccupied square immediately in front of it
  on the same file or rank."
- Chapter 7: "A pawn may also take opponent's piece, located diagonally in the
  direction of movement of the pawn."
- Chapter 8: "Each player has two advanced central pawns located on the main
  diagonal. Advanced central pawns may move on the rank or file depending on
  which direction they made their first move."
- Chapter 9: "Each advanced central pawn has 3 options for an attack."
- Chapter 10: "Once advanced central pawns move they are committed to the
  direction they were moved." (10-2: first move horizontally → committed to the
  rank; 10-3: first move vertically → committed to the file.)
- Chapter 11: "If an advanced central pawn captures an opposing piece toward the
  center then it maintains the option on two directions." (11-2: White advanced
  central pawn captured the green knight on e5; it stays an advanced pawn.)
- Chapter 12: "When a pawn reaches the rank/file furthest from its starting
  position it must be exchanged as part of the same move on the same square for a
  new queen, rook, bishop or knight of the same color."
- PDF rule 3: "Pawns may move one square only per turn - even on their first
  move."
- PDF rule 6: promotion as part of the same move on the same square; the choice
  is not restricted by previously captured pieces.
- PDF rule 9: the two Advanced Central Pawns "can choose to move left or right
  for their first move, after that ... committed to the chosen direction."
- PDF rule 10: an Advanced Central Pawn capturing on the main diagonal keeps the
  power to choose its subsequent direction until committing.

## 1. Orientation grounding (validated)

Each army's pawns move **perpendicular to the line they stand on**, away from
their own corner: pawns on a rank move along a file; pawns on a file move along a
rank. `[official]` (chapters 5–6 picture every one of the six ordinary pawns and
its arrow.)

| Army (corner)     | Rank-line pawns     | Forward (file axis)   | File-line pawns        | Forward (rank axis)      |
| ----------------- | ------------------- | --------------------- | ---------------------- | ------------------------ |
| White (bottom-l)  | a5, b5, c5 (rank 5) | `+rank` (up): c5→c6   | e1, e2, e3 (file e)    | `+file` (right): e3→f3   |
| Red (top-left)    | a8, b8, c8 (rank 8) | `-rank` (down): c8→c7 | e10, e11, e12 (file e) | `+file` (right): e10→f10 |
| Black (top-right) | j8, k8, l8 (rank 8) | `-rank` (down): j8→j7 | h10, h11, h12 (file h) | `-file` (left): h10→g10  |
| Green (bottom-r)  | j5, k5, l5 (rank 5) | `+rank` (up): j5→j6   | h1, h2, h3 (file h)    | `-file` (left): h3→g3    |

The two advanced central pawns per army sit on the army's main diagonal (White
and Black on `a1–l12`; Red and Green on `a12–l1`).

## 2. Ordinary pawns: forward move

Baseline setup for every row (see §7): White king a1, Red king a12, Black king
l12, Green king l1; plus the pawn under test on its opening square and nothing
else. `[official]` chapters 5–6.

| Army  | Pawn line | Pawn | Legal forward | Illegal (wrong axis) | Illegal (backward) | Illegal (blocked)      |
| ----- | --------- | ---- | ------------- | -------------------- | ------------------ | ---------------------- |
| White | rank 5    | c5   | `c5–c6`       | `c5–d5`, `c5–b5`     | `c5–c4`            | `c5–c6` if c6 occupied |
| White | file e    | e3   | `e3–f3`       | `e3–e4`, `e3–e2`     | `e3–d3`            | `e3–f3` if f3 occupied |
| Red   | rank 8    | c8   | `c8–c7`       | `c8–d8`, `c8–b8`     | `c8–c9`            | `c8–c7` if c7 occupied |
| Red   | file e    | e10  | `e10–f10`     | `e10–e9`, `e10–e11`  | `e10–d10`          | `e10–f10` if f10 occ.  |
| Black | rank 8    | j8   | `j8–j7`       | `j8–i8`, `j8–k8`     | `j8–j9`            | `j8–j7` if j7 occupied |
| Black | file h    | h10  | `h10–g10`     | `h10–h9`, `h10–h11`  | `h10–i10`          | `h10–g10` if g10 occ.  |
| Green | rank 5    | j5   | `j5–j6`       | `j5–i5`, `j5–k5`     | `j5–j4`            | `j5–j6` if j6 occupied |
| Green | file h    | h3   | `h3–g3`       | `h3–h4`, `h3–h2`     | `h3–i3`            | `h3–g3` if g3 occupied |

"Wrong axis" is the move a chess-trained reader expects: a rank-line pawn
sliding along its rank (`c5–d5`, `c5–b5`), or a file-line pawn sliding along its
file (`e3–e4`, `e3–e2`). "Backward" is the opposite direction along the pawn's
own movement axis (`c5–c4` for the rank-line pawn, `e3–d3` for the file-line
pawn). Both are illegal here — the pawn moves perpendicular to its line and only
forward.

## 3. Ordinary pawns: capture

A pawn captures on the **two diagonals forward of its movement axis**, one square
each. `[official]` text (chapter 7) plus the chapter-7 pictures; the "two
diagonals" reading is `[inference]` for the diagonal that chapter 7 does not
picture (each chapter-7 example places only one enemy on a diagonal). This
both diagonals are supported by this library (§8).

Baseline setup: §2, plus an enemy piece ("target") on each named capture square.
Capture squares are empty in the base case; `×` marks a capture.

| Army  | Pawn (axis) | Forward diagonals | Legal captures      | Illegal (straight) | Illegal (backward diag.) |
| ----- | ----------- | ----------------- | ------------------- | ------------------ | ------------------------ |
| White | c5 (up)     | b6, d6            | `c5×b6`, `c5×d6`    | `c5×c6`            | `c5×b4`, `c5×d4`         |
| White | e3 (right)  | f4, f2            | `e3×f4`, `e3×f2`    | `e3×f3`            | `e3×d4`, `e3×d2`         |
| Red   | c8 (down)   | b7, d7            | `c8×b7`, `c8×d7`    | `c8×c7`            | `c8×b9`, `c8×d9`         |
| Red   | e10 (right) | f11, f9           | `e10×f11`, `e10×f9` | `e10×f10`          | `e10×d11`, `e10×d9`      |
| Black | j8 (down)   | i7, k7            | `j8×i7`, `j8×k7`    | `j8×j7`            | `j8×i9`, `j8×k9`         |
| Black | h10 (left)  | g11, g9           | `h10×g11`, `h10×g9` | `h10×g10`          | `h10×i11`, `h10×i9`      |
| Green | j5 (up)     | i6, k6            | `j5×i6`, `j5×k6`    | `j5×j6`            | `j5×i4`, `j5×k4`         |
| Green | h3 (left)   | g4, g2            | `h3×g4`, `h3×g2`    | `h3×g3`            | `h3×i4`, `h3×i2`         |

Chapter-7 anchors (each `[official]`): White `e3×f4` (Red bishop), Red `c8×b7`
(White knight), Red `e10×f11`; the same chapter also shows Black `g10×f11`,
Green `j6×k7` and White `c6×b7` on its custom lesson board. Every pictured
capture is one of the two forward diagonals of the pawn's axis, consistent with
the table above.

## 4. Advanced central pawns: first-move commitment axes

An uncommitted advanced pawn moves one square along its rank **or** its file
(forward only). `[official]` chapters 8–10. The first such move commits it to
that rank (horizontal) or file (vertical) for the rest of the game.

Baseline setup: §2, plus the advanced pawn under test on its opening square.

| Army  | Pawn | File-axis move (commit file) | Rank-axis move (commit rank) | Illegal (backward)          |
| ----- | ---- | ---------------------------- | ---------------------------- | --------------------------- |
| White | d4   | `d4–d5` → file d             | `d4–e4` → rank 4             | `d4–d3`, `d4–c4`, `d4–c3`   |
| White | e5   | `e5–e6` → file e             | `e5–f5` → rank 5             | `e5–e4`, `e5–d5`, `e5–d4`   |
| Red   | d9   | `d9–d8` → file d             | `d9–e9` → rank 9             | `d9–d10`, `d9–c9`, `d9–c10` |
| Red   | e8   | `e8–e7` → file e             | `e8–f8` → rank 8             | `e8–e9`, `e8–d8`, `e8–d9`   |
| Black | i9   | `i9–i8` → file i             | `i9–h9` → rank 9             | `i9–i10`, `i9–j9`, `i9–j10` |
| Black | h8   | `h8–h7` → file h             | `h8–g8` → rank 8             | `h8–h9`, `h8–i8`, `h8–i9`   |
| Green | h5   | `h5–h6` → file h             | `h5–g5` → rank 5             | `h5–h4`, `h5–i5`, `h5–i4`   |
| Green | i4   | `i4–i5` → file i             | `i4–h4` → rank 4             | `i4–i3`, `i4–j4`, `i4–j3`   |

After commitment the pawn is an ordinary pawn on that axis: e.g. after `d4–d5`
(commits file d) the only forward moves are `d5–d6`, `d6–d7`, … ; `d5–e5`,
`d5–c5` and `d5–d4` are illegal. `[official]` chapter 10. An advanced pawn's
forward move — before and after commitment — is to the **unoccupied** square
immediately in front of it on its chosen rank/file; a blocked forward square
cannot be entered, exactly as for ordinary pawns (chapter 6). `[official]` A
diagonal move is never a plain move — only a capture (§5).

## 5. Advanced central pawns: captures and the non-committing main-diagonal capture

Before commitment an advanced pawn may capture on **three** diagonal squares:
the forward diagonal along its main diagonal (toward the center) plus the two
side diagonals. `[official]` chapter 9 ("3 options for an attack"; White e5
pictures attack marks on `d6`, `f6`, `f4`). The per-army sets for Red, Black and
Green are `[inference]` by symmetry — chapter 9 pictures only White's e5 set,
and chapter 11 pictures only White's d4 set.

| Army  | Pawn | Capture set (3 squares) | Non-committing (toward center) | Committing side captures (committed direction) |
| ----- | ---- | ----------------------- | ------------------------------ | ---------------------------------------------- |
| White | d4   | c5, e3, e5              | `d4×e5`                        | `d4×c5` (up), `d4×e3` (right)                  |
| White | e5   | d6, f4, f6              | `e5×f6`                        | `e5×d6` (up), `e5×f4` (right)                  |
| Red   | d9   | c8, e8, e10             | `d9×e8`                        | `d9×c8` (down), `d9×e10` (right)               |
| Red   | e8   | d7, f7, f9              | `e8×f7`                        | `e8×d7` (down), `e8×f9` (right)                |
| Black | i9   | h8, h10, j8             | `i9×h8`                        | `i9×h10` (left), `i9×j8` (down)                |
| Black | h8   | g7, g9, i7              | `h8×g7`                        | `h8×g9` (left), `h8×i7` (down)                 |
| Green | i4   | h3, h5, j5              | `i4×h5`                        | `i4×h3` (left), `i4×j5` (up)                   |
| Green | h5   | g4, g6, i6              | `h5×g6`                        | `h5×g4` (left), `h5×i6` (up)                   |

**Chapter 11 main-diagonal example** `[official]`. Minimal setup: the four kings
(§7) plus White pawn `d4` and a Green knight on `e5` (the chapter-11 lesson
board). White plays `d4×e5`, capturing the knight toward the center. The pawn
**stays an advanced central pawn** and keeps its choice of direction; it does not
become committed. It now stands on `e5` with the three attack squares `d6`, `f6`,
`f4` (chapter 9 / chapter 11 step 2). By contrast, capturing a side square
(`d4×c5` or `d4×e3`) is `[inference]` to commit the pawn to a persistent
**direction** relative to its **current** square (§8): `d4×c5` commits **up** from `c5`, so the pawn then moves `c5–c6` and
captures `b6`/`d6`; `d4×e3` commits **right** from `e3`, so it then moves
`e3–f3` and captures `f4`/`f2`. The pawn does not stay on the original
file/rank: old-line continuations are illegal (after `d4×c5`, `c5–d5`, `c5–b5`,
`c5–c4` and `c5×d4` are illegal; after `d4×e3`, `e3–e4`, `e3–e2`, `e3–d3` and
`e3×d4` are illegal). The same holds for White's other advanced pawn: `e5×d6`
commits **up** from `d6`, and `e5×f4` commits **right** from `f4`.

Illegal for an uncommitted advanced pawn: a diagonal move onto an empty square
(e.g. `d4–c5` with c5 empty); any backward straight move (§4); a capture on the
square that points back toward its own corner (`d4×c3`, `e5×d4`).

## 6. Promotion

`[official]` chapter 12 and PDF rule 6.

- A pawn must be promoted when it reaches the rank/file furthest from its
  starting line — the board edge it is heading toward. It is mandatory, happens
  **as part of the same move on the same square**, and is not a separate turn.
- The choice is queen, rook, bishop or knight of the **same colour** — never a
  king or a pawn. The choice is unrestricted by previously captured pieces.

| Army  | Axis            | Promotion edge | Example                               |
| ----- | --------------- | -------------- | ------------------------------------- |
| White | up (`+rank`)    | rank 12        | chapter 12: `d11–d12` becomes a queen |
| White | right (`+file`) | file l         | e.g. `k3–l3` promotes on l3           |
| Red   | down (`-rank`)  | rank 1         | e.g. `c2–c1` promotes on c1           |
| Red   | right (`+file`) | file l         | e.g. `k10–l10` promotes on l10        |
| Black | down (`-rank`)  | rank 1         | e.g. `j2–j1` promotes on j1           |
| Black | left (`-file`)  | file a         | e.g. `b10–a10` promotes on a10        |
| Green | up (`+rank`)    | rank 12        | e.g. `j11–j12` promotes on j12        |
| Green | left (`-file`)  | file a         | e.g. `b3–a3` promotes on a3           |

An advanced pawn promotes on the edge of its committed direction: a pawn
committed up (e.g. `d4–d5…d11–d12`) promotes on the far rank (d12); a pawn
committed right (`d4–e4…k4–l4`) promotes on the far file (l4); after a side
capture the direction is preserved relative to the new square (§5), so
`d4×c5` then up `c5–c6…c12` promotes on rank 12 and `d4×e3` then right
`e3–f3…l3` promotes on file l. `[inference]` for the advanced-pawn paths; the
ordinary case is `[official]`.

**Promotion and check (baseline caution).** With the §7 default home corners
(Red king `a12`, Black king `l12`), any White queen or rook promoting on rank 12
— the quiet `d11–d12` or a capture such as `d11×e12` — attacks along rank 12 and
therefore gives **check to both Red `a12` and Black `l12`**. The promotion rule
itself is `[official]` and mandatory; only the check/mate consequences are
separate adjudication questions. The example below uses a custom baseline so
that promotion is the only thing under test.

**Capture-to-promotion.** `[official]` chapter 12 (same move, same square) with
the §3 capture rule. Custom minimal setup, distinct from the §7 default corners:
White king `a1`, Green king `l1`, Red king `a10`, Black king `l10`; plus a White
advanced pawn on `d11` committed **up** (forward move `d11–d12`) and a Red knight
on `e12`. All four kings are safe before the move (the pawn `d11` attacks only
`c12`/`e12`; the knight `e12` attacks only `c11`, `d10`, `f10`, `g11`) and after
every promotion choice: a queen or rook on `e12` attacks rank 12 and file `e` but
no king stands there, a bishop on `e12` attacks its `a8`/`l5` diagonals, and a
knight on `e12` attacks `c11`, `d10`, `f10`, `g11` — none is a king square. So
`d11×e12` is a legal forward-diagonal capture that lands on rank 12, and
promotion is mandatory **as part of that same move on `e12`**: White must replace
the pawn there with a queen, rook, bishop or knight of the same army/colour
(White) — never a king or pawn, whichever of the four is chosen.

**Blocked promotion edge.** `[official]` chapter 6. With any piece occupying
`d12`, the quiet move `d11–d12` is illegal: the forward square is occupied and
cannot be entered, so the pawn cannot promote by a straight move into an occupied
edge square. Promotion only happens on a square the pawn can actually reach.

## 7. Minimal setups

- **Kings baseline.** White king `a1`, Red king `a12`, Black king `l12`, Green
  king `l1`. These four home squares are pairwise non-adjacent and no test piece
  below attacks them before the move under test, so all four kings are safe when
  the move begins; a case whose own move attacks a king is re-checked in §6.
- **Custom baselines.** Where a fixture needs the kings clear of a promotion
  rank — e.g. the §6 capture-to-promotion case — it states its own king squares
  and re-checks king safety; such cases are marked custom and do not use the
  default corners.
- **Move cases** use the baseline plus the single pawn under test on its opening
  square. Blocked cases additionally put any one piece on the forward square.
- **Capture cases** use the baseline plus the pawn under test and one enemy
  "target" piece on the capture square named in the row. Captures of an empty
  square are not captures.
- **Advanced-pawn cases** use the baseline plus the advanced pawn under test; the
  chapter-11 case adds a Green knight on `e5`.

All squares named are on the 12×12 board (`a–l` × `1–12`).

## 8. Library interpretations

The official sources show the one-square forward move, captures, central-pawn
commitment and promotion. The following details apply consistently across all
four rotated armies; where a source does not picture every case, they are
labelled `[inference]` rather than presented as a quotation.

### Captures, commitment and promotion

1. **Ordinary pawns capture on both forward diagonals.** Chapter 7 states the
   generic rule ("located diagonally in the direction of movement") and its
   alternate lesson examples each show one of the two forward diagonals (White
   `e3×f4`, White `c6×b7`, Red `c8×b7`, Red `e10×f11`, Black `g10×f11`, Green
   `j6×k7`); no example places enemies on both, but none excludes the second
   diagonal either. Both diagonals are therefore legal captures (§3).
2. **A side capture commits the pawn to a persistent direction relative to its
   current square**. For an uncommitted advanced
   pawn, a capture whose displacement fits exactly one forward direction commits
   it to that direction, applied from the square it now occupies — **not** to
   the original file/rank: White `d4×c5` (left+up) commits **up** from `c5`
   (`c5–c6`, captures `b6`/`d6`), White `d4×e3` (right+down) commits **right**
   from `e3` (`e3–f3`, captures `f4`/`f2`), White `e5×d6` commits **up** from
   `d6`, White `e5×f4` commits **right** from `f4`; the same rotation gives the
   Red, Black and Green side captures in §5. Old-line continuations are illegal
   (after `d4×c5`: `c5–d5`, `c5–b5`, `c5–c4`, `c5×d4`; after `d4×e3`:
   `e3–e4`, `e3–e2`, `e3–d3`, `e3×d4`).
3. **The main-diagonal (toward-center) capture does not commit.** White `d4×e5`
   (right+up) fits both directions, so it stays uncommitted — the chapter-11
   case. `[official]` chapter 11.
4. **Red/Black/Green advanced attack sets rotate White's shapes** by each army's
   corner and forward directions (§5); chapter 9 pictures only White's `e5` set.
5. **A committed advanced pawn promotes on the boundary of its preserved
   direction** (§6): a pawn committed **up** promotes on the far rank (e.g.
   `d4×c5` then `c5–c6…c12` promotes on rank 12), a pawn committed **right**
   promotes on the far file (e.g. `d4×e3` then `e3–f3…l3` promotes on file l).
6. **An uncommitted pawn that reaches the far board edge by successive
   toward-center captures also promotes on entering the edge.** Walking the main
   diagonal by repeated center captures (e.g. White `d4×e5`, `e5×f6`, `f6×g7`, …)
   reaches the far edge (White rank 12); chapter 12 makes promotion mandatory on
   reaching that rank/file, regardless of commitment.

Chapter 7's generic diagonal wording and pictured captures support the two
forward diagonals; chapter 10 describes direction commitment; chapter 11 keeps
the choice open after a capture toward the centre; chapter 12 requires promotion
at the far edge. The side-capture commitment and symmetry-derived cases remain
labelled `[inference]`. The §1 orientation table and §2–§3 move examples follow
the tutorial's pictured directions, not ordinary two-player chess vectors.
