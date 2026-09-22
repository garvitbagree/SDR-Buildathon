import { useCallback, useState } from "react";
import { api, ApiError } from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  sources?: string[];
  dataType?: string | null;
  data?: unknown;
  requiresConfirmation?: boolean;
  action?: { tool: string; target: string } | null;
}

interface ChatResponse {
  message: string;
  conversationId: string;
  intent: string;
  sources: string[];
  toolCalls: string[];
  requiresConfirmation: boolean;
  action: { tool: string; target: string } | null;
  dataType: string | null;
  data: unknown;
}

let nextId = 1;
const newId = () => `m${nextId++}`;

export function useChat(campaignId?: string, prospectId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setMessages((m) => [...m, { id: newId(), role: "user", content: trimmed }]);
      setBusy(true);
      setError("");
      try {
        const r = await api<ChatResponse>("/chat", {
          method: "POST",
          body: { message: trimmed, conversationId, campaignId, prospectId },
        });
        setConversationId(r.conversationId);
        setMessages((m) => [
          ...m,
          {
            id: newId(), role: "assistant", content: r.message, intent: r.intent, sources: r.sources,
            dataType: r.dataType, data: r.data, requiresConfirmation: r.requiresConfirmation, action: r.action,
          },
        ]);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "The Copilot is temporarily unavailable. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, campaignId, prospectId]
  );

  return { messages, send, busy, error, conversationId };
}