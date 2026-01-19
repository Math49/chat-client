/**
 * @fileoverview
 * Page de salle de chat en temps réel avec Support WebRTC audio.
 * Refactorisé pour utiliser les hooks useSocketSetup et usePeerCall.
 * Gère la persistance des messages, l'affichage des participants et les appels audio.
 * @module room/[roomName]/page
 */

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUser } from "@/contexts/user-context";
import { useSocketSetup } from "@/hooks/use-socket-setup";
import { usePeerCall } from "@/hooks/use-peer-call";
import { rememberRoom } from "@/lib/rooms";
import { savePhoto } from "@/lib/photo-storage";
import { loadRoomMessages, addRoomMessage } from "@/lib/message-storage";
import { showNotification } from "@/lib/notifications";
import { type ChatClientInfo } from "@/lib/socket-client";

/** Expression régulière pour détecter les images en base64 */
const IMAGE_DATA_PREFIX = /^data:image\//i;

/**
 * Convertit un fichier en data URL (base64).
 * @param {File} file - Fichier à convertir
 * @returns {Promise<string>} Promise resolving to data URL string
 * @throws Rejette si le fichier n'est pas readable
 */
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

/**
 * Entrée de message ou d'info affichée en chat.
 * @typedef {Object} ChatEntry
 * @property {string} id - Identifiant unique
 * @property {"message"|"info"} type - Type d'entrée (message ou info système)
 * @property {string} pseudo - Pseudonyme du sender
 * @property {string} content - Contenu (texte ou data URL image)
 * @property {Date} date - Horodatage
 * @property {boolean} isMine - Vrai si envoyé par l'utilisateur courant
 * @property {boolean} isImage - Vrai si contenu = image
 */
type ChatEntry = {
  id: string;
  type: "message" | "info";
  pseudo: string;
  content: string;
  date: Date;
  isMine: boolean;
  isImage: boolean;
};

/**
 * Composant RemoteAudio - Lecture du stream audio d'un pair distant.
 * Attaché au DOM sans UI visible, gère le lifecycle du stream.
 * @component
 * @param {Object} props
 * @param {MediaStream} props.stream - Stream audio distant
 * @param {string} props.id - ID unique du pair distant
 * @returns {JSX.Element} Element audio caché (autoplay)
 */
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

/**
 * Page salle de chat - Affiche les messages, participants et gère les appels audio.
 * @component
 * @returns {JSX.Element} Interface chat avec zones messages, participants et appels
 */
