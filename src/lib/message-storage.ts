/**
 * Message Storage - Persiste les messages de chat par room en localStorage
 * Stratégie : FIFO avec limite configurable (200 messages/room)
 * Quota protection : size check avant persist, purge auto si quota dépassé
 */

const MESSAGES_STORAGE_KEY = "chat-client/messages";
const MAX_MESSAGES_PER_ROOM = 200;
const MAX_TOTAL_SIZE_KB = 2500; // ~2.5MB pour tout le storage messages

export type StoredChatMessage = {
  id: string;
  roomName: string;
  pseudo: string;
  content: string;
  categorie: "MESSAGE" | "INFO" | string;
  createdAt: number;
  isMine?: boolean;
  isImage?: boolean;
};

type StorageIndex = Record<string, StoredChatMessage[]>;

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.error("[MessageStorage] LocalStorage inaccessible", error);
    return null;
  }
};

/**
 * Estime la taille en KB du contenu en localStorage
 */
const estimateStorageSize = (data: string): number => {
  if (typeof Blob === "undefined") return 0;
  return new Blob([data]).size / 1024;
};

/**
 * Parse l'index des messages, avec validation
 */
const parseMessageIndex = (value: string | null): StorageIndex => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as StorageIndex;
    if (typeof parsed !== "object" || parsed === null) return {};
    
    // Valider la structure
    const validated: StorageIndex = {};
    Object.entries(parsed).forEach(([roomName, messages]) => {
      if (!Array.isArray(messages)) return;
      validated[roomName] = messages.filter((msg) => 
        msg && 
        typeof msg.id === "string" &&
        typeof msg.roomName === "string" &&
        typeof msg.pseudo === "string" &&
        typeof msg.content === "string" &&
        typeof msg.createdAt === "number"
      );
    });
    return validated;
  } catch (error) {
    console.warn("[MessageStorage] Failed to parse messages, reset", error);
    return {};
  }
};

/**
 * Persiste l'index avec stratégie de quota
 */
const persistMessageIndex = (index: StorageIndex): boolean => {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const json = JSON.stringify(index);
    const sizeKB = estimateStorageSize(json);

    if (sizeKB > MAX_TOTAL_SIZE_KB) {
      console.warn(`[MessageStorage] Size ${sizeKB.toFixed(2)}KB exceeds ${MAX_TOTAL_SIZE_KB}KB, purging oldest...`);
      // Purge : supprimer 30% des messages les plus anciens
      const allMessages = Object.values(index).flat();
      allMessages.sort((a, b) => a.createdAt - b.createdAt);
      const toPurge = new Set(allMessages.slice(0, Math.ceil(allMessages.length * 0.3)).map(m => m.id));
      
      Object.entries(index).forEach(([room, messages]) => {
        index[room] = messages.filter(m => !toPurge.has(m.id));
      });
      
      return persistMessageIndex(index); // Retry après purge
    }

    storage.setItem(MESSAGES_STORAGE_KEY, json);
    return true;
  } catch (error) {
    console.error("[MessageStorage] Failed to persist", error);
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("[MessageStorage] Quota exceeded, performing emergency purge");
      // Emergency purge : garder seulement les 50 messages les plus récents
      const allMessages = Object.values(index).flat();
      allMessages.sort((a, b) => b.createdAt - a.createdAt);
      const keep = new Set(allMessages.slice(0, 50).map(m => m.id));
      
      Object.entries(index).forEach(([room, messages]) => {
        index[room] = messages.filter(m => keep.has(m.id));
      });
      
      try {
        storage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(index));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
};

/**
 * Charge les messages d'une room depuis localStorage
 */
export const loadRoomMessages = (roomName: string): StoredChatMessage[] => {
  const storage = getStorage();
  if (!storage) return [];

  const index = parseMessageIndex(storage.getItem(MESSAGES_STORAGE_KEY));
  return (index[roomName] ?? []).sort((a, b) => a.createdAt - b.createdAt);
};

/**
 * Ajoute un message à une room
 */
export const addRoomMessage = (roomName: string, message: Omit<StoredChatMessage, "roomName" | "createdAt">): StoredChatMessage => {
  const storage = getStorage();
  if (!storage) return { ...message, roomName, createdAt: Date.now() };

  const index = parseMessageIndex(storage.getItem(MESSAGES_STORAGE_KEY));
  
  const stored: StoredChatMessage = {
    ...message,
    roomName,
    createdAt: Date.now(),
  };

  if (!index[roomName]) {
    index[roomName] = [];
  }

  // Garder seulement les MAX_MESSAGES_PER_ROOM les plus récents
  index[roomName] = [...index[roomName], stored]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_MESSAGES_PER_ROOM);

  persistMessageIndex(index);
  return stored;
};

/**
 * Vide les messages d'une room
 */
export const clearRoomMessages = (roomName: string): void => {
  const storage = getStorage();
  if (!storage) return;

  const index = parseMessageIndex(storage.getItem(MESSAGES_STORAGE_KEY));
  delete index[roomName];
  persistMessageIndex(index);
};

/**
 * Vide tout l'index des messages (utile pour debug/reset)
 */
export const clearAllMessages = (): void => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(MESSAGES_STORAGE_KEY);
  } catch (error) {
    console.error("[MessageStorage] Failed to clear all", error);
  }
};

/**
 * Retourne des stats sur le storage (pour monitoring)
 */
export const getMessageStorageStats = (): { totalRooms: number; totalMessages: number; sizeKB: number } => {
  const storage = getStorage();
  if (!storage) return { totalRooms: 0, totalMessages: 0, sizeKB: 0 };

  try {
    const json = storage.getItem(MESSAGES_STORAGE_KEY) ?? "{}";
    const index = parseMessageIndex(json);
    const totalMessages = Object.values(index).flat().length;
    const sizeKB = estimateStorageSize(json);
    return { totalRooms: Object.keys(index).length, totalMessages, sizeKB };
  } catch (error) {
    console.error("[MessageStorage] Failed to get stats", error);
    return { totalRooms: 0, totalMessages: 0, sizeKB: 0 };
  }
};
