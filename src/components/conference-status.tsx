import { Avatar, Tooltip } from "@heroui/react";

/**
 * Badge animé pour indiquer qu'un participant est en conférence
 * Affiche un petit cercle rouge pulsant
 */
function ConferenceIndicator() {
  return (
    <div className="absolute -right-1 -top-1">
      <div className="relative h-3 w-3">
        <div className="absolute h-full w-full rounded-full bg-red-500 animate-pulse" />
        <div className="absolute h-full w-full rounded-full bg-red-400" />
      </div>
    </div>
  );
}

interface ParticipantWithConferenceProps {
  pseudo: string;
  avatar?: string | null;
  isInConference: boolean;
  conferenceParticipantCount?: number;
}

/**
 * Composant pour afficher un participant avec un indicateur visuel
 * montrant s'il/elle participe à la conférence en cours
 */
export function ParticipantWithConferenceStatus({
  pseudo,
  avatar,
  isInConference,
  conferenceParticipantCount = 0,
}: ParticipantWithConferenceProps) {
  const content = (
    <div className="relative">
      <Avatar name={pseudo} size="sm" />
      {isInConference && <ConferenceIndicator />}
    </div>
  );

  if (isInConference) {
    return (
      <Tooltip color="danger" content={`En conférence (${conferenceParticipantCount} participant${conferenceParticipantCount > 1 ? "s" : ""})`}>
        {content}
      </Tooltip>
    );
  }

  return content;
}

/**
 * Indicateur simple pour afficher l'état de la conférence
 * dans le header ou la barre de statut
 */
interface ConferenceStatusIndicatorProps {
  isActive: boolean;
  participantCount: number;
}

export function ConferenceStatusIndicator({
  isActive,
  participantCount,
}: ConferenceStatusIndicatorProps) {
  if (!isActive) return null;

  return (
    <div className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
      <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
      <span>
        Conférence en cours ({participantCount})
      </span>
    </div>
  );
}
