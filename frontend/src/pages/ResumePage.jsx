import { useEffect, useState } from "react";
import api, { API_BASE } from "@/lib/api";
import { toast } from "sonner";
import { Download, Printer, Sparkles, Save, Pencil, X } from "lucide-react";

const lines = (arr) => (arr || []).join("\n");
const toLines = (v) => v.split("\n").map((s) => s.trim()).filter(Boolean);

export default function ResumePage() {
  const [resume, setResume] = useState(null);
  const [draft, setDraft] = useState(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/resume"); setResume(data.resume); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/resume/generate");
      setResume(data.resume); setEdit(false);
      toast.success("Resume tailored from your real data");
    } catch { toast.error("Generation failed"); }
    finally { setBusy(false); }
  };

  const startEdit = () => { setDraft(JSON.parse(JSON.stringify(resume))); setEdit(true); };

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/resume", { resume: draft });
      setResume(data.resume); setEdit(false); toast.success("Resume saved");
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  const download = async () => {
    try {
      const token = localStorage.getItem("pf_token");
      const r = await fetch(`${API_BASE}/resume/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(resume?.name || "resume").replace(/\s+/g, "_")}_Resume.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { toast.error("PDF download failed"); }
  };

  if (loading) return <div className="font-mono-ui text-xs text-neutral-500">LOADING RESUME...</div>;

  if (!resume) return (
    <div className="max-w-2xl" data-testid="resume-empty">
      <div className="mono-label mb-2">// resume builder</div>
      <h1 className="font-display text-4xl tracking-tighter mb-4">One page. All signal.</h1>
      <p className="text-neutral-400 mb-6">Forge writes a truthful, ATS-friendly resume from your actual CGPA, skills and projects — tailored to your target career. Nothing invented.</p>
      <button className="btn-primary" onClick={generate} disabled={busy} data-testid="btn-generate-resume">
        <Sparkles className="inline w-3 h-3 mr-1" />{busy ? "WRITING..." : "GENERATE RESUME"}
      </button>
    </div>
  );

  const r = edit ? draft : resume;
  const set = (patch) => setDraft({ ...draft, ...patch });

  return (
    <div className="space-y-6" data-testid="resume-page">
      <header className="flex items-end justify-between flex-wrap gap-4 no-print">
        <div>
          <div className="mono-label mb-2">// resume · {resume.target_role}</div>
          <h1 className="font-display text-4xl tracking-tighter">Your Resume.</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!edit ? (
            <>
              <button className="btn-ghost" onClick={startEdit} data-testid="btn-edit-resume"><Pencil className="inline w-3 h-3 mr-1" />EDIT</button>
              <button className="btn-ghost" onClick={() => window.print()} data-testid="btn-print-resume"><Printer className="inline w-3 h-3 mr-1" />PRINT</button>
              <button className="btn-ghost" onClick={download} data-testid="btn-download-resume"><Download className="inline w-3 h-3 mr-1" />PDF</button>
              <button className="btn-primary" onClick={generate} disabled={busy} data-testid="btn-regen-resume">{busy ? "WRITING..." : "REGENERATE"}</button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => setEdit(false)} data-testid="btn-cancel-edit"><X className="inline w-3 h-3 mr-1" />CANCEL</button>
              <button className="btn-primary" onClick={save} disabled={busy} data-testid="btn-save-resume"><Save className="inline w-3 h-3 mr-1" />{busy ? "SAVING..." : "SAVE"}</button>
            </>
          )}
        </div>
      </header>

      {edit && (
        <div className="card-surface p-5 space-y-4 no-print" data-testid="resume-editor">
          <div className="mono-label">EDIT CONTENT</div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="NAME" value={r.name || ""} onChange={(v) => set({ name: v })} testid="edit-name" />
            <Field label="HEADLINE" value={r.headline || ""} onChange={(v) => set({ headline: v })} testid="edit-headline" />
            <Field label="EMAIL" value={r.email || ""} onChange={(v) => set({ email: v })} testid="edit-email" />
            <Field label="PHONE" value={r.phone || ""} onChange={(v) => set({ phone: v })} testid="edit-phone" />
            <Field label="LOCATION" value={r.location || ""} onChange={(v) => set({ location: v })} testid="edit-location" />
          </div>
          <Area label="SUMMARY" value={r.summary || ""} onChange={(v) => set({ summary: v })} testid="edit-summary" />
          <Area label="ACHIEVEMENTS (one per line)" value={lines(r.achievements)} onChange={(v) => set({ achievements: toLines(v) })} testid="edit-achievements" />
          <Area label="COURSEWORK (one per line)" value={lines(r.coursework)} onChange={(v) => set({ coursework: toLines(v) })} testid="edit-coursework" />
          <div className="space-y-3">
            <div className="mono-label">SKILL GROUPS (comma separated items)</div>
            {(r.skills || []).map((g, i) => (
              <div key={i} className="grid md:grid-cols-[160px_1fr] gap-2">
                <input className="input-dark" value={g.group || ""} onChange={(e) => {
                  const s = [...r.skills]; s[i] = { ...g, group: e.target.value }; set({ skills: s });
                }} data-testid={`edit-skill-group-${i}`} />
                <input className="input-dark" value={(g.items || []).join(", ")} onChange={(e) => {
                  const s = [...r.skills]; s[i] = { ...g, items: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }; set({ skills: s });
                }} data-testid={`edit-skill-items-${i}`} />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="mono-label">PROJECT BULLETS (one per line)</div>
            {(r.projects || []).map((p, i) => (
              <div key={i} className="space-y-1">
                <div className="text-sm">{p.name}</div>
                <textarea rows={3} className="input-dark w-full" value={lines(p.bullets)} onChange={(e) => {
                  const ps = [...r.projects]; ps[i] = { ...p, bullets: toLines(e.target.value) }; set({ projects: ps });
                }} data-testid={`edit-project-bullets-${i}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <div id="resume-print" className="resume-paper" data-testid="resume-preview">
          <div className="text-center">
            <h2 className="resume-name">{r.name}</h2>
            <div className="resume-contact">
              {[r.email, r.phone, r.location].filter(Boolean).join("  |  ")}
              {(r.links || []).filter((l) => l.url).map((l, i) => <span key={i}>{"  |  "}{l.label}: {l.url}</span>)}
            </div>
            {r.headline && <div className="resume-contact italic">{r.headline}</div>}
          </div>
          <div className="resume-rule-strong" />

          {r.summary && <Sec title="Summary"><p>{r.summary}</p></Sec>}

          {(r.education || []).length > 0 && (
            <Sec title="Education">
              {r.education.map((e, i) => (
                <div key={i} className="mb-1">
                  <div className="flex justify-between gap-3">
                    <span><b>{e.institution}</b>{e.degree ? ` — ${e.degree}` : ""}</span>
                    <span className="whitespace-nowrap">{[e.score, e.period].filter(Boolean).join(" · ")}</span>
                  </div>
                  {e.detail && <div className="resume-dim">{e.detail}</div>}
                </div>
              ))}
            </Sec>
          )}

          {(r.skills || []).length > 0 && (
            <Sec title="Skills">
              {r.skills.map((g, i) => <div key={i}><b>{g.group}:</b> {(g.items || []).join(", ")}</div>)}
            </Sec>
          )}

          {(r.projects || []).length > 0 && (
            <Sec title="Projects">
              {r.projects.map((p, i) => (
                <div key={i} className="mb-1.5">
                  <div><b>{p.name}</b>{p.tech ? <span className="resume-dim"> | {p.tech}</span> : null}</div>
                  <ul className="resume-list">{(p.bullets || []).map((b, j) => <li key={j}>{b}</li>)}</ul>
                </div>
              ))}
            </Sec>
          )}

          {[["coursework", "Relevant Coursework"], ["achievements", "Achievements"], ["extras", "Extras"]].map(([k, title]) => (
            (r[k] || []).length > 0 && (
              <Sec key={k} title={title}>
                <ul className="resume-list">{r[k].map((v, i) => <li key={i}>{v}</li>)}</ul>
              </Sec>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

function Sec({ title, children }) {
  return (
    <section className="resume-sec">
      <div className="resume-sec-title">{title}</div>
      <div className="resume-rule" />
      {children}
    </section>
  );
}
function Field({ label, value, onChange, testid }) {
  return (
    <label className="block">
      <div className="mono-label mb-1">{label}</div>
      <input className="input-dark w-full" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
    </label>
  );
}
function Area({ label, value, onChange, testid }) {
  return (
    <label className="block">
      <div className="mono-label mb-1">{label}</div>
      <textarea rows={3} className="input-dark w-full" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
    </label>
  );
}
