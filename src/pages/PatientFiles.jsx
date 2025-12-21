// src/pages/PatientFiles.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Download,
  Calendar,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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

function safeName(name) {
  return String(name || "").replace(/[^\w.\-() ]+/g, "_");
}

function fmtSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function fileKind(item) {
  const ct = String(item?.contentType || "").toLowerCase();
  const name = String(item?.name || "").toLowerCase();

  if (ct.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (ct.startsWith("image/")) return "image";
  return "file";
}

function kindLabel(kind) {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "Imagen";
  return "Archivo";
}

function kindBadgeClass(kind) {
  if (kind === "pdf") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (kind === "image") return "bg-sky-50 text-sky-700 ring-sky-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function KindIcon({ kind }) {
  if (kind === "image") return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function Preview({ item }) {
  const kind = fileKind(item);

  if (kind === "image" && item?.url) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="block h-20 w-28 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200"
        title="Abrir imagen"
      >
        <img
          src={item.url}
          alt={item?.name || "archivo"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  // Placeholder para PDF / otros
  return (
    <a
      href={item?.url || "#"}
      target={item?.url ? "_blank" : undefined}
      rel="noreferrer"
      className={cn(
        "flex h-20 w-28 items-center justify-center rounded-2xl ring-1",
        kind === "pdf" ? "bg-rose-50 ring-rose-200" : "bg-slate-100 ring-slate-200",
        item?.url ? "hover:opacity-90" : "cursor-default"
      )}
      title={item?.url ? "Abrir archivo" : "Sin URL"}
    >
      <div className="flex flex-col items-center gap-1">
        <FileText className={cn("h-7 w-7", kind === "pdf" ? "text-rose-700" : "text-slate-600")} />
        <div className={cn("text-[11px] font-extrabold", kind === "pdf" ? "text-rose-700" : "text-slate-700")}>
          {kind === "pdf" ? "PDF" : "ARCH"}
        </div>
      </div>
    </a>
  );
}

export default function PatientFiles({ patientId, canWrite }) {
  const { user, member } = useSession();
  const fb = useFeedback();
  const confirm = useConfirm();

  const [items, setItems] = useState([]);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (!filesCol) return () => {};
    const q = query(filesCol, orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setError("No se pudieron cargar los archivos. Revisá permisos/reglas.")
    );
  }, [filesCol]);

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
      const storagePath = `clinics/${CLINIC_ID}/patients/${patientId}/files/${fileDocRef.id}-${safeName(file.name)}`;
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

    const ok = await confirm(`¿Eliminar "${item.name}"?`, {
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
                  const kind = fileKind(it);

                  return (
                    <div key={it.id} className="px-4 py-3">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        {/* Izquierda: preview + info */}
                        <div className="flex gap-3 min-w-0">
                          <Preview item={it} />

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-2 text-sm text-slate-900 min-w-0">
                                <KindIcon kind={kind} />
                                <div className="font-semibold truncate">{it.name}</div>
                              </div>

                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ring-1",
                                  kindBadgeClass(kind)
                                )}
                                title={it.contentType || ""}
                              >
                                {kindLabel(kind)}
                              </span>

                              <span className="inline-flex items-center rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                {fmtSize(it.size)}
                              </span>
                            </div>

                            <div className="mt-1 text-xs text-slate-600">
                              Tipo MIME: {it.contentType || "—"} • Subido: {fmtDateTime(it.createdAt)}
                            </div>

                            <div className="mt-2 text-xs text-slate-600">
                              Auditoría: creado por <b>{it.createdByName || it.createdBy || "—"}</b> • actualizado por{" "}
                              <b>{it.updatedByName || it.updatedBy || "—"}</b>
                            </div>
                          </div>
                        </div>

                        {/* Derecha: acciones */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                          {it.url ? (
                            <>
                              <a
                                href={it.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                                title="Abrir en una nueva pestaña"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Abrir
                              </a>

                              <a
                                href={it.url}
                                download={safeName(it.name)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800"
                                title="Descargar (en móvil puede abrir el visor del sistema)"
                              >
                                <Download className="h-4 w-4" />
                                Descargar
                              </a>
                            </>
                          ) : null}

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
        Nota: los archivos se agrupan por fecha de subida. La vista previa depende del tipo (imagen muestra miniatura; PDF/otros usan un placeholder).
      </div>
    </div>
  );
}
