// src/pages/Patients.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, User } from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { db } from "../firebase";
import { CLINIC_ID } from "../config";
import { formatExpedienteCode } from "../lib/format";

/**
 * Normaliza el expediente para mostrarlo de forma consistente.
 * Reglas:
 * - Si ya viene con guion (ej: CDO-000123), se muestra tal cual.
 * - Si viene como número o texto numérico (ej: 123), se convierte a CDO-000123.
 * - Si no hay nada válido, devuelve "—".
 */
function displayExpediente(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";

  // Ya tiene formato tipo "CDO-000123"
  if (raw.includes("-")) return raw;

  // Convertir "123" => "CDO-000123"
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    return formatExpedienteCode(n, { prefix: "CDO", pad: 6 });
  }

  // Fallback: mostrar lo que venga si no se puede convertir
  return raw || "—";
}

export default function Patients() {
  const [items, setItems] = useState([]);
  const [qText, setQText] = useState("");

  const colRef = useMemo(() => collection(db, "clinics", CLINIC_ID, "patients"), []);

  useEffect(() => {
    const q = query(colRef, orderBy("updatedAt", "desc"));
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [colRef]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    const visible = items.filter((p) => !p.deleted);

    if (!t) return visible;

    return visible.filter((p) => {
      const full = `${p.nombres || ""} ${p.apellidos || ""}`.toLowerCase();
      const ced = String(p.cedula || "").toLowerCase();
      const expShown = displayExpediente(p.expediente).toLowerCase();
      const expRaw = String(p.expediente || "").toLowerCase();

      // Se busca tanto por lo mostrado como por lo crudo para cubrir ambos casos.
      return full.includes(t) || ced.includes(t) || expShown.includes(t) || expRaw.includes(t);
    });
  }, [items, qText]);

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">Pacientes</h1>

          <Link
            to="/patients/new"
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo paciente
          </Link>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Buscar por nombre, cédula o expediente..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700">
            <div className="col-span-2">Expediente</div>
            <div className="col-span-5">Paciente</div>
            <div className="col-span-3">Cédula</div>
            <div className="col-span-2 text-right">Abrir</div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-600">No hay pacientes.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filtered.map((p) => (
                <div key={p.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3">
                  <div className="col-span-2 text-sm font-semibold">{displayExpediente(p.expediente)}</div>

                  <div className="col-span-5 flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-slate-500" />
                    <span className="truncate">{`${p.nombres || ""} ${p.apellidos || ""}`}</span>
                  </div>

                  <div className="col-span-3 text-sm text-slate-700 truncate">{p.cedula || "—"}</div>

                  <div className="col-span-2 flex justify-end">
                    <Link
                      to={`/patients/${p.id}`}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50"
                    >
                      Ver
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
