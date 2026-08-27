import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, AlertTriangle, Target } from "lucide-react";

const EFFORT_STYLE = { "Low": "border-white/30", "Medium": "border-white/60", "High": "border-white", "Very High": "border-white bg-white/10" };

export default function CareerSimulator() {
  const [form, setForm] = useState({ target_role: "", industry: "", salary_band: "", location: "", higher_studies: "maybe", startup_or_job: "either" });
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/ai/simulator/history");
        if (data.simulations?.[0]) { setSim(data.simulations[0].result); setForm({ ...form, ...data.simulations[0].input }); }
      } catch {}
    })();
    // eslint-disable-next-line
  }, []);

  const run = async (e) => {
    e.preventDefault();
    if (!form.target_role.trim()) return toast.error("Enter a target role");
    setBusy(true);
    try {
      const { data } = await api.post("/ai/simulator", form);
      setSim(data.simulation);
      toast.success("Simulation ready");
    } catch { toast.error("Simulation failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-8" data-testid="simulator-page">
      <div>
        <div className="mono-label mb-2">// career goal simulator</div>
        <h1 className="font-display text-4xl tracking-tighter">Where could I reach?</h1>
        <p className="text-neutral-400 mt-3 max-w-2xl">Give Forge a target and see three distinct routes — with skills, milestones, effort and honest risks. No guarantees. Just clarity.</p>
      </div>

      <form onSubmit={run} className="card-surface p-6 grid md:grid-cols-2 gap-3" data-testid="sim-form">
        <Field label="TARGET ROLE" testid="sim-role" value={form.target_role} onChange={(v) => setForm({ ...form, target_role: v })} placeholder="e.g. ML Engineer at a hyperscaler"/>
        <Field label="INDUSTRY" testid="sim-industry" value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} placeholder="Tech, Finance, Research..."/>
        <Field label="SALARY BAND" testid="sim-salary" value={form.salary_band} onChange={(v) => setForm({ ...form, salary_band: v })} placeholder="e.g. 30-50 LPA"/>
        <Field label="LOCATION" testid="sim-loc" value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="e.g. Bengaluru / Remote / US"/>
        <Select label="HIGHER STUDIES" testid="sim-hs" value={form.higher_studies} onChange={(v) => setForm({ ...form, higher_studies: v })} options={["yes","no","maybe"]}/>
        <Select label="STARTUP OR JOB" testid="sim-mode" value={form.startup_or_job} onChange={(v) => setForm({ ...form, startup_or_job: v })} options={["job","startup","either"]}/>
        <button className="btn-primary md:col-span-2" type="submit" disabled={busy} data-testid="sim-run"><Sparkles className="inline w-3 h-3 mr-1"/>{busy ? "SIMULATING..." : "SIMULATE 3 ROUTES"}</button>
      </form>

      {sim?.caveats?.length > 0 && (
        <div className="card-surface p-4 flex gap-3 items-start" data-testid="sim-caveats">
          <AlertTriangle className="w-4 h-4 mt-1 text-white/60 shrink-0"/>
          <div className="text-xs text-neutral-400 leading-relaxed">{sim.caveats.join(" ")}</div>
        </div>
      )}

      {sim?.routes?.length > 0 && (
        <div className="grid md:grid-cols-3 gap-px bg-white/10" data-testid="sim-routes">
          {sim.routes.map((r, i) => (
            <div key={i} className="bg-black p-6 fade-up" style={{ animationDelay: `${i * 80}ms` }} data-testid={`sim-route-${i}`}>
              <div className="mono-label mb-2 text-neutral-500">ROUTE {String.fromCharCode(65 + i)} · {r.duration}</div>
              <div className="font-display text-2xl mb-1">{r.name}</div>
              <div className="text-neutral-400 text-sm mb-4">{r.tagline}</div>
              <div className={`inline-block px-2 py-0.5 text-xs font-mono-ui mb-4 border ${EFFORT_STYLE[r.effort] || "border-white/40"}`}>EFFORT: {r.effort?.toUpperCase()}</div>

              <SecList title="STEPS" items={r.steps}/>
              <SecList title="CORE SKILLS" items={r.skills}/>
              <SecList title="MILESTONES" items={r.milestones}/>
              <SecList title="RISKS" items={r.risks}/>
              <SecList title="ALTERNATIVES" items={r.alternatives}/>
            </div>
          ))}
        </div>
      )}
      {!sim && !busy && <div className="text-neutral-500 text-sm flex items-center gap-2"><Target className="w-4 h-4"/> Fill the form above to generate three possible routes.</div>}
    </div>
  );
}

function Field({ label, testid, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mono-label block mb-2">{label}</label>
      <input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent border border-white/15 focus:border-white outline-none px-3 py-2 font-mono-ui text-sm"/>
    </div>
  );
}
function Select({ label, testid, value, onChange, options }) {
  return (
    <div>
      <label className="mono-label block mb-2">{label}</label>
      <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-black border border-white/15 focus:border-white outline-none px-3 py-2 font-mono-ui text-sm">
        {options.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
      </select>
    </div>
  );
}
function SecList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="mb-3">
      <div className="mono-label mb-1 text-neutral-500">{title}</div>
      <ul className="text-sm text-white/85 space-y-1">
        {items.map((x, i) => <li key={i}>· {x}</li>)}
      </ul>
    </div>
  );
}
