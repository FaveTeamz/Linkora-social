/**
 * In-process pub/sub event bus.
 *
 * Decouples the ingestion pipeline from downstream consumers (the WebSocket
 * push handler today; a search indexer or notification service tomorrow).
 * Consumers subscribe to typed channels instead of polling the database.
 *
 * Built on Node's EventEmitter. Channels are keyed by contract event type
 * (the first element of an event's `topic` array, e.g. "PostCreated"),
 * plus a wildcard `"*"` channel that receives every event.
 */

import { EventEmitter } from "events";

/**
 * Normalised event payload published on the bus. This is the shape every
 * downstream consumer sees, independent of how it was sourced from RPC.
 */
export interface BusEvent {
  /** Contract event type, e.g. "PostCreated" — taken from topic[0]. */
  type: string;
  /** Ledger the event was emitted in. */
  ledgerSequence: number;
  /** Index of the event within its ledger. */
  eventIndex: number;
  /** Contract that emitted the event. */
  contractId: string;
  /** Raw topic array. */
  topic: string[];
  /** Decoded / raw event body. */
  data: unknown;
}

/** Channel that receives every event regardless of type. */
export const ALL_EVENTS = "*";
export const DEFAULT_MAX_LISTENERS = 100;

/**
 * Canonical channel names for the search indexer. Contract events arrive with
 * PascalCase types (e.g. "PostCreated"); the search indexer subscribes to the
 * snake_case aliases below. Both spellings are published so consumers can use
 * whichever convention they prefer.
 */
export const POST_CREATED = "post_created";
export const POST_DELETED = "post_deleted";
export const PROFILE_UPDATED = "profile_updated";

/** Map a contract event type to its snake_case search-indexer channel. */
const SEARCH_CHANNEL_ALIASES: Record<string, string> = {
  PostCreated: POST_CREATED,
  PostDeleted: POST_DELETED,
  ProfileUpdated: PROFILE_UPDATED,
};

export type BusListener = (event: BusEvent) => void;

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor(maxListeners: number = DEFAULT_MAX_LISTENERS) {
    // Downstream consumers can be numerous (e.g. WS clients). Set a sane max listeners
    // threshold so leaked subscribers trigger warnings instead of being silently ignored.
    this.emitter.setMaxListeners(maxListeners);
  }

  /**
   * Set max listeners allowed before warning of potential memory leaks.
   */
  setMaxListeners(n: number): void {
    this.emitter.setMaxListeners(n);
  }

  /**
   * Get current max listeners setting.
   */
  getMaxListeners(): number {
    return this.emitter.getMaxListeners();
  }

  /**
   * Subscribe to a specific event type. Returns an unsubscribe function.
   */
  on(type: string, listener: BusListener): () => void {
    const max = this.emitter.getMaxListeners();
    if (max > 0 && this.emitter.listenerCount(type) >= max) {
      console.warn(
        `[bus] MaxListenersExceededWarning: Possible EventBus memory leak detected. ` +
          `Listener count on channel "${type}" reached limit of ${max}.`
      );
    }
    this.emitter.on(type, listener);
    return () => this.emitter.off(type, listener);
  }

  /**
   * Subscribe to every event published on the bus. Returns an unsubscribe
   * function. Used by the WebSocket fanout, which forwards all events.
   */
  onAny(listener: BusListener): () => void {
    return this.on(ALL_EVENTS, listener);
  }

  /**
   * Publish an event. Delivered synchronously to the type-specific channel
   * and to the wildcard channel. Listener exceptions are isolated so one bad
   * consumer cannot break fanout to the others.
   *
   * For the search-relevant contract events, the event is also delivered on
   * its snake_case alias channel (e.g. "PostCreated" -> "post_created") so
   * the search indexer can subscribe using the documented channel names.
   */
  publish(event: BusEvent): void {
    this.safeEmit(event.type, event);
    const alias = SEARCH_CHANNEL_ALIASES[event.type];
    if (alias && alias !== event.type) {
      this.safeEmit(alias, event);
    }
    this.safeEmit(ALL_EVENTS, event);
  }

  /** Number of listeners on a channel — exposed for tests and metrics. */
  listenerCount(type: string): number {
    return this.emitter.listenerCount(type);
  }

  private safeEmit(channel: string, event: BusEvent): void {
    for (const listener of this.emitter.listeners(channel) as BusListener[]) {
      try {
        listener(event);
      } catch (err) {
        console.error(`[bus] listener for "${channel}" threw:`, err);
      }
    }
  }
}

/** Shared bus instance for the indexer process. */
export const bus = new EventBus();
