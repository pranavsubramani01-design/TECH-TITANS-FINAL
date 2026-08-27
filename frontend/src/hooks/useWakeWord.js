import { useEffect, useRef } from "react";

// Persistent background listener for "hey forge" / "hi forge" / "ok forge"
export default function useWakeWord({ enabled, onWake }) {
  const recogRef = useRef(null);
  const stoppedRef = useRef(false);
  const restartTimer = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!enabled || !SR) return;

    stoppedRef.current = false;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;

    const triggers = ["hey forge", "hi forge", "ok forge", "okay forge", "yo forge"];

    r.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = (ev.results[i][0]?.transcript || "").toLowerCase().trim();
        if (triggers.some((k) => t.includes(k))) {
          try { r.stop(); } catch (err) { console.debug("wake: stop failed", err); }
          onWake?.();
          break;
        }
      }
    };
    r.onerror = () => {
      // recover after short delay unless disabled
      if (!stoppedRef.current) {
        restartTimer.current = setTimeout(() => { try { r.start(); } catch (err) { console.debug("wake: restart failed", err); } }, 1500);
      }
    };
    r.onend = () => {
      if (!stoppedRef.current) {
        restartTimer.current = setTimeout(() => { try { r.start(); } catch (err) { console.debug("wake: restart failed", err); } }, 400);
      }
    };
    try { r.start(); } catch (err) { console.debug("wake: start failed", err); }
    recogRef.current = r;

    return () => {
      stoppedRef.current = true;
      if (restartTimer.current) clearTimeout(restartTimer.current);
      try { r.stop(); } catch (err) { console.debug("wake: cleanup stop failed", err); }
    };
  }, [enabled, onWake]);
}
