import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";

const CAREERS = ["Software Engineering","AI/ML","Data Science","Cybersecurity","Electronics/VLSI","Core Engineering","Research","Consulting","Finance","Product Management","Entrepreneurship","Higher Studies","Government Careers","Civil Services","Design","Content/Media","Freelancing"];
const INTERESTS = ["Coding","Mathematics","Electronics","Robotics","Building products","Business","Public speaking","Writing","Science","Research","Design","Psychology","Economics","Finance","Gaming","Sports","Music","Content creation","Teaching","Leadership"];
const SKILLS_LIST = ["Logical thinking","Problem solving","Creativity","Communication","Leadership","Mathematics","Programming","Memorization","Analytical thinking","Teamwork","Public speaking","Writing","Discipline","Curiosity","Learning speed"];
const PRIORITIES = ["High salary","Job stability","Prestige","Intellectual challenge","Work-life balance","Entrepreneurship","Social impact","Research","Global opportunities","Fast growth"];
const HOBBIES = ["Chess","Gaming","Singing","Dancing","Drawing","Gym/Fitness","Sports","Music","Photography","Video editing","Content creation","Reading","Writing","Coding","Robotics"];
const CURRENT_SKILLS = ["Python","C++","Java","JavaScript","HTML/CSS","Data Structures","Git/GitHub","SQL","Excel","Machine Learning","CAD","MATLAB","Public Speaking","Leadership","Communication"];

const Chip = ({ selected, onClick, children, testid }) => (
  <button type="button" data-testid={testid} onClick={onClick} className={`px-4 py-2 border text-sm transition-colors ${selected ? "border-white bg-white text-black" : "border-white/15 text-white hover:border-white/40"}`}>{children}</button>
);

