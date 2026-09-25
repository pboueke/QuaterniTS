# toolkit

Reproducible, disposable test toolchain for QuaterniTS.

## Why

The local quality gate must match CI and must not depend on whatever Node
happens to be installed on the host. The toolkit runs every check inside a
digest-pinned Node 24 container, using only rootless Podman, make, bash and git
on the host. One pinned toolchain means one authority for tool versions.

## Use

From the repository root:

```sh
make help          # list targets
make preflight     # fail loudly unless rootless Podman is usable
make install-hooks # opt this checkout into .githooks (host-side; no Podman)
make toolkit-image # build the pinned image (once; also runs on demand)
make browser-image # build the pinned browser image (large: one Playwright base pull)
make fmt-check     # Prettier check
make lint          # ESLint
make types         # tsc --noEmit
make test          # tests + 100% line/branch coverage gate
make build         # emit the dual ESM/CJS package and declarations into dist/
make consumer-test # pack the build and run Node ESM/CJS + TypeScript consumers
make integration   # pack the build and run the installed-package lifecycle fixture
make browser-consumer # pack the build and run it in a real browser (headless Chromium)
make contract-check # check runtime snapshots and fixtures against the JSON Schema
make docs-build    # copy, build and verify the GitHub Pages docs site
make docs-preview  # rebuild + serve the docs site at http://127.0.0.1:4321/QuaterniTS/
make audit         # block on unexcepted HIGH/CRITICAL advisories
make version-check # CHANGELOG.md version vs package metadata
make version-sync  # explicit rewrite of version fields; never part of verify
make verify        # every real gate, browser leg included
make clean         # remove stamps and coverage output
make clean-all     # also remove the toolkit/browser images and npm cache volume
```

The image is stateless: nothing is copied into it. The repository is
bind-mounted at `/work` and `npm ci` installs from the frozen
`package-lock.json` (never `npm install`). The image tag
`quaternits-toolkit:local` and named `quaternits-npm-cache` volume use the same
project identity (`001/D43`). The volume caches downloads between runs.
`--userns=keep-id:uid=1000,gid=1000` maps the host user to the container `node`
user so bind-mounted files stay writable without running as root.

## Pinned base images

| Field                             | Value                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Reference                         | `docker.io/library/node:24-bookworm-slim`                                 |
| Digest (multi-arch manifest list) | `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6` |
| Resolved                          | during Phase 1B implementation by `podman pull` + `podman inspect`        |
| Node inside image                 | `v24.21.0`                                                                |
| Project tag                       | `quaternits-toolkit:local` (`toolkit/Containerfile`)                      |

The browser gate additionally runs a project-owned image derived from the
official Playwright image:

| Field                             | Value                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Reference                         | `mcr.microsoft.com/playwright:v1.63.0-noble`                                                                                  |
| Digest (multi-arch manifest list) | `sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`                                                     |
| Resolved                          | during Phase 4 by `curl -I` on the manifest and `podman pull` by digest                                                       |
| Contents                          | Ubuntu 24.04, Node `v24.20.0`/npm 11.19.0, Chromium 153 and the Playwright 1.63.0 driver, but **no** npm `playwright` package |
| Project tag                       | `quaternits-browser:local` (`toolkit/Containerfile.browser`)                                                                  |

The reference must stay MCR-qualified (`mcr.microsoft.com/...`); a
`docker.io/` prefix is rejected by that registry. Playwright cannot locate its
browsers when the image driver and the project's npm `playwright-core` differ, so
`package.json` pins `playwright-core` to exactly the driver version and the
browser driver script fails loudly when the two disagree. Never invent or
hand-edit a digest; re-resolve it and update the Containerfile, the
`playwright-core` version and this table together.

## Gates

- **Formatting** — Prettier (`npm run fmt-check`). `docs/spec/**` is excluded on
  purpose: specs and their append-only decision records stay byte-stable.
- **Linting** — ESLint flat config (`eslint.config.js`), the single authority for
  lint rules.
- **Types** — `tsc --noEmit` over `src/**` and `toolkit/**`.
- **Tests and coverage** — `node --test` with the built-in coverage reporter and
  a **100% line and branch** threshold over `src/**/*.ts` and `toolkit/**/*.ts`.
  The built-in `--test-coverage-include` filter only sees files a test actually
  loads, so `toolkit/scripts/sourceInventory.test.ts` additionally fails if any
  non-test `.ts` file is not reachable from the test suite. That closes the
  "untested file silently skipped" hole without a second coverage tool.
