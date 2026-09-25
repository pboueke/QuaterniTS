# Contributing to QuaterniTS

Thanks for helping improve QuaterniTS, an unofficial, community-driven headless
TypeScript rules library for Quaternity. It is developed in the open for
applications and for the education and research of the game's rules.

By participating you agree to keep this project's original work under MIT and to
contribute no third-party names, rules text, artwork or other assets that this
project is not licensed to redistribute.

## Prerequisites

Every tool command runs inside the digest-pinned toolkit image through rootless
Podman; the host needs only **rootless Podman, make, bash and git**, with no host
Node install. `make preflight` fails loudly unless your container runtime is
usable.

```sh
make help      # list targets
make verify    # every real gate: fmt-check, lint, types, version-check,
               # test (100% line/branch), audit, contract-check, docs-build,
               # consumer-test, integration, browser leg
```

`make verify` includes the real-browser leg, whose first run pulls a ~2.8 GB
Playwright base image once to build the project-owned browser image. For a
documentation-only change, `make fmt-check` plus the relevant check is a fast
start, but run the full `make verify` before requesting review when you can.

Never weaken a gate to get green: do not raise a coverage threshold, skip a
failing test, add a blanket ignore or stub a check so it passes. Fix the cause,
or stop and report the blocker. The 100% line and branch coverage gate is never
lowered.

## Rule changes

QuaterniTS must never fall back silently to two-player chess conventions. Before
implementing an ambiguous rule:

1. Cite an **official source** — the official basic rules or the official
   illustrated quick rules (the patent is supporting evidence only).
2. Add an **additive** numbered decision to the relevant approved spec under
   [`docs/spec/`](docs/spec) (never renumber or recycle an existing ID). The
   proposed official-outcome follow-up, spec 002, is not implementation
   authorization.
3. Add a source-linked expected-outcome **fixture** under
   [`docs/`](docs).
4. Write a **failing test first**, then the smallest change that makes it pass
   (`001/D11`).

Keep the shipped behavior fail-closed for any edge whose official outcome is
unknown; do not invent a mate, pass, draw, elimination or award.

## Documentation site

The browsable documentation is a static Astro/Starlight site under
[`website/`](website). `make docs-build` copies the canonical `docs/` pages into
it with their cross-links rewritten, builds it for the `/QuaterniTS/` base path
and verifies every page, link, asset and canonical-source marker; it is part of
`make verify`.

- Edit the canonical prose in `docs/`, never a generated page under
  `website/src/content/docs/reference/` (that subtree is generated at build time
  and git-ignored).
- Keep the executable examples in `docs/usage.md` and `docs/compatibility.md`
  runnable; `make test` executes them.
- Run `make docs-build` (or the full `make verify`) after changing docs, site
  content or `website/astro.config.mjs`.
- Run `make docs-preview` to browse the built site at
  <http://127.0.0.1:4321/QuaterniTS/>. Press Ctrl-C to stop the server.

`.github/workflows/pages.yml` deploys the verified `website/dist` to
<https://pboueke.github.io/QuaterniTS/>. Enable **GitHub Actions** under
**Settings → Pages → Build and deployment → Source** to deploy this site.

## npmjs.org release handoff (owner)

`quaternits` is an **unscoped npmjs.org package**, not a GitHub Packages npm
package. The manifest pins the intended registry and repository; its
`"private": true` flag remains the accidental-publish safeguard until a
separately reviewed owner release change. Do not publish from an agent session.

1. Choose the release version in `CHANGELOG.md`. With the opt-in hooks
   installed (`make install-hooks`), stage the changelog and attempt the
   commit: pre-commit derives the `package.json` and `package-lock.json`
   versions and the static README badge from its top version heading. If it
   changes any generated file, the hook **stops without staging**. Inspect
   the changes, stage `README.md`, `package.json` and `package-lock.json`
   yourself, then retry. The hook refuses unstaged changelog or generated-file
   edits before syncing. Without the hook, run `make version-sync` manually,
   inspect and stage the same files; `make version-check` and `make verify`
   never rewrite them. Review and commit the release patch, including an
   intentional change to the private flag and its manifest-policy test. Keep
   the built package's bounded
   [scope](https://pboueke.github.io/QuaterniTS/scope/) visible; publishing
   is not a complete-game-rules claim.
2. On that exact release commit, require a passing local `make verify` and a
   successful **fresh-checkout** CI `make verify` result. Confirm the tag you
   create names the same version and commit. Inspect `npm pack --dry-run` from
   the pinned toolkit and the built-package consumer result before any publish.
3. The **first version** cannot use npm staged publishing: the package must
   already exist. The owner authenticates with npmjs.org and 2FA, then makes
   the deliberate first publish to `https://registry.npmjs.org/` from the
   reviewed artifact. Record the published version and check installation in a
   disposable consumer. No agent commits, tags, pushes or publishes.
4. For subsequent versions, configure an npmjs.org **stage-only trusted
   publisher** for a protected GitHub Actions workflow. Permit `id-token: write`
   only in its publish job; use no long-lived npm publish token. First validate
   OIDC inside the pinned Podman toolkit (the npm guide has no container recipe).
   Only then let CI stage a verified artifact for owner inspection and 2FA
   approval. If OIDC cannot be validated inside the toolkit, seek explicit
   approval for a release-only runner exception rather than bypassing the
   project toolchain policy.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [staged publishing](https://docs.npmjs.com/staged-publishing/). GitHub
Packages requires a **different scoped package name** and registry setup;
it cannot serve the documented `npm install quaternits` identity.

## Pull requests

- Keep changes small, focused and consistent with existing patterns.
- Follow the [spec workflow](docs/spec/README.md) and the working rules in
  [`AGENTS.md`](AGENTS.md). Agents must not commit, push, tag or revert; the
  human owner commits.
- Cite decisions as `001/D<n>` and link the fixture or test that proves the
  change.
- Do not claim a green CI result from local checks: a passing `make verify` is
  local evidence only, not CI evidence.
- Do not add official logos, artwork or rulebook text, and do not imply that MIT
  grants rights to any third-party game name, rules text, trademark or other
  asset.

## Where things live

- [`README.md`](README.md) — the project overview and package quick start.
- [`docs/usage.md`](docs/usage.md) and
  [`docs/compatibility.md`](docs/compatibility.md) — public-API examples and the
  compatibility matrix.
- [`docs/rules/`](docs/rules) and [`docs/fixtures/`](docs/fixtures) — rule policy
  and source-linked expected-outcome fixtures.
- [`docs/spec/README.md`](docs/spec/README.md) — the spec workflow.
- [`toolkit/README.md`](toolkit/README.md) — the toolchain and every gate target.
- [`website/`](website) — the Astro/Starlight documentation site and its
  canonical-docs copy.