export default function Onboarding() {
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: r } = await api.get("/profile");
        setData(r.profile?.data || {});
        setStep(r.user?.onboarding_step || 0);
      } catch (err) { console.error("onboarding: load failed", err); }
    })();
  }, []);

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const toggle = (k, v) => {
    const arr = new Set(data[k] || []);
    arr.has(v) ? arr.delete(v) : arr.add(v);
    set(k, [...arr]);
  };

  const steps = [
    { title: "Basic Info", key: "basic", render: () => (
      <div className="grid gap-4">
        <Field label="COLLEGE" testid="ob-college" value={data.college || ""} onChange={(v) => set("college", v)} placeholder="e.g. IIT Bombay"/>
        <Field label="BRANCH" testid="ob-branch" value={data.branch || ""} onChange={(v) => set("branch", v)} placeholder="e.g. Computer Science"/>
        <div className="grid grid-cols-2 gap-4">
          <Field label="YEAR" testid="ob-year" value={data.year || ""} onChange={(v) => set("year", v)} placeholder="1-4"/>
          <Field label="SEMESTER" testid="ob-semester" value={data.semester || ""} onChange={(v) => set("semester", v)} placeholder="1-8"/>
        </div>
        <Field label="EXPECTED GRADUATION YEAR" testid="ob-gradyear" value={data.grad_year || ""} onChange={(v) => set("grad_year", v)} placeholder="e.g. 2028"/>
      </div>
    ) },
    { title: "Academic Background", key: "academic", render: () => (
      <div className="grid gap-4">
        <Field label="10TH PERCENTAGE" testid="ob-10th" value={data.tenth || ""} onChange={(v) => set("tenth", v)}/>
        <Field label="12TH PERCENTAGE" testid="ob-12th" value={data.twelfth || ""} onChange={(v) => set("twelfth", v)}/>
        <Field label="CURRENT CGPA (OPTIONAL)" testid="ob-cgpa" value={data.cgpa || ""} onChange={(v) => set("cgpa", v)} placeholder="Leave blank if unavailable"/>
        <Field label="STRONGEST SUBJECTS" testid="ob-strong-subj" value={data.strong_subjects || ""} onChange={(v) => set("strong_subjects", v)} placeholder="Comma separated"/>
        <Field label="WEAKEST SUBJECTS" testid="ob-weak-subj" value={data.weak_subjects || ""} onChange={(v) => set("weak_subjects", v)}/>
      </div>
    ) },
    { title: "Career Awareness", key: "aware", render: () => (
      <ChipGroup value={data.career_awareness} options={["Yes, very clearly","I have a rough idea","I have multiple options","I have no idea yet"]} onChange={(v) => set("career_awareness", v)} single testidPrefix="ob-aware"/>
    ) },
    { title: "Career Aspirations", key: "asp", render: () => (
      <ChipGroup value={data.aspirations || []} options={CAREERS} onChange={(v) => set("aspirations", v)} testidPrefix="ob-asp"/>
    ) },
    { title: "Interests", key: "int", render: () => (
      <ChipGroup value={data.interests || []} options={INTERESTS} onChange={(v) => set("interests", v)} testidPrefix="ob-int"/>
    ) },
    { title: "Strengths", key: "str", render: () => (
      <ChipGroup value={data.strengths || []} options={SKILLS_LIST} onChange={(v) => set("strengths", v)} testidPrefix="ob-str" hint="Pick 3-5 you're strong at."/>
    ) },
    { title: "Development Areas", key: "dev", render: () => (
      <ChipGroup value={data.dev_areas || []} options={SKILLS_LIST} onChange={(v) => set("dev_areas", v)} testidPrefix="ob-dev" hint="Areas you'd like to improve."/>
    ) },
    { title: "Work Style", key: "work", render: () => (
      <div className="grid gap-4">
        <ChipGroup label="You'd rather work" value={data.work_mode} options={["Independently","In a small team","In a large team"]} onChange={(v) => set("work_mode", v)} single testidPrefix="ob-work"/>
        <ChipGroup label="Your appetite for risk" value={data.risk} options={["Stable career","Balanced","High risk / high reward"]} onChange={(v) => set("risk", v)} single testidPrefix="ob-risk"/>
        <ChipGroup label="You prefer" value={data.env} options={["Predictable","Balanced","Dynamic"]} onChange={(v) => set("env", v)} single testidPrefix="ob-env"/>
      </div>
    ) },
    { title: "Career Priorities", key: "pri", render: () => (
      <ChipGroup value={data.priorities || []} options={PRIORITIES} onChange={(v) => set("priorities", v)} testidPrefix="ob-pri" hint="Pick 3 that matter most to you."/>
    ) },
    { title: "Hobbies & Passion", key: "hob", render: () => (
      <ChipGroup value={data.hobbies || []} options={HOBBIES} onChange={(v) => set("hobbies", v)} testidPrefix="ob-hob"/>
    ) },
    { title: "Time Availability", key: "time", render: () => (
      <ChipGroup value={data.available_time} options={["Less than 3 hrs / week","3-5 hrs / week","5-10 hrs / week","10-15 hrs / week","15+ hrs / week"]} onChange={(v) => set("available_time", v)} single testidPrefix="ob-time"/>
    ) },
    { title: "Current Skills", key: "cur", render: () => (
      <ChipGroup value={data.current_skills || []} options={CURRENT_SKILLS} onChange={(v) => set("current_skills", v)} testidPrefix="ob-cur" hint="Pick everything you have at least basic familiarity with."/>
    ) },
  ];

  const total = steps.length;
  const cur = steps[step];
  const progress = Math.round(((step + 1) / total) * 100);

  const save = async (nextStep, complete = false) => {
    setSaving(true);
    try {
      await api.post("/profile/onboarding", { step: nextStep, data, complete });
    } catch (ex) {
      toast.error("Save failed");
    } finally { setSaving(false); }
  };

  const back = async () => { if (step > 0) { const s = step - 1; setStep(s); await save(s); } };
  const next = async () => {
    if (step < total - 1) { const s = step + 1; setStep(s); await save(s); }
    else {
      await save(total, true);
      await refresh();
      toast.success("Onboarding complete. Starting your AI career interview...");
      nav("/interview");
    }
  };

  return (
    <div className="min-h-screen grain" data-testid="onboarding-page">
      <nav className="border-b border-white/10 bg-black/80 sticky top-0 z-20 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="font-display text-lg flex items-center gap-2"><div className="w-6 h-6 border border-white/70 flex items-center justify-center"><div className="w-2 h-2 bg-white"/></div>PATHFORGE<span className="text-white/40">.AI</span></div>
          <div className="mono-label">STEP {step + 1} / {total} · {progress}%</div>
        </div>
        <div className="h-px bg-white/10"><div className="h-px bg-white transition-all" style={{ width: `${progress}%` }}/></div>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mono-label mb-4">// hello {user?.full_name?.split(" ")[0]}</div>
        <h1 className="font-display text-4xl tracking-tight mb-8">{cur.title}</h1>
        <div className="card-surface p-8">{cur.render()}</div>
        <div className="mt-8 flex justify-between">
          <button className="btn-ghost" onClick={back} disabled={step === 0 || saving} data-testid="ob-back"><ChevronLeft className="inline w-3 h-3 mr-1"/>BACK</button>
          <button className="btn-primary" onClick={next} disabled={saving} data-testid="ob-next">{step === total - 1 ? "FINISH" : "CONTINUE"} <ChevronRight className="inline w-3 h-3 ml-1"/></button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, testid }) {
  return (
    <div>
      <label className="mono-label block mb-2">{label}</label>
      <input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent border border-white/15 focus:border-white outline-none px-4 py-3 font-mono-ui text-sm"/>
    </div>
  );
}

function ChipGroup({ value, options, onChange, single = false, testidPrefix, label, hint }) {
  const isSel = (o) => single ? value === o : (value || []).includes(o);
  return (
    <div>
      {label && <div className="mono-label mb-3">{label}</div>}
      {hint && <div className="text-xs text-neutral-500 mb-3">{hint}</div>}
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => (
          <Chip key={o} testid={`${testidPrefix}-${i}`} selected={isSel(o)} onClick={() => {
            if (single) onChange(o);
            else {
              const s = new Set(value || []);
              s.has(o) ? s.delete(o) : s.add(o);
              onChange([...s]);
            }
          }}>{o}</Chip>
        ))}
      </div>
    </div>
  );
}
