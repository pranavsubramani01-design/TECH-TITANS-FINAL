import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

const STATUSES = ["Planned","In Progress","Complete","Paused"];

export default function ProjectsPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", description: "", category: "General", status: "Planned", tech: "", github: "", demo: "" });

  const load = async () => { const { data } = await api.get("/projects"); setItems(data.projects || []); };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try { await api.post("/projects", { ...form, tech: form.tech.split(",").map(s => s.trim()).filter(Boolean) }); setForm({ ...form, name: "", description: "", tech: "" }); await load(); toast.success("Added"); }
    catch { toast.error("Add failed"); }
  };
  const del = async (id) => { await api.delete(`/projects/${id}`); await load(); };

  return (
    <div className="space-y-6" data-testid="projects-page">
      <div className="mono-label">// project tracker</div>
      <h1 className="font-display text-4xl tracking-tighter">Projects.</h1>

      <form onSubmit={add} className="card-surface p-6 grid md:grid-cols-2 gap-3" data-testid="proj-form">
        <input required placeholder="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="proj-name"/>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="bg-black border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="proj-status">{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="md:col-span-2 bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="proj-desc"/>
        <input placeholder="Tech (comma separated)" value={form.tech} onChange={(e) => setForm({ ...form, tech: e.target.value })} className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="proj-tech"/>
        <input placeholder="GitHub URL" value={form.github} onChange={(e) => setForm({ ...form, github: e.target.value })} className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="proj-github"/>
        <button className="btn-primary md:col-span-2" type="submit" data-testid="proj-add">ADD PROJECT</button>
      </form>

      <div className="grid md:grid-cols-2 gap-px bg-white/10">
        {items.length === 0 && <div className="bg-black p-6 text-neutral-500 md:col-span-2">No projects yet.</div>}
        {items.map((p, i) => (
          <div key={p.id} className="bg-black p-5" data-testid={`proj-${i}`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="mono-label mb-1 text-neutral-500">{p.status?.toUpperCase()}</div>
                <div className="font-display text-xl">{p.name}</div>
              </div>
              <button onClick={() => del(p.id)} data-testid={`proj-del-${i}`} className="text-neutral-500 hover:text-white"><Trash2 className="w-4 h-4"/></button>
            </div>
            <div className="text-neutral-400 text-sm mb-3">{p.description}</div>
            <div className="flex flex-wrap gap-1 mb-2">{(p.tech || []).map((t, j) => <span key={j} className="text-xs font-mono-ui px-2 py-0.5 border border-white/15">{t}</span>)}</div>
            {p.github && <a href={p.github} target="_blank" rel="noreferrer" className="text-xs underline text-white/80 font-mono-ui">GITHUB →</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
