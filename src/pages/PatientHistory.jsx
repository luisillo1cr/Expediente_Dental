// src/pages/PatientHistory.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Calendar,
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";

import { db } from "../firebase";
import { CLINIC_ID } from "../config";
import { useSession } from "../auth/useSession";
import { useFeedback, useConfirm } from "../ui/feedback/hooks";

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateOnlyKey(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDate(d) {
  if (!d) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtMoneyCRC(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Entrada de monto:
 * - El usuario escribe un número sin separadores (ej: 30000).
 * - Guardamos el monto como Number en Firestore.
 * - Al mostrarlo, lo formateamos a CRC.
 */
function parseAmount(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  // Permitimos que el usuario pegue "30,000" o "30 000" y lo limpiamos.
  const cleaned = raw.replace(/[,\s]/g, "");
  const n = Number(cleaned);

  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function truncateText(s, maxLen) {
  const text = String(s || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * Construye “alertas” rápidas a partir del objeto medical del paciente.
 * (con límites para no saturar)
 */
function buildMedicalBadges(patientSummary) {
  const medical = patientSummary?.medical || {};
  const conditions = medical?.conditions || {};
  const allergies = medical?.allergies || {};

  const badges = [];

  const add = (label, kind) => {
    badges.push({ label, kind });
  };

  if (medical?.underTreatment === true) add("Bajo tratamiento médico", "warn");
  if (medical?.takingMedication === true) add("Toma medicamentos", "warn");

  if (conditions?.diabetes === true) add("Diabetes", "warn");
  if (conditions?.arthritis === true) add("Artritis", "warn");
  if (conditions?.heartDisease === true) add("Enfermedad cardíaca", "danger");
  if (conditions?.rheumaticFever === true) add("Fiebre reumática", "warn");
  if (conditions?.hepatitis === true) add("Hepatitis", "danger");
  if (conditions?.ulcers === true) add("Úlceras", "warn");
  if (conditions?.kidneyDisorders === true) add("Trastornos renales", "danger");
  if (conditions?.nervousDisorders === true) add("Trastornos del sistema nervioso", "warn");

  // ✅ keys correctos
  if (medical?.surgeryOrHospitalized === true) add("Operación / internamiento previo", "warn");
  if (medical?.healthChangeLastMonths === true) add("Cambios de salud recientes", "warn");

  if (medical?.abnormalAnesthesiaReaction === true) add("Reacción anormal a anestesia", "danger");
  if (medical?.prolongedBleeding === true) add("Sangrado prolongado", "danger");
  if (medical?.fainting === true) add("Desmayos", "warn");

  if (medical?.pregnant === true) add("Embarazo", "warn");
  if (medical?.lactation === true) add("Lactancia", "warn"); // ✅ key correcto
  if (medical?.menstrualDisorders === true) add("Trastornos del ciclo menstrual", "warn");

  const allergyLabels = [];
  if (allergies?.aspirin) allergyLabels.push("Aspirina");
  if (allergies?.penicillin) allergyLabels.push("Penicilina");
  if (allergies?.sulfas) allergyLabels.push("Sulfas");

  const otherAllergy = String(allergies?.otherText || "").trim();
  if (otherAllergy) allergyLabels.push(otherAllergy);

  if (allergyLabels.length) {
    const full = `Alergias: ${allergyLabels.join(", ")}`;
    add(truncateText(full, 70), "danger");
  }

  const otherCond = String(conditions?.otherText || "").trim();
  if (otherCond) add(truncateText(`Otros: ${otherCond}`, 70), "warn");

  const obs = String(medical?.observations || "").trim();
  if (obs) add(truncateText(`Observaciones: ${obs}`, 70), "warn");

  const MAX_BADGES = 8;

  const sorted = badges.sort((a, b) => {
    const prio = (k) => (k === "danger" ? 2 : k === "warn" ? 1 : 0);
    return prio(b.kind) - prio(a.kind);
  });

  const limited = sorted.slice(0, MAX_BADGES);
  const remaining = sorted.length - limited.length;
  if (remaining > 0) limited.push({ label: `+${remaining} más`, kind: "ok" });

  return limited;
}

function Badge({ kind, children }) {
  const cls =
    kind === "danger"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : kind === "warn"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200";

  const Icon = kind === "danger" ? AlertTriangle : BadgeCheck;

  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ring-1", cls)}>
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
}

// Helpers: Abono/Debe
function calcAbono(row) {
  if (row?.monto == null) return null;
  const a = row?.abono;
  if (a == null) return Number(row.monto); // si no hay abono => se asume pago completo
  const n = Number(a);
  return Number.isFinite(n) ? n : Number(row.monto);
}

function calcDebe(row) {
  if (row?.monto == null) return null;
  const m = Number(row.monto);
  if (!Number.isFinite(m)) return null;
  const a = calcAbono(row);
  if (a == null) return null;
  return Math.max(m - a, 0);
}

export default function PatientHistory({ patientId, canWrite, patientSummary }) {
  const { user, member } = useSession();
  const fb = useFeedback();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [err, setErr] = useState("");

  const [qText, setQText] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(false);

  const actorName = useMemo(() => {
    return (
      member?.displayName ||
      user?.displayName ||
      user?.email ||
      (user?.uid ? `uid:${user.uid.slice(0, 6)}…` : "—")
    );
  }, [member, user]);

  const medicalBadges = useMemo(() => buildMedicalBadges(patientSummary), [patientSummary]);

  const [draft, setDraft] = useState({
    fecha: "",
    pieza: "",
    tratamiento: "",
    monto: "",
    abono: "", // ✅ nuevo
    metodoPago: "",
    notas: "",
  });

  useEffect(() => {
    if (!patientId) return;

    const colRef = collection(db, "clinics", CLINIC_ID, "patients", patientId, "treatments");
    const q = query(colRef, orderBy("fecha", "desc"), limit(1500));

    setErr("");
    return onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setErr("No pude cargar tratamientos. Revisá permisos/reglas.")
    );
  }, [patientId]);

  useEffect(() => {
    const ref = doc(db, "clinics", CLINIC_ID, "meta", "treatment_catalog");
    return onSnapshot(
      ref,
      (snap) => {
        const items = snap.exists() ? snap.data()?.items : [];
        setCatalog(Array.isArray(items) ? items : []);
      },
      () => setCatalog([])
    );
  }, []);

  function resetFilters() {
    setQText("");
    setFrom("");
    setTo("");
  }

  const filtered = useMemo(() => {
    const text = (qText || "").trim().toLowerCase();
    const fromKey = from || "";
    const toKey = to || "";

    return rows
      .filter((r) => !r.deleted)
      .filter((r) => {
        const d = toDate(r.fecha);
        const k = d ? dateOnlyKey(d) : "";
        if (fromKey && k && k < fromKey) return false;
        if (toKey && k && k > toKey) return false;
        return true;
      })
      .filter((r) => {
        if (!text) return true;
        const a = String(r.tratamiento || "").toLowerCase();
        const b = String(r.notas || "").toLowerCase();
        const c = String(r.pieza || "").toLowerCase();
        return a.includes(text) || b.includes(text) || c.includes(text);
      });
  }, [rows, qText, from, to]);

  const openItem = useMemo(() => filtered.find((x) => x.id === openId) || null, [filtered, openId]);

  function openCreate() {
    setOpenId(null);
    setEditing(true);
    setErr("");
    setDraft({ fecha: "", pieza: "", tratamiento: "", monto: "", abono: "", metodoPago: "", notas: "" });
  }

  function openView(item) {
    setOpenId(item.id);
    setEditing(false);
    setErr("");

    const f = toDate(item.fecha);
    setDraft({
      fecha: f ? dateOnlyKey(f) : "",
      pieza: item.pieza || "",
      tratamiento: item.tratamiento || "",
      monto: item.monto == null ? "" : String(item.monto),
      abono: item.abono == null ? "" : String(item.abono),
      metodoPago: String(item.metodoPago || ""),
      notas: item.notas || "",
    });
  }

  async function ensureTreatmentInCatalog(name) {
    const t = String(name || "").trim();
    if (!t) return;
    const ref = doc(db, "clinics", CLINIC_ID, "meta", "treatment_catalog");
    await setDoc(ref, { items: arrayUnion(t), updatedAt: serverTimestamp() }, { merge: true });
  }

  async function saveDraft() {
    if (!canWrite) return;

    const fechaStr = (draft.fecha || "").trim();
    const tratamiento = (draft.tratamiento || "").trim();

    if (!fechaStr) return setErr("La fecha es requerida.");
    if (!tratamiento) return setErr("El tratamiento es requerido.");

    const fecha = new Date(`${fechaStr}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) return setErr("Fecha inválida.");

    let montoNum = parseAmount(draft.monto);
    let abonoNum = parseAmount(draft.abono);
    const metodoPago = String(draft.metodoPago || "").trim();

    // Si el usuario puso solo "abono" y dejó monto vacío, asumimos pago completo
    if (montoNum == null && abonoNum != null) {
      montoNum = abonoNum;
      abonoNum = null;
    }

    if (montoNum != null && abonoNum != null && abonoNum > montoNum) {
      return setErr("El abono no puede ser mayor al monto.");
    }

    // Si abono es igual al monto, lo guardamos como null (pago completo)
    if (montoNum != null && abonoNum != null && abonoNum === montoNum) {
      abonoNum = null;
    }

    setErr("");

    try {
      const colRef = collection(db, "clinics", CLINIC_ID, "patients", patientId, "treatments");
      await ensureTreatmentInCatalog(tratamiento);

      const payload = {
        fecha,
        pieza: (draft.pieza || "").trim(),
        tratamiento,
        monto: montoNum,
        abono: abonoNum,
        metodoPago,
        notas: (draft.notas || "").trim(),

        patientNombre: patientSummary?.nombre || "",
        deleted: false,

        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      };

      if (!openId) {
        await addDoc(colRef, {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || null,
          createdByName: actorName,
        });

        fb.success("Tratamiento guardado.");
        setEditing(false);
        setDraft({ fecha: "", pieza: "", tratamiento: "", monto: "", abono: "", metodoPago: "", notas: "" });
        return;
      }

      const ref = doc(db, "clinics", CLINIC_ID, "patients", patientId, "treatments", openId);
      await updateDoc(ref, payload);

      fb.success("Cambios guardados.");
      setEditing(false);
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      fb.error(msg);
    }
  }

  async function softDeleteItem(item) {
    if (!canWrite) return;

    const ok = await confirm("¿Ocultar este registro? (No se borra físicamente)", {
      title: "Ocultar tratamiento",
      confirmText: "Ocultar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;

    try {
      const ref = doc(db, "clinics", CLINIC_ID, "patients", patientId, "treatments", item.id);
      await updateDoc(ref, {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || null,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      });

      fb.info("Registro ocultado.");
      if (openId === item.id) {
        setOpenId(null);
        setEditing(false);
      }
    } catch (e) {
      fb.error(String(e?.message || e));
    }
  }

  const previewMonto = parseAmount(draft.monto);
  const previewAbonoRaw = parseAmount(draft.abono);
  const previewAbono = previewMonto == null ? null : (previewAbonoRaw == null ? previewMonto : previewAbonoRaw);
  const previewDebe =
    previewMonto == null || previewAbono == null ? null : Math.max(previewMonto - previewAbono, 0);

  return (
    <div className="space-y-4">
      {/* Alertas clínicas */}
      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
        <div className="text-sm font-extrabold text-slate-900">Alertas clínicas</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {medicalBadges.length ? (
            medicalBadges.map((b, idx) => (
              <Badge key={idx} kind={b.kind}>
                {b.label}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-slate-600">Sin alertas registradas.</span>
          )}
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Estas alertas salen del “Cuestionario médico” del expediente.
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-6">
            <label className="text-xs font-semibold text-slate-700">Buscar</label>
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder="Buscar por tratamiento, pieza o notas"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>

              <button
                type="button"
                className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                onClick={resetFilters}
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="lg:col-span-3">
            <label className="text-xs font-semibold text-slate-700">Desde</label>
            <div className="mt-1 relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
          </div>

          <div className="lg:col-span-3">
            <label className="text-xs font-semibold text-slate-700">Hasta</label>
            <div className="mt-1 relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            onClick={openCreate}
            disabled={!canWrite}
            title={!canWrite ? "Solo admin/doctor puede agregar registros." : ""}
          >
            <Plus className="h-4 w-4" />
            Agregar tratamiento
          </button>
        </div>

        {err ? (
          <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {err}
          </div>
        ) : null}
      </div>

      {/* Lista */}
      <section className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
        <div className="text-sm font-extrabold text-slate-900">Tratamientos ({filtered.length})</div>

        {filtered.length === 0 ? (
          <div className="mt-3 text-sm text-slate-600">Sin registros.</div>
        ) : (
          <div className="mt-3 space-y-3">
            {filtered.map((it) => {
              const ab = calcAbono(it);
              const dbv = calcDebe(it);

              return (
                <div
                  key={it.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openView(it)}
                  onKeyDown={(e) => e.key === "Enter" && openView(it)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 cursor-pointer"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900 break-words">
                        {it.tratamiento || "Tratamiento"}
                      </div>

                      <div className="mt-1 text-xs text-slate-600">
                        Fecha: <b>{formatDate(toDate(it.fecha))}</b>
                        {it.pieza ? (
                          <>
                            {" "}
                            • Pieza: <b>{String(it.pieza)}</b>
                          </>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                        <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                          Monto: <b>{it.monto == null ? "—" : fmtMoneyCRC(it.monto)}</b>
                        </span>

                        <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                          Abono: <b>{ab == null ? "—" : fmtMoneyCRC(ab)}</b>
                        </span>

                        <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                          Debe: <b>{dbv == null ? "—" : fmtMoneyCRC(dbv)}</b>
                        </span>

                        <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                          Pago: <b>{it.metodoPago ? String(it.metodoPago) : "—"}</b>
                        </span>
                      </div>

                      {it.notas ? (
                        <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{it.notas}</div>
                      ) : null}
                    </div>

                    {canWrite ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            openView(it);
                            setEditing(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>

                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            softDeleteItem(it);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Ocultar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Panel detalle/edición */}
      {(editing || openItem) ? (
        <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-lg font-extrabold text-slate-900">
              {openId ? "Detalle del tratamiento" : "Nuevo tratamiento"}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {openId && canWrite && !editing ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
              ) : null}

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-300"
                onClick={() => {
                  setOpenId(null);
                  setEditing(false);
                }}
              >
                <X className="h-4 w-4" />
                Cerrar
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="text-sm font-bold text-slate-900">Fecha *</label>
              <input
                type="date"
                value={draft.fecha}
                onChange={(e) => setDraft((p) => ({ ...p, fecha: e.target.value }))}
                disabled={!editing && !!openId}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Pieza</label>
              <input
                value={draft.pieza}
                onChange={(e) => setDraft((p) => ({ ...p, pieza: e.target.value }))}
                disabled={!editing && !!openId}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                placeholder="Ej: 12, 24, 46..."
              />
            </div>

            <div className="lg:col-span-2">
              <label className="text-sm font-bold text-slate-900">Tratamiento *</label>
              <input
                list="treatmentCatalog"
                value={draft.tratamiento}
                onChange={(e) => setDraft((p) => ({ ...p, tratamiento: e.target.value }))}
                disabled={!editing && !!openId}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                placeholder="Escribí o elegí del listado"
              />
              <datalist id="treatmentCatalog">
                {catalog.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>

              <div className="mt-1 text-xs text-slate-500">
                Si escribís un tratamiento nuevo, quedará guardado para reutilizarlo luego.
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Monto (CRC)</label>
              <input
                value={draft.monto}
                onChange={(e) => setDraft((p) => ({ ...p, monto: e.target.value }))}
                disabled={!editing && !!openId}
                inputMode="numeric"
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                placeholder="Ej: 30000"
              />
              <div className="mt-1 text-xs text-slate-500">Guardado como número. Se muestra formateado a colones.</div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Abono (CRC)</label>
              <input
                value={draft.abono}
                onChange={(e) => setDraft((p) => ({ ...p, abono: e.target.value }))}
                disabled={!editing && !!openId}
                inputMode="numeric"
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                placeholder="Ej: 10000 (opcional)"
              />
              <div className="mt-1 text-xs text-slate-500">
                Si lo dejás vacío, se asume pago completo. “Debe” se calcula automáticamente.
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Método de pago</label>
              <select
                value={draft.metodoPago}
                onChange={(e) => setDraft((p) => ({ ...p, metodoPago: e.target.value }))}
                disabled={!editing && !!openId}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
              >
                <option value="">Sin definir</option>
                <option value="sinpe">SINPE</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="text-sm font-bold text-slate-900">Notas</label>
              <textarea
                rows={6}
                value={draft.notas}
                onChange={(e) => setDraft((p) => ({ ...p, notas: e.target.value }))}
                disabled={!editing && !!openId}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                placeholder="Escribí lo necesario. Este campo permite texto largo."
              />
            </div>

            <div className="flex items-end justify-end gap-2 lg:col-span-2">
              <button
                type="button"
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                onClick={saveDraft}
                disabled={!canWrite}
              >
                Guardar
              </button>

              {openId ? (
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => setEditing(false)}
                  disabled={!canWrite}
                >
                  Cancelar edición
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Vista previa: Monto <b>{previewMonto == null ? "—" : fmtMoneyCRC(previewMonto)}</b> • Abono{" "}
            <b>{previewAbono == null ? "—" : fmtMoneyCRC(previewAbono)}</b> • Debe{" "}
            <b>{previewDebe == null ? "—" : fmtMoneyCRC(previewDebe)}</b>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
        Nota: “Ocultar” conserva el registro para auditoría, pero ya no se muestra.
      </div>
    </div>
  );
}
