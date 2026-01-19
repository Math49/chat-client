/**
 * @fileoverview Contexte profil utilisateur global.
 * 
 * Gère:
 * - Profil utilisateur (pseudo, avatar, phone)
 * - Persistance localStorage
 * - État "ready" pour sync au démarrage
 * 
 * Storage:
 * - Clé: "chat-client/user-profile"
 * - Format: JSON {pseudo, avatar, phone}
 * - Auto-sync au démarrage avec hydratation
 * 
 * @module contexts/user-context
 */

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Profil utilisateur courant.
 * @typedef {Object} UserProfile
 * @property {string} pseudo - Pseudonyme (required)
 * @property {string} [avatar] - URL avatar optionnel
 * @property {string} [phone] - Numéro téléphone optionnel
 */
export type UserProfile = {
  pseudo: string;
  avatar?: string | null;
  phone?: string | null;
};

// ===== CONSTANTS =====

/** Clé localStorage pour profil utilisateur */
const STORAGE_KEY = "chat-client/user-profile";

/** Profil par défaut (vide) */
const defaultProfile: UserProfile = {
  pseudo: "",
  avatar: null,
  phone: null,
};

// ===== CONTEXT TYPE =====

/**
 * Valeur du contexte utilisateur.
 * @typedef {Object} UserContextValue
 * @property {UserProfile|null} profile - Profil courant ou null
 * @property {boolean} isReady - true après hydratation localStorage
 * @property {Function} saveProfile - Sauvegarde complet profil
 * @property {Function} updateProfile - Merge updates partielles
 * @property {Function} clearProfile - Nettoie et logout
 */
type UserContextValue = {
  profile: UserProfile | null;
  isReady: boolean;
  saveProfile: (profile: UserProfile) => void;
  updateProfile: (value: Partial<UserProfile>) => void;
  clearProfile: () => void;
};

/** Contexte React pour profil utilisateur */
const UserContext = createContext<UserContextValue | undefined>(undefined);

// ===== STORAGE HELPERS =====

/**
 * Récupère le profil depuis localStorage.
 * Valide le schéma JSON avant retour.
 * 
 * @returns {UserProfile|null} Profil parsé ou null si absent/invalide
 */
const readProfileFromStorage = (): UserProfile | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    
    // Parse et valide schéma
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.pseudo === "string") {
      // Normalise types (pseudo string, avatar/phone nullable)
      return {
        pseudo: parsed.pseudo,
        avatar: typeof parsed.avatar === "string" ? parsed.avatar : null,
        phone: typeof parsed.phone === "string" ? parsed.phone : null,
      } satisfies UserProfile;
    }
  } catch (error) {
    console.warn("[UserContext] Unable to parse stored profile", error);
  }
  return null;
};

/**
 * Persiste le profil en localStorage.
 * Nettoie si profile === null (logout).
 * 
 * @param {UserProfile|null} profile - Profil à sauvegarder
 */
const writeProfileToStorage = (profile: UserProfile | null) => {
  if (typeof window === "undefined") return;
  try {
    if (profile) {
      // Sérialise et persiste
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } else {
      // Logout: supprime la clé
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn("[UserContext] Unable to persist profile", error);
  }
};

// ===== PROVIDER =====

/**
 * Provider contexte utilisateur global.
 * 
 * Fait:
 * 1. Récupère profil depuis localStorage au mount
 * 2. Met isReady = true après hydratation
 * 3. Fournit API pour modifier profil
 * 4. Persiste auto-updates en localStorage
 * 
 * À placer dans layout racine (AppShell).
 * 
 * @param {Object} props - Props
 * @param {React.ReactNode} props.children - Composants enfants
 * @returns {JSX.Element} Provider contexte
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  // État profil et readiness
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Hydrate depuis localStorage au mount
  useEffect(() => {
    const stored = readProfileFromStorage();
    if (stored) {
      setProfile(stored);
    }
    // Marque ready même si pas de profil (user non connecté)
    setIsReady(true);
  }, []);

  /**
   * Sauvegarde un nouveau profil complet.
   * Normalise pseudo (trim), nullify optional fields.
   * Persiste et marque ready.
   * 
   * @param {UserProfile} next - Profil complet
   */
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

  /**
   * Met à jour le profil avec des champs partiels.
   * Merge avec profil courant, rejette si pseudo vide.
   * 
   * @param {Partial<UserProfile>} value - Champs à updater
   */
  const updateProfile = useCallback((value: Partial<UserProfile>) => {
    setProfile((prev) => {
      // Base: profil courant ou défaut
      const base = prev ?? defaultProfile;
      
      // Merge: applique updates sur base
      const merged: UserProfile = {
        pseudo: (value.pseudo ?? base.pseudo).trim(),
        avatar: value.avatar === undefined ? base.avatar ?? null : value.avatar,
        phone: value.phone === undefined ? base.phone ?? null : value.phone,
      };
      
      // Validation: pseudo obligatoire
      if (!merged.pseudo) {
        return prev; // Reject: pas de changement
      }
      
      // Persiste et marque ready
      writeProfileToStorage(merged);
      setIsReady(true);
      return merged;
    });
  }, []);

  /**
   * Supprime le profil (logout).
   */
  const clearProfile = useCallback(() => {
    setProfile(null);
    writeProfileToStorage(null);
  }, []);

  // Mémoïse contexte pour éviter re-render enfants inutiles
  const value = useMemo(
    () => ({ profile, isReady, saveProfile, updateProfile, clearProfile }),
    [profile, isReady, saveProfile, updateProfile, clearProfile]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// ===== HOOK =====

/**
 * Hook pour accéder au contexte utilisateur.
 * 
 * @returns {UserContextValue} Profil, isReady, et API mutations
 * @throws {Error} Si utilisé hors UserProvider
 * 
 * @example
 * const { profile, saveProfile, isReady } = useUser();
 * if (!isReady) return <Loading />;
 * if (!profile?.pseudo) return <Login onSave={saveProfile} />;
 */
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("[useUser] Must be used within UserProvider");
  }
  return context;
};
