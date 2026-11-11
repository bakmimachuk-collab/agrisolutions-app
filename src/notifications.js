export const notificationStorageKey = "agriplus-notifications";
export const notificationPreferencesStorageKey = "agriplus-notification-preferences";
export const calendarEventsStorageKey = "agriplus-calendar-events";

export const defaultNotificationPreferences = {
  crop: true,
  livestock: true,
  weather: true,
  activity: true,
  ai: true,
  community: true,
  inApp: true,
  push: false
};

export function readStoredValue(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch (error) {
    console.error(`Could not read ${key} from this browser.`, error);
    return fallback;
  }
}

export function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Could not save ${key} in this browser.`, error);
  }
}

export function createNotification({
  category,
  priority,
  titleKey,
  textKey,
  params = {},
  message,
  href,
  eventKey
}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    priority,
    titleKey,
    textKey,
    params,
    message,
    href,
    eventKey,
    createdAt: new Date().toISOString(),
    read: false
  };
}

export function formatNotificationText(notification, t) {
  if (notification.message) return notification.message;
  return Object.entries(notification.params ?? {}).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    t(notification.textKey)
  );
}
