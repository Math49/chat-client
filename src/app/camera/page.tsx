"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { savePhoto } from "@/lib/photo-storage";
import { showNotification } from "@/lib/notifications";

const PHOTO_NOTIFICATION_ICON = "/images/icons/Logo-192x192.png";

const getErrorMessage = (error: unknown) => {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
        return "Acces a la camera refuse. Active la camera dans les parametres du navigateur.";
      case "NotFoundError":
        return "Aucune camera detectee sur cet appareil.";
      case "NotReadableError":
        return "La camera est deja utilisee par une autre application.";
      default:
        break;
    }
  }
  return "Impossible d'initialiser la camera.";
};

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Cet appareil ne supporte pas la capture video.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          streamRef.current = stream;
          await video.play();
        }
        setStatus("Camera prete");
      } catch (err) {
        console.error("Camera init error", err);
        setError(getErrorMessage(err));
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };
  }, []);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!video.videoWidth || !video.videoHeight) {
      setError("Flux video indisponible. Reessaie ou recharge la page.");
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      setError("Impossible de preparer la capture.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    setIsSaving(true);
    setError(null);
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      savePhoto(dataUrl);
      setLastPhoto(dataUrl);
      setStatus("Photo enregistree.");
      await showNotification({
        title: "Photo capturee",
        body: "Ta photo est maintenant disponible hors connexion.",
        icon: PHOTO_NOTIFICATION_ICON,
      });
    } catch (err) {
      console.error("Capture error", err);
      setError("Impossible d'enregistrer la photo.");
    } finally {
      setIsSaving(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Camera</h2>
        <nav className="flex gap-2 text-sm">
          <Link className="underline" href="/gallery">
            Galerie
          </Link>
          <Link className="underline" href="/">
            Accueil
          </Link>
        </nav>
      </div>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          autoPlay
          muted
        />
      </div>

      <button
        type="button"
        onClick={handleCapture}
        disabled={isSaving || Boolean(error)}
        className="rounded-full bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {isSaving ? "Enregistrement..." : "Prendre une photo"}
      </button>

      {status && !error && (
        <p className="text-sm text-green-700" role="status">{status}</p>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      {lastPhoto && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">Derniere photo</p>
          <img
            src={lastPhoto}
            alt="Derniere capture"
            className="max-h-64 w-full rounded border border-neutral-200 object-contain"
          />
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
