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
make fmt-check     # Prettier check
make lint          # ESLint
make types         # tsc --noEmit
make test          # tests + 100% line/branch coverage gate
make audit         # block on unexcepted HIGH/CRITICAL advisories
make version-check # CHANGELOG.md version vs package metadata
make version-sync  # explicit rewrite of version fields; never part of verify
make verify        # all currently implemented gates
make clean         # remove stamps and coverage output
make clean-all     # also remove the image and npm cache volume
```

The image is stateless: nothing is copied into it. The repository is
bind-mounted at `/work` and `npm ci` installs from the frozen
`package-lock.json` (never `npm install`). The image tag
`quaternits-toolkit:local` and named `quaternits-npm-cache` volume use the same
project identity (`001/D43`). The volume caches downloads between runs.
`--userns=keep-id:uid=1000,gid=1000` maps the host user to the container `node`
user so bind-mounted files stay writable without running as root.

## Pinned base image

| Field                             | Value                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Reference                         | `docker.io/library/node:24-bookworm-slim`                                 |
| Digest (multi-arch manifest list) | `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6` |
| Resolved                          | during Phase 1B implementation by `podman pull` + `podman inspect`        |
| Node inside image                 | `v24.21.0`                                                                |

`toolkit/Makefile.fragment` and `toolkit/Containerfile` carry the same digest.
The manifest-list digest is used (not a single-arch digest) so amd64 and arm64
runners get the same tag. Never invent or hand-edit the digest; re-resolve it and
update all three places together.

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

## Pending and intentionally absent

`contract-check`, `consumer-test` and `integration` are **not** implemented yet
and are deliberately not stubbed. They belong to Phase 4 (built-package
ESM/CJS/browser consumer tests, JSON schema drift). `make verify` runs only the
gates that actually exist; it does not pretend the missing ones pass.

## Replacement

To replace this toolkit, keep the same interface: a root `Makefile` including a
fragment, one pinned image, `npm ci` from a committed lockfile, and independent
`fmt-check`/`lint`/`types`/`test`/`audit`/`version-check` targets plus `verify`.
Swap the image or tool versions by updating the digest and `package-lock.json`
together.
