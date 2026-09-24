#!/usr/bin/env node
/**
 * Build finalizer for the packed QuaterniTS package.
 *
 * `tsc` rewrites the source `.ts` import specifiers in the emitted JavaScript
 * (`rewriteRelativeImportExtensions`), but it keeps `.ts` specifiers in the
 * emitted `.d.ts` declarations. A published declaration that imports
 * `./board.ts` is unresolvable for consumers — the sources are not shipped and
 * TypeScript rejects a `.ts` specifier unless `allowImportingTsExtensions` is
 * on — so this finalizer rewrites declaration specifiers to their emitted
 * `.js` targets and fails loudly when a rewritten specifier has no emitted
 * file, when a `.ts` specifier survives anywhere under `dist/`, or when an entry
 * point is missing.
 *
 * It also marks `dist/cjs` as CommonJS: the root `package.json` is
 * `"type": "module"`, so the CommonJS build needs its own nested package
 * manifest for `require("quaternits")` to resolve `dist/cjs/index.js` as CJS.
 *
 * Run by `npm run build` after both `tsc` passes. See `toolkit/README.md`.
 */
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DIST = path.join(REPO_ROOT, "dist");
const ENTRY_POINTS = [
  "esm/index.js",
  "esm/index.d.ts",
  "cjs/index.js",
  "cjs/index.d.ts",
];

/** Every relative import/export specifier, with its quote character. */
const RELATIVE_SPECIFIER = /(["'])(\.\.?\/[^"']*)\1/g;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function fail(message) {
  throw new Error(`finalize-build: ${message}`);
}

for (const entry of ENTRY_POINTS) {
  if (!existsSync(path.join(DIST, entry))) {
    fail(`missing emitted entry point dist/${entry}; run both tsc builds`);
  }
}

const declarations = walk(path.join(DIST, "esm"))
  .concat(walk(path.join(DIST, "cjs")))
  .filter((file) => file.endsWith(".d.ts"));

let rewritten = 0;
for (const file of declarations) {
  const original = await readFile(file, "utf8");
  const text = original.replace(
    RELATIVE_SPECIFIER,
    (match, quote, specifier) => {
      if (!specifier.endsWith(".ts")) {
        return match;
      }
      const emitted = `${specifier.slice(0, -3)}.js`;
      const target = path.resolve(path.dirname(file), emitted);
      if (!existsSync(target)) {
        fail(
          `${path.relative(REPO_ROOT, file)} imports ${specifier}, but no emitted ${path.relative(REPO_ROOT, target)} exists`,
        );
      }
      return `${quote}${emitted}${quote}`;
    },
  );
  if (text !== original) {
    await writeFile(file, text);
    rewritten += 1;
  }
}

for (const file of walk(DIST)) {
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(RELATIVE_SPECIFIER)) {
    if (match[2].endsWith(".ts")) {
      fail(
        `${path.relative(REPO_ROOT, file)} keeps a .ts specifier (${match[2]}); the built package must not reference sources`,
      );
    }
  }
}

await writeFile(
  path.join(DIST, "cjs", "package.json"),
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
);

process.stdout.write(
  `finalize-build: rewrote ${rewritten} declaration file(s); dist/cjs marked CommonJS\n`,
);
