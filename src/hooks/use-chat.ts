/**
 * @fileoverview Hook React pour la gestion du chat.
 * Wrapper autour du ChatService pour la liaison avec React.
 * Gère l'état React et synchronise avec le service.
 * 
 * @module hooks/use-chat
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chatService, type ChatStatus } from "@/services";
import type { ChatClientInfo, ChatMessage } from "@/lib/socket-client";

/**
 * Configuration du hook useChat.
 */
export type UseChatConfig = {
  roomName: string;
  pseudo: string;
  avatar?: string | null;
  clientId?: string;
};

/**
 * Callbacks d'événements du chat.
 */
export type UseChatCallbacks = {
  onStatusChange?: (status: ChatStatus) => void;
  onClientsChanged?: (clients: Record<string, ChatClientInfo>) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  onUserDisconnected?: (id: string, pseudo?: string) => void;
  onPeerSignal?: (fromId: string, fromPseudo: string | undefined, signal: unknown) => void;
  onError?: (message: string) => void;
};

/**
 * Hook React pour le chat.
 * Connecte automatiquement au service, gère l'état React, et synchronise.
 * 
 * @param config Configuration (roomName, pseudo, avatar)
 * @param callbacks Fonctions de callback pour les événements
 * @returns État et API du chat
 */
export function useChat(config: UseChatConfig, callbacks?: UseChatCallbacks) {
  const { roomName, pseudo, avatar, clientId } = config;
  const callbacksRef = useRef(callbacks);

  const [status, setStatus] = useState<ChatStatus>("idle");
  const [clients, setClients] = useState<Record<string, ChatClientInfo>>({});
  const [socketId, setSocketId] = useState<string | null>(null);

  // Mise à jour des callbacks
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Connexion au service
  useEffect(() => {
    if (!pseudo || !roomName) {
      chatService.disconnect();
      setStatus("idle");
      setClients({});
      setSocketId(null);
      return;
    }

    // S'abonne aux événements du service
    const unsubscribeStatus = chatService.on("statusChanged", (newStatus) => {
      setStatus(newStatus);
      callbacksRef.current?.onStatusChange?.(newStatus);
    });

    const unsubscribeClients = chatService.on("clientsChanged", (newClients) => {
      setClients(newClients);
      callbacksRef.current?.onClientsChanged?.(newClients);
      setSocketId(chatService.getSocketId());
    });

    const unsubscribeMessage = chatService.on("messageReceived", (message) => {
      callbacksRef.current?.onMessageReceived?.(message);
    });

    const unsubscribeUserDisconnected = chatService.on("userDisconnected", (id, pseudo) => {
      callbacksRef.current?.onUserDisconnected?.(id, pseudo);
    });

    const unsubscribePeerSignal = chatService.on("peerSignal", (fromId, fromPseudo, signal) => {
      callbacksRef.current?.onPeerSignal?.(fromId, fromPseudo, signal);
    });

    const unsubscribeError = chatService.on("error", (message) => {
      callbacksRef.current?.onError?.(message);
    });

    // Connecte au service
    chatService.connect({
      roomName,
      pseudo,
      avatar: avatar ?? null,
      clientId,
    }).catch((error) => {
      console.error("[useChat] Connection error:", error);
      callbacksRef.current?.onError?.(error instanceof Error ? error.message : String(error));
    });

    // Retour de nettoyage
    return () => {
      unsubscribeStatus();
      unsubscribeClients();
      unsubscribeMessage();
      unsubscribeUserDisconnected();
      unsubscribePeerSignal();
      unsubscribeError();
    };
  }, [roomName, pseudo, avatar, clientId]);

  /**
   * Envoie un message.
   */
  const sendMessage = useCallback(
    (content: string) => {
      chatService.sendMessage(roomName, content);
    },
    [roomName]
  );

  /**
   * Envoie un signal WebRTC.
   */
  const sendPeerSignal = useCallback(
    (targetId: string, signal: unknown) => {
      chatService.sendPeerSignal(targetId, signal, roomName);
    },
    [roomName]
  );

  /**
   * Participants filtrés (excluant l'utilisateur courant).
   */
  const participants = useMemo(() => {
    return Object.entries(clients)
      .filter(([id]) => id !== socketId)
      .map(([id, clientInfo]) => ({
        ...clientInfo,
        id,
      }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  }, [clients, socketId]);

  return {
    status,
    socketId,
    clients,
    participants,
    sendMessage,
    sendPeerSignal,
  };
}
