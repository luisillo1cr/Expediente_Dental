// src/pages/PatientHistory.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  setDoc,
  deleteDoc,
  limit,
} from "firebase/firestore";
import {
  Search,
  Calendar,
  Plus,
  Pencil,
  Trash2,
  X,
  FileText,
  Image as ImageIcon,
  Paperclip,
  CreditCard,
  Banknote,
} from "lucide-react";

import { db } from "../firebase";
import { CLINIC_ID } from "../config";
import { useSession } from "../auth/useSession";
import { useFeedback, useConfirm } from "../ui/feedback/hooks";
import { formatExpedienteCode } from "../lib/format";

/* ------------------------------ Helpers fecha ----------------------------- */

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  return null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateTime(d) {
  if (!d) return "-";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function shortUid(uid) {
  if (!uid) return "-";
  return String(uid).slice(0, 6) + "…" + String(uid).slice(-4);
}

function dateOnlyKey(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/* ------------------------------ Helpers files ---------------------------- */

function fileIcon(ct) {
  if ((ct || "").startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function isImage(ct) {
  return String(ct || "").startsWith("image/");
}

/* ------------------------------ Helpers pago ----------------------------- */

function parsePago(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function fmtMoneyCRC(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }).format(num);
}

/* --------------------------- Expediente visible -------------------------- */

function safePatientExpediente(patientSummary) {
  const exp = String(patientSummary?.expediente || "").trim();
  if (exp) return exp;

  const n = Number(patientSummary?.expedienteNum || 0);
  if (Number.isFinite(n) && n > 0) return formatExpedienteCode(n, { prefix: "CDO", pad: 6 });

  return "";
}

export default function PatientHistory({ patientId, canWrite, patientSummary }) {
  const { user, member } = useSession();
  const fb = useFeedback();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState("");

  const [qText, setQText] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(false);

  const [draft, setDraft] = useState({
    titulo: "",
    citaAt: "",
    notas: "",
    proximaCita: "",
    pago: "",
    tipoPago: "",
  });

  const actorName = useMemo(() => {
    return (
      member?.displayName ||
      user?.displayName ||
      user?.email ||
      (user?.uid ? `uid:${user.uid.slice(0, 6)}…` : "—")
    );
  }, [member, user]);

  function agendaIdFor(historyId) {
    return `${patientId}_${historyId}`;
  }

  function globalHistoryIdFor(historyId) {
    return `${patientId}_${historyId}`;
  }

  async function syncAgenda(historyId, proximaDate, titulo) {
    const aRef = doc(db, "clinics", CLINIC_ID, "agenda", agendaIdFor(historyId));

    if (!proximaDate || Number.isNaN(proximaDate.getTime()) || proximaDate.getTime() < Date.now()) {
      try {
        await deleteDoc(aRef);
      } catch {}
      return;
    }

    await setDoc(
      aRef,
      {
        clinicId: CLINIC_ID,
        patientId,
        historyId,
        proximaCitaAt: proximaDate,
        titulo: titulo || "",
        patientNombre: patientSummary?.nombre || "",
        patientExpediente: safePatientExpediente(patientSummary),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      },
      { merge: true }
    );
  }

  /**
   * Denormalización para métricas:
   * clinics/{clinicId}/history_global/{patientId}_{historyId}
   */
  async function syncHistoryGlobal(historyId, data) {
    const gRef = doc(db, "clinics", CLINIC_ID, "history_global", globalHistoryIdFor(historyId));
    await setDoc(
      gRef,
      {
        clinicId: CLINIC_ID,
        patientId,
        historyId,

        // Campos usados por métricas
        citaAt: data.citaAt || null,
        pago: data.pago ?? null,
        tipoPago: data.tipoPago || "",
        deleted: !!data.deleted,

        // Útiles para auditoría/UX
        patientNombre: patientSummary?.nombre || "",
        patientExpediente: safePatientExpediente(patientSummary),

        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      },
      { merge: true }
    );
  }

  async function removeHistoryGlobal(historyId) {
    const gRef = doc(db, "clinics", CLINIC_ID, "history_global", globalHistoryIdFor(historyId));
    try {
      await deleteDoc(gRef);
    } catch {
      // fallback soft-delete (si rules no permiten delete)
      try {
        await setDoc(gRef, { deleted: true, updatedAt: serverTimestamp() }, { merge: true });
      } catch {}
    }
  }

  /* ------------------------------- Snapshots ------------------------------ */

  useEffect(() => {
    if (!patientId) return;

    const col = collection(db, "clinics", CLINIC_ID, "patients", patientId, "history");
    const q = query(col, orderBy("citaAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setErr("");
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => setErr("No pude cargar el histórico. Revisá permisos/reglas.")
    );

    return () => unsub();
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;

    const col = collection(db, "clinics", CLINIC_ID, "patients", patientId, "files");
    const q = query(col, orderBy("createdAt", "desc"), limit(500));

    const unsub = onSnapshot(
      q,
      (snap) => setFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );

    return () => unsub();
  }, [patientId]);

  const filesByHistoryId = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      const ids = Array.isArray(f.linkedHistoryIds) ? f.linkedHistoryIds : [];
      for (const hid of ids) {
        if (!map.has(hid)) map.set(hid, []);
        map.get(hid).push(f);
      }
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const da = toDate(a.createdAt)?.getTime() || 0;
        const dbb = toDate(b.createdAt)?.getTime() || 0;
        return dbb - da;
      });
      map.set(k, arr);
    }

    return map;
  }, [files]);

  /* -------------------------------- Filtros ------------------------------ */

  const filtered = useMemo(() => {
    const text = (qText || "").trim().toLowerCase();
    const fromKey = from || "";
    const toKey = to || "";

    return rows
      .filter((r) => !r.deleted)
      .filter((r) => {
        const d = toDate(r.citaAt);
        const key = dateOnlyKey(d);
        if (fromKey && key && key < fromKey) return false;
        if (toKey && key && key > toKey) return false;
        return true;
      })
      .filter((r) => {
        if (!text) return true;
        const a = String(r.titulo || "").toLowerCase();
        const b = String(r.notas || "").toLowerCase();
        return a.includes(text) || b.includes(text);
      });
  }, [rows, qText, from, to]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return filtered
      .filter((it) => {
        const d = toDate(it.proximaCita);
        return d && d.getTime() >= now;
      })
      .sort((a, b) => toDate(a.proximaCita) - toDate(b.proximaCita));
  }, [filtered]);

  const past = useMemo(() => {
    const now = Date.now();
    return filtered
      .filter((it) => {
        const d = toDate(it.citaAt);
        return d && d.getTime() < now;
      })
      .sort((a, b) => toDate(b.citaAt) - toDate(a.citaAt));
  }, [filtered]);

  const openItem = useMemo(() => filtered.find((x) => x.id === openId) || null, [filtered, openId]);

  function resetFilters() {
    setQText("");
    setFrom("");
    setTo("");
  }

  function openCreate() {
    setOpenId(null);
    setEditing(true);
    setDraft({ titulo: "", citaAt: "", notas: "", proximaCita: "", pago: "", tipoPago: "" });
  }

  function openView(item) {
    setOpenId(item.id);
    setEditing(false);

    const cita = toDate(item.citaAt);
    const prox = toDate(item.proximaCita);

    setDraft({
      titulo: item.titulo || "",
      citaAt: cita ? `${dateOnlyKey(cita)}T${pad2(cita.getHours())}:${pad2(cita.getMinutes())}` : "",
      notas: item.notas || "",
      proximaCita: prox ? `${dateOnlyKey(prox)}T${pad2(prox.getHours())}:${pad2(prox.getMinutes())}` : "",
      pago: item.pago == null ? "" : String(item.pago),
      tipoPago: String(item.tipoPago || ""),
    });
  }

  /* ------------------------------- Guardar ------------------------------- */

  async function saveDraft() {
    if (!canWrite) return;

    const titulo = (draft.titulo || "").trim();
    if (!titulo) return setErr("El motivo/título es requerido.");
    if (!draft.citaAt) return setErr("La fecha/hora de la cita es requerida.");

    const citaAtDate = new Date(draft.citaAt);
    const proxima = draft.proximaCita ? new Date(draft.proximaCita) : null;

    const pagoNum = parsePago(draft.pago);
    const tipoPago = String(draft.tipoPago || "").trim();

    setErr("");

    try {
      const col = collection(db, "clinics", CLINIC_ID, "patients", patientId, "history");

      if (!openId) {
        const ref = await addDoc(col, {
          clinicId: CLINIC_ID,
          patientId,

          titulo,
          notas: (draft.notas || "").trim(),
          citaAt: citaAtDate,
          proximaCita: proxima,

          pago: pagoNum,
          tipoPago,

          patientExpediente: safePatientExpediente(patientSummary),
          patientNombre: patientSummary?.nombre || "",

          deleted: false,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || null,
          createdByName: actorName,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || null,
          updatedByName: actorName,
        });

        await syncAgenda(ref.id, proxima, titulo);
        await syncHistoryGlobal(ref.id, { citaAt: citaAtDate, pago: pagoNum, tipoPago, deleted: false });

        fb.success("Cita guardada.");
        setEditing(false);
        setDraft({ titulo: "", citaAt: "", notas: "", proximaCita: "", pago: "", tipoPago: "" });
        return;
      }

      const ref = doc(db, "clinics", CLINIC_ID, "patients", patientId, "history", openId);
      await updateDoc(ref, {
        titulo,
        notas: (draft.notas || "").trim(),
        citaAt: citaAtDate,
        proximaCita: proxima,

        pago: pagoNum,
        tipoPago,

        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      });

      await syncAgenda(openId, proxima, titulo);
      await syncHistoryGlobal(openId, { citaAt: citaAtDate, pago: pagoNum, tipoPago, deleted: false });

      fb.success("Cambios guardados.");
      setEditing(false);
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      fb.error(msg);
    }
  }

  /* ------------------------------- Borrado ------------------------------- */

  async function softDeleteItem(item) {
    if (!canWrite) return;

    const ok = await confirm("¿Ocultar esta tarjeta del histórico? (No se borra físicamente)", {
      title: "Ocultar cita",
      confirmText: "Ocultar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;

    setErr("");

    try {
      const ref = doc(db, "clinics", CLINIC_ID, "patients", patientId, "history", item.id);
      await updateDoc(ref, {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || null,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      });

      // Agenda: ya no debe aparecer en dashboard/calendario
      try {
        await deleteDoc(doc(db, "clinics", CLINIC_ID, "agenda", agendaIdFor(item.id)));
      } catch {}

      // Métricas: quitar del global (o marcar deleted)
      await removeHistoryGlobal(item.id);

      fb.info("Cita ocultada.");
      if (openId === item.id) {
        setOpenId(null);
        setEditing(false);
      }
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      fb.error(msg);
    }
  }

  /* --------------------------------- UI ---------------------------------- */

  return (
    <div className="space-y-4">
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
                  placeholder="Buscar por motivo o notas"
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
            title={!canWrite ? "Solo admin/doctor puede agregar citas." : ""}
          >
            <Plus className="h-4 w-4" />
            Agregar cita
          </button>
        </div>

        {err ? (
          <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {err}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title={`Próximas (${upcoming.length})`}
          items={upcoming}
          kind="upcoming"
          emptyText="Sin registros."
          onOpen={openView}
          canWrite={canWrite}
          onDelete={softDeleteItem}
          filesByHistoryId={filesByHistoryId}
        />

        <Section
          title={`Pasadas (${past.length})`}
          items={past}
          kind="past"
          emptyText="Sin registros."
          onOpen={openView}
          canWrite={canWrite}
          onDelete={softDeleteItem}
          filesByHistoryId={filesByHistoryId}
        />
      </div>

      {openItem ? (
        <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-slate-900 break-words">{openItem.titulo || "Cita"}</div>
              <div className="mt-1 text-sm text-slate-600">
                {formatDateTime(toDate(openItem.citaAt))}
                {openItem.proximaCita ? ` • Próxima: ${formatDateTime(toDate(openItem.proximaCita))}` : ""}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 ring-1 ring-slate-200">
                  <Banknote className="h-3.5 w-3.5" />
                  Pago: <b>{openItem.pago == null ? "—" : fmtMoneyCRC(openItem.pago)}</b>
                </span>

                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 ring-1 ring-slate-200">
                  <CreditCard className="h-3.5 w-3.5" />
                  Tipo: <b>{openItem.tipoPago ? String(openItem.tipoPago) : "—"}</b>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canWrite ? (
                <>
                  {!editing ? (
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
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                    onClick={() => softDeleteItem(openItem)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Borrar
                  </button>
                </>
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
              <label className="text-sm font-bold text-slate-900">Motivo / Título</label>
              <input
                value={draft.titulo}
                onChange={(e) => setDraft((p) => ({ ...p, titulo: e.target.value }))}
                disabled={!editing || !canWrite}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Fecha y hora de la cita</label>
              <input
                type="datetime-local"
                value={draft.citaAt}
                onChange={(e) => setDraft((p) => ({ ...p, citaAt: e.target.value }))}
                disabled={!editing || !canWrite}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Pago</label>
              <input
                value={draft.pago}
                onChange={(e) => setDraft((p) => ({ ...p, pago: e.target.value }))}
                disabled={!editing || !canWrite}
                inputMode="numeric"
                placeholder="Ej: 25000"
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
              />
              <div className="mt-1 text-xs text-slate-500">Dejá vacío si no aplica.</div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Tipo de pago</label>
              <select
                value={draft.tipoPago}
                onChange={(e) => setDraft((p) => ({ ...p, tipoPago: e.target.value }))}
                disabled={!editing || !canWrite}
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
                rows={4}
                value={draft.notas}
                onChange={(e) => setDraft((p) => ({ ...p, notas: e.target.value }))}
                disabled={!editing || !canWrite}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Próxima cita (opcional)</label>
              <input
                type="datetime-local"
                value={draft.proximaCita}
                onChange={(e) => setDraft((p) => ({ ...p, proximaCita: e.target.value }))}
                disabled={!editing || !canWrite}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
              />
            </div>

            <div className="flex items-end justify-end gap-2">
              {editing ? (
                <button
                  type="button"
                  className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                  onClick={saveDraft}
                  disabled={!canWrite}
                >
                  Guardar cambios
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
            <div className="font-bold">Auditoría</div>
            <div className="mt-1">
              Creado por: <b>{openItem.createdByName || shortUid(openItem.createdBy)}</b> • Creado:{" "}
              <b>{formatDateTime(toDate(openItem.createdAt))}</b>
            </div>
            <div className="mt-1">
              Última actualización: <b>{formatDateTime(toDate(openItem.updatedAt))}</b> • Por:{" "}
              <b>{openItem.updatedByName || shortUid(openItem.updatedBy)}</b>
            </div>
          </div>

          <HistoryFilesPreview files={filesByHistoryId.get(openItem.id) || []} />
        </div>
      ) : null}

      {editing && !openId ? (
        <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-extrabold text-slate-900">Nueva cita</div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-300"
              onClick={() => setEditing(false)}
            >
              <X className="h-4 w-4" />
              Cerrar
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="text-sm font-bold text-slate-900">Motivo / Título *</label>
              <input
                value={draft.titulo}
                onChange={(e) => setDraft((p) => ({ ...p, titulo: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Fecha y hora *</label>
              <input
                type="datetime-local"
                value={draft.citaAt}
                onChange={(e) => setDraft((p) => ({ ...p, citaAt: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Pago</label>
              <input
                value={draft.pago}
                onChange={(e) => setDraft((p) => ({ ...p, pago: e.target.value }))}
                inputMode="numeric"
                placeholder="Ej: 25000"
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Tipo de pago</label>
              <select
                value={draft.tipoPago}
                onChange={(e) => setDraft((p) => ({ ...p, tipoPago: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
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
                rows={4}
                value={draft.notas}
                onChange={(e) => setDraft((p) => ({ ...p, notas: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-900">Próxima cita (opcional)</label>
              <input
                type="datetime-local"
                value={draft.proximaCita}
                onChange={(e) => setDraft((p) => ({ ...p, proximaCita: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            <div className="flex items-end justify-end">
              <button
                type="button"
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                onClick={saveDraft}
                disabled={!canWrite}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
        Nota: las tarjetas “Borradas” se ocultan, pero se conservan para auditoría.
      </div>
    </div>
  );
}

function Section({ title, items, kind, emptyText, onOpen, canWrite, onDelete, filesByHistoryId }) {
  const maxH = "max-h-[420px]";

  return (
    <section className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-slate-900">{title}</div>
      </div>

      <div className={`mt-3 space-y-3 overflow-y-auto pr-1 ${maxH} nice-scroll`}>
        {items.length === 0 ? <div className="text-sm text-slate-600">{emptyText}</div> : null}

        {items.map((it) => {
          const linkedFiles = filesByHistoryId.get(it.id) || [];
          const preview = linkedFiles.slice(0, 3);
          const more = Math.max(0, linkedFiles.length - preview.length);

          return (
            <div
              key={it.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(it)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(it)}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 break-words">{it.titulo || "Cita"}</div>

                  <div className="mt-1 text-xs text-slate-600">
                    {kind === "upcoming" ? (
                      <>
                        Próxima: <b>{formatDateTime(toDate(it.proximaCita))}</b>
                      </>
                    ) : (
                      <>{formatDateTime(toDate(it.citaAt))}</>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                      Pago: <b>{it.pago == null ? "—" : fmtMoneyCRC(it.pago)}</b>
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">
                      Tipo: <b>{it.tipoPago ? String(it.tipoPago) : "—"}</b>
                    </span>
                  </div>
                </div>

                {canWrite ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(it);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Borrar
                  </button>
                ) : null}
              </div>

              {it.notas ? <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{it.notas}</div> : null}

              <div className="mt-3 flex items-start gap-2 text-xs text-slate-600">
                <Paperclip className="mt-0.5 h-4 w-4" />
                <div className="min-w-0">
                  <div className="font-semibold">Archivos asociados</div>

                  {linkedFiles.length === 0 ? (
                    <div>Sin archivos.</div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {preview.map((f) => (
                        <a
                          key={f.id}
                          href={f.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="group inline-flex items-center gap-2 rounded-2xl bg-white px-2 py-1 ring-1 ring-slate-200 hover:bg-slate-50"
                          title={f.name || "Archivo"}
                        >
                          {isImage(f.contentType) && f.url ? (
                            <img
                              src={f.url}
                              alt={f.name || "imagen"}
                              className="h-8 w-8 rounded-xl object-cover ring-1 ring-slate-200"
                              loading="lazy"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1">{fileIcon(f.contentType)}</span>
                          )}

                          <span className="max-w-[160px] truncate text-slate-700">{f.name || f.id}</span>
                        </a>
                      ))}

                      {more ? <span className="text-slate-500">+{more} más</span> : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-600">
                Creado por: <b>{it.createdByName || shortUid(it.createdBy)}</b> • Última act.:{" "}
                <b>{formatDateTime(toDate(it.updatedAt))}</b>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HistoryFilesPreview({ files }) {
  if (!files || files.length === 0) return null;

  return (
    <div className="mt-4 rounded-3xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-center gap-2 text-slate-900">
        <Paperclip className="h-5 w-5 text-slate-600" />
        <div className="text-sm font-extrabold">Archivos asociados a esta cita</div>
        <div className="text-xs text-slate-500">({files.length})</div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((f) => (
          <a
            key={f.id}
            href={f.url || "#"}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
            title={f.name || "Archivo"}
          >
            <div className="flex items-center gap-3">
              {isImage(f.contentType) && f.url ? (
                <img
                  src={f.url}
                  alt={f.name || "imagen"}
                  className="h-12 w-12 rounded-2xl object-cover ring-1 ring-slate-200"
                  loading="lazy"
                />
              ) : (
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                  {fileIcon(f.contentType)}
                </div>
              )}

              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900">{f.name || f.id}</div>
                <div className="mt-1 text-xs text-slate-600">
                  {f.contentType || "—"} • {toDate(f.createdAt) ? formatDateTime(toDate(f.createdAt)) : "—"}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
