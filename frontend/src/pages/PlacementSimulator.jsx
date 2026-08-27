import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Building2, Sparkles, X, AlertTriangle } from "lucide-react";

const VERDICT_STYLE = {
  far: "border-white/25 text-white/60",
  developing: "border-white/40 text-white/80",
  competitive: "border-white text-white",
  strong: "border-white bg-white text-black",
};

const SUGGESTED = ["Google","Microsoft","Amazon","Meta","Apple","Netflix","Stripe","Uber","Adobe","Nvidia","Atlassian","Datadog","Databricks","OpenAI","Anthropic","Goldman Sachs","JPMorgan","D. E. Shaw","Zomato","Swiggy","Flipkart","Razorpay","Freshworks","Zoho"];

export default function PlacementSimulator() {
  const [role, setRole] = useState("");
  const [companies, setCompanies] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/ai/placement/latest");
        if (data.placement) {
          setSim(data.placement);
          setRole(data.input?.role || "");
          setCompanies(data.input?.companies || []);
        }
      } catch (err) { console.error("placement: load failed", err); }
    })();
    // mount-only fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCompany = (c) => {
    const v = c.trim();
    if (!v) return;
    if (companies.includes(v)) return;
    setCompanies([...companies, v]);
  };
  const removeCompany = (c) => setCompanies(companies.filter(x => x !== c));

  const run = async (e) => {
    e.preventDefault();
    if (!role.trim()) return toast.error("Enter a target role");
    if (companies.length === 0) return toast.error("Add at least one target company");
    setBusy(true);
    try {
      const { data } = await api.post("/ai/placement", { role: role.trim(), companies });
      setSim(data.placement);
      toast.success("Readiness estimated");
    } catch { toast.error("Estimation failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-8" data-testid="placement-page">
      <div>
        <div className="mono-label mb-2">// placement simulator</div>
        <h1 className="font-display text-4xl tracking-tighter">Am I ready?</h1>
        <p className="text-neutral-400 mt-3 max-w-2xl">Give Forge a role and target companies. It scores your readiness against typical bars using your actual skills, projects, CGPA and roadmap. No guarantees — just clarity on what needs to move.</p>
      </div>

      <form onSubmit={run} className="card-surface p-6 space-y-4" data-testid="pl-form">
        <div className="flex items-center justify-between">
          <label className="mono-label">TARGET ROLE</label>
          {(role || companies.length > 0) && (
            <button type="button" onClick={() => { setRole(""); setCompanies([]); setSim(null); setInput(""); }} className="mono-label text-neutral-400 hover:text-white" data-testid="pl-reset">RESET</button>
          )}
        </div>
        <div>
          <input data-testid="pl-role" required value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Software Engineer, ML Engineer, Product Manager" className="w-full bg-transparent border border-white/15 focus:border-white outline-none px-3 py-2 font-mono-ui text-sm"/>
        </div>
        <div>
          <label className="mono-label block mb-2">TARGET COMPANIES</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {companies.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 px-3 py-1 bg-white text-black text-xs font-mono-ui">{c} <button type="button" onClick={() => removeCompany(c)} data-testid={`pl-rm-${c}`}><X className="w-3 h-3"/></button></span>
            ))}
            {companies.length === 0 && <span className="text-neutral-500 text-xs">Add companies below or pick from suggestions.</span>}
          </div>
          <div className="flex gap-2 mb-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompany(input); setInput(""); } }} placeholder="Type a company and press Enter" className="flex-1 bg-transparent border border-white/15 focus:border-white outline-none px-3 py-2 font-mono-ui text-sm" data-testid="pl-company-input"/>
            <button type="button" className="btn-ghost" onClick={() => { addCompany(input); setInput(""); }} data-testid="pl-add-company">ADD</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.filter(s => !companies.includes(s)).slice(0, 14).map((s) => (
              <button type="button" key={s} onClick={() => addCompany(s)} data-testid={`pl-sug-${s}`} className="px-2 py-1 text-xs font-mono-ui border border-white/15 text-white/70 hover:border-white hover:text-white transition-colors">+ {s}</button>
            ))}
          </div>
        </div>
        <button className="btn-primary" type="submit" disabled={busy} data-testid="pl-run"><Sparkles className="inline w-3 h-3 mr-1"/>{busy ? "ANALYSING..." : "ESTIMATE READINESS"}</button>
      </form>

      {sim && (
        <>
          <div className="grid md:grid-cols-3 gap-px bg-white/10" data-testid="pl-overview">
            <div className="bg-black p-6">
              <div className="mono-label mb-2 text-neutral-500">OVERALL READINESS</div>
              <div className="font-display text-6xl tracking-tighter">{sim.overall_readiness}<span className="text-white/40 text-3xl">/100</span></div>
              <div className="mono-label mt-2 text-white/70">{(sim.tier || "").toUpperCase()}</div>
              <div className="h-px bg-white/10 mt-3"><div className="h-px bg-white" style={{ width: `${sim.overall_readiness}%` }}/></div>
            </div>
            <div className="md:col-span-2 bg-black p-6">
              <div className="mono-label mb-2 text-neutral-500">TOP MOVE</div>
              <div className="font-display text-2xl leading-tight">{sim.top_move}</div>
              {sim.disclaimer && <div className="mt-4 flex gap-2 text-xs text-neutral-500 items-start"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0"/>{sim.disclaimer}</div>}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-white/10" data-testid="pl-companies">
            {(sim.companies || []).map((c, i) => (
              <div key={i} className="bg-black p-6" data-testid={`pl-company-${i}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="mono-label mb-1 text-neutral-500 flex items-center gap-1"><Building2 className="w-3 h-3"/> COMPANY</div>
                    <div className="font-display text-2xl">{c.name}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 border font-mono-ui ${VERDICT_STYLE[(c.verdict || "developing").toLowerCase()] || VERDICT_STYLE.developing}`}>{(c.verdict || "").toUpperCase()} · {c.readiness}%</span>
                </div>
                <div className="h-px bg-white/10 mb-4"><div className="h-px bg-white" style={{ width: `${c.readiness}%` }}/></div>
                {c.bar_notes && <div className="text-neutral-400 text-xs italic mb-4">{c.bar_notes}</div>}
                <BulletBlock title="STRENGTHS" items={c.strengths}/>
                <BulletBlock title="GAPS" items={c.gaps}/>
                <BulletBlock title="MISSING SKILLS" items={c.missing_skills}/>
                <div>
                  <div className="mono-label mb-1 text-neutral-500">CRITICAL ACTIONS</div>
                  <ol className="space-y-1 text-sm text-white/90">{(c.critical_actions || []).map((a, k) => <li key={k}><span className="text-white/40 mr-2 font-mono-ui text-xs">0{k+1}</span>{a}</li>)}</ol>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {!sim && !busy && <div className="text-neutral-500 text-sm">Enter a role, add companies, then Estimate Readiness.</div>}
    </div>
  );
}

function BulletBlock({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="mb-3">
      <div className="mono-label mb-1 text-neutral-500">{title}</div>
      <ul className="text-sm text-white/85 space-y-1">{items.map((x, i) => <li key={i}>· {x}</li>)}</ul>
    </div>
  );
}
