import * as SQLite from "expo-sqlite";
import { Post } from "../components/PostCard";

const db = SQLite.openDatabaseSync("linkora_cache.db");

interface CachedPostRow {
  id: string;
  author: string;
  username: string;
  content: string;
  tip_total: number;
  timestamp: number;
  like_count: number;
  has_liked: number;
  sync_status: string;
}

function rowToPost(row: CachedPostRow): Post {
  return {
    id: row.id,
    author: row.author,
    username: row.username,
    content: row.content,
    tip_total: Number(row.tip_total),
    timestamp: Number(row.timestamp),
    like_count: Number(row.like_count),
    has_liked: row.has_liked === 1,
    sync_status: row.sync_status as "synced" | "pending" | "failed",
  };
}

export type DmSyncStatus = "synced" | "pending" | "failed";

export interface DmMessage {
  id: string;
  conversationId: string;
  sender: string;
  recipient: string;
  content: string;
  ciphertextHash: string;
  timestamp: number;
  syncStatus: DmSyncStatus;
  errorMessage: string | null;
}

export interface IncomingDmMessage {
  id: string;
  sender: string;
  recipient: string;
  content: string;
  ciphertextHash: string;
  timestamp: number;
}

export interface DmMergeResult {
  mergedCount: number;
  newestTimestamp: number | null;
}

interface DmMessageRow {
  id: string;
  conversation_id: string;
  sender: string;
  recipient: string;
  content: string;
  ciphertext_hash: string;
  timestamp: number;
  sync_status: string;
  error_message: string | null;
}

function rowToDmMessage(row: DmMessageRow): DmMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: row.sender,
    recipient: row.recipient,
    content: row.content,
    ciphertextHash: row.ciphertext_hash,
    timestamp: Number(row.timestamp),
    syncStatus: row.sync_status as DmSyncStatus,
    errorMessage: row.error_message,
  };
}

export interface Notification {
  id: string;
  type: string;
  body: string;
  read: boolean;
  createdAt: number;
}

interface NotificationRow {
  id: string;
  type: string;
  body: string;
  read: number;
  created_at: number;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    read: row.read === 1,
    createdAt: Number(row.created_at),
  };
}

/**
 * Initializes the database schema and indices.
 */