- **Version authority** — `toolkit/scripts/version.ts` takes the top `## <semver>`
  heading of `CHANGELOG.md` as the single authored version. The changelog
  grammar is deliberately narrow — blank lines, exact `## <semver>` headings and
  typed semantic bullets (`feat:`, `fix:`, `chore:`, `docs:`, …) with indented
  wrap lines — so a title, subheading, free prose, untyped bullet or annotated
  heading is rejected rather than ignored. `make version-check` fails closed when
  the changelog is outside that grammar, when `package.json` or either version
  field of `package-lock.json` disagrees, or when the changelog/package JSON is
  unusable. `make version-sync` is the explicit, idempotent way to rewrite only
  those fields from the authority; it is never part of `make verify`, so
  verification never edits files.
- **Audit** — `toolkit/scripts/audit.ts` runs `npm audit --json` and blocks on
  unexcepted HIGH/CRITICAL advisories. If npm cannot produce a real vulnerability
  report (offline registry, npm error, unparseable output), the gate fails loudly
  rather than passing.

### Build and Node consumer test

`make build` runs `npm run build`: two `tsc` passes (`tsconfig.build.esm.json`,
`tsconfig.build.cjs.json`) emit every non-test `src/**/*.ts` module with type
declarations into `dist/esm` (ESM, the package is `"type": "module"`) and
`dist/cjs` (CommonJS), then `toolkit/scripts/finalize-build.mjs` rewrites the
relative `.ts` specifiers `tsc` keeps in the emitted `.d.ts` files to their
emitted `.js` targets and writes the nested `dist/cjs/package.json`
(`{ "type": "commonjs" }`) the CommonJS build needs. `package.json` exports the
built entry points plus the shipped snapshot schema, and `files` is
`["dist", "schema"]`, so the packed tarball ships no sources and no consumer can
fall back to `src/`.

`make consumer-test` runs `toolkit/scripts/consumer-test.sh`, the real Node half
of the Phase 4 built-package consumer test (spec 001/D18). It builds the
package, packs it with `npm pack`, installs the tarball in a disposable
directory outside the repository, and then runs the checked-in fixtures in
`toolkit/consumers/`:

- Node ESM `import` of `quaternits` and Node CommonJS
  `require("quaternits")`, each asserting the reviewed opening position, a
  validated custom position, the attack/check queries, atomic rejection by the
  guarded move seam, a versioned V1 snapshot round trip and that the packed
  package ships no sources;
- `tsc` over `types-consumer.mts` and `types-consumer.cts` for both declaration
  conditions, plus the negative `types-consumer-bad.mts` fixture, which must
  fail with `TS2322` (and not a module-resolution error) so the declarations are
  proven to be real types rather than `any`.

The target runs inside `make verify`, so a green `make verify` does imply the
whole 001/D18 Node gate.

### Installed-package lifecycle (`integration`)

`make integration` runs the same script with `--integration`, so the build,
pack and disposable-directory install happen once instead of being duplicated,
and then runs `toolkit/consumers/integration-consumer.mjs` against the installed
tarball. That fixture is the real installed-package end-to-end check:

1. It starts from the validated four-active custom position of
   `docs/rules/multiplayer-adjudication.md` §4 Fixture 4a, plays one real
   committed move whose §4 snapshot batch mates two controllers, freezes the
   next active controller on time (001/D45) to reach the winner, and then asserts
   the board, retained armies, controllers, statuses, history
   order/awards/selection, the winner, post-terminal atomic rejection, the
   shipped schema subpath, a versioned V1 snapshot round trip into a fresh
   installed `Quaternity` instance, an atomic invalid load, both `undo()` steps
   and `reset()`. It neither proves that the official opening position can reach
   that custom position nor decides the `[open]` checked-non-actor edge.
2. It then plays the **opening-to-terminal administrative match** of
   `docs/fixtures/opening-to-terminal-administrative-match.md` (the executable
   twin of `src/quaternity.test.ts`): the installed package's own reviewed
   opening position, one real committed move per army, a pending draw offer
   expired inside White's next move, and the three `001/D45` freezes into the
   lone-active winner, with the untouched 64-piece board, the offer
   expiry/undo coupling, the V1 snapshot replay and `reset()` asserted. Its
   winner comes from a freeze, not a mate, so it is **not a proof of
   opening-to-mate**.

Both are compact complete-game lifecycle fixtures. The target runs inside
`make verify`.

### Snapshot contract gate

