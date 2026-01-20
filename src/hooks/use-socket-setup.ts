"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChatSocket,
  type ChatSocket,
  type ChatClientInfo,
  type ChatMessage,
} from "@/lib/socket-client";

export type SocketStatus = "idle" | "connecting" | "connected" | "error";

export type SocketSetupConfig = {
  roomName: string;
  pseudo: string;
  avatar?: string | null;  clientId?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (message: string) => void;
  onChatMessage?: (payload: ChatMessage) => void;
  onJoinedRoom?: (clients: Record<string, ChatClientInfo>) => void;
  onDisconnectedUser?: (id: string, pseudo?: string) => void;

  // ✅ On passe aussi le pseudo de l’émetteur
  onPeerSignal?: (fromId: string, fromPseudo: string | undefined, signal: unknown) => void;

  onStatusChange?: (status: SocketStatus) => void;
};

export function useSocketSetup(config: SocketSetupConfig) {
  const { roomName, pseudo, avatar, clientId } = config;

  const socketRef = useRef<ChatSocket | null>(null);

  const [status, setStatus] = useState<SocketStatus>("idle");
  const [clients, setClients] = useState<Record<string, ChatClientInfo>>({});
  const [socketId, setSocketId] = useState<string | null>(null);

  const cbRef = useRef({
    onConnect: config.onConnect,
    onDisconnect: config.onDisconnect,
    onError: config.onError,
    onChatMessage: config.onChatMessage,
    onJoinedRoom: config.onJoinedRoom,
    onDisconnectedUser: config.onDisconnectedUser,
    onPeerSignal: config.onPeerSignal,
    onStatusChange: config.onStatusChange,
  });

  useEffect(() => {
    cbRef.current = {
      onConnect: config.onConnect,
      onDisconnect: config.onDisconnect,
      onError: config.onError,
      onChatMessage: config.onChatMessage,
      onJoinedRoom: config.onJoinedRoom,
      onDisconnectedUser: config.onDisconnectedUser,
      onPeerSignal: config.onPeerSignal,
      onStatusChange: config.onStatusChange,
    };
  }, [
    config.onConnect,
    config.onDisconnect,
    config.onError,
    config.onChatMessage,
    config.onJoinedRoom,
    config.onDisconnectedUser,
    config.onPeerSignal,
    config.onStatusChange,
  ]);

  const setStatusSafe = useCallback((s: SocketStatus) => {
    setStatus(s);
    cbRef.current.onStatusChange?.(s);
  }, []);

  useEffect(() => {
    if (!pseudo || !roomName) {
      setStatusSafe("idle");
      return;
    }

    setStatusSafe("connecting");

    const socket = createChatSocket();
    socketRef.current = socket;

    const handleConnect = () => {
      setStatusSafe("connected");
      setSocketId(socket.id ?? null);

      socket.emit("chat-join-room", {
        pseudo,
        roomName,
        avatar: avatar ?? null,
        clientId,
      });

      cbRef.current.onConnect?.();
    };

    const handleDisconnect = () => {
      setStatusSafe("idle");
      cbRef.current.onDisconnect?.();
    };

    const handleError = (message: string) => {
      setStatusSafe("error");
      cbRef.current.onError?.(message);
    };

    const handleChatMessage = (payload: ChatMessage) => {
      cbRef.current.onChatMessage?.(payload);
    };

    const handleJoinedRoom = (payload: { clients: Record<string, ChatClientInfo> }) => {
      setClients(payload.clients);
      cbRef.current.onJoinedRoom?.(payload.clients);

      if (!socket.id) {
        const guessedId =
          Object.keys(payload.clients).find((id) => payload.clients[id]?.pseudo === pseudo) ?? null;
        setSocketId(guessedId);
      }
    };

    const handleDisconnectedUser = (payload: { id: string; pseudo?: string }) => {
      setClients((prev) => {
        const next = { ...prev };
        delete next[payload.id];
        return next;
      });
      cbRef.current.onDisconnectedUser?.(payload.id, payload.pseudo);
    };

    // ✅ On accepte plusieurs formats payload (robuste)
    const handlePeerSignal = (payload: any) => {
      const fromId = payload.fromId ?? payload.senderId ?? payload.id;
      const fromPseudo = payload.pseudo;
      const signal = payload.signal ?? payload.offerSignal ?? payload.answerSignal ?? payload.candidate;
      if (!fromId || !signal) return;
      cbRef.current.onPeerSignal?.(fromId, fromPseudo, signal);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("chat-msg", handleChatMessage);
    socket.on("chat-joined-room", handleJoinedRoom);
    socket.on("chat-disconnected", handleDisconnectedUser);
    socket.on("peer-signal", handlePeerSignal);

    socket.on("error", handleError);
    socket.on("erreur", handleError);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("chat-msg", handleChatMessage);
      socket.off("chat-joined-room", handleJoinedRoom);
      socket.off("chat-disconnected", handleDisconnectedUser);
      socket.off("peer-signal", handlePeerSignal);
      socket.off("error", handleError);
      socket.off("erreur", handleError);

      // Essayer de fermer proprement la socket
      if (socket.connected) {
        socket.emit("disconnect");
      }
      socket.disconnect();
      socketRef.current = null;

      setClients({});
      setSocketId(null);
      setStatusSafe("idle");
    };
  }, [roomName, pseudo, avatar, clientId, setStatusSafe]);

  const emitMessage = useCallback(
    (content: string) => {
      const s = socketRef.current;
      if (!s) return;
      const trimmed = content.trim();
      if (!trimmed) return;

      s.emit("chat-msg", { content: trimmed, roomName });
    },
    [roomName]
  );

  const emitPeerSignal = useCallback(
    (targetId: string, signal: unknown) => {
      const s = socketRef.current;
      if (!s) return;

      s.emit("peer-signal", {
        roomName,
        id: targetId,
        signal,
        pseudo,
      });
    },
    [roomName, pseudo]
  );

  const participants = useMemo(() => Object.values(clients), [clients]);

  return {
    status,
    socketId,
    clients,
    participants,
    emitMessage,
    emitPeerSignal,
  };
}
