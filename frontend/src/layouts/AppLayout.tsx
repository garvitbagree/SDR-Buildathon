import { NavLink, Outlet } from "react-router-dom";
import { FileText, GitMerge, LayoutDashboard, Power, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useControl } from "@/context/ControlContext";

const nav = [
  { to: "/campaigns", label: "Campaigns", icon: LayoutDashboard },
  { to: "/prompts", label: "Prompts", icon: FileText },
  { to: "/reps", label: "Reps", icon: Users },
  { to: "/conflicts", label: "Conflicts", icon: GitMerge },
];

export default function AppLayout() {
  const { campaigns, killSwitch, setKillSwitch } = useControl();
  const liveCount = campaigns.filter((c) => c.status === "live").length;

  return (
    <div className="flex h-screen bg-muted/30">
      <aside className="flex w-56 flex-col border-r bg-background">
        <div className="border-b px-4 py-4">
          <div className="text-lg font-semibold">Autonomous SDR</div>
          <div className="text-xs text-muted-foreground">Control plane</div>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
                  isActive && "bg-muted font-medium"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-background px-6 py-3">
          <div className="flex items-center gap-2 text-sm">
            {killSwitch ? (
              <Badge variant="destructive">All autonomous activity stopped</Badge>
            ) : (
              <Badge variant="secondary">{liveCount} campaigns live</Badge>
            )}
          </div>
          <Button
            variant={killSwitch ? "outline" : "destructive"}
            onClick={() => setKillSwitch(!killSwitch)}
          >
            <Power className="mr-2 h-4 w-4" />
            {killSwitch ? "Release kill switch" : "Global kill switch"}
          </Button>
        </header>

        {killSwitch && (
          <div className="bg-red-600 px-6 py-2 text-sm text-white">
            Global kill switch is ON. No agent can take external actions on any campaign.
          </div>
        )}

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}