# Linkora Mobile UI Specification

This document is the canonical reference for screen inventory, component usage, data sources, and accessibility requirements for the Linkora mobile app (`apps/mobile`). It covers the Expo / React Native implementation using Expo Router file-based navigation.

---

## Screen Inventory

| Screen                   | Route                          | Tab / Stack   | Status     |
| ------------------------ | ------------------------------ | ------------- | ---------- |
| Feed                     | `/(tabs)/feed`                 | Tab           | ✅ Live    |
| Explore (Search)         | `/(tabs)/explore`              | Tab           | ✅ Live    |
| Pools List               | `/(tabs)/pools`                | Tab           | ✅ Live    |
| Mini Apps                | `/(tabs)/mini-apps`            | Tab           | ✅ Live    |
| Profile (own)            | `/(tabs)/profile`              | Tab           | ✅ Live    |
| Connect Wallet           | `/connect`                     | Stack (modal) | ✅ Live    |
| Post Detail              | `/post/[id]`                   | Stack         | ✅ Live    |
| Profile Detail           | `/profile/[address]`           | Stack         | ✅ Live    |
| Followers List           | `/profile/followers`           | Stack         | ✅ Live    |
| Following List           | `/profile/following`           | Stack         | ✅ Live    |
| Edit Profile             | `/profile/edit`                | Stack         | ✅ Live    |
| Pool Detail              | `/pool/[id]`                   | Stack         | ✅ Live    |
| DM Conversation          | `/dm/[address]`                | Stack         | ✅ Live    |
| Mini App Viewer          | `/mini-app/[id]`               | Stack         | ✅ Live    |
| Mini App Create Post     | `/mini-app/create-post`        | Stack         | ✅ Live    |
| Settings                 | `/settings`                    | Stack         | ✅ Live    |
| Blocked Users            | `/settings/blocked`            | Stack         | ✅ Live    |
| **Notifications**        | `/notifications`               | Stack         | 🔧 Scaffolded |
| **Search** (deep-linked) | `/search`                      | Stack         | 🔧 Scaffolded |
| **Governance**           | `/governance`                  | Stack         | 🔧 Scaffolded |

---

## New Screens

### Notifications

**Route:** `/notifications`  
**Stack entry:** Pushed from any screen via deep link (`linkora://notifications`) or header bell icon.

#### Purpose

Aggregates all activity notifications for the authenticated user: new followers, likes on posts, tips received, pool deposits, governance proposal updates, and moderation actions.

#### Components Used

| Component            | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `FlatList`           | Virtualized list of notification items                                  |
| `NotificationItem`   | Row component: icon + title + timestamp + unread indicator (to be built)|
| `EmptyState`         | Shown when there are no notifications yet                               |
| `ErrorState`         | Shown when the notification feed fails to load                          |
| `ActivityIndicator`  | Initial load spinner                                                    |
| `RefreshControl`     | Pull-to-refresh                                                         |
| `TxToast`            | Confirms read/dismiss actions                                           |

#### Data Sources

| Data                    | Source                                                              |
| ----------------------- | ------------------------------------------------------------------- |
| Notification feed       | `services/indexer` REST API — `GET /notifications?address={addr}`  |
| Unread count badge      | WebSocket subscription via `LinkoraEventSubscriber` (SDK)          |
| Follow events           | `FollowEvent` from contract event stream                            |
| Tip events              | `TipEvent` from contract event stream                              |
| Governance events       | `GovProposalCreatedEvent`, `GovVoteEvent`, `GovProposalExecutedEvent` |
| Push delivery           | `notifications/registerForPushNotifications.ts` (Expo Push)        |

#### Accessibility Requirements

- Each notification row must have `accessibilityRole="button"` if tappable, `accessibilityLabel` including sender name and action (e.g. `"alice followed you, 5 minutes ago"`).
- Unread indicator dot must expose state via `accessibilityLabel="Unread notification"`.
- The screen title must be announced when navigated to: `accessibilityLabel="Notifications"`.
- Pull-to-refresh must be keyboard-accessible on iOS (VoiceOver swipe gesture).
- Minimum tap target: 44 × 44 pt per Apple HIG / Android 48 dp.

