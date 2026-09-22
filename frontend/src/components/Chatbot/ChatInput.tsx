import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ChatInput({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="flex items-center gap-2 border-t p-2.5">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask the Copilot..."
        disabled={busy}
        className="h-9"
      />
      <Button size="icon" className="h-9 w-9 shrink-0" disabled={busy || !text.trim()} onClick={submit}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}