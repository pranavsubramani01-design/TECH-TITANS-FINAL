import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export default function Interview() {
  const nav = useNavigate();
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const bottom = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/ai/interview/history");
        if ((data.messages || []).length === 0) start();
        else setMsgs(data.messages);
      } catch (err) { console.error("interview: load failed", err); }
    })();
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/ai/interview", { start: true });
      setMsgs([{ role: "forge", content: data.reply, ts: new Date().toISOString() }]);
    } catch { toast.error("Failed to start"); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!input.trim() || busy) return;
    const text = input.trim();
    setInput("");
    setMsgs((m) => [...m, { role: "student", content: text }]);
    setBusy(true);
    try {
      const { data } = await api.post("/ai/interview", { message: text });
      setMsgs((m) => [...m, { role: "forge", content: data.reply }]);
    } catch { toast.error("Send failed"); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    setAnalyzing(true);
    try {
      await api.post("/ai/generate-profile");
      await api.post("/ai/generate-roadmap");
      toast.success("Your profile is ready");
      nav("/profile-results");
    } catch (ex) {
      toast.error(ex.response?.data?.detail || "AI analysis failed");
    } finally { setAnalyzing(false); }
  };

  return (
    <div className="min-h-screen grain flex flex-col" data-testid="interview-page">
      <nav className="border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="font-display text-lg flex items-center gap-2"><div className="w-6 h-6 border border-white/70 flex items-center justify-center"><div className="w-2 h-2 bg-white"/></div>PATHFORGE<span className="text-white/40">.AI</span></div>
          <div className="mono-label flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-white pulse-ring"/>FORGE // INTERVIEW</div>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
          <div className="mono-label mb-2">// adaptive career interview</div>
          <h1 className="font-display text-3xl tracking-tight mb-6">Let's talk.</h1>
          <div className="text-neutral-400 text-sm mb-8">Answer honestly. There are no wrong answers. Forge is adapting each question to what you just said.</div>
          {msgs.map((m, i) => (
            <div key={i} className={`fade-up ${m.role === "student" ? "flex justify-end" : ""}`}>
              <div className={`max-w-[85%] p-4 border ${m.role === "student" ? "border-white bg-white text-black font-mono-ui text-sm" : "border-white/10 bg-[#0a0a0a] font-mono-ui text-sm"}`}>
                {m.role === "forge" && <div className="mono-label mb-2 text-neutral-500">FORGE</div>}
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div className="text-neutral-500 font-mono-ui text-xs animate-pulse">FORGE IS THINKING...</div>}
          <div ref={bottom}/>
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 py-4 flex gap-3 items-end">
          <textarea data-testid="interview-input" rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Type your answer..." className="flex-1 bg-transparent border border-white/15 focus:border-white outline-none px-4 py-3 font-mono-ui text-sm resize-none"/>
          <button className="btn-primary" onClick={send} disabled={busy || !input.trim()} data-testid="interview-send">SEND</button>
        </div>
        <div className="max-w-3xl mx-auto px-6 pb-6 flex justify-between items-center">
          <div className="text-xs text-neutral-500 font-mono-ui">{msgs.filter((m) => m.role === "student").length} REPLIES · Aim for at least 4-6 before finishing.</div>
          <button data-testid="interview-finish" onClick={finish} disabled={analyzing || msgs.filter(m => m.role === "student").length < 3} className="btn-ghost">
            <Sparkles className="inline w-3 h-3 mr-1"/>{analyzing ? "ANALYSING..." : "FINISH & ANALYSE"}
          </button>
        </div>
      </div>
    </div>
  );
}
