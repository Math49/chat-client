/**
 * @fileoverview Composant CallUI - Interface d'appel WebRTC.
 * Responsabilités:
 * - Affichage de l'état d'appel
 * - Boutons d'actions (accepter, rejeter, raccrocher, durée)
 * - Rendu du stream distant (audio/vidéo)
 * @module components/room/call-ui
 */

"use client";

import { useEffect, useRef } from "react";
import { Button, Card, CardBody, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import type { CallState } from "@/services";

export interface CallUIProps {
  /** État d'appel actuel */
  callState: CallState;
  /** Stream distant (audio/vidéo) */
  remoteStream: MediaStream | null;
  /** Callback quand l'utilisateur accepte un appel entrant */
  onAcceptCall?: () => void;
  /** Callback quand l'utilisateur rejette un appel entrant */
  onRejectCall?: () => void;
  /** Callback quand l'utilisateur raccroche */
  onHangup?: () => void;
  /** Durée de l'appel actif (en secondes) */
  callDuration?: number;
}

/**
 * Composant RemoteAudio - Lecteur audio distant.
 */
function RemoteAudio({ stream }: { stream: MediaStream }) {
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
}

/**
 * Composant RemoteVideo - Lecteur vidéo distant.
 */
function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.play().catch(() => undefined);
    return () => {
      if (ref.current?.srcObject === stream) ref.current.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={false}
      className="w-full h-full object-cover bg-black rounded-lg"
    />
  );
}

/**
 * Formate la durée d'appel en HH:MM:SS.
 */
function formatCallDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Composant d'interface d'appel.
 * Affiche les modales pour incoming/dialing et le stream distant.
 */
export function CallUI({
  callState,
  remoteStream,
  onAcceptCall,
  onRejectCall,
  onHangup,
  callDuration = 0,
}: CallUIProps) {
  // Modale pour appel entrant
  const isIncomingOpen = callState.phase === "incoming";

  // Modale pour appel sortant
  const isDialingOpen = callState.phase === "dialing";

  // Affichage du stream pour appel actif
  const isActive = callState.phase === "active";

  return (
    <>
      {/* Appel entrant */}
      <Modal isOpen={isIncomingOpen} backdrop="blur" isDismissable={false}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Appel entrant</ModalHeader>
              <ModalBody className="py-4">
                <div className="text-center mb-4">
                  <p className="text-lg font-semibold">
                    {callState.phase === "incoming" && callState.fromPseudo}
                  </p>
                  <p className="text-sm text-gray-500">
                    {callState.phase === "incoming" && callState.videoEnabled
                      ? "Appel vidéo"
                      : "Appel audio"}
                  </p>
                </div>

                <div className="flex gap-2 justify-center">
                  <Button
                    color="danger"
                    variant="flat"
                    onClick={onRejectCall}
                  >
                    Rejeter
                  </Button>
                  <Button color="success" onClick={onAcceptCall}>
                    Accepter
                  </Button>
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Appel sortant */}
      <Modal isOpen={isDialingOpen} backdrop="blur" isDismissable={false}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Appel en cours</ModalHeader>
              <ModalBody className="py-4">
                <div className="text-center mb-4">
                  <p className="text-lg font-semibold">
                    {callState.phase === "dialing" && callState.targetPseudo}
                  </p>
                  <p className="text-sm text-gray-500">
                    Appel en attente...
                  </p>
                </div>

                <div className="flex justify-center">
                  <Button
                    color="danger"
                    onClick={onHangup}
                  >
                    Raccrocher
                  </Button>
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Appel actif avec stream */}
      {isActive && remoteStream && (
        <Card className="fixed bottom-4 right-4 w-64 bg-black">
          <CardBody className="p-0 relative h-auto">
            {callState.phase === "active" && callState.videoEnabled ? (
              <RemoteVideo stream={remoteStream} />
            ) : (
              <>
                <RemoteAudio stream={remoteStream} />
                <div className="bg-gray-800 h-40 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-white font-semibold">
                      {callState.phase === "active" && callState.peerPseudo}
                    </p>
                    <p className="text-gray-300 text-sm mt-2">
                      {formatCallDuration(callDuration)}
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="absolute top-2 right-2 flex gap-1">
              <Button
                isIconOnly
                size="sm"
                color="danger"
                onClick={onHangup}
                aria-label="Raccrocher"
              >
                ❌
              </Button>
            </div>

            {isActive && (
              <div className="absolute bottom-2 left-2 text-white text-xs font-mono">
                {formatCallDuration(callDuration)}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
