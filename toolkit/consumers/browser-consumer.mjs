/**
 * Real-browser consumer fixture for the packed `quaternits` package
 * (spec 001/D10, 001/D18, Phase 4).
 *
 * Run by `toolkit/scripts/consumer-test.sh --browser` **inside the pinned
 * browser image** (`quaternits-browser:local`, the project-owned tag derived
 * from the digest-pinned official Playwright image in
 * `toolkit/Containerfile.browser`), never from the repository sources: the
 * driver serves the `dist/esm` of the tarball that `consumer-test.sh` installed
 * in a disposable directory, and a real headless Chromium loads it through an
 * import map (`toolkit/consumers/browser-page.html`). The container runs with
 * `--network=none`, so the page can only ever load that installed package.
 *
 * Where the Node consumers prove the package works in Node, this leg proves the
 * same installed tarball works in a browser: `node:` imports would fail there,
 * and a browser is the consumer the package must not break.
 *
 * Invariants the driver checks rather than assumes:
 *
 * - the installed npm `playwright-core` version **equals** the browser image's
 *   Playwright driver version, because Playwright cannot locate the browsers
 *   when the two drift (update `package.json` and the image digest together);
 * - the image exposes the browsers the driver expects
 *   (`PLAYWRIGHT_BROWSERS_PATH`), so it never downloads one;
 * - the served package ships no `src/`, so the browser cannot fall back to
 *   sources;
 * - the page raised no error, failed no request and logged no console error, and
 *   every one of its assertions passed.
 *
 * A failure exits non-zero with `browser-consumer: FAILED — <reason>`: an
 * unloadable module, a missing browser, a version mismatch or one failed page
 * assertion all fail the gate loudly rather than reporting a green browser run.
 * Cleanup is unconditional: the loopback server is closed whether Chromium
 * launched, failed to launch or failed to close, because a server left listening
 * keeps the Node event loop alive and would hang the gate instead of failing it
 * (the failure path is probed by
 * `toolkit/scripts/browser-consumer-failure-probe.sh`).
 *
 * This is a packaging/consumer gate, not a gameplay fixture: it decides no game
 * outcome and leaves the `[open]` checked-non-actor edge as documented
 * (001/D39–001/D41, 001/D44).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const PAGE_FILE = fileURLToPath(
  new URL("./browser-page.html", import.meta.url),
);

/** Where the pinned browser image keeps its browsers and driver metadata. */
const BROWSERS_PATH = "/ms-playwright";
const IMAGE_INFO = path.join(BROWSERS_PATH, ".docker-info");

/**
 * Fail loudly unless the pinned npm driver matches the browser image and the
 * image exposes its browsers. Returns the shared driver version.
 */
function assertDriverMatchesImage() {
  const image = JSON.parse(readFileSync(IMAGE_INFO, "utf8"));
  const driver = require("playwright-core/package.json");
  assert.equal(
    driver.version,
    image.driverVersion,
    "the pinned playwright-core version must equal the browser image's Playwright driver version, or Playwright cannot locate the browsers; update package.json and toolkit/Containerfile.browser together (toolkit/README.md)",
  );
  assert.equal(
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    BROWSERS_PATH,
    "the pinned browser image must expose PLAYWRIGHT_BROWSERS_PATH, or the driver would download browsers",
  );
  return String(driver.version);
}

/** The installed tarball's built ESM directory, or a loud failure. */
function installedEsmRoot() {
  const installed = process.env.QTS_INSTALLED_PACKAGE;
  assert.ok(
    installed !== undefined && installed.length > 0,
    "QTS_INSTALLED_PACKAGE must name the package the consumer script installed",
  );
  const packageRoot = path.resolve(installed);
  const esmRoot = path.join(packageRoot, "dist", "esm");
  assert.ok(
    existsSync(path.join(esmRoot, "index.js")),
    `the installed package has no built ESM entry point (${esmRoot}/index.js)`,
  );
  assert.ok(
    !existsSync(path.join(packageRoot, "src")),
    "the installed package ships src/, so the browser could fall back to sources",
  );
  return esmRoot;
}

