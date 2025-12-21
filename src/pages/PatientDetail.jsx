// src/pages/PatientDetail.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Pencil,
  X,
  Trash2,
  Hash,
  IdCard,
  User,
  MapPin,
  Phone,
  Mail,
  Clock3,
  Paperclip,
} from "lucide-react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "../firebase";
import { CLINIC_ID } from "../config";
import { useSession } from "../auth/useSession";
import { useConfirm, useFeedback } from "../ui/feedback/hooks";

import { formatExpedienteCode } from "../lib/format";

import PatientFiles from "./PatientFiles";
import PatientHistory from "./PatientHistory";
import MedicalQuestionnaire from "../components/MedicalQuestionnaire";

const PROVINCIAS_CR = [
  "San José",
  "Alajuela",
  "Cartago",
  "Heredia",
  "Guanacaste",
  "Puntarenas",
  "Limón",
];

/**
 * Configuración del expediente:
 * - Prefijo: CDO (Clínica Dental Ovares)
 * - Largo: 6 dígitos
 * - Ejemplo: CDO-000123
 */
const EXPEDIENTE_PREFIX = "CDO";
const EXPEDIENTE_PAD = 6;

function onlyAllowedIdChars(v) {
  return (v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/--+/g, "-")
    .trim();
}

/**
 * Si son 9 dígitos => formato CR 1-2345-6789
 */
function formatCedulaCRIfPossible(v) {
  const raw = (v || "").replace(/\s+/g, "");
  const digitsOnly = raw.replace(/[^0-9]/g, "");
  if (digitsOnly.length === 9) {
    return `${digitsOnly.slice(0, 1)}-${digitsOnly.slice(1, 5)}-${digitsOnly.slice(5, 9)}`;
  }
  return v;
}

function isValidCedulaOrPassport(v) {
  const s = onlyAllowedIdChars(v);
  const digitsOnly = s.replace(/[^0-9]/g, "");

  const crOk = /^\d-\d{4}-\d{4}$/.test(s) || /^\d{9}$/.test(digitsOnly);
  const passOk = /^[A-Z0-9-]{5,20}$/.test(s);

  return crOk || passOk;
}

/**
 * Estructura del cuestionario médico.
 * Esta forma debe coincidir con MedicalQuestionnaire.jsx y con PatientHistory (badges).
 */
const EMPTY_MEDICAL = {
  underTreatment: null,
  takingMedication: null,

  conditions: {
    diabetes: null,
    arthritis: null,
    heartDisease: null,
    rheumaticFever: null,
    hepatitis: null,
    ulcers: null,
    kidneyDisorders: null,
    nervousDisorders: null,
    otherText: "",
  },

  surgeryOrHospitalized: null,
  healthChangeLastMonths: null,

  allergies: {
    aspirin: false,
    penicillin: false,
    sulfas: false,
    otherText: "",
  },

  abnormalAnesthesiaReaction: null,
  prolongedBleeding: null,
  fainting: null,

  pregnant: null,
  lactation: null,
  menstrualDisorders: null,

  observations: "",
};

const EMPTY_FORM = {
  expediente: "",
  cedula: "",
  nombres: "",
  apellidos: "",
  genero: "No especificado",
  fechaNacimiento: "",
  celular: "",
  telCasa: "",
  email: "",
  provincia: "",
  canton: "",
  distrito: "",
  direccion: "",
  alergias: "",

  // Nuevo: cuestionario médico estructurado
  medical: EMPTY_MEDICAL,
};

/**
 * Limpieza de agenda para un paciente.
 * Objetivo: que el Dashboard y el calendario no sigan mostrando citas de un expediente oculto.
 *
 * Estrategia:
 * 1) Intentar borrar físicamente documentos de /agenda del paciente.
 * 2) Si las reglas no permiten delete, marcar deleted=true como fallback (y el dashboard debe filtrar).
 */
async function purgeAgendaForPatient({ patientId, actorUid, actorName }) {
  const colRef = collection(db, "clinics", CLINIC_ID, "agenda");
  const pageSize = 400;

  // Intento 1: delete físico
  try {
    while (true) {
      const q = query(colRef, where("patientId", "==", patientId), limit(pageSize));
      const snap = await getDocs(q);
      if (snap.empty) break;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      if (snap.size < pageSize) break;
    }
    return;
  } catch {
    // Fallback a soft-delete
  }

  // Intento 2: soft delete en agenda
  while (true) {
    const q = query(colRef, where("patientId", "==", patientId), limit(pageSize));
    const snap = await getDocs(q);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((d) =>
      batch.update(d.ref, {
        deleted: true,
        patientDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: actorUid || null,
        deletedByName: actorName || "",
        updatedAt: serverTimestamp(),
        updatedBy: actorUid || null,
        updatedByName: actorName || "",
      })
    );
    await batch.commit();

    if (snap.size < pageSize) break;
  }
}

