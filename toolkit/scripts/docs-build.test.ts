/**
 * Unit and fixture tests for the docs-build gate.
 *
 * `make docs-build` copies the canonical `docs/` pages into the Starlight site,
 * builds it and verifies the output. This suite pins the copy/link rules, the
 * built-output checks and the CLI wiring so a regression fails `make test`
 * instead of silently shipping a broken or diverging site. The real Astro build
 * is invoked by `runAstroBuild`, which this suite exercises directly; the full
 * end-to-end run is `make docs-build` itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE,
  GENERATED_DOCS_DIR,
  REPO_ROOT,
  SITE,
  STATIC_ROUTES,
  astroEntry,
  buildPages,
  collectFiles,
  defaultDeps,
  exitStatus,
  headingTitle,
  linkProblem,
  linkTargets,
  listMarkdown,
  main,
  pageFile,
  readCanonicalSources,
  rewriteCanonicalLinks,
  routeForSource,
  runAstroBuild,
  sha256,
  sha256OfSource,
  verifyDocsBuild,
  withoutTopHeading,
  writeGeneratedPages,
  type CanonicalSource,
  type DocsBuildDeps,
  type GeneratedPage,
} from "./docs-build.ts";

const SCRIPT = fileURLToPath(new URL("./docs-build.ts", import.meta.url));

/** A fixed digest the fixtures put in the canonical-source markers. */
const TEST_HASH = "stub-sha256";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), "quaternits-docs-build-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeFile(root: string, relative: string, content: string): void {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** The canonical sources a fixture build copies. */
function testSources(): CanonicalSource[] {
  return [
    {
      repoPath: "docs/usage.md",
      markdown:
        "# Usage examples\n\nSee [`compatibility.md`](compatibility.md).\n",
    },
    {
      repoPath: "docs/compatibility.md",
      markdown: "# Compatibility\n\nNo links.\n",
    },
  ];
}

/** A source-hash function that records its calls and returns a fixed digest. */
function recordingHash(): {
  readonly calls: string[];
  readonly hash: (repoRoot: string, repoPath: string) => string;
} {
  const calls: string[] = [];
  return {
    calls,
    hash: (repoRoot: string, repoPath: string) => {
      calls.push(`${repoRoot}|${repoPath}`);
      return TEST_HASH;
    },
  };
}

/** A complete, base-prefixed build output for the fixture pages. */
function writeDistFixture(root: string, pages: readonly GeneratedPage[]): void {
  writeFile(root, ".nojekyll", "");
  writeFile(root, "_astro/site.js", 'console.log("site");');
  writeFile(root, "_astro/site.css", "body{}");
  writeFile(
    root,
    "index.html",
    [
      "<!doctype html>",
      `<link rel="canonical" href="${SITE}${BASE}">`,
      `<a href="${BASE}">home</a>`,
      `<a href="${BASE}getting-started/">g</a>`,
      `<a href="${BASE}api/?q=1#top">api</a>`,
      `<a href="${BASE}_astro/site.js">js</a>`,
      `<a href="${BASE}about.html">about</a>`,
      `<a href="https://example.com/">external</a>`,
    ].join("\n"),
  );
  writeFile(root, "about.html", "about");
  writeFile(root, "sitemap-0.xml", `<loc>${SITE}${BASE}</loc>`);
  for (const route of STATIC_ROUTES) {
    if (route === "") {
      continue;
    }
    writeFile(root, `${route}/index.html`, `${route} page`);
  }
  for (const page of pages) {
    writeFile(
      root,
      `${page.route}/index.html`,
      `<div data-canonical-source="${page.repoPath}" data-canonical-sha256="${TEST_HASH}"></div>`,
    );
  }
}

function verifyFixture(
  dir: string,
  pages: readonly GeneratedPage[],
  overrides: Partial<Parameters<typeof verifyDocsBuild>[0]> = {},
): void {
  const recording = recordingHash();
  verifyDocsBuild({
    repoRoot: "/repo",
    distDir: dir,
    pages,
    sha256OfSource: recording.hash,
    ...overrides,
  });
}

