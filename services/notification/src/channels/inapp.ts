import { Pool } from 'pg';
import type { NotificationPayload } from '../types';

export interface InAppChannelOptions {
  pool: Pool;
  broadcast: (event: { type: string; data: unknown }) => void;
}

export interface InAppNotification {
  id: string;
  address: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export class InAppChannel {
  private readonly pool: Pool;
  private readonly broadcast: (event: { type: string; data: unknown }) => void;

  constructor(options: InAppChannelOptions) {
    this.pool = options.pool;
    this.broadcast = options.broadcast;
  }

  async send(payload: NotificationPayload): Promise<InAppNotification> {
    const result = await this.pool.query<{
      id: string;
      address: string;
      type: string;
      title: string;
      body: string;
      data: Record<string, unknown> | null;
      read: boolean;
      created_at: string;
    }>(
      `INSERT INTO notifications (address, type, title, body, data, read, created_at)
       VALUES ($1, $2, $3, $4, $5, false, now())
       RETURNING id, address, type, title, body, data, read, created_at`,
      [
        payload.address,
        payload.type,
        payload.title,
        payload.body,
        payload.data ?? null,
      ],
    );

    const row = result.rows[0];
    const notification: InAppNotification = {
      id: row.id,
      address: row.address,
      type: row.type,
      title: row.title,
      body: row.body,
      data: row.data,
      read: row.read,
      createdAt: row.created_at,
    };

    this.broadcast({
      type: 'notification',
      data: notification,
    });

    return notification;
  }

  async markAllRead(address: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE notifications SET read = true WHERE address = $1 AND read = false`,
      [address],
    );
    return result.rowCount ?? 0;
  }
}
