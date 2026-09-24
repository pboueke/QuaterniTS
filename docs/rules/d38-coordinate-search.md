# 001/D38 checked-non-actor edge: coordinate search record

Status: **RESEARCH / NON-POLICY — independently geometry-reviewed, not itself a
decision.** This document records a read-only coordinate search for the
`[blocked]` edge in `docs/rules/multiplayer-adjudication.md` §4/§8 (001/D38 checked
non-actor with a Tier0 defence but zero 001/D38-safe public committed moves). It adds
no decision of its own; spec **001/D39** now cites this record as the witness behind
its operational fail-closed guard, which **001/D44** authorizes for bounded, guarded
implementation, but this file remains research and never
policy. It contains no source code, no test and no rules policy. An independent
review **accepted the geometry of the primary witness (§2.1–§2.5) with P2
reproducibility gaps only**; it did not adjudicate the clause-(a) variant (§2.6)
or the bounded negatives, so those stay research-only. Every claim below is
marked
**`[verified-by-execution]`** (produced by running the production modules in the
pinned toolkit), **`[reading]`** (a direct reading of the reviewed 001/D30/001/D31/001/D32/001/D38
text) or **`[conjecture]`**. Nothing here may be quoted as approved policy.

## 0. Non-claims

- This is **not** a complete-engine claim; the engine claim stays withheld per
  001/D38/001/D27.
- The witness below is the **precondition** of the `[blocked]` edge. This record
  itself does not resolve the edge and proposes no resolution; spec **001/D39**
  selects the operational fail-closed handling, and per 001/D27 an implementation that
  reaches the state must still fail closed atomically with
  `UnresolvedAdjudicationError`.
- No source, toolkit, spec, README, CHANGELOG or other rules document was edited
  for this record. No gameplay code was written. No gate was weakened.
- The verifier scripts are outside the repository (`/tmp/d38-research`), never
  committed, and therefore **not durable**; §6's reproduction commands need those
  local files re-created. The §4 counts below were re-verified against the actual
  scripts for this revision.
- The witness is a **constructed minimal position** (`[fixture]`-style), not a
  pictured official position and not claimed reachable from the opening
  position — the same convention as §4 Fixture 4d.

## 1. The edge under investigation

Quoted (abridged) from §4/§8 of the reviewed table:

> `[blocked]` **Checked non-actor with a Tier0 defense but zero 001/D38-safe public
> moves (001/D38, 001/D27).** A checked non-actor N may have a Tier0 pre-batch defense
> but zero 001/D38-safe public committed moves, because every such move is
> 001/D38-rejected when N's own hypothetical batch leaves N's king removed or in
> check. The ordinary 001/D31 mate detector evaluates mate from the Tier0 set, so it
> sees N's Tier0 defense, does **not** mark N mated, and would pass the turn to N
> while N is checked — an illegal pass while checked.

The search question was therefore: does a **real** 12×12 coordinate position exist
whose checked non-actor has a non-empty Tier0 (pre-batch) defence set and an
**empty** 001/D38-safe public set? `[reading]` Every term below is the reviewed text,
not a new rule: Tier0 = `legalMoves` (001/D31/001/D38), mate = `matedKings` (001/D30/001/D32/001/D33),
batch removal/transfer = 001/D36/001/D37, 001/D38 verdict = clauses (a) and (b), turn advance
= 001/D30 step (c).

## 2. Result

**`[verified-by-execution]` Found.** A coordinate witness exists (a commitment by
White, then a checked Red with exactly one Tier0 defence that 001/D38 rejects by
clause (b)). The abstract "synthetic W" recorded during planning was a
non-coordinate hypothesis; its structure is now realised by the coordinates
below, and no assumption of W proved impossible.

### 2.1 Before the action — position P (turn **White**, all four players active)

