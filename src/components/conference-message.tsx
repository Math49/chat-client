import { Button } from "@heroui/react";

// Icône Volume (conférence)
const VolumeIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

// Icône Téléphone
const PhoneIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 10.5V7c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
  </svg>
);

/**
 * Composant pour afficher un message de démarrage de conférence dans le chat
 * Avec boutons pour rejoindre ou quitter la conférence
 */
interface ConferenceMessageProps {
  conferenceId: string;
  initiatorPseudo: string;
  isCurrentUserInConference: boolean;
  onJoinConference: (conferenceId: string) => void;
  onLeaveConference: (conferenceId: string) => void;
  isConnecting?: boolean;
}

export function ConferenceMessage({
  conferenceId,
  initiatorPseudo,
  isCurrentUserInConference,
  onJoinConference,
  onLeaveConference,
  isConnecting = false,
}: ConferenceMessageProps) {
  return (
    <div className="rounded-2xl bg-blue-50 p-4 text-sm">
      <div className="mb-3 flex items-center gap-2">
        <VolumeIcon className="h-5 w-5 text-blue-600" />
        <span className="font-semibold text-blue-900">
          {initiatorPseudo} a lancé une conférence
        </span>
      </div>

      <p className="mb-3 text-blue-800">
        {isCurrentUserInConference
          ? "Vous êtes connecté à cette conférence"
          : "Cliquez pour rejoindre la conférence"}
      </p>

      <div className="flex gap-2">
        {!isCurrentUserInConference ? (
          <Button
            color="primary"
            size="sm"
            startContent={<PhoneIcon className="h-4 w-4" />}
            onPress={() => onJoinConference(conferenceId)}
            isLoading={isConnecting}
            isDisabled={isConnecting}
          >
            Rejoindre
          </Button>
        ) : (
          <Button
            color="danger"
            size="sm"
            variant="flat"
            startContent={<PhoneIcon className="h-4 w-4" />}
            onPress={() => onLeaveConference(conferenceId)}
            isDisabled={isConnecting}
          >
            Quitter
          </Button>
        )}
      </div>
    </div>
  );
}
