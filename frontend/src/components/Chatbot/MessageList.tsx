import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/hooks/useChat";
import MessageBubble from "@/components/Chatbot/MessageBubble";
import TypingIndicator from "@/components/Chatbot/TypingIndicator";

export default function MessageList({
  messages,
  busy,
  onDecide,
}: {
  messages: ChatMessage[];
  busy: boolean;
  onDecide: (confirmed: boolean) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const lastAssistantIndex = [...messages].map((m) => m.role).lastIndexOf("assistant");

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {messages.length === 0 && (
        <div className="px-2 py-6 text-center text-sm text-muted-foreground">
          Ask about a campaign, a prospect, or ask me to pause a campaign or approve a prospect.
        </div>
      )}
      {messages.map((m, i) => (
        <MessageBubble key={m.id} message={m} isLatest={i === lastAssistantIndex} busy={busy} onDecide={onDecide} />
      ))}
      {busy && <TypingIndicator />}
      <div ref={endRef} />
    </div>
  );
}