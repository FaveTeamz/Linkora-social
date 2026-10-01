.PHONY: dev build lint test format labels notification search media services test-services

dev:
	@pnpm dev

build:
	@pnpm build

lint:
	@pnpm lint

test:
	@pnpm test

format:
	@pnpm format

# Sync GitHub issue/PR labels from .github/labels.yml to the repository.
# Requires the GITHUB_TOKEN env var (a token with repo scope). The target
# repository is derived from the `origin` git remote.
labels:
	@test -n "$(GITHUB_TOKEN)" || { echo "GITHUB_TOKEN is not set"; exit 1; }
	@repo=$$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$$##'); \
		npx github-label-sync --access-token "$(GITHUB_TOKEN)" --labels .github/labels.yml "$$repo"

# Start the notification service
notification:
	@pnpm --filter @linkora/notification dev

# Start the search service
search:
	@pnpm --filter @linkora/search dev

# Start the media service
media:
	@pnpm --filter @linkora/media dev

# Start all six services (indexer, dm-relay, analytics-oracle, notification, search, media)
services:
	@pnpm --filter './services/*' dev

# Run tests across all service packages
test-services:
	@pnpm --filter './services/*' test
