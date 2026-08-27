import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import StreakWidget from "@/components/StreakWidget";

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/dashboard"); setD(data); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const regenPlan = async () => {
    setGenerating(true);
    try { await api.post("/planner/today"); await load(); toast.success("Today's plan updated"); }
    catch { toast.error("Plan generation failed"); }
    finally { setGenerating(false); }
  };

  if (loading || !d) return <div className="text-neutral-500 font-mono-ui text-xs">LOADING DASHBOARD...</div>;

  const dir = d.career_direction;
  const plan = d.today_plan;
  const first = d.user?.full_name?.split(" ")[0] || "there";

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="mono-label mb-2">// good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}</div>
          <h1 className="font-display text-5xl tracking-tighter leading-none">{first}.</h1>
          <div className="text-neutral-400 mt-3">Here's where you are, right now.</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={regenPlan} disabled={generating} data-testid="btn-regen-plan"><RefreshCw className={`inline w-3 h-3 mr-1 ${generating ? "animate-spin" : ""}`}/>{generating ? "GENERATING..." : "REGEN TODAY'S PLAN"}</button>
        </div>
      </header>

      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
        <Stat label="Career Direction" value={dir?.name || "TBD"} sub={dir?.score ? `${dir.score}% match` : "run interview →"} link="/roadmap" testid="stat-career"/>
        <Stat label="Roadmap Progress" value={`${d.roadmap_progress || 0}%`} sub={`${d.nodes_completed}/${d.nodes_total} nodes`} link="/roadmap" testid="stat-progress"/>
        <Stat label="CGPA" value={d.cgpa ?? "—"} sub="latest average" link="/academics" testid="stat-cgpa"/>
        <Stat label="Health Score" value={d.health_score} sub="roadmap · academics · projects" link="/roadmap" testid="stat-health"/>
      </section>

      <section className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-surface p-6" data-testid="today-plan">
          <div className="flex justify-between items-center mb-4">
            <div className="mono-label">// what should i do today</div>
            <div className="text-xs text-neutral-500 font-mono-ui">{plan?.total_minutes ? `${plan.total_minutes} MIN` : ""}</div>
          </div>
          {!plan && <div className="text-neutral-500 text-sm">No plan yet. <button className="underline text-white" onClick={regenPlan} data-testid="gen-first-plan">Generate today's plan →</button></div>}
          {plan?.greeting && <div className="font-mono-ui text-sm text-white/80 mb-4">{plan.greeting}</div>}
          <div className="space-y-3">
            {(plan?.tasks || []).map((t, i) => (
              <div key={i} className="p-4 border border-white/10 hover:border-white/30 transition-colors">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div className="mono-label mb-1 text-neutral-500">PRIORITY {t.priority} · {t.kind?.toUpperCase()}</div>
                    <div className="font-display text-lg">{t.title}</div>
                    <div className="text-neutral-400 text-sm mt-1">{t.why}</div>
                  </div>
                  <div className="font-mono-ui text-xs text-white/60 whitespace-nowrap">{t.minutes} MIN</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card-surface p-6" data-testid="quick-links">
          <div className="mono-label mb-4">// quick actions</div>
          <div className="space-y-2">
            <QuickLink to="/roadmap" title="Open Roadmap" desc="See your personalised map."/>
            <QuickLink to="/placement" title="Placement Simulator" desc="Score readiness vs target companies."/>
            <QuickLink to="/skill-gap" title="Skill Gap" desc="What's between you and your target."/>
            <QuickLink to="/skills" title="Log a Skill" desc="Level up. Persistently."/>
            <QuickLink to="/academics" title="Log a Subject" desc="Keep your CGPA up-to-date."/>
            <QuickLink to="/projects" title="Add a Project" desc="Build portfolio value."/>
            <QuickLink to="/careers" title="Explore Careers" desc="Widen your options."/>
          </div>
        </div>
      </section>

      <section>
        <StreakWidget/>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, link, testid }) {
  return (
    <Link to={link} data-testid={testid} className="bg-black p-6 hover:bg-white/[0.02] transition-colors block">
      <div className="mono-label mb-3">{label}</div>
      <div className="font-display text-3xl mb-1">{value}</div>
      <div className="text-neutral-500 text-xs">{sub}</div>
    </Link>
  );
}
function QuickLink({ to, title, desc }) {
  return (
    <Link to={to} className="block p-3 border border-white/10 hover:border-white/40 transition-colors">
      <div className="font-mono-ui text-sm text-white">{title}</div>
      <div className="text-neutral-500 text-xs">{desc}</div>
    </Link>
  );
}
