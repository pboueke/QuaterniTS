# Opening position fixture provenance

Status: **REVIEWED ON A DELEGATED BASIS (spec 001/D24).** The owner delegated the
opening-fixture rules decisions and did not personally perform the square-by-square
check. Review was performed by an automated comparison of all 64 `basicPosition`
facts plus a visual corner check and an independent read-only reviewer (see
"Delegated review record" below).
Scope: Phase 1A only. This document and `src/fixtures/openingPosition.ts` record the
default four-army opening position. No movement, legality or adjudication logic is
included, by design.

## Sources

| Source                                   | URL                                                                       | Role                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Official illustrated quick rules (PDF)   | <https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf> | Rules text and pictured board authority (spec 001/D9)          |
| Official tutorial, quick start chapter 1 | <https://play.quaternity.com/how-to-play/quick-start/chapter1>            | Pictured opening position and its `basicPosition` data         |
| Official play page                       | <https://www.quaternity.com/play-quaternity>                              | Rules authority (spec)                                         |
| Patent US20150352433A1                   | <https://patents.google.com/patent/US20150352433A1/en>                    | Supporting evidence only; **not** used to override the picture |

The tutorial is a public single-page app served from `/static/js/main.242d8326.chunk.js`.
Its `basicPosition` object supplies the 64 opening square/color/type **data facts** used
below. Only the data facts were read; no vendor implementation code was copied, and no
vendor source is vendored into this repository.

## Method

1. The quick-rules PDF was retrieved and its text layer extracted. The text confirms the
   rules (clockwise turns, one-square pawns, no castling, advanced central pawns, checkmate
   assimilation, frozen armies) but its board diagram is a raster image, so the text alone
   does not resolve the position.
2. The tutorial chapter 1 `basicPosition` data object was read for the 64 square/color/type
   facts. This is the same position shown in the pictured chapter 1 board.
3. The pictured corner arrangement was cross-checked against the data: White bottom-left
   (king `a1`), Red top-left (king `a12`), Black top-right (king `l12`), Green bottom-right
   (king `l1`). This matches the spec's stated pictured arrangement and is the authority over
   the patent's conflicting corner assignment.
4. Pixel-level reading of the PDF raster was deliberately not performed once the tutorial
   facts agreed with the pictured corners and the spec's stated facts.

## Fixture facts (64 pieces, 16 per army)

Coordinates use files `a`–`l` (left to right) and ranks `1`–`12` (bottom to top), with `a1`
at bottom-left, matching the pictured board.

### White (bottom-left, king a1) — 16

| Type   | Squares                        |
| ------ | ------------------------------ |
| King   | a1                             |
| Queen  | b2                             |
| Rook   | a4, d1                         |
| Knight | b4, c4                         |
| Bishop | d2, d3                         |
| Pawn   | a5, b5, c5, d4, e5, e1, e2, e3 |

Advanced central pawns: **d4, e5**.

### Red (top-left, king a12) — 16

| Type   | Squares                           |
| ------ | --------------------------------- |
| King   | a12                               |
| Queen  | b11                               |
| Rook   | a9, d12                           |
| Knight | d10, d11                          |
| Bishop | b9, c9                            |
| Pawn   | a8, b8, c8, d9, e8, e10, e11, e12 |

Advanced central pawns: **d9, e8**.

### Black (top-right, king l12) — 16

| Type   | Squares                           |
| ------ | --------------------------------- |
| King   | l12                               |
| Queen  | k11                               |
| Rook   | i12, l9                           |
| Knight | j9, k9                            |
| Bishop | i10, i11                          |
| Pawn   | h8, h10, h11, h12, i9, j8, k8, l8 |

Advanced central pawns: **i9, h8**.

### Green (bottom-right, king l1) — 16

| Type   | Squares                        |
| ------ | ------------------------------ |
| King   | l1                             |
| Queen  | k2                             |
| Rook   | i1, l4                         |
| Knight | i2, i3                         |
| Bishop | j4, k4                         |
| Pawn   | h1, h2, h3, h5, i4, j5, k5, l5 |

Advanced central pawns: **i4, h5**.

## Composition check

Every army holds exactly: 1 king, 1 queen, 2 rooks, 2 knights, 2 bishops, 8 pawns = 16
pieces. Across four armies: 64 pieces on a 12×12 (144-square) board. These invariants are
enforced by `src/fixtures/openingPosition.test.ts`.

## Visual cross-check and unresolved uncertainty

- The four kings and both advanced central pawns per army are the anchors that tie the data
  facts to the picture. All twelve documented anchor facts are asserted in the tests.
- The PDF diagram is a raster image and was not read pixel by pixel. If a future
  review finds a disagreement between the tutorial data and the printed diagram, the
  printed illustrated rules (spec 001/D9) govern, and this fixture plus its tests must be
  corrected before any move generation is built.
- The patent's pawn listings contain omissions/duplicates and its corner assignment
  conflicts with the picture; per spec 001/D2/001/D9 they are not used to fill or change any square.

## Source/exception table

Every square that the pictured authority cannot resolve must be recorded here with
its resolution and source. The table is intentionally empty: no square in this
fixture is currently unresolved, because the tutorial `basicPosition` facts and the
pictured corners agree (spec 001/D9/001/D24). Add a row here if review ever finds ambiguity,
and correct the fixture before any move generation is built.

| Square | Issue | Resolution | Source |
| ------ | ----- | ---------- | ------ |
| _none_ | —     | —          | —      |

## Delegated review record

The fixture was accepted on delegated review evidence (`001/D24`):

- **Automated fact comparison.** All 64 tutorial quick-start chapter 1 `basicPosition`
  square/color/type facts were compared against the checked-in fixture: zero
  discrepancies.
- **Visual corner check.** The pictured corner arrangement was checked against the
  official illustrated quick-rules PDF: White bottom-left (`a1`), Red top-left
  (`a12`), Black top-right (`l12`), Green bottom-right (`l1`).
- **Independent reviewer.** A read-only reviewer returned OK with P2 (non-blocking)
  notes.

The advanced central pawns' forward direction remains intentionally unrecorded (it is
chosen on first move, per the rules). The spec's rules-policy/TDD gate still requires
reviewed expected-outcome tables before any movement, legality or adjudication code is
written.
