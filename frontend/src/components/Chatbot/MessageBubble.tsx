import type { ChatMessage } from "@/hooks/useChat";
import ActionConfirmation from "@/components/Chatbot/ActionConfirmation";
import ToolResult from "@/components/Chatbot/ToolResult";

export default function MessageBubble({
  message,
  isLatest,
  busy,
  onDecide,
}: {
  message: ChatMessage;
  isLatest: boolean;
  busy: boolean;
  onDecide: (confirmed: boolean) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "border bg-card"
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {!isUser && <ToolResult dataType={message.dataType} data={message.data} />}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-1.5 text-[11px] text-muted-foreground">Sources: {message.sources.join(", ")}</div>
        )}
        {!isUser && message.requiresConfirmation && isLatest && (
          <ActionConfirmation disabled={busy} onDecide={onDecide} />
        )}
      </div>
    </div>
  );
}