export default function PatientDetail({ mode }) {
  const nav = useNavigate();
  const params = useParams();

  // En /patients/:id => params.id existe. En /patients/new => no existe.
  const patientId = params.id || null;
  const isNew = mode === "new" || !patientId;

  const { user, member } = useSession();
  const canWrite = member?.role === "admin" || member?.role === "doctor";

  const fb = useFeedback();
  const confirm = useConfirm();

  const actorName = useMemo(() => {
    return (
      member?.displayName ||
      user?.displayName ||
      user?.email ||
      (user?.uid ? `uid:${user.uid.slice(0, 6)}…` : "—")
    );
  }, [member, user]);

  const [tab, setTab] = useState("datos");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew);
  const [error, setError] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);

  /**
   * Copia del formulario cargado (para Cancelar edición).
   */
  const originalRef = useRef(EMPTY_FORM);

  const patientRef = useMemo(() => {
    if (isNew || !patientId) return null;
    return doc(db, "clinics", CLINIC_ID, "patients", patientId);
  }, [isNew, patientId]);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!patientRef) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const snap = await getDoc(patientRef);

        if (!snap.exists()) {
          if (alive) setError("El paciente no existe o no tenés permisos.");
          return;
        }

        const data = snap.data() || {};
        if (data.deleted) {
          if (alive) setError("Este expediente está oculto (borrado lógico).");
        }

        const next = {
          ...EMPTY_FORM,
          expediente: data.expediente ?? "",
          cedula: data.cedula ?? "",
          nombres: data.nombres ?? "",
          apellidos: data.apellidos ?? "",
          genero: data.genero ?? "No especificado",
          fechaNacimiento: data.fechaNacimiento ?? "",
          celular: data.celular ?? "",
          telCasa: data.telCasa ?? "",
          email: data.email ?? "",
          provincia: data.provincia ?? "",
          canton: data.canton ?? "",
          distrito: data.distrito ?? "",
          direccion: data.direccion ?? "",
          alergias: data.alergias ?? "",

          // Cargar cuestionario médico (si no existe, usar defaults)
          medical: {
            ...EMPTY_MEDICAL,
            ...(data.medical || {}),
            conditions: { ...EMPTY_MEDICAL.conditions, ...(data.medical?.conditions || {}) },
            allergies: { ...EMPTY_MEDICAL.allergies, ...(data.medical?.allergies || {}) },
          },
        };

        if (!alive) return;

        setForm(next);
        originalRef.current = next;
        setEditing(false);
      } catch {
        if (alive) setError("Error cargando paciente.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [patientRef]);

  /**
   * Genera el siguiente expediente (autoincremental) usando una transacción.
   * - Se guarda en /clinics/{CLINIC_ID}/counters/patients
   * - Campo: nextExpediente
   */
  async function generateNextExpediente() {
    const counterRef = doc(db, "clinics", CLINIC_ID, "counters", "patients");

    const nextValue = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);

      if (!snap.exists()) {
        // Si no existe, este guardado será el #1 y el siguiente será 2.
        tx.set(counterRef, { nextExpediente: 2, updatedAt: serverTimestamp() });
        return 1;
      }

      const current = Number(snap.data().nextExpediente || 1);
      tx.update(counterRef, { nextExpediente: current + 1, updatedAt: serverTimestamp() });
      return current;
    });

    return formatExpedienteCode(nextValue, { prefix: EXPEDIENTE_PREFIX, pad: EXPEDIENTE_PAD });
  }

  function setField(name, value) {
    setForm((p) => ({ ...p, [name]: value }));
  }

  function onCancelEdit() {
    setError("");
    setForm(originalRef.current);
    setEditing(false);
    fb.info("Cambios descartados.");
  }

  async function onSoftDelete() {
    if (!canWrite || !patientRef) {
      const msg = "Tu rol no permite borrar expedientes.";
      setError(msg);
      fb.error(msg);
      return;
    }

    const patientName = `${form.nombres} ${form.apellidos}`.trim() || "este paciente";
    const exp = form.expediente ? ` (Expediente ${form.expediente})` : "";

    const c1 = await confirm(`¿Ocultar el expediente de ${patientName}${exp}?\n\nNo se borra físicamente.`, {
      title: "Ocultar expediente",
      confirmText: "Ocultar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!c1) return;

    const c2 = await confirm("Confirmación final: ¿seguro que querés ocultarlo?", {
      title: "Confirmación final",
      confirmText: "Sí, ocultar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!c2) return;

    setSaving(true);
    setError("");

    try {
      await updateDoc(patientRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || null,
        deletedByName: actorName,

        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      });

      // Limpieza de agenda para reflejar cambios en Dashboard (próximas citas + calendario).
      if (patientId) {
        await purgeAgendaForPatient({
          patientId,
          actorUid: user?.uid || null,
          actorName,
        });
      }

      fb.success("Expediente ocultado.");
      nav("/patients", { replace: true });
    } catch (e) {
      const msg = String(e?.message || e);
      setError(msg);
      fb.error(msg);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Guardado:
   * - En creación o edición, si no hay expediente, se genera automáticamente aquí.
   */
  async function onSave() {
    setError("");

    if (!canWrite) {
      const msg = "Tu rol no permite crear o editar pacientes.";
      setError(msg);
      fb.error(msg);
      return;
    }
    if (!user?.uid) {
      const msg = "No hay una sesión válida para guardar.";
      setError(msg);
      fb.error(msg);
      return;
    }

    setSaving(true);

    try {
      const cedulaNorm = formatCedulaCRIfPossible(onlyAllowedIdChars(form.cedula));

      if (!form.nombres.trim() || !form.apellidos.trim()) {
        throw new Error("Nombre y apellidos son requeridos.");
      }
      if (!cedulaNorm.trim() || !isValidCedulaOrPassport(cedulaNorm)) {
        throw new Error("Cédula/Pasaporte inválido. Ej: 1-2345-6789 o pasaporte alfanumérico.");
      }

      // Expediente automático si está vacío.
      let expedienteToSave = String(form.expediente || "").trim();
      if (!expedienteToSave) {
        expedienteToSave = await generateNextExpediente();
      }

      // Normalización mínima del cuestionario médico (evita undefined)
      const medicalToSave = {
        ...EMPTY_MEDICAL,
        ...(form.medical || {}),
        conditions: { ...EMPTY_MEDICAL.conditions, ...(form.medical?.conditions || {}) },
        allergies: { ...EMPTY_MEDICAL.allergies, ...(form.medical?.allergies || {}) },
      };

      const payload = {
        expediente: expedienteToSave,
        cedula: cedulaNorm,
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        genero: form.genero,
        fechaNacimiento: form.fechaNacimiento || "",
        celular: form.celular.trim(),
        telCasa: form.telCasa.trim(),
        email: form.email.trim(),
        provincia: form.provincia || "",
        canton: form.canton.trim(),
        distrito: form.distrito.trim(),
        direccion: form.direccion.trim(),
        alergias: form.alergias.trim(),

        // Nuevo: cuestionario médico
        medical: medicalToSave,

        // Borrado lógico
        deleted: false,

        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: actorName,
      };

      if (isNew) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = user.uid;
        payload.createdByName = actorName;

        const newRef = doc(collection(db, "clinics", CLINIC_ID, "patients"));
        await setDoc(newRef, payload, { merge: true });

        fb.success("Paciente creado.");
        nav("/patients", { replace: true });
        return;
      }

      await setDoc(patientRef, payload, { merge: true });

      const next = { ...form, expediente: expedienteToSave, cedula: cedulaNorm, medical: medicalToSave };
      setForm(next);
      originalRef.current = next;

      setEditing(false);
      fb.success("Cambios guardados.");
    } catch (e) {
      const msg = e?.message || "Error guardando paciente.";
      setError(msg);
      fb.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const canSeeTabs = !isNew && !!patientId;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/patients"
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a pacientes
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {!isNew && !editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  fb.info("Modo edición activado.");
                }}
                disabled={!canWrite || loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>

              <button
                type="button"
                onClick={onSoftDelete}
                disabled={!canWrite || saving || loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Ocultar expediente
              </button>
            </>
          ) : null}

          {isNew || editing ? (
            <>
              {!isNew ? (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-300 disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
              ) : null}

              <button
                type="button"
                onClick={onSave}
                disabled={saving || loading || !canWrite}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
        {isNew ? "Nuevo paciente" : editing ? "Editar paciente" : "Paciente"}
      </h1>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            className={`rounded-2xl px-3 py-1.5 text-sm font-semibold ${
              tab === "datos" ? "bg-slate-900 text-white" : "hover:bg-slate-100"
            }`}
            onClick={() => setTab("datos")}
          >
            Datos
          </button>

          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-sm font-semibold ${
              tab === "archivos" ? "bg-slate-900 text-white" : "hover:bg-slate-100"
            } ${!canSeeTabs ? "opacity-50" : ""}`}
            onClick={() => canSeeTabs && setTab("archivos")}
            disabled={!canSeeTabs}
            title={!canSeeTabs ? "Guardá el paciente primero para habilitar Archivos." : ""}
          >
            <Paperclip className="h-4 w-4" />
            Archivos
          </button>

          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-sm font-semibold ${
              tab === "historico" ? "bg-slate-900 text-white" : "hover:bg-slate-100"
            } ${!canSeeTabs ? "opacity-50" : ""}`}
            onClick={() => canSeeTabs && setTab("historico")}
            disabled={!canSeeTabs}
            title={!canSeeTabs ? "Guardá el paciente primero para habilitar Histórico." : ""}
          >
            <Clock3 className="h-4 w-4" />
            Histórico
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-600">Cargando…</div>
        ) : tab === "archivos" ? (
          <div className="pt-4">
            <PatientFiles patientId={patientId} canWrite={canWrite} />
          </div>
        ) : tab === "historico" ? (
          <div className="pt-4">
            <PatientHistory
              patientId={patientId}
              canWrite={canWrite}
              patientSummary={{
                expediente: form.expediente,
                nombre: `${form.nombres} ${form.apellidos}`.trim(),
                medical: form.medical,
              }}
            />
          </div>
        ) : (
          <div className="pt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-bold text-slate-900">Expediente</label>
                <div className="mt-1 relative">
                  <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={form.expediente}
                    readOnly
                    placeholder={isNew ? "Se generará automáticamente al guardar" : "—"}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm outline-none"
                  />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  El expediente se asigna automáticamente al guardar el paciente por primera vez.
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Cédula / Pasaporte</label>
                <div className="mt-1 relative">
                  <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={form.cedula}
                    onChange={(e) => setField("cedula", onlyAllowedIdChars(e.target.value))}
                    onBlur={() => setField("cedula", formatCedulaCRIfPossible(form.cedula))}
                    placeholder="Ej: 1-2345-6789 o PASSPORT123"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                    disabled={!canWrite || !editing}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Nombres *</label>
                <div className="mt-1 relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={form.nombres}
                    onChange={(e) => setField("nombres", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                    disabled={!canWrite || !editing}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Apellidos *</label>
                <input
                  value={form.apellidos}
                  onChange={(e) => setField("apellidos", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                  disabled={!canWrite || !editing}
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Género</label>
                <select
                  value={form.genero}
                  onChange={(e) => setField("genero", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                  disabled={!canWrite || !editing}
                >
                  <option>Femenino</option>
                  <option>Masculino</option>
                  <option>No especificado</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Fecha de nacimiento</label>
                <input
                  type="date"
                  value={form.fechaNacimiento}
                  onChange={(e) => setField("fechaNacimiento", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                  disabled={!canWrite || !editing}
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Celular</label>
                <div className="mt-1 relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={form.celular}
                    onChange={(e) => setField("celular", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                    disabled={!canWrite || !editing}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Tel. casa</label>
                <input
                  value={form.telCasa}
                  onChange={(e) => setField("telCasa", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                  disabled={!canWrite || !editing}
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Email</label>
                <div className="mt-1 relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                    disabled={!canWrite || !editing}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Provincia</label>
                <div className="mt-1 relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <select
                    value={form.provincia}
                    onChange={(e) => setField("provincia", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                    disabled={!canWrite || !editing}
                  >
                    <option value="">Seleccionar</option>
                    {PROVINCIAS_CR.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Cantón</label>
                <input
                  value={form.canton}
                  onChange={(e) => setField("canton", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                  disabled={!canWrite || !editing}
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-900">Distrito</label>
                <input
                  value={form.distrito}
                  onChange={(e) => setField("distrito", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                  disabled={!canWrite || !editing}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-bold text-slate-900">Dirección</label>
                <input
                  value={form.direccion}
                  onChange={(e) => setField("direccion", e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                  disabled={!canWrite || !editing}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-bold text-slate-900">Notas</label>
                <textarea
                  value={form.alergias}
                  onChange={(e) => setField("alergias", e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
                  disabled={!canWrite || !editing}
                />
                <div className="mt-1 text-xs text-slate-500">
                  
                </div>
              </div>

              {/* Nuevo: Cuestionario médico */}
              <div className="md:col-span-2">
                <div className="mt-2 rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-extrabold text-slate-900">Cuestionario médico</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Las respuestas se guardan en el expediente y se muestran como alertas en el histórico.
                  </div>

                  <div className="mt-4">
                    <MedicalQuestionnaire
                      value={form.medical}
                      onChange={(next) => setField("medical", next)}
                      disabled={!canWrite || !editing}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
              Nota: “Archivos” y “Histórico” se habilitan únicamente cuando el paciente ya existe.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
