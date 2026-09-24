# Multiplayer adjudication policy (Phase 3 expected-outcome table)

This source-linked expected-outcome table records the reviewed, delegated
policies in `001/D30`–`001/D41`. The opening and pawn fixtures were reviewed
separately (`001/D24`, `001/D28`, `001/D29`). Snapshot batch and transfer
fixtures have no blocking review findings. The constructed checked-successor
witness supports a **fail-closed software policy**, not an official game
outcome: `001/D41` distinguishes ordinary `001/D38` illegal moves from
`UnresolvedAdjudicationError` and limits the successor guard to a **checked**
next active controller. The complete-engine claim remains withheld; this
limitation does not bar publishing the repository. **001/D44 approval
(appended):** the owner approved this fail-closed handling and authorized the
bounded, guarded implementation test-first; the official game rule for the edge
stays `[open]`, `UnresolvedAdjudicationError` is a software error rather than a
game outcome, and no complete game-rule coverage is claimed.

Every fixture below is a **constructed minimal position**, not a position pictured
by the official sources. Coordinates are chosen to isolate one rule; where the
official material does not fix a coordinate the fixture is tagged `[fixture]` and
its exact squares are the recommended test setup, not an official claim.

## Sources

| Source                                    | URL                                                                       | Role                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Official illustrated quick rules (PDF)    | <https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf> | Basic rules text; freeze, mate and draw rules                         |
| Official basic rules / play page          | <https://www.quaternity.com/play-quaternity>                              | Rules authority (spec)                                                |
| Official tutorial, quick start chapter 16 | <https://play.quaternity.com/how-to-play/quick-start/chapter16>           | Indirect mate (attacker from another army)                            |
| Official tutorial, quick start chapter 17 | <https://play.quaternity.com/how-to-play/quick-start/chapter17>           | Indirect mate continued; award to the mover                           |
| Official tutorial, quick start chapter 18 | <https://play.quaternity.com/how-to-play/quick-start/chapter18>           | Frozen army behaviour                                                 |
| Official tutorial, quick start chapter 19 | <https://play.quaternity.com/how-to-play/quick-start/chapter19>           | Frozen pieces exert no attacks/defenses                               |
| Official tutorial, quick start chapter 20 | <https://play.quaternity.com/how-to-play/quick-start/chapter20>           | A frozen king can be checkmated as if alive                           |
| Official tutorial, quick start chapter 21 | <https://play.quaternity.com/how-to-play/quick-start/chapter21>           | Two-active-player stalemate is a draw                                 |
| Pawn move vectors                         | `docs/rules/pawn-vectors.md`                                              | Sibling Phase 2 expected-outcome table (orientation, 001/D28/001/D29) |
| Opening position fixture                  | `docs/fixtures/opening-position.md`                                       | Reviewed opening squares and army corners (001/D24)                   |
| Adopt spec decisions                      | `docs/spec/active/001-adopt-quaternity/spec.md`                           | 001/D11, 001/D25–001/D41 policy record                                |

Chapter content is cited as the official source's summary (the same chapter-level
attribution used by spec 001/D25/001/D26); no vendor implementation, image or data was
re-read for this table.

## 0. Conventions

- Board: files `a`–`l` (left to right), ranks `1`–`12` (bottom to top), `a1` at
  White's pictured bottom-left corner.
- Armies are `white`, `red`, `black`, `green`. Every piece keeps an immutable
  **army** colour and has a **controller** (the player who may move it). They
  differ after assimilation.
- **"The player" of a king means its current controller, not its army colour
  (001/D33).** Scope, check, mate and all-kings safety are by controller; an
  assimilated king is always evaluated, whatever colour it was created with.
- Player status is **active**, **frozen** (resigned / declared time loss /
  walkover) or **eliminated**.
- Turn order is clockwise, beginning with White: `white → red → black → green`.
  The cursor skips frozen and eliminated players.
- **Assimilation:** a checkmate removes the defeated king. After the atomic
  batch, a controller that still has a king transfers the surviving pieces of
  each mated king's retained **army colour** to the player who completed the
  mating position (001/D36); a surviving multi-king controller (001/D31) keeps every
  other army and piece it controls. If the batch removes a controller's **last**
  king, that controller is **eliminated** and **all** pieces it still controls —
  every army, including a previously assimilated kingless army — transfer to the
  actor (001/D37). Survivor status is decided from the full batch snapshot, never per
  king — "a king" means a king still on the board, not a player's active/frozen
  status (a frozen player's king still counts, 001/D32); army colour is always
  retained and only the controller changes, so no on-board piece ever has an
  eliminated controller.
- **Attacks and check:** an attack query is by attacker **controller**; result
  records keep the attacking army's colour. A move is legal only if the acting
  controller's still-active king(s) are safe from every hostile-controlled army.
  Kings are never captured directly; mate removes them.
- All squares named are on the 12×12 board.

## 1. Multiple still-active kings under one controller

### Official / spec basis

- `[official]` spec: "Validate the acting controller and the safety of its
  still-active king(s) … against **all hostile controlled armies**."
- `[official]` spec: "checkmate removes a defeated king and transfers its
  surviving army to the player who completed the mating position".
- `[official]` spec: "A player cannot move an enemy or frozen army."
- Note: in the default path assimilation **removes** the defeated king, so a
  normal game leaves one king per active player. More than one still-active king
  under one controller is reachable only through a validated custom setup, never
  from default play.

### Recommended policy (001/D31)

- `[policy]` Legality requires every still-active king of the acting controller
  to be safe after the move, against every hostile-controlled army. A move that
  exposes any one of them is illegal even when the others stay safe.
- `[policy]` Checkmate is evaluated per king: a king is mated when it is in check
  and no legal move by its controller can save it while keeping the controller's
  other active kings safe. A mated king is removed and its surviving army
  transfers to the player who completed the mating position; the controller stays
  active while it still owns another king.
- `[policy]` If no king of the controller is in check and no legal move exists,
  the ordinary immobility rules apply unchanged: pass only while more than two
  players are active, otherwise a two-player stalemate draw (001/D25).
- `[policy]` **Scope is by the king's current controller (001/D33), not its army
  colour.** A king is evaluated by whoever may move it, so an assimilated king
  (for example a Red-army king controlled by White after the original Red player
  is eliminated) is always included in the all-kings safety and batch rules.
- `[policy]` **Last-king elimination and transfer (001/D37).** After an atomic batch,
  a controller that still owns a king transfers only the mated kings' retained
  army colours (001/D36) and keeps every other army it controls; a controller whose
  **last** king is removed in the batch is **eliminated**, and **all** pieces it
  still controls transfer to the actor — including a previously assimilated
  kingless army — each army colour retained. Survivor status is decided from the
  full batch snapshot, not per king, and each piece transfers at most once (dedup
  by piece). Here "a king" means a king **still on the board**, never a player's
  active/frozen status: a frozen player's king still on the board counts (001/D32).
  The default-play-reachable case is in §0 (White king plus an assimilated Green
  army whose controller then loses its last king); the surviving custom multi-king
  case is Fixture 1 above.

### Fixture 1 (constructed `[fixture]`)

Preconditions:

- White controller (active) owns White king `a1` (army white) **and** Red king
  `a5` (army red, **controller white**). This custom setup keeps the assimilated
  Red king on the board; the original Red player is eliminated, and by 001/D33 the
  king's "player" is its current controller (White), so it is one of White's two
  active kings.
- White rook `b5` (army white, controller white).
- Black controller (active) owns Black king `l12` and Black rook `h5`
  (army black, controller black).
- Red and Green are eliminated/absent: exactly two active players (White,
  Black). Turn: **White**.
- Kings are safe before the action: rook `h5` attacks file `h` and rank 5, but
  the White rook `b5` blocks rank 5 before `a5`, and `a1` is on neither the file
  nor the rank. No king is in check.

Action A (illegal): White plays `b5–b6` (rook `b5` to `b6`).

- controller: White.
- state: rejected — the move throws and mutates nothing; board unchanged.
- turn: still White.
- outcome: no history event. The move is illegal because vacating `b5` opens the
  `h5` rook's rank-5 line onto the assimilated Red king `a5`, i.e. it exposes one
  of the controller's two active kings. This is the multi-king self-check case.

Action B (legal): White plays `a5–a4` (the assimilated Red king).

- controller: White (moving a piece of an army it controls).
- state: Red king now `a4`; all White kings safe (`a4` is not attacked by the
  `h5` rook).
- turn: advances to Black.
- outcome: one committed action recorded; White remains active with two kings
  (`a1`, `a4`).

## 2. Indirect mate: the attacker belongs to a different army

### Official basis

- `[official]` spec: assimilation "transfers its surviving army to the player who
  completed the mating position, **even when another army supplies the attack**."
- `[official]` tutorial chapters 16–17 illustrate the indirect mate: a move by
  one player creates a mating position whose actual checking piece belongs to
  another army; the award goes to the player who made the move.
- `[official]` spec: attacks are by controller, so a piece of another army
  attacks for its controller regardless of whose turn it is.

### Recommended policy

- `[policy]` The award goes to the acting player — the one whose committed action
  produced the position — never to the controller or army of the checking piece.
- `[policy]` The mated player's surviving army transfers with army colour
  retained; the acting player's controller gains it.

### Fixture 2 (constructed `[fixture]`)

Preconditions (turn **White**):

- White king `e1`; White knight `a3`; White queen `b7` (all army white,
  controller white).
- Red king `j12`.
- Black king `l12`; Black rook `a5` (army black, controller black).
- Green king `a1`; Green rook `g8` (army green, controller green).
- No king is in check: the `a5` rook is blocked on file `a` by the White knight
  `a3`, and its upward file-`a` line reaches no king (`j12` is off file `a`);
  queen `b7` covers file `b` and rank 7 but no king square; Green rook `g8`
  covers file `g` and rank 8 but no king square; White king `e1` is unattacked.

Action: White plays `a3–c4` (knight).

- controller: White.
- state: the knight leaves file `a`, so the Black rook `a5` gives **discovered
  check** along file `a` to the Green king `a1`. Green's escapes `a2` (rook
  line), `b1` and `b2` (queen `b7` on file `b`; `b2` also covered by the `c4`
  knight) are all unavailable; the Green rook `g8` cannot reach the file-`a`
  line to interpose or capture the `a5` rook, and the Green king cannot capture
  it. Green is checkmated. The Green king is removed; the surviving Green rook
  `g8` becomes White-controlled with army colour green retained; Green is
  eliminated.
