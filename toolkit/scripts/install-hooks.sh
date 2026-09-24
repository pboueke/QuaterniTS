#!/usr/bin/env bash
#
# QuaterniTS opt-in git hooks installer.
#
# Runs on the host (like preflight.sh) and never invokes Podman: opting into the
# version-controlled hooks must not depend on the toolkit image. It sets the
# *repo-local* `core.hooksPath` to `.githooks` explicitly, so global and system
# git configuration are never read or written. Safe to re-run: an already-correct
# local hooksPath succeeds, a different one is refused without being overwritten,
# and a directory that is not a Git repository fails without being modified.
#
# Installed by `make install-hooks`; disable with
# `git config --local --unset core.hooksPath`.
set -euo pipefail

readonly HOOKS_PATH=".githooks"

if ! command -v git >/dev/null 2>&1; then
  printf '%s\n' "install-hooks: git is not installed; install git first." >&2
  exit 1
fi

# Fail before mutating anything when the current directory is not a Git
# repository. `git rev-parse --git-dir` exits non-zero outside a repository.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf '%s\n' \
    "install-hooks: not a Git repository; run this from a checkout." >&2
  exit 1
fi

if current="$(git config --local --get core.hooksPath 2>/dev/null)"; then
  if [[ "$current" == "$HOOKS_PATH" ]]; then
    printf '%s\n' "install-hooks: $HOOKS_PATH is already enabled locally."
    exit 0
  fi
  printf '%s\n' \
    "install-hooks: refusing to overwrite local core.hooksPath '$current'." \
    "install-hooks: unset it first with" \
    "'git config --local --unset core.hooksPath'." >&2
  exit 1
fi

git config --local core.hooksPath "$HOOKS_PATH"
printf '%s\n' "install-hooks: enabled local core.hooksPath=$HOOKS_PATH."
