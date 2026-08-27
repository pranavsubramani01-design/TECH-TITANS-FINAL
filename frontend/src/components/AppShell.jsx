import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Map, BarChart3, GraduationCap, Rocket, Music, Compass, Target, LogOut } from "lucide-react";
import { useState } from "react";
import ForgeDrawer from "@/components/ForgeDrawer";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/roadmap", label: "Roadmap", icon: Map, testid: "nav-roadmap" },
  { to: "/skills", label: "Skills", icon: BarChart3, testid: "nav-skills" },
  { to: "/academics", label: "Academics", icon: GraduationCap, testid: "nav-academics" },
  { to: "/projects", label: "Projects", icon: Rocket, testid: "nav-projects" },
  { to: "/hobbies", label: "Hobbies", icon: Music, testid: "nav-hobbies" },
  { to: "/careers", label: "Careers", icon: Compass, testid: "nav-careers" },
  { to: "/skill-gap", label: "Skill Gap", icon: Target, testid: "nav-skill-gap" },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [forgeOpen, setForgeOpen] = useState(false);

  return (
    <div className="min-h-screen grain flex" data-testid="app-shell">
      <aside className="hidden md:flex w-60 flex-col border-r border-white/10 bg-black sticky top-0 h-screen">
        <Link to="/dashboard" className="p-6 font-display text-lg flex items-center gap-2 border-b border-white/10">
          <div className="w-6 h-6 border border-white/70 flex items-center justify-center"><div className="w-2 h-2 bg-white"/></div>
          PATHFORGE<span className="text-white/40">.AI</span>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => {
            const active = loc.pathname === n.to;
            return (
              <Link key={n.to} to={n.to} data-testid={n.testid} className={`flex items-center gap-3 px-3 py-2 border text-sm transition-colors ${active ? "bg-white text-black border-white" : "border-transparent text-neutral-400 hover:text-white hover:border-white/10"}`}>
                <n.icon className="w-4 h-4"/>{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-neutral-500 font-mono-ui mb-1">SIGNED IN</div>
          <div className="text-sm truncate">{user?.full_name}</div>
          <div className="text-xs text-neutral-500 truncate mb-3">{user?.email}</div>
          <button className="btn-ghost w-full" onClick={() => { logout(); nav("/"); }} data-testid="btn-logout"><LogOut className="inline w-3 h-3 mr-1"/>LOGOUT</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 relative">
        <div className="md:hidden sticky top-0 z-30 border-b border-white/10 bg-black/90 backdrop-blur-md px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="font-display text-base flex items-center gap-2"><div className="w-5 h-5 border border-white/70 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-white"/></div>PATHFORGE</Link>
          <select value={loc.pathname} onChange={(e) => nav(e.target.value)} className="bg-black border border-white/15 text-xs font-mono-ui px-2 py-1" data-testid="mobile-nav-select">
            {NAV.map((n) => <option key={n.to} value={n.to}>{n.label}</option>)}
          </select>
        </div>
        <div className="p-6 md:p-10">{children}</div>

        <button onClick={() => setForgeOpen(true)} data-testid="forge-open" aria-label="Open Forge" className="arc-fab fixed bottom-6 right-6 z-40 w-16 h-16 flex items-center justify-center hover:scale-105 transition-transform">
          <div className="arc-core"/>
        </button>
        <ForgeDrawer open={forgeOpen} onClose={() => setForgeOpen(false)}/>
      </main>
    </div>
  );
}
