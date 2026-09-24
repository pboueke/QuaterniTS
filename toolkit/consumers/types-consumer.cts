/**
 * TypeScript type-consumption smoke for the packed package's CommonJS
 * (`require`) declaration condition.
 *
 * `toolkit/scripts/consumer-test.sh` type-checks this file with `tsc` against
 * the installed tarball; a `.cts` module resolves the `require` condition to
 * `dist/cjs/index.d.ts`, so this proves the CommonJS declarations resolve and
 * expose real types (001/D18).
 */
import { Quaternity, createPosition } from "quaternits";
import type { Position, PositionInput } from "quaternits";

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
const game = new Quaternity(custom);

export const turn: string = game.turn();
