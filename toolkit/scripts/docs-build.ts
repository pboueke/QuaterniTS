/**
 * QuaterniTS docs-build: copy the canonical documentation, build the static
 * Astro/Starlight site, and verify the result.
 *
 * The site under `website/` is a presentation and delivery layer, not a game
 * UI and not a release of the package. This script is the one authority for
 * three things and nothing else:
 *
 * - **Copy.** The repository's canonical documents (`docs/usage.md`,
 *   `docs/compatibility.md`, `docs/rules/*.md`, `docs/fixtures/*.md`) are copied
 *   into `website/src/content/docs/reference/` at build time with their
 *   cross-links rewritten to the site's `/QuaterniTS/` routes, so the site never
 *   carries a hand-maintained, diverging copy.
 * - **Build.** `astro build --root website` renders the static site into
 *   `website/dist`. Every asset is local; the site depends on no CDN.
 * - **Verify.** The built output is checked for the expected page paths, working
 *   internal links and assets under the configured base, the copied pages'
 *   canonical-source markers (fail on drift), a `.nojekyll` marker, and the
 *   absence of remote asset references. Any mismatch fails loudly.
 *
 * Coverage of the real Astro build lives in `docs-build.test.ts`; the line that
 * invokes it is `runAstroBuild`.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Repository root, resolved from this file's location in `toolkit/scripts/`. */
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The Astro/Starlight project directory, relative to the repository root. */
export const WEBSITE_DIR = "website";
/** Where the build-time copy of the canonical `docs/` pages is generated. */
export const GENERATED_DOCS_DIR = "website/src/content/docs/reference";
/** The static build output that `.github/workflows/pages.yml` uploads as-is. */
export const DIST_DIR = "website/dist";
/** The GitHub Pages sub-path; it must match the repository name exactly. */
export const BASE = "/QuaterniTS/";
/** The GitHub Pages origin. */
export const SITE = "https://pboueke.github.io";
/** The canonical repository URL used for `editUrl` and cross-links. */
export const REPOSITORY_URL = "https://github.com/pboueke/QuaterniTS";
/** The canonical documents copied into the site, plus every rule/fixture page. */
export const CANONICAL_PAGES: readonly string[] = [
  "docs/usage.md",
  "docs/compatibility.md",
];
/** The directories whose Markdown files are copied into the site. */
export const CANONICAL_DIRECTORIES: readonly string[] = [
  "docs/rules",
  "docs/fixtures",
];
/** The hand-written site routes that every build must contain. */
export const STATIC_ROUTES: readonly string[] = [
  "",
  "getting-started",
  "api",
  "snapshots",
  "rules",
  "scope",
  "contributing",
];
/** Remote asset hosts a self-contained site must never depend on. */
export const FORBIDDEN_REMOTE_ASSETS: readonly string[] = [
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "googletagmanager.com",
  "google-analytics.com",
];

/** One canonical document as read from the repository. */
export interface CanonicalSource {
  /** Repository-relative posix path, such as `docs/rules/pawn-vectors.md`. */
  readonly repoPath: string;
  /** The document's Markdown, byte-for-byte as committed. */
  readonly markdown: string;
}

/** One generated Starlight page copied from a canonical document. */
export interface GeneratedPage {
  /** The canonical document the page was copied from. */
  readonly repoPath: string;
  /** The Starlight route, such as `reference/rules/pawn-vectors`. */
  readonly route: string;
  /** The complete generated Markdown, frontmatter included. */
  readonly markdown: string;
}

/** What `runAstroBuild` reports back. */
export interface AstroBuildResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Everything `verifyDocsBuild` needs, injectable so it stays unit-testable. */
export interface VerifyInput {
  readonly repoRoot: string;
  readonly distDir: string;
  readonly pages: readonly GeneratedPage[];
  readonly sha256OfSource: (repoRoot: string, repoPath: string) => string;
}

/** The real process dependencies, injectable so the gate can be unit tested. */
export interface DocsBuildDeps {
  readonly readCanonicalSources: (repoRoot: string) => CanonicalSource[];
  readonly writeGeneratedPages: (
    generatedDir: string,
    pages: readonly GeneratedPage[],
  ) => void;
  readonly runAstroBuild: (
    repoRoot: string,
    websiteDir: string,
  ) => AstroBuildResult;
  readonly verifyDocsBuild: (input: VerifyInput) => void;
  readonly sha256OfSource: (repoRoot: string, repoPath: string) => string;
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
  readonly repoRoot: string;
}

