/**
 * TypeScript type-consumption smoke for the packed package's ESM (`import`)
 * declaration condition.
 *
 * `toolkit/scripts/consumer-test.sh` type-checks this file with `tsc` against
 * the installed tarball; it proves the shipped `dist/esm/index.d.ts` resolves
 * and exposes real types (001/D18).
 */
import { Quaternity, createPosition } from "quaternits";
import type {
  CommittableMove,
  FreezeEvent,
  GameOutcome,
  HistoryEvent,
  PendingDraw,
  Position,
  PositionInput,
} from "quaternits";

const input: PositionInput = {
  pieces: [
    { square: "a1", army: "white", type: "king" },
    { square: "e1", army: "white", type: "rook" },
    { square: "a12", army: "red", type: "king" },
    { square: "l12", army: "black", type: "king" },
    { square: "l1", army: "green", type: "king" },
  ],
  controllers: { white: "white", red: "red", black: "black", green: "green" },
  players: { white: "active", red: "active", black: "active", green: "active" },
  turn: "white",
};

const custom: Position = createPosition(input);
const game: Quaternity = new Quaternity(custom);
const moves: CommittableMove[] = game.moves();
const outcome: GameOutcome = game.outcome();

// The 001/D45 administrative surface ships as real declarations too.
const offer: PendingDraw | null = game.pendingDraw();
const freeze: FreezeEvent = game.resign("red");
const events: HistoryEvent[] = [...game.history()];

export const summary = {
  board: custom.board.size,
  turn: game.turn(),
  moves: moves.length,
  outcome: outcome.kind,
  offer: offer === null ? 0 : offer.acceptedBy.length,
  freeze: freeze.action,
  events: events.length,
};
