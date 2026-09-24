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
	@printf '%s\n' '' \
		'Pending and intentionally absent (do not fake):' \
		'  contract-check   JSON snapshot/schema contract drift (Phase 4)' \
		'  consumer-test    built-package ESM/CJS/browser tests (Phase 4)' \
		'  integration      installed-package integration (Phase 4)'

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

.PHONY: audit
audit: $(TOOLKIT_NPM_CI_STAMP) ## Block on unexcepted HIGH/CRITICAL advisories
	$(call toolkit-run,npm run audit)

.PHONY: version-check
version-check: $(TOOLKIT_NPM_CI_STAMP) ## Check CHANGELOG.md is the authority for package metadata versions
	$(call toolkit-run,npm run version-check)

.PHONY: version-sync
version-sync: $(TOOLKIT_NPM_CI_STAMP) ## Rewrite package version fields from CHANGELOG.md (explicit; never part of verify)
	$(call toolkit-run,npm run version-sync)

.PHONY: verify
verify: fmt-check lint types version-check test audit ## Run every currently implemented gate

.PHONY: clean
clean: ## Remove toolkit stamps and coverage output
	rm -rf .toolkit coverage

.PHONY: clean-all
clean-all: clean ## Also remove the toolkit image and npm cache volume
	-podman rmi $(TOOLKIT_IMAGE)
	-podman volume rm $(TOOLKIT_NPM_CACHE)