const USAGE = [
  "Usage: node toolkit/scripts/docs-build.ts [--help]",
  "",
  "Copies the canonical docs/ pages into the Starlight site, builds it into",
  `website/dist for the ${BASE} base path, and verifies pages, links, assets and`,
  "canonical-source drift. Run it through `make docs-build`.",
].join("\n");

/** The hex SHA-256 of a string. */
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** The hex SHA-256 of a repository file. */
export function sha256OfSource(repoRoot: string, repoPath: string): string {
  return sha256(readFileSync(path.join(repoRoot, repoPath), "utf8"));
}

/** The `.md` files of a repository directory as sorted repo-relative paths. */
export function listMarkdown(repoRoot: string, directory: string): string[] {
  return readdirSync(path.join(repoRoot, directory))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => `${directory}/${name}`);
}

/** Read every canonical document, in a stable order. Fails loudly if missing. */
export function readCanonicalSources(repoRoot: string): CanonicalSource[] {
  const repoPaths = [
    ...CANONICAL_PAGES,
    ...CANONICAL_DIRECTORIES.flatMap((directory) =>
      listMarkdown(repoRoot, directory),
    ),
  ];
  return repoPaths.map((repoPath) => ({
    repoPath,
    markdown: readFileSync(path.join(repoRoot, repoPath), "utf8"),
  }));
}

/** The site route a canonical document is copied to. */
export function routeForSource(repoPath: string): string {
  if (repoPath === "docs/usage.md") {
    return "reference/usage";
  }
  if (repoPath === "docs/compatibility.md") {
    return "reference/compatibility";
  }
  const rules = /^docs\/rules\/(.+)\.md$/.exec(repoPath);
  if (rules) {
    return `reference/rules/${rules.slice(1).join("")}`;
  }
  const fixtures = /^docs\/fixtures\/(.+)\.md$/.exec(repoPath);
  if (fixtures) {
    return `reference/fixtures/${fixtures.slice(1).join("")}`;
  }
  throw new Error(`no site route for canonical document ${repoPath}`);
}

/** The document's top-level heading text, used as the page title. */
export function headingTitle(markdown: string): string {
  const match = /^# (.+)$/m.exec(markdown);
  if (!match) {
    throw new Error("canonical document has no top-level heading");
  }
  return match.slice(1).join("").trim();
}

/** The document with its top-level heading removed (Starlight renders it). */
export function withoutTopHeading(markdown: string): string {
  const lines = markdown.split("\n");
  const index = lines.findIndex((line) => /^# /.test(line));
  if (index === -1) {
    throw new Error("canonical document has no top-level heading");
  }
  lines.splice(index, 1);
  return lines.join("\n").replace(/^\n+/, "");
}

/**
 * Rewrite the cross-links between canonical documents to site routes under
 * `BASE`, leaving external links and anchors alone. Fenced code blocks are
 * skipped, and a relative link that has no site route fails loudly rather than
 * shipping a broken link.
 */
export function rewriteCanonicalLinks(
  markdown: string,
  sourcePath: string,
  routes: ReadonlyMap<string, string>,
): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) {
        return line;
      }
      return line.replace(
        /\]\(([^()\s]+)\)/g,
        (whole: string, target: string) => {
          if (/^(https?:|mailto:|#)/.test(target)) {
            return whole;
          }
          const hash = target.indexOf("#");
          const pathPart = hash === -1 ? target : target.slice(0, hash);
          const fragment = hash === -1 ? "" : target.slice(hash);
          const resolved = path.posix.normalize(
            path.posix.join(path.posix.dirname(sourcePath), pathPart),
          );
          const route = routes.get(resolved);
          if (route === undefined) {
            throw new Error(
              `no site route for link "${target}" in ${sourcePath}`,
            );
          }
          return `](${BASE}${route}/${fragment})`;
        },
      );
    })
    .join("\n");
}

/** Reject internal planning language from pages intended for public readers. */
export function assertPublicReference(
  markdown: string,
  sourcePath: string,
): void {
  const internal =
    /\b(?:spec|phase|owner-delegated|assistant|reviewer|reviewed|approved)\b|001\/D\d+/i.exec(
      markdown,
    );
  if (internal) {
    throw new Error(
      `internal development reference "${internal[0]}" in public page ${sourcePath}`,
    );
  }
}

