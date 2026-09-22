import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Prospect, ProspectMessageItem } from "@/types";

export function useProspects(campaignId: string | undefined) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!campaignId) return;
    try {
      setProspects(await api<Prospect[]>(`/campaigns/${campaignId}/prospects?limit=1000`));
      setLoadError("");
    } catch {
      // keep showing the last list, the next refresh will try again
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 8000);
    return () => clearInterval(timer);
  }, [load]);

  return { prospects, loadError, reload: load };
}

export async function fetchProspectDetail(prospectId: string) {
  const [prospect, messages] = await Promise.all([
    api<Prospect>(`/prospects/${prospectId}`),
    api<ProspectMessageItem[]>(`/prospects/${prospectId}/messages`),
  ]);
  return { prospect, messages };
}