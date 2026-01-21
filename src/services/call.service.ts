/**
 * @fileoverview Service de gestion des appels WebRTC.
 * Encapsule la logique SimplePeer et la signalisation.
 * Indépendant de React - peut être testé unitairement.
 * 
 * @module services/call.service
 */

import SimplePeer, { type Instance as SimplePeerInstance } from "simple-peer";

/**
 * État d'un appel en cours.
 */
export type CallPhase =
  | "idle"
  | "dialing" // Appel sortant en cours
  | "incoming" // Appel entrant en attente
  | "active"; // Appel établi

/**
 * État détaillé d'un appel.
 */
export type CallState =
  | { phase: "idle" }
  | { phase: "dialing"; targetId: string; targetPseudo: string; startedAt: number; videoEnabled: boolean }
  | { phase: "incoming"; fromId: string; fromPseudo: string; videoEnabled: boolean }
  | { phase: "active"; peerId: string; peerPseudo: string; videoEnabled: boolean };

/**
 * Événements émis par le CallService
 */
export interface CallServiceEvents {
  stateChanged: (state: CallState) => void;
  remoteStreamReceived: (stream: MediaStream) => void;
  remoteStreamEnded: () => void;
  error: (error: Error | string) => void;
}

/**
 * Fonction émetteur de signaux.
 */
type SignalEmitter = (signal: unknown) => void;

/**
 * Signal de contrôle (reject/hangup).
 */
type ControlSignal = { type: "reject" } | { type: "hangup" };

const isControlSignal = (s: unknown): s is ControlSignal => {
  return !!s && typeof s === "object" && "type" in s && ((s as any).type === "reject" || (s as any).type === "hangup");
};

/**
 * Serveurs STUN par défaut pour les candidats ICE.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * Service de gestion des appels WebRTC.
 * Gère la création, destruction, et l'état des connexions peer-to-peer.
 * 
 * Responsabilités:
 * - Gestion du cycle de vie SimplePeer
 * - Gestion des streams audio/vidéo
 * - Buffering des signaux en attente
 * - Notification des changements d'état
 */
export class CallService {
  private peer: SimplePeerInstance | null = null;
  private peerMeta: {
    id: string;
    pseudo: string;
    onSignal: SignalEmitter;
    videoEnabled: boolean;
  } | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callState: CallState = { phase: "idle" };
  private pendingSignals: Map<string, unknown[]> = new Map();
  private listeners: Map<keyof CallServiceEvents, Set<Function>> = new Map();

  constructor() {
    // Initialiser les sets pour chaque événement
    const eventKeys: (keyof CallServiceEvents)[] = ["stateChanged", "remoteStreamReceived", "remoteStreamEnded", "error"];
    eventKeys.forEach((key) => this.listeners.set(key, new Set()));
  }

  /**
   * Obtient l'état d'appel actuel.
   */
  getCallState(): CallState {
    return this.callState;
  }

  /**
   * Obtient le stream distant actuel.
   */
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Démarre un appel sortant vers une cible.
   * 
   * @param targetId ID du destinataire
   * @param targetPseudo Pseudonyme du destinataire
   * @param onSignal Fonction appelée quand un signal doit être envoyé
   * @param videoEnabled Si la vidéo doit être activée
   */
  async startCall(
    targetId: string,
    targetPseudo: string,
    onSignal: SignalEmitter,
    videoEnabled: boolean = false
  ): Promise<void> {
    if (this.peer) {
      this.emit("error", "Un appel est déjà en cours");
      return;
    }

    this.setState({
      phase: "dialing",
      targetId,
      targetPseudo,
      startedAt: Date.now(),
      videoEnabled,
    });

    try {
      await this.createPeer(targetId, targetPseudo, true, onSignal, videoEnabled);
    } catch (error) {
      this.setState({ phase: "idle" });
      throw error;
    }
  }

  /**
   * Accepte un appel entrant.
   * 
   * @param fromId ID de l'appelant
   * @param fromPseudo Pseudonyme de l'appelant
   * @param onSignal Fonction appelée quand un signal doit être envoyé
   * @param videoEnabled Si la vidéo doit être activée
   */
  async acceptCall(
    fromId: string,
    fromPseudo: string,
    onSignal: SignalEmitter,
    videoEnabled: boolean = false
  ): Promise<void> {
    if (this.peer) {
      this.emit("error", "Un appel est déjà en cours");
      return;
    }

    try {
      await this.createPeer(fromId, fromPseudo, false, onSignal, videoEnabled);
      this.flushPendingSignals(fromId);
    } catch (error) {
      this.setState({ phase: "idle" });
      throw error;
    }
  }

  /**
   * Rejette un appel entrant.
   */
  rejectCall(): void {
    this.destroy();
    this.setState({ phase: "idle" });
  }

  /**
   * Raccroche l'appel en cours.
   */
  hangup(): void {
    this.destroy();
    this.setState({ phase: "idle" });
  }

