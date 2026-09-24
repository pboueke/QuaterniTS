import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Guards the coverage gate against silent skips.
 *
 * Node's built-in `--test-coverage-include` only reports files that a test
 * actually loads, so a source file no test imports would be invisible to the
 * 100% threshold. This test fails when any non-test `.ts` file is unreachable
 * from the test suite, forcing every source file into the measured set.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TEST_SUFFIX = ".test.ts";
const SOURCE_ROOTS = ["src", "toolkit"];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Static relative imports/exports of a TypeScript file.
 *
 * Only declarations Node evaluates at load time count: `import`/`export ...
 * from` statements, including side-effect imports. Dynamic `import()` calls are
 * excluded on purpose: a dormant one never loads its target, so counting it
 * would hide that target from coverage and let the 100% gate pass falsely.
 * Clause-level `import type` / `export type` declarations are erased by Node and
 * are excluded too, while inline `{ type X }` specifiers keep the module loaded
 * and still count. Import/export module specifiers are string literals by
 * grammar, so no runtime shape check is needed.
 */
function staticRelativeImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
  const resolved: string[] = [];
  const add = (specifier: string): void => {
    if (specifier.startsWith(".")) {
      resolved.push(path.resolve(path.dirname(file), specifier));
    }
  };
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly !== true) {
        add((statement.moduleSpecifier as ts.StringLiteral).text);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier !== undefined
    ) {
      add((statement.moduleSpecifier as ts.StringLiteral).text);
    }
  }
  return resolved;
}

function reachableFromTests(): Set<string> {
  const allFiles = SOURCE_ROOTS.flatMap((root) =>
    walk(path.join(REPO_ROOT, root)),
  ).filter((file) => file.endsWith(".ts"));
  const reachable = new Set<string>();
  const queue = allFiles.filter((file) => file.endsWith(TEST_SUFFIX));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || reachable.has(file)) {
      continue;
    }
    reachable.add(file);
    for (const imported of staticRelativeImports(file)) {
      if (!reachable.has(imported)) {
        queue.push(imported);
      }
    }
  }
  return reachable;
}

test("every non-test source file is reachable from the test suite", () => {
  const reachable = reachableFromTests();
  const sourceFiles = SOURCE_ROOTS.flatMap((root) =>
    walk(path.join(REPO_ROOT, root)),
  ).filter((file) => file.endsWith(".ts") && !file.endsWith(TEST_SUFFIX));
  assert.ok(sourceFiles.length > 0, "expected at least one source file");

  const missing = sourceFiles
    .filter((file) => !reachable.has(file))
    .map((file) => path.relative(REPO_ROOT, file));

  assert.deepEqual(
    missing,
    [],
    `source files not imported by any test would be skipped by coverage: ${missing.join(", ")}`,
  );
});

function scan(source: string): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-inventory-"));
  try {
    const file = path.join(dir, "consumer.ts");
    writeFileSync(file, source);
    return staticRelativeImports(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a static import is a reachable dependency", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-inventory-"));
  try {
    const file = path.join(dir, "consumer.ts");
    writeFileSync(file, 'import { live } from "./live.ts";\n');
    assert.deepEqual(staticRelativeImports(file), [
      path.resolve(dir, "live.ts"),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a side-effect import is a reachable dependency", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-inventory-"));
  try {
    const file = path.join(dir, "consumer.ts");
    writeFileSync(file, 'import "./setup.ts";\n');
    assert.deepEqual(staticRelativeImports(file), [
      path.resolve(dir, "setup.ts"),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a dormant dynamic import is not a reachable dependency", () => {
  assert.deepEqual(scan('const load = () => import("./dormant.ts");\n'), []);
});

test("a non-relative static import is ignored", () => {
  assert.deepEqual(scan('import { test } from "node:test";\n'), []);
});

test("a clause-level type-only import or export is not loaded at runtime", () => {
  assert.deepEqual(
    scan(
      'import type { T } from "./types.ts";\nexport type { U } from "./more.ts";\n',
    ),
    [],
  );
});

test("inline type specifiers still keep the module loaded", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-inventory-"));
  try {
    const file = path.join(dir, "consumer.ts");
    writeFileSync(
      file,
      'import { type T } from "./types.ts";\nexport { type U } from "./more.ts";\n',
    );
    assert.deepEqual(staticRelativeImports(file), [
      path.resolve(dir, "types.ts"),
      path.resolve(dir, "more.ts"),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a local export without a module specifier is ignored", () => {
  assert.deepEqual(scan("const x = 1;\nexport { x };\n"), []);
});

test("a non-import statement is ignored", () => {
  assert.deepEqual(scan("const x = 1;\n"), []);
});