`make contract-check` runs `toolkit/scripts/contract-check.ts`, the real JSON
snapshot/schema gate (spec 001/D10/D15). It compiles
`schema/quaternits-snapshot-v1.schema.json` (draft 2020-12, every object strict)
with the pinned `ajv` dev dependency and then checks three real
acceptance/drift axes:

- snapshots built by driving the public `Quaternity` API, and every committed
  document under `toolkit/contract/valid/`, must be accepted by the schema,
  accepted by `loadSnapshot` and survive a byte-identical reload;
- every document under `toolkit/contract/invalid/` must be rejected by both the
  schema and the loader;
- every document under `toolkit/contract/drift/` must stay schema-valid while
  the loader rejects it, so a schema that loosens or a loader that tightens is
  caught instead of drifting silently.

An empty fixture directory, an unreadable schema and any of those mismatches
fail the gate loudly with a non-zero exit code. The target runs inside
`make verify`.

### Real-browser consumer test (`browser-consumer`)

`make browser-consumer` is the last leg of the built-package consumer test (spec
001/D18): it runs `toolkit/scripts/consumer-test.sh --browser`, so the build,
pack and disposable-directory install happen once, and then drives a **real
headless Chromium** against the installed tarball.

It runs inside the pinned browser image (`quaternits-browser:local`, derived in
`toolkit/Containerfile.browser`) via the fragment's `browser-run` runner, which
uses `--network=none` and `--userns=keep-id:uid=1000,gid=1000`:

- the driver (`toolkit/consumers/browser-consumer.mjs`) serves the installed
  `node_modules/quaternits/dist/esm` on loopback and nothing else, so the page
  cannot fall back to repository sources;
- the page (`toolkit/consumers/browser-page.html`) loads the bare specifier
  `quaternits` through an import map and asserts, in the browser, the 64-piece
  opening position, one committed opening move, an atomic illegal-move
  rejection, the V1 snapshot round trip, an atomic tampered-document rejection,
  the attack/check queries on a validated custom position and the fail-closed
  unresolved-position load;
- the driver fails loudly — non-zero with `browser-consumer: FAILED — …` — on a
  page error, a failed request, a console error, a failed assertion, a missing
  browser or a `playwright-core` that does not match the image's Playwright
  driver, so a broken browser leg can never look green;
- the driver closes its loopback server on **every** path, including a Chromium
  that never launched or a `browser.close()` that failed, because a server left
  listening keeps the Node event loop alive and would hang the gate instead of
  failing it. `toolkit/scripts/browser-consumer-failure-probe.sh`, which this
  leg runs after the real browser run, proves it: it injects a launch failure
  and a failing browser close out of a disposable temporary `playwright-core`
  override (the image, the tarball and the sources stay untouched) and asserts
  each run exits non-zero within a `timeout` bound with a loud
  `browser-consumer: FAILED — …` line instead of stalling;
- the Chromium sandbox is explicitly disabled (`chromiumSandbox: false`) for
  these trusted, offline fixtures, matching Playwright's and the vendor image's
  documented default, and `--disable-dev-shm-usage` works around the image's
  small `/dev/shm`.

The image is large (~2.8 GB), so its first build pulls the Playwright base once
and `.toolkit/quaternits-browser-image.stamp` records it; the target is part of
`make verify`, so a fresh CI runner pays that pull once per run.

### Audit exceptions

Exceptions live in `toolkit/audit-exceptions.json` and are a JSON array of:

```json
{
  "advisory": "GHSA-xxxx-xxxx-xxxx",
  "reason": "why this is safe",
  "expires": "YYYY-MM-DD"
}
```

`advisory` matches either the GHSA id or the advisory URL. A non-empty `reason`
and a future `expires` date are required; an expired or blank exception fails the
gate. Keep the list empty unless a reviewed exception is genuinely needed.

## Rootless Podman preflight

`make preflight` runs `toolkit/scripts/preflight.sh` and fails loudly when
`podman` is missing, when `podman info` cannot report a rootless runtime, or
when Podman is not rootless. It verifies a usable rootless Podman, not that the
pinned image runs; `make verify` starts with it and both git hooks call it, so
an unusable container runtime stops a gate instead of skipping a check or
reporting a fake result, and the gate targets that follow execute the image.

## Delivery: opt-in hooks and GitHub Actions

`.githooks/pre-commit` runs `make preflight fmt-check lint types version-check`;
`.githooks/pre-push` runs the full `make verify`, the same target CI runs. Both
hooks are opt-in and installed explicitly from the repository root by a
host-side target that needs no Podman:

