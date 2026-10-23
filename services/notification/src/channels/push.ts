import { Expo, ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from 'expo-server-sdk';
import { prisma } from '../db';
import { logger } from '../logger';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushReceipt {
  token: string;
  ok: boolean;
  id?: string;
  error?: string;
  details?: unknown;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

async function sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Expo push send failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { data?: ExpoPushTicket[] };
  return json.data ?? [];
}

async function fetchReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Expo push receipts failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { data?: Record<string, ExpoPushReceipt> };
  return json.data ?? {};
}

async function removeStaleTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await prisma.pushToken.deleteMany({ where: { token: { in: tokens } } });
  } catch (err) {
    logger.error({ err, tokens }, 'Failed to remove stale push tokens');
  }
}

export async function sendPush(tokens: string[], payload: PushPayload): Promise<PushReceipt[]> {
  const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));
  if (validTokens.length === 0) {
    return [];
  }

  const receipts: PushReceipt[] = [];
  const staleTokens: string[] = [];
  const ticketToToken = new Map<string, string>();

  for (const batch of chunk(validTokens, MAX_BATCH_SIZE)) {
    const messages: ExpoPushMessage[] = batch.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: 'default',
    }));

    let tickets: ExpoPushTicket[];
    try {
      tickets = await sendBatch(messages);
    } catch (err) {
      logger.error({ err }, 'Expo push batch send failed');
      for (const token of batch) {
        receipts.push({ token, ok: false, error: 'send_failed' });
      }
      continue;
    }

    tickets.forEach((ticket, index) => {
      const token = batch[index];
      if (ticket.status === 'ok') {
        receipts.push({ token, ok: true, id: ticket.id });
        ticketToToken.set(ticket.id, token);
      } else {
        const error = ticket.details?.error ?? 'unknown_error';
        receipts.push({ token, ok: false, error, details: ticket.details });
        if (error === 'DeviceNotRegistered') {
          staleTokens.push(token);
        }
      }
    });
  }

  if (ticketToToken.size > 0) {
    try {
      const receiptMap = await fetchReceipts(Array.from(ticketToToken.keys()));
      for (const [id, receipt] of Object.entries(receiptMap)) {
        const token = ticketToToken.get(id);
        if (!token) continue;
        if (receipt.status === 'error') {
          const error = receipt.details?.error ?? 'unknown_error';
          const existing = receipts.find((r) => r.token === token && r.id === id);
          if (existing) {
            existing.ok = false;
            existing.error = error;
            existing.details = receipt.details;
          }
          if (error === 'DeviceNotRegistered') {
            staleTokens.push(token);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Expo push receipt fetch failed');
    }
  }

  await removeStaleTokens(Array.from(new Set(staleTokens)));

  return receipts;
}
