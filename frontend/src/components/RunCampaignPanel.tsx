import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown, Loader2, MessageSquareReply, Play, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, ApiError } from "@/lib/api";

type Pipeline = {
  targetCount: number;
  discovered: number;
  qualified: number;
  rejected: number;
  researched: number;
  personalised: number;
  awaitingReview: number;
  readyToSend: number;
  sent: number;
  failed: number;
  active: boolean;
  cost: { usd: number; perProspect: number; perQualified: number };
};

type SendResult = { sent: number; notSent: number; stoppedBecause: string };
type SimulateReplyResult = {
  accepted: boolean;
  prospectId: string;
  prospectName: string;
  simulatedIntent: string;
  channel: string;
};
type SimulateRepliesResult = { requested: number; simulated: number; replies: SimulateReplyResult[] };

const SIMULATE_INTENTS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: "Random" },
  { key: "interested", label: "Interested" },
  { key: "wants_meeting", label: "Wants a meeting" },
  { key: "objection", label: "Objection" },
  { key: "question", label: "Question" },
  { key: "not_interested", label: "Not interested" },
  { key: "unsubscribe", label: "Unsubscribe" },
  { key: "out_of_office", label: "Out of office" },
];

const MAX_SIMULATE_BATCH = 50;

const splitList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[6.5rem]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function EditableTargetStat({
  qualified,
  target,
  busy,
  onSave,
}: {
  qualified: number;
  target: number;
  busy: boolean;
  onSave: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(target));

  if (!editing) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setDraft(String(target));
          setEditing(true);
        }}
        className="min-w-[6.5rem] rounded text-left hover:bg-muted/60"
      >
        <div className="text-xs text-muted-foreground">Qualified (click to edit target)</div>
        <div className="text-lg font-semibold tabular-nums">
          {qualified} / {target}
        </div>
      </button>
    );
  }

  return (
    <div className="min-w-[9rem]">
      <div className="text-xs text-muted-foreground">Qualified target</div>
      <div className="mt-0.5 flex items-center gap-1">
        <Input
          type="number"
          min={1}
          max={500}
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSave(Number(draft));
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-16 px-1.5"
        />
        <Button
          size="sm"
          className="h-7 px-2"
          disabled={busy}
          onClick={() => {
            onSave(Number(draft));
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function RunCampaignPanel() {
  const { id } = useParams();
  const [data, setData] = useState<Pipeline | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [target, setTarget] = useState("5");
  const [industries, setIndustries] = useState("");
  const [pains, setPains] = useState("");
  const [sizeMin, setSizeMin] = useState("50");
  const [sizeMax, setSizeMax] = useState("1000");
  const [batchCount, setBatchCount] = useState(5);
  const [simulateIntent, setSimulateIntent] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await api<Pipeline>(`/campaigns/${id}/pipeline`));
      setLoadError("");
      setUpdatedAt(new Date());
    } catch (e) {
      // keep the last numbers, the next refresh will try again
      setLoadError(e instanceof ApiError ? e.message : "Something went wrong");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const secondsAgo = updatedAt ? Math.max(0, Math.round((now - updatedAt.getTime()) / 1000)) : null;
  const staleAfterMs = 15000;
  const isStale = updatedAt ? now - updatedAt.getTime() > staleAfterMs : false;

  const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

  const start = async () => {
    const n = Number(target);
    const lo = Number(sizeMin);
    const hi = Number(sizeMax);
    if (!Number.isInteger(n) || n < 1 || n > 500) return setError("Target must be a whole number from 1 to 500");
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < 1 || lo > hi) {
      return setError("Company size: the minimum must not be above the maximum");
    }
    setBusy(true);
    setError("");
    try {
      await api(`/campaigns/${id}/start`, {
        method: "POST",
        body: {
          targetCount: n,
          industries: splitList(industries),
          painPoints: splitList(pains),
          companySizeMin: lo,
          companySizeMax: hi,
        },
      });
      setOpen(false);
      setNotice("Run started. The agents are finding and qualifying prospects now.");
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const sendReady = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<SendResult>(`/campaigns/${id}/send-ready`, { method: "POST" });
      setNotice(
        `Processed ${r.sent} message${r.sent === 1 ? "" : "s"}` +
          (r.stoppedBecause ? `. Stopped: ${r.stoppedBecause}` : "") +
          (r.notSent && !r.stoppedBecause ? `. ${r.notSent} not sent.` : ".")
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const adjustTarget = async (newTarget: number) => {
    if (!Number.isInteger(newTarget) || newTarget < 1 || newTarget > 500) {
      return setError("Target must be a whole number from 1 to 500");
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ previousTarget: number; targetCount: number; qualified: number }>(
        `/campaigns/${id}/target`,
        { method: "POST", body: { targetCount: newTarget } }
      );
      setNotice(
        r.targetCount > r.previousTarget
          ? `Target raised to ${r.targetCount}. Discovery will keep going until it's met.`
          : `Target updated to ${r.targetCount}.`
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const simulateBatch = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<SimulateRepliesResult>(`/campaigns/${id}/simulate-replies`, {
        method: "POST",
        body: { count: batchCount, ...(simulateIntent ? { intent: simulateIntent } : {}) },
      });
      const label = SIMULATE_INTENTS.find((o) => o.key === simulateIntent)?.label ?? "Random";
      setNotice(
        r.simulated < r.requested
          ? `Simulated ${r.simulated} of ${r.requested} requested "${label}" replies. No more prospects were waiting for a response.`
          : `Simulated ${r.simulated} "${label}" repl${r.simulated === 1 ? "y" : "ies"}.`
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        {loadError ? `Could not load the agent run: ${loadError}` : "Loading agent run..."}
      </div>
    );
  }
  const hasRun = data.discovered > 0;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            Agent run
            {data.active && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Agents are working
              </span>
            )}
            {hasRun && (
              <span
                className={`flex items-center gap-1.5 text-xs font-normal ${isStale ? "text-amber-600" : "text-muted-foreground"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isStale ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
                {secondsAgo === null ? "" : secondsAgo <= 1 ? "Updated just now" : `Updated ${secondsAgo}s ago`}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {hasRun
              ? "Live numbers from the agent pipeline. They refresh every few seconds."
              : "This campaign has not run yet. Start a run to let the agents find, research and write to prospects."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasRun && data.readyToSend > 0 && (
            <Button variant="outline" disabled={busy} onClick={sendReady}>
              <Send className="mr-1.5 h-4 w-4" />
              Send {data.readyToSend} ready
            </Button>
          )}
          {hasRun && data.sent > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border pl-1 pr-1">
              <Input
                type="number"
                min={1}
                max={MAX_SIMULATE_BATCH}
                value={batchCount}
                disabled={busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isInteger(n)) setBatchCount(Math.min(MAX_SIMULATE_BATCH, Math.max(1, n)));
                }}
                className="h-7 w-14 border-0 text-center focus-visible:ring-0"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={busy} className="h-7 gap-1 px-2">
                    {SIMULATE_INTENTS.find((o) => o.key === simulateIntent)?.label ?? "Random"}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {SIMULATE_INTENTS.map((opt) => (
                    <DropdownMenuItem key={opt.label} onSelect={() => setSimulateIntent(opt.key)}>
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" disabled={busy} onClick={simulateBatch} className="h-7">
                <MessageSquareReply className="mr-1.5 h-3.5 w-3.5" />
                Simulate
              </Button>
            </div>
          )}
          {!hasRun && (
            <Button onClick={() => setOpen(true)}>
              <Play className="mr-1.5 h-4 w-4" />
              Run campaign
            </Button>
          )}
        </div>
      </div>

      {hasRun && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          <Stat label="Discovered" value={data.discovered} />
          <EditableTargetStat qualified={data.qualified} target={data.targetCount} busy={busy} onSave={adjustTarget} />
          <Stat label="Personalised" value={data.personalised} />
          <Stat label="Awaiting review" value={data.awaitingReview} />
          <Stat label="Ready to send" value={data.readyToSend} />
          <Stat label="Contacted" value={data.sent} />
          <Stat label="Failed" value={data.failed} />
          <Stat label="Model cost" value={`$${data.cost.usd.toFixed(4)}`} />
          <Stat label="Cost / qualified" value={data.cost.perQualified ? `$${data.cost.perQualified.toFixed(4)}` : "—"} />
        </div>
      )}

      {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {error && !open && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run this campaign</DialogTitle>
            <DialogDescription>
              The agents will find prospects that match the campaign ICP, research them and draft the first messages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              Qualified prospects to reach
              <Input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            <label className="block text-sm">
              Industries (comma separated, optional)
              <Input placeholder="SaaS, Fintech" value={industries} onChange={(e) => setIndustries(e.target.value)} />
            </label>
            <label className="block text-sm">
              Pain points (comma separated, optional)
              <Input placeholder="internal tools, engineering workflow" value={pains} onChange={(e) => setPains(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Company size, min
                <Input inputMode="numeric" value={sizeMin} onChange={(e) => setSizeMin(e.target.value)} />
              </label>
              <label className="block text-sm">
                Company size, max
                <Input inputMode="numeric" value={sizeMax} onChange={(e) => setSizeMax(e.target.value)} />
              </label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={start}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Start run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}