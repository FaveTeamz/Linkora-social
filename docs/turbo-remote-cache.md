# Turbo Remote Cache Setup

Turbo remote caching is configured to use [Vercel Remote Cache](https://turbo.build/repo/docs/core-concepts/remote-caching).
When cache hits occur for unchanged packages, CI build time is reduced significantly (>40% for typical runs).

## Required GitHub Actions Secrets

Add these secrets to the repository at **Settings → Secrets and variables → Actions**:

| Secret                             | Description                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `TURBO_TOKEN`                      | Vercel access token with remote cache read/write permissions. Generate at https://vercel.com/account/tokens |
| `TURBO_TEAM`                       | Your Vercel team slug (e.g. `my-org`) or leave blank for personal accounts                                  |
| `TURBO_REMOTE_CACHE_SIGNATURE_KEY` | An arbitrary secret string used to sign cached artifacts. Generate with `openssl rand -hex 32`              |

## How It Works

1. On each CI run, Turbo computes a hash of each task's inputs (source files, env vars, dependencies).
2. If a matching cache entry exists in the remote cache, the task output is restored directly — no rebuild needed.
3. The `TURBO_REMOTE_CACHE_SIGNATURE_KEY` ensures only your CI can write signed artifacts, preventing cache poisoning.
4. Cache hit ratio is surfaced in the **Show Turbo cache summary** step of the `js-ci` job.

## Local Development

To use the remote cache locally, authenticate with Vercel:

```bash
npx turbo login
npx turbo link
```

Or set the environment variables manually:

```bash
export TURBO_TOKEN=<your-token>
export TURBO_TEAM=<your-team-slug>
```

Then run any turbo task as normal:

```bash
pnpm build
pnpm test
pnpm lint
```

## Self-Hosted Alternative

If you prefer a self-hosted remote cache instead of Vercel, replace the Vercel token with credentials for a compatible cache server (e.g., [ducktape](https://github.com/Tapico/turborepo-remote-cache) or a custom HTTP cache endpoint) and set:

```bash
export TURBO_API=https://your-cache-server.example.com
export TURBO_TOKEN=<your-server-token>
export TURBO_TEAM=<team-name>
```

Update the workflow env vars accordingly.
