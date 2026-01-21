/**
 * @fileoverview Composant ParticipantsList - Affichage de la liste des participants.
 * Responsabilités:
 * - Rendu de la liste des utilisateurs connectés
 * - Filtrage par recherche
 * - Actions par participant (appel, infos)
 * @module components/room/participants-list
 */

"use client";

import { useCallback, useMemo } from "react";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Avatar,
  Badge,
  ScrollShadow,
} from "@heroui/react";
import type { ChatClientInfo } from "@/lib/socket-client";

export interface ParticipantsListProps {
  /** Participants à afficher */
  participants: (ChatClientInfo & { id: string })[];
  /** Callback quand on clique sur le bouton appel */
  onCallParticipant?: (id: string, pseudo: string) => void;
  /** État d'ouverture de la modale */
  isOpen: boolean;
  /** Callback pour fermer la modale */
  onOpenChange: (isOpen: boolean) => void;
  /** Valeur de recherche */
  searchValue?: string;
  /** Callback quand la recherche change */
  onSearchChange?: (value: string) => void;
}

/**
 * Composant d'affichage de la liste des participants.
 * Modale avec recherche et actions.
 */
export function ParticipantsList({
  participants,
  onCallParticipant,
  isOpen,
  onOpenChange,
  searchValue = "",
  onSearchChange,
}: ParticipantsListProps) {
  /**
   * Filtre les participants selon la recherche.
   */
  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) =>
      p.pseudo.toLowerCase().includes(q)
    );
  }, [participants, searchValue]);

  /**
   * Gère le clic sur le bouton appel.
   */
  const handleCall = useCallback(
    (id: string, pseudo: string) => {
      onCallParticipant?.(id, pseudo);
    },
    [onCallParticipant]
  );

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              Participants ({participants.length})
            </ModalHeader>
            <ModalBody>
              <Input
                placeholder="Rechercher..."
                value={searchValue}
                onValueChange={onSearchChange}
                size="sm"
              />

              <ScrollShadow className="max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  {filtered.length === 0 ? (
                    <div className="text-center text-sm text-gray-500 py-4">
                      Aucun participant trouvé
                    </div>
                  ) : (
                    filtered.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Badge
                            color="success"
                            shape="circle"
                            content=""
                            className="block"
                          >
                            <Avatar
                              src={
                                participant.avatar || undefined
                              }
                              name={participant.pseudo.substring(0, 1)}
                              size="sm"
                            />
                          </Badge>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {participant.pseudo}
                            </p>
                          </div>
                        </div>

                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onClick={() =>
                            handleCall(
                              participant.id,
                              participant.pseudo
                            )
                          }
                          aria-label={`Appeler ${participant.pseudo}`}
                        >
                          ☎️
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollShadow>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