  /**
   * Traite un signal entrant (offer, answer, candidate).
   * Buffer les signaux si le peer n'est pas encore prêt.
   * 
   * @param fromId ID de l'émetteur
   * @param fromPseudo Pseudonyme de l'émetteur
   * @param signal Signal SDP/ICE
   * @param videoEnabled Si la vidéo est activée
   */
  handleIncomingSignal(
    fromId: string,
    fromPseudo: string,
    signal: unknown,
    videoEnabled: boolean = false
  ): void {
    if (isControlSignal(signal)) {
      if (signal.type === "reject" || signal.type === "hangup") {
        this.destroy();
        this.setState({ phase: "idle" });
      }
      return;
    }

    if (!this.peer) {
      // Buffer le signal jusqu'à ce que le peer soit créé
      if (!this.pendingSignals.has(fromId)) {
        this.pendingSignals.set(fromId, []);
      }
      this.pendingSignals.get(fromId)!.push(signal);

      // Si on n'est pas en train de créer un peer, en créer un
      if (this.callState.phase === "idle" || (this.callState.phase === "incoming" && this.callState.fromId === fromId)) {
        if (this.callState.phase === "idle") {
          // Appel entrant
          this.setState({
            phase: "incoming",
            fromId,
            fromPseudo,
            videoEnabled,
          });
        }
        // On attend que l'utilisateur accepte avant de créer le peer
      }
      return;
    }

    try {
      this.peer.signal(signal);
    } catch (error) {
      this.emit("error", error instanceof Error ? error : "Erreur signalisation");
    }
  }

  /**
   * Enregistre un listener pour les changements.
   * 
   * @param event Nom de l'événement
   * @param listener Fonction de callback
   * @returns Fonction de désinscription
   */
  on<K extends keyof CallServiceEvents>(event: K, listener: (...args: any[]) => void): () => void {
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
   * Crée et configure une connexion SimplePeer.
   */
  private async createPeer(
    peerId: string,
    peerPseudo: string,
    initiator: boolean,
    onSignal: SignalEmitter,
    videoEnabled: boolean
  ): Promise<void> {
    if (this.peer) return;

    const localStream = videoEnabled ? await this.ensureLocalStreamWithVideo() : await this.ensureLocalStream();

    this.peer = new SimplePeer({
      initiator,
      trickle: true,
      stream: localStream,
      config: { iceServers: ICE_SERVERS },
    });

    this.peerMeta = { id: peerId, pseudo: peerPseudo, onSignal, videoEnabled };

    this.peer.on("signal", (signal) => {
      try {
        onSignal(signal);
      } catch (error) {
        this.emit("error", error instanceof Error ? error : "Erreur d'émission de signal");
      }
    });

    this.peer.on("stream", (stream) => {
      this.remoteStream = stream;
      this.emit("remoteStreamReceived", stream);
      this.setState({
        phase: "active",
        peerId,
        peerPseudo,
        videoEnabled,
      });
    });

    this.peer.on("close", () => {
      this.destroy({ keepLocalStream: false });
    });

    this.peer.on("error", (err) => {
      this.emit("error", err);
      this.destroy({ keepLocalStream: false });
    });

    this.flushPendingSignals(peerId);
  }

  /**
   * Obtient ou crée le stream audio local.
   */
  private async ensureLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this.localStream = stream;
      return stream;
    } catch (error) {
      this.emit("error", error instanceof Error ? error : "Impossible d'accéder au microphone");
      throw error;
    }
  }

  /**
   * Obtient ou crée le stream audio+vidéo local.
   */
  private async ensureLocalStreamWithVideo(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      this.localStream = stream;
      return stream;
    } catch (error) {
      this.emit("error", error instanceof Error ? error : "Impossible d'accéder à la caméra");
      throw error;
    }
  }

  /**
   * Arrête tous les tracks du stream local.
   */
  private stopLocalStream(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  /**
   * Détruit la connexion peer et nettoie les ressources.
   */
  private destroy(opts?: { keepLocalStream?: boolean }): void {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (error) {
        // Ignorer les erreurs de destruction
      }
      this.peer = null;
    }

    this.peerMeta = null;
    this.remoteStream = null;
    this.pendingSignals.clear();
    this.emit("remoteStreamEnded");

    if (!opts?.keepLocalStream) {
      this.stopLocalStream();
    }
  }

  /**
   * Flushe tous les signaux en attente pour un peer.
   */
  private flushPendingSignals(peerId: string): void {
    const queued = this.pendingSignals.get(peerId);
    if (!queued || queued.length === 0) return;

    queued.forEach((signal) => {
      try {
        this.peer?.signal(signal);
      } catch (error) {
        this.emit("error", error instanceof Error ? error : "Erreur signal");
      }
    });

    this.pendingSignals.delete(peerId);
  }

  /**
   * Change l'état d'appel et notifie les listeners.
   */
  private setState(state: CallState): void {
    this.callState = state;
    this.emit("stateChanged", state);
  }

  /**
   * Émet un événement à tous les listeners.
   */
  private emit<K extends keyof CallServiceEvents>(event: K, ...args: any[]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`[CallService] Error in ${event} listener:`, error);
        }
      });
    }
  }
}

/** Instance singleton du service appel */
export const callService = new CallService();
