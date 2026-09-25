---
title: Contributing
description: How to contribute changes to QuaterniTS and its documentation.
---

The full contributor guide is
[`CONTRIBUTING.md`](https://github.com/pboueke/QuaterniTS/blob/main/CONTRIBUTING.md).
The library and this site are separate from the official Quaternity project;
please do not include third-party artwork or rulebook text.

## Work on the library

Development uses a digest-pinned Node toolkit through rootless Podman. The host
needs Podman, `make`, `bash` and `git`:

```sh
make preflight
make verify
```

`make verify` checks formatting, lint, types, tests with 100% line and branch
coverage, dependency advisories, package consumers, browser behavior and the
documentation build. Never weaken a check to get a passing result.

When a rule is ambiguous, cite an official source, document the expected outcome
with a concrete example, write a failing test and then implement the behavior.
Do not substitute a two-player chess convention.

## Improve the documentation

- Edit the canonical examples in `docs/usage.md` and
  `docs/compatibility.md`. They are executed in the test suite.
- Rule explanations and position examples are sourced from `docs/rules/` and
  `docs/fixtures/`. Their site copies are generated; do not edit generated
  files under `website/src/content/docs/reference/`.
- Edit the site's own introductory pages in `website/src/content/docs/`.
- Run `make docs-build` to check navigation, links and assets. Use
  `make docs-preview` to browse the result locally.
