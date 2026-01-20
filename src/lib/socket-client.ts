/**
 * @fileoverview Client Socket.IO pour la communication temps réel.
 * Définit les types d'événements (serveur→client, client→serveur) et crée les instances.
 * @module lib/socket-client
 */

import { io, type Socket } from "socket.io-client";

/**
 * Message de chat reçu du serveur.
 * @typedef {Object} ChatMessage
 * @property {string} content - Contenu du message (texte ou data URL image)
 * @property {string} [pseudo] - Pseudonyme de l'auteur
 * @property {string} [roomName] - Nom de la salle
 * @property {"MESSAGE"|"INFO"|string} [categorie] - Type de message
 * @property {string} [dateEmis] - ISO timestamp du serveur
 * @property {string} [serverId] - ID unique côté serveur
 */
export type ChatMessage = {
  content: string;
  pseudo?: string;
  roomName?: string;
  categorie?: "MESSAGE" | "INFO" | string;
  dateEmis?: string;
  serverId?: string;
};

/**
 * Info client connecté dans une salle.
 * @typedef {Object} ChatClientInfo
 * @property {string} id - ID Socket.IO unique
 * @property {string} pseudo - Pseudonyme du client
 * @property {string} roomName - Salle rejointe
 * @property {boolean} [initiator] - Vrai si initiateur d'un appel WebRTC
 * @property {string|null} [avatar] - Data URL avatar (base64 image)
 * @property {unknown} [offerSignal] - Signal SDP WebRTC (en attente)
 */
export type ChatClientInfo = {
  id: string;
  pseudo: string;
  roomName: string;
  initiator?: boolean;
  avatar?: string | null;
  offerSignal?: unknown;
};

/**
 * Payload reçu quand clients rejoignent une salle.
 * @typedef {Object} ChatJoinedRoomPayload
 * @property {Record<string, ChatClientInfo>} clients - Map clients par ID
 * @property {string} roomName - Salle rejointe
 */
export type ChatJoinedRoomPayload = {
  clients: Record<string, ChatClientInfo>;
  roomName: string;
};

/**
 * Payload quand un client se déconnecte.
 * @typedef {Object} ChatDisconnectedPayload
 * @property {string} id - ID du client déconnecté
 * @property {string} [pseudo] - Pseudonyme du client
 * @property {string} roomName - Salle quittée
 */
export type ChatDisconnectedPayload = {
  id: string;
  pseudo?: string;
  roomName: string;
};

/**
 * Signal WebRTC reçu pour établir appel audio.
 * @typedef {Object} PeerSignalPayload
 * @property {unknown} signal - Signalisation SDP/ICE
 * @property {string} id - ID du pair distant
 * @property {string} roomName - Salle de l'appel
 */
export type PeerSignalPayload = {
  signal: unknown;
  id: string;
  roomName: string;
  pseudo: string;
};

/** Alias pour symétrie avec client→server */
export type PeerSignalEmitPayload = PeerSignalPayload;

/**
 * Payload pour rejoindre une salle (client→server).
 * @typedef {Object} ChatJoinRoomPayload
 * @property {string} pseudo - Pseudonyme du client
 * @property {string} roomName - Salle à rejoindre
 * @property {string|null} [avatar] - Data URL avatar
 */
export type ChatJoinRoomPayload = {
  pseudo: string;
  roomName: string;
  avatar?: string | null;
};

/**
 * Payload message chat (client→server).
 * @typedef {Object} ChatEmitMessagePayload
 * @property {string} content - Contenu du message
 * @property {string} roomName - Salle destinataire
 */
export type ChatEmitMessagePayload = {
  content: string;
  roomName: string;
};

/**
 * Événements reçus depuis le serveur Socket.IO.
 * @typedef {Object} ServerToClientEvents
 */
export interface ServerToClientEvents {
  /**  Message texte ou info système */
  "chat-msg": (payload: ChatMessage) => void;
  /** Confirmation entrée room + liste clients actuels */
  "chat-joined-room": (payload: ChatJoinedRoomPayload) => void;
  /** Notification client déconnecté */
  "chat-disconnected": (payload: ChatDisconnectedPayload) => void;
  /** Signalisation WebRTC pour appels audio */
  "peer-signal": (payload: PeerSignalPayload) => void;
  /** Erreur générique */
  error: (message: string) => void;
  /** Erreur (alias FR) */
  erreur: (message: string) => void;
}

/**
 * Événements émis vers le serveur Socket.IO.
 * @typedef {Object} ClientToServerEvents
 */
export interface ClientToServerEvents {
  /** Rejoindre une salle */
  "chat-join-room": (payload: ChatJoinRoomPayload) => void;
  /** Envoyer un message */
  "chat-msg": (payload: ChatEmitMessagePayload) => void;
  /** Envoyer signal WebRTC */
  "peer-signal": (payload: PeerSignalEmitPayload) => void;
}

/** Type Socket.IO typé avec événements côté serveur et client */
export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** URL serveur Socket.IO (env var ou défaut production) */
const SOCKET_URL = process.env.NEXT_PUBLIC_CHAT_SOCKET_URL ?? "https://api.tools.gavago.fr";

/**
 * Crée une instance Socket.IO avec reconnexion auto configurée.
 * Configuration:
 * - `autoConnect: false` - Connexion manuelle (contrôlée par composant)
 * - `reconnection: true` - Auto-reconnexion si déconnectée
 * - Exponential backoff: 1s → 30s max, 10 tentatives
 * - Transport: WebSocket uniquement (pas de fallback polling)
 * 
 * @returns {ChatSocket} Instance Socket.IO configée mais non connectée
 * @example
 * const socket = createChatSocket();
 * socket.connect();
 */
export const createChatSocket = (): ChatSocket =>
  io(SOCKET_URL, {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: 10,
    transports: ["websocket"],
  });

