import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Flame } from "lucide-react";

export default function StreakWidget() {
  const [d, setD] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ mood: "focused", energy: 7, available_minutes: 90, notes: "" });
  const [today, setToday] = useState(null);

  const load = async () => {
    const [s, t] = await Promise.all([api.get("/streak"), api.get("/checkin/today")]);
    setD(s.data);
    setToday(t.data.checkin);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/checkin", { ...form, energy: Number(form.energy), available_minutes: Number(form.available_minutes) });
      toast.success("Checked in — streak updated");
      setShowForm(false);
      await load();
    } catch { toast.error("Check-in failed"); }
  };

  if (!d) return null;
  return (
    <div className="card-surface p-6" data-testid="streak-widget">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="mono-label mb-1 text-neutral-500 flex items-center gap-1"><Flame className="w-3 h-3"/>STREAK</div>
          <div className="font-display text-4xl tracking-tighter" data-testid="streak-current">{d.current_streak}<span className="text-white/40 text-lg"> days</span></div>
        </div>
        <Link to="/streak" className="mono-label text-neutral-400 hover:text-white" data-testid="streak-open">PERKS →</Link>
      </div>
      {d.next_perk && (
        <div className="mt-3">
          <div className="flex justify-between text-xs font-mono-ui mb-1">
            <span className="text-neutral-500">NEXT · {d.next_perk.name.toUpperCase()}</span>
            <span>{d.days_to_next}d</span>
          </div>
          <div className="h-px bg-white/10"><div className="h-px bg-white" style={{ width: `${Math.min(100, (d.longest_streak / d.next_perk.days) * 100)}%` }}/></div>
        </div>
      )}
      <div className="mt-4">
        {today ? (
          <div className="text-neutral-400 text-xs font-mono-ui" data-testid="checkin-done">✓ CHECKED IN TODAY · {today.mood?.toUpperCase()} · {today.available_minutes}m AVAILABLE</div>
        ) : showForm ? (
          <form onSubmit={submit} className="space-y-2" data-testid="checkin-form">
            <div className="grid grid-cols-3 gap-2">
              <select value={form.mood} onChange={(e) => setForm({ ...form, mood: e.target.value })} className="bg-black border border-white/15 px-2 py-1 text-xs font-mono-ui" data-testid="ci-mood">
                {["focused","tired","stressed","excited","flat","curious"].map(x => <option key={x}>{x}</option>)}
              </select>
              <input type="number" min="1" max="10" value={form.energy} onChange={(e) => setForm({ ...form, energy: e.target.value })} className="bg-transparent border border-white/15 px-2 py-1 text-xs font-mono-ui" placeholder="Energy 1-10" data-testid="ci-energy"/>
              <input type="number" min="0" value={form.available_minutes} onChange={(e) => setForm({ ...form, available_minutes: e.target.value })} className="bg-transparent border border-white/15 px-2 py-1 text-xs font-mono-ui" placeholder="Min" data-testid="ci-mins"/>
            </div>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything Forge should know?" className="w-full bg-transparent border border-white/15 px-2 py-1 text-xs font-mono-ui" data-testid="ci-notes"/>
            <div className="flex gap-2"><button type="submit" className="btn-primary flex-1" data-testid="ci-submit">CHECK IN</button><button type="button" onClick={() => setShowForm(false)} className="btn-ghost">CANCEL</button></div>
          </form>
        ) : (
          <button onClick={() => setShowForm(true)} className="btn-primary w-full" data-testid="checkin-open">CHECK IN TODAY</button>
        )}
      </div>
    </div>
  );
}