- turn: advances to Red (the cursor skips the eliminated Green).
- outcome: **White — not Black, whose rook delivered the check — is credited with
  the mate** and receives the Green army. Red and Black remain active; no winner
  yet.

## 3. Frozen armies and frozen kings

### Official basis

- `[official]` spec: "Resignation, declared time loss and walkover freeze that
  player's army in place; frozen pieces do not move, but their king can later be
  checkmated as if alive, **including by an opposing king**."
- `[official]` 001/D26 / tutorial chapters 18–20: a frozen army's pieces exert no
  ordinary attacks or defenses and do not move; a frozen king is checked as if
  its army were active for the purpose of hypothetical mating defenses, so a
  mating position against a frozen king counts.

### Recommended policy (reading of 001/D26)

- `[policy]` Frozen pieces are inert obstacles: they occupy their square and
  block sliding lines, but they never attack, never defend and never move. They
  are capturable like any other piece, and the block persists until capture
  (001/D34, fixture 3d).
- `[policy]` A frozen king's mate is evaluated with the standard mate test,
  treating its army as active ("hypothetical active defenses"): it is mated only
  when, if the army were active, it would have no legal escape, block or capture.
- `[policy]` Because frozen pieces exert no attacks, an active king may stand
  adjacent to a frozen king and attack or mate it; the frozen king's reciprocal
  attack does not count.

### Fixture 3a — frozen pieces exert no attacks (constructed `[fixture]`)

Preconditions (turn **White**):

- White king `a1` (active); Red king `a12` (active); Green king `l1` (active).
- Black king `l12` (army black, controller black, **frozen**) and Black rook `a5`
  (army black, controller black, **frozen**). Black resigned or lost on time, so
  its army is frozen in place; three players remain active.
- No king is in check before the action: the frozen rook `a5` exerts no attacks
  (001/D26), so White `a1`, Red `a12`, Green `l1` and the frozen Black `l12` are all
  unattacked.

Action: White plays `a1–a2` (king), stepping onto `a2` — a square on the frozen
rook's would-be file-`a` line.

- controller: White.
- state: `attackers(a2, black)` is empty; White king `a2` is **not** in check
  from the frozen rook, so the move is legal and the board changes (`a1`→`a2`).
- turn: advances to Red (the cursor skips the frozen Black).
- outcome: the frozen rook does not restrict White; the committed action is
  recorded and the turn advances. No check, no adjudication.

### Fixture 3b — a frozen king is mated (constructed `[fixture]`)

Preconditions (turn **White**):

- White king `c3` (active); Red king `a12` (active); Black king `l12` (active).
- Green king `a1` (army green, controller green, **frozen**); Green has no other
  piece.
- No king is in check before the action: White `c3` is not adjacent to `a1`
  (two files and two ranks away), and Red `a12`, Black `l12` and the frozen
  Green `a1` are unattacked.

Action: White plays `c3–b2` (king), stepping next to the frozen Green king.

- controller: White.
- state: White king `b2` attacks `a1` (adjacent step), so the frozen Green king
  `a1` is in check. Its hypothetical active escapes `a2` and `b1` are attacked by
  the White king, and `b2` holds the enemy king, so it has no escape, block or
  capture even as if active. Green king `a1` is checkmated and removed; its
  (empty) surviving army transfers to White; Green is eliminated.
- turn: advances to Red (the cursor skips the eliminated Green).
- outcome: a mating position against a frozen king counts; the frozen king's own
  attack on `b2` does not count, so the adjacent White king is safe.

### Fixture 3c — a frozen king is not mated (hypothetical active defense)

Preconditions (turn **White**):

- White king `c2` (active); White knight `c1`; White rook `b2`; Red king `a12`
  (active); Black king `l12` (active).
- Green king `a1` (army green, controller green, **frozen**); Green rook `a5`
  (army green, controller green, **frozen**).
- No king is in check before the action: White rook `b2` attacks file `b` and
  `a2` but no king; White knight `c1` attacks `a2`; White king `c2` covers `b1`
  and `b2`; the frozen Green rook `a5` exerts no attacks (001/D26). Green king `a1`
  is not adjacent to `c2`.

Action: White plays `b2–a2` (rook), giving check to the frozen Green king `a1`.

- controller: White.
- state: the White rook `a2` checks the frozen Green king `a1`. Green's king
  escapes are all unavailable: `a2` holds the checker and is defended by knight
  `c1`, and `b1` and `b2` are covered by the White king `c2`. Treating the frozen
  Green army as active, however, the Green rook `a5` can capture `a2` along the
  open file `a` (`a4`, `a3` empty), removing the check, so the mate test fails.
  Green is in check but not mated.
- turn: advances to Red (the cursor skips the frozen Green).
- outcome: the frozen king stays on the board, still frozen, in check; no
  automatic result. An active player must first remove the hypothetical defender
  (`a5`) to complete the mate.

### Fixture 3d — frozen pieces are capturable inert obstacles (constructed `[fixture]`)

Preconditions (turn **White**):

- White king `a1`; White rook `d4` (army white, controller white).
- Frozen Black king `l12` and frozen Black pawn `d6` (army black, controller
  black, **frozen**). The pawn is an ordinary pawn with original direction
  `-rank` (down, toward rank 1): were it active it would move `d6–d5` and capture
  on `c5`/`e5`.
- Active Red king `j12` and Green king `l1`.
- No king is in check before the action: the frozen Black pieces exert no attacks
  (001/D26); the White rook `d4` attacks file `d` and rank 4 but no king square.

Action: White plays `d4×d6` (rook), capturing the frozen Black pawn; the path
`d5` is empty.

- controller: White.
- state: the frozen pawn is removed from `d6`; the White rook now stands on
  `d6`. The capture is legal — a frozen piece is a capturable inert obstacle
  (001/D34). Before the capture the frozen pawn blocked the rook's file-`d` line
  above `d4` (the rook could not reach `d7`–`d12`); the block persists until the
  capture. The frozen Black king `l12` is **not** captured: a king is never
  captured directly, only removed by checkmate (§3/001/D26).
- turn: advances to Red.
- outcome: `[policy]` (001/D34), not official text. Capturing a frozen piece is
  allowed; frozen pieces stay on their square and keep blocking sliding lines
  until captured, and the frozen king remains uncapturable by a normal move.

## 4. Simultaneous and cascading mates (deterministic award order)

### Official basis

- `[official]` spec: "Re-evaluate affected positions at each committed action,
  including an indirect or **multiple mate**; never use two-player next-turn-only
  mate detection as a substitute."
