/**
 * @fileoverview Contexte profil utilisateur global.
 * 
 * Wrapper React autour du UserService.
 * Expose la logique métier via le contexte React pour les composants.
 * 
 * Gère:
 * - Hydratation du profil depuis localStorage
 * - Synchronisation avec UserService
 * - État "ready" pour l'hydratation client
 * 
 * @module contexts/user-context
 */

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { userService, type UserProfile } from "@/services";

// ===== CONTEXT TYPE =====

/**
 * Valeur du contexte utilisateur.
 * Expose l'API du UserService avec état React.
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

// ===== PROVIDER =====

/**
 * Provider contexte utilisateur global.
 * 
 * Fait:
 * 1. Charge le profil depuis UserService au mount
 * 2. Écoute les changements du service
 * 3. Met à jour l'état React
 * 4. Marque isReady après hydratation
 * 
 * À placer dans layout racine (AppShell).
 * 
 * @param {Object} props - Props
 * @param {React.ReactNode} props.children - Composants enfants
 * @returns {JSX.Element} Provider contexte
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialise depuis UserService au mount
  useEffect(() => {
    const stored = userService.loadProfile();
    setProfile(stored);

    // S'abonne aux changements du service
    const unsubscribe = userService.onProfileChanged((newProfile) => {
      setProfile(newProfile);
    });

    setIsReady(true);

    return unsubscribe;
  }, []);

  /**
   * Sauvegarde un profil complet via le service.
   */
  const saveProfile = useCallback((next: UserProfile) => {
    const normalized: UserProfile = {
      pseudo: next.pseudo.trim(),
      avatar: next.avatar ?? null,
      phone: next.phone ?? null,
      clientId: next.clientId,
    };
    userService.saveProfile(normalized);
  }, []);

  /**
   * Met à jour le profil partiellement via le service.
   */
  const updateProfile = useCallback((value: Partial<UserProfile>) => {
    const current = userService.loadProfile();
    if (!current) return;

    const merged: UserProfile = {
      pseudo: (value.pseudo ?? current.pseudo).trim(),
      avatar: value.avatar === undefined ? current.avatar : value.avatar,
      phone: value.phone === undefined ? current.phone : value.phone,
      clientId: value.clientId ?? current.clientId,
    };

    if (!merged.pseudo) return; // Rejette si pseudo vide

    userService.saveProfile(merged);
  }, []);

  /**
   * Supprime le profil (logout) via le service.
   */
  const clearProfile = useCallback(() => {
    userService.clearProfile();
  }, []);

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

// ===== EXPORTS =====

// Réexport du type depuis le service pour compatibilité
export type { UserProfile };

