import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { X, Send, Sparkles, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

// Web Speech API helpers (browser-native, no external API)
const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices();
  // prefer a deep male en-* voice for the Jarvis feel
  const preferred = ["Google UK English Male", "Microsoft Guy", "Daniel", "Alex", "Google US English"];
  for (const p of preferred) {
    const v = voices.find((x) => x.name === p);
    if (v) return v;
  }
  return voices.find((v) => v.lang?.startsWith("en")) || voices[0] || null;
}

export default function ForgeDrawer({ open, onClose, autoStartVoice = false, initialQuestion = "" }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);   // speak replies
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);           // 0..1 mic input volume for animation
  const [liveTranscript, setLiveTranscript] = useState(""); // words as Forge speaks
  const bottom = useRef(null);
  const recogRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const { data } = await api.get("/ai/forge/history");
        const hist = data.messages || [];
        setMsgs((m) => (m.length > hist.length ? m : hist));
      } catch {}
    })();
  }, [open]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  // periodic Jarvis-style ambient nudge
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fetchNudge = async () => {
      try {
        const { data } = await api.post("/ai/forge/nudge");
        if (!cancelled) setNudge(data.nudge);
      } catch {}
    };
    fetchNudge();
    const iv = setInterval(fetchNudge, 90_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [open]);

  const stopMicViz = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (err) { console.debug("forge: audio close failed", err); } audioCtxRef.current = null; }
    analyserRef.current = null;
    setLevel(0);
  }, []);

  const startMicViz = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setLevel(Math.min(1, sum / data.length / 128));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (ex) { /* mic denied */ }
  }, []);

  const speak = useCallback((text) => {
    if (!voiceOn || !synth) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = 1.02; u.pitch = 0.9;
      // live transcript: reveal spoken words as they're spoken
      const words = text.split(/(\s+)/); // keep whitespace tokens
      let idx = 0;
      setLiveTranscript("");
      let interval = null;
      const startReveal = () => {
        // estimate reveal cadence from utterance rate; ~4 words/sec at rate 1
        const stepMs = Math.max(80, 260 / (u.rate || 1));
        interval = setInterval(() => {
          idx++;
          if (idx > words.length) { clearInterval(interval); return; }
          setLiveTranscript(words.slice(0, idx).join(""));
        }, stepMs);
      };
      u.onstart = () => { setSpeaking(true); startReveal(); };
      u.onboundary = (ev) => {
        // resync when we get real word boundaries
        if (ev.name === "word") {
          const char = ev.charIndex || 0;
          setLiveTranscript(text.slice(0, char + (ev.charLength || 6)));
        }
      };
      u.onend = () => { setSpeaking(false); if (interval) clearInterval(interval); setLiveTranscript(text); setTimeout(() => setLiveTranscript(""), 2500); };
      u.onerror = () => { setSpeaking(false); if (interval) clearInterval(interval); setLiveTranscript(""); };
      synth.speak(u);
    } catch {}
  }, [voiceOn]);

  const doSend = useCallback(async (text) => {
    if (!text?.trim() || busy) return;
    setMsgs((m) => [...m, { role: "student", content: text }]);
    setBusy(true);
    try {
      const { data } = await api.post("/ai/forge", { message: text });
      setMsgs((m) => [...m, { role: "forge", content: data.reply }]);
      speak(data.reply);
    } catch { toast.error("Forge failed"); }
    finally { setBusy(false); }
  }, [busy, speak]);

  const send = () => { const t = input.trim(); setInput(""); doSend(t); };

  const toggleListening = useCallback(async () => {
    if (!SR) { toast.error("Voice input not supported in this browser"); return; }
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    r.onstart = () => { setListening(true); startMicViz(); };
    r.onend = () => { setListening(false); stopMicViz(); };
    r.onerror = () => { setListening(false); stopMicViz(); };
    r.onresult = (ev) => {
      const t = ev.results[0]?.[0]?.transcript || "";
      if (t) doSend(t);
    };
    recogRef.current = r;
    r.start();
    // auto-enable spoken replies when using voice
    if (!voiceOn) setVoiceOn(true);
  }, [listening, voiceOn, doSend, startMicViz, stopMicViz]);

  const toggleVoice = () => {
    setVoiceOn((v) => {
      if (v && synth) synth.cancel();
      return !v;
    });
  };

  // cleanup on close
  useEffect(() => {
    if (!open) {
      try { recogRef.current?.stop(); } catch (err) { console.debug("forge: recognition stop failed", err); }
      if (synth) synth.cancel();
      setListening(false); setSpeaking(false);
      stopMicViz();
    }
  }, [open, stopMicViz]);

  // wake-word auto-start: when opened via "Hey Forge", flip voice on + start listening
  useEffect(() => {
    if (open && autoStartVoice) {
      setVoiceOn(true);
      const t = setTimeout(() => { if (!listening) toggleListening(); }, 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line
  }, [open, autoStartVoice]);

  // question handed over from global search
  const sentQRef = useRef("");
  useEffect(() => {
    if (open && initialQuestion && sentQRef.current !== initialQuestion) {
      sentQRef.current = initialQuestion;
      doSend(initialQuestion);
    }
    if (!open) sentQRef.current = "";
    // eslint-disable-next-line
  }, [open, initialQuestion]);

  if (!open) return null;

  // build reactor scale/glow from mic level + speaking state
  const active = listening || speaking;
  const reactorScale = 1 + (listening ? level * 0.6 : speaking ? 0.15 : 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="forge-drawer">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}/>
      <div className="relative w-full sm:w-[460px] bg-black border-l border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArcReactor active={active} scale={reactorScale}/>
            <div>
              <div className="font-display text-lg leading-none">FORGE</div>
              <div className="mono-label text-neutral-500 leading-tight mt-1">{listening ? "listening" : speaking ? "speaking" : "ambient"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleVoice} title={voiceOn ? "Mute replies" : "Speak replies"} data-testid="forge-voice-toggle" className={`p-2 border ${voiceOn ? "border-white bg-white text-black" : "border-white/20 text-white/70"} transition-colors`}>
              {voiceOn ? <Volume2 className="w-4 h-4"/> : <VolumeX className="w-4 h-4"/>}
            </button>
            <button onClick={toggleListening} title={listening ? "Stop" : "Voice input"} data-testid="forge-mic" className={`p-2 border ${listening ? "border-white bg-white text-black" : "border-white/20 text-white/70"} transition-colors`}>
              {listening ? <MicOff className="w-4 h-4"/> : <Mic className="w-4 h-4"/>}
            </button>
            <button onClick={onClose} className="text-neutral-400 hover:text-white p-2" data-testid="forge-close"><X className="w-4 h-4"/></button>
          </div>
        </div>

        {nudge && (
          <div className="mx-4 mt-4 p-3 border border-white/15 font-mono-ui text-xs text-white/90 fade-up" data-testid="forge-nudge">
            <div className="mono-label mb-1 flex items-center gap-1 text-neutral-500"><Sparkles className="w-3 h-3"/> AMBIENT SUGGESTION</div>
            {nudge}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {msgs.length === 0 && (
            <div className="text-neutral-500 text-sm">
              Ask Forge anything. Tap <Mic className="inline w-3 h-3"/> to speak, <Volume2 className="inline w-3 h-3"/> to hear replies. Say "Hey Forge" from anywhere.
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "student" ? "flex justify-end" : ""}>
              <div className={`max-w-[85%] p-3 border font-mono-ui text-xs leading-relaxed ${m.role === "student" ? "border-white bg-white text-black" : "border-white/10 bg-[#0a0a0a]"}`}>{m.content}</div>
            </div>
          ))}
          {busy && <div className="text-neutral-500 font-mono-ui text-xs animate-pulse">FORGE IS THINKING...</div>}
          {speaking && liveTranscript && (
            <div className="sticky bottom-0 -mx-4 px-4 py-3 border-t border-white/10 bg-black/95 backdrop-blur-md" data-testid="forge-live-transcript">
              <div className="mono-label mb-1 text-neutral-500 flex items-center gap-1"><Volume2 className="w-3 h-3"/> SPEAKING</div>
              <div className="font-mono-ui text-sm text-white/95">{liveTranscript}<span className="inline-block w-1.5 h-3 bg-white/80 ml-0.5 align-middle animate-pulse"/></div>
            </div>
          )}
          <div ref={bottom}/>
        </div>
        <div className="p-4 border-t border-white/10 flex gap-2 items-center">
          <input data-testid="forge-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={listening ? "Listening..." : "Ask Forge..."} className="flex-1 bg-transparent border border-white/15 focus:border-white outline-none px-3 py-2 font-mono-ui text-xs"/>
          <button onClick={send} className="btn-primary !px-3 !py-2" data-testid="forge-send"><Send className="w-3 h-3"/></button>
        </div>
      </div>
    </div>
  );
}

// Jarvis arc-reactor: three rotating rings + center dot; pulses on speak, blooms on listen
function ArcReactor({ active, scale }) {
  return (
    <div className="relative w-10 h-10 flex items-center justify-center" style={{ transform: `scale(${scale})`, transition: "transform 120ms ease-out" }} data-testid="arc-reactor">
      <div className={`absolute inset-0 border rounded-full ${active ? "border-white" : "border-white/40"} ${active ? "arc-spin" : ""}`}/>
      <div className={`absolute inset-1 border rounded-full ${active ? "border-white/70" : "border-white/25"} ${active ? "arc-spin-reverse" : ""}`}/>
      <div className={`absolute inset-2 border rounded-full ${active ? "border-white/50" : "border-white/15"} ${active ? "arc-spin" : ""}`} style={{ animationDuration: "6s" }}/>
      <div className={`relative w-2 h-2 rounded-full bg-white ${active ? "shadow-[0_0_10px_2px_rgba(255,255,255,0.9)]" : "opacity-70"}`}/>
    </div>
  );
}
