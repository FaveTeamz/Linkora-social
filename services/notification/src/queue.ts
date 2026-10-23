import { randomUUID } from "crypto";

export interface NotificationQueueJob<T> {
  id: string;
  payload: T;
  attempts: number;
  enqueuedAt: Date;
}

export interface DeadLetterJob<T> extends NotificationQueueJob<T> {
  error: string;
  failedAt: Date;
}

export interface NotificationQueueOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  concurrency?: number;
}

export class NotificationQueue<T> {
  private readonly pending: NotificationQueueJob<T>[] = [];
  private readonly deadLetters: DeadLetterJob<T>[] = [];
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly concurrency: number;
  private active = 0;
  private accepting = true;
  private drainPromise: Promise<void> | null = null;
  private resolveDrain: (() => void) | null = null;

  constructor(
    private readonly handler: (payload: T) => Promise<void>,
    options: NotificationQueueOptions = {}
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.concurrency = options.concurrency ?? 1;
  }

  enqueue(payload: T): string {
    if (!this.accepting) throw new Error("Notification queue is shutting down");
    const id = randomUUID();
    this.pending.push({ id, payload, attempts: 0, enqueuedAt: new Date() });
    this.pump();
    return id;
  }

  get depth(): number {
    return this.pending.length + this.active;
  }

  getDeadLetters(): readonly DeadLetterJob<T>[] {
    return this.deadLetters;
  }

  metricsText(): string {
    return [
      "# HELP notification_queue_depth Number of queued and processing notification jobs",
      "# TYPE notification_queue_depth gauge",
      `notification_queue_depth ${this.depth}`,
      "",
    ].join("\n");
  }

  stopAndDrain(): Promise<void> {
    this.accepting = false;
    if (this.depth === 0) return Promise.resolve();
    if (!this.drainPromise) {
      this.drainPromise = new Promise<void>((resolve) => {
        this.resolveDrain = resolve;
      });
    }
    return this.drainPromise;
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) continue;
      this.active += 1;
      void this.process(job).finally(() => {
        this.active -= 1;
        this.pump();
        if (!this.accepting && this.depth === 0) {
          this.resolveDrain?.();
          this.resolveDrain = null;
          this.drainPromise = null;
        }
      });
    }
  }

  private async process(job: NotificationQueueJob<T>): Promise<void> {
    let lastError = "Unknown notification delivery error";
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      job.attempts = attempt;
      try {
        await this.handler(job.payload);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt <= this.maxRetries) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, this.baseDelayMs * 2 ** (attempt - 1))
          );
        }
      }
    }

    this.deadLetters.push({ ...job, error: lastError, failedAt: new Date() });
    console.error(
      JSON.stringify({
        level: "error",
        event: "notification_dead_lettered",
        jobId: job.id,
        attempts: job.attempts,
        error: lastError,
      })
    );
  }
}