"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  useDisclosure,
} from "@heroui/react";

import { useUser } from "@/contexts/user-context";
import { useChat, useCall } from "@/hooks";
import { rememberRoom } from "@/lib/rooms";
import { savePhoto } from "@/lib/photo-storage";
import { loadRoomMessages, addRoomMessage } from "@/lib/message-storage";
import { showNotification } from "@/lib/notifications";
import type { ChatClientInfo, ChatMessage } from "@/lib/socket-client";

import {
  ChatMessageList,
  MessageInput,
  ParticipantsList,
  CallUI,
  type ChatEntry,
} from "@/components/room";

const IMAGE_DATA_PREFIX = /^data:image\//i;

/**
 * Convertit un File en Data URL.
 */
const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unsupported file result"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Génère un ID unique pour un message.
 */
const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Page de salle de chat.
 * Affiche les messages, participants, et interface d'appel.
 */
export default function RoomPage() {
  const params = useParams<{ roomName: string }>();
  const roomName = decodeURIComponent(params?.roomName ?? "general");

  const router = useRouter();
  const { profile, isReady } = useUser();

  // État local
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [callDuration, setCallDuration] = useState(0);

  // Gestion des modales
  const {
    isOpen: isParticipantsOpen,
    onOpen: onParticipantsOpen,
    onOpenChange: onParticipantsOpenChange,
  } = useDisclosure();

  const clientsRef = useRef<Record<string, ChatClientInfo>>({});

  // Redirection si pas de profil
  useEffect(() => {
    if (!isReady) return;
    if (!profile?.pseudo) router.replace("/reception");
  }, [isReady, profile?.pseudo, router]);

  /**
   * Ajoute un message à la liste.
   */
  const appendMessage = useCallback((entry: ChatEntry) => {
    setMessages((prev) => [...prev, entry]);
  }, []);

  /**
   * Hook Chat - Socket.IO
   */
  const {
    status: socketStatus,
    clients,
    socketId,
    participants,
    sendMessage: sendChatMessage,
    sendPeerSignal: sendChatPeerSignal,
  } = useChat(
    {
      roomName,
      pseudo: profile?.pseudo ?? "",
      avatar: profile?.avatar ?? null,
      clientId: profile?.clientId,
    },
    {
      onStatusChange: (status) => {
        console.debug("[Chat] Status:", status);
      },
      onMessageReceived: (payload: ChatMessage) => {
        const author = payload.pseudo ?? "Serveur";
        const isMine = Boolean(
          profile && payload.pseudo === profile.pseudo
        );
        const isImage = typeof payload.content === "string"
          ? IMAGE_DATA_PREFIX.test(payload.content)
          : false;

        const entry: ChatEntry = {
          id: makeId(),
          type: payload.categorie === "INFO" ? "info" : "message",
          pseudo: author,
          content: payload.content,
          date: payload.dateEmis
            ? new Date(payload.dateEmis)
            : new Date(),
          isMine,
          isImage,
        };

        appendMessage(entry);

        // Persiste en localStorage
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

        // Sauvegarde les photos
        if (entry.isImage) {
          try {
            savePhoto(entry.content);
          } catch (photoError) {
            console.warn("[PhotoStorage] Unable to store photo", photoError);
          }
        }

        // Notification si message entrant et page cachée
        if (
          !isMine &&
          entry.type === "message" &&
          typeof document !== "undefined" &&
          document.visibilityState === "hidden"
        ) {
          showNotification({
            title: `${author} (#${roomName})`,
            body: entry.isImage
              ? "Photo partagee"
              : entry.content.slice(0, 80),
            icon: "/images/icons/Logo-192x192.png",
            url: `/room/${encodeURIComponent(roomName)}`,
            vibrate: [120, 60, 120],
          });
        }
      },
      onClientsChanged: (newClients) => {
        clientsRef.current = newClients;
      },
      onUserDisconnected: (id, pseudo) => {
        appendMessage({
          id: makeId(),
          type: "info",
          pseudo: pseudo ?? "Serveur",
          content: `${pseudo ?? "Un utilisateur"} a quitte la room`,
          date: new Date(),
          isMine: false,
          isImage: false,
        });

        // Raccroche si l'appel était avec cette personne
        if (
          callState.phase === "active" &&
          callState.peerId === id
        ) {
          hangup();
        }
      },
      onPeerSignal: (fromId, fromPseudo, signal) => {
        const pseudoGuess =
          fromPseudo ?? clientsRef.current[fromId]?.pseudo ?? "Inconnu";
        const videoEnabled =
          signal &&
          typeof signal === "object" &&
          "videoEnabled" in signal
            ? (signal as any).videoEnabled
            : false;
        handleIncomingSignal(fromId, pseudoGuess, signal, videoEnabled);
      },
      onError: (message) => {
        console.error("[Chat]", message);
        setError(message);
      },
    }
  );

  /**
   * Hook Call - WebRTC
   */
  const {
    callState,
    remoteStream,
    startCall: startPeerCall,
    acceptCall: acceptPeerCall,
    rejectCall: rejectPeerCall,
    hangup,
    handleIncomingSignal,
  } = useCall({
    onError: (e) => {
      console.error("[Call]", e);
      setError(typeof e === "string" ? e : "Erreur appel audio");
    },
  });

  // Chronomètre d'appel
  useEffect(() => {
    if (callState.phase !== "active") {
      setCallDuration(0);
      return;
    }

    const timer = window.setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [callState.phase]);

  // Charge les messages depuis le localStorage au démarrage
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

  /**
   * Envoie un message texte.
   */
  const handleSendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      sendChatMessage(trimmed);
    },
    [sendChatMessage]
  );

  /**
   * Gère la soumission du formulaire.
   */
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleSendMessage(inputValue);
      setInputValue("");
    },
    [handleSendMessage, inputValue]
  );

  /**
   * Gère la sélection d'une photo.
   */
  const handlePhotoSelected = useCallback(
    async (file: File) => {
      try {
        const dataUrl = await toDataUrl(file);
        savePhoto(dataUrl);
        handleSendMessage(dataUrl);
        setError(null);
      } catch (e) {
        console.error(e);
        setError("Impossible d'envoyer la photo.");
      }
    },
    [handleSendMessage]
  );

  /**
   * Démarre un appel.
   */
  const startCall = useCallback(
    async (client: ChatClientInfo, videoEnabled: boolean = false) => {
      if (!client?.id) {
        setError("Impossible d'appeler: id manquant");
        return;
      }
      setError(null);

      await startPeerCall(client.id, client.pseudo, (signal) => {
        const payload: any =
          typeof signal === "object" && signal !== null
            ? { ...signal }
            : { signal };
        payload.videoEnabled = videoEnabled;
        sendChatPeerSignal(client.id, payload);
      }, videoEnabled);
    },
    [sendChatPeerSignal, startPeerCall]
  );

  /**
   * Accepte un appel entrant.
   */
  const acceptCall = useCallback(
    async (fromId: string, fromPseudo: string, videoEnabled: boolean = false) => {
      setError(null);
      await acceptPeerCall(fromId, fromPseudo, (signal) => {
        const payload: any =
          typeof signal === "object" && signal !== null
            ? { ...signal }
            : { signal };
        payload.videoEnabled = videoEnabled;
        sendChatPeerSignal(fromId, payload);
      }, videoEnabled);
    },
    [acceptPeerCall, sendChatPeerSignal]
  );

  /**
   * Rejette un appel entrant.
   */
  const rejectCall = useCallback(() => {
    if (callState.phase !== "incoming") return;
    sendChatPeerSignal(callState.fromId, { type: "reject" });
    rejectPeerCall();
  }, [callState, sendChatPeerSignal, rejectPeerCall]);

  /**
   * Raccroche l'appel.
   */
  const stopCall = useCallback(() => {
    if (callState.phase === "active") {
      sendChatPeerSignal(callState.peerId, { type: "hangup" });
    }
    if (callState.phase === "dialing") {
      sendChatPeerSignal(callState.targetId, { type: "hangup" });
    }
    hangup();
  }, [callState, sendChatPeerSignal, hangup]);

  if (!profile?.pseudo) return null;

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
              <Chip
                size="sm"
                color={
                  callState.phase === "active" ? "success" : "warning"
                }
                variant="flat"
              >
                Appel: {callState.phase}{" "}
                {(callState as any).videoEnabled ? "📹" : "☎️"}
              </Chip>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            color="primary"
            onPress={onParticipantsOpen}
            variant="flat"
          >
            Participants ({participants.length})
          </Button>
          <Button as={Link} href="/reception" variant="flat">
            Réception
          </Button>
          <Button as={Link} href="/gallery" variant="flat">
            Galerie
          </Button>
        </div>
      </div>

      {/* Erreurs */}
      {error && (
        <Card>
          <CardBody className="text-sm text-danger">{error}</CardBody>
        </Card>
      )}

      {/* Chat */}
      <Card className="h-[calc(100vh-250px)]">
        <CardHeader className="flex items-center justify-between">
          <div className="font-semibold">Messages</div>
          <div className="text-xs opacity-70">
            Connecté en tant que {profile.pseudo}
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="flex h-full flex-col gap-3">
          <ChatMessageList messages={messages} />

          <MessageInput
            value={inputValue}
            onValueChange={setInputValue}
            onSubmit={handleSendMessage}
            onPhotoSelected={handlePhotoSelected}
            disabled={socketStatus !== "connected"}
            placeholder="Ton message"
          />
        </CardBody>
      </Card>

      {/* Interface d'appel */}
      <CallUI
        callState={callState}
        remoteStream={remoteStream}
        onAcceptCall={() => {
          if (callState.phase !== "incoming") return;
          acceptCall(
            callState.fromId,
            callState.fromPseudo,
            callState.videoEnabled
          );
        }}
        onRejectCall={rejectCall}
        onHangup={stopCall}
        callDuration={callDuration}
      />

      {/* Participants Modal */}
      <ParticipantsList
        participants={participants}
        onCallParticipant={(id, pseudo) => {
          const client = clients[id];
          if (client) {
            startCall(client, false);
          }
        }}
        isOpen={isParticipantsOpen}
        onOpenChange={onParticipantsOpenChange}
        searchValue={search}
        onSearchChange={setSearch}
      />
    </div>
  );
}
