import { useEffect, useState, useMemo, useCallback } from "react";
import api from "@/lib/api";
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import { toast } from "sonner";
import { X, PlayCircle, Check, SkipForward, Sparkles } from "lucide-react";

const STATUS_COLORS = {
  locked: { bg: "#0a0a0a", border: "rgba(255,255,255,0.08)", text: "#525252" },
  available: { bg: "#0a0a0a", border: "rgba(255,255,255,0.35)", text: "#fff" },
  recommended: { bg: "#141414", border: "#fff", text: "#fff" },
  in_progress: { bg: "#1f1f1f", border: "#fff", text: "#fff" },
  completed: { bg: "#fff", border: "#fff", text: "#000" },
};

function makeNodes(nodes) {
  const cols = 4;
  return (nodes || []).map((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const c = STATUS_COLORS[n.status] || STATUS_COLORS.locked;
    return {
      id: n.id,
      position: { x: col * 260, y: row * 160 },
      data: { label: (
        <div style={{ padding: 12, background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontFamily: "JetBrains Mono, monospace" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", opacity: 0.6, marginBottom: 6 }}>{n.category?.toUpperCase()}</div>
          <div style={{ fontSize: 13, fontFamily: "Outfit, sans-serif", lineHeight: 1.2 }}>{n.title}</div>
          <div style={{ fontSize: 10, marginTop: 6, opacity: 0.7 }}>{n.status?.replace("_", " ").toUpperCase()}</div>
        </div>
      ), raw: n },
      style: { padding: 0, border: 0, background: "transparent", width: 220 },
    };
  });
}
function makeEdges(nodes) {
  const edges = [];
  (nodes || []).forEach((n) => (n.prerequisites || []).forEach((p) => {
    edges.push({ id: `${p}-${n.id}`, source: p, target: n.id, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, color: "#fff" }, style: { stroke: "rgba(255,255,255,0.25)", strokeDasharray: "4 4" } });
  }));
  return edges;
}

export default function RoadmapPage() {
  const [rm, setRm] = useState(null);
  const [founderRm, setFounderRm] = useState(null);
  const [track, setTrack] = useState("job");
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState(false);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState("map");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const load = async () => {
    try {
      const [a, b] = await Promise.all([api.get("/roadmap"), api.get("/founder/roadmap")]);
      setRm(a.data.roadmap); setFounderRm(b.data.roadmap);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const isFounder = track === "founder";
  const current = isFounder ? founderRm : rm;

  const generate = async () => {
    setGen(true);
    try {
      if (isFounder) {
        const { data } = await api.post("/ai/generate-founder-roadmap", { idea: "", horizon_months: 12 });
        setFounderRm(data.roadmap);
      } else {
        const { data } = await api.post("/ai/generate-roadmap");
        setRm(data.roadmap);
      }
      toast.success(isFounder ? "Founder track generated" : "Roadmap generated");
    }
    catch (e) { toast.error(e?.response?.data?.detail || "Generation failed"); }
    finally { setGen(false); }
  };

  const updateStatus = async (node_id, status) => {
    try {
      const { data } = await api.post(isFounder ? "/founder/node" : "/roadmap/node", { node_id, status });
      if (isFounder) setFounderRm(data.roadmap); else setRm(data.roadmap);
      if (sel) setSel(data.roadmap.nodes.find(n => n.id === node_id));
      toast.success(`Marked ${status.replace("_", " ")}`);
    }
    catch { toast.error("Update failed"); }
  };

  const filteredNodes = useMemo(() => {
    if (!current?.nodes) return [];
    let n = current.nodes;
    if (filter !== "all") n = n.filter(x => x.status === filter);
    if (q.trim()) n = n.filter(x => (x.title + " " + x.category).toLowerCase().includes(q.toLowerCase()));
    return n;
  }, [current, filter, q]);

  const rfNodes = useMemo(() => makeNodes(filteredNodes), [filteredNodes]);
  const rfEdges = useMemo(() => makeEdges(filteredNodes), [filteredNodes]);

  const onNodeClick = useCallback((_e, node) => setSel(node.data.raw), []);

  const TrackToggle = (
    <div className="flex border border-white/15" data-testid="track-toggle">
      {[["job", "JOB TRACK"], ["founder", "FOUNDER TRACK"]].map(([t, label]) => (
        <button key={t} onClick={() => { setTrack(t); setSel(null); setFilter("all"); setView("map"); }} data-testid={`track-${t}`}
          className={`px-3 py-2 text-xs font-mono-ui transition-colors ${track === t ? "bg-white text-black" : "text-neutral-400 hover:text-white"}`}>{label}</button>
      ))}
    </div>
  );

  if (loading) return <div className="text-neutral-500 font-mono-ui text-xs">LOADING ROADMAP...</div>;

  if (!current) return (
    <div className="max-w-2xl space-y-6">
      {TrackToggle}
      <div>
        <div className="mono-label mb-2">// {isFounder ? "no founder track yet" : "no roadmap yet"}</div>
        <h1 className="font-display text-3xl mb-4">{isFounder ? "Build your founder track" : "Generate your personalised roadmap"}</h1>
        <p className="text-neutral-400 mb-6">{isFounder
          ? "Customer discovery, validation, MVP, traction and pitch readiness — grounded in your real skills and time."
          : "Forge will use your profile, career direction, current skills and available time to build a 4-year path."}</p>
        <button className="btn-primary" onClick={generate} disabled={gen} data-testid="btn-generate-roadmap">{gen ? "GENERATING..." : isFounder ? "BUILD FOUNDER TRACK" : "GENERATE ROADMAP"}</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="roadmap-page">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="mono-label mb-2">// {isFounder ? `founder track · ${current.idea || "unscoped idea"}` : `roadmap · ${current.target_career}`}</div>
          <h1 className="font-display text-4xl tracking-tighter">{isFounder ? "Your Venture." : "Your Path."}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {TrackToggle}
          <input placeholder="SEARCH..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-transparent border border-white/15 px-3 py-2 text-xs font-mono-ui" data-testid="rm-search"/>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-black border border-white/15 px-3 py-2 text-xs font-mono-ui" data-testid="rm-filter">
            {["all","recommended","available","in_progress","completed","locked"].map(f => <option key={f} value={f}>{f.replace("_", " ").toUpperCase()}</option>)}
          </select>
          <div className="flex border border-white/15">
            {(isFounder ? ["map","list"] : ["map","list","timeline"]).map(v => (
              <button key={v} onClick={() => setView(v)} data-testid={`view-${v}`} className={`px-3 py-2 text-xs font-mono-ui ${view === v ? "bg-white text-black" : "text-neutral-400"}`}>{v.toUpperCase()}</button>
            ))}
          </div>
          <button className="btn-ghost" onClick={generate} disabled={gen} data-testid="btn-regen-roadmap">{gen ? "REGEN..." : "REGENERATE"}</button>
        </div>
      </header>

      {isFounder && (
        <a href="/founder" className="inline-block font-mono-ui text-[10px] text-neutral-500 hover:text-white" data-testid="link-founder-page">OPEN FULL FOUNDER WORKSPACE (PHASES + VALIDATION LOG) →</a>
      )}

      {view === "map" && (
        <div className="card-surface" style={{ height: 620 }}>
          <ReactFlow nodes={rfNodes} edges={rfEdges} onNodeClick={onNodeClick} fitView proOptions={{ hideAttribution: true }}>
            <Background color="rgba(255,255,255,0.06)" gap={24}/>
            <Controls showInteractive={false}/>
          </ReactFlow>
        </div>
      )}

      {view === "list" && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
          {filteredNodes.map((n, i) => (
            <button key={n.id} onClick={() => setSel(n)} data-testid={`rm-list-${i}`} className="text-left bg-black p-5 hover:bg-white/[0.02] transition-colors">
              <div className="mono-label mb-2 text-neutral-500">{n.category?.toUpperCase()} · {n.status?.replace("_", " ").toUpperCase()}</div>
              <div className="font-display text-lg mb-1">{n.title}</div>
              <div className="text-neutral-400 text-sm">{n.why}</div>
              <div className="mt-3 flex gap-3 text-xs text-neutral-500 font-mono-ui">
                <span>{n.est_hours}h</span><span>{n.difficulty}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {view === "timeline" && (
        <div className="space-y-8">
          {(current.years || []).map((y) => (
            <div key={y.year} data-testid={`year-${y.year}`}>
              <div className="mono-label mb-3">YEAR {y.year} · {y.label}</div>
              <div className="grid md:grid-cols-2 gap-px bg-white/10">
                {(y.semesters || []).map((s, i) => (
                  <div key={i} className="bg-black p-5">
                    <div className="font-display text-lg mb-2">S{s.semester} · {s.title}</div>
                    {[["ACADEMICS", s.academics], ["SKILLS", s.skills], ["PROJECTS", s.projects], ["CAREER", s.career]].map(([k, arr]) => (arr || []).length > 0 && (
                      <div key={k} className="mb-3">
                        <div className="mono-label mb-1 text-neutral-500">{k}</div>
                        <ul className="text-sm text-white/80 space-y-1">{arr.map((x, j) => <li key={`${x}-${j}`}>· {x}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="node-detail">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSel(null)}/>
          <div className="relative w-full sm:w-[520px] bg-black border-l border-white/10 overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-start">
              <div>
                <div className="mono-label mb-2 text-neutral-500">{sel.category?.toUpperCase()} · {sel.status?.replace("_", " ").toUpperCase()}</div>
                <div className="font-display text-3xl tracking-tight">{sel.title}</div>
              </div>
              <button onClick={() => setSel(null)} data-testid="node-close"><X className="w-4 h-4 text-neutral-400"/></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <div className="mono-label mb-2">WHY YOU NEED THIS</div>
                <div className="text-white/90">{sel.why}</div>
              </div>
              <div className="grid grid-cols-3 gap-px bg-white/10">
                <Meta k="EST" v={`${sel.est_hours}h`}/>
                <Meta k="LEVEL" v={sel.difficulty}/>
                <Meta k="STATUS" v={sel.status?.replace("_", " ")}/>
              </div>
              {(sel.skills || []).length > 0 && (
                <div>
                  <div className="mono-label mb-2">SKILLS DEVELOPED</div>
                  <div className="flex flex-wrap gap-2">{sel.skills.map((s, i) => <span key={`${s}-${i}`} className="px-2 py-1 border border-white/15 text-xs font-mono-ui">{s}</span>)}</div>
                </div>
              )}
              {(sel.tasks || []).length > 0 && (
                <div>
                  <div className="mono-label mb-2">TASKS</div>
                  <div className="space-y-2">{sel.tasks.map((t, i) => (
                    <div key={i} className="p-3 border border-white/10 flex justify-between items-center">
                      <div className="text-sm">{t.title}</div>
                      <div className="font-mono-ui text-xs text-neutral-500">{t.minutes}m</div>
                    </div>
                  ))}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-primary" onClick={() => updateStatus(sel.id, "in_progress")} data-testid="node-start"><PlayCircle className="inline w-3 h-3 mr-1"/>START</button>
                <button className="btn-primary" onClick={() => updateStatus(sel.id, "completed")} data-testid="node-complete"><Check className="inline w-3 h-3 mr-1"/>COMPLETE</button>
                <button className="btn-ghost" onClick={() => updateStatus(sel.id, "available")} data-testid="node-reset">RESET</button>
                <button className="btn-ghost" onClick={() => updateStatus(sel.id, "locked")} data-testid="node-skip"><SkipForward className="inline w-3 h-3 mr-1"/>SKIP</button>
              </div>
              <button className="btn-ghost w-full" onClick={() => toast.info("Open Forge (bottom-right) and ask about " + sel.title)} data-testid="node-ask-forge"><Sparkles className="inline w-3 h-3 mr-1"/>ASK FORGE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Meta({ k, v }) { return <div className="bg-black p-3"><div className="mono-label mb-1">{k}</div><div className="font-mono-ui text-sm">{v}</div></div>; }
