const ROOMS_STORAGE_KEY = "chat-client/rooms";

const DEFAULT_ROOMS = ["general", "pwa", "design", "support", "tech"];

const readStorage = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch (error) {
    console.warn("Unable to read stored rooms", error);
    return [];
  }
};

const writeStorage = (rooms: string[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(rooms));
  } catch (error) {
    console.warn("Unable to persist rooms", error);
  }
};

const normalizeRoom = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

export const getAvailableRooms = (): string[] => {
  const stored = readStorage();
  const rooms = new Set<string>([...DEFAULT_ROOMS, ...stored]);
  return Array.from(rooms).sort((a, b) => a.localeCompare(b));
};

export const rememberRoom = (roomName: string) => {
  const normalized = normalizeRoom(roomName);
  if (!normalized) return;
  const stored = readStorage();
  if (stored.includes(normalized)) return;
  const next = [...stored, normalized];
  writeStorage(next);
};

export const persistRooms = (rooms: string[]) => {
  const next = Array.from(new Set(rooms.map(normalizeRoom))).filter(Boolean);
  writeStorage(next);
};
