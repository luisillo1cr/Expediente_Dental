import React, { useCallback, useMemo, useRef, useState } from "react";
import { FeedbackCtx } from "./context";

function cls(...xs) {
  return xs.filter(Boolean).join(" ");
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const idRef = useRef(1);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (type, message, opts = {}) => {
      const id = idRef.current++;
      const toast = {
        id,
        type,
        message: String(message || ""),
        title: opts.title ? String(opts.title) : "",
        durationMs: Number(opts.durationMs || 2800),
      };
      setToasts((prev) => [toast, ...prev].slice(0, 5));

      window.setTimeout(() => removeToast(id), toast.durationMs);
    },
    [removeToast]
  );

  const api = useMemo(() => {
    const success = (msg, opts) => pushToast("success", msg, opts);
    const error = (msg, opts) => pushToast("error", msg, opts);
    const info = (msg, opts) => pushToast("info", msg, opts);

    const confirm = (message, opts = {}) =>
      new Promise((resolve) => {
        setConfirmState({
          open: true,
          title: opts.title ? String(opts.title) : "Confirmar",
          message: String(message || ""),
          confirmText: opts.confirmText ? String(opts.confirmText) : "Confirmar",
          cancelText: opts.cancelText ? String(opts.cancelText) : "Cancelar",
          danger: !!opts.danger,
          resolve,
        });
      });

    return { success, error, info, confirm };
  }, [pushToast]);

  return (
    <FeedbackCtx.Provider value={api}>
      {children}

      {/* Toasts */}
      <div className="fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cls(
              "w-[320px] max-w-[85vw] rounded-2xl border bg-white px-4 py-3 shadow-lg",
              t.type === "success" && "border-emerald-200",
              t.type === "error" && "border-rose-200",
              t.type === "info" && "border-slate-200"
            )}
          >
            {t.title ? (
              <div className="text-sm font-extrabold text-slate-900">{t.title}</div>
            ) : null}
            <div className="text-sm text-slate-700">{t.message}</div>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState?.open ? (
        <div className="fixed inset-0 z-[110]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              confirmState.resolve(false);
              setConfirmState(null);
            }}
          />
          <div className="absolute left-1/2 top-1/2 w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
            <div className="text-lg font-extrabold text-slate-900">{confirmState.title}</div>
            <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
              {confirmState.message}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                {confirmState.cancelText}
              </button>

              <button
                type="button"
                className={cls(
                  "rounded-2xl px-4 py-2 text-sm font-bold text-white",
                  confirmState.danger ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-900 hover:bg-slate-800"
                )}
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
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