/**
 * Serve the browser page at `/` and the installed package's `dist/esm` at
 * `/pkg/`, on loopback inside the container. Only `.js` files under the
 * installed ESM directory are reachable, so the page cannot be pointed at the
 * repository sources.
 */
function servePage(esmRoot) {
  const page = readFileSync(PAGE_FILE, "utf8");
  const server = createServer((request, response) => {
    const requestPath = (request.url ?? "/").split("?")[0] ?? "/";
    const notFound = () => {
      response.writeHead(404);
      response.end();
    };
    if (requestPath === "/" || requestPath === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(page);
      return;
    }
    if (requestPath === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (!requestPath.startsWith("/pkg/")) {
      notFound();
      return;
    }
    const relative = path.posix.normalize(requestPath.slice("/pkg/".length));
    if (relative.startsWith("..") || !relative.endsWith(".js")) {
      notFound();
      return;
    }
    const file = path.join(esmRoot, relative);
    if (!existsSync(file)) {
      notFound();
      return;
    }
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
    });
    response.end(readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(
        typeof address === "object" && address !== null,
        "the local server must be listening before the browser loads the page",
      );
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

/** Drive one real headless Chromium against the installed package. */
async function run() {
  const driver = assertDriverMatchesImage();
  const esmRoot = installedEsmRoot();
  const { server, origin } = await servePage(esmRoot);
  // The server is closed on every path, including a Chromium that never
  // launched, so a browser failure reports itself instead of leaving a
  // listening server behind to hang the gate.
  try {
    // Trusted, offline fixtures only. Playwright disables the Chromium sandbox
    // by default and the vendor image documents that its own default root user
    // does the same; the gate states it explicitly instead of hiding it. The
    // image's /dev/shm is small, hence --disable-dev-shm-usage.
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: false,
      args: ["--disable-dev-shm-usage"],
    });
    try {
      const browserVersion = browser.version();
      const pageErrors = [];
      const consoleErrors = [];
      const failedRequests = [];
      const page = await browser.newPage();
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });
      page.on("requestfailed", (request) =>
        failedRequests.push(
          `${request.url()}: ${request.failure()?.errorText}`,
        ),
      );

      await page.goto(`${origin}/`, { waitUntil: "load" });
      try {
        await page.waitForFunction(
          () => globalThis.__qts !== undefined,
          undefined,
          { timeout: 15000 },
        );
      } catch {
        throw new Error(
          `the browser page never reported a result (page errors: ${pageErrors.join(" | ") || "none"}; failed requests: ${failedRequests.join(" | ") || "none"})`,
        );
      }
      const result = await page.evaluate(() => globalThis.__qts);

      assert.deepEqual(
        pageErrors,
        [],
        "the browser page raised an uncaught error",
      );
      assert.deepEqual(
        failedRequests,
        [],
        "the browser page failed to load a resource",
      );
      assert.deepEqual(
        consoleErrors,
        [],
        "the browser page logged a console error",
      );
      assert.equal(
        typeof result,
        "object",
        "the browser page must report its assertion results",
      );
      assert.deepEqual(
        Array.isArray(result?.failures)
          ? result.failures
          : ["no result payload"],
        [],
        "the browser consumer's assertions failed",
      );
      assert.equal(result?.ok, true, "the browser consumer reported a failure");
      assert.ok(
        typeof result?.checks === "number" && result.checks >= 19,
        `expected at least 19 browser assertions, saw ${String(result?.checks)}`,
      );
      return { driver, browserVersion, checks: result.checks };
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
    // Release any keep-alive connection a failed `browser.close()` left open,
    // so cleanup cannot leave the event loop alive either.
    server.closeAllConnections();
  }
}

try {
  const outcome = await run();
  process.stdout.write(
    `browser-consumer: OK (headless Chromium ${outcome.browserVersion} loaded the installed tarball through an import map; ${outcome.checks} assertions, playwright-core ${outcome.driver}, no network)\n`,
  );
} catch (error) {
  process.stderr.write(
    `browser-consumer: FAILED — ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
