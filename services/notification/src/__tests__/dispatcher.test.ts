import { dispatch, getEnabledChannels, type NotificationPayload, type ChannelSender } from "../dispatcher";
import { setUserPreferences, type UserNotificationPreferences } from "../preferences";

describe("Notification Dispatcher", () => {
  const dummyPayload: NotificationPayload = {
    id: "notif_1",
    recipient: "GABCD1234567890",
    type: "follow",
    title: "New Follower",
    body: "Alice followed you.",
    createdAt: new Date().toISOString(),
  };

  it("filters channels based on user preferences", () => {
    const prefs: UserNotificationPreferences = {
      userAddress: "GABCD1234567890",
      channels: { push: true, email: false, inApp: true },
    };
    expect(getEnabledChannels(prefs)).toEqual(["push", "in-app"]);
  });

  it("dispatches successfully to enabled channels", async () => {
    const mockSender: ChannelSender = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const results = await dispatch(dummyPayload, mockSender);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(mockSender.send).toHaveBeenCalledWith("push", dummyPayload);
    expect(mockSender.send).toHaveBeenCalledWith("in-app", dummyPayload);
  });

  it("retries failed channels up to 3 times without blocking others", async () => {
    let pushAttempts = 0;
    const mockSender: ChannelSender = {
      send: jest.fn().mockImplementation(async (channel) => {
        if (channel === "push") {
          pushAttempts += 1;
          throw new Error("Push gateway unavailable");
        }
        return;
      }),
    };

    const results = await dispatch(dummyPayload, mockSender);
    const pushResult = results.find((r) => r.channel === "push");
    const inAppResult = results.find((r) => r.channel === "in-app");

    expect(pushAttempts).toBe(3);
    expect(pushResult?.success).toBe(false);
    expect(pushResult?.attempts).toBe(3);
    expect(inAppResult?.success).toBe(true);
  });
});
