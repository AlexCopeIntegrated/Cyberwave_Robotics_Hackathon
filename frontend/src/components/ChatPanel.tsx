import { Loader2, Mic, Plus, Send, ShieldAlert, Sparkles, Volume2, Search, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SmartSearchResult {
  query: string;
  result?: unknown;
  reference_urls?: string[];
  error?: string;
}

interface SitemapResult {
  website_url: string;
  urls: string[];
  status?: string;
  error?: string;
}

interface ToolResults {
  smart_searches?: SmartSearchResult[];
  sitemaps?: SitemapResult[];
}

interface Message {
  role: "user" | "bot";
  text: string;
  imageUrls?: string[];
  meta?: string;
  toolResults?: ToolResults;
}

const formatAnalysisText = (text: string): string =>
  text
    // Remove markdown bold
    .replace(/\*\*(.*?)\*\*/g, "$1")
    // Convert markdown headings like "## Title" to plain title lines
    .replace(/^##\s*(.+)$/gm, "$1")
    // Remove lines that are just '---'
    .replace(/^---\s*$/gm, "")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n");

const ChatPanel = ({ onToolResults }: { onToolResults?: (toolResults: ToolResults) => void }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);

  const clientId = useMemo(
    () =>
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    [],
  );

  const [isRecording, setIsRecording] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const playTTS = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setTtsError(null);
    setTtsPlaying(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim().slice(0, 5000) }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `TTS failed (${res.status})`;
        try {
          const body = text ? JSON.parse(text) : null;
          if (body?.detail) msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
          else if (text) msg = text.slice(0, 200);
        } catch {
          if (text) msg = text.slice(0, 200);
        }
        setTtsError(msg);
        setTtsPlaying(false);
        return;
      }
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setTtsPlaying(false);
      };
      audio.onerror = () => {
        setTtsError("Audio playback failed");
        setTtsPlaying(false);
      };
      await audio.play();
    } catch (e) {
      setTtsError(e instanceof Error ? e.message : "TTS request failed");
      setTtsPlaying(false);
    }
  }, []);

  const toggleVoiceRecording = useCallback(() => {
    if (isRecording) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "finalize" }));
      }
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      processorRef.current = null;
      sourceRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
      setIsRecording(false);
      return;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/voice/stt`;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.binaryType = "arraybuffer";
        ws.onopen = () => {
          const ctx = new AudioContext({ sampleRate: 16000 });
          audioContextRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          sourceRef.current = src;
          const bufferSize = 2048;
          const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
          processorRef.current = processor;
          processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const float32 = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
              const s = Math.max(-1, Math.min(1, float32[i]));
              int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            ws.send(int16.buffer);
          };
          src.connect(processor);
          processor.connect(ctx.destination);
          setIsRecording(true);
        };
        ws.onmessage = (ev) => {
          try {
            const data = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
            if (data?.error) {
              setInput((prev) => (prev ? `${prev} [Voice error: ${data.error}]` : `[Voice error: ${data.error}]`));
              return;
            }
            // Smallest Pulse: transcript (segment), full_transcript (complete), is_final
            const text =
              (data?.is_final && data?.full_transcript ? data.full_transcript : null) ??
              data?.full_transcript ??
              data?.transcript ??
              data?.text ??
              data?.content ??
              (typeof ev.data === "string" ? ev.data : "");
            if (text && typeof text === "string") {
              setInput((prev) => (prev ? `${prev} ${text}`.trim() : text));
            }
          } catch {
            if (typeof ev.data === "string") setInput((prev) => (prev ? `${prev} ${ev.data}` : ev.data));
          }
        };
        ws.onerror = () => setIsRecording(false);
        ws.onclose = () => {
          wsRef.current = null;
          setIsRecording(false);
        };
      })
      .catch(() => {});
  }, [isRecording]);

  // Poll server-side history every 20 seconds so external API calls
  // show up in the UI without a manual refresh.
  useEffect(() => {
    let isActive = true;

    const loadHistory = async () => {
      try {
        const res = await fetch("/api/history");
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.events) return;

        const events: any[] = Array.isArray(data.events) ? data.events : [];

        // Sort by created_at ascending if present.
        events.sort((a, b) => {
          const ta = a.created_at ?? "";
          const tb = b.created_at ?? "";
          return ta.localeCompare(tb);
        });

        const newEvents = events.filter((e) => {
          // Skip events originating from this client to avoid duplicates.
          if (e.client_id && e.client_id === clientId) return false;
          if (!historyCursor) return true;
          if (!e.created_at) return false;
          return e.created_at > historyCursor;
        });

        if (newEvents.length === 0) return;

        const historyMessages: Message[] = newEvents
          .filter((e) => e.role === "user" || e.role === "bot")
          .map((e) => ({
            role: e.role,
            text: typeof e.text === "string" ? e.text : JSON.stringify(e.text),
            meta: typeof e.meta === "string" ? e.meta : undefined,
          }));

        if (historyMessages.length > 0 && isActive) {
          setMessages((prev) => [...prev, ...historyMessages]);
        }

        const last = events[events.length - 1];
        if (last?.created_at && isActive) {
          setHistoryCursor(last.created_at);
        }
      } catch {
        // ignore history load errors in UI
      }
    };

    // Initial load immediately, then every 20 seconds.
    void loadHistory();
    const id = window.setInterval(() => {
      void loadHistory();
    }, 20000);

    return () => {
      isActive = false;
      window.clearInterval(id);
    };
  }, [historyCursor, clientId]);

  const handleSend = async () => {
    if (!input.trim() && imageFiles.length === 0) return;

    const userMsg: Message = {
      role: "user",
      text:
        input.trim() ||
        (imageFiles.length > 0 ? "Analyze these frames for physical threats and how they evolve." : ""),
      imageUrls: imagePreviews.length > 0 ? imagePreviews : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);

    if (imageFiles.length > 0) {
      try {
        setIsLoading(true);
        const formData = new FormData();
        imageFiles.forEach((file) => {
          formData.append("image", file);
        });
        if (input.trim()) {
          formData.append("notes", input.trim());
        }

        const res = await fetch("/api/analyze-image", {
          method: "POST",
          headers: {
            "X-Client-Id": clientId,
          },
          body: formData,
        });

        let data: any;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (!res.ok) {
          const detail =
            (data && (data.detail || data.error || data.message)) ||
            "The threat analysis service returned an error.";
          const botMsg: Message = {
            role: "bot",
            text: "The backend reported an error while analyzing the frames.",
            meta: typeof detail === "string" ? detail : JSON.stringify(detail),
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }

        const botMsg: Message = {
          role: "bot",
          text: data?.analysis ?? "I analyzed the frames but could not generate a detailed explanation.",
          meta: data?.model ? `Model: ${data.model}` : undefined,
          toolResults: data?.tool_results ?? undefined,
        };
        setMessages((prev) => [...prev, botMsg]);
        if (data?.tool_results && onToolResults) {
          onToolResults(data.tool_results);
        }
      } catch (err) {
        const botMsg: Message = {
          role: "bot",
          text:
            "I was unable to reach the threat analysis service. Please ensure the backend is running and try again.",
        };
        setMessages((prev) => [...prev, botMsg]);
        // eslint-disable-next-line no-console
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    } else if (input.trim()) {
      try {
        setIsLoading(true);
        const res = await fetch("/api/analyze-text", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Id": clientId,
          },
          body: JSON.stringify({ text: input.trim() }),
        });

        let data: any;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (!res.ok) {
          const detail =
            (data && (data.detail || data.error || data.message)) ||
            "The threat analysis service returned an error.";
          const botMsg: Message = {
            role: "bot",
            text: "The backend reported an error while analyzing the description.",
            meta: typeof detail === "string" ? detail : JSON.stringify(detail),
          };
          setMessages((prev) => [...prev, botMsg]);
          return;
        }

        const botMsg: Message = {
          role: "bot",
          text: data?.analysis ?? "I analyzed the description but could not generate a detailed explanation.",
          meta: data?.model ? `Model: ${data.model}` : undefined,
          toolResults: data?.tool_results ?? undefined,
        };
        setMessages((prev) => [...prev, botMsg]);
        if (data?.tool_results && onToolResults) {
          onToolResults(data.tool_results);
        }
      } catch (err) {
        const botMsg: Message = {
          role: "bot",
          text:
            "I was unable to reach the threat analysis service. Please ensure the backend is running and try again.",
        };
        setMessages((prev) => [...prev, botMsg]);
        // eslint-disable-next-line no-console
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    setInput("");
    setImageFiles([]);
    setImagePreviews([]);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const selected = Array.from(files);
    setImageFiles((prev) => [...prev, ...selected]);
    const urls = selected.map((file) => URL.createObjectURL(file));
    setImagePreviews((prev) => [...prev, ...urls]);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-8">
            <div className="mb-4 inline-flex rounded-2xl bg-primary/10 p-4">
              <ShieldAlert className="h-10 w-10 text-primary" />
            </div>
            <h2 className="font-heading text-xl font-bold text-foreground">
              Threat Analysis Ready
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
              Report a physical threat to begin analysis. Describe the incident, location, and any relevant details.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["Fire outbreak", "Knife threat", "Snatching incident", "Armed robbery"].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                  }}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground border border-border"
                  }`}
                >
                  {m.role === "bot" && (
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Analyzer</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => playTTS(m.text)}
                        title="Play response (text to speech)"
                        disabled={ttsPlaying}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-70"
                      >
                        {ttsPlaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )}
                  {m.imageUrls && m.imageUrls.length > 0 && (
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      {m.imageUrls.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt="Uploaded for analysis"
                          className="max-h-40 w-full rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">
                    {m.role === "bot" ? formatAnalysisText(m.text) : m.text}
                  </div>
                  {m.meta && (
                    <pre className="mt-2 rounded-md bg-muted px-2 py-1 text-[10px] leading-snug text-muted-foreground overflow-x-auto">
                      {m.meta}
                    </pre>
                  )}
                  {m.role === "bot" && m.toolResults && (m.toolResults.smart_searches?.length || m.toolResults.sitemaps?.length) ? (
                    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Search className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                          Evidence — Frontier Tower SF
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        ScrapeGraph: search results and sitemaps run for reference URLs.
                      </p>
                      {m.toolResults.smart_searches && m.toolResults.smart_searches.length > 0 && (
                        <div className="space-y-2">
                          {m.toolResults.smart_searches.map((sr, idx) => (
                            <div key={idx} className="rounded-md border border-border bg-background/80 p-2">
                              <p className="text-[10px] font-medium text-muted-foreground truncate" title={sr.query}>
                                {sr.query}
                              </p>
                              {sr.error && (
                                <p className="mt-1 text-[11px] text-destructive">{sr.error}</p>
                              )}
                              {sr.result != null && (
                                <p className="mt-1 text-xs text-foreground line-clamp-3">
                                  {typeof sr.result === "string"
                                    ? sr.result
                                    : typeof sr.result === "object"
                                      ? JSON.stringify(sr.result)
                                      : String(sr.result)}
                                </p>
                              )}
                              {sr.reference_urls && sr.reference_urls.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {sr.reference_urls.slice(0, 5).map((href, j) => (
                                    <a
                                      key={j}
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/20"
                                    >
                                      <ExternalLink className="h-2.5 w-2.5" />
                                      Link {j + 1}
                                    </a>
                                  ))}
                                  {sr.reference_urls.length > 5 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      +{sr.reference_urls.length - 5}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {m.toolResults.sitemaps && m.toolResults.sitemaps.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-border/80">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Sitemaps (from reference URLs)
                          </p>
                          {m.toolResults.sitemaps.map((sm, idx) => (
                            <div key={idx} className="rounded-md border border-border bg-background/80 p-2 mt-1">
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
                                <p className="mt-1 text-[11px] text-destructive">{sm.error}</p>
                              )}
                              {sm.urls && sm.urls.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {sm.urls.slice(0, 6).map((u, j) => (
                                    <a
                                      key={j}
                                      href={u}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground hover:bg-muted/80"
                                    >
                                      <ExternalLink className="h-2 w-2" />
                                      {u.length > 40 ? `${u.slice(0, 40)}…` : u}
                                    </a>
                                  ))}
                                  {sm.urls.length > 6 && (
                                    <span className="text-[10px] text-muted-foreground">+{sm.urls.length - 6} more</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        {ttsError && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{ttsError}</span>
            <button type="button" onClick={() => setTtsError(null)} className="shrink-0 rounded p-1 hover:bg-destructive/20" aria-label="Dismiss">×</button>
          </div>
        )}
        {imagePreviews.length > 0 && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-2">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                {imagePreviews.slice(0, 3).map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt="Selected"
                    className="h-8 w-8 rounded object-cover ring-2 ring-background"
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {imagePreviews.length === 1
                  ? "1 frame attached for analysis."
                  : `${imagePreviews.length} frames attached for analysis.`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setImageFiles([]);
                setImagePreviews([]);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Remove
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageChange}
            />
            <Plus className="h-6 w-6" />
          </label>
          <button
            type="button"
            onClick={toggleVoiceRecording}
            title={isRecording ? "Stop voice input" : "Voice input (speech to text)"}
            className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 transition-colors ${
              isRecording
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <Mic className="h-5 w-5" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSend()}
            placeholder={
              isRecording
                ? "Listening... (click mic to stop)"
                : imageFiles.length > 0
                  ? "Add optional context about these frames..."
                  : "Describe a threat or attach frames to analyze..."
            }
            className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
