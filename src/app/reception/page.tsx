"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useUser } from "@/contexts/user-context";
import { PhoneCallButton } from "@/components/phone-call-button";
import { getAvailableRooms, persistRooms, rememberRoom } from "@/lib/rooms";

const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unsupported file result"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const MAX_ROOMS = 12;

export default function ReceptionPage() {
  const router = useRouter();
  const { profile, saveProfile } = useUser();
  const [pseudo, setPseudo] = useState(profile?.pseudo ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar ?? null);
  const [rooms, setRooms] = useState<string[]>([]);
  const [newRoom, setNewRoom] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRooms(getAvailableRooms());
  }, []);

  useEffect(() => {
    setPseudo(profile?.pseudo ?? "");
    setPhone(profile?.phone ?? "");
    setAvatar(profile?.avatar ?? null);
  }, [profile]);

  const canAddRoom = useMemo(() => rooms.length < MAX_ROOMS, [rooms.length]);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await toDataUrl(file);
      setAvatar(dataUrl);
      setError(null);
    } catch (err) {
      console.error("Avatar conversion failed", err);
      setError("Impossible de charger la photo.");
    }
  };

  const handleAddRoom = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = newRoom.trim().toLowerCase().replace(/\s+/g, "-");
    if (!value) return;
    if (rooms.includes(value)) {
      setError("Cette room existe deja.");
      return;
    }
    const next = [...rooms, value].slice(0, MAX_ROOMS).sort((a, b) => a.localeCompare(b));
    setRooms(next);
    persistRooms(next);
    setNewRoom("");
    setError(null);
  };

  const handleJoin = (roomName: string) => {
    const normalizedPseudo = pseudo.trim();
    if (!normalizedPseudo) {
      setError("Indique un pseudo pour rejoindre la discussion.");
      return;
    }
    saveProfile({ pseudo: normalizedPseudo, avatar, phone: phone.trim() || null });
    rememberRoom(roomName);
    router.push(`/room/${encodeURIComponent(roomName)}`);
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-neutral-900">Rejoins la conversation</h1>
          <p className="text-sm text-neutral-600">
            Enregistre ton pseudo et une photo de profil pour apparaitre dans les salons. Tu pourras les modifier a tout moment.
          </p>
        </header>

        <form className="mt-6 grid gap-4" onSubmit={(event) => { event.preventDefault(); if (rooms.length > 0) handleJoin(rooms[0]); }}>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-700">Pseudo</span>
            <input
              value={pseudo}
              onChange={(event) => setPseudo(event.currentTarget.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Ton pseudo"
              maxLength={32}
              required
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-700">Numero de telephone (optionnel)</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.currentTarget.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="06 12 34 56 78"
              inputMode="tel"
            />
          </label>

          <div className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-700">Photo de profil</span>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-neutral-700 hover:border-blue-400">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <span>Choisir une image</span>
              </label>
              {avatar && (
                <div className="h-16 w-16 overflow-hidden rounded-full border border-neutral-200">
                  <Image src={avatar} alt="Avatar" width={64} height={64} className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          </div>
        </form>

        {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}

        {phone && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-sm text-neutral-700">
              Numéro enregistré : <span className="font-medium">{phone}</span>
            </span>
            <PhoneCallButton phoneNumber={phone} size="sm" variant="default" />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Salons disponibles</h2>
            <p className="text-sm text-neutral-600">Choisis un salon ou ajoute ton propre espace.</p>
          </div>
        </header>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <button
              key={room}
              type="button"
              onClick={() => handleJoin(room)}
              className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-left text-neutral-700 shadow-sm transition hover:border-blue-400 hover:text-blue-600"
            >
              <span className="font-medium">#{room}</span>
              <span className="text-xs uppercase text-neutral-400">Rejoindre</span>
            </button>
          ))}
        </div>

        {canAddRoom && (
          <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={handleAddRoom}>
            <input
              value={newRoom}
              onChange={(event) => setNewRoom(event.currentTarget.value)}
              placeholder="Nom d'un nouveau salon"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
            >
              Ajouter
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
