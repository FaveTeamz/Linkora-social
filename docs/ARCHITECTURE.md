# System Architecture

This document describes the major components of the Linkora platform and how they interact.

---

## Table of Contents

1. [High-level overview](#1-high-level-overview)
2. [Component breakdown](#2-component-breakdown)
3. [DM encryption architecture](#3-dm-encryption-architecture)

---

## 1. High-level overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Soroban Smart Contract  (packages/contracts)                   │
│  Profiles · Posts · Tips · Pools · Governance · Moderation      │
└───────────┬────────────────────────┬────────────────────────────┘
            │ contract calls (XDR)   │ events (Stellar RPC)
            ▼                        ▼
┌──────────────────────┐   ┌─────────────────────────────────────┐
│  SDK (packages/sdk)  │   │  Indexer (services/indexer)         │
│  LinkoraClient       │   │  PostgreSQL · full-text search API  │
│  TransactionQueue    │   └──────────────┬──────────────────────┘
└──────────┬───────────┘                  │ REST / WebSocket
           │                              ▼
           │              ┌────────────────────────────────────┐
           └─────────────►│  Web (apps/web)                    │
                          │  Mobile (apps/mobile)              │
                          │  Next.js 15 · Expo / React Native  │
                          └────────────────────────────────────┘
```

---

## 2. Component breakdown

| Component        | Path                        | Role                                                                              |
| ---------------- | --------------------------- | --------------------------------------------------------------------------------- |
| Smart contract   | `packages/contracts`        | On-chain state: profiles, posts, tips, pools, governance, moderation              |
| SDK              | `packages/sdk`              | Typed TypeScript client; wraps XDR encoding, transaction queuing, DM crypto       |
| Indexer          | `services/indexer`          | Listens for Stellar events, stores them in PostgreSQL, exposes REST/WS search API |
| DM relay         | `services/dm-relay`         | Routes ciphertext between users; never sees plaintext                             |
| Analytics oracle | `services/analytics-oracle` | Aggregates off-chain engagement signals and submits them on-chain                 |
| Web              | `apps/web`                  | Next.js 15 frontend                                                               |
| Mobile           | `apps/mobile`               | Expo / React Native app                                                           |
| Mini apps        | `examples/mini-apps`        | Third-party apps embedded in the shell via the Bridge API                         |

---

## 3. DM encryption architecture

Linkora's direct messages are end-to-end encrypted (E2EE). The relay service (`services/dm-relay`) routes opaque ciphertext and is architecturally prevented from reading message content. Encryption and decryption happen exclusively in the client (SDK).

### Cryptographic primitives

| Primitive                | Algorithm             | Library                 |
| ------------------------ | --------------------- | ----------------------- |
| Key agreement            | X25519 Diffie-Hellman | `@noble/curves/ed25519` |
| Key derivation           | HKDF-SHA256           | `@noble/hashes/hkdf`    |
| Authenticated encryption | ChaCha20-Poly1305     | `@noble/ciphers/chacha` |

Implemented in [`packages/sdk/src/dm/crypto.ts`](../packages/sdk/src/dm/crypto.ts).

### End-to-end message flow

```
Sender                        Relay (dm-relay)              Recipient
  │                                  │                           │
  │  1. generateDmKeypair()          │                           │
  │     → X25519 key pair            │                           │
  │                                  │                           │
  │  2. publishDmKey(pubKey)         │                           │
  │     → on-chain via contract ─────────────────────────────────│──► stored in contract
  │                                  │                           │
  │  3. getDmKey(recipientAddr)      │                           │    (recipient did the same)
  │     ← recipient's pubKey ◄───────────────────────────────────│
  │                                  │                           │
  │  4. deriveSharedSecret(          │                           │
  │       myPrivKey, theirPubKey)    │                           │
  │     → X25519 shared secret       │                           │
  │                                  │                           │
  │  5. deriveConversationKey(       │                           │
  │       sharedSecret, convId)      │                           │
  │     → HKDF 32-byte key           │                           │
  │                                  │                           │
  │  6. encryptMessage(              │                           │
  │       key, plaintext, idx)       │                           │
  │     → ChaCha20-Poly1305          │                           │
  │       ciphertext                 │                           │
  │                                  │                           │
  │  7. sendMessage(ciphertext) ────►│                           │
  │     (Stellar-signed HTTP POST)   │  stores ciphertext        │
  │                                  │  never decrypts           │
  │                                  │                           │
  │                                  │──► WebSocket push ───────►│
  │                                  │    or HTTP poll           │
  │                                  │                           │
  │                                  │         8. getMessages() ►│
  │                                  │◄── ciphertext array ──────│
  │                                  │                           │
  │                                  │    9. getDmKey(senderAddr)│
  │                                  │◄──────────────────────────│──► from contract
  │                                  │                           │
  │                                  │   10. deriveSharedSecret( │
  │                                  │         myPrivKey,        │
  │                                  │         senderPubKey)     │
  │                                  │                           │
  │                                  │   11. decryptMessage(     │
  │                                  │         key, ciphertext,  │
  │                                  │         idx)              │
  │                                  │       → plaintext         │
```

### Key registration

1. Each user calls `generateDmKeypair()` (in `packages/sdk/src/dm/crypto.ts`) to create an X25519 key pair. DM keys are **separate** from Stellar signing keys.
2. The public key is published on-chain via `publishDmKey(address, publicKey)` on the Linkora contract. This makes it discoverable by any other user without a central key server.
3. Before sending or receiving messages, both parties call `getDmKey(address)` to fetch each other's public key from the contract.

### Shared secret derivation

Both sender and recipient independently compute the same shared secret using X25519:

```
sharedSecret = X25519(myPrivateKey, theirPublicKey)
```

Because X25519 is commutative, both parties arrive at the same value without exchanging the secret itself. A per-conversation key is then derived with HKDF:

```
conversationKey = HKDF-SHA256(sharedSecret, info="linkora-dm-v1:<conversationId>")
```

where `conversationId` is `SHA256(sort([addressA, addressB]).join(""))` — deterministic and direction-independent.

### Per-message nonces

To prevent nonce reuse without requiring synchronisation, each message's 12-byte ChaCha20 nonce is derived from the conversation key and the message index:

```
nonce = HKDF-SHA256(conversationKey, info="nonce:<messageIndex>", length=12)
```

The message index is an application-level counter that increases monotonically within a conversation. Nonce reuse for the same conversation key would break the authenticated encryption guarantee, so correct index management is critical.

### Relay authentication

The relay rejects unauthenticated submissions. Every message `POST` must carry a Stellar-signed auth payload (`services/dm-relay/src/auth.ts`):

```
authMessage = SHA256("<to>:<nonce>:<timestamp>")
signature   = Ed25519_sign(senderPrivateKey, authMessage)
```

The relay verifies the signature and enforces a 30-second timestamp window to prevent replay attacks. A per-signature replay cache is maintained in memory for the duration of the skew window.

### Key rotation

Key rotation is not yet fully implemented. The planned flow is:

1. The user generates a new X25519 key pair and publishes it on-chain, overwriting the old public key.
2. The SDK's `detectKeyRotation()` function (in `packages/sdk/src/dm/relay.ts`) checks whether the on-chain public key differs from the key used to encrypt previous messages. If a rotation is detected, the client fetches the new key and uses it for subsequent messages.
3. Messages encrypted under the old key remain readable as long as the old private key is retained locally.

### Forward secrecy

The current scheme does **not** provide forward secrecy: the static X25519 key pair is long-lived, so an attacker who obtains a user's DM private key can decrypt all past messages they have access to.

Forward secrecy is planned for a future protocol version using a Double Ratchet or similar mechanism layered on top of the existing HKDF derivation.

### Code references

| Concern                                              | File                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Key generation, HKDF derivation, encrypt/decrypt     | [`packages/sdk/src/dm/crypto.ts`](../packages/sdk/src/dm/crypto.ts)     |
| Relay HTTP client, WebSocket, key rotation detection | [`packages/sdk/src/dm/relay.ts`](../packages/sdk/src/dm/relay.ts)       |
| High-level `DmService` (key publish, send, receive)  | [`packages/sdk/src/dm/index.ts`](../packages/sdk/src/dm/index.ts)       |
| Relay server: Stellar signature verification         | [`services/dm-relay/src/auth.ts`](../services/dm-relay/src/auth.ts)     |
| Relay server: message routes                         | [`services/dm-relay/src/routes.ts`](../services/dm-relay/src/routes.ts) |
