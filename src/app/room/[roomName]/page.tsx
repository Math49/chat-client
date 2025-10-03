"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SimplePeer, { type Instance as SimplePeerInstance } from "simple-peer";

import { useUser } from "@/contexts/user-context";
import { rememberRoom } from "@/lib/rooms";
import { createChatSocket, type ChatClientInfo, type ChatMessage, type ChatSocket, type PeerSignalPayload } from "@/lib/socket-client";
import { savePhoto } from "@/lib/photo-storage";
import { showNotification } from "@/lib/notifications";

const IMAGE_DATA_PREFIX = /^data:image\//i;

const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unsupported file result"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

type ChatEntry = {
  id: string;
  type: "message" | "info";
  pseudo: string;
  content: string;
  date: Date;
  isMine: boolean;
  isImage: boolean;
};

type CallState =
  | { phase: "idle" }
  | { phase: "dialing"; targetId: string; targetPseudo: string }
  | { phase: "incoming"; fromId: string; fromPseudo: string }
  | { phase: "active"; peerId: string; peerPseudo: string };

const RemoteAudio = ({ stream, id }: { stream: MediaStream; id: string }) => {
  const elementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.srcObject = stream;
    const play = () => element.play().catch(() => undefined);
    play();
    return () => {
      if (element.srcObject === stream) {
        element.srcObject = null;
      }
    };
  }, [stream]);

  return <audio ref={elementRef} autoPlay id={`remote-audio-${id}`} className="hidden" />;
};

