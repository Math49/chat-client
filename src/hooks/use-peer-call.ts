"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SimplePeer, { type Instance as SimplePeerInstance } from "simple-peer";

export type CallState =
  | { phase: "idle" }
  | { phase: "dialing"; targetId: string; targetPseudo: string; startedAt: number; videoEnabled: boolean }
  | { phase: "incoming"; fromId: string; fromPseudo: string; videoEnabled: boolean }
  | { phase: "active"; peerId: string; peerPseudo: string; videoEnabled: boolean };

export interface UsePeerCallConfig {
  onCallStateChange?: (state: CallState) => void;
  onError?: (error: Error | string | unknown) => void;
}

type SignalEmitter = (signal: unknown) => void;

type ControlSignal = { type: "reject" } | { type: "hangup" };

const isControlSignal = (s: unknown): s is ControlSignal => {
  return !!s && typeof s === "object" && "type" in s && ((s as any).type === "reject" || (s as any).type === "hangup");
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function usePeerCall(config: UsePeerCallConfig = {}) {
  const onCallStateChangeRef = useRef(config.onCallStateChange);
  const onErrorRef = useRef(config.onError);

  useEffect(() => {
    onCallStateChangeRef.current = config.onCallStateChange;
    onErrorRef.current = config.onError;
  }, [config.onCallStateChange, config.onError]);

  const [callState, setCallState] = useState<CallState>({ phase: "idle" });
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<SimplePeerInstance | null>(null);
  const peerMetaRef = useRef<{ id: string; pseudo: string; onSignal: SignalEmitter; videoEnabled: boolean } | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);

  // Buffer de signaux reçus avant que le peer soit prêt (offer/candidates/answer)
  const pendingSignalsRef = useRef<Map<string, unknown[]>>(new Map());

  const setStateSafe = useCallback((state: CallState) => {
    setCallState(state);
    onCallStateChangeRef.current?.(state);
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

  const ensureLocalStreamWithVideo = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
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

  const destroyPeer = useCallback(
    (opts?: { keepLocalStream?: boolean }) => {
      const peer = peerRef.current;
      peerRef.current = null;
      peerMetaRef.current = null;

      try {
        peer?.destroy();
      } catch {
        // ignore
      }

      pendingSignalsRef.current.clear();
      setRemoteStream(null);

      if (!opts?.keepLocalStream) cleanupLocalStream();

      setStateSafe({ phase: "idle" });
    },
    [cleanupLocalStream, setStateSafe]
  );

  const flushPendingSignals = useCallback((peerId: string) => {
    const peer = peerRef.current;
    if (!peer) return;

    const queued = pendingSignalsRef.current.get(peerId);
    if (!queued || queued.length === 0) return;

    queued.forEach((s) => {
      try {
        peer.signal(s as any);
      } catch (e) {
        onErrorRef.current?.(e);
      }
    });

    pendingSignalsRef.current.delete(peerId);
  }, []);

  const createPeer = useCallback(
    async (peerId: string, peerPseudo: string, initiator: boolean, onSignal: SignalEmitter, videoEnabled: boolean = false) => {
      if (peerRef.current) return; // 1 appel à la fois

      const localStream = videoEnabled ? await ensureLocalStreamWithVideo() : await ensureLocalStream();

      const peer = new SimplePeer({
        initiator,
        trickle: true, // ✅ IMPORTANT : envoie des CANDIDATE
        stream: localStream,
        config: { iceServers: ICE_SERVERS },
      });

      peerRef.current = peer;
      peerMetaRef.current = { id: peerId, pseudo: peerPseudo, onSignal, videoEnabled };

      peer.on("signal", (signal) => {
        // signal = offer / answer / candidate (selon trickle)
        try {
          onSignal(signal);
        } catch (e) {
          onErrorRef.current?.(e);
        }
      });

      peer.on("stream", (_remoteStream) => {
        // En audio-only, "stream" arrive quand la connexion est ok
        setRemoteStream(_remoteStream);
        setStateSafe({ phase: "active", peerId, peerPseudo, videoEnabled });
      });

      peer.on("close", () => {
        destroyPeer({ keepLocalStream: false });
      });

      peer.on("error", (err) => {
        onErrorRef.current?.(err);
        destroyPeer({ keepLocalStream: false });
      });

      // Si on a déjà reçu offer/candidates en avance
      flushPendingSignals(peerId);
    },
    [destroyPeer, ensureLocalStream, ensureLocalStreamWithVideo, flushPendingSignals, setStateSafe]
  );

  const startCall = useCallback(
    async (targetId: string, targetPseudo: string, onSignal: SignalEmitter, videoEnabled: boolean = false) => {
      if (peerRef.current) {
        onErrorRef.current?.("Un appel est déjà en cours");
        return;
      }

      setStateSafe({ phase: "dialing", targetId, targetPseudo, startedAt: Date.now(), videoEnabled });
      await createPeer(targetId, targetPseudo, true, onSignal, videoEnabled);
    },
    [createPeer, setStateSafe]
  );

  const acceptCall = useCallback(
    async (fromId: string, fromPseudo: string, onSignal: SignalEmitter, videoEnabled: boolean = false) => {
      if (peerRef.current) {
        onErrorRef.current?.("Un appel est déjà en cours");
        return;
      }
      // On garde incoming jusqu'à ce que "stream" arrive => passe active
      await createPeer(fromId, fromPseudo, false, onSignal, videoEnabled);
      flushPendingSignals(fromId);
    },
    [createPeer, flushPendingSignals]
  );

  const rejectCall = useCallback(
    (fromId: string) => {
      pendingSignalsRef.current.delete(fromId);
      setStateSafe({ phase: "idle" });
    },
    [setStateSafe]
  );

  const handleIncomingSignal = useCallback(
    (fromId: string, fromPseudo: string, signal: unknown, videoEnabled: boolean = false) => {
      // Gestion des signaux de contrôle attendus
      if (isControlSignal(signal)) {
        if (signal.type === "reject") {
          destroyPeer({ keepLocalStream: false });
          onErrorRef.current?.("Appel refusé");
          return;
        }
        if (signal.type === "hangup") {
          destroyPeer({ keepLocalStream: false });
          onErrorRef.current?.("Appel terminé");
          return;
        }
      }

      // Si un peer existe déjà pour ce fromId => forward direct
      if (peerMetaRef.current?.id === fromId && peerRef.current) {
        try {
          peerRef.current.signal(signal as any);
        } catch (e) {
          onErrorRef.current?.(e);
        }
        return;
      }

      // Sinon on buffer
      const q = pendingSignalsRef.current.get(fromId) ?? [];
      q.push(signal);
      pendingSignalsRef.current.set(fromId, q);

      // Si on est en train d’appeler quelqu’un d’autre, on ignore l’incoming UI
      if (callState.phase === "dialing" && callState.targetId !== fromId) return;
      if (callState.phase === "active") return;

      // Passe en incoming si nécessaire
      if (callState.phase !== "incoming" || callState.fromId !== fromId) {
        setStateSafe({ phase: "incoming", fromId, fromPseudo, videoEnabled: false });
      }
    },
    [callState, destroyPeer, setStateSafe]
  );

  // Timeout dialing
  useEffect(() => {
    if (callState.phase !== "dialing") return;

    const timer = window.setTimeout(() => {
      destroyPeer({ keepLocalStream: false });
      onErrorRef.current?.("Aucune réponse (timeout)");
    }, 30_000);

    return () => window.clearTimeout(timer);
  }, [callState, destroyPeer]);

  const hangup = useCallback(() => {
    destroyPeer({ keepLocalStream: false });
  }, [destroyPeer]);

  return {
    callState,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    handleIncomingSignal,
    hangup,
  };
}
