import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Cpu, Compass, LineChart, Sparkles } from "lucide-react";

export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen grain" data-testid="landing-page">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg">
            <div className="w-6 h-6 border border-white/70 flex items-center justify-center"><div className="w-2 h-2 bg-white"/></div>
            PATHFORGE<span className="text-white/40">.AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="mono-label hover:text-white transition-colors" data-testid="nav-login">LOGIN</Link>
            <button className="btn-primary" onClick={() => nav("/signup")} data-testid="nav-signup">GET STARTED <ArrowRight className="inline w-3 h-3 ml-1"/></button>
          </div>
        </div>
      </nav>

      <section className="relative">
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8">
            <div className="mono-label mb-6">// STUDENT CAREER OS · v1.0</div>
            <h1 className="font-display font-light text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tighter">
              An AI that watches<br/>your path, and tells<br/>you <span className="text-white/50">exactly</span> what to<br/>do next.
            </h1>
            <p className="mt-8 text-neutral-400 max-w-2xl leading-relaxed text-lg">
              PathForge is a Jarvis-style career operating system for students. It profiles who you are, maps a personalised 4-year roadmap, and quietly nudges you every day toward the career you're actually built for.
            </p>
            <div className="mt-10 flex gap-3 flex-wrap">
              <button className="btn-primary" onClick={() => nav("/signup")} data-testid="hero-cta-signup">START YOUR PROFILE</button>
              <button className="btn-ghost" onClick={() => nav("/login")} data-testid="hero-cta-login">I HAVE AN ACCOUNT</button>
            </div>
          </div>
          <div className="lg:col-span-4 relative">
            <div className="card-surface p-6 h-full flex flex-col justify-between">
              <div>
                <div className="mono-label mb-3">FORGE // ambient</div>
                <div className="font-mono-ui text-sm text-white/90 leading-relaxed">
                  <span className="text-white/40">&gt;</span> analysing your last 3 study sessions...<br/>
                  <span className="text-white/40">&gt;</span> DSA pace: <span className="text-white">+18%</span> this week<br/>
                  <span className="text-white/40">&gt;</span> recommend: 45 min arrays + 1 mock<br/>
                  <span className="text-white/40">&gt;</span> midterms in 6 days — <span className="text-white">reducing side load</span>
                </div>
              </div>
              <div className="pt-6 mt-6 border-t border-white/10">
                <div className="mono-label">STATE</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white pulse-ring"/>
                  <span className="font-mono-ui text-xs">MONITORING</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-4 gap-px bg-white/10">
          {[
            { icon: Compass, k: "01", t: "Deep Profile", d: "Interest, strength, weakness, personality and priority mapping across 15+ signals." },
            { icon: Cpu, k: "02", t: "Adaptive AI Interview", d: "Claude-powered follow-ups that adapt to what you just said, not a fixed script." },
            { icon: LineChart, k: "03", t: "4-Year Roadmap", d: "A living node-based map that reshapes as you grow, drop courses or change goals." },
            { icon: Sparkles, k: "04", t: "Forge Companion", d: "A calm ambient AI that suggests today's plan, weekly focus and roadmap tweaks." },
          ].map((f) => (
            <div key={f.k} className="bg-black p-8 hover:bg-white/[0.02] transition-colors" data-testid={`feature-${f.k}`}>
              <div className="mono-label mb-6">{f.k} / 04</div>
              <f.icon className="w-6 h-6 mb-4"/>
              <div className="font-display text-2xl mb-2">{f.t}</div>
              <div className="text-neutral-400 text-sm leading-relaxed">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-16">
          <div>
            <div className="mono-label mb-6">// THE LOOP</div>
            <h2 className="font-display text-4xl tracking-tight leading-tight">Track → Analyze → Adapt → Recommend → Track again.</h2>
            <p className="mt-6 text-neutral-400 leading-relaxed">Every completed task updates your skills, your roadmap, your career readiness — and tomorrow's plan. Nothing is static.</p>
          </div>
          <div className="space-y-px bg-white/10">
            {["Where am I on my career map?","What's the smartest thing I can do today?","Which career actually fits me?","How ready am I for placement?"].map((q, i) => (
              <div key={i} className="bg-black px-6 py-5 flex items-center gap-4">
                <span className="mono-label w-8">0{i+1}</span>
                <span className="font-display text-lg text-white/90">{q}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-10 flex items-center justify-between text-neutral-500 text-xs font-mono-ui">
          <div>PATHFORGE.AI · BUILT FOR STUDENTS</div>
          <div>© 2026</div>
        </div>
      </footer>
    </div>
  );
}
