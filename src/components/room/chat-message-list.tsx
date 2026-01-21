/**
 * @fileoverview Composant ChatMessageList - Affichage scrollable des messages.
 * Responsabilités:
 * - Rendu de la liste des messages
 * - Scroll automatique vers le dernier message
 * - Gestion du style et du layout
 * @module components/room/chat-message-list
 */

"use client";

import { useEffect, useRef } from "react";
import { ScrollShadow } from "@heroui/react";
import { ChatMessage } from "./chat-message";

export interface ChatEntry {
  id: string;
  type: "message" | "info";
  pseudo: string;
  content: string;
  date: Date;
  isMine: boolean;
  isImage: boolean;
}

export interface ChatMessageListProps {
  /** Liste des messages à afficher */
  messages: ChatEntry[];
  /** Hauteur du conteneur */
  height?: string;
}

/**
 * Composant d'affichage de la liste des messages.
 * Scroll automatique vers le dernier message.
 */
export function ChatMessageList({
  messages,
  height = "calc(100vh - 300px)",
}: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Scroll automatique vers le dernier message.
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <ScrollShadow className="flex-1 overflow-y-auto" style={{ height }}>
      <div className="px-4 py-3 space-y-2">
        {messages.map((entry) => (
          <ChatMessage
            key={entry.id}
            pseudo={entry.pseudo}
            content={entry.content}
            date={entry.date}
            isMine={entry.isMine}
            isImage={entry.isImage}
            type={entry.type}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </ScrollShadow>
  );
}
