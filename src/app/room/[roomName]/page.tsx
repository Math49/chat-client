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
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";

import { useUser } from "@/contexts/user-context";
import { useSocketSetup } from "@/hooks/use-socket-setup";
import { usePeerCall } from "@/hooks/use-peer-call";

import { rememberRoom } from "@/lib/rooms";
import { savePhoto } from "@/lib/photo-storage";
import { loadRoomMessages, addRoomMessage } from "@/lib/message-storage";
import { showNotification } from "@/lib/notifications";
import { type ChatClientInfo, type ChatMessage } from "@/lib/socket-client";

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
  type: "message" | "info";
  pseudo: string;
  content: string;
  date: Date;
  isMine: boolean;
  isImage: boolean;
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
    callState,
    startCall: startPeerCall,
    acceptCall: acceptPeerCall,
    rejectCall: rejectPeerCall,
    handleIncomingSignal,
    hangup,
  } = usePeerCall({
    onError: (e) => {
      console.error("[PeerCall]", e);
      setError(typeof e === "string" ? e : "Erreur appel audio");
    },
  });

  const { status: socketStatus, clients, socketId, emitMessage, emitPeerSignal } = useSocketSetup({
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

    // ✅ Signaux entrants (offer/answer/candidate/reject/hangup)
    onPeerSignal: (fromId, fromPseudo, signal) => {
      const pseudoGuess = fromPseudo ?? clientsRef.current[fromId]?.pseudo ?? "Inconnu";
      handleIncomingSignal(fromId, pseudoGuess, signal);
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

      if (callState.phase === "active" && callState.peerId === id) {
        // l'autre est parti => on raccroche localement
        hangup();
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

  // ✅ participants avec id injecté (Object.entries)
  const participants = useMemo(() => {
    const list = Object.entries(clients)
      .filter(([id]) => id !== socketId)
      .map(([id, c]) => ({ ...c, id } as ChatClientInfo))
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

  // ✅ Call actions alignées sur ton "CallManager"
  const startCall = useCallback(
    async (client: ChatClientInfo) => {
      if (!client?.id) {
        setError("Impossible d'appeler: id manquant");
        return;
      }
      setError(null);

      await startPeerCall(client.id, client.pseudo, (signal) => {
        emitPeerSignal(client.id, signal); // OFFER + CANDIDATE + …
      });
    },
    [emitPeerSignal, startPeerCall]
  );

  const acceptCall = useCallback(
    async (fromId: string, fromPseudo: string) => {
      setError(null);
      await acceptPeerCall(fromId, fromPseudo, (signal) => {
        emitPeerSignal(fromId, signal); // ANSWER + CANDIDATE
      });
    },
    [acceptPeerCall, emitPeerSignal]
  );

  const rejectCall = useCallback(() => {
    if (callState.phase !== "incoming") return;
    // ✅ on envoie REJECT au caller
    emitPeerSignal(callState.fromId, { type: "reject" });
    rejectPeerCall(callState.fromId);
  }, [callState, emitPeerSignal, rejectPeerCall]);

  const stopCall = useCallback(() => {
    // ✅ on envoie HANGUP à l’autre, quel que soit dialing/active
    if (callState.phase === "active") {
      emitPeerSignal(callState.peerId, { type: "hangup" });
    }
    if (callState.phase === "dialing") {
      emitPeerSignal(callState.targetId, { type: "hangup" });
    }
    hangup();
  }, [callState, emitPeerSignal, hangup]);

  if (!profile?.pseudo) return null;

  const incomingInfo = callState.phase === "incoming" ? { id: callState.fromId, pseudo: callState.fromPseudo } : null;

  return (
    <div className="grid gap-4 p-4">
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
            {callState.phase !== "idle" && (
              <Chip size="sm" color={callState.phase === "active" ? "success" : "warning"} variant="flat">
                Appel: {callState.phase}
              </Chip>
            )}
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
          <CardBody className="text-sm text-danger">
            {error}
          </CardBody>
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
                {messages.map((m) => (
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
                ))}
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

        {/* Side: Participants + Call */}
        <div className="space-y-4">
          {/* Participants */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="font-semibold">Participants</div>
              <Chip size="sm" variant="flat">{participants.length}</Chip>
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
                        <Avatar name={p.pseudo} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{p.pseudo}</div>
                          <div className="text-xs opacity-60">En ligne</div>
                        </div>
                      </div>

                      <Dropdown>
                        <DropdownTrigger>
                          <Button size="sm" variant="flat">
                            Actions
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label="participant-actions">
                          <DropdownItem
                            key="call"
                            onPress={() => startCall(p)}
                            isDisabled={callState.phase === "active" || callState.phase === "dialing"}
                          >
                            Appeler (audio)
                          </DropdownItem>
                          <DropdownItem
                            key="tel"
                            as="a"
                            href="tel:+33600000000"
                            description="Exemple — remplace par un numéro réel si tu en as"
                          >
                            Appel téléphone (tel:)
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                  ))}
                </div>
              </ScrollShadow>
            </CardBody>
          </Card>

          {/* Call Status */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="font-semibold">Appel</div>
              <Chip size="sm" color={callState.phase === "active" ? "success" : callState.phase === "idle" ? "default" : "warning"} variant="flat">
                {callState.phase}
              </Chip>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3">
              {callState.phase === "idle" && (
                <div className="text-sm opacity-70">
                  Lance un appel depuis la liste des participants.
                </div>
              )}

              {callState.phase === "dialing" && (
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    Appel vers <span className="font-semibold">{callState.targetPseudo}</span>
                  </div>
                  <Button color="danger" variant="flat" onPress={stopCall}>
                    Annuler
                  </Button>
                </div>
              )}

              {callState.phase === "active" && (
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    En ligne avec <span className="font-semibold">{callState.peerPseudo}</span>
                  </div>
                  <Button color="danger" onPress={stopCall}>
                    Raccrocher
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Incoming call modal */}
      <Modal isOpen={callState.phase === "incoming"} onOpenChange={() => {}}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Appel entrant</ModalHeader>
              <ModalBody>
                <div className="text-sm">
                  {incomingInfo?.pseudo} t’appelle.
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="flat" onPress={rejectCall}>
                  Refuser
                </Button>
                <Button
                  color="success"
                  onPress={() => {
                    if (!incomingInfo) return;
                    acceptCall(incomingInfo.id, incomingInfo.pseudo);
                  }}
                >
                  Répondre
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

    </div>
  );
}