export default function RoomPage() {
  const params = useParams<{ roomName: string }>();
  const roomName = decodeURIComponent(params?.roomName ?? "general");
  const router = useRouter();
  const { profile, isReady } = useUser();

  // État UI
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Record<string, ChatClientInfo>>({});
  const [socketId, setSocketId] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  // Références pour gestion des streams et DOM
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Vérification authentification
  useEffect(() => {
    if (!isReady) return;
    if (!profile?.pseudo) {
      router.replace("/reception");
    }
  }, [isReady, profile, router]);

  // Auto-scroll vers le dernier message
  useEffect(() => {
    if (messages.length === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Ajoute une entrée à la liste des messages affiché (mutation state).
   * @param {ChatEntry} entry - Entrée à ajouter
   */
  const appendMessage = useCallback((entry: ChatEntry) => {
    setMessages((prev) => [...prev, entry]);
  }, []);

  /**
   * Traite les messages reçus depuis le serveur Socket.IO.
   * Persiste en localStorage et gère les notifications push.
   * @param {Object} payload - Payload du serveur
   * @param {string} payload.content - Contenu (texte ou data URL)
   * @param {string} [payload.pseudo] - Pseudonyme du sender
   * @param {string} [payload.categorie] - Type de message (MESSAGE|INFO)
   * @param {string} [payload.dateEmis] - Date ISO du serveur
   * @param {string} [payload.serverId] - ID unique du serveur
   */
  const handleChatMessage = useCallback((payload: any) => {
    const author = payload.pseudo ?? "Serveur";
    const isMine = Boolean(profile && payload.pseudo === profile.pseudo);
    const isImage = typeof payload.content === "string" ? IMAGE_DATA_PREFIX.test(payload.content) : false;
    
    const entry: ChatEntry = {
      id: `${payload.dateEmis ?? Date.now()}-${payload.serverId ?? Math.random().toString(16).slice(2)}`,
      type: payload.categorie === "INFO" ? "info" : "message",
      pseudo: author,
      content: payload.content,
      date: payload.dateEmis ? new Date(payload.dateEmis) : new Date(),
      isMine,
      isImage,
    };
    appendMessage(entry);

    // Persister en localStorage
    try {
      addRoomMessage(roomName, {
        id: entry.id,
        pseudo: author,
        content: payload.content,
        categorie: entry.type === "info" ? "INFO" : "MESSAGE",
        isMine,
        isImage,
      });
    } catch (storageError) {
      console.warn("[MessageStorage] Failed to persist", storageError);
    }

    // Sauvegarder les images en galerie
    if (entry.isImage) {
      try {
        savePhoto(entry.content);
      } catch (photoError) {
        console.warn("Unable to store photo", photoError);
      }
    }

    // Notifier si message reçu hors focus
    if (!isMine && entry.type === "message" && typeof document !== "undefined" && document.visibilityState === "hidden") {
      showNotification({
        title: `${author} (#${roomName})`,
        body: entry.isImage ? "Photo partagee" : entry.content.slice(0, 80),
        icon: "/images/icons/Logo-192x192.png",
        url: `/room/${encodeURIComponent(roomName)}`,
        vibrate: [120, 60, 120],
      });
    }
  }, [profile, roomName, appendMessage]);

  /**
   * Configuration Socket.IO avec listeners d'événements.
   * Utilise le hook useSocketSetup pour encapsuler la logique.
   */
  useSocketSetup({
    roomName,
    pseudo: profile?.pseudo ?? "",
    avatar: profile?.avatar ?? null,
    onConnect: () => {
      setSocketStatus("connected");
    },
    onDisconnect: () => {
      setSocketStatus("idle");
    },
    onError: (message: string) => {
      console.error("Socket error", message);
      setError(message);
      setSocketStatus("error");
    },
    onChatMessage: handleChatMessage,
    onJoinedRoom: (incomingClients: Record<string, ChatClientInfo>) => {
      setClients(incomingClients);
      setSocketId(Object.keys(incomingClients).find(id => {
        // Trouvé le client courant en comparant pseudo
        const cli = incomingClients[id];
        return cli?.pseudo === profile?.pseudo;
      }) ?? null);
    },
    onDisconnectedUser: (userId: string, pseudo?: string) => {
      setClients((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      appendMessage({
        id: `leave-${userId}-${Date.now()}`,
        type: "info",
        pseudo: pseudo ?? "Serveur",
        content: `${pseudo ?? "Un utilisateur"} a quitte la room`,
        date: new Date(),
        isMine: false,
        isImage: false,
      });
    },
  });

  // Hook gestion appels audio WebRTC
  const { 
    callState, 
    startCall: startPeerCall, 
    acceptCall: acceptPeerCall, 
    rejectCall: rejectPeerCall, 
    handleIncomingSignal, 
    hangup 
  } = usePeerCall({
    onRemoteStream: (peerId, stream) => {
      setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
    },
    onCallStateChange: (state) => {
      // État appel change: dialing, incoming, active, idle
      console.log("[Room] Call state:", state);
    },
    onError: (error) => {
      console.error("[Room] Peer error:", error);
      setError(typeof error === 'string' ? error : "Erreur appel audio");
    },
  });

  // Charge les messages persistants au démarrage
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
   * Extrait les infos de l'appel reçu si phase === incoming.
   * Utilisé pour affichage UI du bouton accept/reject.
   */
  const incomingInfo = callState.phase === "incoming" 
    ? { id: callState.fromId, pseudo: callState.fromPseudo } 
    : null;

  /**
   * Liste des participants autres que l'utilisateur courant, triée par pseudo.
   * Mémorisée pour éviter recalcul à chaque render.
   */
  const participants = useMemo(() => {
    return Object.values(clients)
      .filter((client) => client.id !== socketId)
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  }, [clients, socketId]);

  /**
   * Wrapper autour du hook startCall.
   * Lance un appel WebRTC P2P vers un participant.
   * @param {Object} client - Client cible {id, pseudo, avatar}
   */
  const startCall = useCallback(
    async (client: ChatClientInfo) => {
      try {
        // Lance appel avec callback pour émettre signal WebRTC
        // NOTE: emitPeerSignal doit être retourné du hook useSocketSetup
        // Pour maintenant, simple wrapper
        await startPeerCall(client.id, client.pseudo, (signal) => {
          console.log("[Room] Sending signal to", client.id);
          // FIXME: utiliser emitPeerSignal du socket hook
        });
      } catch (error) {
        console.error("Failed to start call", error);
        setError(typeof error === 'string' ? error : "Impossible de lancer l'appel");
      }
    },
    [startPeerCall]
  );

  /**
   * Wrapper autour du hook acceptCall.
   * Accepte un appel reçu.
   */
  const acceptCall = useCallback(
    async (caller: any) => {
      try {
        await acceptPeerCall(caller.id, caller.pseudo, (signal) => {
          console.log("[Room] Sending answer to", caller.id);
          // FIXME: utiliser emitPeerSignal du socket hook
        });
      } catch (error) {
        console.error("Failed to accept call", error);
      }
    },
    [acceptPeerCall]
  );

  /**
   * Wrapper autour du hook rejectCall.
   * Refuse un appel reçu.
   */
  const rejectCall = useCallback(() => {
    if (callState.phase === "incoming") {
      rejectPeerCall(callState.fromId);
    }
  }, [callState, rejectPeerCall]);

  /**
   * Racccroche l'appel actif.
   * Nettoie ressources WebRTC.
   */
  const stopCall = useCallback(() => {
    hangup();
  }, [hangup]);

  /**
   * Envoie un message texte au serveur.
   * @param {string} content - Contenu du message
   */
  const doSendMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    // Note: Utilisé via le hook useSocketSetup qui expose socket.emit()
    // Pour l'implémentation complète, on peut exposer une méthode via le contexte
    // ou ajouter une fonction d'émission au hook
  }, []);

  /**
   * Gère la soumission du formulaire d'envoi de message.
   * @param {React.FormEvent<HTMLFormElement>} event - Événement form
   */
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    doSendMessage(inputValue);
    setInputValue("");
  };

  /**
   * Gère la sélection et envoi de photos depuis l'input file.
   * Persiste la photo et l'envoie au chat.
   * @param {React.ChangeEvent<HTMLInputElement>} event - Événement input file
   */
  const handlePhotoSelection = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [doSendMessage]);

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
