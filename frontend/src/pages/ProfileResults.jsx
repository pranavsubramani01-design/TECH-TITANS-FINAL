import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";

export default function ProfileResults() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/ai/profile");
        setProfile(data.profile);
      } finally { setLoading(false); }
    })();
  }, []);

  const enter = async () => { await refresh(); nav("/dashboard"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-neutral-500 font-mono-ui text-xs">ANALYSING...</div>;
  if (!profile) return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
    <div className="text-neutral-400">No profile yet.</div>
    <button className="btn-primary" onClick={() => nav("/interview")}>GO TO INTERVIEW</button>
  </div>;

  const interestData = Object.entries(profile.interest_profile || {}).map(([subject, v]) => ({ subject, v }));
  const strengths = (profile.strength_profile || []).map((s) => ({ name: s.name, level: s.level }));

  return (
    <div className="min-h-screen grain" data-testid="profile-results">
      <nav className="border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="font-display text-lg flex items-center gap-2"><div className="w-6 h-6 border border-white/70 flex items-center justify-center"><div className="w-2 h-2 bg-white"/></div>PATHFORGE<span className="text-white/40">.AI</span></div>
          <button className="btn-primary" onClick={enter} data-testid="enter-dashboard">ENTER DASHBOARD →</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
        <div className="fade-up">
          <div className="mono-label mb-3">// student intelligence profile</div>
          <h1 className="font-display text-5xl tracking-tighter leading-none">Here's who Forge sees.</h1>
          <p className="text-neutral-400 mt-4 max-w-3xl leading-relaxed">{profile.summary}</p>
          <div className="mt-4 mono-label text-neutral-500">AI COMPATIBILITY ESTIMATES · NOT PSYCHOLOGICAL DIAGNOSIS</div>
        </div>

        <section>
          <div className="mono-label mb-4">// top career directions</div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
            {(profile.career_directions || []).map((c, i) => (
              <div key={i} className="bg-black p-6 fade-up" style={{ animationDelay: `${i * 60}ms` }} data-testid={`career-dir-${i}`}>
                <div className="flex items-baseline justify-between mb-3">
                  <div className="font-display text-2xl">{c.name}</div>
                  <div className="font-mono-ui text-2xl">{c.score}%</div>
                </div>
                <div className="h-px bg-white/10 mb-3">
                  <div className="h-px bg-white" style={{ width: `${c.score}%` }}/>
                </div>
                <div className="text-neutral-400 text-sm leading-relaxed">{c.why}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-px bg-white/10">
          <div className="bg-black p-6">
            <div className="mono-label mb-4">// interest radar</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={interestData}>
                  <PolarGrid stroke="rgba(255,255,255,0.12)"/>
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#a3a3a3", fontSize: 11 }}/>
                  <Radar dataKey="v" stroke="#fff" fill="#fff" fillOpacity={0.15}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-black p-6">
            <div className="mono-label mb-4">// strengths</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={strengths} layout="vertical" margin={{ left: 30 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "#737373", fontSize: 10 }}/>
                  <YAxis type="category" dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 11 }} width={110}/>
                  <Bar dataKey="level" fill="#ffffff"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-px bg-white/10">
          <div className="bg-black p-6">
            <div className="mono-label mb-4">// development areas</div>
            <ul className="space-y-2">
              {(profile.development_areas || []).map((d, i) => (
                <li key={i} className="text-white/90 flex gap-3"><span className="text-white/30 font-mono-ui text-xs pt-1">0{i+1}</span><span>{d}</span></li>
              ))}
            </ul>
          </div>
          <div className="bg-black p-6">
            <div className="mono-label mb-4">// alternative careers to consider</div>
            <div className="space-y-3">
              {(profile.alternative_careers || []).map((a, i) => (
                <div key={i}>
                  <div className="font-display text-lg">{a.name}</div>
                  <div className="text-neutral-400 text-sm">{a.why}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="pt-6 flex justify-end">
          <button className="btn-primary" onClick={enter} data-testid="enter-dashboard-bottom">ENTER YOUR DASHBOARD →</button>
        </div>
      </div>
    </div>
  );
}
