import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

const CATS = ["Programming","DSA","Development","AI/ML","Data","Cloud","Cybersecurity","Electronics","Core Engineering","Communication","Leadership","Business","Research","Interview Preparation"];
const LEVELS = ["Beginner","Basic","Intermediate","Advanced"];

export default function SkillsPage() {
  const [skills, setSkills] = useState([]);
  const [form, setForm] = useState({ name: "", category: CATS[0], current_level: "Beginner", target_level: "Intermediate", progress: 0 });

  const load = async () => { const { data } = await api.get("/skills"); setSkills(data.skills || []); };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try { await api.post("/skills", { ...form, progress: Number(form.progress) || 0 }); setForm({ ...form, name: "" }); await load(); toast.success("Skill added"); }
    catch { toast.error("Add failed"); }
  };

  const update = async (id, patch) => { try { await api.put(`/skills/${id}`, patch); await load(); } catch { toast.error("Update failed"); } };
  const del = async (id) => { await api.delete(`/skills/${id}`); await load(); toast.success("Removed"); };

  return (
    <div className="space-y-6" data-testid="skills-page">
      <div className="mono-label">// skill tracker</div>
      <h1 className="font-display text-4xl tracking-tighter">Skills.</h1>

      <form onSubmit={add} className="card-surface p-6 grid md:grid-cols-6 gap-3" data-testid="skill-form">
        <input required placeholder="Skill name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="md:col-span-2 bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="skill-name"/>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-black border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="skill-cat">{CATS.map(c => <option key={c}>{c}</option>)}</select>
        <select value={form.current_level} onChange={(e) => setForm({ ...form, current_level: e.target.value })} className="bg-black border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="skill-cur">{LEVELS.map(l => <option key={l}>{l}</option>)}</select>
        <select value={form.target_level} onChange={(e) => setForm({ ...form, target_level: e.target.value })} className="bg-black border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="skill-tgt">{LEVELS.map(l => <option key={l}>{l}</option>)}</select>
        <button className="btn-primary" type="submit" data-testid="skill-add"><Plus className="inline w-3 h-3 mr-1"/>ADD</button>
      </form>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
        {skills.length === 0 && <div className="bg-black p-6 text-neutral-500 md:col-span-3">No skills logged yet. Add your first above.</div>}
        {skills.map((s, i) => (
          <div key={s.id} className="bg-black p-5" data-testid={`skill-${i}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="mono-label mb-1 text-neutral-500">{s.category}</div>
                <div className="font-display text-lg">{s.name}</div>
              </div>
              <button onClick={() => del(s.id)} className="text-neutral-500 hover:text-white" data-testid={`skill-del-${i}`}><Trash2 className="w-4 h-4"/></button>
            </div>
            <div className="mt-3 text-xs text-neutral-500 font-mono-ui">{s.current_level} → {s.target_level}</div>
            <div className="mt-3">
              <div className="flex justify-between text-xs font-mono-ui mb-1"><span>PROGRESS</span><span>{s.progress}%</span></div>
              <input type="range" min="0" max="100" value={s.progress} onChange={(e) => update(s.id, { progress: Number(e.target.value) })} className="w-full accent-white" data-testid={`skill-progress-${i}`}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
