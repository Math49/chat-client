"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type UserProfile = {
  pseudo: string;
  avatar?: string | null;
  phone?: string | null;
};

const STORAGE_KEY = "chat-client/user-profile";

const defaultProfile: UserProfile = {
  pseudo: "",
  avatar: null,
  phone: null,
};

type UserContextValue = {
  profile: UserProfile | null;
  isReady: boolean;
  saveProfile: (profile: UserProfile) => void;
  updateProfile: (value: Partial<UserProfile>) => void;
  clearProfile: () => void;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

const readProfileFromStorage = (): UserProfile | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.pseudo === "string") {
      return {
        pseudo: parsed.pseudo,
        avatar: typeof parsed.avatar === "string" ? parsed.avatar : null,
        phone: typeof parsed.phone === "string" ? parsed.phone : null,
      } satisfies UserProfile;
    }
  } catch (error) {
    console.warn("Unable to parse stored profile", error);
  }
  return null;
};

const writeProfileToStorage = (profile: UserProfile | null) => {
  if (typeof window === "undefined") return;
  try {
    if (profile) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Unable to persist profile", error);
  }
};

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = readProfileFromStorage();
    if (stored) {
      setProfile(stored);
    }
    setIsReady(true);
  }, []);

  const saveProfile = useCallback((next: UserProfile) => {
    const normalized: UserProfile = {
      pseudo: next.pseudo.trim(),
      avatar: next.avatar ?? null,
      phone: next.phone ?? null,
    };
    setProfile(normalized);
    writeProfileToStorage(normalized);
    setIsReady(true);
  }, []);

  const updateProfile = useCallback((value: Partial<UserProfile>) => {
    setProfile((prev) => {
      const base = prev ?? defaultProfile;
      const merged: UserProfile = {
        pseudo: (value.pseudo ?? base.pseudo).trim(),
        avatar: value.avatar === undefined ? base.avatar ?? null : value.avatar,
        phone: value.phone === undefined ? base.phone ?? null : value.phone,
      };
      if (!merged.pseudo) {
        return prev;
      }
      writeProfileToStorage(merged);
      setIsReady(true);
      return merged;
    });
  }, []);

  const clearProfile = useCallback(() => {
    setProfile(null);
    writeProfileToStorage(null);
  }, []);

  const value = useMemo(
    () => ({ profile, isReady, saveProfile, updateProfile, clearProfile }),
    [profile, isReady, saveProfile, updateProfile, clearProfile]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
};
