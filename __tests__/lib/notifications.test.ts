import { jest } from "@jest/globals";
import { requestNotificationPermission, showNotification } from "@/lib/notifications";

describe("notifications", () => {
  const originalNotification = globalThis.Notification;
  const originalServiceWorker = (globalThis.navigator as any).serviceWorker;
  const originalVibrate = (globalThis.navigator as any).vibrate;

  afterEach(() => {
    globalThis.Notification = originalNotification;
    Object.defineProperty(navigator, "serviceWorker", {
      value: originalServiceWorker,
      configurable: true,
    });
    (globalThis.navigator as any).vibrate = originalVibrate;
  });

  it("returns null when Notification API is unavailable", async () => {
    delete (globalThis as any).Notification;
    const permission = await requestNotificationPermission();
    expect(permission).toBeNull();
  });

  it("returns false when permission is denied", async () => {
    globalThis.Notification = {
      permission: "denied",
      requestPermission: jest.fn(),
    } as any;

    const result = await showNotification({ title: "Test" });
    expect(result).toBe(false);
  });

  it("shows notification when permission is granted", async () => {
    const showNotificationMock = jest.fn().mockResolvedValue(undefined);

    globalThis.Notification = {
      permission: "granted",
      requestPermission: jest.fn(),
    } as any;

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({ showNotification: showNotificationMock }),
      },
      configurable: true,
    });

    (globalThis.navigator as any).vibrate = jest.fn();

    const result = await showNotification({
      title: "Hello",
      body: "World",
      vibrate: [100, 50, 100],
      url: "/gallery",
    });

    expect(result).toBe(true);
    expect(showNotificationMock).toHaveBeenCalledWith(
      "Hello",
      expect.objectContaining({
        body: "World",
        data: { url: "/gallery" },
      })
    );
  });
});
