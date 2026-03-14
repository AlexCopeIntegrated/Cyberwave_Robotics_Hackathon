import { Map, ExternalLink, X, Terminal } from "lucide-react";
import { useState } from "react";

export interface SitemapEntry {
  website_url: string;
  urls: string[];
  status?: string;
  error?: string;
}

export interface ToolResult {
  toolId: string;
  toolName: string;
  at: string;
  result?: unknown;
  reference_urls?: string[];
  urls?: string[];
  sitemaps?: SitemapEntry[];
  error?: string;
  status?: string;
}

const ToolResultsPanel = ({
  results: resultsProp,
  onClose,
}: {
  results?: ToolResult[];
  onClose?: () => void;
}) => {
  const [internalResults, setInternalResults] = useState<ToolResult[]>([]);
  const results = resultsProp !== undefined ? resultsProp : internalResults;

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--threat-surface))]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="font-heading text-xs font-semibold uppercase tracking-wider text-foreground">
          Tool Results
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close Tool Results"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {results.length > 0 && (
          <div className="space-y-3">
            {results.slice(0, 5).map((r, i) => (
              <div
                key={`${r.toolId}-${r.at}-${i}`}
                className="rounded-xl border border-border bg-card p-3.5 text-left shadow-sm"
              >
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {new Date(r.at).toLocaleTimeString()}
                  </span>
                </div>
                {r.error && (
                  <p className="mt-1.5 text-xs text-destructive rounded bg-destructive/10 px-2 py-1">{r.error}</p>
                )}
                {r.result != null && typeof r.result === "object" && !Array.isArray(r.result) && (
                  <pre className="mt-1.5 max-h-28 overflow-y-auto rounded-lg bg-muted/80 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground">
                    {JSON.stringify(r.result, null, 2)}
                  </pre>
                )}
                {r.result != null && (typeof r.result === "string" || typeof r.result === "number") && (
                  <p className="mt-1.5 text-xs text-foreground line-clamp-4">{String(r.result)}</p>
                )}
                {r.reference_urls && r.reference_urls.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">
                      Reference URLs ({r.reference_urls.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {r.reference_urls.slice(0, 10).map((href, j) => (
                        <a
                          key={j}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] text-primary hover:bg-primary/20"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {href.length > 42 ? `${href.slice(0, 42)}…` : href}
                        </a>
                      ))}
                      {r.reference_urls.length > 10 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{r.reference_urls.length - 10}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {r.sitemaps && r.sitemaps.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Map className="h-3 w-3" />
                      Sitemaps from reference URLs ({r.sitemaps.length} site{r.sitemaps.length !== 1 ? "s" : ""})
                    </p>
                    {r.sitemaps.map((sm, j) => (
                      <div key={j} className="mt-1.5 rounded-md border border-border bg-muted/40 p-2">
                        <a
                          href={sm.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-medium text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {sm.website_url}
                        </a>
                        {sm.error && (
                          <p className="mt-0.5 text-[10px] text-destructive">{sm.error}</p>
                        )}
                        {sm.urls && sm.urls.length > 0 && (
                          <ul className="mt-1 max-h-24 overflow-y-auto space-y-0.5">
                            {sm.urls.slice(0, 8).map((u, k) => (
                              <li key={k}>
                                <a
                                  href={u}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-muted-foreground hover:text-primary"
                                >
                                  {u.length > 44 ? `${u.slice(0, 44)}…` : u}
                                </a>
                              </li>
                            ))}
                            {sm.urls.length > 8 && (
                              <li className="text-[10px] text-muted-foreground">+{sm.urls.length - 8} more</li>
                            )}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {r.urls && r.urls.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">
                      Sitemap URLs ({r.urls.length})
                    </p>
                    <ul className="mt-1 max-h-36 overflow-y-auto space-y-1">
                      {r.urls.slice(0, 15).map((href, j) => (
                        <li key={j}>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            {href.length > 48 ? `${href.slice(0, 48)}…` : href}
                          </a>
                        </li>
                      ))}
                      {r.urls.length > 15 && (
                        <li className="text-[10px] text-muted-foreground">
                          +{r.urls.length - 15} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center px-6">
            <div className="mb-4 inline-flex rounded-2xl bg-muted p-4">
              <Terminal className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Tools & results</p>
            <p className="mt-1.5 text-xs text-muted-foreground/70 leading-relaxed max-w-[220px]">
              Image or text analysis runs ScrapeGraph (evacuation, Frontier Tower). Results appear in chat and here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolResultsPanel;
