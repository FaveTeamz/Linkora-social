# @linkora/notification

Notification service for the Linkora Social protocol.

## Architecture

```
Event Bus (Stellar/Soroban Events)
             │
             ▼
     Notification Service
             │
             ├──► Preference Engine (preferences.ts)
             │
             ▼
   Multi-Channel Dispatcher (dispatcher.ts)
             ├──► Push Channel (APNs / FCM)
             ├──► In-App Channel (PostgreSQL inbox)
             └──► Email Channel (Resend / SES)
```

## Features
- Multi-channel delivery: push, email, and in-app notifications.
- Preference-aware: respects individual user delivery channel settings.
- Independent fault tolerance: failures in one channel do not block other channels.
- Automatic retries with exponential backoff for transient delivery failures.
- Structured JSON logging per delivery attempt.

## Development & CI

```bash
# Run unit tests
pnpm test

# Type-check
pnpm typecheck

# Lint
pnpm lint
```
