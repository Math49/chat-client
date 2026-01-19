"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  ScrollShadow,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";

import { useUser } from "@/contexts/user-context";
import { useSocketSetup } from "@/hooks/use-socket-setup";
import { useConference } from "@/hooks/use-conference";

import { rememberRoom } from "@/lib/rooms";
import { savePhoto } from "@/lib/photo-storage";
import { loadRoomMessages, addRoomMessage } from "@/lib/message-storage";
import { showNotification } from "@/lib/notifications";
import { type ChatClientInfo, type ChatMessage, type ConferenceStartPayload } from "@/lib/socket-client";

import { ConferenceMessage } from "@/components/conference-message";
import { ConferenceStatusIndicator, ParticipantWithConferenceStatus } from "@/components/conference-status";

const IMAGE_DATA_PREFIX = /^data:image\//i;

const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unsupported file result")));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

type ChatEntry = {
  id: string;
  type: "message" | "info" | "conference-start";
  pseudo: string;
  content: string;
  date: Date;
  isMine: boolean;
  isImage: boolean;
  // Pour les messages de conférence
  conferenceId?: string;
  initiatorId?: string;
};

const RemoteAudio = ({ stream }: { stream: MediaStream }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.play().catch(() => undefined);
    return () => {
      if (ref.current?.srcObject === stream) ref.current.srcObject = null;
    };
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
};

