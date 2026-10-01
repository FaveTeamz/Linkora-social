# Bridge API Reference

The Linkora Bridge is the communication channel between the host shell (web or mobile) and a mini-app running in a sandboxed iframe. The shell injects `window.LinkoraBridge` and dispatches a `linkora:ready` message event once the handshake is complete.

All methods return Promises and reject with a structured error object (`{ code, message }`) on failure.

---

## Table of Contents

1. [Initialisation](#1-initialisation)
2. [wallet.getAddress](#2-walletgetaddress)
3. [wallet.signTransaction](#3-walletsigntransaction)
4. [profile.getProfile](#4-profilegetprofile)
5. [post.createPost](#5-postcreatepost)
6. [Error codes](#6-error-codes)
7. [TypeScript types](#7-typescript-types)

---

## 1. Initialisation

The bridge is not available immediately when the iframe loads. Always wait for the `linkora:ready` message before calling any method.

```ts
window.addEventListener("message", (event) => {
  if (event.data?.type === "linkora:ready") {
    // LinkoraBridge is now available
    init();
  }
});

async function init() {
  const address = await LinkoraBridge.wallet.getAddress();
  console.log("Connected wallet:", address);
}
```

Calling a Bridge method before `linkora:ready` rejects with `BRIDGE_NOT_READY`.

---

## 2. wallet.getAddress

Returns the Stellar public key of the wallet currently connected in the Linkora shell.

**Permission required:** `wallet.read`

**Signature:**

```ts
LinkoraBridge.wallet.getAddress(): Promise<string>
```

**Returns:** The G-address string (56-character Stellar public key).

**Rejects with:**

| Code                   | Condition                                  |
| ---------------------- | ------------------------------------------ |
| `WALLET_NOT_CONNECTED` | No wallet is connected in the parent shell |
| `PERMISSION_DENIED`    | Manifest does not declare `wallet.read`    |

**Example:**

```ts
const address = await LinkoraBridge.wallet.getAddress();
// "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
```

---

## 3. wallet.signTransaction

Presents a Soroban transaction XDR to the user for review and signing. The user sees a human-readable summary in the shell's signing modal and can approve or decline.

**Permission required:** `wallet.sign`

**Signature:**

```ts
LinkoraBridge.wallet.signTransaction(xdr: string): Promise<string>
```

**Parameters:**

| Parameter | Type     | Description                                                           |
| --------- | -------- | --------------------------------------------------------------------- |
| `xdr`     | `string` | Base64-encoded Stellar transaction XDR (unsigned or partially signed) |

**Returns:** The signed transaction XDR as a Base64 string, ready to submit to the Stellar network.

**Rejects with:**

| Code                   | Condition                                           |
| ---------------------- | --------------------------------------------------- |
| `USER_CANCELLED`       | User dismissed the signing modal without approving  |
| `PERMISSION_DENIED`    | Manifest does not declare `wallet.sign`             |
| `INVALID_XDR`          | The provided string is not valid Base64-encoded XDR |
| `WALLET_NOT_CONNECTED` | No wallet is connected                              |

**Example:**

```ts
// Build the transaction XDR using the Linkora SDK or Stellar SDK
const xdr = buildTipTransaction(postId, amountStroops);

try {
  const signedXdr = await LinkoraBridge.wallet.signTransaction(xdr);
  // Submit the signed transaction via Horizon or Soroban RPC
  await submitTransaction(signedXdr);
} catch (err) {
  if (err.code === "USER_CANCELLED") {
    showMessage("Transaction cancelled");
  } else {
    showMessage(`Error: ${err.message}`);
  }
}
```

---

## 4. profile.getProfile

Returns the on-chain profile of the currently connected user.

**Permission required:** `profile.read`

**Signature:**

```ts
LinkoraBridge.profile.getProfile(): Promise<Profile>
```

**Returns:** A `Profile` object (see [§7 TypeScript types](#7-typescript-types)).

**Rejects with:**

| Code                   | Condition                                |
| ---------------------- | ---------------------------------------- |
| `WALLET_NOT_CONNECTED` | No wallet is connected                   |
| `PERMISSION_DENIED`    | Manifest does not declare `profile.read` |

**Example:**

```ts
const profile = await LinkoraBridge.profile.getProfile();
console.log(`Hello, ${profile.displayName}! You have ${profile.followerCount} followers.`);
```

---

## 5. post.createPost

Opens the Linkora post composer pre-filled with a draft. The user reviews and submits the post themselves — the mini-app cannot publish on their behalf.

**Permission required:** `post.create`

**Signature:**

```ts
LinkoraBridge.post.createPost(draft: PostDraft): Promise<void>
```

**Parameters:**

| Parameter             | Type     | Required | Description                                      |
| --------------------- | -------- | -------- | ------------------------------------------------ |
| `draft.text`          | `string` | —        | Pre-filled body text (max 500 characters)        |
| `draft.mediaUrl`      | `string` | —        | HTTPS URL to an image or video to attach         |
| `draft.replyToPostId` | `number` | —        | Pre-fill the composer as a reply to this post ID |

**Returns:** `void`. Resolves when the composer is opened (not when the post is published).

**Rejects with:**

| Code                   | Condition                                |
| ---------------------- | ---------------------------------------- |
| `USER_CANCELLED`       | User closed the composer without posting |
| `PERMISSION_DENIED`    | Manifest does not declare `post.create`  |
| `WALLET_NOT_CONNECTED` | No wallet is connected                   |

**Example:**

```ts
await LinkoraBridge.post.createPost({
  text: "Just tipped this post via Tip Jar! 🫙",
  replyToPostId: 42,
});
```

---

## 6. Error codes

All Bridge rejections carry this shape:

```ts
interface BridgeError {
  code: BridgeErrorCode;
  message: string;
}
```

| Code                   | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `BRIDGE_NOT_READY`     | A method was called before the `linkora:ready` event fired             |
| `PERMISSION_DENIED`    | The manifest does not declare the required permission                  |
| `WALLET_NOT_CONNECTED` | No wallet is connected in the parent shell                             |
| `USER_CANCELLED`       | The user dismissed a signing modal or composer                         |
| `INVALID_XDR`          | The XDR passed to `signTransaction` is not valid                       |
| `UNKNOWN_ERROR`        | An unexpected error occurred in the shell; check `message` for details |

---

## 7. TypeScript types

Copy these into your mini-app if you want type checking without importing the SDK.

```ts
interface LinkoraBridge {
  wallet: {
    getAddress(): Promise<string>;
    signTransaction(xdr: string): Promise<string>;
  };
  profile: {
    getProfile(): Promise<Profile>;
  };
  post: {
    createPost(draft: PostDraft): Promise<void>;
  };
}

interface Profile {
  address: string; // Stellar public key
  handle: string; // e.g. "@alice"
  displayName: string;
  bio: string;
  avatarUrl: string;
  followerCount: number;
  followingCount: number;
}

interface PostDraft {
  text?: string;
  mediaUrl?: string;
  replyToPostId?: number;
}

type BridgeErrorCode =
  | "BRIDGE_NOT_READY"
  | "PERMISSION_DENIED"
  | "WALLET_NOT_CONNECTED"
  | "USER_CANCELLED"
  | "INVALID_XDR"
  | "UNKNOWN_ERROR";

interface BridgeError extends Error {
  code: BridgeErrorCode;
}

declare const LinkoraBridge: LinkoraBridge;
```
