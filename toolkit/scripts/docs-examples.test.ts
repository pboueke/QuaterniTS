/**
 * The shipped documentation examples as an executable smoke test.
 *
 * The spec requires runnable examples and a compatibility matrix that match the
 * real public API. Every fenced ```ts block in `docs/usage.md` and
 * `docs/compatibility.md` is extracted, executed in a child Node process and
 * required to print something, so an example that drifts from the API, throws or
 * prints nothing fails `make test` instead of misleading a reader.
 *
 * The one difference from what a reader copies is the import specifier: the
 * documents import the published package name `quaternits`, while this gate
 * rewrites it to the repository's own `src/index.ts` entry point so it can run
 * before any build. The package-name import itself is proven separately by the
 * built-package consumers (`toolkit/consumers/*-consumer.mjs`) and by the
 * installed-package integration leg, which run against the packed tarball.
 *
 * Only `ts` fences are executable; `sh` and `json` fences are documentation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The documents whose TypeScript examples this gate executes. */
const DOCUMENTS = ["docs/usage.md", "docs/compatibility.md"];

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Where a rewritten example imports the library from: the public source entry. */
const SOURCE_ENTRY = pathToFileURL(
  path.join(REPO_ROOT, "src", "index.ts"),
).href;

/**
 * Every fenced ```ts example in `markdown`, in document order. A fence opened
 * with any other tag (`sh`, `json`, …) is skipped, and an unterminated fence at
 * the end of a document yields no example.
 */
function typescriptExamples(markdown: string): string[] {
  const examples: string[] = [];
  let current: string[] | null = null;
  for (const line of markdown.split("\n")) {
    if (current === null) {
      if (line.startsWith("```ts")) {
        current = [];
      }
    } else if (line.startsWith("```")) {
      examples.push(current.join("\n"));
      current = null;
    } else {
      current.push(line);
    }
  }
  return examples;
}

/** Write one example with its package import rewritten, run it, return stdout. */
function runExample(directory: string, index: number, example: string): string {
  const file = path.join(directory, `example-${index + 1}.ts`);
  writeFileSync(
    file,
    example.replaceAll('"quaternits"', JSON.stringify(SOURCE_ENTRY)),
  );
  return execFileSync(process.execPath, [file], { encoding: "utf8" });
}

test("every documented TypeScript example runs against the public API", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "quaternits-docs-"));
  try {
    for (const document of DOCUMENTS) {
      const markdown = readFileSync(path.join(REPO_ROOT, document), "utf8");
      const examples = typescriptExamples(markdown);
      assert.ok(
        examples.length > 0,
        `${document} must contain at least one fenced ts example`,
      );
      examples.forEach((example, index) => {
        const output = runExample(directory, index, example);
        assert.ok(
          output.trim().length > 0,
          `${document} example ${index + 1} must print at least one line`,
        );
      });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the extractor takes only fenced TypeScript examples", () => {
  const markdown = [
    "# Prose",
    "```sh",
    "npm install quaternits",
    "```",
    "```ts",
    'import { Quaternity } from "quaternits";',
    "```",
    "```json",
    "{ }",
    "```",
  ].join("\n");
  assert.deepEqual(typescriptExamples(markdown), [
    'import { Quaternity } from "quaternits";',
  ]);
});
