/**
 * Structure checks for the packed-package contract.
 *
 * `make consumer-test` proves end to end that the built package works for Node
 * ESM, Node CommonJS and TypeScript consumers, `make integration` proves the
 * same installed tarball can play a compact complete-game lifecycle, and
 * `make browser-consumer` proves a real headless Chromium can run the same
 * installed tarball through an import map. All three, plus the schema-contract
 * `make contract-check`, are inside `make verify`. These straight-line checks
 * keep the manifest, the build wiring and every gate's target/script wiring
 * inside the mandatory gate, so deleting the export map, the `files` allow-list,
 * the snapshot schema export, one `tsc` pass, the lifecycle consumer or the
 * browser leg fails `make verify` instead of silently shipping a package that
 * falls back to `src/` or a script that runs nothing (spec 001/D15, 001/D18).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MAKEFILE = path.join(REPO_ROOT, "Makefile");
const CONSUMER_SCRIPT = path.join(
  REPO_ROOT,
  "toolkit/scripts/consumer-test.sh",
);

/** The package.json fields these checks pin. */
interface Manifest {
  readonly main: string;
  readonly module: string;
  readonly types: string;
  readonly files: readonly string[];
  readonly private: boolean;
  readonly license: string;
  readonly type: string;
  readonly exports: unknown;
  readonly scripts: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
}

/** The build-config fields these checks pin. */
interface BuildConfig {
  readonly extends: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly compilerOptions: {
    readonly outDir: string;
    readonly rootDir: string;
    readonly noEmit: boolean;
    readonly declaration: boolean;
    readonly rewriteRelativeImportExtensions: boolean;
    readonly module?: string;
  };
}

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relative), "utf8")) as T;
}

const pkg = readJson<Manifest>("package.json");
const esmConfig = readJson<BuildConfig>("tsconfig.build.esm.json");
const cjsConfig = readJson<BuildConfig>("tsconfig.build.cjs.json");
const makefileText = readFileSync(MAKEFILE, "utf8");
const consumerScript = readFileSync(CONSUMER_SCRIPT, "utf8");

/** One repository file as text, read lazily so a missing file fails one test. */
function readRepo(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), "utf8");
}