test("readCanonicalSources reads every canonical document in a stable order", () => {
  const sources = readCanonicalSources(REPO_ROOT);
  assert.deepEqual(
    sources.map((source) => source.repoPath),
    [
      "docs/usage.md",
      "docs/compatibility.md",
      "docs/rules/administrative-actions.md",
      "docs/rules/d38-coordinate-search.md",
      "docs/rules/multiplayer-adjudication.md",
      "docs/rules/pawn-vectors.md",
      "docs/fixtures/opening-position.md",
      "docs/fixtures/opening-to-terminal-administrative-match.md",
    ],
  );
  for (const source of sources) {
    assert.ok(
      source.markdown.startsWith("# "),
      `${source.repoPath} must start with a top-level heading`,
    );
  }
});

test("listMarkdown lists only Markdown files, sorted", () => {
  withTempDir((dir) => {
    writeFile(dir, "docs/rules/b.md", "# b");
    writeFile(dir, "docs/rules/a.md", "# a");
    writeFile(dir, "docs/rules/notes.txt", "not markdown");
    assert.deepEqual(listMarkdown(dir, "docs/rules"), [
      "docs/rules/a.md",
      "docs/rules/b.md",
    ]);
  });
});

test("routeForSource maps every canonical document to a site route", () => {
  assert.equal(routeForSource("docs/usage.md"), "reference/usage");
  assert.equal(
    routeForSource("docs/compatibility.md"),
    "reference/compatibility",
  );
  assert.equal(
    routeForSource("docs/rules/pawn-vectors.md"),
    "reference/rules/pawn-vectors",
  );
  assert.equal(
    routeForSource("docs/fixtures/opening-position.md"),
    "reference/fixtures/opening-position",
  );
  assert.throws(
    () => routeForSource("docs/other.md"),
    /no site route for canonical document/,
  );
});

test("headingTitle reads the top-level heading", () => {
  assert.equal(headingTitle("# Usage examples\n\nbody\n"), "Usage examples");
  assert.throws(
    () => headingTitle("## Not top level\n"),
    /no top-level heading/,
  );
});

test("withoutTopHeading drops only the top-level heading", () => {
  assert.equal(withoutTopHeading("# Title\n\nbody\n"), "body\n");
  assert.throws(() => withoutTopHeading("body only\n"), /no top-level heading/);
});

test("rewriteCanonicalLinks rewrites canonical cross-links under the site base", () => {
  const routes = new Map<string, string>([
    ["docs/compatibility.md", "reference/compatibility"],
    ["docs/rules/pawn-vectors.md", "reference/rules/pawn-vectors"],
  ]);
  assert.equal(
    rewriteCanonicalLinks(
      "see [`compatibility.md`](compatibility.md).",
      "docs/usage.md",
      routes,
    ),
    `see [\`compatibility.md\`](${BASE}reference/compatibility/).`,
  );
  assert.equal(
    rewriteCanonicalLinks(
      "[x](pawn-vectors.md)",
      "docs/rules/administrative-actions.md",
      routes,
    ),
    `[x](${BASE}reference/rules/pawn-vectors/)`,
  );
});

test("rewriteCanonicalLinks keeps external links, anchors and fragments", () => {
  const routes = new Map<string, string>([
    ["docs/compatibility.md", "reference/compatibility"],
  ]);
  assert.equal(
    rewriteCanonicalLinks(
      "[a](https://example.com/x)",
      "docs/usage.md",
      routes,
    ),
    "[a](https://example.com/x)",
  );
  assert.equal(
    rewriteCanonicalLinks("[a](#anchor)", "docs/usage.md", routes),
    "[a](#anchor)",
  );
  assert.equal(
    rewriteCanonicalLinks("[a](compatibility.md#top)", "docs/usage.md", routes),
    `[a](${BASE}reference/compatibility/#top)`,
  );
});

test("rewriteCanonicalLinks leaves fenced code untouched", () => {
  const routes = new Map<string, string>([
    ["docs/compatibility.md", "reference/compatibility"],
  ]);
  const markdown = [
    "```sh",
    "see [x](compatibility.md)",
    "```",
    "",
    "[y](compatibility.md)",
  ].join("\n");
  assert.equal(
    rewriteCanonicalLinks(markdown, "docs/usage.md", routes),
    [
      "```sh",
      "see [x](compatibility.md)",
      "```",
      "",
      `[y](${BASE}reference/compatibility/)`,
    ].join("\n"),
  );
});

