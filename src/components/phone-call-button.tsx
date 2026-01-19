/**
 * @fileoverview Composant bouton appel téléphone tel: protocol.
 * 
 * Utilise le protocole `tel:` du navigateur pour appels directs.
 * Feature detection: affiche désactivé si non supporté.
 * Validation numéro: accepte formats internationaux (+33, 06, 0612345678, etc).
 * 
 * Props:
 * - phoneNumber: Numéro à composer (format flexible)
 * - variant: "default" | "outline" | "ghost" (style du bouton)
 * - size: "sm" | "md" | "lg" (taille du bouton)
 * - children: Texte custom (défaut: "Appeler")
 * 
 * @module components/phone-call-button
 */

"use client";

/**
 * Props du composant PhoneCallButton.
 * @typedef {Object} PhoneCallButtonProps
 * @property {string} [phoneNumber] - Numéro à composer
 * @property {React.ReactNode} [children] - Texte bouton custom
 * @property {string} [className] - Classes Tailwind additionnelles
 * @property {"default"|"outline"|"ghost"} [variant] - Style bouton
 * @property {"sm"|"md"|"lg"} [size] - Taille bouton
 */
interface PhoneCallButtonProps {
  phoneNumber?: string | null;
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

/**
 * Composant SVG icône téléphone.
 * Affichage inline du symbole téléphone.
 * 
 * @param {Object} props - Props
 * @param {string} [props.className] - Classes taille (ex: "w-4 h-4")
 */
const PhoneIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
  </svg>
);

/**
 * Valide un numéro téléphone international (très permissif).
 * 
 * Accepte formats:
 * - +33 612345678
 * - 06 12 34 56 78 (France)
 * - (06) 1234-5678
 * - 0612345678
 * 
 * Logique: au minimum 9 chiffres continus (après cleanup).
 * 
 * @param {string} phone - Numéro à valider
 * @returns {boolean} true si format valide
 */
const isValidPhoneNumber = (phone: string): boolean => {
  // Retire caractères non-digit sauf + au début
  const cleaned = phone.replace(/[\s\-().+]/g, "");
  // Vérifie au moins 9 chiffres
  return /^\d{9,}$/.test(cleaned);
};


/**
 * Composant bouton appel téléphone.
 * 
 * Utilise le protocole `tel:` pour appels directs via navigateur.
 * Support device/browser: Safari Mobile, Chrome Android, etc.
 * 
 * Logique:
 * 1. Feature detect (navigator + tel protocol)
 * 2. Valide numéro (format flexible)
 * 3. Désactif si non supporté ou numéro invalide
 * 4. onClick: window.location.href = `tel:XXXXXX`
 * 
 * Styles:
 * - default: Fond émeraude, texte blanc (hover: plus foncé)
 * - outline: Bordure émeraude, texte émeraude
 * - ghost: Texte émeraude, hover: fond léger
 * - disabled: Gris neutre (tous variants)
 * 
 * @param {PhoneCallButtonProps} props - Configuration
 * @returns {JSX.Element} Bouton appel ou disabled si non supporté
 * 
 * @example
 * // Usage simple
 * <PhoneCallButton phoneNumber="+33612345678">
 *   Appeler Alice
 * </PhoneCallButton>
 * 
 * // Usage variant + size
 * <PhoneCallButton 
 *   phoneNumber="06 12 34 56 78"
 *   variant="outline"
 *   size="lg"
 * />
 */
export function PhoneCallButton({
  phoneNumber,
  children,
  className = "",
  variant = "default",
  size = "md",
}: PhoneCallButtonProps) {
  // Feature detection: vérifie support du protocole tel:
  const isSupported = typeof navigator !== "undefined" && "tel" in window;
  
  // Validation numéro
  const isValid = phoneNumber && isValidPhoneNumber(phoneNumber);
  
  // Bouton désactivé si: API non supportée OU numéro invalide
  const isDisabled = !isSupported || !isValid;

  // Classes Tailwind pour tailles
  const sizeClasses = {
    sm: "px-2 py-1 text-xs gap-1",
    md: "px-3 py-2 text-sm gap-2",
    lg: "px-4 py-3 text-base gap-2",
  };

  // Classes Tailwind pour variants (avec état disabled)
  const variantClasses = {
    default: isDisabled
      ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
      : "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800",
    outline: isDisabled
      ? "border border-neutral-200 text-neutral-400 cursor-not-allowed"
      : "border border-emerald-600 text-emerald-600 hover:bg-emerald-50",
    ghost: isDisabled
      ? "text-neutral-400 cursor-not-allowed"
      : "text-emerald-600 hover:bg-emerald-50",
  };

  /**
   * Handler click: compose le numéro via tel: protocol.
   * Retire les espaces et caractères spéciaux.
   */
  const handleCall = () => {
    if (isDisabled || !phoneNumber) return;
    
    // Nettoie le numéro (retire espaces)
    const cleanNumber = phoneNumber.replace(/\s/g, "");
    
    // Utilise le protocole tel: du navigateur
    window.location.href = `tel:${cleanNumber}`;
  };

  // Texte title/tooltip conditionnel
  const title = !isSupported
    ? "Appels téléphoniques non supportés sur cet appareil"
    : !isValid
    ? "Numéro de téléphone invalide"
    : `Appeler ${phoneNumber}`;

  return (
    <button
      type="button"
      onClick={handleCall}
      disabled={isDisabled}
      title={title}
      className={`
        flex items-center justify-center rounded-lg font-medium
        transition-colors duration-200
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      aria-label={`Appeler ${phoneNumber}`}
    >
      {/* Icône téléphone */}
      <PhoneIcon className="h-4 w-4 flex-shrink-0" />
      
      {/* Texte: custom ou défaut */}
      {children || (phoneNumber ? "Appeler" : "Appel")}
    </button>
  );
}