- `[official]` spec: award to the player who completed the mating position.
- **Genuine gap:** neither the official sources nor 001/D25–001/D29 fix the order in
  which two or more kings mated by one action are processed, nor whether a mate
  created by a removal or transfer (a cascade) is resolved in the same action.
  This is resolved as **001/D30** and corrected/extended by **001/D32** (scope and
  snapshot semantics).

### Recommended policy (001/D30, as corrected by 001/D32)

> **Coding status: REVIEWED / UNBLOCKED (test-first).** Fixture 4c below is a
> fully specified algorithmic internal seam that distinguishes the 001/D32 snapshot
> reading from a per-removal re-evaluation; an independent reviewer accepted the
> seam with no P0/P1, so §4 snapshot-semantics code may be written test-first
> under 001/D11/001/D27 (see the `[test requirement]` below and §8). The production
> transfer unit is 001/D36 as corrected by 001/D37, which an independent reviewer
> accepted with no P0/P1: the **pure** transfer unit may be coded and tested in
> isolation for test-first coding, but the **assembled commit path** — which must
> apply 001/D38's post-batch safety filter and resolve the `[blocked]` edge below —
> is withheld. The seam's synthetic S0–S3 states are unchanged by 001/D37 (see
> `applyBatch` below). **001/D38 status: narrow `[policy]` reviewed; one `[blocked]`
> edge.** An independent review **accepted 001/D38's narrow actor-safety policy and
> Fixture 4d with no P0/P1**; 001/D38's checked-non-actor edge remains `[blocked]`
> under 001/D27 and is **not** approved, so the **assembled** commit path and the
> complete-engine claim remain withheld (see the `[blocked]` bullet below and
> §8). **001/D39 status: operational fail-closed guard (owner-delegated); game rule
> stays `[open]`; corrected by 001/D40 and 001/D41.** 001/D39 appends a local fail-closed
> guard for
> the exact observed condition (checked active non-actor, non-empty Tier0, empty
> 001/D38-safe set): a commit that would surface it is rejected atomically with
> `UnresolvedAdjudicationError`, and a public load/query of such a state also
> fails closed. **001/D40 correction:** the public committed set is Tier0 filtered
> first by 001/D38 actor safety and then by this guard; the guard is stated only over
> Tier0 and the 001/D38 filter, so it is nonrecursive; `pass()` and every other
> turn-advancing action are observed immediately after the action with no phantom
> batch; an empty public set on the turn actor fails closed whether it is checked
> or not; and a load/query fails closed only relative to that state's own next
> active controller. 001/D39 supersedes only 001/D38's outdated no-witness sentence and,
> conditionally, its coding hold, and 001/D40 records that this review condition is
> **not yet met** (the MiMo review was stopped and is not an approval; the
> DeepSeek review returned P1s). **001/D41 correction:** a 001/D38 actor-safety rejection
> is a decided illegal/uncommittable move (never `UnresolvedAdjudicationError`,
> which is reserved for this open-rule guard and the on-turn
> `|Tier0| > 0`/empty-public state), and the guard fires only for a **checked**
> next active controller; the general assembled commit path remains
> withheld (see the 001/D39, 001/D40 and 001/D41 bullets below and §8).
> **001/D44 approval (appended):** the owner approved the `001/D38`–`001/D41`
> fail-closed handling and superseded the review-condition hold and the no-code
> clause **only** for the bounded, guarded implementation, so that guarded path
> may now be proposed and coded test-first; the official game rule stays
> `[open]`, `UnresolvedAdjudicationError` is a software error and never a game
> outcome, and no complete game-rule or complete-engine coverage is claimed (see
> §8).

- `[policy]` After a committed action, adjudicate mates as a deterministic
  **fixed-point batch**:
  1. evaluate **every king still on the board whose player has not been
     eliminated** for checkmate against all hostile-controlled armies — this
     includes a **frozen** player's king, evaluated with 001/D26's hypothetical
     active defense (001/D32);
  2. award every mated king to the player who committed the action, processing
     them in the fixed player order `white → red → black → green` — never board,
     hash or enumeration order; remove each king and transfer that player's
     surviving army to the acting controller with army colour retained;
  3. re-evaluate the resulting position and repeat until no new mate appears.
- `[policy]` **Snapshot semantics (001/D32).** Step 1 evaluates the single
  post-action position. Every king mated in that snapshot is awarded, in the
  canonical order, regardless of any intermediate removal or transfer; only
  step 3's next iteration may add a new (cascade) mate. Removing one mated king
  therefore cannot revoke another snapshot mate.
- `[policy]` Every mate in the closure is credited to the acting player, because
  that player's single action completed all of them. A frozen or eliminated
  player's king never **completes** a mate (frozen pieces exert no attacks), but
  a frozen king can be **mated** by another player's action.
- `[policy]` The turn cursor then advances from the acting player to the next
  still-active player, skipping the eliminated and the frozen.
- `[test requirement]` No **coordinate** witness that distinguishes the snapshot
  reading from a per-removal re-evaluation has been verified, and none may be
  invented (001/D32). The distinguishing test is therefore specified
  **algorithmically** as a pure internal seam (Fixture 4c): one snapshot mate's
  own coverage keeps a second king mated, so the snapshot reading awards both
  while a per-removal reading would drop the second. The red tests must be
  written against that seam; an independent reviewer accepted the seam with no
  P0/P1, so §4 batch coding is unblocked for test-first coding. Do **not** assert
  invalid board geometry to force a coordinate witness.

- `[policy]` **Pre-adjudication safety of the committed action (001/D38).** A
  committed action by controller A is accepted only if the full **hypothetical**
  001/D32 batch/cascade over the post-action position satisfies both (a) no king
  whose controller is A is removed by any batch in that cascade, and (b) every
  king of A still on the board after the cascade is not in hostile check. If (a)
  or (b) fails the action is **rejected atomically**: no board, turn, history or
  outcome change, and no mate award or assimilation transfer from the
  hypothetical batch. Clause (a) (self-mate/self-removal) has no verified
  coordinate witness of its own; it is required because 001/D30 credits every mate in
  the closure to the acting player, so without it an action whose own batch
  removes the actor's king would credit the actor with its own mate — a
  self-credit absurdity. Clause (b) is witnessed by Fixture 4d below.
- `[policy]` **Tier0 internal moves are not the public committed moves (001/D38,
  precedence fixed by 001/D40; error taxonomy corrected by 001/D41).** The internal
  pre-adjudication legal-move set the current 001/D31 mate defense uses (safety
  evaluated **before** the batch) is not the future public committed legal-move
  set. As corrected by 001/D40 the public set is Tier0 filtered **first** by the 001/D38
  post-batch actor-safety filter and **then** by the 001/D39/001/D40 local successor
  guard; a candidate rejected by **either** filter is **not listed** as a public
  committable move, but the two rejections are **different** (001/D41): a 001/D38
  actor-safety rejection is a **decided illegal/uncommittable move** rejected
  atomically with the **ordinary illegal-move handling** — never
  `UnresolvedAdjudicationError` — while only the local successor guard's
  open-rule rejection uses `UnresolvedAdjudicationError`. Either way no board,
  turn, history or award changes. The internal set must never be exposed or
  described as the public move set.
- `[blocked]` **Checked non-actor with a Tier0 defense but zero 001/D38-safe public
  moves (001/D38, 001/D27).** A checked non-actor N may have a Tier0 pre-batch defense
  but zero 001/D38-safe public committed moves, because every such move is
  001/D38-rejected when N's own hypothetical batch leaves N's king removed or in
  check. The ordinary 001/D31 mate detector evaluates mate from the Tier0 set, so it
  sees N's Tier0 defense, does **not** mark N mated, and would pass the turn to N
  while N is checked — an illegal pass while checked. Defining N's legal moves
  from the 001/D38-safe public set and then detecting mate from that set is **not
  well-founded**, because the 001/D38-safe set is defined by a post-batch filter
  whose batch itself depends on mate detection, which depends on the legal-move
  set. No distinguishing verified coordinate witness and no approved resolution
  exists, so per 001/D27 this edge is **blocked**: no advertised feature may depend
  on it and the claim that the engine is a complete rules library is withheld. If
  an implementation encounters it before resolution it must **fail closed
  atomically** with a named unresolved-adjudication error
  (`UnresolvedAdjudicationError`) — never a draw, pass, self-award or
  approximation. The pure 001/D30/001/D32 snapshot/transfer seam (Fixture 4c) and the
  pure transfer unit (001/D36/001/D37) may still be independently coded and tested, but
  the assembled commit path and public-API completeness may not be claimed. A
  proposed global consistency precondition for this edge, offered by an external
  oracle, was **retracted** and is **not** adopted here. **001/D39 update (appended;
  the 001/D38 text above is preserved):** the distinguishing coordinate witness now
  exists and is independently accepted, and the edge has an operational
  fail-closed resolution — see the 001/D39 `[policy]` bullet below. **001/D40
  clarification (appended; the 001/D38 text above is preserved):** 001/D38's "no
  advertised feature may depend on it" means specifically that **no advertised
  GAME OUTCOME may depend on this edge**, and a conditional detect-and-error path
  is permitted **only** under the review condition in the 001/D39/001/D40 bullet below —
  it never justifies the complete-engine or public-API completeness claim. The
  official GAME RULE for the state remains `[open]`/UNKNOWN.
