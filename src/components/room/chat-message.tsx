/**
 * @fileoverview Composant ChatMessage - Affichage d'un message ou info.
 * Responsabilités:
 * - Rendu du message texte ou image
 * - Styling selon le type (message/info) et la propriété (mine/other)
 * @module components/room/chat-message
 */

"use client";

import { Card, CardBody } from "@heroui/react";

export interface ChatMessageProps {
  /** Auteur du message */
  pseudo: string;
  /** Contenu (texte ou data URL image) */
  content: string;
  /** Date du message */
  date: Date;
  /** Si le message est le nôtre */
  isMine: boolean;
  /** Si le contenu est une image */
  isImage: boolean;
  /** Type de message */
  type: "message" | "info";
}

/**
 * Composant d'affichage d'un message.
 * Supporte texte et images.
 */
export function ChatMessage({
  pseudo,
  content,
  date,
  isMine,
  isImage,
  type,
}: ChatMessageProps) {
  const timeStr = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (type === "info") {
    return (
      <div className="flex justify-center my-2">
        <div className="text-xs text-gray-500 italic">{content}</div>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-3`}>
      <Card
        className={`max-w-xs ${
          isMine
            ? "bg-blue-500 text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        <CardBody className="px-3 py-2">
          {!isMine && (
            <div className="text-xs font-semibold mb-1 opacity-75">
              {pseudo}
            </div>
          )}

          {isImage ? (
            <img
              src={content}
              alt="Photo partagée"
              className="rounded max-w-full h-auto"
            />
          ) : (
            <p className="text-sm break-words">{content}</p>
          )}

          <div
            className={`text-xs mt-1 ${
              isMine ? "text-blue-100" : "text-gray-500"
            }`}
          >
            {timeStr}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
