import { useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/useChat";
import MessageList from "@/components/Chatbot/MessageList";
import ChatInput from "@/components/Chatbot/ChatInput";

function campaignIdFromPath(pathname: string): string | undefined {
  const m = pathname.match(/^\/campaigns\/([^/]+)/);
  return m && m[1] !== "new" ? m[1] : undefined;
}

export default function ChatWindow() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const campaignId = campaignIdFromPath(location.pathname);
  const { messages, send, busy, error } = useChat(campaignId);

  const decide = (confirmed: boolean) => {
    void send(confirmed ? "yes" : "no");
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[520px] w-96 flex-col rounded-xl border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">SDR Copilot</div>
              <div className="text-xs text-muted-foreground">
                {campaignId ? "Aware of this campaign" : "Ask about any campaign or prospect"}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <MessageList messages={messages} busy={busy} onDecide={decide} />
          {error && <div className="border-t px-3 py-2 text-xs text-red-600">{error}</div>}
          <ChatInput busy={busy} onSend={(t) => void send(t)} />
        </div>
      )}
      <Button
        size="icon"
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full shadow-xl"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>
    </>
  );
}