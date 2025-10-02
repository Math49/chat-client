"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadPhotos,
  removePhoto,
  replacePhotos,
  type StoredPhoto,
  PHOTOS_STORAGE_KEY,
} from "@/lib/photo-storage";

const formatDate = (value: number) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch (error) {
    return date.toLocaleString();
  }
};

export default function GalleryPage() {
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setPhotos(loadPhotos());
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === PHOTOS_STORAGE_KEY) {
        setPhotos(loadPhotos());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const remaining = photos.filter((photo) => !selectedIds.includes(photo.id));
    replacePhotos(remaining);
    setPhotos(remaining);
    setSelectedIds([]);
  }, [photos, selectedIds]);

  const downloadAll = useCallback(() => {
    photos.forEach((photo) => {
      const link = document.createElement("a");
      link.href = photo.dataUrl;
      link.download = `${photo.id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }, [photos]);

  const selectedCount = selectedIds.length;
  const isSelectionMode = selectedCount > 0;
  const galleryEmpty = useMemo(() => photos.length === 0, [photos]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Galerie</h2>
          <p className="text-sm text-neutral-500">
            {galleryEmpty ? "Aucune photo enregistree." : `${photos.length} photo(s) accessibles hors connexion.`}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link className="underline" href="/camera">
            Camera
          </Link>
          <Link className="underline" href="/">
            Accueil
          </Link>
        </nav>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={() => setSelectedIds([])}
          disabled={!isSelectionMode}
          className="rounded bg-neutral-200 px-3 py-2 text-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-100"
        >
          Reinitialiser
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!isSelectionMode}
          className="rounded bg-red-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {selectedCount > 0 ? `Supprimer (${selectedCount})` : "Supprimer"}
        </button>
        <button
          type="button"
          onClick={downloadAll}
          disabled={galleryEmpty}
          className="rounded bg-blue-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          Telecharger toutes
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => {
          const selected = selectedIds.includes(photo.id);
          return (
            <article
              key={photo.id}
              className={`relative overflow-hidden rounded-lg border transition ${selected ? "border-blue-500 ring-2 ring-blue-500" : "border-neutral-200"}`}
            >
              <button
                type="button"
                onClick={() => toggleSelection(photo.id)}
                className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs font-medium"
              >
                {selected ? "Selectionnee" : "Selectionner"}
              </button>
              <img
                src={photo.dataUrl}
                alt="Photo stockee"
                className="h-64 w-full object-cover"
              />
              <footer className="flex items-center justify-between border-t border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
                <span>{formatDate(photo.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => {
                    removePhoto(photo.id);
                    setPhotos((prev) => prev.filter((item) => item.id !== photo.id));
                    setSelectedIds((prev) => prev.filter((item) => item !== photo.id));
                  }}
                  className="text-red-600 underline"
                >
                  Supprimer
                </button>
              </footer>
            </article>
          );
        })}
      </section>
    </div>
  );
}
