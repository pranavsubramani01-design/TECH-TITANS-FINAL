import { useEffect, useState } from "react";
import api from "@/lib/api";

const PRIORITY_COLOR = { high: "bg-white text-black", medium: "border border-white text-white", low: "border border-white/30 text-white/70" };

export default function SkillGapPage() {
  const [state, setState] = useState({ gaps: [], current_skills: [], target: "TBD" });
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const { data } = await api.get("/skill-gap"); setState(data); setLoading(false); })(); }, []);

  if (loading) return <div className="text-neutral-500 font-mono-ui text-xs">LOADING...</div>;

  return (
    <div className="space-y-6" data-testid="skill-gap-page">
      <div className="mono-label">// skill-gap analysis</div>
      <h1 className="font-display text-4xl tracking-tighter">What am I missing?</h1>
      <div className="text-neutral-400">Target career: <span className="text-white font-mono-ui">{state.target}</span></div>

      {state.gaps.length === 0 && <div className="card-surface p-6 text-neutral-500">Run the AI interview to generate skill-gap analysis.</div>}
      <div className="grid md:grid-cols-2 gap-px bg-white/10">
        {state.gaps.map((g, i) => (
          <div key={i} className="bg-black p-5" data-testid={`gap-${i}`}>
            <div className="flex justify-between items-start mb-2">
              <div className="font-display text-xl">{g.skill}</div>
              <span className={`text-xs px-2 py-0.5 font-mono-ui ${PRIORITY_COLOR[(g.priority || "medium").toLowerCase()] || PRIORITY_COLOR.medium}`}>{(g.priority || "medium").toUpperCase()}</span>
            </div>
            <div className="mono-label text-neutral-500">CURRENT → TARGET</div>
            <div className="font-mono-ui text-sm mt-1">{g.current} → {g.target}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
