// src/pages/RequestAccess.jsx
import React, { useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { CLINIC_ID } from "../config";
import { useSession } from "../auth/useSession";
import logo from "../assets/ovares-logo.png";

export default function RequestAccess() {
  const { user } = useSession();

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  const [message, setMessage] = useState("");

  const requestRef = useMemo(() => {
    if (!user) return null;
    return doc(db, "clinics", CLINIC_ID, "joinRequests", user.uid);
  }, [user]);

  useEffect(() => {
    if (!user || !requestRef) return;

    (async () => {
      setLoading(true);
      setMessage("");

      try {
        // Si no existe solicitud, se crea automáticamente una sola vez.
        const snap = await getDoc(requestRef);

        if (!snap.exists()) {
          await setDoc(
            requestRef,
            {
              uid: user.uid,
              email: user.email || null,
              displayName: user.displayName || null,
              providerIds: (user.providerData || []).map((p) => p.providerId),
              status: "pending",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          const snap2 = await getDoc(requestRef);
          setRequest(snap2.exists() ? { id: snap2.id, ...snap2.data() } : null);
        } else {
          setRequest({ id: snap.id, ...snap.data() });
        }
      } catch (e) {
        setMessage(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [user, requestRef]);

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 p-6">
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo clínica" className="h-12 w-12 object-contain" />
            <div>
              <h1 className="text-xl font-extrabold">Solicitud de acceso</h1>
              <p className="mt-1 text-sm text-slate-600">
                Tu cuenta existe, pero aún no está autorizada dentro de la clínica.
              </p>
            </div>
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-600">Cargando...</p> : null}

          {!loading && message ? (
            <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
              {message}
            </div>
          ) : null}

          {!loading && request ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-sm text-slate-700">
                Estado: <b>{request.status}</b>
              </div>

              {request.status === "pending" ? (
                <p className="mt-2 text-sm text-slate-600">
                  La solicitud está pendiente. Un administrador la revisará.
                </p>
              ) : null}

              {request.status === "approved" ? (
                <p className="mt-2 text-sm text-slate-600">
                  Tu solicitud fue aprobada. Recargá la página para ingresar.
                </p>
              ) : null}

              {request.status === "rejected" ? (
                <p className="mt-2 text-sm text-slate-600">
                  La solicitud fue rechazada. Contactá a un administrador si es un error.
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            className="mt-6 w-full rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-600"
            onClick={handleLogout}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
