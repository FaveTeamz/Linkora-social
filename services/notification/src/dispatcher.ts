import {
  NotificationChannel,
  UserNotificationPreferences,
  getUserPreferences,
} from "./preferences";
import { NotificationQueue } from "./queue";

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface DispatchResult {
  channel: NotificationChannel;
  success: boolean;
  attempts: number;
  error?: string;
}

export interface DispatchSummary {
  userAddress: string;
  results: DispatchResult[];
}

export type ChannelSender = (
  preferences: UserNotificationPreferences,
  payload: NotificationPayload
) => Promise<void>;

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 100;

const channelSenders: Record<NotificationChannel, ChannelSender> = {
  push: async (preferences, payload) => {
    if (!preferences.pushTokens || preferences.pushTokens.length === 0) {
      throw new Error("No push tokens registered for user");
    }
    // Push delivery is delegated to the push provider integration.
    void payload;
  },
  email: async (preferences, payload) => {
    if (!preferences.emailAddress) {
      throw new Error("No email address registered for user");
    }
    // Email delivery is delegated to the email provider integration.
    void payload;
  },
  "in-app": async (_preferences, payload) => {
    // In-app delivery is delegated to the in-app notification store.
    void payload;
  },
};

function logDispatch(entry: {
  userAddress: string;
  channel: NotificationChannel;
  attempt: number;
  success: boolean;
  error?: string;
}): void {
  console.log(
    JSON.stringify({
      level: entry.success ? "info" : "warn",
      service: "notification-dispatcher",
      event: "dispatch_attempt",
      ...entry,
      timestamp: new Date().toISOString(),
    })
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getEnabledChannels(
  userAddress: string
): Promise<NotificationChannel[]> {
  const preferences = await getUserPreferences(userAddress);
  const enabled: NotificationChannel[] = [];
  if (preferences.channels.push) {
    enabled.push("push");
  }
  if (preferences.channels.email) {
    enabled.push("email");
  }
  if (preferences.channels.inApp) {
    enabled.push("in-app");
  }
  return enabled;
}

async function dispatchToChannel(
  channel: NotificationChannel,
  preferences: UserNotificationPreferences,
  payload: NotificationPayload
): Promise<DispatchResult> {
  const sender = channelSenders[channel];
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await sender(preferences, payload);
      logDispatch({
        userAddress: preferences.userAddress,
        channel,
        attempt,
        success: true,
      });
      return { channel, success: true, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logDispatch({
        userAddress: preferences.userAddress,
        channel,
        attempt,
        success: false,
        error: lastError,
      });
      if (attempt < MAX_ATTEMPTS) {
        await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  return {
    channel,
    success: false,
    attempts: MAX_ATTEMPTS,
    error: lastError,
  };
}

export async function dispatch(
  userAddress: string,
  payload: NotificationPayload
): Promise<DispatchSummary> {
  const preferences = await getUserPreferences(userAddress);
  const channels = await getEnabledChannels(userAddress);

  const results = await Promise.all(
    channels.map((channel) =>
      dispatchToChannel(channel, preferences, payload).catch(
        (error): DispatchResult => ({
          channel,
          success: false,
          attempts: 0,
          error: error instanceof Error ? error.message : String(error),
        })
      )
    )
  );

  return { userAddress, results };
}

export const notificationQueue = new NotificationQueue<NotificationPayload>(async (payload) => {
  const results = await dispatch(payload, defaultSender, { maxAttempts: 1 });
  const failed = results.filter((result) => !result.success);
  if (failed.length > 0) {
    throw new Error(
      `Notification delivery failed for ${failed.map((result) => result.channel).join(", ")}`
    );
  }
});

export function enqueueNotification(payload: NotificationPayload): string {
  return notificationQueue.enqueue(payload);
}
