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
2. Add an **additive** numbered decision to
   [`decisions.md`](docs/spec/active/001-adopt-quaternity/decisions.md)
   (`001/D<n>`; never renumber or recycle an existing ID).
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

`.github/workflows/pages.yml` deploys the verified `website/dist` to GitHub
Pages. The published URL, <https://pboueke.github.io/QuaterniTS/>, serves
content only after the owner enables the repository's Pages **GitHub Actions**
source (**Settings → Pages → Build and deployment → Source: GitHub Actions**) and
a deployment succeeds; no GitHub Pages run has been observed yet.

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
- Maintainers own releases: do not remove `"private": true` from
  [`package.json`](package.json) or publish the package. The owner performs that
  deliberate release step (`001/D42`, `001/D43`).

## Where things live

- [`README.md`](README.md) — the project overview and honest limits.
- [`docs/usage.md`](docs/usage.md) and
  [`docs/compatibility.md`](docs/compatibility.md) — public-API examples and the
  compatibility matrix.
- [`docs/rules/`](docs/rules) and [`docs/fixtures/`](docs/fixtures) — rule policy
  and source-linked expected-outcome fixtures.
- [`docs/spec/README.md`](docs/spec/README.md) — the spec workflow.
- [`toolkit/README.md`](toolkit/README.md) — the toolchain and every gate target.
- [`website/`](website) — the Astro/Starlight documentation site and its
  canonical-docs copy.