| Army  | Pieces (all controllers = own army)                    |
| ----- | ------------------------------------------------------ |
| White | king `h7`, rooks `a12`, `l2`; knights `c3`, `c4`, `d8` |
| Red   | king `a1`; bishop `a9`; knight `b5`                    |
| Black | king `a6`                                              |
| Green | king `j6`                                              |

`[verified-by-execution]` P is a valid `createPosition` value: four kings, all
players `active`, identity army→controller mapping, no king in check, no
already-mated king. No pawns, no frozen or eliminated player, no assimilation.

### 2.2 The candidate action: White `l2–l1` (rook)

`[verified-by-execution]` `l2–l1` is in `legalMoves(P, "white")` (Tier0-safe: the
White king `h7` is not attacked after the move) and it is **001/D38-safe**: the
post-action position has `matedKings = []`, so the hypothetical cascade is empty,
no king is removed and the White king is not in hostile check. It is therefore a
001/D38-safe **hypothetical candidate**. Under 001/D39–001/D41 the local successor guard now
**rejects its public commit**, because the resulting next active controller (Red)
is checked with a non-empty Tier0 set and an empty 001/D38-safe set (§2.3–§2.5); so
Q is an **internal constructed successor** used to exhibit the edge, not an
actually committed public state. Read historically — as the pre-001/D39 verifier
scripts did, since they predate 001/D39 — per 001/D30 the turn would advance
`white → red` (all four players active, so nothing is skipped).

Resulting position **Q** = P with the rook on `l1` and turn **Red**:

| Army  | Pieces                                                 |
| ----- | ------------------------------------------------------ |
| White | king `h7`, rooks `a12`, `l1`; knights `c3`, `c4`, `d8` |
| Red   | king `a1`; bishop `a9`; knight `b5`                    |
| Black | king `a6`                                              |
| Green | king `j6`                                              |

### 2.3 In Q, Red is a checked **non-actor** with exactly one Tier0 defence

`[verified-by-execution]`

- Red's king `a1` is attacked by exactly one piece: the White rook `l1` down rank
  1 (`attackers(Q, "a1", "white") = [l1]`); `k1`–`b1` are empty. No Red, Black or
  Green piece attacks `a1`.
- Red's king has no escape: `a2` is covered by knight `c3`, `b1` by rook `l1` and
  knight `c3`, `b2` by knight `c4`.
- The checker `l1` cannot be captured: `attackers(Q, "l1", "red") = []`.
- The only Red move that stops the check pre-batch is bishop `a9–i1` (the bishop's
  down-right diagonal `b8 c7 d6 e5 f4 g3 h2 i1` is clear and `i1` interposes
  between `l1` and `a1`). `legalMoves(Q, "red") = [a9–i1]` — a **singleton**
  Tier0 set, non-empty.
- Therefore the 001/D31 detector does **not** mark Red mated
  (`isMatedKing(Q, "red") === false`) even though Red is checked.
- Q is a batch fixed point with no already-mated king: only Red is in check
  (`matedKings(Q) = []`), so nothing is pending when Red is handed the turn.

### 2.4 Red's only Tier0 defence is 001/D38-rejected — clause (b)

`[verified-by-execution]` Committing `a9–i1` (position `P_m`) gives:

1. **Snapshot mate.** The rook `a12`'s file `a` is now clear above Black's king
   (`a11 a10 a9 a8 a7` empty), so Black's king `a6` is checked. Every Black
   escape is covered — `a5` by knight `c4`, `a7` by rook `a12`, `b5` by knight
   `c3` (the Black king's capture of the Red knight on `b5` is illegal because
   `c3` defends it), `b6` by knight `c4`, `b7` by knight `d8` — Black has no
   other piece, so `legalMoves(P_m, "black") = []` and
   `matedKings(P_m) = [black]`. Red's own king is **not** in check in `P_m`
   (rank 1 is blocked by the bishop on `i1`, file `a` is blocked by the Black
   king on `a6`), which is exactly why `a9–i1` is a Tier0 defence.
