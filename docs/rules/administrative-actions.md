# Administrative action sequencing (Phase 3 expected-outcome table)

Status: **OWNER-APPROVED POLICY (spec 001/D45).** The owner chose the two
sequencing policies below directly in a structured interview; the proposal,
consent and post-terminal rules they build on are official. This is the
source-linked expected-outcome fixture required by 001/D11: it contains no engine
code and no tests, and it separates `[official]` evidence from `[policy]`
software inference clause by clause.

It refines the shared actions of
[`multiplayer-adjudication.md`](multiplayer-adjudication.md) §6 (Fixture 6) and
§7 (Fixture 7b) — `proposeDraw`, `respondToDraw`, `resign`, `recordTimeLoss` and
`recordWalkover` — without changing the official rules those sections already
record. Every fixture below is a constructed minimal position (`[fixture]`), not
a position pictured by the official sources; where the official material does not
fix a coordinate, the exact squares are the recommended test setup, not an
official claim.

## Sources

| Source                                    | URL                                                                       | Role                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Official illustrated quick rules (PDF)    | <https://play.quaternity.com/static/media/quick_start_rules.ee41e5de.pdf> | Basic rules text; freeze, draw and win rules                 |
| Official basic rules / play page          | <https://www.quaternity.com/play-quaternity>                              | Rules authority (spec)                                       |
| Official tutorial, quick start chapter 18 | <https://play.quaternity.com/how-to-play/quick-start/chapter18>           | Frozen army behaviour                                        |
| Official tutorial, quick start chapter 19 | <https://play.quaternity.com/how-to-play/quick-start/chapter19>           | Frozen pieces exert no attacks/defenses                      |
| Official tutorial, quick start chapter 20 | <https://play.quaternity.com/how-to-play/quick-start/chapter20>           | A frozen king can be checkmated as if alive                  |
| Multiplayer adjudication table            | `docs/rules/multiplayer-adjudication.md`                                  | Pass, draw and last-active fixtures §5–§7 (001/D25, 001/D35) |
| Adopt spec decisions                      | `docs/spec/active/001-adopt-quaternity/decisions.md`                      | 001/D11, 001/D25, 001/D35, 001/D45 policy record             |

## 0. Conventions

- Board: files `a`–`l` (left to right), ranks `1`–`12` (bottom to top), `a1` at
  White's pictured bottom-left corner.
- Armies are `white`, `red`, `black`, `green`. Player status is **active**,
  **frozen** (resigned / declared time loss / walkover) or **eliminated**.
- Turn order is clockwise from White: `white → red → black → green`, skipping
  frozen and eliminated players.
- `[official]` is stated or summarized by the sources above, or fixed by spec 001
  and 001/D25/001/D35. `[policy]` is software inference the official material does
  not spell out, approved by the owner as 001/D45.

## 1. Pending draw offer: lifetime and undo

### Official / spec basis

- `[official]` spec: "A draw requires proposal by the player on turn and
  unanimous agreement of all other active players; a rejected proposal does not
  end play."
- `[official]` §6: only the player on turn may `proposeDraw()`, and the proposal
  does **not** change the turn; each other active player responds with
  `respondToDraw(player, accept)`; a single rejection ends nothing; unanimous
  acceptance completes the draw.
- `[official]` §6: proposal and responses are administrative history events, and
  **one `undo()` reverses exactly one administrative event**.
- `[official]` §6: frozen and eliminated players do not vote.

### Owner-approved policy (001/D45)

- `[policy]` A pending offer — the proposal plus any recorded responses —
  **expires** on the next **move or pass**, or when a **participant is frozen**.
  While an offer is pending every active player is the proposer or a required
  voter, so freezing any active player expires it.
- `[policy]` The expiry is folded into that **one** history event (the move, pass
  or freeze). A single `undo()` of that event reverses the action and restores the
  pending offer and its recorded votes; the expiry is **not** a separate event.
- `[policy]` A response against an offer that is no longer pending is a **stale
  vote** and is rejected atomically.

### Fixture table: draw-offer sequencing (constructed `[fixture]`)

Base positions:

- **P4** (four active corner kings): White `Ka1` (turn); Red `Ka12`; Black
  `Kl12`; Green `Kl1`. All active, none in check, and White `a1` can play
  `a1–a2`.
- **Ps** (stalemate, = §5 Fixture 5a): White `Ka1`; Red `Ka12`; Black `Kl12`;
  Green `Kl1`; Black rooks `b5`, `c2`. White is on turn, not in check and has no
  legal move, so `pass()` is legal with four active players.

| #   | Setup | Action sequence                                                                                        | Expected outcome                                                                                                                                                           | Tag                                     |
| --- | ----- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| O1  | P4    | `proposeDraw()`; White `a1–a2`                                                                         | move committed; turn → Red; the pending offer expires as part of the move event; one `undo()` reverts `a1–a2` and restores the pending offer                               | `[policy]` 001/D45; proposal/consent §6 |
| O2  | Ps    | `proposeDraw()`; White `pass()`                                                                        | pass accepted (four active, no legal move, not in check); White stays active; turn → Red; the offer expires as part of the pass event; one `undo()` restores the offer     | `[policy]` 001/D45; §5                  |
| O3  | P4    | `proposeDraw()`; Black `respondToDraw(black, true)`; Black `resign(black)`                             | Black frozen; the offer expires as part of the freeze event; turn stays White; one `undo()` re-activates Black and restores the pending offer with Black's recorded accept | `[policy]` 001/D45; freeze §7           |
| O4  | P4    | `proposeDraw()`; Black `respondToDraw(black, true)`; White `a1–a2`; Black `respondToDraw(black, true)` | the move expires the offer; the later Black response is a stale vote → rejected atomically (no state change, no event)                                                     | `[policy]` 001/D45                      |

