import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function CareerExplorer() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await api.get(`/careers?q=${encodeURIComponent(q)}`);
      setItems(data.careers || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6" data-testid="careers-page">
      <div className="mono-label">// career explorer</div>
      <h1 className="font-display text-4xl tracking-tighter">Widen your options.</h1>
      <input placeholder="SEARCH CAREERS, SKILLS, INDUSTRIES..." value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent border border-white/15 focus:border-white outline-none px-4 py-3 text-sm font-mono-ui" data-testid="career-search"/>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
        {items.map((c, i) => (
          <button key={c.id} onClick={() => setSel(c)} className="text-left bg-black p-5 hover:bg-white/[0.02] transition-colors" data-testid={`career-${i}`}>
            <div className="mono-label mb-2 text-neutral-500">{c.industries.join(" · ")}</div>
            <div className="font-display text-xl mb-2">{c.name}</div>
            <div className="text-neutral-400 text-sm">{c.summary}</div>
          </button>
        ))}
      </div>

      {sel && (
        <div className="card-surface p-8" data-testid="career-detail">
          <div className="mono-label mb-2 text-neutral-500">{sel.industries.join(" · ")}</div>
          <h2 className="font-display text-3xl mb-2">{sel.name}</h2>
          <p className="text-neutral-400 mb-4">{sel.summary}</p>
          <div className="mono-label mb-2">CORE SKILLS</div>
          <div className="flex flex-wrap gap-2">{sel.skills.map((s, i) => <span key={i} className="px-2 py-1 border border-white/15 text-xs font-mono-ui">{s}</span>)}</div>
        </div>
      )}
    </div>
  );
}