---

### Search

**Route:** `/search` (deep-linked standalone screen) and `/(tabs)/explore` (tab version)  
**Stack entry:** Pushed via `linkora://search?q=<query>` deep link or search icon in header.

#### Purpose

Provides full-text search across creator profiles and community pools. The tab version (`/(tabs)/explore`) is the primary entry point; the standalone `/search` route supports deep-linked pre-populated queries.

#### Components Used

| Component           | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `SearchBar`         | Controlled text input with debounce (300 ms)                   |
| `ProfileRow`        | Single profile result row with address, username, bio          |
| `PoolRow`           | Single pool result row with name, token, balance, member count |
| `ProfileCardSkeleton` | Loading placeholder for profile results                      |
| `PoolCardSkeleton`  | Loading placeholder for pool results                           |
| `EmptyState`        | "No results" and "Enter a query" states                        |
| `ErrorState`        | Search failure with retry                                      |
| `ScrollView`        | Result list container with `RefreshControl`                    |

#### Data Sources

| Data               | Source                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| Profile search     | `services/indexer` REST API — `GET /profiles/search?q=<query>`               |
| Pool search        | `services/indexer` REST API — `GET /pools/search?q=<query>`                  |
| Profile data       | `LinkoraClient.getProfile(address)` (on tap for detail navigation)           |
| Pool data          | `LinkoraClient.getPool(poolId)` (on tap for detail navigation)               |

#### Accessibility Requirements

- `SearchBar` must have `accessibilityLabel="Search Linkora"` and `accessibilityHint="Search for creators and pools"`.
- Result counts must be announced after each search: `accessibilityLiveRegion="polite"` on the result summary text.
- Section headings ("Profiles", "Pools") must use `accessibilityRole="header"`.
- Each `ProfileRow` and `PoolRow` must have a meaningful `accessibilityLabel` (e.g. `"maya, Creator economy researcher"`).
- "Clear search" button must have `accessibilityRole="button"` and `accessibilityLabel="Clear search query"`.
- Minimum tap target: 44 × 44 pt.

---

### Governance

**Route:** `/governance`  
**Stack entry:** Pushed from the Profile screen settings panel, or via deep link `linkora://governance`.

#### Purpose

Allows users to view active and past governance proposals, cast votes (support / oppose), and inspect proposal details including current tally, quorum status, and execution state.

#### Components Used

| Component              | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `FlatList`             | Virtualized list of proposals                                           |
| `ProposalCard`         | Summary card: title, parameter changed, status badge, vote counts (to be built) |
| `ProposalDetailSheet`  | Bottom sheet with full description, current tally, vote CTA (to be built) |
| `Badge`                | Status pill: `Active` / `Passed` / `Rejected` / `Vetoed` / `Executed`  |
| `EmptyState`           | Shown when no proposals exist yet                                       |
| `ErrorState`           | Shown on fetch failure                                                  |
| `ActivityIndicator`    | Initial load spinner                                                    |
| `RefreshControl`       | Pull-to-refresh                                                         |
| `TxToast`              | Confirms vote submission                                                |

#### Data Sources

| Data                     | Source                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Proposal list            | `LinkoraClient.govGetProposal(proposalId)` — paginated by incrementing IDs          |
| Governance config        | `LinkoraClient.govGetConfig()` (quorum, voting period, time-lock)                   |
| Vote submission          | `LinkoraClient.prepareGovVoteTx(voter, proposalId, support)` → wallet sign + submit |
| Effective quorum         | `LinkoraClient.effectiveQuorum(proposalId)`                                          |
| Proposal events          | `GovProposalCreatedEvent`, `GovVoteEvent`, `GovProposalExecutedEvent` (SDK events)  |
| Wallet address           | `useWallet()` hook                                                                   |
| Transaction submission   | `useSubmitTx()` hook                                                                 |

