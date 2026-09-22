import { Link } from "react-router-dom";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600">
      {children}
    </span>
  );
}

export default function ToolResult({ dataType, data }: { dataType?: string | null; data?: unknown }) {
  if (!dataType || !data) return null;

  if (dataType === "prospect_list" || dataType === "review_list") {
    const rows = data as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    return (
      <ul className="mt-2 space-y-1.5">
        {rows.slice(0, 6).map((r, i) => {
          const id = (r.id ?? r.prospectId) as string | undefined;
          const name = (r.name ?? r.prospectName ?? "Unknown") as string;
          const state = (r.state ?? r.status) as string | undefined;
          return (
            <li key={id ?? i} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs">
              {id ? (
                <Link to={`/campaigns`} className="font-medium hover:underline">
                  {name}
                </Link>
              ) : (
                <span className="font-medium">{name}</span>
              )}
              {state && <Pill>{state.replace(/_/g, " ").toLowerCase()}</Pill>}
            </li>
          );
        })}
      </ul>
    );
  }

  if (dataType === "campaign_stats") {
    const d = data as Record<string, unknown>;
    return (
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        {["discovered", "qualified", "sent", "awaitingReview", "failed"].map((k) => (
          <div key={k} className="rounded-md border bg-card px-2 py-1.5 text-center">
            <div className="font-semibold tabular-nums">{String(d[k] ?? "—")}</div>
            <div className="text-[10px] text-muted-foreground">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</div>
          </div>
        ))}
      </div>
    );
  }

  if (dataType === "prospect") {
    const d = data as Record<string, unknown>;
    return (
      <div className="mt-2 rounded-md border bg-card px-2.5 py-1.5 text-xs">
        <div className="font-medium">{String(d.name)}</div>
        <div className="text-muted-foreground">
          {String(d.title ?? "")} · {String(d.company ?? "")} · {String(d.state ?? "").replace(/_/g, " ").toLowerCase()}
        </div>
      </div>
    );
  }

  return null;
}