export default function RoomPage() {
  const params = useParams<{ roomName: string }>();
  const roomName = decodeURIComponent(params?.roomName ?? "general");

  const router = useRouter();
  const { profile, isReady } = useUser();

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // État de la conférence
  const [activeConferenceId, setActiveConferenceId] = useState<string | null>(null);
  const [conferenceParticipants, setConferenceParticipants] = useState<Set<string>>(new Set());
  const [isJoiningConference, setIsJoiningConference] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const clientsRef = useRef<Record<string, ChatClientInfo>>({});

  useEffect(() => {
    if (!isReady) return;
    if (!profile?.pseudo) router.replace("/reception");
  }, [isReady, profile?.pseudo, router]);

  const appendMessage = useCallback((entry: ChatEntry) => {
    setMessages((prev) => [...prev, entry]);
  }, []);

  const makeId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const {
    conferenceState,
    startConference,
    joinConference,
    leaveConference,
    handleIncomingSignal: handleConferenceSignal,
    addParticipant: addConferenceParticipant,
    removeParticipant: removeConferenceParticipant,
    getPeers: getConferencePeers,
  } = useConference({
    onError: (e) => {
      console.error("[Conference]", e);
      setError(typeof e === "string" ? e : "Erreur conférence audio");
    },
    onStreamAvailable: (peerId, stream) => {
      console.log(`[Conference] Stream reçu de ${peerId}`);
      // On pourrait afficher le stream si on avait une interface audio avancée
    },
    onStreamRemoved: (peerId) => {
      console.log(`[Conference] Stream retiré de ${peerId}`);
    },
  });

  const { status: socketStatus, clients, socketId, emitMessage, emitConferenceStart, emitConferenceJoin, emitConferenceLeave, emitConferencePeerSignal } = useSocketSetup({
    roomName,
    pseudo: profile?.pseudo ?? "",
    avatar: profile?.avatar ?? null,

    onError: (message) => {
      console.error("[Socket]", message);
      setError(message);
    },

    onChatMessage: (payload: ChatMessage) => {
      const author = payload.pseudo ?? "Serveur";
      const isMine = Boolean(profile && payload.pseudo === profile.pseudo);
      const isImage = typeof payload.content === "string" ? IMAGE_DATA_PREFIX.test(payload.content) : false;

      const entry: ChatEntry = {
        id: makeId(),
        type: payload.categorie === "INFO" ? "info" : "message",
        pseudo: author,
        content: payload.content,
        date: payload.dateEmis ? new Date(payload.dateEmis) : new Date(),
        isMine,
        isImage,
      };

      appendMessage(entry);

      try {
        addRoomMessage(roomName, {
          id: entry.id,
          pseudo: author,
          content: entry.content,
          categorie: entry.type === "info" ? "INFO" : "MESSAGE",
          isMine: entry.isMine,
          isImage: entry.isImage,
        });
      } catch (storageError) {
        console.warn("[MessageStorage] Failed to persist", storageError);
      }

      if (entry.isImage) {
        try {
          savePhoto(entry.content);
        } catch (photoError) {
          console.warn("[PhotoStorage] Unable to store photo", photoError);
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
    },

    // 🎤 Gestion des événements de conférence
    onConferenceStarted: (payload: ConferenceStartPayload) => {
      setActiveConferenceId(payload.conferenceId);
      setConferenceParticipants(new Set([payload.initiatorId]));

      // Ajouter un message système à la conférence
      appendMessage({
        id: makeId(),
        type: "conference-start",
        pseudo: payload.initiatorPseudo,
        content: `a lancé une conférence`,
        date: new Date(),
        isMine: false,
        isImage: false,
        conferenceId: payload.conferenceId,
        initiatorId: payload.initiatorId,
      });
    },

    onConferenceUserJoined: (payload) => {
      setConferenceParticipants((prev) => new Set([...prev, payload.userId]));
      appendMessage({
        id: makeId(),
        type: "info",
        pseudo: payload.userPseudo,
        content: `a rejoint la conférence`,
        date: new Date(),
        isMine: false,
        isImage: false,
      });
    },

    onConferenceUserLeft: (payload) => {
      setConferenceParticipants((prev) => {
        const next = new Set(prev);
        next.delete(payload.userId);
        return next;
      });
      appendMessage({
        id: makeId(),
        type: "info",
        pseudo: payload.userPseudo,
        content: `a quitté la conférence`,
        date: new Date(),
        isMine: false,
        isImage: false,
      });
    },

    onConferencePeerSignal: (payload) => {
      if (conferenceState.phase !== "active") return;
      handleConferenceSignal(payload.fromId, payload.fromPseudo, payload.signal, false);
    },

    onDisconnectedUser: (id, pseudo) => {
      appendMessage({
        id: makeId(),
        type: "info",
        pseudo: pseudo ?? "Serveur",
        content: `${pseudo ?? "Un utilisateur"} a quitte la room`,
        date: new Date(),
        isMine: false,
        isImage: false,
      });

      // Si on est en conférence et que cette personne quitte, la retirer
      if (activeConferenceId) {
        removeConferenceParticipant(id);
      }
    },
  });

  useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);

  useEffect(() => {
    if (!isReady || !profile?.pseudo) return;

    rememberRoom(roomName);

    const stored = loadRoomMessages(roomName);
    const entries: ChatEntry[] = stored.map((msg) => ({
      id: msg.id,
      type: msg.categorie === "INFO" ? "info" : "message",
      pseudo: msg.pseudo,
      content: msg.content,
      date: new Date(msg.createdAt),
      isMine: msg.isMine ?? false,
      isImage: msg.isImage ?? false,
    }));

    setMessages(entries);
  }, [isReady, profile?.pseudo, roomName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Participants filtrés (excluant soi-même)
  const participants = useMemo(() => {
    const list = Object.entries(clients)
      .filter(([id]) => id !== socketId)
      .map(([id, c]) => ({ ...c, id } as ChatClientInfo & { id: string }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo));

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.pseudo.toLowerCase().includes(q));
  }, [clients, socketId, search]);

  const doSendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      emitMessage(trimmed);
    },
    [emitMessage]
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      doSendMessage(inputValue);
      setInputValue("");
    },
    [doSendMessage, inputValue]
  );

  const handlePhotoSelection = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;

      try {
        const dataUrl = await toDataUrl(file);
        savePhoto(dataUrl);
        doSendMessage(dataUrl);
        setError(null);
      } catch (e) {
        console.error(e);
        setError("Impossible d'envoyer la photo.");
      } finally {
        event.currentTarget.value = "";
      }
    },
    [doSendMessage]
  );

  // 🎤 Démarrer une conférence
  const handleStartConference = useCallback(async () => {
    if (!socketId) return;
    try {
      setIsJoiningConference(true);
      const conferenceId = await startConference((peerId, signal) => {
        if (activeConferenceId) {
          emitConferencePeerSignal({
            conferenceId: activeConferenceId,
            signal,
            fromId: socketId,
            fromPseudo: profile?.pseudo ?? "Inconnu",
            roomName,
          });
        }
      });
      setActiveConferenceId(conferenceId);
      setConferenceParticipants(new Set([socketId]));
      emitConferenceStart(conferenceId);
      setIsJoiningConference(false);
    } catch (e) {
      setError(typeof e === "string" ? e : "Erreur lors du démarrage de la conférence");
      setIsJoiningConference(false);
    }
  }, [socketId, startConference, activeConferenceId, emitConferencePeerSignal, profile?.pseudo, roomName, emitConferenceStart]);

  // 🎤 Rejoindre une conférence existante
  const handleJoinConference = useCallback(
    async (conferenceId: string) => {
      if (!socketId) return;
      try {
        setIsJoiningConference(true);
        await joinConference(conferenceId, (peerId, signal) => {
          emitConferencePeerSignal({
            conferenceId,
            signal,
            fromId: socketId,
            fromPseudo: profile?.pseudo ?? "Inconnu",
            roomName,
          });
        });
        setActiveConferenceId(conferenceId);
        setConferenceParticipants((prev) => new Set([...prev, socketId]));
        emitConferenceJoin(conferenceId);
        setIsJoiningConference(false);
      } catch (e) {
        setError(typeof e === "string" ? e : "Erreur lors de la connexion à la conférence");
        setIsJoiningConference(false);
      }
    },
    [socketId, joinConference, emitConferencePeerSignal, profile?.pseudo, roomName, emitConferenceJoin]
  );

  // 🎤 Quitter la conférence
  const handleLeaveConference = useCallback(
    (conferenceId: string) => {
      leaveConference();
      setActiveConferenceId(null);
      setConferenceParticipants(new Set());
      emitConferenceLeave(conferenceId);
    },
    [leaveConference, emitConferenceLeave]
  );

  if (!profile?.pseudo) return null;

  return (
    <div className="grid gap-4 p-4">
      {/* Composant audio distant caché */}
      {getConferencePeers().map((peer) => peer.stream && <RemoteAudio key={peer.id} stream={peer.stream} />)}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Salon #{roomName}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Chip size="sm" variant="flat">
              {socketStatus === "connected"
                ? "Connecté"
                : socketStatus === "connecting"
                  ? "Connexion..."
                  : socketStatus === "error"
                    ? "Erreur"
                    : "Déconnecté"}
            </Chip>
            <ConferenceStatusIndicator
              isActive={activeConferenceId !== null}
              participantCount={conferenceParticipants.size}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button as={Link} href="/reception" variant="flat">
            Réception
          </Button>
          <Button as={Link} href="/gallery" variant="flat">
            Galerie
          </Button>
        </div>
      </div>

      {error && (
        <Card>
          <CardBody className="text-sm text-danger">{error}</CardBody>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        {/* Chat */}
        <Card className="h-[560px]">
          <CardHeader className="flex items-center justify-between">
            <div className="font-semibold">Messages</div>
            <div className="text-xs opacity-70">Connecté en tant que {profile.pseudo}</div>
          </CardHeader>
          <Divider />
          <CardBody className="flex h-full flex-col gap-3">
            <ScrollShadow className="flex-1 pr-2">
              <div className="space-y-3 max-h-[400px] overflow-y-auto px-1">
                {messages.map((m) => {
                  if (m.type === "conference-start") {
                    return (
                      <ConferenceMessage
                        key={m.id}
                        conferenceId={m.conferenceId!}
                        initiatorPseudo={m.pseudo}
                        isCurrentUserInConference={activeConferenceId === m.conferenceId}
                        onJoinConference={handleJoinConference}
                        onLeaveConference={handleLeaveConference}
                        isConnecting={isJoiningConference}
                      />
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={`rounded-2xl p-3 text-sm ${
                        m.type === "info"
                          ? "bg-default-100 text-default-600"
                          : m.isMine
                            ? "bg-primary-50 text-primary-900"
                            : "bg-content2"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs opacity-70">
                        <span className="font-semibold">{m.pseudo}</span>
                        <span>{m.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="mt-2">
                        {m.isImage ? (
                          <img src={m.content} alt="Photo partagee" className="max-h-72 rounded-xl object-contain" />
                        ) : (
                          <p className="leading-relaxed">{m.content}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollShadow>

            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <Input
                value={inputValue}
                onValueChange={setInputValue}
                placeholder="Ton message"
                variant="bordered"
                radius="lg"
              />
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelection} />
                <Button type="button" variant="flat">
                  Photo
                </Button>
              </label>
              <Button
                type="submit"
                color="primary"
                isDisabled={!inputValue.trim() || socketStatus !== "connected"}
              >
                Envoyer
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Side: Participants + Conference Controls */}
        <div className="space-y-4">
          {/* Conférence */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="font-semibold">Conférence</div>
              {activeConferenceId && (
                <Chip size="sm" color="danger" variant="flat">
                  Actif
                </Chip>
              )}
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3">
              {!activeConferenceId ? (
                <>
                  <p className="text-sm opacity-70">Aucune conférence en cours</p>
                  <Button
                    color="primary"
                    onPress={handleStartConference}
                    isDisabled={!socketId || isJoiningConference}
                    isLoading={isJoiningConference}
                    fullWidth
                  >
                    Lancer une conférence
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {conferenceParticipants.size} participant{conferenceParticipants.size > 1 ? "s" : ""}
                  </p>
                  <Button
                    color="danger"
                    variant="flat"
                    onPress={() => handleLeaveConference(activeConferenceId)}
                    isDisabled={isJoiningConference}
                    fullWidth
                  >
                    Quitter
                  </Button>
                </>
              )}
            </CardBody>
          </Card>

          {/* Participants */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="font-semibold">Participants</div>
              <Chip size="sm" variant="flat">
                {participants.length}
              </Chip>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3">
              <Input
                value={search}
                onValueChange={setSearch}
                placeholder="Rechercher…"
                variant="bordered"
                radius="lg"
              />

              <ScrollShadow className="max-h-[240px] pr-2">
                <div className="space-y-2">
                  {participants.length === 0 && (
                    <div className="text-sm opacity-70">Tu es seul dans ce salon.</div>
                  )}

                  {participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-2xl bg-content2 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <ParticipantWithConferenceStatus
                          pseudo={p.pseudo}
                          avatar={p.avatar}
                          isInConference={conferenceParticipants.has(p.id)}
                          conferenceParticipantCount={conferenceParticipants.size}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{p.pseudo}</div>
                          <div className="text-xs opacity-60">En ligne</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollShadow>
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}