- `[policy]` **Operational fail-closed guard for the checked-non-actor edge
  (001/D39).** The official **GAME RULE** for the state is `[open]`/UNKNOWN; what
  follows is selected software behaviour, not a game outcome. The state is
  **observed** when, after a candidate committed action and its 001/D30/001/D32 batch,
  the next active controller N is in hostile check, N's Tier0 pre-batch move set
  is non-empty, and N's 001/D38-safe committed move set is empty. A candidate commit
  that would surface this state is **rejected atomically** with a named
  `UnresolvedAdjudicationError` before any board, turn, history or award change —
  never a covert pass, a skipped player, or a fabricated mate, draw, self-award
  or approximation. A public load or query of a state already containing the
  condition must also **fail closed** with `UnresolvedAdjudicationError`, never
  silently expose an empty move list, a mate or a draw. This is a **local
  observed-edge guard**, not a global consistency precondition and not a claim
  that all game paths are consistent; if it is read as reintroducing a
  predecessor veto, that is a deliberate narrow override requiring review, not a
  silent re-adoption of the retracted precondition. The witnessed positions are
  P and Q in `docs/rules/d38-coordinate-search.md` §2–§3 (White `l2–l1` is a
  001/D38-safe **hypothetical candidate**; the 001/D39/001/D40 guard now rejects its public
  commit because Q has Red checked with the singleton Tier0 `a9–i1`, which 001/D38
  clause (b) rejects, so Q is an **internal constructed successor**, not an
  actually committed public state — see 001/D41 below). A Tier0 / 001/D38-safe-set
  (informally "Tier1") mismatch outside this
  exact condition — including a checked non-actor whose Tier0 set is empty but
  which is not marked mated — is **not** decided here and stays open under 001/D27.
  001/D39 supersedes only 001/D38's outdated "no distinguishing verified coordinate
  witness ... exists" sentence and, **conditionally**, 001/D38's coding hold: after
  an independent review of this fail-closed policy, a future **conditional**
  fail-closed path guarded by the observation condition may be proposed
  test-first under 001/D11/001/D27. It never unblocks the general assembled commit path
  or the complete-engine claim, and authorizes no schema or public-API
  implementation. **As corrected by 001/D40, that review condition is not yet met:**
  the MiMo review was stopped (not an approval) and the DeepSeek review returned
  P1s, so no conditional path is authorized by 001/D39 as written.
- `[policy]` **001/D40 correction of the 001/D39 guard (appended; the 001/D39 text above is
  preserved; the error taxonomy is corrected by 001/D41).** (a) **Precedence.**
  Tier0 stays the internal 001/D31 mate oracle. The public committed set is Tier0
  filtered first by 001/D38 actor safety and then by the local successor guard; a
  candidate rejected by either filter is not listed as a public committable move.
  As corrected by 001/D41 the two rejections differ: a 001/D38 actor-safety rejection is
  a **decided illegal/uncommittable move** rejected with the ordinary
  illegal-move handling, and only the successor guard's open-rule rejection uses
  `UnresolvedAdjudicationError` (see the 001/D41 bullet below). (b) **Nonrecursive
  guard.** The guard's
  observation is stated only over Tier0 and the 001/D38 filter: after a candidate
  action and its 001/D30/001/D32 batch, the next active controller N triggers the guard
  iff N is in hostile check, |Tier0(N)| > 0, and N's 001/D38-safe set (Tier0(N)
  filtered by 001/D38 actor safety only) is empty. It never quantifies over the
  guarded public set it defines, so it is well-founded and nonrecursive, with no
  fixed point and no global-reachability claim. (c) **Empty public set on the
  turn actor, checked or not.** If the active controller on turn has |Tier0| > 0
  but an empty public committed set — whether checked or not — enumeration,
  `pass()` and draw evaluation fail closed with `UnresolvedAdjudicationError`
  rather than inventing a pass, a stalemate/draw or a mate. With |Tier0| = 0 the
  existing 001/D31 and §5 rules govern: a checked active controller with |Tier0| = 0
  is ordinary 001/D31 mate, and the two-active-player stalemate draw (§5) is
  unaffected. (d) **Every turn-advancing action.** The observation applies to
  `pass()` and every other turn-advancing action, taken immediately after the
  action and its batch; a pass changes no square, so it carries no 001/D30/001/D32 batch
  and no phantom batch may be invented for it. Actions 001/D35/§7 already rejects in
  a terminal game keep that handling. (e) **Load/query scope.** A load or query
  fails closed only when that state's own next active controller satisfies (b); a
  mismatch involving any other player is deferred to the next-turn assessment,
  with no global reachability claim. (f) **Frozen defenses.** A frozen player's
  001/D26 hypothetical active defense (§3 fixture 3c) is never the next active
  controller and is never part of the observation. (g) **Witness.** P/Q is a
  constructed, validated custom position, not an opening-reachable claim, and its
  verifier scripts are outside the repository and non-durable. (h) **Tests.** Red
  tests are error-only: they assert the `UnresolvedAdjudicationError` and no
  state change, never a game outcome on this `[open]` case. (i) **Predecessor
  veto distinguished.** This guard vetoes an otherwise-001/D38-safe actor commit
  because of the successor state, so it **is** a local, deliberate predecessor
  veto; it is **not** the retracted global consistency precondition and does not
  re-adopt it.
- `[policy]` **001/D41 correction of the 001/D40 error taxonomy and guard scope
  (appended; the 001/D40 text above is preserved).** (a) **Error taxonomy.** A
  candidate that fails the 001/D38 actor-safety filter is a **decided
  illegal/uncommittable move**: it is excluded from the public committed set and
  its commit is rejected atomically with the **ordinary illegal-move handling**,
  **never** `UnresolvedAdjudicationError`, with no board, turn, history or award
  change. The named `UnresolvedAdjudicationError` is reserved for exactly two
  unresolved states: (i) the local successor guard of (b), and (ii) the on-turn
  `|Tier0(A)| > 0` / empty-public-committed-set unresolved state of 001/D40(3).
  001/D40(1)'s sentence giving the 001/D38 filter the `UnresolvedAdjudicationError` is
  superseded; 001/D38's own rule text is unchanged. (b) **Checked-only successor
  guard.** The 001/D39/001/D40 guard applies to `pass()` and every other turn-advancing
  action but fires **only** for a **checked** next active controller N with
  `|Tier0(N)| > 0` and an empty 001/D38-safe set; an **unchecked** N with
  `|Tier0(N)| > 0` and an empty public committed set does **not** veto the
  predecessor action or `pass()` — the predecessor stands — and is instead
  handled by the separate on-turn 001/D40(3) fail-closed state when N is on turn. (c)
  **001/D31 `|Tier0| = 0` preserved.** Ordinary 001/D31 mate detection and the §5 pass /
  two-active-player-stalemate-draw rules are unchanged: a checked active
  controller with `|Tier0| = 0` is ordinary 001/D31 mate, and an unchecked active
  controller with `|Tier0| = 0` and no legal move keeps the existing pass /
  stalemate-draw handling. (d) **Sibling unchecked subcase.** The 001/D39(4)
  still-open sibling case for an **unchecked** player stays `[open]` as a game
  rule; its software behaviour, when that player is on turn with `|Tier0| > 0`
  and an empty public set, is the 001/D40(3) fail-closed path. (e) **Witness
  wording.** White `l2–l1` in P is a 001/D38-safe hypothetical candidate whose public
  commit the 001/D39/001/D40 guard now rejects; Q is an internal constructed successor,
  not a committed public state, and the verifier scripts predate 001/D39. (f)
  **Status.** The game rule stays `[open]`, the software behaviour stays
  `[policy]`, and 001/D41 authorizes no engine, commit-path or public-API code.

