#!/usr/bin/env bash
#
# Failure-path probe for the real-browser driver (spec 001/D18).
#
# `toolkit/consumers/browser-consumer.mjs` starts a local HTTP server and then
# launches Chromium. Every failure after that point must still close the server:
# a leaked listening server keeps the Node event loop alive, so the gate would
# hang instead of failing, and a hanging gate is the one failure mode this
# project refuses to ship (`AGENTS.md`: never report a fake result).
#
# This probe forces two such failures and asserts the driver stays loud and
# bounded:
#
#   1. `launch-failure` — `chromium.launch()` rejects, as a missing or unusable
#      browser does. The driver never gets a browser handle at all.
#   2. `close-failure` — `chromium.launch()` resolves but the handle fails, so
#      the driver's own `browser.close()` rejects too.
#
# It runs from `toolkit/scripts/consumer-test.sh --browser`, i.e. inside the
# pinned browser image, and it injects the failures out of a disposable
# temporary directory: a Node loader hook rewrites the bare `playwright-core`
# specifier for that one probe process, so the browser image, the installed
# tarball, the repository sources and the real driver stay untouched. Nothing
# here is a test hook in shipped code.
#
# For each scenario it asserts the driver:
#   - exits non-zero, and not as a `timeout` kill (so it did not hang),
#   - prints `browser-consumer: FAILED — …` naming the injected failure,
#   - prints no success line.
#
# It never proves that the real browser works; `browser-consumer.mjs` itself
# proves that in the leg that runs before this probe.
#
# Usage: browser-consumer-failure-probe.sh <installed-package-dir>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DRIVER="${REPO_ROOT}/toolkit/consumers/browser-consumer.mjs"
INSTALLED_PACKAGE="${1:-}"
TIMEOUT_SECONDS="${QTS_PROBE_TIMEOUT_SECONDS:-60}"

fail() {
  echo "browser-failure-probe: FAILED — $1" >&2
  exit 1
}

[ -n "${INSTALLED_PACKAGE}" ] ||
  fail "usage: browser-consumer-failure-probe.sh <installed-package-dir>"
[ -d "${INSTALLED_PACKAGE}/dist/esm" ] ||
  fail "the installed package ${INSTALLED_PACKAGE} has no dist/esm"
[ ! -e "${INSTALLED_PACKAGE}/src" ] ||
  fail "the installed package ${INSTALLED_PACKAGE} ships src/, so the probe would not match a real consumer"
[ -f "${DRIVER}" ] || fail "the browser driver ${DRIVER} is missing"

work="$(mktemp -d "${TMPDIR:-/tmp}/quaternits-browser-probe-XXXXXX")"
trap 'rm -rf "${work}"' EXIT

cat >"${work}/fake-playwright-core.mjs" <<'FAKE'
// A disposable stand-in for the pinned `playwright-core`, used only by the
// failure-path probe: it launches nothing and fails the way a missing or
// unusable browser does. `QTS_PROBE_MODE` selects the injected failure.
const mode = process.env.QTS_PROBE_MODE;

export const chromium = {
  async launch() {
    if (mode === "close-failure") {
      return {
        version() {
          throw new Error("injected probe failure: browser.version() failed");
        },
        async close() {
          throw new Error("injected probe failure: browser.close() failed");
        },
      };
    }
    throw new Error(
      "injected probe failure: Chromium could not be launched after the local server started",
    );
  },
};
FAKE

cat >"${work}/redirect.mjs" <<'REDIRECT'
// Module-resolution hook for the probe process only: `playwright-core` resolves
// to the disposable failing stand-in instead of the pinned package.
const FAKE = new URL("./fake-playwright-core.mjs", import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === "playwright-core") {
    return { url: FAKE, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
REDIRECT

cat >"${work}/register.mjs" <<'REGISTER'
import { register } from "node:module";

register("./redirect.mjs", import.meta.url);
REGISTER

# Run the real driver once with the injected failure `mode` and assert it failed
# loudly and quickly, naming `expected`.
run_scenario() {
  local mode="$1"
  local expected="$2"
  local output
  local status

  echo "browser-failure-probe: injecting the ${mode} scenario"
  set +e
  output="$(
    QTS_INSTALLED_PACKAGE="${INSTALLED_PACKAGE}" \
      QTS_PROBE_MODE="${mode}" \
      timeout "${TIMEOUT_SECONDS}" \
      node --import "${work}/register.mjs" "${DRIVER}" 2>&1
  )"
  status=$?
  set -e

  if [ "${status}" -eq 124 ] || [ "${status}" -eq 137 ]; then
    fail "the driver hung for ${TIMEOUT_SECONDS}s in the ${mode} scenario, so the local server was left listening; it must fail loudly instead: ${output}"
  fi
  [ "${status}" -ne 0 ] ||
    fail "the driver reported success in the ${mode} scenario although it could not drive a browser: ${output}"
  grep -q 'browser-consumer: FAILED' <<<"${output}" ||
    fail "the driver did not print its loud failure line in the ${mode} scenario: ${output}"
  grep -qF "${expected}" <<<"${output}" ||
    fail "the driver failed for another reason in the ${mode} scenario, expected \"${expected}\": ${output}"
  if grep -q 'browser-consumer: OK' <<<"${output}"; then
    fail "the driver printed a success line in the ${mode} scenario: ${output}"
  fi

  echo "browser-failure-probe: OK (${mode}: exit ${status}, loud browser-consumer: FAILED line, no hang)"
}

run_scenario \
  "launch-failure" \
  "Chromium could not be launched after the local server started"
run_scenario "close-failure" "browser.close() failed"