test("rewriteCanonicalLinks fails loudly on an unmapped relative link", () => {
  const routes = new Map<string, string>([
    ["docs/compatibility.md", "reference/compatibility"],
  ]);
  assert.throws(
    () => rewriteCanonicalLinks("[x](missing.md)", "docs/usage.md", routes),
    /no site route for link "missing\.md"/,
  );
});

test("buildPages renders frontmatter, the canonical marker and rewritten links", () => {
  const sources = testSources();
  const pages = buildPages(sources);
  assert.deepEqual(
    pages.map((page) => page.route),
    ["reference/usage", "reference/compatibility"],
  );
  const usage = pages[0];
  assert.ok(usage);
  assert.ok(usage.markdown.startsWith('---\ntitle: "Usage examples"\n'));
  assert.ok(usage.markdown.includes("sidebar:\n  order: 1"));
  assert.ok(
    usage.markdown.includes(
      `data-canonical-source="docs/usage.md" data-canonical-sha256="${sha256(sources[0]?.markdown ?? "")}"`,
    ),
  );
  assert.ok(usage.markdown.includes(`${BASE}reference/compatibility/`));
  assert.ok(usage.markdown.includes("edit/main/docs/usage.md"));
});

test("writeGeneratedPages replaces the generated subtree", () => {
  withTempDir((dir) => {
    writeFile(dir, "reference/stale.md", "# Stale");
    const pages = buildPages([
      { repoPath: "docs/usage.md", markdown: "# Usage\n\nbody\n" },
      {
        repoPath: "docs/rules/pawn-vectors.md",
        markdown: "# Pawn vectors\n\nbody\n",
      },
    ]);
    writeGeneratedPages(path.join(dir, "reference"), pages);
    assert.ok(!existsSync(path.join(dir, "reference/stale.md")));
    assert.ok(!existsSync(path.join(dir, "stale.md")));
    assert.match(
      readFileSync(path.join(dir, "reference/usage.md"), "utf8"),
      /title: "Usage"/,
    );
    assert.ok(
      existsSync(path.join(dir, "reference/rules/pawn-vectors.md")),
      "a nested route must keep its subdirectory",
    );
  });
});

test("sha256OfSource hashes a repository file", () => {
  withTempDir((dir) => {
    writeFile(dir, "docs/usage.md", "# Usage\n");
    assert.equal(sha256OfSource(dir, "docs/usage.md"), sha256("# Usage\n"));
    assert.match(sha256("x"), /^[0-9a-f]{64}$/);
  });
});

test("pageFile maps a route to its output file", () => {
  assert.equal(pageFile(""), "index.html");
  assert.equal(pageFile("api"), "api/index.html");
});

test("collectFiles walks nested output directories", () => {
  withTempDir((dir) => {
    writeFile(dir, "index.html", "");
    writeFile(dir, "_astro/site.js", "");
    writeFile(dir, "reference/rules/pawn-vectors/index.html", "");
    assert.deepEqual(collectFiles(dir), [
      "_astro/site.js",
      "index.html",
      "reference/rules/pawn-vectors/index.html",
    ]);
  });
});

test("linkTargets extracts non-empty href and src attribute values", () => {
  assert.deepEqual(
    linkTargets(
      '<a href="/x">a</a><img src="y.png"><a href="">z</a><a href="/w">',
    ),
    ["/x", "y.png", "/w"],
  );
});

test("linkProblem accepts external links, anchors and resolvable internal links", () => {
  const files = new Set([
    ".nojekyll",
    "index.html",
    "about.html",
    "api/index.html",
    "docs/index.html",
    "_astro/site.js",
  ]);
  for (const accepted of [
    "https://example.com/x",
    "http://example.com/x",
    "mailto:someone@example.com",
    "data:text/plain,x",
    "#top",
    "//cdn.example.com/x",
    BASE,
    `${BASE}api/`,
    `${BASE}api/?q=1#top`,
    `${BASE}_astro/site.js`,
    `${BASE}about.html`,
    `${BASE}about`,
    `${BASE}docs`,
    `${BASE}docs/`,
  ]) {
    assert.equal(linkProblem(accepted, files), null, accepted);
  }
});

test("linkProblem rejects links that leave the base or miss the output", () => {
  const files = new Set(["_astro/site.js", "index.html", "api/index.html"]);
  assert.match(linkProblem("/getting-started/", files) ?? "", /not under/);
  assert.match(linkProblem("api/", files) ?? "", /not under/);
  assert.match(linkProblem(`${BASE}missing/`, files) ?? "", /broken/);
  assert.match(linkProblem(`${BASE}missing.js`, files) ?? "", /broken/);
  assert.equal(linkProblem(BASE, new Set<string>()), `broken link "${BASE}"`);
});

