import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Users, Sparkles, X, GitCompare, AlertTriangle, Database } from "lucide-react";

const PATH_LABEL = {
  "on-campus": "ON-CAMPUS", "off-campus": "OFF-CAMPUS",
  "higher-studies": "HIGHER STUDIES", startup: "STARTUP", research: "RESEARCH",
};

export default function AlumniPage() {
  const [list, setList] = useState([]);
  const [facets, setFacets] = useState({});
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState([]);
  const [you, setYou] = useState(null);
  const [f, setF] = useState({ q: "", role: "", company: "", path_type: "", branch: "" });
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [sel, setSel] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [cmpBusy, setCmpBusy] = useState(false);

  const loadList = async (filters = f) => {
    const { data } = await api.get("/alumni", { params: filters });
    setList(data.alumni || []); setFacets(data.facets || {}); setTotal(data.total || 0);
  };

  const loadMatches = async () => {
    try { const { data } = await api.get("/alumni/matches"); setMatches(data.matches || []); setYou(data.you); } catch {}
  };

  useEffect(() => {
    (async () => {
      try { await loadList(); await loadMatches(); } catch {}
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { loadList(f).catch(() => {}); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [f]);

  const seed = async () => {
    setSeeding(true);
    try {
      const { data } = await api.post("/alumni/seed");
      await loadList(); await loadMatches();
      toast.success(`Cohort ready — ${data.total} trajectories modelled`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Cohort generation failed"); }
    finally { setSeeding(false); }
  };

  const open = async (a) => {
    setSel(a); setCmp(null);
    try { const { data } = await api.get(`/alumni/${a.id}/compare`); setCmp(data.compare); } catch {}
  };

  const compare = async () => {
    setCmpBusy(true);
    try { const { data } = await api.post(`/alumni/${sel.id}/compare`); setCmp(data.compare); toast.success("Overlay ready"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Comparison failed"); }
    finally { setCmpBusy(false); }
  };

  if (loading) return <div className="font-mono-ui text-xs text-neutral-500">LOADING ALUMNI...</div>;

  if (total === 0) return (
    <div className="max-w-2xl" data-testid="alumni-empty">
      <div className="mono-label mb-2">// alumni intelligence</div>
      <h1 className="font-display text-4xl tracking-tighter mb-4">See the path, not the poster.</h1>
      <p className="text-neutral-400 mb-6">Forge models ~30 graduate trajectories — year by year, including the average-CGPA grinds, off-campus routes and one failed startup — then finds the ones closest to your reality.</p>
      <button className="btn-primary" onClick={seed} disabled={seeding} data-testid="btn-seed-alumni">
        <Database className="inline w-3 h-3 mr-1" />{seeding ? "MODELLING COHORT..." : "BUILD ALUMNI COHORT"}
      </button>
      <div className="mt-4 text-xs text-neutral-600">Every trajectory is AI-modelled, not a real person.</div>
    </div>
  );

  return (
    <div className="space-y-10" data-testid="alumni-page">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="mono-label mb-2">// alumni intelligence · {total} trajectories</div>
          <h1 className="font-display text-4xl tracking-tighter">Seniors who made it.</h1>
        </div>
        <button className="btn-ghost" onClick={seed} disabled={seeding} data-testid="btn-expand-cohort">{seeding ? "MODELLING..." : "REFRESH COHORT"}</button>
      </header>

      {matches.length > 0 && (
        <section data-testid="alumni-matches">
          <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
            <div className="mono-label">YOUR CLOSEST MIRRORS</div>
            {you?.target && <div className="font-mono-ui text-xs text-neutral-500">TARGET: {you.target}{you.cgpa ? ` · CGPA ${you.cgpa}` : ""}</div>}
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-white/10">
            {matches.slice(0, 3).map((a, i) => (
              <button key={a.id} onClick={() => open(a)} data-testid={`alumni-match-${i}`} className="text-left bg-black p-5 hover:bg-white/[0.03] transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="mono-label text-neutral-500">MATCH</div>
                  <div className="font-display text-3xl">{a.match_score}</div>
                </div>
                <div className="font-display text-lg">{a.name}</div>
                <div className="text-sm text-neutral-400 mb-3">{a.role} @ {a.company} · {a.batch}</div>
                <ul className="text-xs text-neutral-500 space-y-1">{(a.match_reasons || []).map((r, j) => <li key={j}>· {r}</li>)}</ul>
              </button>
            ))}
          </div>
          {matches.length > 3 && (
            <div className="grid md:grid-cols-3 gap-px bg-white/10 mt-px">
              {matches.slice(3).map((a, i) => (
                <button key={a.id} onClick={() => open(a)} data-testid={`alumni-match-${i + 3}`} className="text-left bg-black p-4 hover:bg-white/[0.03] transition-colors flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{a.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{a.role} @ {a.company}</div>
                  </div>
                  <div className="font-mono-ui text-xs text-neutral-500">{a.match_score}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-4">
        <div className="mono-label">DIRECTORY</div>
        <div className="grid md:grid-cols-5 gap-2" data-testid="alumni-filters">
          <input placeholder="SEARCH NAME / SKILL / COLLEGE" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="input-dark md:col-span-2" data-testid="alumni-q" />
          <Select v={f.role} onChange={(v) => setF({ ...f, role: v })} label="ALL ROLES" opts={facets.roles} testid="alumni-role" />
          <Select v={f.company} onChange={(v) => setF({ ...f, company: v })} label="ALL COMPANIES" opts={facets.companies} testid="alumni-company" />
          <Select v={f.path_type} onChange={(v) => setF({ ...f, path_type: v })} label="ALL ROUTES" opts={facets.path_types} testid="alumni-path" />
        </div>

        {list.length === 0 ? (
          <div className="font-mono-ui text-xs text-neutral-600">NO MATCHES FOR THOSE FILTERS.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
            {list.map((a, i) => (
              <button key={a.id} onClick={() => open(a)} data-testid={`alumni-card-${i}`} className="text-left bg-black p-5 hover:bg-white/[0.03] transition-colors">
                <div className="mono-label mb-2 text-neutral-500">{PATH_LABEL[a.path_type] || a.path_type} · BATCH {a.batch}</div>
                <div className="font-display text-lg">{a.name}</div>
                <div className="text-sm text-neutral-400">{a.role} @ {a.company}</div>
                <div className="text-xs text-neutral-600 mt-2">{a.branch} · {a.college} · CGPA {a.cgpa}</div>
                <div className="text-sm text-neutral-500 mt-3 line-clamp-2">{a.starting_point}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="alumni-detail">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSel(null)} />
          <div className="relative w-full sm:w-[600px] bg-black border-l border-white/10 overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-start sticky top-0 bg-black z-10">
              <div>
                <div className="mono-label mb-2 text-neutral-500">{PATH_LABEL[sel.path_type] || sel.path_type} · BATCH {sel.batch}</div>
                <div className="font-display text-3xl tracking-tight">{sel.name}</div>
                <div className="text-sm text-neutral-400 mt-1">{sel.role} @ {sel.company}</div>
              </div>
              <button onClick={() => setSel(null)} data-testid="alumni-close"><X className="w-4 h-4 text-neutral-400" /></button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-px bg-white/10">
                <Meta k="CGPA" v={sel.cgpa} />
                <Meta k="BRANCH" v={sel.branch} />
                <Meta k="TIER" v={sel.college_tier} />
              </div>
              <div>
                <div className="mono-label mb-2">WHERE THEY STARTED</div>
                <div className="text-white/90 text-sm">{sel.starting_point}</div>
              </div>

              <div>
                <div className="mono-label mb-3">THE EXACT PATH</div>
                <div className="space-y-px bg-white/10">
                  {(sel.trajectory || []).map((y) => (
                    <div key={y.year} className="bg-black p-4" data-testid={`traj-year-${y.year}`}>
                      <div className="flex justify-between items-baseline mb-2 gap-3">
                        <div className="font-display text-base">YEAR {y.year} · {y.headline}</div>
                      </div>
                      <ul className="text-sm text-white/80 space-y-1 mb-2">{(y.did || []).map((d, j) => <li key={j}>· {d}</li>)}</ul>
                      {(y.skills || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">{y.skills.map((s, j) => <span key={j} className="px-2 py-0.5 border border-white/15 font-mono-ui text-[10px]">{s}</span>)}</div>
                      )}
                      {y.milestone && <div className="text-xs text-neutral-500">MILESTONE — {y.milestone}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {sel.breakthrough && (
                <div className="border border-white/20 p-4">
                  <div className="mono-label mb-2">BREAKTHROUGH</div>
                  <div className="font-display text-lg">{sel.breakthrough}</div>
                </div>
              )}
              {sel.offer_note && <ListBlock title="HOW THE OFFER HAPPENED" items={[sel.offer_note]} />}
              <ListBlock title="WHAT THEY'D UNDO" items={sel.mistakes} />
              <ListBlock title="THEIR ADVICE" items={sel.advice} />
              {(sel.final_skills || []).length > 0 && (
                <div>
                  <div className="mono-label mb-2">SKILLS AT OFFER</div>
                  <div className="flex flex-wrap gap-2">{sel.final_skills.map((s, i) => <span key={i} className="px-2 py-1 border border-white/15 font-mono-ui text-xs">{s}</span>)}</div>
                </div>
              )}

              <div className="border-t border-white/10 pt-6 space-y-4">
                <button className="btn-primary w-full" onClick={compare} disabled={cmpBusy} data-testid="btn-compare-alumni">
                  <GitCompare className="inline w-3 h-3 mr-1" />{cmpBusy ? "OVERLAYING..." : cmp ? "RE-RUN OVERLAY" : "OVERLAY ON MY PATH"}
                </button>
                {cmp && (
                  <div className="space-y-5" data-testid="alumni-compare">
                    {cmp.same_point && (
                      <div>
                        <div className="mono-label mb-2">AT YOUR POINT IN TIME</div>
                        <div className="text-sm text-white/90">{cmp.same_point}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-px bg-white/10">
                      <div className="bg-black p-4"><ListBlock title="YOU'RE AHEAD" items={cmp.ahead} /></div>
                      <div className="bg-black p-4"><ListBlock title="YOU'RE BEHIND" items={cmp.behind} /></div>
                    </div>
                    {(cmp.missing_moves || []).length > 0 && (
                      <div>
                        <div className="mono-label mb-2">MOVES THEY MADE THAT YOU HAVEN'T</div>
                        <div className="space-y-px bg-white/10">
                          {cmp.missing_moves.map((m, i) => (
                            <div key={i} className="bg-black p-4" data-testid={`missing-move-${i}`}>
                              <div className="flex justify-between gap-3 mb-1">
                                <div className="font-display text-base">{m.move}</div>
                                <div className="font-mono-ui text-[10px] text-neutral-500 whitespace-nowrap">{m.when}</div>
                              </div>
                              <div className="text-sm text-neutral-400">{m.why}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <ListBlock title="ADAPTED FOR YOU" items={cmp.adapted_advice} />
                    {cmp.verdict && (
                      <div className="border border-white/15 p-4">
                        <div className="mono-label mb-2">VERDICT</div>
                        <div className="text-sm text-white/90">{cmp.verdict}</div>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 text-xs text-neutral-600">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  AI-modelled trajectory built from real hiring patterns — not a real person.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({ v, onChange, label, opts, testid }) {
  return (
    <select value={v} onChange={(e) => onChange(e.target.value)} className="input-dark" data-testid={testid}>
      <option value="">{label}</option>
      {(opts || []).map((o) => <option key={o} value={o}>{String(o).toUpperCase()}</option>)}
    </select>
  );
}
function Meta({ k, v }) { return <div className="bg-black p-3"><div className="mono-label mb-1">{k}</div><div className="font-mono-ui text-sm">{v}</div></div>; }
function ListBlock({ title, items }) {
  if (!(items || []).length) return null;
  return (
    <div>
      <div className="mono-label mb-2 text-neutral-500">{title}</div>
      <ul className="text-sm text-white/80 space-y-1">{items.map((x, i) => <li key={i}>· {x}</li>)}</ul>
    </div>
  );
}
