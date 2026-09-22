import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Mail, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiError } from "@/lib/api";
import { fetchProspectDetail, useProspects } from "@/hooks/useProspects";
import type { Prospect, ProspectMessageItem } from "@/types";

function Pill({ cls, children }: { cls: string; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

const STATE_STYLES: Record<string, string> = {
  DISCOVERED: "border-slate-200 bg-slate-50 text-slate-600",
  ICP_PENDING: "border-slate-200 bg-slate-50 text-slate-600",
  ICP_REJECTED: "border-stone-200 bg-stone-50 text-stone-500",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  STOPPED: "border-stone-200 bg-stone-50 text-stone-500",
  HUMAN_REVIEW: "border-violet-200 bg-violet-50 text-violet-700",
  READY_FOR_REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
  READY_TO_SEND: "border-sky-200 bg-sky-50 text-sky-700",
  WAITING_FOR_RESPONSE: "border-sky-200 bg-sky-50 text-sky-700",
  RESPONSE_RECEIVED: "border-orange-200 bg-orange-50 text-orange-700",
  CONVERSATION_ACTIVE: "border-orange-200 bg-orange-50 text-orange-700",
  MEETING_PENDING: "border-emerald-200 bg-emerald-50 text-emerald-700",
  MEETING_BOOKED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
};
const stateStyle = (s: string) => STATE_STYLES[s] ?? "border-stone-200 bg-stone-50 text-stone-600";
const stateLabel = (s: string) => s.replace(/_/g, " ").toLowerCase();

function GmailBadge({ email }: { email: string }) {
  const [configuredAddress, setConfiguredAddress] = useState<string | null>(null);
  useEffect(() => {
    api<{ configured: boolean; address: string }>("/inbox/config")
      .then((r) => setConfiguredAddress(r.configured ? r.address.split("@")[0] : null))
      .catch(() => setConfiguredAddress(null));
  }, []);
  if (!configuredAddress || !email.toLowerCase().startsWith(configuredAddress.toLowerCase() + "+")) return null;
  return (
    <Pill cls="border-emerald-200 bg-emerald-50 text-emerald-700">
      <Mail className="mr-1 h-3 w-3" />
      Real inbox
    </Pill>
  );
}

function ProspectDrawer({ prospectId, onClose, onChanged }: { prospectId: string; onClose: () => void; onChanged: () => void }) {
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [messages, setMessages] = useState<ProspectMessageItem[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [gmailAddress, setGmailAddress] = useState("");

  const load = async () => {
    try {
      const { prospect: p, messages: m } = await fetchProspectDetail(prospectId);
      setProspect(p);
      setMessages(m);
      setEmailDraft(p.email);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load this prospect");
    }
  };

  useEffect(() => {
    void load();
    api<{ configured: boolean; address: string }>("/inbox/config")
      .then((r) => setGmailAddress(r.configured ? r.address : ""))
      .catch(() => setGmailAddress(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId]);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const saveEmail = () =>
    withBusy(async () => {
      await api(`/prospects/${prospectId}`, { method: "PATCH", body: { email: emailDraft.trim() } });
      setEditingEmail(false);
      setNotice("Email updated.");
      await load();
      onChanged();
    });

  const pointAtBurnerInbox = () =>
    withBusy(async () => {
      const [local, domain] = gmailAddress.split("@");
      const tagged = `${local}+${prospectId}@${domain}`;
      await api(`/prospects/${prospectId}`, { method: "PATCH", body: { email: tagged } });
      setNotice(`Email set to ${tagged}. This prospect can now receive a real send.`);
      await load();
      onChanged();
    });

  const sendReal = () =>
    withBusy(async () => {
      const r = await api<{ sent: boolean; status: string; reason: string }>(`/prospects/${prospectId}/send-real`, { method: "POST" });
      setNotice(r.sent ? "Sent for real. Check the inbox." : `Not sent: ${r.reason || r.status}`);
      await load();
      onChanged();
    });

  const checkReplies = () =>
    withBusy(async () => {
      const r = await api<{ checked: number; matched: number; error: string }>("/inbox/check", { method: "POST" });
      setNotice(
        r.error ? `Could not check the inbox: ${r.error}` : `Checked ${r.checked} message(s), matched ${r.matched} to prospects.`
      );
      await load();
      onChanged();
    });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">{prospect?.name ?? "Prospect"}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loadErr && <div className="p-5 text-sm text-red-600">{loadErr}</div>}

        {prospect && (
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill cls={stateStyle(prospect.state)}>{stateLabel(prospect.state)}</Pill>
              {prospect.score !== null && <Pill cls="border-stone-200 bg-stone-50 text-stone-600">score {prospect.score}</Pill>}
              <GmailBadge email={prospect.email} />
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Title</dt>
                <dd>{prospect.title || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Company</dt>
                <dd>{prospect.company || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Location</dt>
                <dd>{prospect.location || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Industry</dt>
                <dd>{prospect.industry || "—"}</dd>
              </div>
            </dl>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Email</span>
                {!editingEmail && (
                  <button className="text-xs text-primary hover:underline" onClick={() => setEditingEmail(true)}>
                    Edit
                  </button>
                )}
              </div>
              {editingEmail ? (
                <div className="flex items-center gap-2">
                  <Input value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} className="h-8 text-sm" />
                  <Button size="sm" className="h-8" disabled={busy} onClick={saveEmail}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setEditingEmail(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="text-sm">{prospect.email || "—"}</div>
              )}
            </div>

            {gmailAddress && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="text-xs font-medium">Real email demo</div>
                <p className="text-xs text-muted-foreground">
                  Point this prospect at the burner inbox, then send for real. Everything else in this campaign
                  keeps running in sandbox mode, unaffected.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={pointAtBurnerInbox}>
                    Point at burner inbox
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || prospect.state !== "READY_TO_SEND"}
                    onClick={sendReal}
                  >
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
                    Send real email
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={checkReplies}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Check for replies now
                  </Button>
                </div>
                {prospect.state !== "READY_TO_SEND" && (
                  <p className="text-[11px] text-muted-foreground">
                    "Send real email" is only available while this prospect is ready to send.
                  </p>
                )}
              </div>
            )}

            {notice && <p className="text-sm text-emerald-700">{notice}</p>}
            {err && <p className="text-sm text-red-600">{err}</p>}

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Message thread</div>
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No messages yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {messages.map((m) => (
                    <li key={m.id} className={`rounded-lg border p-3 text-sm ${m.direction === "out" ? "bg-sky-50/50" : "bg-muted/30"}`}>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {m.direction === "out" ? "Us" : "Prospect"} · {m.channel} · {m.kind}
                        </span>
                        <Pill cls="border-stone-200 bg-stone-50 text-stone-600">{m.status}</Pill>
                      </div>
                      {m.subject && <div className="font-medium">{m.subject}</div>}
                      <div className="whitespace-pre-wrap">{m.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

export default function ProspectsPanel({ campaignId }: { campaignId: string }) {
  const { prospects, loadError, reload } = useProspects(campaignId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = filter
    ? prospects.filter((p) => `${p.name} ${p.company} ${p.title} ${p.state}`.toLowerCase().includes(filter.toLowerCase()))
    : prospects;
  const shown = filtered.slice(0, visible);

  useEffect(() => {
    setVisible(PAGE_SIZE); // filtering starts a fresh page, rather than showing a half-filled list
  }, [filter]);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-semibold">Prospects</h2>
          <p className="text-xs text-muted-foreground">{prospects.length} in this campaign. Click a row for details.</p>
        </div>
        <Input
          placeholder="Filter by name, company, title, state"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 w-64 text-sm"
        />
      </div>

      {loadError && <div className="p-5 text-sm text-red-600">{loadError}</div>}

      {prospects.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">No prospects yet.</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="pr-5">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenId(p.id)}>
                  <TableCell className="pl-5 font-medium">{p.name}</TableCell>
                  <TableCell>{p.title || "—"}</TableCell>
                  <TableCell>{p.company || "—"}</TableCell>
                  <TableCell>
                    <Pill cls={stateStyle(p.state)}>{stateLabel(p.state)}</Pill>
                  </TableCell>
                  <TableCell className="pr-5">{p.score ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length > shown.length && (
            <div className="flex justify-center border-t py-3">
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Load {Math.min(PAGE_SIZE, filtered.length - shown.length)} more ({shown.length} of {filtered.length})
              </Button>
            </div>
          )}
        </>
      )}

      {openId && <ProspectDrawer prospectId={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>
  );
}