import { useState } from "react";
import { Send, ShieldAlert, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "bot";
  text: string;
}

const botResponses: Record<string, string> = {
  default:
    "⚠ Analyzing your report. Assessing threat level, affected area, and recommending appropriate emergency response protocols.",
  fire: "🔥 Fire threat acknowledged. Assessing severity based on location, building type, and occupancy. Dispatching fire response units. Evacuation protocols initiated for surrounding areas.",
  knife:
    "🔪 Weapon threat confirmed. Area classified as danger zone. Law enforcement notified. Civilians advised to evacuate immediately. Nearest safe zone identified.",
  snatch:
    "🏃 Snatching incident logged. Reviewing available surveillance. Suspect tracking initiated. Victim assistance coordinated. Patrol units alerted in the vicinity.",
  robbery:
    "🚨 Armed incident flagged as high-severity. Emergency response dispatched. Perimeter establishment recommended. All nearby civilians advised to shelter in place.",
  flood:
    "🌊 Flood risk assessed. Water level monitoring active. Evacuation advisory prepared for low-lying areas. Emergency shelters identified and readied.",
  help: "Available threat categories: fire, knife/weapon, snatching, robbery, flood, gas leak, assault, suspicious activity. Describe any physical threat for immediate analysis.",
};

const getResponse = (input: string): string => {
  const lower = input.toLowerCase();
  if (lower.includes("fire") || lower.includes("burn")) return botResponses.fire;
  if (lower.includes("knife") || lower.includes("stab") || lower.includes("weapon")) return botResponses.knife;
  if (lower.includes("snatch") || lower.includes("steal") || lower.includes("thief")) return botResponses.snatch;
  if (lower.includes("rob") || lower.includes("armed") || lower.includes("gun")) return botResponses.robbery;
  if (lower.includes("flood") || lower.includes("water")) return botResponses.flood;
  if (lower.includes("help")) return botResponses.help;
  return botResponses.default;
};

const ChatPanel = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: "user", text: input };
    const botMsg: Message = { role: "bot", text: getResponse(input) };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
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
                    <div className="mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Analyzer</span>
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Describe a threat to analyze..."
            className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
          <button
            onClick={handleSend}
            className="flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
