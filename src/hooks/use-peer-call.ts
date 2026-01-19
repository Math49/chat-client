/**
 * @fileoverview Hook de gestion appels audio WebRTC via SimplePeer.
 * 
 * Gère le cycle complet d'un appel P2P:
 * - Cycle: idle → dialing → active → idle (appel lancé)
 * - Cycle: idle → incoming → active → idle (appel reçu)
 * 
 * Caractéristiques:
 * - Buffering automatique des signaux avant creation du peer
 * - Gestion multi-peers (théoriquement plusieurs appels simultanés)
 * - Cleanup complet des streams et ressources au hangup
 * - Événements de changement d'état pour UI
 * 
 * Architecture:
 * - peersRef: Map<userId, SimplePeer instance>
 * - pendingSignalsRef: Map<userId, signal[] buffered>
 * - localStreamRef: MediaStream unique (partagée entre peers)
 * - remoteStreamsRef: Map<userId, remote MediaStream>
 * 
 * @module hooks/use-peer-call
 */

"use client";

import { useCallback, useRef, useState } from "react";
import SimplePeer, { type Instance as SimplePeerInstance } from "simple-peer";

/**
 * Phases possibles d'un appel.
 * @typedef {string} CallPhase - "idle" | "dialing" | "incoming" | "active"
 */
export type CallPhase = "idle" | "dialing" | "incoming" | "active";

/**
 * État discriminé d'un appel.
 * 
 * Phases:
 * - idle: Aucun appel, prêt pour nouveau
 * - dialing: Appel lancé vers targetId, en attente de réponse
 * - incoming: Appel reçu de fromId, en attente accept/reject
 * - active: Appel actif avec peerId établi
 * 
 * @typedef {Object|Object|Object|Object} CallState
 */
export type CallState =
  | { phase: "idle" }
  | { phase: "dialing"; targetId: string; targetPseudo: string }
  | { phase: "incoming"; fromId: string; fromPseudo: string }
  | { phase: "active"; peerId: string; peerPseudo: string };

/**
 * Configuration callbacks du hook.
 * 
 * @typedef {Object} UsePeerCallConfig
 * @property {Function} [onRemoteStream] - Callback stream reçu (peerId, stream)
 * @property {Function} [onCallStateChange] - Callback changement phase appel
 * @property {Function} [onError] - Callback erreurs WebRTC
 */
export interface UsePeerCallConfig {
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  onCallStateChange?: (state: CallState) => void;
  onError?: (error: Error | unknown) => void;
}


/**
 * Hook gestion appels audio WebRTC (SimplePeer).
 * 
 * Gère l'état de l'appel, création/destruction des peers, et streaming audio.
 * Support multi-peers théorique, usage courant: 1 peer à la fois.
 * 
 * @param {UsePeerCallConfig} config - Callbacks pour événements
 * @returns {Object} API pour contrôler appels
 * @returns {CallState} callState - État courant de l'appel
 * @returns {Record<string, MediaStream>} remoteStreams - Map peerId → stream reçu
 * @returns {Function} startCall - Lancer appel (targetId, targetPseudo, onSignal callback)
 * @returns {Function} acceptCall - Accepter appel reçu (fromId, fromPseudo, onSignal)
 * @returns {Function} rejectCall - Refuser appel reçu (fromId)
 * @returns {Function} handleIncomingSignal - Traiter signal WebRTC entrant
 * @returns {Function} hangup - Raccroche et nettoie toutes ressources
 * @returns {Function} getStats - Retourne stats pour debugging
 * 
 * @example
 * const { callState, startCall, hangup } = usePeerCall({
 *   onRemoteStream: (peerId, stream) => audioRef.current.srcObject = stream,
 *   onCallStateChange: (state) => setStatus(state.phase),
 * });
 * // Lancer un appel
 * await startCall("peer123", "Alice", (signal) => emitPeerSignal("peer123", signal));
 * // Raccrocher
 * hangup();
 */
