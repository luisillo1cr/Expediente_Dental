// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Save, User as UserIcon } from "lucide-react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";

import { db, auth } from "../firebase";
import { CLINIC_ID } from "../config";
import { useSession } from "../auth/useSession";

export default function Profile() {
  const { user, member } = useSession();

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const memberRef = useMemo(() => {
    if (!user?.uid) return null;
    return doc(db, "clinics", CLINIC_ID, "members", user.uid);
  }, [user?.uid]);

  useEffect(() => {
    setMsg("");
    setDisplayName(member?.displayName || user?.displayName || "");
    setPhone(member?.phone || "");
  }, [member, user]);

  async function onSave() {
    if (!memberRef || !user?.uid) return;

    const nextName = String(displayName || "").trim();
    const nextPhone = String(phone || "").trim();

    if (!nextName) {
      setMsg("Por favor escribí tu nombre.");
      return;
    }

    setMsg("");
    setSaving(true);

    try {
      // 1) Guardar en Firestore (perfil del member)
      await setDoc(
        memberRef,
        {
          uid: user.uid,
          email: user.email || "",
          displayName: nextName,
          phone: nextPhone,

          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: nextName, // útil para auditoría/trace
        },
        { merge: true }
      );

      // 2) Guardar también en Firebase Auth (para que user.displayName exista)
      try {
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName: nextName });
        }
      } catch {
        // Si esto falla por alguna razón, no rompemos el guardado principal
      }

      setMsg("Datos guardados.");
    } catch (err) {
      setMsg(String(err?.message || err || "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  }

  if (!user?.uid || !member) {
    return (
      <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <div className="text-sm text-slate-700">Cargando perfil…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <UserIcon className="h-5 w-5 text-sky-600" />
          <h1 className="text-xl font-extrabold">Cuenta</h1>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Estos datos se usan para mostrar nombres reales en auditoría.
        </p>

        {msg ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
            {msg}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-bold text-slate-700">Nombre</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-slate-700">Teléfono</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-slate-700">Correo</label>
            <input
              value={user?.email || ""}
              readOnly
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-slate-700">Rol / Estado</label>
            <input
              value={`${member?.role || "—"} • ${member?.status || "—"}`}
              readOnly
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