/** Render one generated Starlight page from a canonical document. */
export function renderGeneratedPage(
  source: CanonicalSource,
  routes: ReadonlyMap<string, string>,
  order: number,
): string {
  assertPublicReference(source.markdown, source.repoPath);
  const title = headingTitle(source.markdown);
  const body = rewriteCanonicalLinks(
    withoutTopHeading(source.markdown),
    source.repoPath,
    routes,
  );
  const editUrl = `${REPOSITORY_URL}/edit/main/${source.repoPath}`;
  const digest = sha256(source.markdown);
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `editUrl: ${editUrl}`,
    "sidebar:",
    `  order: ${order}`,
    "---",
    "",
    `<div class="canonical-source" data-canonical-source="${source.repoPath}" data-canonical-sha256="${digest}">`,
    `Canonical source: <code>${source.repoPath}</code>. This page is copied from the repository at build time; edit the repository file, not this page.`,
    "</div>",
    "",
    body,
    "",
  ].join("\n");
}

/** Build every generated page from the canonical sources, in a stable order. */
export function buildPages(
  sources: readonly CanonicalSource[],
): GeneratedPage[] {
  const routes = new Map<string, string>();
  for (const source of sources) {
    routes.set(source.repoPath, routeForSource(source.repoPath));
  }
  return sources.map((source, index) => ({
    repoPath: source.repoPath,
    route: routeForSource(source.repoPath),
    markdown: renderGeneratedPage(source, routes, index + 1),
  }));
}

