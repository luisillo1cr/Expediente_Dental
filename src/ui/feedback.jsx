// src/ui/feedback.jsx
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const FeedbackCtx = createContext(null);

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

function safeId() {
  try {
    if (typeof crypto !== "undefined" && crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return String(Date.now()) + "-" + String(Math.random()).slice(2);
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const resolverRef = useRef(null);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (type, message, opts = {}) => {
      const id = safeId();
      const ttl = Number(opts.ttl ?? 3000);
      const title = String(opts.title || "");

      setToasts((prev) => [...prev, { id, type, title, message: String(message || "") }]);

      if (ttl > 0) window.setTimeout(() => removeToast(id), ttl);
      return id;
    },
    [removeToast]
  );

  const toastApi = useMemo(() => {
    return {
      success: (msg, opts) => pushToast("success", msg, opts),
      error: (msg, opts) => pushToast("error", msg, opts),
      info: (msg, opts) => pushToast("info", msg, opts),
    };
  }, [pushToast]);

  const confirm = useCallback(async (opts = {}) => {
    const payload = {
      title: String(opts.title || "Confirmar"),
      message: String(opts.message || ""),
      confirmText: String(opts.confirmText || "Confirmar"),
      cancelText: String(opts.cancelText || "Cancelar"),
      danger: !!opts.danger,
    };

    // Devuelve Promise<boolean>
    return await new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirmState(payload);
    });
  }, []);

  const ctxValue = useMemo(() => {
    return { toast: toastApi, confirm };
  }, [toastApi, confirm]);

  function closeConfirm(result) {
    const r = resolverRef.current;
    resolverRef.current = null;
    setConfirmState(null);
    if (typeof r === "function") r(!!result);
  }

  return (
    <FeedbackCtx.Provider value={ctxValue}>
      {children}

      {/* Toasts */}
      <div className="fixed right-4 top-4 z-[9999] w-[min(420px,calc(100vw-2rem))] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-2xl border bg-white px-4 py-3 text-sm shadow-lg",
              t.type === "success" && "border-emerald-200",
              t.type === "error" && "border-rose-200",
              t.type === "info" && "border-sky-200"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {t.title ? <div className="font-extrabold text-slate-900">{t.title}</div> : null}
                <div className="mt-0.5 text-slate-700 whitespace-pre-wrap">{t.message}</div>
              </div>

              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="rounded-xl px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                X
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => closeConfirm(false)} />

          <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
            <div className="text-lg font-extrabold text-slate-900">{confirmState.title}</div>

            {confirmState.message ? (
              <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                {confirmState.message}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-300"
                onClick={() => closeConfirm(false)}
              >
                {confirmState.cancelText}
              </button>

              <button
                type="button"
                className={cn(
                  "rounded-2xl px-4 py-2 text-sm font-bold text-white",
                  confirmState.danger
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                )}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) {
    return { success: () => {}, error: () => {}, info: () => {} };
  }
  return ctx.toast;
}

export function useConfirm() {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) {
    return async (opts = {}) =>
      window.confirm(String(opts?.title ? `${opts.title}\n\n${opts.message || ""}` : opts.message || ""));
  }
  return ctx.confirm;
}

// opcional (por compatibilidad)
export function useFeedback() {
  const toast = useToast();
  const confirm = useConfirm();
  return { ...toast, confirm };
}