export default function RoomPage() {
  const params = useParams<{ roomName: string }>();
  const roomName = decodeURIComponent(params?.roomName ?? "general");
  const router = useRouter();
  const { profile, isReady } = useUser();

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [socketStatus, setSocketStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [clients, setClients] = useState<Record<string, ChatClientInfo>>({});
  const [socketId, setSocketId] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallState>({ phase: "idle" });
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState<string | null>(null);
  const [incomingInfo, setIncomingInfo] = useState<{ id: string; pseudo: string } | null>(null);

  const socketRef = useRef<ChatSocket | null>(null);
  const clientsRef = useRef<Record<string, ChatClientInfo>>({});
  const profileRef = useRef(profile);
  const callStateRef = useRef<CallState>({ phase: "idle" });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, SimplePeerInstance>>(new Map());
  const pendingSignalsRef = useRef<Map<string, unknown[]>>(new Map());
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});

  useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    remoteStreamsRef.current = remoteStreams;
  }, [remoteStreams]);

  useEffect(() => {
    if (!isReady) return;
    if (!profile?.pseudo) {
      router.replace("/reception");
    }
  }, [isReady, profile, router]);

  useEffect(() => {
    if (messages.length === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const appendMessage = useCallback((entry: ChatEntry) => {
    setMessages((prev) => [...prev, entry]);
  }, []);

  const resetCall = useCallback(() => {
    peersRef.current.forEach((peer) => peer.destroy());
    peersRef.current.clear();

    Object.values(remoteStreamsRef.current).forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    setRemoteStreams({});
    remoteStreamsRef.current = {};

    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setCallState({ phase: "idle" });
    setIncomingInfo(null);
    pendingSignalsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!isReady || !profile?.pseudo) return;

    rememberRoom(roomName);

    const socket = createChatSocket();
    socketRef.current = socket;
    setSocketStatus("connecting");

    const handleConnect = () => {
      setSocketStatus("connected");
      setSocketId(socket.id ?? null);
      socket.emit("chat-join-room", {
        pseudo: profile.pseudo,
        roomName,
        avatar: profile.avatar ?? null,
      });
    };

    const handleDisconnect = () => {
      setSocketStatus("idle");
      setSocketId(null);
      resetCall();
    };

    const handleError = (message: string) => {
      console.error("Socket error", message);
      setError(message);
      setSocketStatus("error");
    };

    const handleChatMessage = (payload: ChatMessage) => {
      const currentProfile = profileRef.current;
      const author = payload.pseudo ?? "Serveur";
      const isMine = Boolean(currentProfile && payload.pseudo === currentProfile.pseudo);
      const entry: ChatEntry = {
        id: `${payload.dateEmis ?? Date.now()}-${payload.serverId ?? Math.random().toString(16).slice(2)}`,
        type: payload.categorie === "INFO" ? "info" : "message",
        pseudo: author,
        content: payload.content,
        date: payload.dateEmis ? new Date(payload.dateEmis) : new Date(),
        isMine,
        isImage: typeof payload.content === "string" ? IMAGE_DATA_PREFIX.test(payload.content) : false,
      };
      appendMessage(entry);

      if (entry.isImage) {
        try {
          savePhoto(entry.content);
        } catch (photoError) {
          console.warn("Unable to store photo", photoError);
        }
      }

      if (!isMine && entry.type === "message" && typeof document !== "undefined" && document.visibilityState === "hidden") {
        showNotification({
          title: `${author} (#${roomName})`,
          body: entry.isImage ? "Photo partagee" : entry.content.slice(0, 80),
          icon: "/images/icons/Logo-192x192.png",
          url: `/room/${encodeURIComponent(roomName)}`,
          vibrate: [120, 60, 120],
        });
      }
    };

    const handleJoinedRoom = ({ clients: incomingClients }: { clients: Record<string, ChatClientInfo> }) => {
      setClients(incomingClients);
    };

    const handleDisconnected = (payload: { id: string; pseudo?: string }) => {
      setClients((prev) => {
        const next = { ...prev };
        delete next[payload.id];
        return next;
      });
      appendMessage({
        id: `leave-${payload.id}-${Date.now()}`,
        type: "info",
        pseudo: payload.pseudo ?? "Serveur",
        content: `${payload.pseudo ?? "Un utilisateur"} a quitte la room`,
        date: new Date(),
        isMine: false,
        isImage: false,
      });
      const stream = remoteStreamsRef.current[payload.id];
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[payload.id];
        return next;
      });
      const streamsCopy = { ...remoteStreamsRef.current };
      delete streamsCopy[payload.id];
      remoteStreamsRef.current = streamsCopy;
      peersRef.current.get(payload.id)?.destroy();
      peersRef.current.delete(payload.id);
      const currentCall = callStateRef.current;
      if (currentCall.phase === "active" && currentCall.peerId === payload.id) {
        setCallState({ phase: "idle" });
      }
    };

    const handlePeerSignal = ({ id, signal }: PeerSignalPayload) => {
      const currentClients = clientsRef.current;
      const target = currentClients[id];
      if (!target) {
        console.warn("Peer signal received for unknown client", id);
        return;
      }
      const existingPeer = peersRef.current.get(id);
      if (existingPeer) {
        existingPeer.signal(signal);
        return;
      }
      const queue = pendingSignalsRef.current.get(id) ?? [];
      queue.push(signal);
      pendingSignalsRef.current.set(id, queue);
      setIncomingInfo({ id, pseudo: target.pseudo });
      setCallState({ phase: "incoming", fromId: id, fromPseudo: target.pseudo });
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([200, 100, 200]);
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("chat-msg", handleChatMessage);
    socket.on("chat-joined-room", handleJoinedRoom);
    socket.on("chat-disconnected", handleDisconnected);
    socket.on("peer-signal", handlePeerSignal);
    socket.on("error", handleError);
    socket.on("erreur", handleError);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("chat-msg", handleChatMessage);
      socket.off("chat-joined-room", handleJoinedRoom);
      socket.off("chat-disconnected", handleDisconnected);
      socket.off("peer-signal", handlePeerSignal);
      socket.off("error", handleError);
      socket.off("erreur", handleError);
      socket.disconnect();
      socketRef.current = null;
      resetCall();
    };
  }, [isReady, profile, roomName, resetCall]);

  const participants = useMemo(() => {
    return Object.values(clients)
      .filter((client) => client.id !== socketId)
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  }, [clients, socketId]);

  const doSendMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed || !socketRef.current) return;
    socketRef.current.emit("chat-msg", {
      content: trimmed,
      roomName,
    });
  }, [roomName]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    doSendMessage(inputValue);
    setInputValue("");
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch (streamError) {
      setError("Acces au micro refuse. Active ton micro pour lancer l'appel.");
      throw streamError;
    }
  };

  const setupPeer = async (target: ChatClientInfo, initiator: boolean) => {
    if (!socketRef.current) return;
    if (peersRef.current.has(target.id)) return;

    const stream = await ensureLocalStream();

    const peer = new SimplePeer({
      initiator,
      trickle: false,
      stream,
    });

    peersRef.current.set(target.id, peer);

    peer.on("signal", (signal) => {
      socketRef.current?.emit("peer-signal", {
        roomName,
        id: target.id,
        signal,
      });
    });

    peer.on("stream", (remoteStream) => {
      remoteStreamsRef.current = { ...remoteStreamsRef.current, [target.id]: remoteStream };
      setRemoteStreams((prev) => ({ ...prev, [target.id]: remoteStream }));
      setCallState({ phase: "active", peerId: target.id, peerPseudo: target.pseudo });
    });

    peer.on("close", () => {
      peersRef.current.delete(target.id);
      const currentStream = remoteStreamsRef.current[target.id];
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
      const streamsCopy = { ...remoteStreamsRef.current };
      delete streamsCopy[target.id];
      remoteStreamsRef.current = streamsCopy;
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
      setCallState({ phase: "idle" });
    });

    peer.on("error", (peerError) => {
      console.error("Peer error", peerError);
      peer.destroy();
    });

    const queued = pendingSignalsRef.current.get(target.id);
    if (queued && queued.length > 0) {
      queued.forEach((signal) => peer.signal(signal));
      pendingSignalsRef.current.delete(target.id);
    }
  };

  const startCall = async (target: ChatClientInfo) => {
    try {
      await setupPeer(target, true);
      setCallState({ phase: "dialing", targetId: target.id, targetPseudo: target.pseudo });
      setIncomingInfo(null);
      setError(null);
    } catch (callError) {
      console.error("Unable to start call", callError);
      setError("Impossible de lancer l'appel.");
    }
  };

  const acceptCall = async (info: { id: string; pseudo: string }) => {
    const target = clientsRef.current[info.id];
    if (!target) {
      setCallState({ phase: "idle" });
      setIncomingInfo(null);
      return;
    }
    try {
      await setupPeer(target, false);
      setCallState({ phase: "active", peerId: info.id, peerPseudo: info.pseudo });
      setIncomingInfo(null);
      setError(null);
    } catch (acceptError) {
      console.error("Unable to accept call", acceptError);
      setError("Connexion audio impossible.");
      setCallState({ phase: "idle" });
    }
  };

  const rejectCall = () => {
    if (!incomingInfo) return;
    pendingSignalsRef.current.delete(incomingInfo.id);
    setIncomingInfo(null);
    setCallState({ phase: "idle" });
  };

  const stopCall = () => {
    resetCall();
  };

  const handlePhotoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await toDataUrl(file);
      savePhoto(dataUrl);
      doSendMessage(dataUrl);
      setError(null);
    } catch (fileError) {
      console.error("Unable to share photo", fileError);
      setError("Impossible d'envoyer la photo.");
    }
  };

  if (!profile?.pseudo) {
    return null;
  }

  return (
    <div className="grid gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Salon #{roomName}</h1>
          <p className="text-sm text-neutral-500">
            {socketStatus === "connected" ? "Connecte" : socketStatus === "connecting" ? "Connexion en cours" : "Deconnecte"}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link className="underline" href="/reception">
            Reception
          </Link>
          <Link className="underline" href="/gallery">
            Galerie
          </Link>
        </nav>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-[2fr,1fr]">
        <div className="flex h-[520px] flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`flex flex-col gap-1 rounded-xl px-4 py-3 text-sm shadow-sm ${
                  message.type === "info"
                    ? "bg-neutral-100 text-neutral-600"
                    : message.isMine
                      ? "bg-blue-50 text-blue-800"
                      : "bg-white text-neutral-800 border border-neutral-200"
                }`}
              >
                <header className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{message.pseudo}</span>
                  <time dateTime={message.date.toISOString()} className="text-neutral-500">
                    {message.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </header>
                {message.isImage ? (
                  <img src={message.content} alt="Photo partagee" className="max-h-64 rounded-lg object-contain" />
                ) : (
                  <p className="leading-relaxed">{message.content}</p>
                )}
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit} className="flex items-center gap-3 border-t border-neutral-200 px-4 py-3">
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.currentTarget.value)}
              placeholder="Ton message"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
            <label className="flex cursor-pointer items-center rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:border-blue-400">
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelection} />
              Photo
            </label>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
              disabled={!inputValue.trim() || socketStatus !== "connected"}
            >
              Envoyer
            </button>
          </form>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-700">Participants</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {participants.length === 0 && <li className="text-neutral-500">Tu es seul dans ce salon.</li>}
              {participants.map((client) => (
                <li key={client.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2">
                  <span className="font-medium text-neutral-700">{client.pseudo}</span>
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase text-white"
                    onClick={() => startCall(client)}
                    disabled={callState.phase === "active" || callState.phase === "dialing"}
                  >
                    Appeler
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-700">Appel audio</h2>
            {callState.phase === "idle" && <p className="text-sm text-neutral-500">Lance un appel ou reponds a une invitation.</p>}
            {callState.phase === "dialing" && (
              <div className="flex items-center justify-between text-sm">
                <span>Appel vers {callState.targetPseudo}...</span>
                <button
                  type="button"
                  className="rounded bg-red-600 px-3 py-1 text-xs font-semibold uppercase text-white"
                  onClick={stopCall}
                >
                  Annuler
                </button>
              </div>
            )}
            {callState.phase === "incoming" && incomingInfo && (
              <div className="space-y-2 text-sm">
                <p>{incomingInfo.pseudo} t'appelle.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase text-white"
                    onClick={() => acceptCall(incomingInfo)}
                  >
                    Repondre
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded bg-red-600 px-3 py-2 text-xs font-semibold uppercase text-white"
                    onClick={rejectCall}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            )}
            {callState.phase === "active" && (
              <div className="flex items-center justify-between text-sm">
                <span>En ligne avec {callState.peerPseudo}</span>
                <button
                  type="button"
                  className="rounded bg-red-600 px-3 py-1 text-xs font-semibold uppercase text-white"
                  onClick={stopCall}
                >
                  Raccrocher
                </button>
              </div>
            )}
          </div>

          {Object.entries(remoteStreams).map(([id, stream]) => (
            <RemoteAudio key={id} id={id} stream={stream} />
          ))}
        </aside>
      </section>
    </div>
  );
}
