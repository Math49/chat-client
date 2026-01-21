/**
 * @fileoverview Service de gestion des communications Socket.IO.
 * Logique métier pour la communication temps réel (chat, signalisation WebRTC).
 * Indépendant de React - peut être testé unitairement.
 * 
 * @module services/chat.service
 */

import type {
  ChatSocket,
  ChatClientInfo,
  ChatMessage,
  ChatJoinedRoomPayload,
  ChatDisconnectedPayload,
  PeerSignalPayload,
} from "@/lib/socket-client";
import { createChatSocket } from "@/lib/socket-client";

/**
 * États possibles de la connexion chat.
 */
export type ChatStatus = "idle" | "connecting" | "connected" | "error";

/**
 * Événements émis par le ChatService
 */
export interface ChatServiceEvents {
  statusChanged: (status: ChatStatus) => void;
  clientsChanged: (clients: Record<string, ChatClientInfo>) => void;
  messageReceived: (message: ChatMessage) => void;
  userDisconnected: (id: string, pseudo?: string) => void;
  peerSignal: (fromId: string, fromPseudo: string | undefined, signal: unknown) => void;
  error: (message: string) => void;
}

/**
 * Service de gestion des communications Socket.IO.
 * Encapsule toute la logique de connexion, message, et signalisation.
 * 
 * Responsabilités:
 * - Gestion du cycle de vie socket (connexion, reconnexion, déconnexion)
 * - Émission et réception de messages
 * - Gestion des signaux WebRTC
 * - Notification des changements d'état via listeners
 */
export class ChatService {
  private socket: ChatSocket | null = null;
  private status: ChatStatus = "idle";
  private clients: Record<string, ChatClientInfo> = {};
  private socketId: string | null = null;
  private listeners: Map<keyof ChatServiceEvents, Set<Function>> = new Map();
  private pendingSignalsBuffer: Array<() => void> = [];

  constructor() {
    // Initialiser les sets pour chaque événement
    const eventKeys: (keyof ChatServiceEvents)[] = [
      "statusChanged",
      "clientsChanged",
      "messageReceived",
      "userDisconnected",
      "peerSignal",
      "error",
    ];
    eventKeys.forEach((key) => this.listeners.set(key, new Set()));
  }

  /**
   * Obtient l'état actuel du service.
   */
  getStatus(): ChatStatus {
    return this.status;
  }

  /**
   * Obtient l'ID Socket.IO de la connexion actuelle.
   */
  getSocketId(): string | null {
    return this.socketId;
  }

  /**
   * Obtient la liste des clients connectés.
   */
  getClients(): Record<string, ChatClientInfo> {
    return { ...this.clients };
  }

