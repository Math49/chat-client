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
}

export const showNotification = async ({ title = "Notification", body, icon }: NotifyOptions): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  const permission = Notification.permission === "default"
    ? await requestNotificationPermission()
    : Notification.permission;

  if (permission !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      data: { url: "/gallery" },
      tag: "photo-saved",
    });
    return true;
  } catch (error) {
    console.error("Unable to show notification", error);
    return false;
  }
};
