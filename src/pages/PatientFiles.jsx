// src/pages/PatientsFiles.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Link2,
  Unlink,
  Calendar,
  BadgeCheck,
  BadgeMinus,
} from "lucide-react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

import { db, storage } from "../firebase";
import { CLINIC_ID } from "../config";
import { useSession } from "../auth/useSession";
import { useFeedback, useConfirm } from "../ui/feedback/hooks";
import { DentalOverlay } from "../ui/DentalLoader";

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

function toDateAny(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function fmtDay(v) {
  const d = toDateAny(v);
  if (!d) return "Sin fecha";
  return d.toLocaleDateString("es-CR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtDateTime(v) {
  const d = toDateAny(v);
  if (!d) return "—";
  return d.toLocaleString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iconFor(ct) {
  if ((ct || "").startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function safeName(name) {
  return String(name || "").replace(/[^\w.\-() ]+/g, "_");
}

export default function PatientFiles({ patientId, canWrite }) {
  const { user, member } = useSession();
  const fb = useFeedback();
  const confirm = useConfirm();

  const [items, setItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const [linkPick, setLinkPick] = useState({});

  const actorName = useMemo(() => {
    return (
      member?.displayName ||
      user?.displayName ||
      user?.email ||
      (user?.uid ? `uid:${user.uid.slice(0, 6)}…` : "—")
    );
  }, [member, user]);

  const filesCol = useMemo(() => {
    if (!patientId) return null;
    return collection(db, "clinics", CLINIC_ID, "patients", patientId, "files");
  }, [patientId]);

  const historyCol = useMemo(() => {
    if (!patientId) return null;
    return collection(db, "clinics", CLINIC_ID, "patients", patientId, "history");
  }, [patientId]);

  useEffect(() => {
    if (!filesCol) return () => {};
    const q = query(filesCol, orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setError("No se pudieron cargar los archivos. Revisá permisos/reglas.")
    );
  }, [filesCol]);

  useEffect(() => {
    if (!historyCol) return () => {};
    const q = query(historyCol, orderBy("citaAt", "desc"), limit(300));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
        setHistoryItems(list);
      },
      () => {}
    );
  }, [historyCol]);

  const historyMap = useMemo(() => {
    const m = new Map();
    for (const h of historyItems) {
      const label = `${h.titulo || "Sin motivo"} • ${fmtDateTime(h.citaAt)}`;
      m.set(h.id, label);
    }
    return m;
  }, [historyItems]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const it of items) {
      const key = fmtDay(it.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    return Array.from(groups.entries());
  }, [items]);

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!canWrite) return setError("Solo admin/doctor pueden subir archivos.");
    if (!user?.uid) return setError("No hay sesión válida.");
    if (!filesCol) return;

    setError("");
    setUploading(true);
    setProgress(0);

    try {
      const fileDocRef = doc(filesCol);
      const storagePath = `clinics/${CLINIC_ID}/patients/${patientId}/files/${fileDocRef.id}-${safeName(
        file.name
      )}`;
      const storageRef = ref(storage, storagePath);

      const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

      await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          resolve
        );
      });

      const url = await getDownloadURL(task.snapshot.ref);

      await setDoc(
        fileDocRef,
        {
          name: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          url,
          storagePath,
          linkedHistoryIds: [],
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          createdByName: actorName,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: actorName,
        },
        { merge: true }
      );

      fb.success("Archivo subido correctamente.");
    } catch (err) {
      const msg = String(err?.message || err || "Error subiendo archivo.");
      setError(msg);
      fb.error(msg);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function onDelete(item) {
    if (!canWrite) return setError("Solo admin/doctor pueden borrar archivos.");
    if (!filesCol) return;

    const ok = await confirm(`Eliminar "${item.name}"?`, {
      title: "Eliminar archivo",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;

    try {
      if (item.storagePath) await deleteObject(ref(storage, item.storagePath));
      await deleteDoc(doc(filesCol, item.id));
      fb.success("Archivo eliminado.");
    } catch (err) {
      const msg = String(err?.message || err || "No se pudo eliminar el archivo.");
      setError(msg);
      fb.error(msg);
    }
  }

  async function linkToHistory(fileId) {
    if (!canWrite) return setError("Solo admin/doctor pueden asociar archivos.");
    if (!filesCol) return;

    const historyId = linkPick[fileId];
    if (!historyId) return;

    try {
      await updateDoc(doc(filesCol, fileId), {
        linkedHistoryIds: arrayUnion(historyId),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      });
      fb.success("Archivo asociado a la cita.");
    } catch (err) {
      const msg = String(err?.message || err || "No pude asociar el archivo.");
      setError(msg);
      fb.error(msg);
    }
  }

  async function unlinkFromHistory(fileId) {
    if (!canWrite) return setError("Solo admin/doctor pueden desasociar archivos.");
    if (!filesCol) return;

    const historyId = linkPick[fileId];
    if (!historyId) return;

    try {
      await updateDoc(doc(filesCol, fileId), {
        linkedHistoryIds: arrayRemove(historyId),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
        updatedByName: actorName,
      });
      fb.info("Asociación removida.");
    } catch (err) {
      const msg = String(err?.message || err || "No pude desasociar el archivo.");
      setError(msg);
      fb.error(msg);
    }
  }

  return (
    <div className="space-y-4">
      {uploading ? <DentalOverlay label="Subiendo archivo a expediente…" progress={progress} /> : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 cursor-pointer",
            !canWrite ? "opacity-50 cursor-not-allowed" : ""
          )}
          title={!canWrite ? "Solo admin/doctor pueden subir." : "Subir archivo"}
        >
          <Upload className="h-4 w-4" />
          Subir archivo (PDF / imagen)
          <input
            type="file"
            className="hidden"
            accept="application/pdf,image/*"
            onChange={onUpload}
            disabled={uploading || !canWrite}
          />
        </label>

        {uploading ? <div className="text-sm text-slate-700">Subiendo... {progress}%</div> : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No hay archivos.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, list]) => (
            <div key={day} className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <Calendar className="h-4 w-4 text-slate-500" />
                <div className="text-sm font-extrabold text-slate-900">{day}</div>
              </div>

              <div className="divide-y divide-slate-200">
                {list.map((it) => {
                  const linked = Array.isArray(it.linkedHistoryIds) ? it.linkedHistoryIds : [];
                  const hasLinks = linked.length > 0;

                  return (
                    <div key={it.id} className="px-4 py-3">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 text-sm text-slate-900 min-w-0">
                              {iconFor(it.contentType)}
                              <div className="font-semibold truncate">{it.name}</div>
                            </div>

                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold",
                                hasLinks
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                  : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                              )}
                            >
                              {hasLinks ? (
                                <BadgeCheck className="h-3.5 w-3.5" />
                              ) : (
                                <BadgeMinus className="h-3.5 w-3.5" />
                              )}
                              {hasLinks ? "Asociado" : "Sin asociar"}
                            </span>

                            {it.url ? (
                              <a
                                href={it.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Abrir
                              </a>
                            ) : null}
                          </div>

                          <div className="mt-1 text-xs text-slate-600">
                            Tipo: {it.contentType || "—"} • Subido: {fmtDateTime(it.createdAt)}
                          </div>

                          <div className="mt-2 text-xs text-slate-600">
                            Auditoría: creado por <b>{it.createdByName || it.createdBy || "—"}</b> • actualizado por{" "}
                            <b>{it.updatedByName || it.updatedBy || "—"}</b>
                          </div>

                          {hasLinks ? (
                            <div className="mt-2 text-xs text-slate-700">
                              Asociado a:
                              <ul className="mt-1 list-disc pl-5">
                                {linked.map((hid) => (
                                  <li key={hid} className="truncate">
                                    {historyMap.get(hid) || hid}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <select
                            className="min-w-[220px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                            value={linkPick[it.id] || ""}
                            onChange={(e) => setLinkPick((p) => ({ ...p, [it.id]: e.target.value }))}
                            disabled={!canWrite}
                          >
                            <option value="">Seleccionar cita…</option>
                            {historyItems.map((h) => (
                              <option key={h.id} value={h.id}>
                                {historyMap.get(h.id)}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => linkToHistory(it.id)}
                            disabled={!canWrite || !linkPick[it.id]}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                          >
                            <Link2 className="h-4 w-4" />
                            Asociar
                          </button>

                          <button
                            type="button"
                            onClick={() => unlinkFromHistory(it.id)}
                            disabled={!canWrite || !linkPick[it.id]}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
                          >
                            <Unlink className="h-4 w-4" />
                            Quitar
                          </button>

                          <button
                            type="button"
                            onClick={() => onDelete(it)}
                            disabled={!canWrite}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-3 py-2 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Borrar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-500">
        Nota: los archivos se agrupan por fecha de subida. La asociación se guarda como lista de IDs del histórico.
      </div>
    </div>
  );
}
