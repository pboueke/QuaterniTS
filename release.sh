#!/usr/bin/env bash
# Owner-operated npm release. The default is check-only; only --publish can
# reach npm's publish endpoint, and that path requires a typed confirmation.
set -euo pipefail

usage() {
  printf '%s\n' 'Usage: ./release.sh [--check|--publish]' \
    '  --check    Verify the tagged commit and local tarball (default; no publish).' \
    '  --publish  Verify, log in to npmjs.org and ask for explicit confirmation.'
}

fail() {
  printf 'release: %s\n' "$1" >&2
  exit 1
}

if (($# > 1)); then
  usage >&2
  exit 2
fi
mode="${1:---check}"
case "$mode" in
--check) ;;
--publish)
  [[ -t 0 && -t 1 ]] || fail 'publishing requires an interactive terminal'
  ;;
--help | -h)
  usage
  exit 0
  ;;
*)
  usage >&2
  exit 2
  ;;
esac

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"
for command in git make podman; do
  command -v "$command" >/dev/null 2>&1 || fail "missing $command"
done
[[ -z "$(git status --porcelain)" ]] || fail 'commit or remove worktree changes before releasing'

# The toolkit is the only Node/npm environment; checkout and tag checks on the
# host use only read-only git commands.
make preflight toolkit-image

toolkit() {
  podman run --rm --userns=keep-id:uid=1000,gid=1000 \
    -v "$root":/work:ro,Z -w /work quaternits-toolkit:local "$@"
}

version="$(toolkit node -e '
const {readFileSync}=require("node:fs");
const pkg=JSON.parse(readFileSync("package.json","utf8"));
if(pkg.name!=="quaternits" || pkg.private===true ||
   !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version) ||
   pkg.publishConfig?.registry!=="https://registry.npmjs.org/") process.exit(1);
console.log(pkg.version);
')" || fail 'manifest is not a publishable npmjs.org quaternits package'

head="$(git rev-parse HEAD)"
tag="v$version"
remote_tag="$(git ls-remote --exit-code origin "refs/tags/$tag")" ||
  fail "remote $tag tag is missing or unreachable; wait for the main-push tagging workflow"
read -r tag_sha tag_ref <<<"$remote_tag"
[[ "$tag_ref" == "refs/tags/$tag" && "$tag_sha" == "$head" ]] ||
  fail "$tag does not identify this checkout ($head)"

artifact=".release/quaternits-$version.tgz"
checksums='.release/SHA256SUMS'
[[ -f "$artifact" && -f "$checksums" ]] || fail "missing $artifact or $checksums"
mapfile -t lines <"$checksums"
[[ ${#lines[@]} -eq 1 ]] || fail 'SHA256SUMS must have exactly one entry'
read -r expected_sha checked_path extra <<<"${lines[0]}"
[[ "$checked_path" == "$artifact" && "$expected_sha" =~ ^[0-9a-f]{64}$ && -z "${extra:-}" ]] ||
  fail "SHA256SUMS must name only $artifact"
toolkit sha256sum -c "$checksums"

# Rebuild from this exact tagged checkout and compare the packed bytes. The
# reference pack lives only inside a disposable container; the .release/
# candidate is never overwritten, even on mismatch.
make version-check build
repacked="$(podman run --rm --userns=keep-id:uid=1000,gid=1000 \
  -v "$root":/work:ro,Z -w /work -e QTS_VERSION="$version" \
  quaternits-toolkit:local bash -lc '
    set -euo pipefail
    npm pack --pack-destination /tmp --json >/tmp/quaternits-pack.json
    sha256sum "/tmp/quaternits-${QTS_VERSION}.tgz"
  ')" || fail 'could not repack the tagged checkout'
repacked_sha="${repacked%% *}"
[[ "$repacked_sha" == "$expected_sha" ]] ||
  fail 'candidate differs from a fresh pack of the tagged checkout; do not publish it'
printf 'release: verified %s at %s (SHA-256 %s)\n' "$artifact" "$tag" "$expected_sha"

if [[ "$mode" == --check ]]; then
  printf '%s\n' 'release: check-only; nothing was published'
  exit 0
fi

# Keep npm credentials outside the repository and the ephemeral toolkit image.
auth_dir="${XDG_CONFIG_HOME:-$HOME/.config}/quaternits/npm"
mkdir -p -- "$auth_dir"
chmod 700 -- "$auth_dir"
npm_toolkit() {
  podman run --rm -it --userns=keep-id:uid=1000,gid=1000 \
    -v "$root":/work:ro,Z \
    -v "$auth_dir":/home/node/npm-auth:Z \
    -e NPM_CONFIG_USERCONFIG=/home/node/npm-auth/.npmrc \
    -w /work quaternits-toolkit:local npm "$@"
}

npm_toolkit login --registry=https://registry.npmjs.org/
npm_toolkit whoami --registry=https://registry.npmjs.org/
printf 'Confirm the separate CI workflow passed for %s before publishing.\n' "$head"
printf 'Type "publish quaternits@%s" to publish %s: ' "$version" "$artifact"
read -r confirmation
[[ "$confirmation" == "publish quaternits@$version" ]] || fail 'publication cancelled'
npm_toolkit publish "./$artifact" --access public --registry=https://registry.npmjs.org/
printf 'release: published quaternits@%s; verify the registry and a disposable install\n' "$version"