test("verifyDocsBuild accepts a complete, base-prefixed build", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    verifyFixture(dir, pages);
  });
});

test("verifyDocsBuild re-hashes every copied page from its canonical source", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    const recording = recordingHash();
    verifyDocsBuild({
      repoRoot: "/repo",
      distDir: dir,
      pages,
      sha256OfSource: recording.hash,
    });
    assert.deepEqual(recording.calls, [
      "/repo|docs/usage.md",
      "/repo|docs/compatibility.md",
    ]);
  });
});

test("verifyDocsBuild fails on canonical-source drift", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    writeFile(
      dir,
      "reference/usage/index.html",
      '<div data-canonical-source="docs/usage.md" data-canonical-sha256="different"></div>',
    );
    assert.throws(() => verifyFixture(dir, pages), /canonical-source drift/);
  });
});

test("verifyDocsBuild fails when a generated page is missing", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    rmSync(path.join(dir, "reference/compatibility"), {
      recursive: true,
      force: true,
    });
    assert.throws(
      () => verifyFixture(dir, pages),
      /missing generated page reference\/compatibility\/index\.html/,
    );
  });
});

test("verifyDocsBuild fails when a static page or the homepage is missing", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    rmSync(path.join(dir, "api"), { recursive: true, force: true });
    rmSync(path.join(dir, "index.html"), { force: true });
    assert.throws(
      () => verifyFixture(dir, pages),
      /missing page api\/index\.html/,
    );
  });
});

test("the extending guide is retained as a draft, not published", () => {
  const draft = path.join(
    REPO_ROOT,
    "website/src/content/drafts/extending.mdx",
  );
  assert.ok(existsSync(draft));
  assert.match(readFileSync(draft, "utf8"), /SnippetDemo/);
  assert.ok(
    !existsSync(path.join(REPO_ROOT, "website/src/content/docs/extending.mdx")),
  );
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    writeFile(dir, "extending/index.html", "published draft");
    assert.throws(
      () => verifyFixture(dir, pages),
      /draft page.*must not be published/,
    );
  });
});

test("verifyDocsBuild fails without the .nojekyll marker", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    rmSync(path.join(dir, ".nojekyll"), { force: true });
    assert.throws(() => verifyFixture(dir, pages), /missing \.nojekyll/);
  });
});

test("verifyDocsBuild fails when no Astro assets were emitted", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    rmSync(path.join(dir, "_astro"), { recursive: true, force: true });
    assert.throws(
      () => verifyFixture(dir, pages),
      /no _astro assets were emitted/,
    );
  });
});

test("verifyDocsBuild fails without a bundled script", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    rmSync(path.join(dir, "_astro/site.js"), { force: true });
    assert.throws(() => verifyFixture(dir, pages), /no bundled _astro script/);
  });
});

test("verifyDocsBuild fails without a bundled stylesheet", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    rmSync(path.join(dir, "_astro/site.css"), { force: true });
    assert.throws(
      () => verifyFixture(dir, pages),
      /no bundled _astro stylesheet/,
    );
  });
});

test("verifyDocsBuild fails when a broken or off-base link is emitted", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    writeFile(
      dir,
      "404.html",
      `<a href="/getting-started/">off base</a><a href="${BASE}missing/">broken</a>`,
    );
    assert.throws(() => verifyFixture(dir, pages), /not under \/QuaterniTS\//);
  });
});

test("verifyDocsBuild fails on a remote asset reference", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    writeFile(
      dir,
      "_astro/site.js",
      'import "https://cdn.jsdelivr.net/npm/x";',
    );
    assert.throws(
      () => verifyFixture(dir, pages),
      /remote asset reference "cdn\.jsdelivr\.net"/,
    );
  });
});

test("verifyDocsBuild fails when the homepage canonical link is wrong", () => {
  withTempDir((dir) => {
    const pages = buildPages(testSources());
    writeDistFixture(dir, pages);
    writeFile(dir, "index.html", "<!doctype html><p>no canonical</p>");
    assert.throws(
      () => verifyFixture(dir, pages),
      /homepage canonical link is missing or wrong/,
    );
  });
});