#### Accessibility Requirements

- Each `ProposalCard` must have `accessibilityRole="button"` if tappable, with `accessibilityLabel` including the proposal title and current status (e.g. `"Reduce fee to 100 bps, Active, 47% support"`).
- Status badge must include status text in the accessible label — do not rely on color alone to convey state.
- Vote buttons ("Support" / "Oppose") must have `accessibilityRole="button"` and `accessibilityHint="Double tap to cast your vote"`.
- Vote tallies must be conveyed as text (e.g. `"312 in support, 88 opposed"`) not only as a progress bar.
- After a vote is cast, focus must return to the proposal card and an announcement made: `accessibilityLiveRegion="assertive"` on the toast.
- Minimum tap target: 44 × 44 pt.

---

## Existing Tab Screens (Updated)

### Feed

**Route:** `/(tabs)/feed`  
**Components:** `PostCard`, `PostCardSkeleton`, `EmptyState`, `ErrorState`, `FlatList`, `RefreshControl`  
**Data sources:** `useFeed()` hook → SQLite local cache (`utils/db`) + `LinkoraClient` RPC sync  
**Accessibility:** Posts use `accessibilityRole="article"`. Like and tip buttons have `accessibilityLabel` with post content preview.

### Pools

**Route:** `/(tabs)/pools`  
**Components:** `PoolCard`, `PoolCardSkeleton`, `EmptyState`, `ScrollView`  
**Data sources:** `usePools()` hook → `LinkoraClient.getPool()`  
**Accessibility:** Each pool card has `accessibilityRole="button"` with label including pool name and balance.

### Mini Apps

**Route:** `/(tabs)/mini-apps`  
**Components:** `MiniAppIcon`, `FlatList` or grid  
**Data sources:** Local manifest registry (installed apps), `MiniAppManifest` schema  
**Accessibility:** Each app icon has `accessibilityRole="button"` and `accessibilityLabel` with app name and description.

### Profile (own)

**Route:** `/(tabs)/profile`  
**Components:** `ProfileHeader`, `EmptyState`, `ErrorState`  
**Data sources:** `useWallet()`, `useProfile(address)`, `useNetwork()`  
**Accessibility:** Address text is marked `accessibilityRole="text"` with `accessibilityLabel="Wallet address"`. Disconnect button has `accessibilityRole="button"`.

---

## Navigation Structure

```
Root Stack (_layout.tsx)
├── (tabs)                    ← Bottom tab navigator (no header)
│   ├── feed                  Feed
│   ├── explore               Search / Explore
│   ├── pools                 Pools list
│   ├── mini-apps             Mini apps grid
│   └── profile               Own profile
├── connect                   Wallet connection (modal)
├── post/[id]                 Post detail
├── profile/[address]         Public profile detail
├── pool/[id]                 Pool detail
├── pools/[id]                Pool detail (alias)
├── dm/[address]              DM conversation
├── mini-app/[id]             Mini app WebView
├── mini-app/create-post      Post composition (from mini app)
├── settings                  App settings
├── settings/blocked          Blocked users list
├── notifications             ← New: notification feed
├── search                    ← New: standalone search
└── governance                ← New: governance proposals
```

---

## Global Accessibility Notes

- All interactive elements must meet WCAG 2.1 AA contrast ratio (4.5:1 for text, 3:1 for UI components) using design tokens from `docs/design/tokens.css`.
- Dark background `#0f172a` with primary text `#f8fafc` (contrast ratio ≈ 15:1 — passes AAA).
- Brand accent `#6366f1` on dark background — verify contrast for any text rendered in this color against its actual background.
- Touch targets must be at minimum 44 × 44 pt (iOS HIG) / 48 × 48 dp (Material Design).
- All `Image` components must include `accessibilityLabel` describing the image content.
- Use `accessibilityLiveRegion="polite"` for non-critical async updates (search results, follow counts). Use `"assertive"` only for errors and transaction confirmations.
