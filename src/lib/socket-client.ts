import { io, type Socket } from "socket.io-client";

export type ChatMessage = {
  content: string;
  pseudo?: string;
  roomName?: string;
  categorie?: "MESSAGE" | "INFO" | string;
  dateEmis?: string;
  serverId?: string;
};

export type ChatClientInfo = {
  id: string;
  pseudo: string;
  roomName: string;
  initiator?: boolean;
  avatar?: string | null;
  offerSignal?: unknown;
};

export type ChatJoinedRoomPayload = {
  clients: Record<string, ChatClientInfo>;
  roomName: string;
};

export type ChatDisconnectedPayload = {
  id: string;
  pseudo?: string;
  roomName: string;
};

export type PeerSignalPayload = {
  signal: unknown;
  id: string;
  roomName: string;
};

export type PeerSignalEmitPayload = PeerSignalPayload;

export type ChatJoinRoomPayload = {
  pseudo: string;
  roomName: string;
  avatar?: string | null;
};

export type ChatEmitMessagePayload = {
  content: string;
  roomName: string;
};

export interface ServerToClientEvents {
  "chat-msg": (payload: ChatMessage) => void;
  "chat-joined-room": (payload: ChatJoinedRoomPayload) => void;
  "chat-disconnected": (payload: ChatDisconnectedPayload) => void;
  "peer-signal": (payload: PeerSignalPayload) => void;
  error: (message: string) => void;
  erreur: (message: string) => void;
}

export interface ClientToServerEvents {
  "chat-join-room": (payload: ChatJoinRoomPayload) => void;
  "chat-msg": (payload: ChatEmitMessagePayload) => void;
  "peer-signal": (payload: PeerSignalEmitPayload) => void;
}

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_CHAT_SOCKET_URL ?? "https://api.tools.gavago.fr";

export const createChatSocket = (): ChatSocket =>
  io(SOCKET_URL, {
    autoConnect: false,
    transports: ["websocket"],
  });
