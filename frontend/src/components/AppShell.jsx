import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Map, BarChart3, GraduationCap, Rocket, Music, Compass, Target, LogOut, Route, CalendarCheck, Ear, Briefcase, Flame, FileText, Search } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import ForgeDrawer from "@/components/ForgeDrawer";
import CommandPalette from "@/components/CommandPalette";
import useWakeWord from "@/hooks/useWakeWord";
import { toast } from "sonner";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/roadmap", label: "Roadmap", icon: Map, testid: "nav-roadmap" },
  { to: "/skills", label: "Skills", icon: BarChart3, testid: "nav-skills" },
  { to: "/academics", label: "Academics", icon: GraduationCap, testid: "nav-academics" },
  { to: "/projects", label: "Projects", icon: Rocket, testid: "nav-projects" },
  { to: "/hobbies", label: "Hobbies", icon: Music, testid: "nav-hobbies" },
  { to: "/careers", label: "Careers", icon: Compass, testid: "nav-careers" },
  { to: "/skill-gap", label: "Skill Gap", icon: Target, testid: "nav-skill-gap" },
  { to: "/simulator", label: "Simulator", icon: Route, testid: "nav-simulator" },
  { to: "/placement", label: "Placement", icon: Briefcase, testid: "nav-placement" },
  { to: "/weekly-review", label: "Weekly", icon: CalendarCheck, testid: "nav-weekly" },
  { to: "/streak", label: "Streak", icon: Flame, testid: "nav-streak" },
  { to: "/resume", label: "Resume", icon: FileText, testid: "nav-resume" },
  { to: "/founder", label: "Founder", icon: Rocket, testid: "nav-founder" },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [forgeOpen, setForgeOpen] = useState(false);
  const [autoVoice, setAutoVoice] = useState(false);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [forgeQuestion, setForgeQuestion] = useState("");

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const askForge = useCallback((q) => {
    setForgeQuestion(q);
    setAutoVoice(false);
    setForgeOpen(true);
  }, []);

  const onWake = useCallback(() => {
    setAutoVoice(true);
    setForgeOpen(true);
    toast("Hey Forge — listening.", { icon: "🛰️" });
  }, []);

  useWakeWord({ enabled: wakeEnabled && !forgeOpen, onWake });

  const toggleWake = () => {
    if (!wakeEnabled) {
      // best-effort mic prime so browser grants persistent perm
      navigator.mediaDevices?.getUserMedia?.({ audio: true }).then((s) => s.getTracks().forEach(t => t.stop())).catch(() => {});
      setWakeEnabled(true);
      toast.success('Wake word active. Say "Hey Forge".');
    } else {
      setWakeEnabled(false);
      toast('Wake word off.');
    }
  };

  return (
    <div className="min-h-screen grain flex" data-testid="app-shell">
      <aside className="hidden md:flex w-60 flex-col border-r border-white/10 bg-black sticky top-0 h-screen">
        <Link to="/dashboard" className="p-6 font-display text-lg flex items-center gap-2 border-b border-white/10">
          <div className="w-6 h-6 border border-white/70 flex items-center justify-center"><div className="w-2 h-2 bg-white"/></div>
          PATHFORGE<span className="text-white/40">.AI</span>
        </Link>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((n) => {
            const active = loc.pathname === n.to;
            return (
              <Link key={n.to} to={n.to} data-testid={n.testid} className={`flex items-center gap-3 px-3 py-2 border text-sm transition-colors ${active ? "bg-white text-black border-white" : "border-transparent text-neutral-400 hover:text-white hover:border-white/10"}`}>
                <n.icon className="w-4 h-4"/>{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10 space-y-2">
          <button onClick={() => setPaletteOpen(true)} data-testid="btn-open-search" className="w-full flex items-center justify-between px-3 py-2 border border-white/15 text-xs font-mono-ui text-neutral-400 hover:border-white/50 hover:text-white transition-colors">
            <span className="flex items-center gap-2"><Search className="w-3 h-3"/>SEARCH</span>
            <span className="border border-white/15 px-1 text-[10px]">⌘K</span>
          </button>
          <button onClick={toggleWake} data-testid="btn-wake-toggle" className={`w-full flex items-center gap-2 px-3 py-2 border text-xs font-mono-ui transition-colors ${wakeEnabled ? "bg-white text-black border-white" : "border-white/20 text-neutral-300 hover:border-white/50"}`}>
            <Ear className="w-3 h-3"/>{wakeEnabled ? "WAKE WORD ON" : `SAY "HEY FORGE"`}
          </button>
          <div className="text-xs text-neutral-500 font-mono-ui pt-1">SIGNED IN</div>
          <div className="text-sm truncate">{user?.full_name}</div>
          <div className="text-xs text-neutral-500 truncate">{user?.email}</div>
          <button className="btn-ghost w-full" onClick={() => { logout(); nav("/"); }} data-testid="btn-logout"><LogOut className="inline w-3 h-3 mr-1"/>LOGOUT</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 relative">
        <div className="md:hidden sticky top-0 z-30 border-b border-white/10 bg-black/90 backdrop-blur-md px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="font-display text-base flex items-center gap-2"><div className="w-5 h-5 border border-white/70 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-white"/></div>PATHFORGE</Link>
          <div className="flex items-center gap-2">
            <button onClick={() => setPaletteOpen(true)} data-testid="btn-open-search-mobile" className="p-2 border border-white/20 text-white/70"><Search className="w-3 h-3"/></button>
            <button onClick={toggleWake} data-testid="btn-wake-toggle-mobile" className={`p-2 border ${wakeEnabled ? "border-white bg-white text-black" : "border-white/20 text-white/70"}`}><Ear className="w-3 h-3"/></button>
            <select value={loc.pathname} onChange={(e) => nav(e.target.value)} className="bg-black border border-white/15 text-xs font-mono-ui px-2 py-1" data-testid="mobile-nav-select">
              {NAV.map((n) => <option key={n.to} value={n.to}>{n.label}</option>)}
            </select>
          </div>
        </div>
        <div className="p-6 md:p-10">{children}</div>

        <button onClick={() => { setAutoVoice(false); setForgeOpen(true); }} data-testid="forge-open" aria-label="Open Forge" className="arc-fab fixed bottom-6 right-6 z-40 w-16 h-16 flex items-center justify-center hover:scale-105 transition-transform">
          <div className="arc-core"/>
        </button>
        <ForgeDrawer open={forgeOpen} onClose={() => { setForgeOpen(false); setAutoVoice(false); setForgeQuestion(""); }} autoStartVoice={autoVoice} initialQuestion={forgeQuestion}/>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAskForge={askForge}/>
      </main>
    </div>
  );
}
