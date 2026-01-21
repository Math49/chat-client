import {
  savePhoto,
  loadPhotos,
  removePhoto,
  replacePhotos,
  PHOTOS_STORAGE_KEY,
  type StoredPhoto,
} from "@/lib/photo-storage";

describe("photo-storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves and loads photos", () => {
    const saved = savePhoto("data:image/png;base64,AAA");
    const photos = loadPhotos();

    expect(photos).toHaveLength(1);
    expect(photos[0].id).toBe(saved.id);
  });

  it("removes a photo by id", () => {
    const saved = savePhoto("data:image/png;base64,AAA");
    removePhoto(saved.id);
    const photos = loadPhotos();

    expect(photos).toHaveLength(0);
  });

  it("replaces photos list", () => {
    const next: StoredPhoto[] = [
      { id: "p1", dataUrl: "data:image/png;base64,AAA", createdAt: 1 },
    ];

    replacePhotos(next);

    const raw = window.localStorage.getItem(PHOTOS_STORAGE_KEY);
    expect(raw).toContain("\"p1\"");
  });
});