### Fixture 4a — one action mates two kings at once (constructed `[fixture]`)

Preconditions (turn **White**):

- White king `e1`; White rook `f1`; White knights `c10`, `d10`, `i10`, `j10`
  (all army white, controller white).
- Red king `a12`; Black king `l12`; Green king `g6` (all active).
- No king is in check before the action: file `f` is empty above `f1` and the
  rook's rank-1 line holds no king; the knights' **relevant escape-cover
  squares** (not their full attack sets) are `c10`: `a11`,`b12`; `d10`: `b11`;
  `i10`: `k11`; `j10`: `k12`,`l11`, and none of the knights attacks a king
  square.

Action: White plays `f1–f12` (rook, file `f` clear).

- controller: White.
- state: rook `f12` attacks rank 12 both ways, checking Red `a12` and Black
  `l12` at once. Red escapes `a11` (`c10`), `b12` (`c10`), `b11` (`d10`);
  Black escapes `k11` (`i10`), `k12` (`j10`), `l11` (`j10`). Neither can capture
  `f12` or block rank 12. Both kings are mated by the single action. This is the
  **simultaneous snapshot** case: both mates are present in the one post-action
  snapshot (001/D32).
- turn: after the batch, advances from White to Green (Red and Black eliminated).
- outcome: White is credited with both mates, in the fixed order Red then Black;
  White controls the Red and Black armies; Green remains active; no winner yet.

### Fixture 4b — a cascade: a removal reveals a second mate (constructed `[fixture]`)

Preconditions (turn **White**):

- White king `e6`; White rook `a1`; White knights `b3`, `c5`, `d4`, `j4`, `k4`
  (all army white, controller white).
- Red king `b1`; Black king `l1`; Green king `g6` (all active).
- Before the action: rook `a1` checks Red `b1` along rank 1 but is blocked from
  `l1` by the Red king. Red escapes: `a1` (rook, defended by knight `b3`), `a2`
  (rook file), `c2` (knight `d4`), `c1` (knight `b3`); only `b2` is free, so Red
  is in check but not yet mated. Black `l1` and Green `g6` are not in check.

Action: White plays `c5–d3` (knight).

- controller: White.
- state: knight `d3` now covers `b2`, so Red `b1` has no escape, block or
  capture and is mated. Red king `b1` is removed, which unblocks file/rank 1:
  rook `a1` now attacks `c1`–`l1` and checks Black `l1`. Black escapes `k1`
  (rook `a1`), `k2` (knight `j4`), `l2` (knight `k4`) are all covered, so Black
  is mated in the same action.
