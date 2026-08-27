import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Trash2 } from "lucide-react";

export default function AcademicsPage() {
  const [state, setState] = useState({ records: [], sgpa_by_semester: [], cgpa: 0 });
  const [form, setForm] = useState({ semester: 1, subject: "", credits: 3, grade_points: 9, grade: "A" });

  const load = async () => { const { data } = await api.get("/academics"); setState(data); };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.subject.trim()) return;
    try { await api.post("/academics", { ...form, semester: Number(form.semester), credits: Number(form.credits), grade_points: Number(form.grade_points) }); setForm({ ...form, subject: "" }); await load(); toast.success("Record added"); }
    catch { toast.error("Add failed"); }
  };
  const del = async (id) => { await api.delete(`/academics/${id}`); await load(); };

  return (
    <div className="space-y-6" data-testid="academics-page">
      <div className="mono-label">// academic tracker</div>
      <div className="flex items-end gap-6 flex-wrap">
        <h1 className="font-display text-4xl tracking-tighter">Academics.</h1>
        <div>
          <div className="mono-label text-neutral-500">CGPA</div>
          <div className="font-display text-4xl" data-testid="cgpa-value">{state.cgpa || "—"}</div>
        </div>
      </div>

      <form onSubmit={add} className="card-surface p-6 grid md:grid-cols-6 gap-3" data-testid="acad-form">
        <input type="number" min="1" max="8" required value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} placeholder="Sem" className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="acad-sem"/>
        <input required placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="md:col-span-2 bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="acad-subj"/>
        <input type="number" step="0.5" required value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} placeholder="Credits" className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="acad-cr"/>
        <input type="number" step="0.1" max="10" required value={form.grade_points} onChange={(e) => setForm({ ...form, grade_points: e.target.value })} placeholder="Grade Pts" className="bg-transparent border border-white/15 px-3 py-2 text-sm font-mono-ui" data-testid="acad-gp"/>
        <button className="btn-primary" type="submit" data-testid="acad-add">ADD</button>
      </form>

      {state.sgpa_by_semester.length > 0 && (
        <div className="card-surface p-6">
          <div className="mono-label mb-3">// SGPA trend</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={state.sgpa_by_semester}>
                <XAxis dataKey="semester" tick={{ fill: "#a3a3a3", fontSize: 11 }}/>
                <YAxis domain={[0, 10]} tick={{ fill: "#a3a3a3", fontSize: 11 }}/>
                <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "JetBrains Mono, monospace" }}/>
                <Line type="monotone" dataKey="sgpa" stroke="#fff" strokeWidth={2} dot={{ fill: "#fff" }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr className="text-left mono-label">
              <th className="px-4 py-3">SEM</th><th className="px-4 py-3">SUBJECT</th><th className="px-4 py-3">CREDITS</th><th className="px-4 py-3">GP</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {state.records.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-neutral-500">No records yet.</td></tr>}
            {state.records.map((r, i) => (
              <tr key={r.id} className="border-b border-white/5" data-testid={`acad-row-${i}`}>
                <td className="px-4 py-3 font-mono-ui">{r.semester}</td>
                <td className="px-4 py-3">{r.subject}</td>
                <td className="px-4 py-3 font-mono-ui">{r.credits}</td>
                <td className="px-4 py-3 font-mono-ui">{r.grade_points}</td>
                <td className="px-4 py-3"><button onClick={() => del(r.id)} className="text-neutral-500 hover:text-white" data-testid={`acad-del-${i}`}><Trash2 className="w-4 h-4"/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
