import {
  getUserPreferences,
  type NotificationChannel,
  type UserNotificationPreferences,
} from "./preferences";

export interface NotificationPayload {
  id: string;
  recipient: string;
  type: "follow" | "tip" | "like" | "mention" | "dm";
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface DispatchResult {
  channel: NotificationChannel;
  success: boolean;
  attempts: number;
  error?: string;
}

export interface ChannelSender {
  send(channel: NotificationChannel, payload: NotificationPayload): Promise<void>;
}

export const defaultSender: ChannelSender = {
  async send(channel: NotificationChannel, _payload: NotificationPayload): Promise<void> {
    // In production, delegates to APNs/FCM for push, Resend/SES for email, DB for in-app
    if (channel === "push" && process.env.NODE_ENV === "test-fail") {
      throw new Error("Simulated push failure");
    }
  },
};

/**
 * Returns the list of enabled channels for the given user preferences.
 */
export function getEnabledChannels(
  preferences: UserNotificationPreferences
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (preferences.channels.push) channels.push("push");
  if (preferences.channels.email) channels.push("email");
  if (preferences.channels.inApp) channels.push("in-app");
  return channels;
}

/**
 * Dispatches a notification across all enabled channels for a user.
 * Failed channel deliveries do not block other channels and are retried up to 3 times with backoff.
 */
export async function dispatch(
  payload: NotificationPayload,
  sender: ChannelSender = defaultSender
): Promise<DispatchResult[]> {
  const preferences = await getUserPreferences(payload.recipient);
  const enabledChannels = getEnabledChannels(preferences);

  const results: DispatchResult[] = [];

  // Dispatch to all channels concurrently; failures in one channel don't block others
  await Promise.all(
    enabledChannels.map(async (channel) => {
      let attempts = 0;
      const maxAttempts = 3;
      let lastError: Error | undefined;

      while (attempts < maxAttempts) {
        attempts += 1;
        try {
          // Structured logging per attempt
          console.log(
            JSON.stringify({
              level: "info",
              event: "notification_dispatch_attempt",
              notificationId: payload.id,
              recipient: payload.recipient,
              channel,
              attempt: attempts,
            })
          );

          await sender.send(channel, payload);

          results.push({
            channel,
            success: true,
            attempts,
          });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(
            JSON.stringify({
              level: "warn",
              event: "notification_dispatch_failed",
              notificationId: payload.id,
              recipient: payload.recipient,
              channel,
              attempt: attempts,
              error: lastError.message,
            })
          );

          if (attempts < maxAttempts) {
            // Exponential backoff: 50ms, 100ms, ...
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 25));
          }
        }
      }

      results.push({
        channel,
        success: false,
        attempts,
        error: lastError?.message,
      });
    })
  );

  return results;
}
