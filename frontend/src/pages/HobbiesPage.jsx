import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export default function HobbiesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", hours_per_week: 2, streak_days: 0, goals: "" });

  const load = async () => { const { data } = await api.get("/hobbies"); setItems(data.hobbies || []); };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try { await api.post("/hobbies", { ...form, hours_per_week: Number(form.hours_per_week), streak_days: Number(form.streak_days) }); setForm({ name: "", hours_per_week: 2, streak_days: 0, goals: "" }); await load(); toast.success("Added"); }
    catch { toast.error("Add failed"); }
  };
  const del = async (id) => { await api.delete(`/hobbies/${id}`); await load(); };

  return (
    <div className="space-y-6" data-testid="hobbies-page">
      <div className="mono-label">// passion & hobbies</div>
      <h1 className="font-display text-4xl tracking-tighter">Life balance.</h1>

      <form onSubmit={add} className="card-surface p-6 grid md:grid-cols-4 gap-3" data-testid="hobby-form">
        <input required placeholder="Hobby" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="hobby-name"/>
        <input type="number" step="0.5" value={form.hours_per_week} onChange={(e) => setForm({ ...form, hours_per_week: e.target.value })} placeholder="hrs/wk" className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="hobby-hrs"/>
        <input placeholder="Goals" value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="hobby-goals"/>
        <button className="btn-primary" type="submit" data-testid="hobby-add">ADD</button>
      </form>

      <div className="grid md:grid-cols-3 gap-px bg-white/10">
        {items.length === 0 && <div className="bg-black p-6 text-neutral-500 md:col-span-3">No hobbies yet.</div>}
        {items.map((h, i) => (
          <div key={h.id} className="bg-black p-5" data-testid={`hobby-${i}`}>
            <div className="flex justify-between items-start mb-2">
              <div className="font-display text-xl">{h.name}</div>
              <button onClick={() => del(h.id)} data-testid={`hobby-del-${i}`} className="text-neutral-500 hover:text-white"><Trash2 className="w-4 h-4"/></button>
            </div>
            <div className="mono-label mb-2 text-neutral-500">{h.hours_per_week} HRS/WK · {h.streak_days} DAY STREAK</div>
            <div className="text-neutral-400 text-sm">{h.goals}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