/** Returns the tab-indented recipe lines for `target`, or an empty list. */
function recipeFor(target: string): string[] {
  const lines = makefileText.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${target}:`));
  if (start === -1) {
    return [];
  }
  const recipe: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || !line.startsWith("\t")) {
      break;
    }
    recipe.push(line.slice(1));
  }
  return recipe;
}

/** One named script, failing the test when the manifest has no such script. */
function script(name: string): string {
  const value = pkg.scripts[name];
  assert.ok(value !== undefined, `package.json has no ${name} script`);
  return value;
}

test("the export map points at the built ESM and CJS entry points", () => {
  assert.deepEqual(pkg.exports, {
    ".": {
      import: {
        types: "./dist/esm/index.d.ts",
        default: "./dist/esm/index.js",
      },
      require: {
        types: "./dist/cjs/index.d.ts",
        default: "./dist/cjs/index.js",
      },
    },
    "./schema/quaternits-snapshot-v1.schema.json":
      "./schema/quaternits-snapshot-v1.schema.json",
    "./package.json": "./package.json",
  });
  assert.equal(pkg.main, "./dist/cjs/index.js");
  assert.equal(pkg.module, "./dist/esm/index.js");
  assert.equal(pkg.types, "./dist/esm/index.d.ts");
});

test("the published tarball is built output plus the snapshot schema, and stays unpublished", () => {
  assert.deepEqual(pkg.files, ["dist", "schema"]);
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.type, "module");
});

test("both builds emit declarations from the non-test sources", () => {
  for (const config of [esmConfig, cjsConfig]) {
    assert.equal(config.extends, "./tsconfig.json");
    assert.deepEqual(config.include, ["src/**/*.ts"]);
    assert.deepEqual(config.exclude, ["src/**/*.test.ts"]);
    assert.equal(config.compilerOptions.noEmit, false);
    assert.equal(config.compilerOptions.declaration, true);
    assert.equal(config.compilerOptions.rootDir, "src");
    assert.equal(config.compilerOptions.rewriteRelativeImportExtensions, true);
  }
  assert.equal(esmConfig.compilerOptions.outDir, "dist/esm");
  assert.equal(cjsConfig.compilerOptions.outDir, "dist/cjs");
  assert.equal(cjsConfig.compilerOptions.module, "commonjs");
});

test("the build, consumer and contract-check scripts stay wired to their scripts", () => {
  assert.match(script("build"), /npm run build:esm/);
  assert.match(script("build"), /npm run build:cjs/);
  assert.match(script("build:esm"), /tsconfig\.build\.esm\.json/);
  assert.match(script("build:cjs"), /tsconfig\.build\.cjs\.json/);
  assert.match(script("build"), /toolkit\/scripts\/finalize-build\.mjs/);
  assert.equal(
    script("consumer-test"),
    "bash toolkit/scripts/consumer-test.sh",
  );
  assert.equal(
    script("contract-check"),
    "node toolkit/scripts/contract-check.ts",
  );
  for (const script of [
    "toolkit/scripts/finalize-build.mjs",
    "toolkit/scripts/consumer-test.sh",
    "toolkit/scripts/contract-check.ts",
    "toolkit/consumers/integration-consumer.mjs",
    "schema/quaternits-snapshot-v1.schema.json",
    "toolkit/contract/valid/opening.json",
    "toolkit/contract/invalid/unsupported-version.json",
    "toolkit/contract/drift/duplicate-square.json",
    "toolkit/consumers/esm-consumer.mjs",
    "toolkit/consumers/cjs-consumer.cjs",
    "toolkit/consumers/types-consumer.mts",
    "toolkit/consumers/types-consumer.cts",
    "toolkit/consumers/types-consumer-bad.mts",
  ]) {
    assert.ok(existsSync(path.join(REPO_ROOT, script)), `missing ${script}`);
  }
});

test("the integration script reuses the consumer packaging for the lifecycle fixture", () => {
  assert.equal(
    script("integration"),
    "bash toolkit/scripts/consumer-test.sh --integration",
  );
  assert.match(
    consumerScript,
    /--integration/,
    "consumer-test.sh must accept the optional --integration leg",
  );
  assert.match(
    consumerScript,
    /integration-consumer\.mjs/,
    "consumer-test.sh must run the installed-package lifecycle consumer",
  );
  assert.ok(
    existsSync(
      path.join(REPO_ROOT, "toolkit/consumers/integration-consumer.mjs"),
    ),
    "the installed-package lifecycle consumer must ship as a fixture",
  );
});

test("the Makefile exposes integration as a help-listed target", () => {
  assert.match(makefileText, /^\.PHONY: integration$/m);
  assert.match(
    makefileText,
    /^integration:.*## .*installed-package/m,
    "integration must be help-listed with a description",
  );
  assert.ok(
    recipeFor("integration").some((line) =>
      line.includes("npm run integration"),
    ),
    "expected the integration recipe to run the npm integration script",
  );
});

test("the browser consumer gate runs a real Chromium from a pinned quaternits- image", () => {
  assert.equal(
    script("browser-consumer"),
    "bash toolkit/scripts/consumer-test.sh --browser",
  );
  assert.match(
    consumerScript,
    /--browser/,
    "consumer-test.sh must accept the optional --browser leg",
  );
  assert.match(
    consumerScript,
    /browser-consumer\.mjs/,
    "consumer-test.sh must run the real-browser consumer",
  );
  assert.match(
    consumerScript,
    /browser-consumer-failure-probe\.sh/,
    "consumer-test.sh must prove the browser failure path too, so a hung gate cannot pass",
  );

  const probePath = "toolkit/scripts/browser-consumer-failure-probe.sh";
  assert.ok(
    existsSync(path.join(REPO_ROOT, probePath)),
    `missing ${probePath}`,
  );
  const probe = readRepo(probePath);
  assert.match(
    probe,
    /launch-failure/,
    "the probe must inject a Chromium launch failure after the server starts",
  );
  assert.match(
    probe,
    /close-failure/,
    "the probe must inject a failing browser close as well",
  );
  assert.match(
    probe,
    /timeout "\$\{TIMEOUT_SECONDS\}"/,
    "the probe must bound the driver run, so a hang is detected",
  );
  assert.match(
    probe,
    /-eq 124/,
    "the probe must treat a timeout kill as a hang instead of a pass",
  );

  const fragment = readRepo("toolkit/Makefile.fragment");
  assert.match(
    fragment,
    /^BROWSER_IMAGE \?= quaternits-browser:local$/m,
    "the project browser image tag must begin quaternits-",
  );
  assert.match(
    fragment,
    /^browser-image:/m,
    "expected a help-listed browser image target",
  );
  assert.match(
    fragment,
    /--network=none/,
    "the browser gate must run with no network, so it cannot fetch a shim",
  );

  const containerfile = readRepo("toolkit/Containerfile.browser");
  assert.match(
    containerfile,
    /^FROM mcr\.microsoft\.com\/playwright:v1\.63\.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27$/m,
    "the browser image must derive from the digest-pinned vendor image",
  );
  assert.equal(
    pkg.devDependencies["playwright-core"],
    "1.63.0",
    "the browser driver dependency must be pinned exactly to the image version",
  );

  assert.match(makefileText, /^\.PHONY: browser-consumer$/m);
  assert.match(
    makefileText,
    /^browser-consumer:.*## .*[Bb]rowser/m,
    "browser-consumer must be help-listed with a description",
  );
  assert.ok(
    recipeFor("browser-consumer").some((line) => line.includes("browser-run")),
    "expected the browser-consumer recipe to run inside the browser image",
  );
});

test("the browser fixtures drive a real Chromium over the installed tarball", () => {
  const page = readRepo("toolkit/consumers/browser-page.html");
  assert.match(
    page,
    /<script type="importmap">/,
    "the page must resolve the bare specifier through an import map",
  );
  assert.match(
    page,
    /"quaternits"\s*:\s*"\/pkg\/index\.js"/,
    "the import map must resolve quaternits to the served package entry",
  );
  for (const call of [
    "new Quaternity()",
    ".move(",
    ".snapshot()",
    ".loadSnapshot(",
    ".attackers(",
    ".inCheck(",
  ]) {
    assert.ok(
      page.includes(call),
      `the browser page must exercise ${call} in a real browser`,
    );
  }
  assert.ok(
    page.includes("UnresolvedAdjudicationError"),
    "the browser page must check the documented fail-closed error in a browser",
  );

  const driver = readRepo("toolkit/consumers/browser-consumer.mjs");
  assert.match(
    driver,
    /QTS_INSTALLED_PACKAGE/,
    "the driver must serve the tarball installed by consumer-test.sh",
  );
  assert.match(driver, /"dist", "esm"/, "the driver must serve dist/esm");
  assert.match(
    driver,
    /\.docker-info/,
    "the driver must read the browser image's Playwright driver version",
  );
  assert.match(
    driver,
    /driverVersion/,
    "the driver must compare the installed driver with the image's",
  );
  assert.match(driver, /chromium\.launch/, "the driver must launch Chromium");
  assert.match(
    driver,
    /closeAllConnections/,
    "the driver must close its loopback server on every path, releasing connections too",
  );
  assert.match(
    driver,
    /browser-consumer-failure-probe\.sh/,
    "the driver must point at the probe that covers its failure path",
  );
  assert.match(
    driver,
    /pageerror/,
    "the driver must fail on a page error instead of ignoring it",
  );
});

test("make verify runs every real gate, including the browser consumer", () => {
  const verify = makefileText
    .split("\n")
    .find((line) => line.startsWith("verify:"));
  assert.ok(verify !== undefined, "the Makefile must declare verify");
  for (const gate of [
    "preflight",
    "fmt-check",
    "lint",
    "types",
    "version-check",
    "test",
    "audit",
    "contract-check",
    "consumer-test",
    "integration",
    "browser-consumer",
  ]) {
    assert.match(
      verify,
      new RegExp(`(^|\\s)${gate}(\\s|$)`),
      `make verify must run ${gate}`,
    );
  }
  for (const gate of [
    "contract-check",
    "consumer-test",
    "integration",
    "browser-consumer",
  ]) {
    assert.match(
      makefileText,
      new RegExp(`^${gate}:.*## `, "m"),
      `${gate} must stay help-listed`,
    );
  }
  assert.ok(
    !makefileText
      .split("\n")
      .some((line) => line.includes("Pending and intentionally absent")),
    "nothing stays advertised as pending now that every real gate exists",
  );
});
