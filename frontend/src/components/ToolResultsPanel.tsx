import { Terminal, FileText, X } from "lucide-react";

const ToolResultsPanel = ({ onClose }: { onClose?: () => void }) => {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--threat-surface))]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">
          Tool Results
        </span>
        {onClose && (
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Close Tool Results">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex h-full flex-col items-center justify-center text-center px-6">
          <div className="mb-4 inline-flex rounded-2xl bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No results yet</p>
          <p className="mt-1.5 text-xs text-muted-foreground/70 leading-relaxed max-w-[200px]">
            Analysis results will appear here when you report a threat in the chat.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ToolResultsPanel;
