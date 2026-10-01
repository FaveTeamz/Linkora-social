# GitHub Production Environment Setup

This file documents how to configure the `production` GitHub environment with protection rules.

The `deploy-production.yml` workflow references the `production` environment.
You must configure this environment in the GitHub repository settings.

## Steps to Configure

1. Go to **Settings → Environments** in the GitHub repository
2. Click on **production** (created automatically when the workflow runs the first time, or create it manually)
3. Under **Deployment protection rules**, enable:
   - **Required reviewers** — add at least one required reviewer (e.g. repo maintainers)
   - **Wait timer** — optionally add a delay (e.g. 5 minutes) before deployment proceeds
4. Under **Deployment branches**, set **Selected branches** and add the pattern `main` to restrict production deployments to the main branch only
5. Add the following **Secrets** to the environment (not the repo):
   - `ADMIN_SECRET` — admin signing key for contract operations
   - `TREASURY_ADDRESS` — treasury wallet address

## How It Works

When `.github/workflows/deploy-production.yml` is triggered:
1. A reviewer sees a pending deployment in the **Environments** tab (visible at repo → Actions → Deployments)
2. The reviewer approves or rejects the deployment
3. Only after approval does the `deploy` job continue
4. All deployments are logged in the **Environments** tab with the deployer, commit SHA, and timestamp

## Deployment History

Deployment history is automatically visible at:
`https://github.com/<owner>/<repo>/deployments/activity_log?environment=production`
