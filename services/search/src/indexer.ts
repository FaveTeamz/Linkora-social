import type { Pool } from 'pg';

/**
 * Search document indexer.
 *
 * Listens to the indexer WebSocket event bus and keeps the `tsvector`
 * columns in the `posts` and `profiles` tables in sync with the source
 * records. Failed indexing attempts are retried up to 3 times before the
 * event is dead-lettered.
 */

export interface IndexerEvent {
  type: 'post_created' | 'post_deleted' | 'profile_updated';
  id: string;
  payload?: Record<string, unknown>;
}

export interface IndexerBus {
  subscribe(
    handler: (event: IndexerEvent) => void | Promise<void>,
  ): void | Promise<void>;
}

export interface DeadLetter {
  event: IndexerEvent;
  error: unknown;
  attempts: number;
}

export interface IndexerOptions {
  pool: Pool;
  bus: IndexerBus;
  /** Maximum retry attempts before dead-lettering. Defaults to 3. */
  maxRetries?: number;
  /** Batch size used by `reindexAll`. Defaults to 500. */
  batchSize?: number;
  /** Optional sink for events that exhausted their retries. */
  deadLetter?: (entry: DeadLetter) => void | Promise<void>;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BATCH_SIZE = 500;

const POST_TSVECTOR_SQL = `
  UPDATE posts
  SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  WHERE id = $1
`;

const PROFILE_TSVECTOR_SQL = `
  UPDATE profiles
  SET search_vector = to_tsvector('english', coalesce(display_name, '') || ' ' || coalesce(bio, ''))
  WHERE id = $1
`;

const DELETE_POST_SQL = `
  UPDATE posts
  SET search_vector = NULL
  WHERE id = $1
`;

export class SearchIndexer {
  private readonly pool: Pool;
  private readonly bus: IndexerBus;
  private readonly maxRetries: number;
  private readonly batchSize: number;
  private readonly deadLetter?: (entry: DeadLetter) => void | Promise<void>;

  constructor(options: IndexerOptions) {
    this.pool = options.pool;
    this.bus = options.bus;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.deadLetter = options.deadLetter;
  }

  /** Subscribe to the indexer event bus. */
  async start(): Promise<void> {
    await this.bus.subscribe((event) => this.handleEvent(event));
  }

  /** Route an incoming bus event to the appropriate indexing operation. */
  async handleEvent(event: IndexerEvent): Promise<void> {
    switch (event.type) {
      case 'post_created':
        await this.withRetry(event, () => this.indexDocument('posts', event.id));
        break;
      case 'post_deleted':
        await this.withRetry(event, () => this.deleteDocument('posts', event.id));
        break;
      case 'profile_updated':
        await this.withRetry(event, () => this.indexDocument('profiles', event.id));
        break;
      default:
        break;
    }
  }

  /** Upsert the `tsvector` column for a single record. */
  async indexDocument(table: 'posts' | 'profiles', id: string): Promise<void> {
    const sql = table === 'posts' ? POST_TSVECTOR_SQL : PROFILE_TSVECTOR_SQL;
    await this.pool.query(sql, [id]);
  }

  /** Clear the `tsvector` column for a deleted record. */
  async deleteDocument(table: 'posts' | 'profiles', id: string): Promise<void> {
    if (table === 'posts') {
      await this.pool.query(DELETE_POST_SQL, [id]);
      return;
    }
    await this.pool.query(
      `UPDATE profiles SET search_vector = NULL WHERE id = $1`,
      [id],
    );
  }

  /** Reindex every existing record in batches of `batchSize`. */
  async reindexAll(): Promise<void> {
    await this.reindexTable('posts', POST_TSVECTOR_SQL);
    await this.reindexTable('profiles', PROFILE_TSVECTOR_SQL);
  }

  private async reindexTable(
    table: 'posts' | 'profiles',
    updateSql: string,
  ): Promise<void> {
    let lastId: string | null = null;

    for (;;) {
      const params: unknown[] = [this.batchSize];
      let query = `SELECT id FROM ${table}`;
      if (lastId !== null) {
        query += ` WHERE id > $2`;
        params.push(lastId);
      }
      query += ` ORDER BY id ASC LIMIT $1`;

      const { rows } = await this.pool.query<{ id: string }>(query, params);
      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        await this.withRetry(
          { type: table === 'posts' ? 'post_created' : 'profile_updated', id: row.id },
          () => this.pool.query(updateSql, [row.id]),
        );
      }

      lastId = rows[rows.length - 1].id;
      if (rows.length < this.batchSize) {
        break;
      }
    }
  }

  private async withRetry(
    event: IndexerEvent,
    operation: () => Promise<unknown>,
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        await operation();
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (this.deadLetter) {
      await this.deadLetter({
        event,
        error: lastError,
        attempts: this.maxRetries,
      });
    }
  }
}
