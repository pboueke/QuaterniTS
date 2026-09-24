/**
 * Negative type-consumption fixture: assigning a `Quaternity` where a `number`
 * is required must be rejected by `tsc`.
 *
 * `toolkit/scripts/consumer-test.sh` type-checks this file with the
 * `tsconfig.negative.json` project and requires a `TS2322` error without a
 * module-resolution error, proving the shipped declarations are real types and
 * not `any` (001/D18).
 */
import { Quaternity } from "quaternits";

const notANumber: number = new Quaternity();

export { notANumber };
