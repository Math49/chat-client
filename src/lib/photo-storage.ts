export const PHOTOS_STORAGE_KEY = "chat-client/photos";

export type StoredPhoto = {
  id: string;
  dataUrl: string;
  createdAt: number;
};

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.error("LocalStorage inaccessible", error);
    return null;
  }
};

const persistPhotos = (photos: StoredPhoto[]) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(PHOTOS_STORAGE_KEY, JSON.stringify(photos));
  } catch (error) {
    console.error("Impossible d'enregistrer les photos", error);
  }
};

const parsePhotos = (value: string | null): StoredPhoto[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as StoredPhoto[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      Boolean(
        item && typeof item.id === "string" && typeof item.dataUrl === "string" && typeof item.createdAt === "number"
      )
    );
  } catch (error) {
    console.warn("Photos invalides en localStorage, reset", error);
    return [];
  }
};

export const loadPhotos = (): StoredPhoto[] => {
  const storage = getStorage();
  if (!storage) return [];
  return parsePhotos(storage.getItem(PHOTOS_STORAGE_KEY));
};

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `photo-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const savePhoto = (dataUrl: string): StoredPhoto => {
  const photos = loadPhotos();
  const photo: StoredPhoto = {
    id: generateId(),
    dataUrl,
    createdAt: Date.now(),
  };
  const next = [photo, ...photos].slice(0, 120);
  persistPhotos(next);
  return photo;
};

export const removePhoto = (photoId: string): StoredPhoto[] => {
  const photos = loadPhotos();
  const next = photos.filter((photo) => photo.id !== photoId);
  persistPhotos(next);
  return next;
};

export const replacePhotos = (photos: StoredPhoto[]) => {
  persistPhotos(photos);
};