/** Write the generated pages, replacing any stale copy of the subtree. */
export function writeGeneratedPages(
  generatedDir: string,
  pages: readonly GeneratedPage[],
): void {
  rmSync(generatedDir, { recursive: true, force: true });
  for (const page of pages) {
    const relative = page.route.replace(/^reference\//, "");
    const file = path.join(generatedDir, `${relative}.md`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, page.markdown);
  }
}

/** The build output file for a route; `""` is the homepage. */
export function pageFile(route: string): string {
  return route === "" ? "index.html" : `${route}/index.html`;
}

/** Every file under `directory` as sorted posix-relative paths. */
export function collectFiles(directory: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectFiles(path.join(directory, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files.sort();
}

/** Every non-empty `href`/`src` attribute value in an HTML document. */
export function linkTargets(html: string): string[] {
  return [...html.matchAll(/(?:href|src)="([^"]*)"/g)]
    .map((match) => match.slice(1).join(""))
    .filter((value) => value !== "");
}

/**
 * Whether one link value resolves inside the built site. External URLs,
 * anchors and protocol-relative URLs are not this site's problem; an internal
 * link that is not under `BASE`, or that has no matching output file, is.
 */
export function linkProblem(
  value: string,
  fileSet: ReadonlySet<string>,
): string | null {
  if (/^(https?:|mailto:|data:|#|\/\/)/.test(value)) {
    return null;
  }
  if (!value.startsWith(BASE)) {
    return `internal link "${value}" is not under ${BASE}`;
  }
  const target = value.slice(BASE.length).replace(/[?#].*$/, "");
  if (target === "") {
    return fileSet.has("index.html") ? null : `broken link "${value}"`;
  }
  if (target.endsWith("/")) {
    return fileSet.has(`${target}index.html`) ? null : `broken link "${value}"`;
  }
  if (fileSet.has(target)) {
    return null;
  }
  if (fileSet.has(`${target}/index.html`)) {
    return null;
  }
  if (fileSet.has(`${target}.html`)) {
    return null;
  }
  return `broken link "${value}"`;
}

/** The Astro CLI entry inside the repository's installed dependencies. */
export function astroEntry(repoRoot: string): string {
  return path.join(repoRoot, "node_modules", "astro", "bin", "astro.mjs");
}

/** A spawn result's exit status, treating a signal termination as a failure. */
export function exitStatus(status: number | null): number {
  return status ?? 1;
}

/** Run the real Astro build for the site, offline and without telemetry. */
export function runAstroBuild(
  repoRoot: string,
  websiteDir: string,
): AstroBuildResult {
  const result = spawnSync(
    process.execPath,
    [astroEntry(repoRoot), "build", "--root", websiteDir],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    },
  );
  return {
    status: exitStatus(result.status),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Check the built site: pages, links, assets, canonical markers and no remote assets. */
export function verifyDocsBuild(input: VerifyInput): void {
  const problems: string[] = [];
  const files = collectFiles(input.distDir);
  const fileSet = new Set(files);

  for (const route of STATIC_ROUTES) {
    if (!fileSet.has(pageFile(route))) {
      problems.push(`missing page ${pageFile(route)}`);
    }
  }

  for (const page of input.pages) {
    const file = pageFile(page.route);
    if (!fileSet.has(file)) {
      problems.push(`missing generated page ${file}`);
      continue;
    }
    const html = readFileSync(path.join(input.distDir, file), "utf8");
    const digest = input.sha256OfSource(input.repoRoot, page.repoPath);
    const marker = `data-canonical-source="${page.repoPath}" data-canonical-sha256="${digest}"`;
    if (!html.includes(marker)) {
      problems.push(`canonical-source drift in ${file}: expected ${marker}`);
    }
  }

  if (!fileSet.has(".nojekyll")) {
    problems.push("missing .nojekyll");
  }

  const assets = files.filter((file) => file.startsWith("_astro/"));
  if (assets.length === 0) {
    problems.push("no _astro assets were emitted");
  } else {
    if (!assets.some((file) => file.endsWith(".js"))) {
      problems.push("no bundled _astro script");
    }
    if (!assets.some((file) => file.endsWith(".css"))) {
      problems.push("no bundled _astro stylesheet");
    }
  }

  if (fileSet.has("index.html")) {
    const html = readFileSync(path.join(input.distDir, "index.html"), "utf8");
    if (!html.includes(`rel="canonical" href="${SITE}${BASE}"`)) {
      problems.push("homepage canonical link is missing or wrong");
    }
  }

  for (const file of files) {
    if (!/\.(html|css|js|xml|json)$/.test(file)) {
      continue;
    }
    const text = readFileSync(path.join(input.distDir, file), "utf8");
    for (const host of FORBIDDEN_REMOTE_ASSETS) {
      if (text.includes(host)) {
        problems.push(`remote asset reference "${host}" in ${file}`);
      }
    }
  }

  for (const file of files) {
    if (!file.endsWith(".html")) {
      continue;
    }
    const html = readFileSync(path.join(input.distDir, file), "utf8");
    for (const value of linkTargets(html)) {
      const problem = linkProblem(value, fileSet);
      if (problem !== null) {
        problems.push(`${file}: ${problem}`);
      }
    }
  }

  if (fileSet.has(pageFile("extending"))) {
    problems.push("draft page extending/index.html must not be published");
  }

  if (problems.length > 0) {
    throw new Error(
      `docs-build verification failed:\n  ${problems.join("\n  ")}`,
    );
  }
}

/** The real process dependencies. */
export function defaultDeps(): DocsBuildDeps {
  return {
    readCanonicalSources,
    writeGeneratedPages,
    runAstroBuild,
    verifyDocsBuild,
    sha256OfSource,
    log: console.log,
    error: console.error,
    repoRoot: REPO_ROOT,
  };
}

/** Entry point; returns the process exit code. */
export function main(argv: readonly string[], deps: DocsBuildDeps): number {
  if (argv.includes("--help")) {
    deps.log(USAGE);
    return 0;
  }
  try {
    const sources = deps.readCanonicalSources(deps.repoRoot);
    const pages = buildPages(sources);
    deps.writeGeneratedPages(
      path.join(deps.repoRoot, GENERATED_DOCS_DIR),
      pages,
    );
    deps.log(`docs-build: copied ${pages.length} canonical page(s) from docs/`);
    const build = deps.runAstroBuild(
      deps.repoRoot,
      path.join(deps.repoRoot, WEBSITE_DIR),
    );
    if (build.status !== 0) {
      deps.error(build.stderr.trim());
      deps.error(`docs-build: FAILED — astro build exited ${build.status}`);
      return 1;
    }
    deps.verifyDocsBuild({
      repoRoot: deps.repoRoot,
      distDir: path.join(deps.repoRoot, DIST_DIR),
      pages,
      sha256OfSource: deps.sha256OfSource,
    });
    deps.log(`docs-build: verified the built site under ${BASE}`);
    return 0;
  } catch (error) {
    deps.error(
      `docs-build: FAILED — ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), defaultDeps());
}
