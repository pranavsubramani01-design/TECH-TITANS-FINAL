import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Flame, Lock, Trophy } from "lucide-react";

export default function StreakPage() {
  const [d, setD] = useState(null);
  const nav = useNavigate();
  // mount-only fetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { (async () => { const { data } = await api.get("/streak"); setD(data); })(); }, []);
  if (!d) return <div className="text-neutral-500 font-mono-ui text-xs">LOADING...</div>;

  const percent = d.next_perk ? Math.min(100, Math.round((d.longest_streak / d.next_perk.days) * 100)) : 100;
  const allPerks = [
    { days: 3,  id: "spark",       name: "Spark",       desc: "Momentum ignited. Your first micro-badge." },
    { days: 7,  id: "momentum",    name: "Momentum",    desc: "One full week. Forge tunes tasks to your energy." },
    { days: 14, id: "focus",       name: "Focus",       desc: "Two weeks. Priority tag unlocked for tasks." },
    { days: 30, id: "discipline",  name: "Discipline",  desc: "A month clean. Advanced weekly analytics unlocked." },
    { days: 60, id: "legend",      name: "Legend",      desc: "Sixty days. Forge grants the golden arc-reactor ring." },
    { days: 100,id: "singularity", name: "Singularity", desc: "One hundred consecutive check-ins. You are the roadmap." },
  ];
  const unlockedIds = new Set((d.unlocked_perks || []).map(p => p.id));

  return (
    <div className="space-y-8" data-testid="streak-page">
      <div>
        <div className="mono-label mb-2">// streak & perks</div>
        <h1 className="font-display text-4xl tracking-tighter">Keep the streak.</h1>
      </div>

      <div className="grid md:grid-cols-3 gap-px bg-white/10">
        <StreakStat label="CURRENT" value={d.current_streak} unit="days" testid="stat-current"/>
        <StreakStat label="LONGEST" value={d.longest_streak} unit="days" testid="stat-longest"/>
        <StreakStat label="TOTAL CHECK-INS" value={d.total_checkins} unit="days" testid="stat-total"/>
      </div>

      {d.next_perk && (
        <div className="card-surface p-6" data-testid="next-perk">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="mono-label mb-1 text-neutral-500">NEXT PERK</div>
              <div className="font-display text-2xl">{d.next_perk.name}</div>
              <div className="text-neutral-400 text-sm">{d.next_perk.desc}</div>
            </div>
            <div className="text-right">
              <div className="mono-label text-neutral-500">DAYS TO GO</div>
              <div className="font-display text-4xl">{d.days_to_next}</div>
            </div>
          </div>
          <div className="h-px bg-white/10"><div className="h-px bg-white transition-all" style={{ width: `${percent}%` }}/></div>
        </div>
      )}

      <div>
        <div className="mono-label mb-3">// perks</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
          {allPerks.map((p, i) => {
            const unlocked = unlockedIds.has(p.id);
            return (
              <div key={p.id} className={`p-6 ${unlocked ? "bg-white text-black" : "bg-black"}`} data-testid={`perk-${p.id}`}>
                <div className="flex justify-between items-start mb-3">
                  <div className={`mono-label ${unlocked ? "text-black/60" : "text-neutral-500"}`}>{p.days} DAYS</div>
                  {unlocked ? <Trophy className="w-4 h-4"/> : <Lock className="w-4 h-4 text-white/40"/>}
                </div>
                <div className="font-display text-2xl mb-1">{p.name}</div>
                <div className={`text-sm ${unlocked ? "text-black/70" : "text-neutral-400"}`}>{p.desc}</div>
                {!unlocked && <div className="mt-3 mono-label text-neutral-600">LOCKED</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-surface p-6">
        <div className="flex items-center gap-3 mb-3"><Flame className="w-5 h-5"/><div className="font-display text-xl">Keep it alive</div></div>
        <div className="text-neutral-400 text-sm mb-4">The streak grows by 1 for every day you complete a check-in. Miss two days in a row and the count resets.</div>
        <button className="btn-primary" onClick={() => nav("/dashboard")} data-testid="streak-checkin">GO CHECK IN →</button>
      </div>
    </div>
  );
}

function StreakStat({ label, value, unit, testid }) {
  return (
    <div className="bg-black p-6" data-testid={testid}>
      <div className="mono-label mb-2 text-neutral-500 flex items-center gap-2"><Flame className="w-3 h-3"/>{label}</div>
      <div className="font-display text-5xl tracking-tighter">{value}</div>
      <div className="mono-label text-neutral-500 mt-1">{unit}</div>
    </div>
  );
}
