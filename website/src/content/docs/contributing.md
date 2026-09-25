---
title: Contributing
description: Prerequisites, the spec workflow, rule policy and pull-request etiquette.
---

The canonical contributor guide lives in the repository:
[`CONTRIBUTING.md`](https://github.com/pboueke/QuaterniTS/blob/main/CONTRIBUTING.md),
with the working rules for coding agents in
[`AGENTS.md`](https://github.com/pboueke/QuaterniTS/blob/main/AGENTS.md). This
page summarises the parts a reader of the docs is most likely to need.

## Prerequisites

Every tool command runs inside a **digest-pinned Node container** through
**rootless Podman**. The host needs only rootless Podman, `make`, `bash` and
`git` — no host Node install.

```sh
make preflight   # fail loudly unless rootless Podman is usable
make help        # list targets
make verify      # every real gate
```

`make verify` runs `fmt-check`, `lint`, `types`, `version-check`, `test` (with a
100% line and branch coverage gate), `audit`, `contract-check`, `consumer-test`,
the installed-package `integration` leg, the real `browser-consumer` leg and
`docs-build`. The browser leg's first run pulls a ~2.8 GB Playwright base image
once.

Never weaken a gate to get green: do not raise a coverage threshold, skip a
failing test, add a blanket ignore or stub a check so it passes. Fix the cause,
or stop and report the blocker.

## Rule changes

QuaterniTS must never fall back silently to two-player chess conventions. Before
implementing an ambiguous rule:

1. cite an **official source** (the patent is supporting evidence only);
2. add an **additive** numbered decision to `decisions.md` — never renumber an
   existing `001/D<n>`;
3. add a source-linked expected-outcome fixture; and
4. write a **failing test first** (`001/D11`).

Keep any edge whose official outcome is unknown fail-closed.

## Documentation changes

- The canonical prose lives in `docs/` and is copied into this site at build
  time. Edit the repository file, never a generated page under
  `website/src/content/docs/reference/`.
- The runnable examples in `docs/usage.md` and `docs/compatibility.md` are
  executed by `make test`, so keep them runnable.
- Run `make docs-build` (or the full `make verify`) after changing docs, site
  content or `website/astro.config.mjs`.

## Decisions and the spec

- [Spec 001](https://github.com/pboueke/QuaterniTS/blob/main/docs/spec/active/001-adopt-quaternity/spec.md)
- [Decisions 001/D1–001/D45](https://github.com/pboueke/QuaterniTS/blob/main/docs/spec/active/001-adopt-quaternity/decisions.md)
- [Spec workflow](https://github.com/pboueke/QuaterniTS/blob/main/docs/spec/README.md)
