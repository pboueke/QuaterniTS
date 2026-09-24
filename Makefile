# QuaterniTS — root orchestration.
#
# Run `make help` for targets. Requires only: podman (rootless), make, bash, git.
# Tool commands run inside the digest-pinned toolkit image (toolkit/), never on
# the host, so the local gate matches CI.
SHELL := bash
.DEFAULT_GOAL := help
.DELETE_ON_ERROR:

include toolkit/Makefile.fragment

.PHONY: help
help: ## Show available targets
	@printf '%s\n' 'QuaterniTS targets:'
	@grep -hE '^[a-zA-Z0-9_.-]+:.*?## ' $(MAKEFILE_LIST) | sort -u | \
		awk 'BEGIN{FS=":.*?## "}{printf "  %-16s %s\n", $$1, $$2}'

.PHONY: fmt-check
fmt-check: $(TOOLKIT_NPM_CI_STAMP) ## Check formatting (Prettier)
	$(call toolkit-run,npm run fmt-check)

.PHONY: fmt
fmt: $(TOOLKIT_NPM_CI_STAMP) ## Rewrite formatting (Prettier)
	$(call toolkit-run,npm run fmt)

.PHONY: lint
lint: $(TOOLKIT_NPM_CI_STAMP) ## Lint TypeScript and configs (ESLint)
	$(call toolkit-run,npm run lint)

.PHONY: types
types: $(TOOLKIT_NPM_CI_STAMP) ## Type-check (tsc --noEmit)
	$(call toolkit-run,npm run types)

.PHONY: test
test: $(TOOLKIT_NPM_CI_STAMP) ## Run tests with the 100% line+branch coverage gate
	$(call toolkit-run,npm test)

.PHONY: build
build: $(TOOLKIT_NPM_CI_STAMP) ## Build the dual ESM/CJS package and its declarations into dist/
	$(call toolkit-run,npm run build)

# The real Node half of the Phase 4 consumer test: it builds, packs and installs
# the tarball in a disposable directory and runs Node ESM, Node CommonJS and
# TypeScript declaration consumers against it.
.PHONY: consumer-test
consumer-test: $(TOOLKIT_NPM_CI_STAMP) ## Pack the build and run Node ESM/CJS + TypeScript consumers
	$(call toolkit-run,npm run consumer-test)

# The real installed-package integration gate: it reuses the `consumer-test`
# build/pack/install leg through the script's optional `--integration` argument
# and then runs the complete-game lifecycle fixture against the installed
# tarball.
.PHONY: integration
integration: $(TOOLKIT_NPM_CI_STAMP) ## Pack the build and run the installed-package lifecycle fixture
	$(call toolkit-run,npm run integration)

# The real browser gate: the same `consumer-test` build/pack/install leg with
# `--browser`, run inside the pinned Chromium image (no network), then a real
# headless Chromium loads the installed tarball's dist/esm over an import map
# and runs the engine in a page. The image is large, so the first run pulls and
# derives it once (`.toolkit/quaternits-browser-image.stamp`).
.PHONY: browser-consumer
browser-consumer: $(TOOLKIT_NPM_CI_STAMP) $(BROWSER_IMAGE_STAMP) ## Pack the build and run it in a real browser (headless Chromium)
	$(call browser-run,npm run browser-consumer)

# The real JSON snapshot/schema contract gate: it compiles the shipped schema
# (`schema/quaternits-snapshot-v1.schema.json`) with Ajv in strict mode and
# checks every runtime-built snapshot and every committed valid/invalid/drift
# fixture for schema/runtime agreement and drift.
.PHONY: contract-check
contract-check: $(TOOLKIT_NPM_CI_STAMP) ## Check runtime snapshots and fixtures against the shipped JSON Schema
	$(call toolkit-run,npm run contract-check)

.PHONY: audit
audit: $(TOOLKIT_NPM_CI_STAMP) ## Block on unexcepted HIGH/CRITICAL advisories
	$(call toolkit-run,npm run audit)

.PHONY: version-check
version-check: $(TOOLKIT_NPM_CI_STAMP) ## Check CHANGELOG.md is the authority for package metadata versions
	$(call toolkit-run,npm run version-check)

.PHONY: version-sync
version-sync: $(TOOLKIT_NPM_CI_STAMP) ## Rewrite package version fields from CHANGELOG.md (explicit; never part of verify)
	$(call toolkit-run,npm run version-sync)

# Opt-in git hooks. Host-side only: installing the hooks must not require Podman
# or the toolkit image, so this target calls the host script directly. The
# script sets the *repo-local* core.hooksPath explicitly and is safe to re-run
# (see toolkit/scripts/install-hooks.sh).
.PHONY: install-hooks
install-hooks: ## Opt this checkout into the version-controlled .githooks (repo-local; no Podman)
	bash $(TOOLKIT_DIR)/scripts/install-hooks.sh

.PHONY: verify
verify: preflight fmt-check lint types version-check test audit contract-check consumer-test integration browser-consumer ## Run every real gate

.PHONY: clean
clean: ## Remove toolkit stamps, coverage output and build output
	rm -rf .toolkit coverage dist

.PHONY: clean-all
clean-all: clean ## Also remove the toolkit, browser and npm cache
	-podman rmi $(TOOLKIT_IMAGE)
	-podman rmi $(BROWSER_IMAGE)
	-podman volume rm $(TOOLKIT_NPM_CACHE)
