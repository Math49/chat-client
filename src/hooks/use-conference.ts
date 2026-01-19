"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SimplePeer, { type Instance as SimplePeerInstance } from "simple-peer";

/**
 * Représente l'état d'un participant en conférence
 */
export interface ConferencePeer {
  id: string;
  pseudo: string;
  stream: MediaStream | null;
  isActive: boolean;
}

/**
 * État global de la conférence
 */
export type ConferenceState =
  | { phase: "idle" }
  | { phase: "initiating" } // On lance la conférence
  | { phase: "active"; conferenceId: string; peers: ConferencePeer[] };

export interface UseConferenceConfig {
  onConferenceStateChange?: (state: ConferenceState) => void;
  onError?: (error: Error | string | unknown) => void;
  onStreamAvailable?: (peerId: string, stream: MediaStream) => void;
  onStreamRemoved?: (peerId: string) => void;
}

type SignalEmitter = (targetId: string, signal: unknown) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useConference(config: UseConferenceConfig = {}) {
  const onStateChangeRef = useRef(config.onConferenceStateChange);
  const onErrorRef = useRef(config.onError);
  const onStreamAvailableRef = useRef(config.onStreamAvailable);
  const onStreamRemovedRef = useRef(config.onStreamRemoved);

  useEffect(() => {
    onStateChangeRef.current = config.onConferenceStateChange;
    onErrorRef.current = config.onError;
    onStreamAvailableRef.current = config.onStreamAvailable;
    onStreamRemovedRef.current = config.onStreamRemoved;
  }, [config]);

  const [conferenceState, setConferenceState] = useState<ConferenceState>({ phase: "idle" });

  // Map des pairs actifs: peerId -> { peer, meta }
  const peersRef = useRef<
    Map<
      string,
      {
        peer: SimplePeerInstance;
        pseudo: string;
        stream: MediaStream | null;
      }
    >
  >(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  const conferenceIdRef = useRef<string | null>(null);
  const signalEmitterRef = useRef<SignalEmitter | null>(null);

  // Buffers de signaux reçus avant que le peer soit prêt
  const pendingSignalsRef = useRef<Map<string, unknown[]>>(new Map());

  const setStateSafe = useCallback((state: ConferenceState) => {
    setConferenceState(state);
    onStateChangeRef.current?.(state);
  }, []);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (e) {
      onErrorRef.current?.(e);
      throw e;
    }
  }, []);

  const cleanupLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, []);

  const destroyPeer = useCallback((peerId: string) => {
    const peerData = peersRef.current.get(peerId);
    if (!peerData) return;

    try {
      peerData.peer.destroy();
    } catch {
      // ignore
    }

    peersRef.current.delete(peerId);
    pendingSignalsRef.current.delete(peerId);

    if (peerData.stream) {
      peerData.stream.getTracks().forEach((t) => t.stop());
      onStreamRemovedRef.current?.(peerId);
    }
  }, []);

  const destroyAllPeers = useCallback(() => {
    peersRef.current.forEach((_, peerId) => {
      destroyPeer(peerId);
    });
    peersRef.current.clear();
    pendingSignalsRef.current.clear();
    cleanupLocalStream();
  }, [cleanupLocalStream, destroyPeer]);

  const flushPendingSignals = useCallback((peerId: string) => {
    const peerData = peersRef.current.get(peerId);
    if (!peerData) return;

    const queued = pendingSignalsRef.current.get(peerId);
    if (!queued || queued.length === 0) return;

    queued.forEach((s) => {
      try {
        peerData.peer.signal(s as any);
      } catch (e) {
        onErrorRef.current?.(e);
      }
    });

    pendingSignalsRef.current.delete(peerId);
  }, []);

  /**
   * Crée une connexion peer-to-peer avec un participant distant
   */
  const connectToPeer = useCallback(
    async (peerId: string, peerPseudo: string, initiator: boolean) => {
      if (peersRef.current.has(peerId)) {
        console.warn(`[Conference] Peer ${peerId} déjà connecté`);
        return;
      }

      const localStream = await ensureLocalStream();

      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream: localStream,
        config: { iceServers: ICE_SERVERS },
      });

      const peerData = { peer, pseudo: peerPseudo, stream: null as MediaStream | null };
      peersRef.current.set(peerId, peerData);

      peer.on("signal", (signal) => {
        try {
          signalEmitterRef.current?.(peerId, signal);
        } catch (e) {
          onErrorRef.current?.(e);
        }
      });

      peer.on("stream", (_remoteStream) => {
        peerData.stream = _remoteStream;
        onStreamAvailableRef.current?.(peerId, _remoteStream);
      });

      peer.on("close", () => {
        destroyPeer(peerId);
      });

      peer.on("error", (err) => {
        onErrorRef.current?.(err);
        destroyPeer(peerId);
      });

      flushPendingSignals(peerId);
    },
    [destroyPeer, ensureLocalStream, flushPendingSignals]
  );

  /**
   * Lance une conférence (crée un ID unique)
   */
  const startConference = useCallback(
    async (emitSignal: SignalEmitter): Promise<string> => {
      if (conferenceState.phase !== "idle") {
        throw new Error("Une conférence est déjà en cours");
      }

      setStateSafe({ phase: "initiating" });

      try {
        await ensureLocalStream();
        signalEmitterRef.current = emitSignal;

        // Générer un ID de conférence unique
        const conferenceId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `conf-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        conferenceIdRef.current = conferenceId;
        setStateSafe({ phase: "active", conferenceId, peers: [] });

        return conferenceId;
      } catch (e) {
        setStateSafe({ phase: "idle" });
        throw e;
      }
    },
    [conferenceState.phase, ensureLocalStream, setStateSafe]
  );

  /**
   * Rejoindre une conférence existante
   */
  const joinConference = useCallback(
    async (conferenceId: string, emitSignal: SignalEmitter): Promise<void> => {
      if (conferenceState.phase !== "idle") {
        throw new Error("Une conférence est déjà en cours");
      }

      setStateSafe({ phase: "initiating" });

      try {
        await ensureLocalStream();
        signalEmitterRef.current = emitSignal;
        conferenceIdRef.current = conferenceId;
        setStateSafe({ phase: "active", conferenceId, peers: [] });
      } catch (e) {
        setStateSafe({ phase: "idle" });
        throw e;
      }
    },
    [conferenceState.phase, ensureLocalStream, setStateSafe]
  );

  /**
   * Quitter la conférence
   */
  const leaveConference = useCallback(() => {
    destroyAllPeers();
    conferenceIdRef.current = null;
    setStateSafe({ phase: "idle" });
  }, [destroyAllPeers, setStateSafe]);

  /**
   * Traiter un signal entrant d'un participant
   */
  const handleIncomingSignal = useCallback(
    async (
      fromId: string,
      fromPseudo: string,
      signal: unknown,
      isInitiator: boolean
    ) => {
      // Si on a déjà un peer avec cet ID
      if (peersRef.current.has(fromId)) {
        const peerData = peersRef.current.get(fromId);
        if (peerData) {
          try {
            peerData.peer.signal(signal as any);
          } catch (e) {
            onErrorRef.current?.(e);
          }
        }
        return;
      }

      // Buffer le signal
      const queued = pendingSignalsRef.current.get(fromId) ?? [];
      queued.push(signal);
      pendingSignalsRef.current.set(fromId, queued);

      // Créer le peer si on ne l'avait pas encore
      // On détermine initiator selon le rôle dans la conférence
      // Les anciens participants (isInitiator=false) acceptent les offers
      await connectToPeer(fromId, fromPseudo, isInitiator);
    },
    [connectToPeer]
  );

  /**
   * Ajouter manuellement un participant (appel du serveur)
   * Utile quand on rejoint une conférence existante
   */
  const addParticipant = useCallback(
    async (peerId: string, peerPseudo: string) => {
      if (peersRef.current.has(peerId) || conferenceState.phase !== "active") {
        return;
      }

      // Toujours initiator=false quand on les ajoute (le serveur les envoie)
      await connectToPeer(peerId, peerPseudo, false);
    },
    [connectToPeer, conferenceState.phase]
  );

  /**
   * Supprimer un participant (déconnexion)
   */
  const removeParticipant = useCallback(
    (peerId: string) => {
      destroyPeer(peerId);
    },
    [destroyPeer]
  );

  /**
   * Obtenir l'état actuel des participants
   */
  const getPeers = useCallback((): ConferencePeer[] => {
    return Array.from(peersRef.current.entries()).map(([id, data]) => ({
      id,
      pseudo: data.pseudo,
      stream: data.stream,
      isActive: data.stream !== null,
    }));
  }, []);

  return {
    conferenceState,
    startConference,
    joinConference,
    leaveConference,
    handleIncomingSignal,
    addParticipant,
    removeParticipant,
    getPeers,
  };
}
