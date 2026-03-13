import { useState } from "react";
import { ShieldAlert, ArrowRight, Flame, Siren, Eye, MapPin, PanelLeftOpen, PanelRightOpen } from "lucide-react";
import threatHero from "@/assets/threat-hero.jpg";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import HistoryPanel from "@/components/HistoryPanel";
import ChatPanel from "@/components/ChatPanel";
import ToolResultsPanel from "@/components/ToolResultsPanel";

const features = [
  { icon: Flame, title: "Fire & Hazard", desc: "Detect and analyze fire outbreaks, gas leaks, and environmental hazards in real time." },
  { icon: Siren, title: "Crime & Violence", desc: "Assess threats like robbery, assault, snatching, and weapon-related incidents." },
  { icon: Eye, title: "Surveillance", desc: "Monitor live feeds and review incident footage for evidence and tracking." },
  { icon: MapPin, title: "Location Intel", desc: "Map active threats, safe zones, emergency services, and evacuation routes." },
];

const Index = () => {
  const [entered, setEntered] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showTools, setShowTools] = useState(true);
  if (!entered) {
    return (
      <div className="min-h-screen bg-background">
        {/* Nav */}
        <nav className="flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-6 w-6 text-primary" />
            <span className="font-heading text-lg font-bold tracking-tight text-foreground">
              Threat Analyzer
            </span>
          </div>
          <button
            onClick={() => setEntered(true)}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open Dashboard
          </button>
        </nav>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-8 pt-12 pb-16">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <ShieldAlert className="h-3.5 w-3.5" />
                Real-World Threat Intelligence
              </div>
              <h1 className="font-heading text-4xl font-bold leading-tight text-foreground lg:text-5xl">
                Analyze Physical Threats in{" "}
                <span className="text-primary">Real Time</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
                Monitor, assess, and respond to real-world dangers — from fires and natural disasters 
                to criminal activity and public safety incidents. Get actionable intelligence when it matters most.
              </p>
              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setEntered(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Launch Analyzer
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center lg:justify-end">
              <div className="w-72 overflow-hidden rounded-2xl border border-border shadow-lg">
                <img src={threatHero} alt="Threat Analysis Dashboard" className="h-full w-full object-cover" />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-8 pb-20">
          <h2 className="font-heading text-2xl font-bold text-foreground">Capabilities</h2>
          <p className="mt-2 text-muted-foreground">Comprehensive tools for physical threat assessment.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2.5">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-heading text-sm font-bold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border px-8 py-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <span className="text-xs text-muted-foreground">© 2026 Threat Analyzer. All rights reserved.</span>
            <span className="text-xs text-muted-foreground">Physical Threat Intelligence Platform</span>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="flex items-center gap-3">
          <button onClick={() => setEntered(false)} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-sm font-bold tracking-tight text-foreground">
              Threat Analyzer
            </h1>
          </button>
        </div>
          <div className="flex items-center gap-3">
            {!showHistory && (
              <button onClick={() => setShowHistory(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Show History">
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs text-muted-foreground font-medium">System Active</span>
            {!showTools && (
              <button onClick={() => setShowTools(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Show Tool Results">
                <PanelRightOpen className="h-4 w-4" />
              </button>
            )}
          </div>
      </header>

      {/* Panels */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {showHistory && (
            <>
              <ResizablePanel defaultSize={20} minSize={12} maxSize={35}>
                <HistoryPanel onClose={() => setShowHistory(false)} />
              </ResizablePanel>
              <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />
            </>
          )}
          <ResizablePanel defaultSize={showHistory && showTools ? 50 : showHistory || showTools ? 70 : 100} minSize={30}>
            <ChatPanel />
          </ResizablePanel>
          {showTools && (
            <>
              <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />
              <ResizablePanel defaultSize={30} minSize={15} maxSize={45}>
                <ToolResultsPanel onClose={() => setShowTools(false)} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default Index;