export async function initDatabase(): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cached_posts (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      tip_total INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      like_count INTEGER NOT NULL,
      has_liked INTEGER DEFAULT 0,
      sync_status TEXT NOT NULL, -- 'synced' | 'pending' | 'failed'
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_timestamp ON cached_posts (timestamp DESC);

    CREATE TABLE IF NOT EXISTS dm_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      content TEXT NOT NULL,
      ciphertext_hash TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      sync_status TEXT NOT NULL, -- 'synced' | 'pending' | 'failed'
      error_message TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_ts
      ON dm_messages (conversation_id, timestamp ASC);
    CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_hash
      ON dm_messages (conversation_id, ciphertext_hash);

    CREATE TABLE IF NOT EXISTS dm_sync_state (
      conversation_id TEXT PRIMARY KEY,
      sync_cursor INTEGER NOT NULL DEFAULT 0,
      last_read INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      body TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
  `);
}

/**
 * Retrieves paginated posts from the local cache.
 */
export async function getCachedPosts(limit: number, offset: number): Promise<Post[]> {
  const rows = await db.getAllAsync<CachedPostRow>(
    `SELECT * FROM cached_posts ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows.map(rowToPost);
}

/**
 * Retrieves a single cached post by ID.
 */
export async function getCachedPostById(id: string): Promise<Post | null> {
  const row = await db.getFirstAsync<CachedPostRow>(`SELECT * FROM cached_posts WHERE id = ?`, [
    id,
  ]);
  return row ? rowToPost(row) : null;
}

/**
 * Retrieves multiple cached posts by ID in a single query, keyed by ID.
 * IDs with no cached row are simply absent from the returned map.
 */
export async function getCachedPostsByIds(ids: string[]): Promise<Map<string, Post>> {
  const map = new Map<string, Post>();
  if (ids.length === 0) return map;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.getAllAsync<CachedPostRow>(
    `SELECT * FROM cached_posts WHERE id IN (${placeholders})`,
    ids
  );
  for (const row of rows) {
    map.set(row.id, rowToPost(row));
  }
  return map;
}

/**
 * Reconciles remote (chain-confirmed) posts with the local cache.
 *
 * Chain-wins policy:
 *  - For every confirmed chain post, upsert it as 'synced'.
 *  - If a 'pending' or 'failed' optimistic row exists with the SAME author+content
 *    as a confirmed chain post, delete the optimistic row (chain state supersedes it).
 *  - Stale 'synced' rows not present in the remote set are deleted.
 *
 * Runs a fixed number of SQLite statements regardless of feed size: one
 * multi-row upsert, one multi-condition delete for superseded optimistic
 * rows, and one stale-eviction delete — instead of two `runAsync` calls per
 * post inside the transaction.
 */
export async function reconcilePosts(remotePosts: Post[]): Promise<void> {
  if (remotePosts.length === 0) return;

  await db.withTransactionAsync(async () => {
    const createdAt = Math.floor(Date.now() / 1000);

    // Upsert every confirmed chain post in one multi-row statement — chain
    // state always wins on conflict.
    const insertPlaceholders = remotePosts
      .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)")
      .join(", ");
    const insertParams = remotePosts.flatMap((post) => [
      String(post.id),
      post.author,
      post.username || "stellar_user",
      post.content,
      post.tip_total,
      post.timestamp,
      post.like_count,
      post.has_liked ? 1 : 0,
      createdAt,
    ]);
    await db.runAsync(
      `INSERT INTO cached_posts (id, author, username, content, tip_total, timestamp, like_count, has_liked, sync_status, created_at)
       VALUES ${insertPlaceholders}
       ON CONFLICT(id) DO UPDATE SET
         author      = excluded.author,
         username    = excluded.username,
         content     = excluded.content,
         tip_total   = excluded.tip_total,
         timestamp   = excluded.timestamp,
         like_count  = excluded.like_count,
         has_liked   = excluded.has_liked,
         sync_status = 'synced';`,
      insertParams
    );

    // Chain-wins conflict resolution, batched across every post: delete any
    // optimistic (pending/failed) row that matches a confirmed post's
    // author+content but has a different local ID.
    const deleteConditions = remotePosts
      .map(() => "(author = ? AND content = ? AND id != ?)")
      .join(" OR ");
    const deleteParams = remotePosts.flatMap((post) => [
      post.author,
      post.content,
      String(post.id),
    ]);
    await db.runAsync(
      `DELETE FROM cached_posts WHERE sync_status IN ('pending', 'failed') AND (${deleteConditions})`,
      deleteParams
    );

    // Evict stale synced rows that are no longer in the remote set.
    if (remotePosts.length > 0) {
      const remoteIds = remotePosts.map(() => "?").join(",");
      await db.runAsync(
        `DELETE FROM cached_posts WHERE sync_status = 'synced' AND id NOT IN (${remoteIds})`,
        remotePosts.map((post) => String(post.id))
      );
    }
  });
}

/**
 * Inserts an optimistic/pending post.
 */
export async function addOptimisticPost(
  author: string,
  content: string,
  username: string
): Promise<string> {
  const localId = `opt_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  await db.runAsync(
    `INSERT INTO cached_posts (id, author, username, content, tip_total, timestamp, like_count, has_liked, sync_status, created_at)
     VALUES (?, ?, ?, ?, 0, ?, 0, 0, 'pending', ?)`,
    [localId, author, username, content, timestamp, timestamp]
  );
  return localId;
}

/**
 * Retrieves all cached notifications, newest first.
 */
export async function getCachedNotifications(): Promise<Notification[]> {
  const rows = await db.getAllAsync<NotificationRow>(
    `SELECT * FROM notifications ORDER BY created_at DESC`
  );
  return rows.map(rowToNotification);
}

/**
 * Returns the number of unread notifications from the local cache.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM notifications WHERE read = 0`
  );
  return row ? Number(row.count) : 0;
}

/**
 * Reconciles remote notifications with the local cache, preserving the local
 * read flag for notifications that already exist locally.
 */
export async function reconcileNotifications(remote: Notification[]): Promise<void> {
  if (remote.length === 0) return;

  await db.withTransactionAsync(async () => {
    const placeholders = remote.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const params = remote.flatMap((n) => [
      n.id,
      n.type,
      n.body,
      n.read ? 1 : 0,
      n.createdAt,
    ]);
    await db.runAsync(
      `INSERT INTO notifications (id, type, body, read, created_at)
       VALUES ${placeholders}
       ON CONFLICT(id) DO UPDATE SET
         type       = excluded.type,
         body       = excluded.body,
         created_at = excluded.created_at`,
      params
    );
  });
}

/**
 * Marks every notification as read in the local cache.
 */
export async function markAllNotificationsRead(): Promise<void> {
  await db.runAsync(`UPDATE notifications SET read = 1 WHERE read = 0`);
}