```sh
make install-hooks                        # enable (repo-local core.hooksPath)
git config --local --unset core.hooksPath # disable
```

`make install-hooks` runs `toolkit/scripts/install-hooks.sh` and sets only the
repo-local `core.hooksPath` (never global or system). It is idempotent, refuses
to overwrite a different local hooks path, and fails without mutating a
directory that is not a Git repository.

`.github/workflows/ci.yml` runs for pull requests and pushes to `main`. It
checks out a fresh tree, installs only the rootless Podman host prerequisite
with apt (`podman`, `uidmap`, `slirp4netns`, `netavark`, `aardvark-dns`) plus
the subordinate id ranges rootless Podman needs, then runs `make preflight` and
`make verify` as the unprivileged runner user. It requests `contents: read`,
uses no secrets and declares no service stack, and it never installs Node or
runs npm on the runner: every tool stays inside the digest-pinned image.

**UNPROVEN:** no GitHub run has been observed, so the workflow is a claim only
after the owner pushes it and watches a run. A green `make verify` on a
developer machine is not evidence of a green CI run. Prettier parses this
workflow as YAML during `make fmt-check`, and
`toolkit/scripts/ciWorkflow.test.ts` pins its structure, but neither executes
GitHub Actions.

### Docs site build and GitHub Pages

`make docs-build` runs `toolkit/scripts/docs-build.ts` inside the same pinned
toolkit. It copies the canonical `docs/usage.md`, `docs/compatibility.md`,
`docs/rules/*.md` and `docs/fixtures/*.md` pages into the Astro/Starlight site
under `website/src/content/docs/reference/` with their cross-links rewritten to
the `/QuaterniTS/` routes, runs the real `astro build` into `website/dist`, and
verifies the output: every expected page path, every internal link and asset
under the base, a `.nojekyll` marker, the absence of remote/CDN references, and
a canonical-source marker (source path plus SHA-256) on every copied page. A
missing page, a broken link, a drifted copy or a remote asset fails the target
loudly. The generated subtree, `website/dist` and `website/.astro` are
git-ignored. The target is part of `make verify`.

`.github/workflows/pages.yml` runs on pushes to `main` and manual dispatch. Its
build job installs the same rootless Podman prerequisite as `ci.yml`, runs
`make preflight` then `make docs-build`, configures Pages, and uploads
`website/dist` as the Pages artifact; its deploy job requests only `pages: write`
and `id-token: write` and deploys with the official `configure-pages`,
`upload-pages-artifact` and `deploy-pages` Actions pinned by full commit SHA. It
never pushes to a branch and never runs Node/npm on the runner.

`make docs-preview` is the interactive local view of the same site. It depends
on the phony `docs-build`, so every run rebuilds and re-verifies the site first,
then serves the built output in the same pinned toolkit at
<http://127.0.0.1:4321/QuaterniTS/> — the `/QuaterniTS/` Pages base path, not the
bare port. The port is published on host loopback only and the server is
foreground, so Ctrl-C stops it. It is interactive and never part of
`make verify`.

**Enablement (owner, one-time):** in the repository, open **Settings → Pages →
Build and deployment** and set **Source** to **GitHub Actions**. The site then
serves at <https://pboueke.github.io/QuaterniTS/> after a successful deployment.
No GitHub Pages run has been observed yet, so neither the workflow nor the live
URL is proven.

## Honest limits

Every gate of the built-package and snapshot contract now exists and runs in
`make verify`, so no part of it is stubbed or left pending. Two limits remain:

- the browser image is large (~2.8 GB) and is pulled on a fresh CI runner, so CI
  is slower than the local gate after the first build;
- **CI is still unproven**: no GitHub run has been observed. `make verify` passing
  on a developer machine is not evidence of a green CI run, and Prettier and
  `toolkit/scripts/ciWorkflow.test.ts` check the workflow's structure without
  executing GitHub Actions.

This toolkit proves the toolchain, not the game: the headless engine still has
the documented `[open]` checked-non-actor edge and is not a complete engine.

## Replacement

To replace this toolkit, keep the same interface: a root `Makefile` including a
fragment, one pinned toolkit image plus one pinned browser image, `npm ci` from a
committed lockfile, and independent
`fmt-check`/`lint`/`types`/`test`/`build`/`consumer-test`/`integration`/`browser-consumer`/`contract-check`/`docs-build`/`audit`/`version-check`
targets plus `verify`. Swap the image or tool versions by updating the digests,
the `playwright-core` pin and `package-lock.json` together.
