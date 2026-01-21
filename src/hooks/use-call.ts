/**
 * @fileoverview Hook React pour la gestion des appels WebRTC.
 * Wrapper autour du CallService pour la liaison avec React.
 * Gère l'état React et synchronise avec le service.
 * 
 * @module hooks/use-call
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callService, type CallState } from "@/services";

/**
 * Callbacks d'événements des appels.
 */
export type UseCallCallbacks = {
  onStateChange?: (state: CallState) => void;
  onRemoteStreamReceived?: (stream: MediaStream) => void;
  onRemoteStreamEnded?: () => void;
  onError?: (error: Error | string) => void;
};

/**
 * Hook React pour la gestion des appels WebRTC.
 * Synchronise l'état du CallService avec React.
 * Expose une API simple pour gérer les appels.
 * 
 * @param callbacks Fonctions de callback pour les événements
 * @returns État et API des appels
 */
export function useCall(callbacks?: UseCallCallbacks) {
  const callbacksRef = useRef(callbacks);

  const [callState, setCallState] = useState<CallState>({ phase: "idle" });
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Mise à jour des callbacks
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // S'abonne aux événements du service
  useEffect(() => {
    const unsubscribeState = callService.on("stateChanged", (newState) => {
      setCallState(newState);
      callbacksRef.current?.onStateChange?.(newState);
    });

    const unsubscribeRemoteStream = callService.on("remoteStreamReceived", (stream) => {
      setRemoteStream(stream);
      callbacksRef.current?.onRemoteStreamReceived?.(stream);
    });

    const unsubscribeRemoteStreamEnded = callService.on("remoteStreamEnded", () => {
      setRemoteStream(null);
      callbacksRef.current?.onRemoteStreamEnded?.();
    });

    const unsubscribeError = callService.on("error", (error) => {
      callbacksRef.current?.onError?.(error);
    });

    return () => {
      unsubscribeState();
      unsubscribeRemoteStream();
      unsubscribeRemoteStreamEnded();
      unsubscribeError();
    };
  }, []);

  /**
   * Démarre un appel sortant.
   */
  const startCall = useCallback(
    async (
      targetId: string,
      targetPseudo: string,
      onSignal: (signal: unknown) => void,
      videoEnabled: boolean = false
    ) => {
      try {
        await callService.startCall(targetId, targetPseudo, onSignal, videoEnabled);
      } catch (error) {
        callbacksRef.current?.onError?.(error instanceof Error ? error : "Erreur démarrage appel");
      }
    },
    []
  );

  /**
   * Accepte un appel entrant.
   */
  const acceptCall = useCallback(
    async (
      fromId: string,
      fromPseudo: string,
      onSignal: (signal: unknown) => void,
      videoEnabled: boolean = false
    ) => {
      try {
        await callService.acceptCall(fromId, fromPseudo, onSignal, videoEnabled);
      } catch (error) {
        callbacksRef.current?.onError?.(error instanceof Error ? error : "Erreur acceptation appel");
      }
    },
    []
  );

  /**
   * Rejette un appel entrant.
   */
  const rejectCall = useCallback(() => {
    callService.rejectCall();
  }, []);

  /**
   * Raccroche l'appel en cours.
   */
  const hangup = useCallback(() => {
    callService.hangup();
  }, []);

  /**
   * Traite un signal entrant.
   */
  const handleIncomingSignal = useCallback(
    (fromId: string, fromPseudo: string, signal: unknown, videoEnabled: boolean = false) => {
      callService.handleIncomingSignal(fromId, fromPseudo, signal, videoEnabled);
    },
    []
  );

  return {
    callState,
    remoteStream,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    handleIncomingSignal,
  };
}