test("astroEntry points at the installed Astro CLI", () => {
  assert.equal(
    astroEntry("/repo"),
    path.join("/repo", "node_modules", "astro", "bin", "astro.mjs"),
  );
  assert.ok(existsSync(astroEntry(REPO_ROOT)));
});

test("exitStatus treats a missing status as a failure", () => {
  assert.equal(exitStatus(0), 0);
  assert.equal(exitStatus(7), 7);
  assert.equal(exitStatus(null), 1);
});

test("runAstroBuild invokes the real Astro CLI and reports its result", () => {
  withTempDir((dir) => {
    const result = runAstroBuild(REPO_ROOT, dir);
    assert.equal(typeof result.status, "number");
    assert.equal(typeof result.stdout, "string");
    assert.equal(typeof result.stderr, "string");
  });
});

test("defaultDeps wires the real dependencies and the repository root", () => {
  const deps = defaultDeps();
  assert.equal(deps.repoRoot, REPO_ROOT);
  assert.equal(deps.readCanonicalSources, readCanonicalSources);
  assert.equal(deps.writeGeneratedPages, writeGeneratedPages);
  assert.equal(deps.runAstroBuild, runAstroBuild);
  assert.equal(deps.verifyDocsBuild, verifyDocsBuild);
  assert.equal(deps.sha256OfSource, sha256OfSource);
  assert.equal(typeof deps.log, "function");
  assert.equal(typeof deps.error, "function");
});

function fakeDeps(overrides: Partial<DocsBuildDeps> = {}): DocsBuildDeps {
  return {
    readCanonicalSources: () => [
      { repoPath: "docs/usage.md", markdown: "# Usage\n\nbody\n" },
    ],
    writeGeneratedPages: () => {},
    runAstroBuild: () => ({ status: 0, stdout: "", stderr: "" }),
    verifyDocsBuild: () => {},
    sha256OfSource: () => TEST_HASH,
    log: () => {},
    error: () => {},
    repoRoot: "/repo",
    ...overrides,
  };
}

test("main --help prints usage without building", () => {
  const logs: string[] = [];
  const code = main(
    ["--help"],
    fakeDeps({ log: (message) => logs.push(message) }),
  );
  assert.equal(code, 0);
  assert.match(logs.join("\n"), /Usage: node toolkit\/scripts\/docs-build\.ts/);
});

test("main copies, builds and verifies, then exits cleanly", () => {
  const logs: string[] = [];
  const writes: string[] = [];
  const code = main(
    [],
    fakeDeps({
      writeGeneratedPages: (generatedDir, pages) => {
        writes.push(`${generatedDir}|${pages.length}`);
      },
      log: (message) => logs.push(message),
    }),
  );
  assert.equal(code, 0);
  assert.match(writes[0] ?? "", new RegExp(`${GENERATED_DOCS_DIR}\\|1$`));
  assert.match(logs.join("\n"), /verified the built site under \/QuaterniTS\//);
});

test("main fails loudly when the Astro build fails", () => {
  const errors: string[] = [];
  const code = main(
    [],
    fakeDeps({
      runAstroBuild: () => ({ status: 2, stdout: "", stderr: "boom" }),
      error: (message) => errors.push(message),
    }),
  );
  assert.equal(code, 1);
  assert.match(errors.join("\n"), /astro build exited 2/);
  assert.match(errors.join("\n"), /boom/);
});

test("main reports a thrown Error and a thrown non-Error", () => {
  const errors: string[] = [];
  const failing = fakeDeps({
    readCanonicalSources: () => {
      throw new Error("missing canonical document");
    },
    error: (message) => errors.push(message),
  });
  assert.equal(main([], failing), 1);
  assert.match(errors.join("\n"), /missing canonical document/);

  errors.length = 0;
  const throwing = fakeDeps({
    readCanonicalSources: () => {
      // A non-Error throw exercises the catch block's String(error) path.
      throw "plain string";
    },
    error: (message) => errors.push(message),
  });
  assert.equal(main([], throwing), 1);
  assert.match(errors.join("\n"), /plain string/);
});

test("the CLI runs --help through defaultDeps and exits cleanly", () => {
  const result = spawnSync(process.execPath, [SCRIPT, "--help"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: node toolkit\/scripts\/docs-build\.ts/);
});