2. **Batch.** Black's king is awarded to Red and removed; the Black army
   transfers to Red and Black is `eliminated` (001/D36/001/D37).
3. **Exposure.** With `a6` gone the rook `a12` attacks down file `a` to `a1`:
   `attackers(P_m2, "a1", "white") = [a12]`.
4. **Cascade stops, clause (b) fails.** Red's post-cascade position still has a
   legal move — knight `b5–a3` or `b5–a7` interposes on file `a` while the bishop
   keeps rank 1 blocked — so `legalMoves(P_m2, "red") = [b5–a3, b5–a7]`, Red is
   checked but **not mated** (`matedKings(P_m2) = []`, the cascade fixed point).
   001/D38 clause (b) requires every Red king still on the board after the cascade to
   be free of hostile check, so `a9–i1` is **rejected atomically**: no board,
   turn or history change, no award, no transfer.

`[verified-by-execution]` The result is identical under a hand-rolled 001/D38
evaluation and under the production driver `adjudicateBatch` (with `matedKings`
as `mateCandidates` and `assimilateMatedKings` as `applyBatch`): both report
clause (b) with the single event `black → red`.

### 2.5 Consequence (the edge's precondition)

`[verified-by-execution]` In Q, Red is checked, `legalMoves(Q, "red") = [a9–i1]`
is non-empty (so 001/D31 does not mark it mated), and the 001/D38-safe public set is
**empty**. Q is a valid **internal constructed successor**, not an actually
committed public state: it is the post-action position the pre-001/D39 verifier
scripts (which predate 001/D39) reached by treating `l2–l1` as committed, and 001/D39–001/D41
now reject that public commit via the local successor guard (§2.2). `[reading]`
Under 001/D39–001/D41 the ordinary 001/D31 detector would see a defence and hand the turn to
Red while Red is checked, exactly the edge described in §4/§8; the engine must
fail closed atomically with `UnresolvedAdjudicationError`; no draw, pass,
self-award or approximation.

### 2.6 Secondary variant: the same skeleton without the Red knight `b5`

