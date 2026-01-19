/**
 * @fileoverview Hook de configuration Socket.IO pour communication temps réel.
 * 
 * Encapsule l'initialisation, la gestion des listeners, et le cleanup automatique.
 * Offre une API simplifiée pour émettre messages et signaux peer-to-peer.
 * 
 * Gère l'état de connexion avec notifications de changement d'état.
 * La reconnexion automatique est gérée par socket-client.ts (backoff exponentiel).
 * 
 * @module hooks/use-socket-setup
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { createChatSocket, type ChatSocket, type ChatClientInfo, type ChatMessage, type PeerSignalPayload } from "@/lib/socket-client";


/**
 * Configuration Socket.IO pour connexion et événements room.
 * 
 * @typedef {Object} SocketSetupConfig
 * @property {string} roomName - Nom de la room à rejoindre
 * @property {string} pseudo - Pseudo de l'utilisateur courant
 * @property {string} [avatar] - URL avatar optionnel
 * @property {Function} [onConnect] - Callback connexion établie
 * @property {Function} [onDisconnect] - Callback déconnexion
 * @property {Function} [onError] - Callback erreur (reçoit message)
 * @property {Function} [onChatMessage] - Callback message reçu
 * @property {Function} [onJoinedRoom] - Callback room rejointe (reçoit clients)
 * @property {Function} [onDisconnectedUser] - Callback utilisateur déconnecté
 * @property {Function} [onPeerSignal] - Callback signal WebRTC reçu
 * @property {Function} [onStatusChange] - Callback changement état: idle|connecting|connected|error
 */
export type SocketSetupConfig = {
  roomName: string;
  pseudo: string;
  avatar?: string | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (message: string) => void;
  onChatMessage?: (payload: ChatMessage) => void;
  onJoinedRoom?: (clients: Record<string, ChatClientInfo>) => void;
  onDisconnectedUser?: (id: string, pseudo?: string) => void;
  onPeerSignal?: (id: string, signal: unknown) => void;
  onStatusChange?: (status: "idle" | "connecting" | "connected" | "error") => void;
};

/**
 * Hook pour initialiser et gérer la connexion Socket.IO.
 * 
 * Étapes:
 * 1. Crée instance Socket.IO avec reconnexion automatique (backoff exponentiel)
 * 2. Attache listeners pour tous les événements room
 * 3. Lance connexion et rejoint la room
 * 4. Cleanup automatique à unmount
 * 
 * Le hook retourne des méthodes pour émettre messages et signaux peer.
 * 
 * @param {SocketSetupConfig} config - Configuration connexion (room, pseudo, callbacks)
 * @returns {Object} Objet avec socket instance et méthodes emit
 * @returns {ChatSocket} socket - Instance Socket.IO active (peut être null)
 * @returns {Function} emitMessage - Envoyer message au chat (content: string)
 * @returns {Function} emitPeerSignal - Envoyer signal WebRTC (targetId, signal)
 * 
 * @example
 * const { emitMessage, emitPeerSignal } = useSocketSetup({
 *   roomName: "salon",
 *   pseudo: "Alice",
 *   onChatMessage: (msg) => console.log(msg.content),
 *   onStatusChange: (status) => setStatus(status),
 * });
 * emitMessage("Coucou!");
 */
export function useSocketSetup(config: SocketSetupConfig) {
  // Référence persistante au socket et état setup
  const socketRef = useRef<ChatSocket | null>(null);
  const isSetupRef = useRef(false);

  /**
   * Crée et initialise le socket avec tous les listeners.
   * S'exécute une seule fois (isSetupRef.current guard).
   */
  const setupSocket = useCallback(() => {
    // Évite les setup dupliqués (garde against render race conditions)
    if (isSetupRef.current || socketRef.current) return;
    isSetupRef.current = true;

    // Crée nouvelle instance Socket.IO
    const socket = createChatSocket();
    socketRef.current = socket;

    // Signale début de connexion
    config.onStatusChange?.("connecting");

    // ===== HANDLERS pour tous les événements =====

    const handleConnect = () => {
      // Connexion établie: émet join-room et notifie callback
      config.onStatusChange?.("connected");
      socket.emit("chat-join-room", {
        pseudo: config.pseudo,
        roomName: config.roomName,
        avatar: config.avatar ?? null,
      });
      config.onConnect?.();
    };

    const handleDisconnect = () => {
      // Déconnecté: revenir à idle
      config.onStatusChange?.("idle");
      config.onDisconnect?.();
    };

    const handleError = (message: string) => {
      // Erreur socket: marquer état error et notifier
      config.onStatusChange?.("error");
      config.onError?.(message);
    };

    const handleChatMessage = (payload: ChatMessage) => {
      // Message reçu: transmettre au callback
      config.onChatMessage?.(payload);
    };

    const handleJoinedRoom = (payload: { clients: Record<string, ChatClientInfo> }) => {
      // Room rejointe: lister les clients actifs
      config.onJoinedRoom?.(payload.clients);
    };

    const handleDisconnected = (payload: { id: string; pseudo?: string }) => {
      // Utilisateur quitté: notifier pour cleanup UI
      config.onDisconnectedUser?.(payload.id, payload.pseudo);
    };

    const handlePeerSignal = (payload: PeerSignalPayload) => {
      // Signal WebRTC reçu: transmettre au handler peer
      config.onPeerSignal?.(payload.id, payload.signal);
    };

    // ===== ATTACHEMENT des listeners =====
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("chat-msg", handleChatMessage);
    socket.on("chat-joined-room", handleJoinedRoom);
    socket.on("chat-disconnected", handleDisconnected);
    socket.on("peer-signal", handlePeerSignal);
    socket.on("error", handleError);
    socket.on("erreur", handleError); // Variante typage serveur

    // Lance la connexion
    socket.connect();

    // ===== CLEANUP function =====
    return () => {
      // Détache tous les listeners
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("chat-msg", handleChatMessage);
      socket.off("chat-joined-room", handleJoinedRoom);
      socket.off("chat-disconnected", handleDisconnected);
      socket.off("peer-signal", handlePeerSignal);
      socket.off("error", handleError);
      socket.off("erreur", handleError);
      
      // Coupe la connexion
      socket.disconnect();
      socketRef.current = null;
      isSetupRef.current = false;
    };
  }, [config]);

  // Execute setup au mount, cleanup à unmount
  useEffect(() => {
    const cleanup = setupSocket();
    return cleanup;
  }, [setupSocket]);

  /**
   * Émet un message texte au chat.
   * Trim automatique du contenu pour éviter les espaces inutiles.
   */
  const emitMessage = useCallback((content: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit("chat-msg", {
      content: content.trim(),
      roomName: config.roomName,
    });
  }, [config.roomName]);

  /**
   * Émet un signal WebRTC P2P à un utilisateur spécifique.
   * Utilisé pour la négociation d'appel audio/vidéo.
   */
  const emitPeerSignal = useCallback((targetId: string, signal: unknown) => {
    if (!socketRef.current) return;
    socketRef.current.emit("peer-signal", {
      roomName: config.roomName,
      id: targetId,
      signal,
    });
  }, [config.roomName]);

  return {
    socket: socketRef.current,
    emitMessage,
    emitPeerSignal,
  };
}
