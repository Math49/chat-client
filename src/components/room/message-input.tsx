/**
 * @fileoverview Composant MessageInput - Formulaire d'entrée de messages et photos.
 * Responsabilités:
 * - Saisie de texte
 * - Sélection et upload de photos
 * - Soumission de messages
 * @module components/room/message-input
 */

"use client";

import { useCallback, useRef } from "react";
import { Button, Input } from "@heroui/react";

export interface MessageInputProps {
  /** Valeur actuelle de l'input */
  value: string;
  /** Callback quand la valeur change */
  onValueChange: (value: string) => void;
  /** Callback quand un message texte est soumis */
  onSubmit: (content: string) => void;
  /** Callback quand une photo est sélectionnée */
  onPhotoSelected: (file: File) => void;
  /** État de désactivation (ex: socket non connectée) */
  disabled?: boolean;
  /** Message de placeholder */
  placeholder?: string;
}

/**
 * Composant de saisie de messages.
 * Permet d'envoyer du texte et des photos.
 */
export function MessageInput({
  value,
  onValueChange,
  onSubmit,
  onPhotoSelected,
  disabled = false,
  placeholder = "Envoyer un message...",
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Gère la soumission du formulaire.
   */
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
    },
    [value, onSubmit]
  );

  /**
   * Gère la sélection d'une photo.
   */
  const handleFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (file) {
        onPhotoSelected(file);
        event.currentTarget.value = "";
      }
    },
    [onPhotoSelected]
  );

  /**
   * Ouvre le sélecteur de fichier.
   */
  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <Input
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
        type="text"
        size="sm"
      />

      <Button
        type="button"
        isIconOnly
        onClick={openFileDialog}
        disabled={disabled}
        className="px-3"
        aria-label="Joindre une photo"
      >
        📷
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
      />

      <Button
        type="submit"
        color="primary"
        disabled={disabled || !value.trim()}
        className="px-4"
      >
        Envoyer
      </Button>
    </form>
  );
}
