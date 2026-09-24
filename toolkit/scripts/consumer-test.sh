#!/usr/bin/env bash
#
# Real built-package consumer test for QuaterniTS (spec 001/D18, Phase 4).
#
# Builds the package, packs it with `npm pack` and installs the tarball in a
# disposable directory that is not the repository, then runs real consumers
# against the installed artifact:
#
#   1. Node ESM `import` of `quaternits` (dist/esm) and Node CommonJS
#      `require("quaternits")` (dist/cjs) — each asserting the reviewed opening
#      position, a validated custom position, the attack/check queries, atomic
#      rejection by the guarded move seam and a versioned V1 snapshot round trip
#      through the shipped schema export (spec 001/D10).
#   2. `tsc` type consumption through both declaration conditions, plus a
#      negative check that a wrong type is still rejected, so the shipped
#      declarations are real types and not `any`.
#   3. Tarball assertions that the built entry points are present and that no
#      `src/` or non-declaration `.ts` file reaches a consumer, so there is no
#      source-only import fallback.
#
# With `--integration` the same tarball install additionally runs
# `integration-consumer.mjs`, the installed-package complete-game lifecycle
# fixture behind `make integration`, so the packaging logic lives here once.
#
# With `--browser` the same tarball install additionally runs
# `browser-consumer.mjs` behind `make browser-consumer`, which serves the
# installed package's `dist/esm` over loopback and loads it in a real headless
# Chromium through an import map. That leg must run inside the pinned browser
# image, so `make browser-consumer` is the entry point; the container has no
# network, so the browser can only ever load the installed tarball. It then runs
# `browser-consumer-failure-probe.sh`, which injects a Chromium launch failure
# and asserts the driver fails loudly instead of hanging on a leaked server, so
# the failure path is proven too and cannot silently regress.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURES="${REPO_ROOT}/toolkit/consumers"
TSC="${REPO_ROOT}/node_modules/typescript/bin/tsc"

fail() {
  echo "consumer-test: FAILED — $1" >&2
  exit 1
}

integration=false
browser=false
for argument in "$@"; do
  case "${argument}" in
  --integration) integration=true ;;
  --browser) browser=true ;;
  *) fail "unknown argument: ${argument}" ;;
  esac
done

work="$(mktemp -d "${TMPDIR:-/tmp}/quaternits-consumer-XXXXXX")"
trap 'rm -rf "${work}"' EXIT

cd "${REPO_ROOT}"

echo "consumer-test: building the package (npm run build)"
npm run build --silent

echo "consumer-test: packing the built package (npm pack)"
npm pack --pack-destination "${work}" --silent >/dev/null
tarball="$(find "${work}" -maxdepth 1 -name 'quaternits-*.tgz' -print -quit)"
[ -n "${tarball}" ] || fail "npm pack produced no tarball"

entries="$(tar -tzf "${tarball}")"
for required in \
  package/package.json \
  package/dist/esm/index.js \
  package/dist/esm/index.d.ts \
  package/dist/cjs/index.js \
  package/dist/cjs/index.d.ts \
  package/dist/cjs/package.json \
  package/schema/quaternits-snapshot-v1.schema.json; do
  grep -qx "${required}" <<<"${entries}" ||
    fail "the tarball is missing ${required}"
done
if grep -q '^package/src/' <<<"${entries}"; then
  fail "the tarball ships src/, so a consumer could fall back to sources"
fi
if grep -E '\.ts$' <<<"${entries}" | grep -qv '\.d\.ts$'; then
  fail "the tarball ships non-declaration TypeScript sources"
fi

consumer="${work}/consumer"
mkdir -p "${consumer}"
cp -R "${FIXTURES}/." "${consumer}/"

echo "consumer-test: installing the tarball in a separate consumer directory"
(
  cd "${consumer}"
  npm install --no-audit --no-fund --offline --ignore-scripts "${tarball}"
)

echo "consumer-test: running the Node ESM consumer"
(cd "${consumer}" && node esm-consumer.mjs)

echo "consumer-test: running the Node CommonJS consumer"
(cd "${consumer}" && node cjs-consumer.cjs)

echo "consumer-test: type-checking consumers against the shipped declarations"
(cd "${consumer}" && node "${TSC}" -p tsconfig.json)

echo "consumer-test: expecting the negative type fixture to be rejected"
set +e
negative="$(cd "${consumer}" && node "${TSC}" -p tsconfig.negative.json 2>&1)"
status=$?
set -e
[ "${status}" -ne 0 ] || fail "the negative type fixture compiled but must fail"
grep -q 'TS2322' <<<"${negative}" ||
  fail "the negative type fixture failed without the expected TS2322 error"
if grep -Eq 'TS2307|TS7016' <<<"${negative}"; then
  fail "the negative type fixture failed to resolve the shipped declarations"
fi

if [[ "${integration}" == "true" ]]; then
  echo "consumer-test: running the installed-package complete-game lifecycle consumer"
  (cd "${consumer}" && node integration-consumer.mjs)
fi

if [[ "${browser}" == "true" ]]; then
  echo "consumer-test: driving a real headless Chromium against the installed tarball"
  # The driver lives in the repository (not in the disposable consumer copy) so
  # its bare `playwright-core` import resolves from the toolkit's frozen
  # node_modules; it is handed the installed package directory and serves only
  # that directory, so the browser leg cannot fall back to sources.
  QTS_INSTALLED_PACKAGE="${consumer}/node_modules/quaternits" \
    node "${REPO_ROOT}/toolkit/consumers/browser-consumer.mjs"

  echo "consumer-test: proving an injected Chromium launch failure fails loudly"
  # A launch failure must close the driver's loopback server: a server left
  # listening keeps the Node event loop alive and would hang this gate. The
  # probe injects that failure out of a disposable temporary `playwright-core`
  # override and asserts a bounded, non-zero, loud failure (see the probe's own
  # header); it uses the same installed tarball as the leg above.
  bash "${REPO_ROOT}/toolkit/scripts/browser-consumer-failure-probe.sh" \
    "${consumer}/node_modules/quaternits"
fi

legs="Node ESM, Node CommonJS, ESM/CJS TypeScript declarations"
if [[ "${integration}" == "true" ]]; then
  legs="${legs}, installed-package lifecycle"
fi
if [[ "${browser}" == "true" ]]; then
  legs="${legs}, real headless Chromium"
fi
echo "consumer-test: OK (${legs})"
