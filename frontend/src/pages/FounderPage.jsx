import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Rocket, Sparkles, Trash2, AlertTriangle, Plus } from "lucide-react";

const TYPES = [
  { v: "interview", l: "CUSTOMER INTERVIEW" },
  { v: "hypothesis", l: "HYPOTHESIS" },
  { v: "experiment", l: "EXPERIMENT" },
  { v: "mvp_scope", l: "MVP SCOPE" },
  { v: "metric", l: "METRIC" },
];
const OUTCOMES = ["pending", "validated", "invalidated", "inconclusive"];
const OUTCOME_STYLE = {
  validated: "border-white bg-white text-black",
  invalidated: "border-white/25 text-white/50",
  inconclusive: "border-white/40 text-white/70",
  pending: "border-white/15 text-white/50",
};

export default function FounderPage() {
  const [rm, setRm] = useState(null);
  const [idea, setIdea] = useState("");
  const [gen, setGen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [counts, setCounts] = useState({});
  const [form, setForm] = useState({ type: "interview", title: "", notes: "", outcome: "pending" });
  const [insights, setInsights] = useState(null);
  const [insBusy, setInsBusy] = useState(false);

  const loadLog = async () => {
    const { data } = await api.get("/founder/log");
    setEntries(data.entries || []); setCounts(data.counts || {});
  };

  useEffect(() => {
    (async () => {
      try {
        const [a, b, c] = await Promise.all([
          api.get("/founder/roadmap"), api.get("/founder/log"), api.get("/founder/insights/latest"),
        ]);
        setRm(a.data.roadmap); if (a.data.roadmap?.idea) setIdea(a.data.roadmap.idea);
        setEntries(b.data.entries || []); setCounts(b.data.counts || {});
        setInsights(c.data.insights);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const generate = async () => {
    setGen(true);
    try {
      const { data } = await api.post("/ai/generate-founder-roadmap", { idea: idea.trim(), horizon_months: 12 });
      setRm(data.roadmap); toast.success("Founder track built");
    } catch { toast.error("Generation failed"); }
    finally { setGen(false); }
  };

  const addEntry = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Add a title");
    try {
      await api.post("/founder/log", { ...form, title: form.title.trim() });
      setForm({ type: form.type, title: "", notes: "", outcome: "pending" });
      await loadLog(); toast.success("Logged");
    } catch { toast.error("Could not log entry"); }
  };

  const del = async (id) => {
    try { await api.delete(`/founder/log/${id}`); await loadLog(); } catch { toast.error("Delete failed"); }
  };

  const runInsights = async () => {
    setInsBusy(true);
    try { const { data } = await api.post("/founder/insights"); setInsights(data.insights); toast.success("Signal analysed"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Analysis failed"); }
    finally { setInsBusy(false); }
  };

  if (loading) return <div className="font-mono-ui text-xs text-neutral-500">LOADING FOUNDER TRACK...</div>;

  return (
    <div className="space-y-10" data-testid="founder-page">
      <header>
        <div className="mono-label mb-2">// founder track</div>
        <h1 className="font-display text-4xl tracking-tighter">Build the company.</h1>
        <p className="text-neutral-400 mt-2 max-w-2xl">Customer discovery → validation → MVP → traction → pitch. Same discipline as the job track, different game.</p>
      </header>

      <section className="card-surface p-5 space-y-3">
        <div className="mono-label">{rm ? "REBUILD TRACK" : "YOUR IDEA (OPTIONAL)"}</div>
        <div className="flex flex-col md:flex-row gap-2">
          <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. attendance app for coaching centres — or leave blank and Forge finds a fit"
            className="input-dark flex-1" data-testid="founder-idea-input" />
          <button className="btn-primary whitespace-nowrap" onClick={generate} disabled={gen} data-testid="btn-generate-founder">
            <Rocket className="inline w-3 h-3 mr-1" />{gen ? "BUILDING..." : rm ? "REGENERATE" : "BUILD FOUNDER TRACK"}
          </button>
        </div>
      </section>

      {rm && (
        <>
          {rm.thesis && (
            <div className="border border-white/10 p-5">
              <div className="mono-label mb-2">THESIS</div>
              <div className="font-display text-xl">{rm.thesis}</div>
            </div>
          )}

          {(rm.first_week || []).length > 0 && (
            <section>
              <div className="mono-label mb-3">FIRST WEEK</div>
              <div className="grid md:grid-cols-3 gap-px bg-white/10">
                {rm.first_week.map((f, i) => (
                  <div key={i} className="bg-black p-4" data-testid={`founder-week-${i}`}>
                    <div className="font-mono-ui text-xs text-neutral-500 mb-2">0{i + 1}</div>
                    <div className="text-sm">{f}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mono-label mb-3">PHASES</div>
            <div className="space-y-px bg-white/10">
              {(rm.phases || []).map((p) => (
                <div key={p.phase} className="bg-black p-5" data-testid={`founder-phase-${p.phase}`}>
                  <div className="flex justify-between items-baseline flex-wrap gap-2 mb-3">
                    <div className="font-display text-xl">P{p.phase} · {p.label}</div>
                    <div className="font-mono-ui text-xs text-neutral-500">{p.window}</div>
                  </div>
                  <div className="text-neutral-300 text-sm mb-4">{p.goal}</div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <Block title="MILESTONES" items={p.milestones} />
                    <Block title="METRICS" items={p.metrics} />
                    <Block title="RISKS" items={p.risks} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="mono-label">MILESTONE NODES</div>
              <a href="/roadmap" className="font-mono-ui text-[10px] text-neutral-500 hover:text-white">OPEN CANVAS ON ROADMAP →</a>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
              {(rm.nodes || []).map((n, i) => (
                <div key={n.id} className="bg-black p-4" data-testid={`founder-node-${i}`}>
                  <div className="mono-label mb-2 text-neutral-500">{n.category?.toUpperCase()} · {n.status?.replace("_", " ").toUpperCase()}</div>
                  <div className="font-display text-base mb-1">{n.title}</div>
                  <div className="text-neutral-400 text-sm">{n.why}</div>
                  <div className="mt-2 font-mono-ui text-xs text-neutral-600">{n.est_hours}h · {n.difficulty}</div>
                </div>
              ))}
            </div>
          </section>

          {rm.disclaimer && (
            <div className="flex gap-2 text-xs text-neutral-500 border border-white/10 p-3">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{rm.disclaimer}
            </div>
          )}
        </>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="mono-label mb-1">VALIDATION LOG</div>
            <div className="font-display text-2xl">Evidence, not vibes.</div>
          </div>
          <div className="flex gap-4 font-mono-ui text-xs text-neutral-500">
            <span data-testid="count-validated">VALIDATED {counts.validated || 0}</span>
            <span data-testid="count-invalidated">INVALIDATED {counts.invalidated || 0}</span>
            <span data-testid="count-total">TOTAL {entries.length}</span>
          </div>
        </div>

        <form onSubmit={addEntry} className="card-surface p-5 grid md:grid-cols-[180px_1fr_170px_auto] gap-2 items-start" data-testid="founder-log-form">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-dark" data-testid="log-type">
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <div className="space-y-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What did you learn / test?" className="input-dark w-full" data-testid="log-title" />
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes — quotes, numbers, who you spoke to" className="input-dark w-full" data-testid="log-notes" />
          </div>
          <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} className="input-dark" data-testid="log-outcome">
            {OUTCOMES.map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
          </select>
          <button className="btn-primary" data-testid="btn-add-log"><Plus className="inline w-3 h-3 mr-1" />LOG</button>
        </form>

        {entries.length === 0 ? (
          <div className="font-mono-ui text-xs text-neutral-600">NO ENTRIES YET — LOG YOUR FIRST CUSTOMER CONVERSATION.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-px bg-white/10">
            {entries.map((e, i) => (
              <div key={e.id} className="bg-black p-4 flex justify-between gap-3" data-testid={`log-entry-${i}`}>
                <div className="min-w-0">
                  <div className="mono-label mb-1 text-neutral-500">{e.type?.replace("_", " ").toUpperCase()}</div>
                  <div className="text-sm mb-1">{e.title}</div>
                  {e.notes && <div className="text-xs text-neutral-500 whitespace-pre-wrap">{e.notes}</div>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`px-2 py-0.5 border font-mono-ui text-[10px] ${OUTCOME_STYLE[e.outcome] || OUTCOME_STYLE.pending}`}>{e.outcome?.toUpperCase()}</span>
                  <button onClick={() => del(e.id)} data-testid={`log-delete-${i}`} className="text-neutral-600 hover:text-white"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn-ghost" onClick={runInsights} disabled={insBusy || entries.length === 0} data-testid="btn-founder-insights">
          <Sparkles className="inline w-3 h-3 mr-1" />{insBusy ? "ANALYSING..." : "ANALYSE SIGNAL"}
        </button>
      </section>

      {insights && (
        <section className="space-y-5" data-testid="founder-insights">
          <div className="grid md:grid-cols-2 gap-px bg-white/10">
            <div className="bg-black p-5">
              <div className="mono-label mb-2">SIGNAL STRENGTH</div>
              <div className="font-display text-5xl">{insights.signal_strength}<span className="text-lg text-neutral-500">/100</span></div>
              <div className="h-1 bg-white/10 mt-3"><div className="h-1 bg-white" style={{ width: `${insights.signal_strength}%` }} /></div>
            </div>
            <div className="bg-black p-5">
              <div className="mono-label mb-2">STAGE</div>
              <div className="font-display text-2xl">{insights.stage?.replace(/-/g, " ")}</div>
              <div className="text-sm text-neutral-400 mt-3">{insights.kill_or_continue}</div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
            <Block box title="PATTERNS" items={insights.patterns} />
            <Block box title="VALIDATED" items={insights.validated} />
            <Block box title="INVALIDATED" items={insights.invalidated} />
            <Block box title="BLIND SPOTS" items={insights.blind_spots} />
          </div>
          {(insights.next_experiments || []).length > 0 && (
            <div>
              <div className="mono-label mb-3">NEXT EXPERIMENTS</div>
              <div className="grid md:grid-cols-3 gap-px bg-white/10">
                {insights.next_experiments.map((x, i) => (
                  <div key={i} className="bg-black p-4" data-testid={`next-exp-${i}`}>
                    <div className="flex justify-between mb-2"><div className="font-mono-ui text-xs text-neutral-500">EXP {i + 1}</div><div className="font-mono-ui text-xs">{x.effort}</div></div>
                    <div className="font-display text-base mb-1">{x.title}</div>
                    <div className="text-sm text-neutral-400">{x.why}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {insights.disclaimer && <div className="text-xs text-neutral-600">{insights.disclaimer}</div>}
        </section>
      )}
    </div>
  );
}

function Block({ title, items, box }) {
  if (!(items || []).length) return null;
  return (
    <div className={box ? "bg-black p-4" : ""}>
      <div className="mono-label mb-2 text-neutral-500">{title}</div>
      <ul className="text-sm text-white/80 space-y-1">{items.map((x, i) => <li key={i}>· {x}</li>)}</ul>
    </div>
  );
}
