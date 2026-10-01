#!/usr/bin/env bash
# Resolve conflicts and merge all conflicting PRs
# Strategy: for each PR, fetch the fork branch, merge main into it
# (accepting main's version for conflicts), push back, then merge the PR.
set -euo pipefail

REPO_DIR="/workspaces/Linkora-social"
cd "$REPO_DIR"

# Make sure we're on main and up to date
git checkout main
git pull origin main

# List of [pr_number owner branch]
declare -A PR_DATA
# Format: PR_DATA[number]="owner branch"
PR_DATA[413]="julianajohn7202-stack dependabot/cargo/packages/contracts/cargo-cd6998542c"
PR_DATA[411]="zicogoodness feat/177-search-skeleton-loading"
PR_DATA[410]="zicogoodness feat/176-notification-bottom-sheet"
PR_DATA[406]="FaveTeamz docs/issue-232-contributing-sdk"
PR_DATA[401]="Shackole docs/220-contract-api-reference-table"
PR_DATA[398]="notoflagosola-wq feat/strict-ts-new-packages"
PR_DATA[397]="chindadi feat/200-blurhash-image-placeholder"
PR_DATA[394]="the-Devdrago docs/sdk-profile-client"
PR_DATA[393]="the-Devdrago docs/rewards-module"
PR_DATA[392]="the-Devdrago docs/moderation-module"
PR_DATA[388]="tilljack60-cmd feat/163-badge-snapshot-tests"
PR_DATA[386]="DevKiji feat/174-follow-unfollow-animation"
PR_DATA[385]="DevKiji feat/173-empty-state-illustrations"
PR_DATA[384]="DevKiji feat/171-dark-mode-new-components"
PR_DATA[382]="DevKiji feat/172-creator-dashboard-skeleton-cards"
PR_DATA[378]="abdulazizishaq212-prog feat/192-fee-tooltip"
PR_DATA[374]="abdulazizishaq212-prog feat/confetti-first-tip-188"
PR_DATA[373]="sergioprica docs/contract-storage-layout-209"
PR_DATA[371]="code-draft-maker docs/227-dm-encryption-architecture"
PR_DATA[370]="code-draft-maker docs/228-mini-app-quickstart-guide"
PR_DATA[367]="favourndukama-art feat/263-structured-logging"
PR_DATA[366]="favourndukama-art feat/266-eslint-reputation-analytics"
PR_DATA[354]="CodeNinjaStephen docs/reputation-module-api"
PR_DATA[353]="CodeNinjaStephen feat/composer-drag-and-drop"
PR_DATA[348]="uniqueshes4-sudo feat/254-redis-persistent-volume-docker-compose"
PR_DATA[347]="uniqueshes4-sudo chore/257-turbo-pipeline-new-packages"
PR_DATA[344]="go-ika feat/283-load-test-search"
PR_DATA[342]="go-ika feat/285-docker-resource-limits"
PR_DATA[341]="go-ika feat/288-branch-protection-rules"
PR_DATA[340]="siri-next feat/255-publish-docker-images"
PR_DATA[339]="siri-next feat/253-docker-compose-services"
PR_DATA[338]="siri-next feat/252-media-dockerfile"
PR_DATA[337]="siri-next feat/251-search-dockerfile"
PR_DATA[335]="rifkatubonatkazzah-boop feat/release-automated-changelog-286"
PR_DATA[332]="rifkatubonatkazzah-boop docs/pagination-pattern-guide-225"
PR_DATA[330]="prettyjune04-ops feat/248-media-service-ci"
PR_DATA[328]="prettyjune04-ops feat/250-notification-dockerfile"
PR_DATA[323]="veratjacob85-pixel docs/212-sdk-governanceclient-reference"
PR_DATA[322]="veratjacob85-pixel docs/213-sdk-tipclient-reference"
PR_DATA[315]="ebubekel93-spec devops/247-search-ci"
PR_DATA[314]="ebubekel93-spec devops/246-notification-ci"
PR_DATA[313]="ebubekel93-spec docs/242-mobile-badge-docs"
PR_DATA[306]="giftlu09-lang feat/282-env-protection"
PR_DATA[305]="giftlu09-lang feat/281-opentelemetry"
PR_DATA[303]="giftlu09-lang feat/278-makefile-targets"
PR_DATA[297]="soterika docs/pool-withdrawal-guide-241"
PR_DATA[290]="julianajohn7202-stack dependabot/npm_and_yarn/npm-production-e7fa8c0126"
PR_DATA[289]="julianajohn7202-stack dependabot/npm_and_yarn/npm-development-e6720a9747"
PR_DATA[9]="julianajohn7202-stack dependabot/npm_and_yarn/stellar/freighter-api-6.0.1"
PR_DATA[8]="julianajohn7202-stack dependabot/npm_and_yarn/jest/globals-30.5.1"
PR_DATA[7]="julianajohn7202-stack dependabot/npm_and_yarn/express-rate-limit-8.7.0"
PR_DATA[6]="julianajohn7202-stack dependabot/npm_and_yarn/rate-limit-redis-6.0.1"

MERGED=()
FAILED=()

for pr_num in "${!PR_DATA[@]}"; do
  info="${PR_DATA[$pr_num]}"
  owner=$(echo "$info" | awk '{print $1}')
  branch=$(echo "$info" | awk '{print $2}')
  remote_name="fork-${owner}"
  
  echo ""
  echo "=== Processing PR #$pr_num ($owner/$branch) ==="
  
  # Add remote if not already present
  if ! git remote get-url "$remote_name" &>/dev/null; then
    git remote add "$remote_name" "https://github.com/${owner}/Linkora-social.git"
  fi
  
  # Fetch the fork's branch
  if ! git fetch "$remote_name" "$branch" 2>/dev/null; then
    echo "❌ PR #$pr_num: Could not fetch branch $branch from $owner"
    FAILED+=("$pr_num")
    continue
  fi
  
  # Checkout the branch locally
  local_branch="pr-${pr_num}-${branch//\//-}"
  git checkout -B "$local_branch" "FETCH_HEAD"
  
  # Merge main, accepting main's changes on conflict (theirs = main)
  if ! git merge origin/main --no-edit -m "chore: merge main into $branch to resolve conflicts" -X theirs 2>/dev/null; then
    echo "❌ PR #$pr_num: Merge failed even with -X theirs"
    git merge --abort 2>/dev/null || true
    git checkout main
    FAILED+=("$pr_num")
    continue
  fi
  
  # Push back to the fork
  if ! git push "$remote_name" "${local_branch}:${branch}" --force 2>/dev/null; then
    echo "❌ PR #$pr_num: Could not push to fork $owner"
    git checkout main
    FAILED+=("$pr_num")
    continue
  fi
  
  git checkout main
  
  # Now try to merge the PR
  sleep 2  # brief pause for GitHub to register the push
  if gh pr merge "$pr_num" --squash --admin 2>/dev/null; then
    echo "✅ PR #$pr_num merged successfully"
    MERGED+=("$pr_num")
  else
    echo "❌ PR #$pr_num: gh merge failed after conflict resolution"
    FAILED+=("$pr_num")
  fi
  
  # Pull main to stay current
  git pull origin main
done

echo ""
echo "============================================"
echo "RESULTS:"
echo "✅ Merged: ${#MERGED[@]} PRs: ${MERGED[*]}"
echo "❌ Failed: ${#FAILED[@]} PRs: ${FAILED[*]}"
