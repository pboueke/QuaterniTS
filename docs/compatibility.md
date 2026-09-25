# chess.js-style compatibility

This is an orientation guide, not an API compatibility promise.
QuaterniTS borrows chess.js's ergonomic shape where it fits a four-player game,
and nothing more: there is **no** chess.js API, notation or data-format parity,
and no SAN, FEN or PGN support in any form. Method names below are listed so a
reader can find the nearest QuaterniTS call; the notes, not the names, are the
contract. Only names this project is confident about are listed, and chess.js's
own current API is not described here.

| chess.js-style call                           | QuaterniTS call                                                                                  | Status          | Notes                                                                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new Chess()` / `new Chess(fen)`              | `new Quaternity(position?)`                                                                      | partial         | Always the reviewed 64-piece opening position, or a caller-supplied validated `Position` . No FEN constructor.                                                                                              |
| `load(fen)` / `loadPgn(pgn)`                  | `loadSnapshot(value)`                                                                            | renamed         | Strict versioned V1 JSON document: parsed, re-validated and **replayed** through the public API, then adopted only if the replay agrees. No FEN/PGN loader.                                                 |
| `fen()` / `pgn()` / `ascii()`                 | _none_                                                                                           | unsupported     | No FEN, PGN or board rendering. The library is headless and writes no notation; `snapshot()` is its persistence format.                                                                                     |
| `move(move, options)`                         | `move({ from, to, promotion? })`                                                                 | partial         | Long coordinates only, with an explicit promotion choice where a pawn promotes. No SAN input, no `strict`/sloppy parsing.                                                                                   |
| `moves({ square, verbose })`                  | `moves()`                                                                                        | partial         | Only the **publicly committable** moves for the controller on turn; internal moves rejected by the actor-safety or checked-successor filters are never advertised. No per-square or verbose options.        |
| `undo()`                                      | `undo()`                                                                                         | partial         | Reverses exactly one recorded event, including its draw-offer expiry and outcome effects; no half-move or ply-count option.                                                                                 |
| `reset()`                                     | `reset()`                                                                                        | equivalent      | Restores the reviewed opening position and clears the log.                                                                                                                                                  |
| `turn()`                                      | `turn()`                                                                                         | equivalent      | The controller whose turn it is: an army colour (`"white"`, `"red"`, `"black"`, `"green"`).                                                                                                                 |
| `history({ verbose })`                        | `history()`                                                                                      | partial         | Typed event records — moves (with canonical coordinates, captures, pawn transitions, promotion choice and mate awards), passes, draw offers/responses and freezes — not SAN strings.                        |
| `isCheck()`                                   | `inCheck(player)`                                                                                | renamed, scoped | A controller is in check when **any** king it owns is attacked by a hostile controller; an assimilated king counts.                                                                                         |
| `isAttacked(square, color)`                   | `isAttacked(square, controller)`                                                                 | renamed         | The query is by attacker **controller**; `attackers(square, controller)` returns records with each attacker's square, retained army colour and controller.                                                  |
| `isCheckmate()`                               | _no query_                                                                                       | unsupported     | A mate is credited to the controller whose committed action produced the position, and is recorded as an award; the library never adjudicates a mate that no action produced and claims no complete engine. |
| `isStalemate()`                               | `outcome()`                                                                                      | partial         | Only a two-active-controller stalemate is a draw. With more than two active players an immobile, non-mated controller may `pass()` instead.                                                                 |
| `isDraw()`                                    | `outcome()`                                                                                      | partial         | A draw is a unanimously accepted draw offer or a two-active stalemate. No repetition, move-count or insufficient-material rules are authorized.                                                             |
| `isInsufficientMaterial()`                    | _none_                                                                                           | unsupported     | Not authorized by the official sources; no such draw rule exists here.                                                                                                                                      |
| `isThreefoldRepetition()`                     | _none_                                                                                           | unsupported     | Same: no repetition draw is authorized.                                                                                                                                                                     |
| `isDrawByFiftyMoves()`                        | _none_                                                                                           | unsupported     | Same: no move-count draw is authorized.                                                                                                                                                                     |
| `isGameOver()`                                | `outcome().kind !== "in-progress"`                                                               | partial         | True for the lone-active winner, an agreed draw and a two-active stalemate draw.                                                                                                                            |
| `board()` / `get(square)`                     | `position().board`                                                                               | different       | A read-only 12×12 `Map` from square to piece; an empty square is absent rather than `null`, and squares are `a`–`l` × `1`–`12`. Pieces keep army, type and pawn state — never SAN text.                     |
| `put()` / `remove()`                          | `createPosition(input)`                                                                          | different       | No in-place mutation of the board: build and validate a new immutable `Position` through `createPosition` instead.                                                                                          |
| `squareColor()`                               | _none_                                                                                           | unsupported     | The board is 12×12 with no square shading; no such helper exists.                                                                                                                                           |
| `getCastlingRights()` / `setCastlingRights()` | _none_                                                                                           | unsupported     | There is no castling in this game; the rules and the API have no castling rights.                                                                                                                           |
| _no chess.js counterpart_                     | `pass()`, `proposeDraw()`, `respondToDraw()`, `resign()`, `recordTimeLoss()`, `recordWalkover()` | added           | Four-player adjudication and administration: a board-less pass, a draw offer with per-player consent, and the three interchangeable administrative freezes.                                                 |

The same API in one smoke test, including the deliberate gaps:

```ts
import { Quaternity } from "quaternits";

const game = new Quaternity();
console.log("turn:", game.turn());
console.log(
  "commit a coordinate move:",
  game.move({ from: "b4", to: "c2" }).move.from,
);
console.log("has fen():", "fen" in game, "has pgn():", "pgn" in game);
console.log("persistence is the snapshot:", game.snapshot().version);
```

## Formats and notation

- **Persistence:** the versioned V1 JSON snapshot (`snapshot()` / `loadSnapshot()`)
  with the shipped draft 2020-12 JSON Schema. No FEN, EPD or PGN.
- **Move input:** long coordinates (`{ from, to, promotion? }`). No SAN.
- **Move output:** canonical coordinate records plus pawn and award data. No SAN.
- **Board rendering:** none; the library is headless and ships no renderer.
- **Draw rules:** only the outcomes the official sources authorize are decided;
  other unresolved cases fail closed rather than inventing an outcome.
