import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Search, CornerDownLeft, Sparkles } from "lucide-react";

const GROUP_LABEL = {
  pages: "PAGES", roadmap: "ROADMAP NODES", founder: "FOUNDER TRACK",
  skills: "SKILLS", projects: "PROJECTS", careers: "CAREERS", companies: "COMPANIES",
};

export default function CommandPalette({ open, onClose, onAskForge }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState({});
  const [askForge, setAskForge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { if (open) { setQ(""); setActive(0); inputRef.current?.focus(); } }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/search", { params: { q } });
        if (!cancel) { setRes(data.results || {}); setAskForge(!!data.ask_forge); setActive(0); }
      } catch { if (!cancel) { setRes({}); setAskForge(!!q.trim()); } }
      finally { if (!cancel) setBusy(false); }
    }, 180);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, open]);

  const flat = useMemo(() => {
    const out = [];
    Object.entries(GROUP_LABEL).forEach(([key, label]) => {
      (res[key] || []).forEach((item) => out.push({ ...item, group: label, key }));
    });
    if (askForge && q.trim()) out.push({ title: `Ask Forge: "${q.trim()}"`, subtitle: "No matches — send this to your AI companion", group: "FORGE", key: "forge" });
    return out;
  }, [res, askForge, q]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (item) => {
    if (!item) return;
    onClose();
    if (item.key === "forge") onAskForge(q.trim());
    else nav(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(flat[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  if (!open) return null;

  let idx = -1;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4" data-testid="command-palette">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/15 shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search className="w-4 h-4 text-neutral-500" />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search tasks, skills, careers, companies..."
            data-testid="palette-input"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-600"
          />
          <span className="font-mono-ui text-[10px] text-neutral-600 border border-white/10 px-1.5 py-0.5">ESC</span>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto" data-testid="palette-results">
          {busy && flat.length === 0 && <div className="p-6 font-mono-ui text-xs text-neutral-500">SEARCHING...</div>}
          {!busy && flat.length === 0 && <div className="p-6 font-mono-ui text-xs text-neutral-500">NO RESULTS</div>}
          {Object.entries(GROUP_LABEL).map(([key, label]) => {
            const items = res[key] || [];
            if (!items.length) return null;
            return (
              <div key={key}>
                <div className="mono-label px-4 pt-4 pb-1 text-neutral-600">{label}</div>
                {items.map((item) => {
                  idx += 1;
                  const i = idx;
                  return (
                    <button key={`${key}-${i}`} data-idx={i} data-testid={`palette-item-${i}`}
                      onMouseEnter={() => setActive(i)} onClick={() => choose({ ...item, key })}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-4 border-l-2 transition-colors ${active === i ? "bg-white/[0.06] border-white" : "border-transparent hover:bg-white/[0.03]"}`}>
                      <div className="min-w-0">
                        <div className="text-sm truncate">{item.title}</div>
                        {item.subtitle && <div className="text-xs text-neutral-500 truncate">{item.subtitle}</div>}
                      </div>
                      {active === i && <CornerDownLeft className="w-3 h-3 text-neutral-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {askForge && q.trim() && (() => {
            idx += 1;
            const i = idx;
            return (
              <div>
                <div className="mono-label px-4 pt-4 pb-1 text-neutral-600">FORGE</div>
                <button data-idx={i} data-testid="palette-ask-forge" onMouseEnter={() => setActive(i)} onClick={() => choose({ key: "forge" })}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 border-l-2 transition-colors ${active === i ? "bg-white/[0.06] border-white" : "border-transparent hover:bg-white/[0.03]"}`}>
                  <Sparkles className="w-4 h-4 text-white/70 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm truncate">Ask Forge: “{q.trim()}”</div>
                    <div className="text-xs text-neutral-500">No matches — send this to your AI companion</div>
                  </div>
                </button>
              </div>
            );
          })()}
        </div>

        <div className="px-4 py-2 border-t border-white/10 flex gap-4 font-mono-ui text-[10px] text-neutral-600">
          <span>↑↓ NAVIGATE</span><span>⏎ OPEN</span><span>⌘K TOGGLE</span>
        </div>
      </div>
    </div>
  );
}