  /**
   * Connecte au serveur et rejoint une salle.
   * 
   * @param config Configuration de connexion
   * @throws Si une connexion est déjà active
   */
  async connect(config: {
    roomName: string;
    pseudo: string;
    avatar?: string | null;
    clientId?: string;
  }): Promise<void> {
    if (this.socket) {
      throw new Error("ChatService already connected");
    }

    this.setStatus("connecting");

    try {
      this.socket = createChatSocket();
      this.setupEventHandlers();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 5000);

        const handleConnect = () => {
          clearTimeout(timeout);
          resolve();
        };

        this.socket!.once("connect", handleConnect);
        this.socket!.on("error", () => {
          clearTimeout(timeout);
          reject(new Error("Connection error"));
        });

        this.socket!.connect();
      });

      this.socketId = this.socket.id ?? null;
      this.setStatus("connected");

      // Envoyer la demande de rejoindre la salle
      this.socket.emit("chat-join-room", {
        pseudo: config.pseudo,
        roomName: config.roomName,
        avatar: config.avatar ?? null,
        clientId: config.clientId,
      });
    } catch (error) {
      this.setStatus("error");
      this.emit("error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Déconnecte du serveur.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.off("connect");
      this.socket.off("disconnect");
      this.socket.off("chat-msg");
      this.socket.off("chat-joined-room");
      this.socket.off("chat-disconnected");
      this.socket.off("peer-signal");
      this.socket.off("error");
      this.socket.off("erreur");

      this.socket.disconnect();
      this.socket = null;
    }

    this.clients = {};
    this.socketId = null;
    this.pendingSignalsBuffer = [];
    this.setStatus("idle");
  }

  /**
   * Envoie un message chat.
   * 
   * @param roomName Salle destinataire
   * @param content Contenu du message
   */
  sendMessage(roomName: string, content: string): void {
    if (!this.socket) {
      console.warn("[ChatService] Not connected");
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) return;

    this.socket.emit("chat-msg", { content: trimmed, roomName });
  }

  /**
   * Envoie un signal WebRTC à un pair.
   * 
   * @param targetId ID du destinataire
   * @param signal Signal SDP/ICE
   * @param roomName Salle de l'appel
   */
  sendPeerSignal(targetId: string, signal: unknown, roomName: string): void {
    if (!this.socket) {
      console.warn("[ChatService] Not connected");
      return;
    }

    const payload: any = {
      roomName,
      id: targetId,
      signal: signal && typeof signal === "object" && "signal" in signal ? (signal as any).signal : signal,
      pseudo: "unknown",
    };

    if (signal && typeof signal === "object" && "videoEnabled" in signal) {
      payload.videoEnabled = (signal as any).videoEnabled;
    }

    this.socket.emit("peer-signal", payload);
  }

  /**
   * Enregistre un listener pour les changements.
   * 
   * @param event Nom de l'événement
   * @param listener Fonction de callback
   * @returns Fonction de désinscription
   */
  on<K extends keyof ChatServiceEvents>(event: K, listener: (...args: any[]) => void): () => void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
    return () => {};
  }

  /**
   * Met en place les gestionnaires d'événements Socket.IO.
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      this.setStatus("connected");
      this.socketId = this.socket?.id ?? null;
      this.flushPendingSignals();
    });

    this.socket.on("disconnect", () => {
      this.setStatus("idle");
    });

    this.socket.on("chat-msg", (payload: ChatMessage) => {
      this.emit("messageReceived", payload);
    });

    this.socket.on("chat-joined-room", (payload: ChatJoinedRoomPayload) => {
      this.clients = payload.clients;
      this.emit("clientsChanged", this.clients);
    });

    this.socket.on("chat-disconnected", (payload: ChatDisconnectedPayload) => {
      if (this.clients[payload.id]) {
        delete this.clients[payload.id];
        this.emit("clientsChanged", this.clients);
      }
      this.emit("userDisconnected", payload.id, payload.pseudo);
    });

    this.socket.on("peer-signal", (payload: PeerSignalPayload) => {
      const fromId = payload.id;
      const fromPseudo = payload.pseudo;
      const signal = payload.signal;

      this.emit("peerSignal", fromId, fromPseudo, signal);
    });

    this.socket.on("error", (message: string) => {
      this.setStatus("error");
      this.emit("error", message);
    });

    this.socket.on("erreur", (message: string) => {
      this.setStatus("error");
      this.emit("error", message);
    });
  }

  /**
   * Change le statut et notifie les listeners.
   */
  private setStatus(status: ChatStatus): void {
    this.status = status;
    this.emit("statusChanged", status);
  }

  /**
   * Émet un événement à tous les listeners.
   */
  private emit<K extends keyof ChatServiceEvents>(event: K, ...args: any[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`[ChatService] Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Flushe tous les signaux en attente quand la connexion est établie.
   */
  private flushPendingSignals(): void {
    this.pendingSignalsBuffer.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.error("[ChatService] Error flushing signal:", error);
      }
    });
    this.pendingSignalsBuffer = [];
  }
}

/** Instance singleton du service chat */
export const chatService = new ChatService();
