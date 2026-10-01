# Contributing to Linkora

Thank you for your interest in contributing! This guide covers everything you
need to get your environment ready, follow our branch conventions, and get a PR
merged.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Branch Conventions](#branch-conventions)
4. [Commit Guidelines](#commit-guidelines)
5. [Pull Request Process](#pull-request-process)
6. [Branch Protection Rules](#branch-protection-rules)
7. [Code Style](#code-style)
8. [Testing](#testing)

---

## Prerequisites

| Tool           | Minimum version     | Notes                                |
| -------------- | ------------------- | ------------------------------------ |
| Node.js        | See `.node-version` | Managed via `nvm` or `fnm`           |
| pnpm           | 9.x                 | `npm i -g pnpm`                      |
| Rust           | stable              | `rustup toolchain install stable`    |
| Docker         | 24+                 | Required for integration tests       |
| Docker Compose | v2                  | Bundled with Docker Desktop          |
| stellar-cli    | latest              | `cargo install --locked stellar-cli` |

Run `./scripts/setup.sh` after cloning — it checks all prerequisites, installs
dependencies, and builds the contracts.

---

## Development Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-handle>/Linkora-social.git
cd Linkora-social

# 2. Add the canonical upstream remote
git remote add upstream https://github.com/julianajohn7202-stack/Linkora-social.git

# 3. Run the setup script
./scripts/setup.sh

# 4. Start the local stack
docker compose up -d

# 5. Start the web frontend
cd apps/web && pnpm dev   # http://localhost:3000
```

---

## Branch Conventions

| Type    | Pattern                            | Example                         |
| ------- | ---------------------------------- | ------------------------------- |
| Feature | `feat/<issue>-short-description`   | `feat/42-creator-profiles`      |
| Bug fix | `fix/<issue>-short-description`    | `fix/99-follow-count-overflow`  |
| Chore   | `chore/<issue>-short-description`  | `chore/120-update-dependencies` |
| Docs    | `docs/<issue>-short-description`   | `docs/55-indexer-design`        |
| DevOps  | `devops/<issue>-short-description` | `devops/288-branch-protection`  |

Rules:

- Branch off from `main`. Always rebase on `upstream/main` before opening a PR.
- Use lowercase kebab-case.
- Include the issue number when one exists.
- Keep branches focused — one logical change per branch.

---

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer — e.g. Closes #42]
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `style`.

Examples:

```
feat(contracts): add post-moderation hook
fix(indexer): handle null ledger sequence on genesis block
docs(contributing): add branch protection rules section
```

---

## Pull Request Process

1. **Rebase** your branch on the latest `upstream/main` before opening a PR:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push** your branch to your fork:

   ```bash
   git push -u origin <branch-name>
   ```

3. **Open** a PR against `julianajohn7202-stack/Linkora-social:main`.

4. **Title**: keep it under 70 characters and use the Conventional Commits
   format (e.g. `feat(sdk): add typed tip client`).

5. **Description**: explain _what_ was implemented and reference the issue
   with `Closes #<issue>`.

6. **Wait for CI** — all required status checks must pass before merging.

7. A maintainer will review and approve. Address any requested changes by
   pushing additional commits (do **not** force-push after review has started).

8. Once approved and green, the PR will be merged using **rebase merge** to
   keep a linear history on `main`.

---

## Branch Protection Rules

The `main` branch is protected with the following rules enforced via GitHub
repository settings:

| Rule                                      | Setting                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Require pull request before merging       | ✅ Enabled                                                                                    |
| Required approving reviews                | **1** (minimum)                                                                               |
| Dismiss stale reviews on new push         | ✅ Enabled                                                                                    |
| Require status checks to pass             | ✅ Enabled                                                                                    |
| Required status checks                    | `CI / JS/TS — typecheck, test, build`<br>`CI / Lint TypeScript Packages`<br>`CI / Unit Tests` |
| Require branches to be up to date         | ✅ Enabled                                                                                    |
| Require linear history (no merge commits) | ✅ Enabled                                                                                    |
| Do not allow force pushes                 | ✅ Enabled                                                                                    |
| Do not allow deletions                    | ✅ Enabled                                                                                    |

### Why these rules?

- **PR reviews** catch bugs and keep the team aligned before code lands.
- **Status checks** ensure every merge passes typecheck, lint, unit tests, and
  contract tests — so `main` is always deployable.
- **Linear history** makes `git bisect` reliable and the log easy to read.
  Use `git rebase` instead of merge commits when incorporating upstream changes.

### Applying the rules (maintainers only)

For maintainers, these settings live in:
**GitHub → Settings → Branches → Branch protection rules → `main`**.

A GitHub CLI command to apply them (requires `admin` scope):

```bash
gh api repos/julianajohn7202-stack/Linkora-social/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["CI / JS/TS — typecheck, test, build","CI / Lint TypeScript Packages","CI / Unit Tests"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null \
  --field required_linear_history=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

---

## Code Style

- **TypeScript**: enforced by ESLint (`pnpm lint`) and Prettier (`pnpm format`).
  Config lives in `.eslintrc.base.json` and `.prettierrc`.
- **Rust**: enforced by `rustfmt` and `clippy`. Run `cargo fmt` and
  `cargo clippy -- -D warnings` before pushing.
- A pre-commit hook (Husky) runs linting automatically on staged files.

---

## Testing

```bash
# TypeScript unit tests
pnpm test

# Contract unit + fuzz tests
pnpm --filter contracts test

# Integration tests (requires Docker)
bash tests/integration/run_e2e.sh

# Migration tests (requires Docker)
bash tests/migrations/test-migrations.sh
```

All tests must pass locally before opening a PR. CI will re-run them on every
push to a PR branch and on every push to `main`.
