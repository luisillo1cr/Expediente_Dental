import { useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";

const IDLE_MS = 5 * 60 * 1000; // 5 minutos

export function useIdleLogout(enabled = true) {
  const nav = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    function clearTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    async function doLogout() {
      clearTimer();
      try {
        await signOut(auth);
      } catch {}
      nav("/login", { replace: true });
    }

    function reset() {
      clearTimer();
      timerRef.current = setTimeout(doLogout, IDLE_MS);
    }

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reset));
      clearTimer();
    };
  }, [enabled, nav]);
}
