import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, Check, Settings2, TrendingUp, TrendingDown, AlertTriangle, Zap } from "lucide-react";

export default function WeeklyReview() {
  const nav = useNavigate();
  const [rev, setRev] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/ai/weekly-review/latest"); setRev(data.review); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGen(true);
    try { const { data } = await api.post("/ai/weekly-review"); setRev({ id: data.review_id, review: data.review, applied: false }); toast.success("Weekly review ready"); }
    catch { toast.error("Review failed"); }
    finally { setGen(false); }
  };

  const accept = async () => {
    if (!rev?.id) return;
    setApplying(true);
    try {
      const { data } = await api.post("/ai/weekly-review/accept", { review_id: rev.id });
      toast.success(`Applied ${data.applied} roadmap change(s)`);
      setRev({ ...rev, applied: true });
    } catch { toast.error("Apply failed"); }
    finally { setApplying(false); }
  };

  if (loading) return <div className="text-neutral-500 font-mono-ui text-xs">LOADING...</div>;

  const r = rev?.review;

  return (
    <div className="space-y-6" data-testid="weekly-page">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="mono-label mb-2">// weekly review</div>
          <h1 className="font-display text-4xl tracking-tighter">This week.</h1>
        </div>
        <button className="btn-ghost" onClick={generate} disabled={gen} data-testid="btn-gen-review"><RefreshCw className={`inline w-3 h-3 mr-1 ${gen ? "animate-spin" : ""}`}/>{gen ? "GENERATING..." : rev ? "RE-GENERATE" : "GENERATE REVIEW"}</button>
      </header>

      {!rev && <div className="card-surface p-8 text-neutral-400">No weekly review yet. Generate one to see wins, missed goals and recommended roadmap tweaks.</div>}

      {r && (
        <>
          <div className="card-surface p-6" data-testid="rev-summary">
            <div className="mono-label mb-2">// summary</div>
            <div className="font-display text-xl leading-tight">{r.summary}</div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
            <RevList icon={TrendingUp} label="WINS" items={r.wins} testid="rev-wins"/>
            <RevList icon={TrendingDown} label="MISSED" items={r.missed} testid="rev-missed"/>
            <RevList icon={AlertTriangle} label="RISKS" items={r.risks} testid="rev-risks"/>
            <RevList icon={Zap} label="NEXT WEEK FOCUS" items={r.next_week_focus} testid="rev-next"/>
          </div>

          {r.adjustments?.length > 0 && (
            <div className="card-surface p-6" data-testid="rev-adjustments">
              <div className="mono-label mb-3">// suggested adjustments</div>
              <ul className="space-y-1 text-white/90 text-sm">{r.adjustments.map((a, i) => <li key={`${a}-${i}`}>· {a}</li>)}</ul>
            </div>
          )}

          {r.roadmap_changes?.length > 0 && (
            <div className="card-surface p-6" data-testid="rev-changes">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="mono-label mb-1">// proposed roadmap changes</div>
                  <div className="text-neutral-400 text-sm">Accept to apply, or open the roadmap to customise manually.</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={() => nav("/roadmap")} data-testid="rev-customize"><Settings2 className="inline w-3 h-3 mr-1"/>CUSTOMIZE</button>
                  <button className="btn-primary" onClick={accept} disabled={applying || rev.applied} data-testid="rev-accept"><Check className="inline w-3 h-3 mr-1"/>{rev.applied ? "APPLIED" : applying ? "APPLYING..." : "ACCEPT ALL"}</button>
                </div>
              </div>
              <div className="space-y-2">
                {r.roadmap_changes.map((c, i) => (
                  <div key={`${c.node_id}-${i}`} className="p-3 border border-white/10 flex justify-between gap-4" data-testid={`rev-change-${i}`}>
                    <div>
                      <div className="font-mono-ui text-sm">{c.node_id} → <span className="text-white">{c.new_status?.replace("_"," ").toUpperCase()}</span></div>
                      <div className="text-neutral-400 text-xs mt-1">{c.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RevList({ icon: Icon, label, items, testid }) {
  return (
    <div className="bg-black p-5" data-testid={testid}>
      <div className="mono-label mb-3 flex items-center gap-2 text-neutral-500"><Icon className="w-3 h-3"/>{label}</div>
      {(items || []).length === 0 && <div className="text-neutral-600 text-xs">—</div>}
      <ul className="space-y-1 text-sm text-white/85">
        {(items || []).map((x, i) => <li key={`${x}-${i}`}>· {x}</li>)}
      </ul>
    </div>
  );
}
