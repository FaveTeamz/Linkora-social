export type NotificationChannel = "push" | "email" | "in-app";

export interface UserNotificationPreferences {
  userAddress: string;
  channels: {
    push: boolean;
    email: boolean;
    inApp: boolean;
  };
  emailAddress?: string;
  pushTokens?: string[];
}

export const defaultPreferences: Omit<UserNotificationPreferences, "userAddress"> = {
  channels: {
    push: true,
    email: false,
    inApp: true,
  },
  pushTokens: [],
};

const preferencesStore = new Map<string, UserNotificationPreferences>();

export async function getUserPreferences(
  userAddress: string
): Promise<UserNotificationPreferences> {
  const existing = preferencesStore.get(userAddress);
  if (existing) {
    return existing;
  }
  return {
    userAddress,
    ...defaultPreferences,
  };
}

export async function setUserPreferences(
  preferences: UserNotificationPreferences
): Promise<void> {
  preferencesStore.set(preferences.userAddress, preferences);
}
