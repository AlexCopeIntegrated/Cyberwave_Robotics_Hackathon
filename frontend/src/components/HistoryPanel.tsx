import { Clock, Shield, Plus, X } from "lucide-react";
import { useState } from "react";

interface Session {
  id: number;
  title: string;
  time: string;
  severity: "critical" | "high" | "medium" | "low";
}

const severityColor: Record<string, string> = {
  critical: "bg-primary",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

const HistoryPanel = ({ onClose }: { onClose?: () => void }) => {
  const [sessions] = useState<Session[]>([]);
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--threat-surface))]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">
            History
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Close History">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <Shield className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-xs font-medium text-muted-foreground">No analysis sessions yet</p>
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              Start a conversation to create your first threat analysis session.
            </p>
          </div>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                active === s.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              }`}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityColor[s.severity]}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{s.title}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{s.time}</p>
              </div>
            </button>
          ))
        )}
      </div>
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Shield className="h-3 w-3" />
          <span className="text-[10px] font-medium">{sessions.length} SESSIONS</span>
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;