## 2. Freeze via resign / time loss / walkover

### Official / spec basis

- `[official]` spec: players may be active, frozen or eliminated; a frozen player
  is **not active** (§7).
- `[official]` §7/spec: "Last surviving active king/controller wins."
- `[official]` §7 Fixture 7b (001/D35): administrative actions after the game is
  over are rejected, and zero active controllers is unreachable through valid
  play.
- `[official]` 001/D26/§3: frozen pieces stay in place and their kings can later be
  checkmated as if alive; freezing is a status change, not an elimination.

### Owner-approved policy (001/D45)

- `[policy]` `resign`, `recordTimeLoss` and `recordWalkover` may freeze **any
  active target** — the acting player or another — setting that target's status to
  frozen.
- `[policy]` A freeze applies **no phantom mate/assimilation batch**: the board is
  unchanged, no award event is produced, and the frozen kings stay on the board.
- `[policy]` If the target is the **on-turn** player, the turn advances
  **clockwise** to the next active controller.
- `[policy]` If the target is **off-turn**, the current turn is **preserved**.
- `[policy]` If exactly one active controller remains after the freeze, that
  controller **wins** immediately (§7).
- `[policy]` Reject atomically when the target is already inactive
  (frozen/eliminated) or when the game is terminal.

### Fixture table: freeze sequencing (constructed `[fixture]`)

Base positions:

- **P4** as above (White on turn).
- **Pl** (off-turn lone-active setup): White `Ka1` (active, turn); Red `Ka12`
  (**frozen**); Black `Kl12` (**frozen**); Green `Kl1` (active). Freezing Green
  leaves White the only active controller.
- **Pt** (= §7 Fixture 7b, terminal): White `Ka1` active; Red `Ka12`, Black
  `Kl12`, Green `Kl1` frozen; White is the lone active controller, so the game is
  already over.

| #   | Setup                      | Action                               | Expected outcome                                                                                                                          | Tag                                  |
| --- | -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| F1  | P4                         | White `resign(white)` (on turn)      | White frozen; board unchanged, no award batch; turn advances clockwise to Red                                                             | `[policy]` 001/D45; §7               |
| F2  | P4                         | Red `recordTimeLoss(red)` (off turn) | Red frozen; board unchanged; turn stays White                                                                                             | `[policy]` 001/D45                   |
| F3  | Pl                         | Green `resign(green)`                | Green frozen; White is the lone active controller → White wins; the frozen Red/Black/Green kings stay on the board; no assimilation batch | `[policy]` 001/D45, 001/D35, §7      |
| F4  | P4 with Red already frozen | Red `recordWalkover(red)`            | rejected atomically: Red is already inactive (no state change, no history event)                                                          | `[policy]` 001/D45                   |
| F5  | Pt                         | White `resign(white)`                | rejected atomically: the game is already over; the winner stays White                                                                     | `[official]`/`[policy]` 001/D35, §7b |

`resign`, `recordTimeLoss` and `recordWalkover` share this freeze semantics; F1–F3
name one of the three each and F4 names another only to show they are
interchangeable.

A freeze that advances the turn is a turn-advancing action, so it inherits the
existing `001/D40`/`001/D41` observation (a checked next active controller with an
empty public committed set rejects the action atomically); this is the existing
guard applied to a freeze, not new `001/D45` sequencing. An off-turn freeze changes
no turn and takes no observation.

## 3. Clause classification: software inference vs official evidence

`[official]` (stated or summarized by the sources above, or fixed by spec 001 and
001/D25/001/D35): a draw requires a proposal by the on-turn player and the
unanimous consent of all other active players; a rejected proposal does not end
play; proposal and responses are administrative history events with one event per
action and one `undo()` per event; frozen and eliminated players do not vote; a
frozen player is not active while its kings stay on the board and remain
checkmateable; the last active controller wins and post-terminal administrative
actions are rejected.

`[policy]` (software inference the official material does not spell out, approved
by the owner as 001/D45): a pending offer expires on the next move/pass or when a
participant is frozen; the expiry is part of that one event, so a single `undo()`
restores the offer and its recorded votes; a response against a non-pending offer
is a stale vote rejected atomically; `resign`/`recordTimeLoss`/`recordWalkover`
may freeze any active target; a freeze applies no mate/assimilation batch; an
on-turn target advances the turn clockwise while an off-turn target preserves it;
a remaining lone active controller wins; an already-inactive target or a terminal
game is rejected atomically.

## 4. Provenance

These two policies are **owner-approved** (001/D45), not owner-delegated: the
owner selected them directly in a structured interview. The proposal/consent and
post-terminal rules they depend on are official and were already reviewed in
`multiplayer-adjudication.md` §6 Fixture 6 and §7 Fixture 7b. No engine code or
tests accompany this table; these are the test-first fixtures for the later
administrative-action implementation (001/D11). This table decides no outcome on
the `[open]` checked-non-actor edge (001/D39–001/D41).