`[verified-by-execution]` Dropping `red-knight@b5` keeps every Q property above
(Red checked, Tier0 `= [a9–i1]`, White's `l2–l1` still Tier0-legal and 001/D38-safe)
but changes the rejection clause: after Black's removal, Red's king is mated
(`legalMoves = []` because the bishop on `i1` can only block one of the two White
lines), so the **second** cascade iteration would remove Red's own king — the
actor would be credited with its own mate. 001/D38 rejects `a9–i1` by **clause (a)**
instead of clause (b).

`[reading]` Clause (a) currently records "no verified coordinate witness of its
own". This variant is a coordinate instance of the clause-(a) mechanism, offered
here as **research for independent review**, not as an adopted witness: a
reviewer should decide whether it counts as clause (a)'s witness or is the same
edge instance as §2.4. The independent review accepted only the geometry of the
primary witness (§2.4), so this variant remains **unadjudicated research** and is
not cited by 001/D39.

## 3. Verification performed

Everything below was produced by executing throwaway scripts (outside the repo at
`/tmp/d38-research`, never committed and therefore **not durable**) in the pinned
toolkit image
(`localhost/quaternits-toolkit:local`, Node v24.21.0) with the repository
bind-mounted at `/work`. The production modules imported are `src/position.ts`,
`src/legalMoves.ts`, `src/mate.ts`, `src/batchAdjudication.ts` and
`src/assimilation.ts`. The only logic the scripts add is the **001/D38 verdict**
(transcribed from the reviewed clause text) and the **001/D30 turn advance**, which
they model by asserting that `applyPositionMove` reproduces Q's occupancy and
then building Q with turn `red` — neither 001/D38 nor turn advancement exists in
`src` yet (both are withheld by 001/D38/001/D27).

`[verified-by-execution]` Asserted and passing:

1. P: four kings; four `active` players; identity controllers; turn `white`; no
   king in check; `matedKings(P) = []`.
2. Q: four kings; four `active` players; identity controllers; turn `red`; only
   Red in check; `matedKings(Q) = []`; `isMatedKing(Q, "red") = false`.
3. `legalMoves(Q, "red")` is exactly `[a9–i1]`; the move leaves Red's king
   un-attacked (a genuine pre-batch defence).
4. Attack rays: `attackers(Q, "a1", "white") = [l1]`, zero Red/Black/Green
   attackers of `a1`; Red escape coverage `a2=[c3]`, `b1=[l1,c3]`, `b2=[c4]`;
   checker `l1` is not attacked by any Red piece.
5. The `l2–l1` commitment: Tier0-legal, 001/D38-safe, its cascade is empty, and
   applying it produces exactly Q's occupancy.
6. `P_m` (Red's hypothetical post-move position): Black's king `a6` is checked by
   `a12` only; escape coverage `a5=[c4] a7=[a12] b5=[c3] b6=[c4] b7=[d8]`;
   `legalMoves(P_m, "black") = []`; `matedKings(P_m) = [black]`; Red's king is
   not in check.
7. The batch: Black's king removed, `controllers.black = "red"`,
   `players.black = "eliminated"`; the post-batch snapshot has no mated king.
8. `P_m2`: `attackers(P_m2, "a1", "white") = [a12]`, Red in check and **not**
   mated (`legalMoves = [b5–a3, b5–a7]`).
9. 001/D38 verdict cross-check: hand-rolled filter and `adjudicateBatch`-driven
   filter agree (clause (b), events `[black → red]`); the claim "no other king is
   already mated in Q or P" holds.

## 4. Bounded searches (bounds, pruning, counts)

Two bounded, deterministic searches were run; both are reproducible in the
container from the (non-durable) research scripts and neither found anything the
constructive design did not already contain.

1. **Knight-covering enumeration (1092 candidates, seed-free).** Fixing the
   skeleton (White `Kh7`, `Ra12`, `l1`/`l2`, Red `Ka1`, `Ba9`, `Nb5`, Black
   `Ka6`, Green `Kj6`), enumerate every subset of size 1–4 of a 13-square knight
   pool (`b4 c3 c4 c5 c6 c8 c9 d2 d3 d4 d5 d7 d8`) and test each against the
   full witness invariant, which includes covering the seven required squares
   (`a2 b1 b2` Red escapes, `a5 b5 b6 b7` Black escapes).
   Pruning: the pool excludes file `a`, rank 1, the `a9–i1` diagonal, the
   reserved squares, and any knight square that would attack `a1`.
   Result: **1092 combinations tested, 23 witnesses**; all valid witnesses
   contain `c3` and `c4`; the smallest use three knights (`c3 c4 c9` or
   `c3 c4 d8`; the primary witness uses `c3 c4 d8`).
2. **One-extra-Red-piece family search (528 candidates, seed-free).** The same
   skeleton plus one extra Red piece (types `rook|bishop|knight|queen` × the 132
   free squares), testing whether the non-degenerate variant exists in this
   family — a checked non-actor whose Tier0 set has **two or more** defences, all
   001/D38-rejected. Result: **528 tested, 119 valid witnesses, 0 with |Tier0| ≥ 2.**

`[verified-by-execution]` **Pool derivation and adapter (re-verified against the
actual scripts for this revision).** The 13-square pool in (1) is not hard-coded:
the script derives it as the union, over the seven required squares
(`a2 b1 b2 a5 b5 b6 b7`), of the knight-origin squares that attack that square,
after excluding the forbidden set — all of file `a`, all of rank 1, the `a9–i1`
diagonal `b8 c7 d6 e5 f4 g3 h2`, and the reserved squares
`a5 a6 a7 a9 a12 a1 b6 b7 h7 j6` — and any square whose knight would also attack
`a1`. The union is exactly the 13 squares listed in (1). The witness verifier's
001/D38 verdict is a hand-rolled `d38Safe` plus a `productionD38` adapter that feeds
`matedKings` as `mateCandidates` and `assimilateMatedKings` as `applyBatch` into
the production `adjudicateBatch`; the two agree on the witness. Both counts above
(`1092` combinations / `23` coverings, and `528` / `119` / `0`) reproduce exactly
when the scripts are re-run in the pinned toolkit.

`[conjecture]` The negative in (2) looks structural in this family: with bishop
`a9` still blocking file `a`, any second rank-1 interposition leaves file `a`
blocked, produces no snapshot mate and is therefore 001/D38-**safe**, which would give
the checked non-actor a public move and break the witness. A non-degenerate
witness would need a _different_ mechanism (for example two Red pieces each
unblocking a different hostile line, or a king move that discovers a mate whose
removal exposes the king's destination). This is a hypothesis, not a proof.

## 5. Limits and open questions for the reviewer

1. **Independent geometry review (closure reading).** The geometry of the primary
   witness was independently reviewed and **accepted with P2 reproducibility gaps
   only**; the review did not adjudicate the clause-(a) variant or the bounded
   negatives. The 001/D38 verdict used here is a transcription of the reviewed clause
   text; if a reviewer reads clause (b) as applying only to the _committed_
   action's own snapshot rather than the full closure, the clause-(b) rejection
   above changes. The closure reading is the one used by §4 Fixture 4d and by the
   operator's task statement.
2. **|Tier0| = 1.** The witness's checked non-actor has exactly one Tier0
   defence, so it is the strongest form of "the detector sees a defence that
   cannot legally be played" but also the most degenerate one; a reviewer may ask
   whether 001/D31's detector was ever intended to cover a singleton defence set.
   No coordinate witness with |Tier0| ≥ 2 was found **in the bound of §4(2)**;
   that is **NOT FOUND IN BOUND**, not unreachability.
3. **Turn-advance and 001/D38 are not implemented in `src`.** Both are taken from the
   reviewed text (001/D30 step (c) and 001/D38), so the witness exercises production
   geometry, legality, mate detection and the batch/transfer units, but not a
   production 001/D38 filter or commit path (both are withheld by 001/D38/001/D27).
4. **Fixture status.** P is constructed (`[fixture]`), not pictured by the
   official sources, and is not claimed reachable from the opening position. The
   claim is only that it is a valid `createPosition` value that a rules-conformant
   engine could be handed as a validated custom position.
5. **Indexing and durability.** Spec **001/D39** and
   `docs/rules/multiplayer-adjudication.md` §4/§8 now reference this record as the
   witness for the operational fail-closed guard, so the file is no longer
   unreferenced. The verifier scripts are outside the repository
   (`/tmp/d38-research`) and are **not durable**; reproduction in a fresh checkout
   requires re-creating them from §6.

## 6. Reproduction

Piece lists (TS, `PlacedEntry`-shaped), `controllers` identity, `players` all
`active`:

```ts
const P = {
  turn: "white",
  pieces: [
    { square: "h7", army: "white", type: "king" },
    { square: "a12", army: "white", type: "rook" },
    { square: "l2", army: "white", type: "rook" },
    { square: "c3", army: "white", type: "knight" },
    { square: "c4", army: "white", type: "knight" },
    { square: "d8", army: "white", type: "knight" },
    { square: "a1", army: "red", type: "king" },
    { square: "a9", army: "red", type: "bishop" },
    { square: "b5", army: "red", type: "knight" },
    { square: "a6", army: "black", type: "king" },
    { square: "j6", army: "green", type: "king" },
  ],
};
// Q = P with { square: "l1", army: "white", type: "rook" } instead of l2, turn "red".
```

Steps to re-check (each step is one call into the production modules):

1. `createPosition` both positions; assert four kings, all `active`, identity
   controllers and the turns above.
2. `legalMoves(P, "white")` must contain `l2–l1`; the move is 001/D38-safe over the
   empty cascade; `applyPositionMove(P, ...)` must reproduce Q's occupancy.
3. `legalMoves(Q, "red")` must be exactly `[a9–i1]`; `isMatedKing(Q, "red")` must
   be `false`; `matedKings(Q)` must be `[]`.
4. `applyPositionMove(Q, { a9 → i1 })` → `legalMoves(_, "black")` empty,
   `matedKings(_)` `[black]`; then `assimilateMatedKings(_, ["black"], "red")` →
   `attackers(_, "a1", "white")` `[a12]`, `legalMoves(_, "red")`
   `[b5–a3, b5–a7]`, `inCheck(_, "red")` true, `isMatedKing(_, "red")` false →
   clause (b) rejection.

Run the two throwaway verifiers outside the repo, in the pinned toolkit (the
scripts are research artifacts, never committed):

```sh
# primary witness: all assertions in §3 plus the §4(1) knight enumeration
podman run --rm --userns=keep-id:uid=1000,gid=1000 \
  -v "$PWD":/work:Z -v /tmp/d38-research:/research:Z -w /work \
  --entrypoint node localhost/quaternits-toolkit:local /research/d38-witness.mts

# family search: the §4(2) |Tier0| >= 2 negative
podman run --rm --userns=keep-id:uid=1000,gid=1000 \
  -v "$PWD":/work:Z -v /tmp/d38-research:/research:Z -w /work \
  --entrypoint node localhost/quaternits-toolkit:local /research/d38-family-search.mts
```

The verifier prints the two positions, every asserted fact with its value, and a
`failures: none` line when all checks pass.

## 7. Raw verifier output (excerpt)

```text
P: black-king@a6 green-king@j6 red-bishop@a9 red-king@a1 red-knight@b5 white-king@h7 white-knight@c3 white-knight@c4 white-knight@d8 white-rook@a12 white-rook@l2
Q: black-king@a6 green-king@j6 red-bishop@a9 red-king@a1 red-knight@b5 white-king@h7 white-knight@c3 white-knight@c4 white-knight@d8 white-rook@a12 white-rook@l1
OK   Q: only red is in check
OK   Q: no already-mated king
OK   Q: 001/D31 detector does NOT mark red mated
OK   Q: blue-check - attackers(a1,white) :: l1
     Q red king escape coverage: a2=[c3] b1=[l1,c3] b2=[c4]
     Q checker l1: attacked by red pieces? [none]
OK   Q: red Tier0 (pre-batch) set is exactly {a9-i1} :: a9-i1
     red a9-i1: hand REJECTED(b), production driver REJECTED(b) events=[black->red]
        iteration 0: mates = [black]
          remove [black] awarded to red
        iteration 1: mates = [none]
        post-cascade red kings [a1], checked [a1]
        clause (b): red king in hostile check after the cascade
OK   Q: red has ZERO 001/D38-safe public committed moves while checked :: safe=[]
OK   P->Q: applying l2-l1 yields exactly Q's board
OK   P->Q: white l2-l1 is 001/D38-safe under both evaluations :: hand=none production=none events=[]
     P_m black king a6 checkers: white=[a12] red=[none]
     P_m black escape coverage: a5=[c4] a7=[a12] b5=[c3] b6=[c4] b7=[d8]
OK   P_m: black has no legal move (mated)
OK   P_m2: black army transferred to red and black eliminated
     P_m2 red legalMoves=[b5-a3, b5-a7]
OK   P_m2: red in hostile check AND not mated (clause (b) witness)
     bounded search: 1092 combinations tested, 23 valid knight coverings
     variant without red knight b5: red Tier0=[a9-i1], 001/D38=[a9-i1:a], white move safe=true
failures: none
tested=528 valid=119 withTier0>=2=0
multi solutions:
  none
```