export function usePeerCall(config: UsePeerCallConfig = {}) {
  // ===== RÉFÉRENCES PERSISTANTES =====

  // Map userId → SimplePeer instance active
  const peersRef = useRef<Map<string, SimplePeerInstance>>(new Map());

  // Map userId → signals en attente (buffering avant peer ready)
  const pendingSignalsRef = useRef<Map<string, unknown[]>>(new Map());

  // MediaStream local (partagée entre tous les peers)
  const localStreamRef = useRef<MediaStream | null>(null);

  // Map userId → remote stream reçu
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});

  // ===== STATE (STATE MANAGEMENT) =====

  // Phase appel courant pour UI
  const [callState, setCallState] = useState<CallState>({ phase: "idle" });

  // Streams reçus (pour React render)
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  // ===== HELPERS =====

  /**
   * Demande accès microphone (getUserMedia) et cache le stream.
   * Idempotent: retourne même stream si déjà obtenu.
   * 
   * @returns {Promise<MediaStream>} Stream audio local
   * @throws {Error} Si permission refusée ou device indisponible
   */
  const ensureLocalStream = useCallback(async (): Promise<MediaStream> => {
    // Retour rapide si stream déjà obtenu
    if (localStreamRef.current) return localStreamRef.current;

    try {
      // Demande accès micro uniquement (pas vidéo)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      // Notifie erreur et throw pour caller
      config.onError?.(error);
      throw error;
    }
  }, [config]);

  /**
   * Configure une connexion SimplePeer avec un utilisateur.
   * 
   * Étapes:
   * 1. Crée instance SimplePeer (initiator = who started call)
   * 2. Attache listeners: signal, stream, close, error
   * 3. Traite signaux en attente (buffering)
   * 4. Stocke peer dans map pour lifecycle management
   * 
   * @param {string} targetId - ID utilisateur peer
   * @param {string} targetPseudo - Pseudo affichage
   * @param {boolean} initiator - true si on lance l'appel
   * @param {Function} onSignal - Callback emit signal WebRTC au serveur
   * @throws {Error} Si getUserMedia échoue
   */
  const setupPeer = useCallback(
    async (targetId: string, targetPseudo: string, initiator: boolean, onSignal: (signal: unknown) => void) => {
      // Évite setup dupliqué (idempotent guard)
      if (peersRef.current.has(targetId)) return;

      // Obtient ou demande stream local
      const stream = await ensureLocalStream();

      // Crée peer SimplePeer avec configuration
      const peer = new SimplePeer({
        initiator, // true = on lance offer, false = on attend answer
        trickle: false, // ice candidates grouped dans offer/answer (simpler)
        stream, // Attach notre stream audio
      });

      // Stocke dans map pour références futures
      peersRef.current.set(targetId, peer);

      // ===== EVENT HANDLERS =====

      // Signal généré: émettre via socket
      peer.on("signal", (signal) => {
        onSignal(signal);
      });

      // Stream reçu du peer: mettre à jour state et callbacks
      peer.on("stream", (remoteStream) => {
        // Cache stream pour cleanup
        remoteStreamsRef.current[targetId] = remoteStream;
        // Met à jour React state (trigger render)
        setRemoteStreams((prev) => ({ ...prev, [targetId]: remoteStream }));
        // Notifie callback (pour UI: attacher à <audio>)
        config.onRemoteStream?.(targetId, remoteStream);
        // Marque appel actif (transition dialing → active)
        setCallState({ phase: "active", peerId: targetId, peerPseudo: targetPseudo });
        config.onCallStateChange?.({ phase: "active", peerId: targetId, peerPseudo: targetPseudo });
      });

      // Connexion fermée: cleanup peer
      peer.on("close", () => {
        // Retire de map
        peersRef.current.delete(targetId);
        
        // Stop tracks du stream reçu
        const currentStream = remoteStreamsRef.current[targetId];
        if (currentStream) {
          currentStream.getTracks().forEach((track) => track.stop());
        }
        
        // Nettoie références
        delete remoteStreamsRef.current[targetId];
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[targetId];
          return next;
        });
        
        // Retour à idle
        setCallState({ phase: "idle" });
        config.onCallStateChange?.({ phase: "idle" });
      });

      // Erreur peer: log et notifie
      peer.on("error", (peerError) => {
        console.error("[PeerCall] Peer error", peerError);
        config.onError?.(peerError);
        peer.destroy();
      });

      // ===== SIGNAL BUFFERING =====
      // Traite les signaux qui arrivaient avant création du peer
      const queued = pendingSignalsRef.current.get(targetId);
      if (queued && queued.length > 0) {
        queued.forEach((signal) => peer.signal(signal));
        pendingSignalsRef.current.delete(targetId);
      }
    },
    [config, ensureLocalStream]
  );

  // ===== PUBLIC API =====

  /**
   * Lance un appel vers un utilisateur.
   * 
   * Étapes:
   * 1. Setup peer avec initiator=true
   * 2. Met état à "dialing"
   * 3. Appel onSignal pour émettre offer via socket
   * 
   * @param {string} targetId - Qui on appelle
   * @param {string} targetPseudo - Son pseudo
   * @param {Function} onSignal - Émettre signal WebRTC au serveur
   * @returns {Promise<void>}
   */
  const startCall = useCallback(
    async (targetId: string, targetPseudo: string, onSignal: (signal: unknown) => void) => {
      try {
        await setupPeer(targetId, targetPseudo, true, onSignal);
        setCallState({ phase: "dialing", targetId, targetPseudo });
        config.onCallStateChange?.({ phase: "dialing", targetId, targetPseudo });
      } catch (error) {
        config.onError?.(error);
        throw error;
      }
    },
    [setupPeer, config]
  );

  /**
   * Accepte un appel entrant.
   * 
   * Étapes:
   * 1. Setup peer avec initiator=false (on attend answer)
   * 2. Met état à "active" (assuming will connect)
   * 3. Appel onSignal pour émettre answer
   * 
   * @param {string} fromId - Qui nous appelle
   * @param {string} fromPseudo - Son pseudo
   * @param {Function} onSignal - Émettre signal WebRTC réponse
   * @returns {Promise<void>}
   */
  const acceptCall = useCallback(
    async (fromId: string, fromPseudo: string, onSignal: (signal: unknown) => void) => {
      try {
        await setupPeer(fromId, fromPseudo, false, onSignal);
        setCallState({ phase: "active", peerId: fromId, peerPseudo: fromPseudo });
        config.onCallStateChange?.({ phase: "active", peerId: fromId, peerPseudo: fromPseudo });
      } catch (error) {
        config.onError?.(error);
        setCallState({ phase: "idle" });
        config.onCallStateChange?.({ phase: "idle" });
        throw error;
      }
    },
    [setupPeer, config]
  );

  /**
   * Refuse un appel entrant.
   * Nettoie buffers signaux et retour à idle.
   */
  const rejectCall = useCallback((fromId: string) => {
    pendingSignalsRef.current.delete(fromId);
    setCallState({ phase: "idle" });
    config.onCallStateChange?.({ phase: "idle" });
  }, [config]);

  /**
   * Traite un signal WebRTC entrant (offer/answer/ice candidate).
   * 
   * Logique:
   * - Si peer existe: envoyer signal directement
   * - Si pas de peer: buffer le signal et notifier incoming call
   * 
   * Cela gère le cas où signaux arrivent avant setup peer.
   * 
   * @param {string} fromId - Qui envoie signal
   * @param {string} fromPseudo - Son pseudo
   * @param {unknown} signal - Signal WebRTC (offer/answer/ice)
   */
  const handleIncomingSignal = useCallback((fromId: string, fromPseudo: string, signal: unknown) => {
    // Peer existant: signal directement
    const existing = peersRef.current.get(fromId);
    if (existing) {
      existing.signal(signal);
      return;
    }

    // Peer pas encore prêt: buffer et notifier incoming
    const queue = pendingSignalsRef.current.get(fromId) ?? [];
    queue.push(signal);
    pendingSignalsRef.current.set(fromId, queue);

    // Notifie caller d'un appel reçu (UI affiche accept/reject)
    setCallState({ phase: "incoming", fromId, fromPseudo });
    config.onCallStateChange?.({ phase: "incoming", fromId, fromPseudo });
  }, [config]);

  /**
   * Raccroche et nettoie toutes ressources (peers, streams).
   * 
   * Étapes:
   * 1. Destroy tous les peers
   * 2. Stop tous les tracks distants
   * 3. Stop et libère stream local
   * 4. Retour à idle
   */
  const hangup = useCallback(() => {
    // Ferme tous les peers
    peersRef.current.forEach((peer) => peer.destroy());
    peersRef.current.clear();

    // Stop tous les tracks distants
    Object.values(remoteStreamsRef.current).forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    remoteStreamsRef.current = {};
    setRemoteStreams({});

    // Stop et libère stream local
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Reset état
    setCallState({ phase: "idle" });
    config.onCallStateChange?.({ phase: "idle" });
    pendingSignalsRef.current.clear();
  }, [config]);

  /**
   * Retourne stats pour debugging (nombre peers, streams, etc).
   */
  const getStats = () => ({
    peersCount: peersRef.current.size,
    remoteStreamsCount: Object.keys(remoteStreamsRef.current).length,
    hasLocalStream: !!localStreamRef.current,
  });

  return {
    callState,
    remoteStreams,
    startCall,
    acceptCall,
    rejectCall,
    handleIncomingSignal,
    hangup,
    getStats,
  };
}
