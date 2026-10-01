# Mini-App Developer Guide

Build and publish a Linkora mini-app that runs inside the Linkora mobile and web shells, with access to the user's wallet and profile through the Bridge API.

---

## Table of Contents

1. [Quickstart — scaffold in < 5 minutes](#1-quickstart--scaffold-in--5-minutes)
2. [Manifest schema](#2-manifest-schema)
3. [Manifest validation](#3-manifest-validation)
4. [Bridge API reference](#4-bridge-api-reference)
5. [Canonical example — Tip Jar](#5-canonical-example--tip-jar)
6. [Submitting your mini-app](#6-submitting-your-mini-app)

---

## 1. Quickstart — scaffold in < 5 minutes

You only need a static HTML file and a manifest. No build toolchain is required.

### Step 1 — create a project directory

```bash
mkdir my-linkora-app
cd my-linkora-app
```

### Step 2 — create `linkora-manifest.json`

```json
{
  "name": "My App",
  "version": "1.0.0",
  "description": "A short description (max 200 chars).",
  "entryPoint": "index.html",
  "permissions": ["wallet.read"]
}
```

All fields except `description` and `icon` are required. See [§2 Manifest schema](#2-manifest-schema) for the full field reference.

### Step 3 — create `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <p id="address">Loading wallet…</p>

    <script>
      // The Bridge is injected by the Linkora shell as window.LinkoraBridge
      window.addEventListener("message", (event) => {
        if (event.data?.type === "linkora:ready") {
          LinkoraBridge.wallet.getAddress().then((address) => {
            document.getElementById("address").textContent = address;
          });
        }
      });
    </script>
  </body>
</html>
```

### Step 4 — validate the manifest locally

```bash
# From the repo root
npx ts-node -e "
  import { validateManifest } from './packages/sdk/src/mini-apps/validateManifest';
  import manifest from './my-linkora-app/linkora-manifest.json';
  console.log(validateManifest(manifest));
"
```

Or use the SDK programmatically — see [§3 Manifest validation](#3-manifest-validation).

### Step 5 — test inside the shell

Serve your app on `localhost` and set the entry point to your local URL during development:

```json
{
  "entryPoint": "http://localhost:5173/index.html"
}
```

Open the Linkora web app (`apps/web`), navigate to Mini Apps → Developer Mode, and paste your manifest or local URL. The shell loads your app in an iframe with the Bridge injected.

---

## 2. Manifest schema

The manifest is a JSON file named `linkora-manifest.json` at the root of your mini-app. It is validated against the JSON Schema in [`docs/mini-apps/manifest.schema.json`](../mini-apps/manifest.schema.json) and the TypeScript validator in `packages/sdk/src/mini-apps/validateManifest.ts`.

| Field         | Type       | Required | Constraints            | Description                                   |
| ------------- | ---------- | -------- | ---------------------- | --------------------------------------------- |
| `name`        | `string`   | ✅       | 1–50 characters        | Display name shown in the mini-app list       |
| `version`     | `string`   | ✅       | Semver (`x.y.z`)       | App version                                   |
| `description` | `string`   | —        | max 200 characters     | Short description shown below the app name    |
| `entryPoint`  | `string`   | ✅       | max 2048 characters    | Relative path or absolute HTTPS URL to load   |
| `icon`        | `string`   | —        | max 100 000 characters | HTTPS URL or Base64 data URL for the app icon |
| `permissions` | `string[]` | ✅       | See below              | Capabilities requested from the user          |

### Permissions

Only the permissions listed here are granted. Any Bridge call that requires a permission not listed in the manifest is rejected with `PERMISSION_DENIED`.

| Permission     | Grants access to                                    |
| -------------- | --------------------------------------------------- |
| `wallet.read`  | Read the connected wallet address                   |
| `wallet.sign`  | Request transaction signing                         |
| `profile.read` | Read the current user's profile data                |
| `post.create`  | Open the post composer pre-filled with your content |

### Validation rules

- `additionalProperties` is `false` — unknown fields cause validation failure.
- `entryPoint` must be a relative path (for submitted apps) or an HTTPS URL. `http://` (non-TLS) URLs are only accepted in Developer Mode.
- `permissions` must be unique — duplicate values cause validation failure.

---

## 3. Manifest validation

The SDK exports `validateManifest` from `packages/sdk/src/mini-apps/validateManifest.ts`. It throws `InvalidManifestError` (from `packages/sdk/src/errors.ts`) when validation fails.

```ts
import { validateManifest } from "@linkora/sdk/mini-apps/validateManifest";

const raw = await fetch("/linkora-manifest.json").then((r) => r.json());

try {
  const manifest = validateManifest(raw);
  console.log("Valid manifest:", manifest.name, manifest.version);
} catch (err) {
  // err.message contains the AJV validation error string
  console.error("Invalid manifest:", err.message);
}
```

The validator enforces the same schema as `docs/mini-apps/manifest.schema.json` but adds two extra runtime checks:

- `entryPoint` length ≤ 2 048 characters.
- `icon` data URL length ≤ 100 000 characters (to prevent embedding multi-MB images in the manifest).

---

## 4. Bridge API reference

The Linkora shell injects `window.LinkoraBridge` into every mini-app iframe before dispatching the `linkora:ready` message event. All methods return Promises.

> **Important:** Never call Bridge methods before the `linkora:ready` event fires. The bridge object may not be present on the window until the shell has finished its handshake.

```ts
window.addEventListener("message", (event) => {
  if (event.data?.type === "linkora:ready") {
    // Safe to call Bridge methods here
  }
});
```

### `wallet` namespace

| Method            | Signature                          | Permission    | Description                                                                                                                                       |
| ----------------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAddress`      | `() => Promise<string>`            | `wallet.read` | Returns the Stellar public key (`G…`) of the connected wallet. Rejects if no wallet is connected.                                                 |
| `signTransaction` | `(xdr: string) => Promise<string>` | `wallet.sign` | Presents the transaction XDR to the user for approval. Returns the signed XDR on approval, or rejects with `USER_CANCELLED` if the user declines. |

### `profile` namespace

| Method       | Signature                | Permission     | Description                                                            |
| ------------ | ------------------------ | -------------- | ---------------------------------------------------------------------- |
| `getProfile` | `() => Promise<Profile>` | `profile.read` | Returns the current user's on-chain profile. See `Profile` type below. |

```ts
interface Profile {
  address: string; // Stellar public key
  handle: string; // e.g. "@alice"
  displayName: string;
  bio: string;
  avatarUrl: string;
  followerCount: number;
  followingCount: number;
}
```

### `post` namespace

| Method       | Signature                             | Permission    | Description                                                                                                                                           |
| ------------ | ------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPost` | `(draft: PostDraft) => Promise<void>` | `post.create` | Opens the Linkora post composer pre-filled with the given draft. The user reviews and submits the post; the mini-app does not submit on their behalf. |

```ts
interface PostDraft {
  text?: string; // Pre-filled body text (max 500 characters)
  mediaUrl?: string; // Optional image or video URL to attach
  replyToPostId?: number; // Pre-fill as a reply to this post ID
}
```

### Error codes

Bridge rejections carry a `code` property:

| Code                   | Meaning                                                 |
| ---------------------- | ------------------------------------------------------- |
| `PERMISSION_DENIED`    | The manifest does not declare the required permission   |
| `USER_CANCELLED`       | The user dismissed the signing dialog or composer       |
| `WALLET_NOT_CONNECTED` | No wallet is connected in the parent shell              |
| `INVALID_XDR`          | The XDR passed to `signTransaction` could not be parsed |
| `BRIDGE_NOT_READY`     | A Bridge method was called before `linkora:ready` fired |

```ts
LinkoraBridge.wallet.signTransaction(xdr).catch((err) => {
  if (err.code === "USER_CANCELLED") {
    console.log("User declined the transaction");
  }
});
```

---

## 5. Canonical example — Tip Jar

The reference implementation lives at [`examples/mini-apps/tip-jar/`](../../examples/mini-apps/tip-jar/).

| File                                                                              | Purpose                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`index.html`](../../examples/mini-apps/tip-jar/index.html)                       | Single-file UI: wallet connect row, post-ID input, amount presets, tip button |
| [`linkora-manifest.json`](../../examples/mini-apps/tip-jar/linkora-manifest.json) | Declares `wallet.getAddress` and `wallet.signTransaction` permissions         |

The Tip Jar demonstrates:

- Waiting for `linkora:ready` before using the Bridge.
- Calling `wallet.getAddress()` to populate the connected-address display.
- Building a Soroban `tip_post` transaction XDR client-side and passing it to `wallet.signTransaction()`.
- Handling `USER_CANCELLED` and network errors gracefully with status messages.

Read through `examples/mini-apps/tip-jar/index.html` before building your own app — it covers every Bridge interaction pattern in under 400 lines of vanilla HTML and JavaScript.

---

## 6. Submitting your mini-app

1. **Validate** your manifest with `validateManifest` (see [§3](#3-manifest-validation)).
2. **Host** your app at a stable HTTPS URL (or bundle it as a single self-contained HTML file).
3. **Open a pull request** to this repository that adds your app under `examples/mini-apps/<your-app-name>/`, including:
   - `linkora-manifest.json`
   - `index.html` (or a pointer to your hosted URL in the manifest's `entryPoint`)
   - A brief `README.md` describing what the app does
4. The Linkora team reviews permissions, UX, and code quality before merging.

For questions, join the [Telegram community](https://t.me/+13csp8G4ccRhY2Zk) or open a GitHub Discussion.
