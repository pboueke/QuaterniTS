# Agent guidance for QuaterniTS

Portable, tool-agnostic instructions for any coding agent working in this
repository. The product is a headless TypeScript rules library for Quaternity, a
four-player chess-inspired game. It is **not** a UI, server, AI or chess.js
clone.

## Hard rules

- **Never** run `git commit`, `git push`, `git tag`, `git revert`, or otherwise
  rewrite history. The human owner commits. You may edit the working tree and run
  read-only git commands.
- **Never weaken a quality gate to get green.** Do not raise a coverage
  threshold's slack, add blanket ignores, skip a failing test, or stub a pending
  check so it passes. Fix the cause or stop and report a blocker.
- **Confirm before destructive actions** (deleting files outside the task,
  removing the toolkit image/cache, force operations).
- Prepare the MIT-licensed library for open distribution. Keep npm
  `"private": true` until the owner deliberately prepares a package release;
  this is an accidental-publish safeguard, **not** a publication-approval gate.
  The project is unofficial and the license grants no third-party rights
  (`001/D42`, `001/D43`).
- Do not introduce the inherited template product name (the reference
  template's product identifier). It may appear only as quoted provenance inside
  the bootstrap spec.

## Workflow

1. Read the active spec in `docs/spec/active/` and `docs/spec/README.md` first.
2. Spec-only approval precedes implementation. Do not implement ahead of an
   approved spec.
3. Resolve each ambiguous rule with an additive entry in spec 001's
   `decisions.md` (never renumber existing IDs), a source-linked expected-outcome
   example, and a test written before code (`001/D11`). Never fall back silently
   to two-player chess conventions.
4. Make the smallest correct change that follows existing patterns.

## Commands

All tool commands run in the pinned container; the host needs only rootless
Podman, make, bash and git.

```sh
make help        # targets
make verify      # every real gate: preflight + fmt-check + lint + types + test
                 # (100% line/branch) + audit + contract-check + consumer-test
                 # + integration + browser-consumer
make test        # tests with the coverage gate
make types       # tsc --noEmit
make build       # emit the dual ESM/CJS package and declarations into dist/
make consumer-test # pack the build and run Node ESM/CJS + TypeScript consumers
make integration # pack the build and run the installed-package lifecycle fixture
make browser-consumer # pack the build and run it in a real browser (headless Chromium)
make browser-image # build the pinned browser image (large: one Playwright base pull)
make contract-check # runtime snapshots and fixtures vs the shipped JSON Schema
make audit       # HIGH/CRITICAL dependency gate (fails loudly if offline)
```

Every gate above is real and inside `make verify`, including the browser leg:
`make browser-consumer` runs the `consumer-test` build/pack/install leg with
`--browser` inside the pinned Chromium image (`quaternits-browser:local`, derived
in `toolkit/Containerfile.browser` from a digest-pinned official Playwright image)
with `--network=none` and then loads the installed tarball in a real headless
Chromium. Do not weaken or stub these gates, and do not claim a green CI run:
`.github/workflows/ci.yml` runs the same `make verify` on a fresh checkout but no
GitHub run has been observed. The browser image is ~2.8 GB, so its first build
pulls the Playwright base once.

## Authority

- Official basic and illustrated rules first; the pictured board governs the
  opening fixture. The patent is supporting evidence only.
- `docs/fixtures/opening-position.md` records the reviewed opening position and
  its source/exception table.
- `toolkit/README.md` explains the toolchain; `docs/spec/README.md` explains the
  spec workflow.
