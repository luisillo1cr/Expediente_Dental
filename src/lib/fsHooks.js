// src/lib/fsHooks.js
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

// Aca encapsulo la desuscripción con try/catch para evitar que un bug del SDK rompa la UI al navegar. :contentReference[oaicite:1]{index=1}
function safeUnsub(unsub) {
  try {
    if (typeof unsub === "function") unsub();
  } catch (e) {
    console.warn("Ignoré un error al desuscribirme de Firestore:", e);
  }
}

export function useDocSnapshot(docRef, deps = []) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!docRef) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      docRef,
      (snap) => {
        setData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        // Aca manejo el error explícitamente para que no aparezca como “Uncaught error in snapshot listener”.
        setError(err);
        setLoading(false);
      }
    );

    return () => safeUnsub(unsub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { loading, data, error };
}

export function useQuerySnapshot(q, deps = []) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!q) {
      setLoading(false);
      setRows([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(next);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => safeUnsub(unsub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { loading, rows, error };
}
