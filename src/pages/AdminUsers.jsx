// src/pages/AdminUsers.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  where,
} from "firebase/firestore";
import { ShieldCheck, CheckCircle2, XCircle } from "lucide-react";

import { db } from "../firebase";
import { CLINIC_ID } from "../config";
import { useSession } from "../auth/useSession";

export default function AdminUsers() {
  const { user, member } = useSession();

  const [pending, setPending] = useState([]);
  const [members, setMembers] = useState([]);
  const [actionMsg, setActionMsg] = useState("");

  const canAdmin = member?.role === "admin";

  const joinRequestsCol = useMemo(
    () => collection(db, "clinics", CLINIC_ID, "joinRequests"),
    []
  );

  const membersCol = useMemo(
    () => collection(db, "clinics", CLINIC_ID, "members"),
    []
  );

  useEffect(() => {
    if (!canAdmin) return;

    const q = query(
      joinRequestsCol,
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setActionMsg("No pude cargar las solicitudes. Revisá permisos/reglas.")
    );

    return () => unsub();
  }, [joinRequestsCol, canAdmin]);

  useEffect(() => {
    if (!canAdmin) return;

    const q = query(membersCol, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setActionMsg("No pude cargar los miembros. Revisá permisos/reglas.")
    );

    return () => unsub();
  }, [membersCol, canAdmin]);

  async function approveRequest(reqUid, role) {
    setActionMsg("");

    if (!user?.uid) {
      setActionMsg("No tengo sesión válida para aprobar.");
      return;
    }

    try {
      const batch = writeBatch(db);

      // Aca activo/creo el member del usuario dentro de la clínica.
      const memberRef = doc(db, "clinics", CLINIC_ID, "members", reqUid);
      batch.set(
        memberRef,
        {
          role,
          status: "active",
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );

      // Aca marco la solicitud como aprobada (uso set merge para no fallar si el doc no existiera).
      const requestRef = doc(db, "clinics", CLINIC_ID, "joinRequests", reqUid);
      batch.set(
        requestRef,
        {
          status: "approved",
          role,
          decidedAt: serverTimestamp(),
          decidedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      setActionMsg("Solicitud aprobada y rol asignado.");
    } catch (e) {
      setActionMsg(String(e?.message || e));
    }
  }

  async function rejectRequest(reqUid) {
    setActionMsg("");

    if (!user?.uid) {
      setActionMsg("No tengo sesión válida para rechazar.");
      return;
    }

    try {
      const batch = writeBatch(db);
      const requestRef = doc(db, "clinics", CLINIC_ID, "joinRequests", reqUid);

      batch.set(
        requestRef,
        {
          status: "rejected",
          decidedAt: serverTimestamp(),
          decidedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      setActionMsg("Solicitud rechazada.");
    } catch (e) {
      setActionMsg(String(e?.message || e));
    }
  }

  if (!canAdmin) {
    return (
      <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <div className="font-extrabold">Administración de usuarios</div>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Tu rol no tiene permisos para ver esta pantalla.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <h1 className="text-xl font-extrabold text-slate-900">Administración de usuarios</h1>

        {actionMsg ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
            {actionMsg}
          </div>
        ) : null}
      </header>

      <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900">Solicitudes pendientes</h2>

        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No hay solicitudes pendientes.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {pending.map((r) => (
              <PendingRow
                key={r.id}
                r={r}
                onApprove={approveRequest}
                onReject={rejectRequest}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900">Miembros actuales</h2>

        {members.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No hay miembros registrados.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-left">UID</th>
                  <th className="py-2 pr-4 text-left">Rol</th>
                  <th className="py-2 pr-4 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-900">{m.id}</td>
                    <td className="py-2 pr-4">{m.role || "-"}</td>
                    <td className="py-2 pr-4">{m.status || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PendingRow({ r, onApprove, onReject }) {
  const [role, setRole] = useState("assistant");

  return (
    <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 break-all">
            {r.email || "Sin correo"}
          </div>
          <div className="mt-1 text-xs text-slate-600 break-all">
            UID: {r.uid || r.id} • {r.displayName || "Sin nombre"}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-emerald-300"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="assistant">assistant</option>
            <option value="doctor">doctor</option>
            <option value="admin">admin</option>
          </select>

          <button
            className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 inline-flex items-center gap-2"
            onClick={() => onApprove(r.uid || r.id, role)}
          >
            <CheckCircle2 className="h-4 w-4" />
            Aprobar
          </button>

          <button
            className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 inline-flex items-center gap-2"
            onClick={() => onReject(r.uid || r.id)}
          >
            <XCircle className="h-4 w-4" />
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}
