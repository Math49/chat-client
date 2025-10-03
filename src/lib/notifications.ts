export const requestNotificationPermission = async (): Promise<NotificationPermission | null> => {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return null;
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.error("Notification permission request failed", error);
    return null;
  }
};

interface NotifyOptions {
  title?: string;
  body?: string;
  icon?: string;
  url?: string;
  vibrate?: number | number[] | false;
  tag?: string;
}

const resolveVibrationPattern = (value?: number | number[] | false): number[] | undefined => {
  if (value === false) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === "number") return [value];
  return [160, 80, 160];
};

export const showNotification = async ({
  title = "Notification",
  body,
  icon,
  url = "/gallery",
  vibrate,
  tag,
}: NotifyOptions): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  const permission = Notification.permission === "default"
    ? await requestNotificationPermission()
    : Notification.permission;

  if (permission !== "granted") return false;

  const pattern = resolveVibrationPattern(vibrate);

  if (pattern && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const options: NotificationOptions & { vibrate?: number[] } = {
      body,
      icon,
      badge: icon,
      vibrate: pattern,
      data: { url },
      tag: tag ?? `chat-client-${url}`,
    };
    await registration.showNotification(title, options);
    return true;
  } catch (error) {
    console.error("Unable to show notification", error);
    return false;
  }
};
