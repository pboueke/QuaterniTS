---
title: Snapshots
description: The versioned V1 JSON persistence document, its guaranteed determinism, and strict replay-on-load validation.
---

`snapshot()` returns the versioned **V1 JSON persistence document** and
`loadSnapshot(value)` restores a game from one (`001/D10`). It is this library's
persistence format — there is no FEN, EPD or PGN.

## The document

The top-level object has exactly five required keys:

| Key       | Contents                                                                          |
| --------- | --------------------------------------------------------------------------------- |
| `version` | The document version; currently the constant `1`.                                 |
| `initial` | The replay origin: the starting `Position`.                                       |
| `actions` | The deterministic coordinate action log, replayed through the public API on load. |
| `log`     | The canonical typed event records.                                                |
| `state`   | The resulting position, statuses, turn, pending draw and outcome.                 |

Boards are ordered by file then rank, optional values are explicit `null`s, and a
pawn state always states its `committed` direction (or `null`), so the same game
always produces **byte-identical** output.

## Save and restore

```ts
import { Quaternity } from "quaternits";

const game = new Quaternity();
game.move({ from: "b4", to: "c2" });

const document = game.snapshot();

const restored = new Quaternity();
restored.loadSnapshot(JSON.parse(JSON.stringify(document)));
console.log("version:", document.version, "actions:", document.actions.length);
console.log("restored:", restored.turn(), restored.history().length);
```

## Strict loading

`loadSnapshot` parses, re-validates and then **replays** the action log through
the public actions against a fresh instance. It adopts the result only when the
replay agrees with the serialized `state` and `log`, so a serialized result is
never authoritative. It rejects atomically — leaving the current instance
unchanged — when the document is:

- not an object;
- missing a required key, or carrying an unknown key at any level;
- an unsupported `version`;
- a malformed value or an invalid position; or
- a document whose replay disagrees with its serialized state or events.

## The shipped JSON Schema

The runtime shape is mirrored by
[`schema/quaternits-snapshot-v1.schema.json`](https://github.com/pboueke/QuaterniTS/blob/main/schema/quaternits-snapshot-v1.schema.json),
a draft 2020-12 JSON Schema exported from the package. `make contract-check`
compiles it in strict mode and compares it against runtime-built documents and
the committed valid/invalid/drift fixtures, so the schema, the runtime and the
fixtures cannot drift apart silently.

See the [usage reference](/QuaterniTS/reference/usage/) for the executable
save/restore example, which `make test` runs against the real API.