- turn: after the fixed-point batch, advances from White to Green.
- outcome: White is credited with both mates — the direct mate of Red (in the
  post-action snapshot) and the cascade mate of Black (found in the next
  iteration, step 3, after Red's removal) — processed in the fixed order Red
  then Black; White controls both armies; Green remains active; no winner yet.

### Fixture 4c — algorithmic internal seam: snapshot vs per-removal (reviewed `[fixture]`)

**Not a board position.** This fixture is a fully specified pure-function seam
over an abstract finite state, so the 001/D32 snapshot reading and a per-removal
re-evaluation diverge **without** inventing invalid coordinates (001/D32; the
`[test requirement]` above). Fixtures 4a and 4b stay the reviewed board geometry;
both readings agree on them and neither distinguishes the algorithms. An
independent reviewer accepted this seam with no P0/P1, so §4 batch coding is
unblocked for test-first coding (see the coding-status note above and §8). The
transfer unit used below is 001/D36 as corrected by 001/D37 (both independently reviewed;
001/D37 accepted with no P0/P1).

#### Seam (pure functions)

A **snapshot** `P` is a finite record `{ kings, pieces, attacks }`:

- `kings`: ordered list of `King` records
  `{ id, army, controller, square, escapeCandidates }`, one entry per king still
  on the board. `id` is a stable per-king identity (never the player), `army` and
  `controller` are `white | red | black | green`, `square` is an abstract token,
  and `escapeCandidates` is the finite list of abstract destination tokens for
  that king in `P`.
- `pieces`: ordered list of `Piece = { id, army, controller, square }`, one entry
  per non-king piece still on the board. `id` is stable, `army` is immutable, and
  `controller` is the player who may move it and is re-pointed on assimilation.
- `attacks`: finite list of `{ square, by, source }` — controller `by` attacks
  abstract square `square`; `source` is the `id` of the attacking king or piece.
  Only active controllers contribute attacks (frozen pieces exert none, §3).

**Test oracle only.** The predicates below are this fixture's synthetic oracle,
**not** real mate detection: `escapeCandidates` are the geometry layer's king
destination tokens already filtered for board bounds and occupancy, but **not**
for hostile attacks, and the oracle deliberately omits non-king defenses
(blocking or capturing the checker). It is sound only for this witness; the
production evaluator must be the full 001/D11/§4 mate rule and must never reuse this
oracle.

Derived (pure; same `P` ⇒ same result):

- `inCheck(k, P)` = some `attacks` entry has `square == k.square` and
  `by != k.controller`.
- `isMatedByTestOracle(k, P)` = `inCheck(k, P)` and every `e` in
  `k.escapeCandidates` has an `attacks` entry with `square == e` and
  `by != k.controller`.
- `mateCandidates(P)` = every `King` in `P` with `isMatedByTestOracle` true,
  ordered by the canonical player order `white → red → black → green` on
  `k.controller`, ties broken by `k.id` (001/D30/001/D31).
- `attacksOf(nextKings, nextPieces) -> Attack[]` = the deterministic, pure
  geometry oracle injected by the caller. Production supplies the real geometry
  layer; the red tests supply a **fully tabulated stub** (below). It is the only
  source of `attacks`, so `removeKing` and `applyBatch` have no hidden geometry
  dependency.
- `removeKing(P, id, attacksOf)` = the snapshot
  `{ kings: P.kings − id, pieces: P.pieces, attacks: attacksOf(P.kings − id, P.pieces) }`.
  The removed king's own sourced attacks are gone by construction, and the oracle
  may also return attacks that the king had blocked.
- `applyBatch(P, candidates, actor, attacksOf)` = **atomic** and ordered: delete
  every candidate `King` first, then decide transfers from that full post-batch
  snapshot (never per king). For each controller that owned a mated king: if it
  still has a king in the post-batch snapshot, re-point only the `Piece`s whose
  `army` equals a mated king's `army` to `actor` (001/D36); if the batch removed its
  **last** king, the controller is eliminated and **every** `Piece` it still
  controls transfers to `actor`, across all its armies, including a previously
  assimilated kingless army (001/D37). Each `Piece` transfers at most once (dedup by
  piece), army colour is retained, and only `controller` changes. Emit one
  `award(id, army, to: actor)` event per removed king in canonical order, then
  return the next snapshot
  `{ kings, pieces, attacks: attacksOf(nextKings, nextPieces) }`. No observer sees
  a partially applied batch. If any candidate `id` is absent from `P`, the call
  returns `P` unchanged with no events. In S0–S3 every controller owns exactly
  one king and one army, so this conditional collapses to the single-army case
  and the S2/S3 outputs below are unchanged.
- Driver `adjudicate(P, actor, attacksOf)`: repeat —
  `candidates = mateCandidates(P)`; if empty, stop; else
  `applyBatch(P, candidates, actor, attacksOf)`. No awarded-set filter is needed:
  a removed `King` record is deleted, so its id cannot reappear.

#### Exact inputs

Actor is **White** in every state. Abstract tokens: king squares `qW`, `qR`,
`qB`, `qG`; escapes `eR1`, `eR2` (Red), `eB1`, `eB2` (Black), `eG1`, `eG2`
(Green). Pieces: `white/rook(pWr)`, `red/rook(pRr)`, `black/knight(pBk)`,
`green/bishop(pGb)`; each is written `id(square, army/controller)`.
`escapeCandidates` (unchanged in S0–S3): `white/king(qW) = []`,
`red/king(qR) = [eR1, eR2]`, `black/king(qB) = [eB1, eB2]`,
`green/king(qG) = [eG1, eG2]`.

**S0 — before the action.** Kings `[white/king(qW), red/king(qR), black/king(qB),
green/king(qG)]`, each with `army == controller`. Pieces `[white/rook(pWr,
white/white), red/rook(pRr, red/red), black/knight(pBk, black/black),
green/bishop(pGb, green/green)]`. Attacks: `eR1 ← white (white/rook)`, `eR2 ←
white (white/rook)`, `eB2 ← red (red/king)`, `qB ← white (white/rook)`, `eG1 ←
white (white/rook)`, `eG2 ← white (white/rook)`. Red `qR` is unattacked, Black
`qB` is attacked with Black's escape `eB1` free, Green `qG` is unattacked (its
escapes `eG1`, `eG2` are already White's). `mateCandidates(S0) = []`.

**S1 — after the action.** The abstract White move `a*` adds `qR ← white` and
`eB1 ← white` (both `white/rook`); all S0 attacks and pieces remain. Red `qR` is
now attacked and both Red escapes `eR1`, `eR2` are White's; Black `qB` is
attacked and both Black escapes `eB1` (White) and `eB2` (Red) are hostile. Green
`qG` is still unattacked (the White line to `qG` is blocked by `black/king`;
`eG1`, `eG2` are White's throughout). `mateCandidates(S1) = [red/king,
black/king]` in canonical order.

**Tabulated `attacksOf` stub (tests inject this; `attacksOf` is a pure function
of `(kings, pieces)`, so the stub is deterministic).**

- `attacksOf(S1.kings, S1.pieces) = S1.attacks`.
- `attacksOf(S1.kings − red/king, S1.pieces) = S1.attacks − { eB2 ← red (red/king) }`
  (= S1R.attacks).
- `attacksOf(S2.kings, S2.pieces) = S1.attacks − { eB2 ← red } + { qG ← white (white/rook) }`
  (= S2.attacks).
- `attacksOf(S3.kings, S3.pieces) = S2.attacks` (= S3.attacks).

**S1R — the wrong per-removal probe.** `removeKing(S1, "red/king", attacksOf)`
yields kings `[white/king(qW), black/king(qB), green/king(qG)]` with pieces
unchanged and attacks `S1R.attacks` (the sourced `eB2 ← red` is gone). Black `qB`
is still attacked, but its escape `eB2` is now unattacked, so Black is **not**
mated: `mateCandidates(S1R) = []`. A per-removal evaluator that processes Red
first therefore drops Black.

**S2 — after the first batch.** `applyBatch(S1, ["red/king", "black/king"],
"white", attacksOf)` deletes both kings, re-points `red/rook` and `black/knight`
to `controller == "white"` (their `army` stays `red` / `black`; `white/rook` and
`green/bishop` are untouched), and returns attacks `S2.attacks` with the revealed
`qG ← white`. Kings are `[white/king(qW), green/king(qG)]`; pieces are
`[white/rook(white/white), red/rook(red/white), black/knight(black/white),
green/bishop(green/green)]`; Green `qG` is now attacked and both escapes `eG1`,
`eG2` are White's. Events, canonical order: `award(red/king, red, to: white)`,
`award(black/king, black, to: white)`. `mateCandidates(S2) = [green/king]` — the
cascade from step 3.

**S3 — after the optional cascade batch.** `applyBatch(S2, ["green/king"],
"white", attacksOf)` deletes `green/king`, re-points `green/bishop` to
`controller == "white"` (`army` stays `green`), and returns
`S3.attacks = S2.attacks`. Kings are `[white/king(qW)]`; pieces are
`[white/rook(white/white), red/rook(red/white), black/knight(black/white),
green/bishop(green/white)]`; event `award(green/king, green, to: white)`;
`mateCandidates(S3) = []`. White is the only active controller, so the game is
over with winner White (§7). S3 is the optional step-3 cascade: the
snapshot-vs-per-removal divergence is already fully witnessed by S0/S1/S1R/S2.
Full driver result: `adjudicate(S1, "white", attacksOf)` emits `[red/king,
black/king, green/king]` in that order and ends with only `white/king` on the
board.

#### Divergence, termination and deduplication

- **Divergence (001/D32).** Snapshot reading: `adjudicate(S1, "white", attacksOf)`
  awards `red/king`, `black/king` and the `green/king` cascade. Per-removal
  reading: after `red/king` is removed, `S1R` has no mate, so it awards only
  `red/king` and never reaches the `green/king` cascade. The distinguishing
  assertion is that the snapshot reading awards **`black/king` from S1** even
  though `mateCandidates(S1R) = []`.
- **Finite termination.** `adjudicate` is driven by `|P.kings|`, which strictly
  decreases by at least one on every award iteration and never increases. With
  `K` kings the loop runs at most `K` iterations; here `K = 4`, and it stops
  after two award iterations plus one empty check.
- **King deduplication.** Awarded kings are keyed by `King.id`, not by player: a
  batch deletes each id once, and a deleted `King` record cannot reappear, so no
  awarded-set filter is needed. Two kings under one controller (001/D31) are two
  distinct candidates and two distinct awards, and mating one transfers only
  that king's own army. Every `King.id` is therefore awarded and transferred at
  most once, and the event log contains no duplicate id.

#### RED test expectations (assert exactly)

Written before any §4 batch code, these are expected to fail on a per-removal
implementation and pass only under 001/D32 snapshot semantics. The tests inject the
tabulated `attacksOf` stub above.

1. `mateCandidates(S0)` deep-equals `[]`.
2. `mateCandidates(S1)` deep-equals `[red/king, black/king]` in canonical order.
3. `isMatedByTestOracle(black/king, removeKing(S1, "red/king", attacksOf))` is
   `false`, and `mateCandidates(removeKing(S1, "red/king", attacksOf))`
   deep-equals `[]`.
4. `applyBatch(S1, ["red/king", "black/king"], "white", attacksOf)` yields kings
   `[white/king, green/king]`, the S2 pieces above, and events
   `[award(red/king, red, to: white), award(black/king, black, to: white)]`.
5. After (4): `red/rook.controller === "white"` with `army === "red"`;
   `black/knight.controller === "white"` with `army === "black"`; `white/rook`
   and `green/bishop` unchanged (`white/white`, `green/green`).
6. `mateCandidates(S2)` deep-equals `[green/king]`.
7. `adjudicate(S1, "white", attacksOf)` emits the three awards in the order
   `red/king`, `black/king`, `green/king` and ends at a position whose only king
   is `white/king`.
8. No `King.id` occurs twice in the `adjudicate(S1, "white", attacksOf)` event
   log.
9. `applyBatch(S1, ["absent/king"], "white", attacksOf)` returns `S1` unchanged
   with no events (atomic rejection).
10. Regression guard: `adjudicate(S1, "white", attacksOf)` includes `black/king`.
    This is the assertion a per-removal implementation fails.

### Fixture 4d — an action whose own batch leaves the actor checked (verified `[fixture]`)

This fixture **is** a verified coordinate position (unlike Fixture 4c, which is
an abstract seam) and it witnesses 001/D38 clause (b). It is a **constructed minimal
position**, not a pictured official position.

Preconditions (turn **White**; all four players active):

- White king `a1`; White rook `d4`; White knights `b2`, `f3`, `d3`, `h2` (all
  army white, controller white).
- Red king `e1` (army red, controller red); Black king `l12`, Black rook `h1`,
  Black knight `b4` (army black, controller black); Green king `a12` (army
  green, controller green).

Before the action: White knight `d3` and knight `f3` both check Red `e1`. Red
cannot capture either checking knight (each is a knight's move from `e1`, not
adjacent), and its escape squares `d1` (White knight `b2`), `d2` (White knight
`f3`), `f2` (White knight `d3`) and `f1` (White knight `h2`) are all covered;
only `e2` is free, so Red is **checked but not yet mated**.

Action: White plays `d4–e4` (rook; the `e` file is clear).

- controller: White.
- state before the batch: the move is **safe** — Red `e1` still blocks Black rook
  `h1` from White `a1`. It **mates Red**: rook `e4` attacks `e1` up the `e` file
  and also covers the escape `e2`, so Red has no escape, block or capture.
- 001/D32 batch: Red `e1` is the only snapshot mate, so it is awarded to White and
  removed. Removing it exposes Black rook `h1` along rank 1 to White `a1`
  (`g1`–`b1` are empty), so the acting controller's surviving king `a1` is in
  hostile check after the cascade — 001/D38 clause (b). The cascade stops there
  (White is not mated: rook `e4` could block at `e1`), so no acting king is
  removed.
- expected outcome: `d4–e4` is **rejected atomically**. The Red king stays on
  `e1`, no mate is awarded, White does **not** assimilate the Red army, the board
  is unchanged, the turn stays White and no history event is written.
- classification: `[policy]` (001/D38 clause (b)); the squares are `[fixture]`.

001/D38 clause (a) (self-mate/self-removal) has no verified coordinate witness here:
this fixture isolates clause (b), because the actor's king is checked but not
mated. Clause (a) rests on 001/D30's self-credit absurdity, not on a coordinate
witness.

## 5. Pass and the two-player stalemate draw

### Official basis

- `[official]` spec: "A pass is legal only for an active, non-checkmated player
  with no legal move while **more than two active players remain**."
- `[official]` 001/D25 / tutorial chapter 21: a stalemate with exactly **two active
  players** is a **draw**.
- `[official]` spec: repeated positions, move-count and insufficient-material
  draws are **not** inherited; no automatic result without an authorizing rule.

### Recommended policy

- `[policy]` Pass requires all of: the player is on turn, active, not in check,
  has no legal move, and more than two players are active. It changes no square
  and advances the turn to the next active player; the passing player stays
  active and the pass is a history event.
- `[policy]` With exactly two active players and the player on turn having no
  legal move and not in check, the result is a stalemate **draw** (chapter 21).
- `[policy]` A player with no legal move **while in check** is checkmated, not
  stalemated; the king is removed and the army assimilated (§1, §4).
- `[policy]` **Pass is observed like any turn-advancing action (001/D39/001/D40, scope
  corrected by 001/D41).** A pass changes no square, so it carries no 001/D30/001/D32 batch
  and no phantom batch may be invented for it. The 001/D39/001/D40 next-active
  observation is still taken immediately after the pass, against the resulting
  next active controller N, but it fires **only** for the checked case: if N is
  in hostile **check**, has a non-empty Tier0 set and an empty 001/D38-safe set, the
  pass is rejected atomically with `UnresolvedAdjudicationError` instead of
  advancing into the undecided state. If N is **unchecked** with a non-empty
  Tier0 set but an empty public committed set, the pass is **not** rejected and
  the turn advances to N; when N is then on turn, its move enumeration, `pass()`
  and draw evaluation fail closed under the separate on-turn unresolved state of
  001/D40(3) (001/D41). With `|Tier0| = 0` the ordinary 001/D31 mate and §5
  pass/stalemate-draw rules govern unchanged. This never turns a pass into a
  mate or a draw; the official GAME RULE for that state stays `[open]` (§4,
  001/D39/001/D40/001/D41).

### Fixture 5a — pass with four active players (constructed `[fixture]`)

Preconditions (turn **White**):

- White king `a1`; Red king `a12`; Black king `l12`; Green king `l1` (four
  active players).
- Black rooks `b5` and `c2` (army black, controller black).
- White has no other piece. `a1` is unattacked (`b5` covers file `b`; `c2`
  covers file `c` and rank 2), but `a2` (`c2`), `b1` (`b5`) and `b2` (`b5`,`c2`)
  are all attacked, so the White king has no legal move and is not in check.

Action: White calls `pass()`.

- controller: White.
- state: board unchanged; a pass event is recorded; White remains active.
- turn: advances to Red.
- outcome: legal because more than two players are active and White is not
  checkmated.

### Fixture 5b — two-player stalemate draw (constructed `[fixture]`)

Preconditions: the same position but Red and Green are **eliminated** (their
kings removed), leaving exactly two active players, White and Black. Turn:
White.

Action: White has no legal move and is not in check.

- controller: White.
- state: no move is made; the game ends.
- turn: no further turn.
- outcome: **draw**, no winner (chapter 21). This is the one automatic
  two-player result the rules authorize; it is cited to chapter 21, not inferred
  from chess.js.

## 6. Draw proposal, responses and undo

### Official basis

- `[official]` spec: "A draw requires proposal by the player on turn and
  unanimous agreement of all other active players; a rejected proposal does not
  end play."
- `[official]` spec: out-of-turn administrative actions are sequenced and undone
  as fixtures agree; all state-changing operations are history events.

### Recommended policy

- `[policy]` Only the player on turn may call `proposeDraw()`; the proposal does
  **not** change the turn. The proposer still owes a move if the draw fails.
- `[policy]` Each other active player responds with
  `respondToDraw(player, accept)`. A single rejection rejects the proposal and
  ends nothing; unanimous acceptance completes the draw.
- `[policy]` Proposal and responses are administrative history events. **One
  `undo()` reverses exactly one administrative event** (one proposal or one
  response), restoring the pending votes and leaving the turn unchanged; undoing
  a whole proposal therefore needs one undo per recorded event.
- `[policy]` Frozen and eliminated players do not vote.
- `[policy]` **001/D45 (appended):** a pending offer expires on the next move/pass or
  when a participant is frozen, folded into that one history event so a single `undo()`
  restores the offer; a response against a non-pending offer is a stale vote rejected
  atomically. Fixture 6's undo semantics are unchanged. See
  [`administrative-actions.md`](administrative-actions.md) §1.

### Fixture 6 (constructed `[fixture]`)

Preconditions: the four-army opening position (four active players); turn White.

Action A (accepted): White calls `proposeDraw()`; Red, Black and Green each
`respondToDraw(_, true)`.

- controller: White.
- state: draw completed; game over.
- turn: never changed by the proposal or responses.
- outcome: draw, no winner.

Action B (rejected): White calls `proposeDraw()`; Green responds `false`.

- controller: White.
- state: proposal rejected; no draw; board unchanged.
- turn: still White.
- outcome: play continues; White must move.

Action C (undo): White proposes; Red accepts; then one `undo()`.

- controller: White.
- state: **one `undo()` reverses exactly one administrative event** — here Red's
  acceptance — leaving the proposal pending with votes restored to
  `{Red, Black, Green}`; board unchanged. A second `undo()` would reverse the
  next event (White's proposal).
- turn: still White.
- outcome: the proposal is again awaiting responses; no draw.

## 7. Last active player wins despite frozen kings on the board

### Official basis

- `[official]` spec: "Last surviving active king/controller wins."
- `[official]` spec: frozen armies stay in place; their kings can later be
  checkmated as if alive, but a frozen player is not active.

### Recommended policy

- `[policy]` When exactly one player remains **active**, that player wins, even
  if frozen kings of other players are still on the board. Frozen and eliminated
  players never win.
- `[policy]` The frozen kings remain on the board and remain checkmateable per
  §3; their presence does not delay or prevent the win.
- `[policy]` **001/D45 (appended):** `resign`/`recordTimeLoss`/`recordWalkover` may
  freeze any active target with no phantom mate/assimilation batch, advancing the turn
  clockwise for an on-turn target, preserving it for an off-turn target and awarding a
  remaining lone active controller; an already-inactive target or a terminal game is
  rejected atomically. Fixture 7b's post-terminal rejection is unchanged. See
  [`administrative-actions.md`](administrative-actions.md) §2.

### Fixture 7 (constructed `[fixture]`)

Preconditions (turn **White**):

- White king `a1`; White rook `b10`; White knights `c10`, `d10` (army white,
  controller white).
- Red king `a12` (active).
- Black king `l12` (**frozen**); Green king `l1` (**frozen**).
- Red `a12`, Black `l12` and Green `l1` are not in check; White king `a1` is
  safe.

Action: White plays `b10–a10` (rook).

- controller: White.
- state: rook `a10` checks Red `a12`; Red escapes `a11` (rook `a10`), `b12`
  (knight `c10`) and `b11` (knight `d10`) are covered, so Red is mated. Red king
  `a12` is removed and its surviving army transfers to White; Red is eliminated.
- turn: no active player remains to advance to.
- outcome: **White wins** as the last active player, even though the frozen Black
  king `l12` and Green king `l1` are still on the board.

### Fixture 7b — zero active controllers is unreachable; post-terminal admin rejected (constructed `[fixture]`)

Preconditions (terminal state):

- White king `a1` (active).
- Red king `a12` (**frozen**); Black king `l12` (**frozen**); Green king `l1`
  (**frozen**).
- White is the only active controller, so the game is already over with winner
  White (§7) before any further action.

Action: White calls `resign("white")`.

- controller: White.
- state: rejected atomically — no state change, no history event; the winner
  stays White and the game stays over.
- turn: none; the game is over.
- outcome: `[policy]` (001/D35). Zero active controllers is unreachable through
  sequential valid play: as soon as exactly one active controller remains, that
  player wins and the game is over, so play never reaches zero active.
  Administrative actions (`resign`, `recordTimeLoss`, `recordWalkover`,
  `proposeDraw`, `respondToDraw`, `pass`) are rejected once the game is over; a
  validated in-progress snapshot with zero active controllers is rejected
  atomically, and no automatic draw is fabricated for it. The three frozen kings
  remain on the board but the game is already over.

## 8. Provenance, policies and open items

This is a source-linked, delegated policy table for `001/D30`–`001/D41`.
Independent review accepted the snapshot/transfer seam and the narrow
`001/D38` actor-safety rule; subsequent corrections culminate in `001/D41`.
The final wording of `001/D41` was not independently re-reviewed. The official
game outcome for the checked-non-actor edge remains open; the selected
software behaviour is fail-closed, not a game outcome or an engine-completeness
claim. Fixture evidence and current decisions, rather than old review rounds,
are the implementation contract. **001/D44 (appended):** the owner approved this
fail-closed handling and authorized the bounded, guarded implementation
test-first, superseding the earlier review-condition and no-code holds for that
guarded path only; the official game rule stays `[open]`.

`[official]` (stated or summarized by the sources above, or fixed by the spec and
001/D25/001/D26): the assimilation and indirect-mate award rule (§2); frozen pieces exert
no attacks/defenses while a frozen king is checked as if alive (§3); pass only
with more than two active players and the two-active-player stalemate draw (§5);
draw proposal by the player on turn with unanimous consent and no turn change
(§6); last active player wins (§7); all-active-kings safety (§1).

`[policy]` (direct readings the official material does not spell out case by
case, proposed as delegated decisions): the per-king mate/removal semantics for a
multi-king controller (§1, 001/D31); the deterministic fixed-point award order for
simultaneous and cascading mates (§4, 001/D30), with the corrected non-eliminated
scope and snapshot semantics (§4, 001/D32) and the controller-scope gloss for mate
evaluation only (§1/§4, 001/D33); the mated king's army-colour transfer unit on
assimilation (§0/§4, 001/D36) with the last-king elimination carve-out (§0/§1/§4c,
001/D37);
the frozen-king "hypothetical active defense" reading of 001/D26 (§3, fixture 3c);
frozen pieces as capturable inert obstacles that keep blocking lines until
captured, with a frozen king still uncapturable by a normal move (§3, fixture 3d,
001/D34); zero active controllers unreachable, with post-terminal administrative
actions rejected and zero-active snapshots rejected atomically (§7, fixture 7b,
001/D35); the pre-adjudication safety of a committed action (independently accepted
with no P0/P1), including the self-mate/self-removal clause and the
Tier0-internal-vs-public-committed move-set separation (§4, 001/D38; the 001/D41 error
taxonomy); the operational
fail-closed guard for the checked-non-actor edge as corrected by 001/D40 and 001/D41 (§4,
001/D39/001/D40/001/D41; the official GAME RULE for that state stays `[open]`; 001/D44
records the owner's approval and authorizes the bounded, guarded path test-first,
superseding the earlier review-condition hold and no-code clause for that guarded
implementation only).

`[open]` (official game rule unknown, not `[official]`; the software behaviour is
selected as `[policy]` by 001/D39 as corrected by 001/D40 and 001/D41): the checked non-actor
that has a Tier0 pre-batch defense but zero 001/D38-safe public committed moves (§4,
001/D38).
The ordinary 001/D31 mate detector would not mark it mated and would pass the turn
while it is checked, and detecting mate from the 001/D38-safe public set is not
well-founded, so no advertised **GAME OUTCOME** may depend on this edge and the
claim that the engine is a complete rules library is withheld; an implementation
that encounters it must fail closed atomically with a named
unresolved-adjudication error (`UnresolvedAdjudicationError`), never a draw,
pass, self-award or approximation. A conditional detect-and-error path was
permitted only once the 001/D39/001/D40 review condition was met; 001/D44 records the
owner's approval of the fail-closed handling, so that bounded guarded path may now be
coded test-first, but it never justifies the complete-engine claim and the game rule
stays `[open]`. The narrow actor-safety policy and Fixture 4d were
independently accepted with no P0/P1. At 001/D38 this edge was classified `[blocked]`
and **not** approved; 001/D39 appended a local fail-closed operational guard, and 001/D40
corrects that guard's precedence, makes it explicitly nonrecursive, extends the
observation to `pass()` and every turn-advancing action, scopes load/query
fail-closed to the state's own next active controller, and keeps the witness
constructed and non-durable. 001/D41 adds that a 001/D38 actor-safety rejection is a
decided illegal/uncommittable move (never `UnresolvedAdjudicationError`) and
that the successor guard fires only for a **checked** next active controller,
while the unchecked sibling subcase stays `[open]` as a game rule and fail-closes
only via the separate 001/D40(3) on-turn state. The witness is real and its geometry
was independently accepted with P2 reproducibility gaps only, and the general
assembled commit path and the complete-engine claim remain withheld.

### Open items (not resolved here)

1. **Snapshot-vs-sequential distinction (resolved for §4).** Fixture 4c fully
   specifies the distinguishing test as a pure algorithmic internal seam, and an
   independent reviewer accepted it with no P0/P1, so §4 snapshot-semantics coding
   is unblocked for test-first coding. The production transfer unit is 001/D36 as
   corrected by 001/D37, which an independent reviewer also accepted with no P0/P1,
   so the pure transfer unit may be coded and tested in isolation for test-first
   coding; the assembled commit path remains withheld (001/D38, Open item 3).
2. **Advanced-pawn attack vectors before commitment** are covered by
   `docs/rules/pawn-vectors.md` (001/D28/001/D29), not repeated here.
3. **Checked non-actor with a Tier0 defense but zero 001/D38-safe public moves
   (operational guard 001/D39 as corrected by 001/D40 and 001/D41; official game rule
   `[open]`).** At
   001/D38 this was `[blocked]` with no verified witness; 001/D39 records the real,
   independently accepted coordinate witness
   (`docs/rules/d38-coordinate-search.md` §2–§3: P = White `Kh7`, `Ra12`/`Rl2`,
   `Nc3`/`Nc4`/`Nd8`; Red `Ka1`/`Ba9`/`Nb5`; Black `Ka6`; Green `Kj6`; White
   `l2–l1` is a 001/D38-safe hypothetical candidate whose public commit the 001/D39/001/D40
   guard now rejects, and Q has Red checked with the singleton Tier0 `a9–i1`
   that 001/D38 clause (b) rejects — Q is an internal constructed successor, not a
   committed public state) and selects an operational fail-closed handling, and
   001/D40 corrects its specification: the public committed set is Tier0 filtered
   first by 001/D38 actor safety and then by the local successor guard, so a rejected
   candidate is not listed as a public committable move. 001/D41 then fixes the
   error taxonomy and the guard scope: a 001/D38 actor-safety rejection is a decided
   illegal/uncommittable move handled like any illegal move, and
   `UnresolvedAdjudicationError` is reserved for the guard's open-rule rejection
   and for the on-turn `|Tier0| > 0`/empty-public state. The guard is stated
   only over Tier0 and the 001/D38 filter (nonrecursive, no fixed point, no global
   reachability claim); the guard applies to `pass()` and every other
   turn-advancing action, taken immediately after the action with no phantom
   batch, but fires only for a **checked** next active controller; a separate
   on-turn state (001/D40(3)) fails closed for a turn actor with |Tier0| > 0 and an
   empty public set whether it is checked or not, while |Tier0| = 0 leaves the
   existing 001/D31/§5 mate, pass and two-active-player-stalemate-draw rules
   untouched; and a public load/query fails
   closed **only** relative to that state's own next active controller, any other
   mismatch being deferred to the next-turn assessment. The official GAME RULE
   for the state remains `[open]`/UNKNOWN — 001/D39/001/D40/001/D41 decide no mate, pass, draw,
   elimination or award — and the sibling Tier0/Tier1-mismatch case outside the
   exact condition stays open under 001/D27. 001/D39 supersedes only 001/D38's outdated
   no-witness sentence and, conditionally, its coding hold, and 001/D40 records that
   this review condition is **not yet met** (the MiMo review was stopped and is
   not an approval; the DeepSeek review returned P1s). 001/D44 records the
   owner's approval of this fail-closed handling, so the bounded guarded path may
   now be proposed test-first, while the general assembled commit path and
   public-API completeness still may not be claimed. Red tests for this guard are
   error-only: they assert the `UnresolvedAdjudicationError` and no state change,
   never a game outcome on this `[open]` case.

The two earlier gaps are now resolved as delegated `[policy]`: zero-active
terminal state (001/D35, §7 fixture 7b) and frozen-piece capturability (001/D34, §3
fixture 3d). Both are covered by the independent accept of 001/D33–001/D35 recorded
above.
