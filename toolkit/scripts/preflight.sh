#!/usr/bin/env bash
#
# Rootless-Podman preflight for the QuaterniTS toolkit.
#
# Every gate runs its tools inside the digest-pinned image through rootless
# Podman, so an unusable Podman must stop a gate loudly instead of letting it
# skip a check or fake a result. `make verify`, the git hooks and CI run this
# first.
set -euo pipefail

if ! command -v podman >/dev/null 2>&1; then
  echo "preflight: podman is not installed on the host;" \
    "install rootless Podman (no host Node is needed)" >&2
  exit 1
fi

# `podman info` is the cheapest real check: it fails when the user has no
# subordinate id ranges or no usable storage. Its own stderr stays visible so a
# genuine runtime failure is diagnosable.
if ! rootless="$(podman info --format '{{.Host.Security.Rootless}}')"; then
  echo "preflight: 'podman info' failed; rootless Podman must work before any gate runs" >&2
  exit 1
fi

if [ "${rootless}" != "true" ]; then
  echo "preflight: Podman is not rootless (reported '${rootless}');" \
    "the toolkit must run as an unprivileged user" >&2
  exit 1
fi

echo "preflight: rootless Podman is available"
