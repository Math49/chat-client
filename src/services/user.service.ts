/**
 * @fileoverview Service de gestion du profil utilisateur.
 * Logique métier dédiée à la persistence et manipulation du profil.
 * Indépendant de React - peut être testé unitairement.
 * 
 * @module services/user.service
 */

export interface UserProfile {
  pseudo: string;
  avatar?: string | null;
  phone?: string | null;
  clientId?: string;
}

/**
 * Événements émis par le UserService
 */
export interface UserServiceEvents {
  profileChanged: (profile: UserProfile | null) => void;
}

/**
 * Service de gestion du profil utilisateur.
 * Gère la persistence localStorage et les notifications de changement.
 * 
 * Responsabilités:
 * - Lecture/écriture du profil en localStorage
 * - Génération d'ID client unique
 * - Validation du schéma profil
 * - Notifications de changement (event emitter pattern)
 */
export class UserService {
  private readonly storageKey = "chat-client/user-profile";
  private listeners: Set<(profile: UserProfile | null) => void> = new Set();

  /**
   * Génère un UUID unique pour identifier le client.
   * Utilisé pour distinguer les reconnexions.
   */
  private generateClientId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  /**
   * Lit le profil depuis localStorage.
   * Valide et normalise le schéma.
   * Génère un clientId s'il manque.
   * 
   * @returns Profil parsé ou null si absent/invalide
   */
  loadProfile(): UserProfile | null {
    if (typeof window === "undefined") return null;

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.pseudo === "string") {
        return {
          pseudo: parsed.pseudo,
          avatar: typeof parsed.avatar === "string" ? parsed.avatar : null,
          phone: typeof parsed.phone === "string" ? parsed.phone : null,
          clientId: parsed.clientId ?? this.generateClientId(),
        };
      }
    } catch (error) {
      console.warn("[UserService] Unable to parse stored profile", error);
    }

    return null;
  }

  /**
   * Persiste le profil en localStorage.
   * Nettoie si profile === null (logout).
   * Notifie les listeners.
   * 
   * @param profile Profil à sauvegarder ou null pour logout
   */
  saveProfile(profile: UserProfile | null): void {
    if (typeof window === "undefined") return;

    try {
      if (profile) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(profile));
      } else {
        window.localStorage.removeItem(this.storageKey);
      }
      this.notifyListeners(profile);
    } catch (error) {
      console.warn("[UserService] Unable to persist profile", error);
    }
  }

  /**
   * Met à jour le profil en fusion partielle.
   * Charge le profil existant, fusionne les updates, re-sauvegarde.
   * 
   * @param updates Mise à jour partielle du profil
   * @returns Profil mis à jour, ou null si invalide
   */
  updateProfile(updates: Partial<UserProfile>): UserProfile | null {
    const current = this.loadProfile();
    if (!current) return null;

    // Valider le pseudo s'il est fourni
    if ("pseudo" in updates && typeof updates.pseudo === "string" && updates.pseudo.trim() === "") {
      return null;
    }

    const updated: UserProfile = {
      pseudo: updates.pseudo ?? current.pseudo,
      avatar: "avatar" in updates ? updates.avatar : current.avatar,
      phone: "phone" in updates ? updates.phone : current.phone,
      clientId: updates.clientId ?? current.clientId,
    };

    this.saveProfile(updated);
    return updated;
  }

  /**
   * Supprime le profil (logout).
   */
  clearProfile(): void {
    this.saveProfile(null);
  }

  /**
   * Enregistre un listener pour les changements de profil.
   * 
   * @param listener Fonction appelée quand le profil change
   * @returns Fonction de désinscription
   */
  onProfileChanged(listener: (profile: UserProfile | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifie tous les listeners du changement.
   */
  private notifyListeners(profile: UserProfile | null): void {
    this.listeners.forEach((listener) => {
      try {
        listener(profile);
      } catch (error) {
        console.error("[UserService] Listener error:", error);
      }
    });
  }
}

/** Instance singleton du service utilisateur */
export const userService = new UserService();
