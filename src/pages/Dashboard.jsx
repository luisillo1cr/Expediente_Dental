// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PieChart,
  CalendarDays,
  Users,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Wallet,
  ClipboardCheck,
  UserPlus,
} from "lucide-react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { db } from "../firebase";
import { CLINIC_ID } from "../config";
import { useSession } from "../auth/useSession";
import {
  DashboardSkeletonAgenda,
  DashboardSkeletonCard,
  DashboardSkeletonPie,
} from "../ui/DentalLoader";

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

function fmtMoneyCRC(n) {
  const num = Number(n || 0);
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(num) ? num : 0);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function dateKey(d) {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parsePago(v) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function spanToRange(span) {
  const start = startOfToday();
  if (span === "day") return { start, end: addDays(start, 1) };
  if (span === "week") return { start, end: addDays(start, 7) };
  return { start, end: addDays(start, 30) };
}

function SpanChips({ value, onChange, withCounts, counts }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("day")}
        className={cn(
          "rounded-2xl px-3 py-2 text-sm font-semibold",
          value === "day" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900 hover:bg-slate-200"
        )}
      >
        Día{withCounts ? ` (${counts?.day ?? 0})` : ""}
      </button>

      <button
        type="button"
        onClick={() => onChange("week")}
        className={cn(
          "rounded-2xl px-3 py-2 text-sm font-semibold",
          value === "week" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900 hover:bg-slate-200"
        )}
      >
        Semana{withCounts ? ` (${counts?.week ?? 0})` : ""}
      </button>

      <button
        type="button"
        onClick={() => onChange("month")}
        className={cn(
          "rounded-2xl px-3 py-2 text-sm font-semibold",
          value === "month" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900 hover:bg-slate-200"
        )}
      >
        Mes{withCounts ? ` (${counts?.month ?? 0})` : ""}
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user, member } = useSession(CLINIC_ID);

  const [patients, setPatients] = useState([]);
  const [agenda, setAgenda] = useState([]);
  const [apptsError, setApptsError] = useState("");

  const [patientsLoading, setPatientsLoading] = useState(true);
  const [agendaLoading, setAgendaLoading] = useState(true);

  // Métricas: ahora vienen de clinics/{clinicId}/history_global
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const [view, setView] = useState("week"); // agenda
  const [slide, setSlide] = useState(0);

  // spans independientes por tarjeta (esto arregla tu “se cambian las 3”)
  const [spanIngresos, setSpanIngresos] = useState("week");
  const [spanRealizadas, setSpanRealizadas] = useState("week");
  const [spanNuevos, setSpanNuevos] = useState("week");

  useEffect(() => {
    setSlide(0);
  }, []);

  const [enterPulse, setEnterPulse] = useState(true);
  useEffect(() => {
    setEnterPulse(true);
    const t = setTimeout(() => setEnterPulse(false), 650);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const colRef = collection(db, "clinics", CLINIC_ID, "patients");
    const q = query(colRef, orderBy("updatedAt", "desc"));

    setPatientsLoading(true);

    return onSnapshot(
      q,
      (snap) => {
        setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setPatientsLoading(false);
      },
      () => {
        setPatients([]);
        setPatientsLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    const start = startOfToday();
    const colRef = collection(db, "clinics", CLINIC_ID, "agenda");
    const q = query(
      colRef,
      where("proximaCitaAt", ">=", start),
      orderBy("proximaCitaAt", "asc"),
      limit(500)
    );

    setApptsError("");
    setAgendaLoading(true);

    return onSnapshot(
      q,
      (snap) => {
        setAgenda(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAgendaLoading(false);
      },
      (e) => {
        console.error("Agenda error:", e);
        setApptsError("No se pudo cargar la agenda. Revisá permisos/reglas.");
        setAgenda([]);
        setAgendaLoading(false);
      }
    );
  }, []);

  /**
   * 🔥 IMPORTANTE: métricas sin collectionGroup.
   * Requiere que PatientHistory escriba en /clinics/{CLINIC_ID}/history_global
   */
  useEffect(() => {
    const since = addDays(startOfToday(), -120);

    setHistoryLoading(true);
    setHistoryError("");

    const colRef = collection(db, "clinics", CLINIC_ID, "history_global");
    const q = query(
      colRef,
      where("citaAt", ">=", since),
      orderBy("citaAt", "desc"),
      limit(5000)
    );

    return onSnapshot(
      q,
      (snap) => {
        setHistoryRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setHistoryLoading(false);
      },
      (e) => {
        console.error("history_global metrics error:", e);
        setHistoryRows([]);
        setHistoryLoading(false);
        setHistoryError("No pude cargar métricas de ingresos/citas (revisá rules de history_global).");
      }
    );
  }, []);

  const visiblePatients = useMemo(() => patients.filter((p) => !p.deleted), [patients]);

  const gender = useMemo(() => {
    const counts = { Femenino: 0, Masculino: 0, "No especificado": 0, Otro: 0 };
    for (const p of visiblePatients) {
      const g = String(p.genero || "No especificado");
      if (g === "Femenino") counts.Femenino += 1;
      else if (g === "Masculino") counts.Masculino += 1;
      else if (g === "No especificado") counts["No especificado"] += 1;
      else counts.Otro += 1;
    }
    return counts;
  }, [visiblePatients]);

  const totalGender =
    gender.Femenino + gender.Masculino + gender["No especificado"] + gender.Otro;

  const pieStyle = useMemo(() => {
    if (!totalGender) return { background: "conic-gradient(#e2e8f0 0 100%)" };

    const p1 = (gender.Femenino / totalGender) * 100;
    const p2 = (gender.Masculino / totalGender) * 100;
    const p3 = (gender["No especificado"] / totalGender) * 100;
    const p4 = Math.max(0, 100 - (p1 + p2 + p3));

    const a = 0;
    const b = p1;
    const c = p1 + p2;
    const d = p1 + p2 + p3;

    return {
      background: `conic-gradient(
        #10b981 ${a}% ${b}%,
        #3b82f6 ${b}% ${c}%,
        #64748b ${c}% ${d}%,
        #f59e0b ${d}% ${d + p4}%
      )`,
    };
  }, [gender, totalGender]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return (agenda || [])
      .map((a) => ({ ...a, _dt: toDateAny(a.proximaCitaAt) }))
      .filter((a) => a._dt && a._dt >= now)
      .filter((a) => !a.deleted && !a.patientDeleted)
      .sort((a, b) => a._dt.getTime() - b._dt.getTime());
  }, [agenda]);

  const range = useMemo(() => {
    const start = startOfToday();
    if (view === "day") return { start, end: addDays(start, 1) };
    if (view === "week") return { start, end: addDays(start, 7) };
    return { start, end: addDays(start, 30) };
  }, [view]);

  const apptsInRange = useMemo(() => {
    const { start, end } = range;
    return upcoming.filter((a) => a._dt >= start && a._dt < end).slice(0, 20);
  }, [upcoming, range]);

  const counts = useMemo(() => {
    const start = startOfToday();
    const dEnd = addDays(start, 1);
    const wEnd = addDays(start, 7);
    const mEnd = addDays(start, 30);

    return {
      day: upcoming.filter((a) => a._dt >= start && a._dt < dEnd).length,
      week: upcoming.filter((a) => a._dt >= start && a._dt < wEnd).length,
      month: upcoming.filter((a) => a._dt >= start && a._dt < mEnd).length,
    };
  }, [upcoming]);

  const monthGrid = useMemo(() => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const startWeekDay = first.getDay();
    const daysInMonth = last.getDate();

    const cells = [];
    for (let i = 0; i < startWeekDay; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push(new Date(today.getFullYear(), today.getMonth(), d));
    }
    return cells;
  }, []);

  const apptsCountByDay = useMemo(() => {
    const map = new Map();
    for (const a of upcoming) {
      const d = a._dt;
      if (!d) continue;
      const k = dateKey(d);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }, [upcoming]);

  // ----------- Métricas (con spans independientes) -----------

  const ingresos = useMemo(() => {
    const { start, end } = spanToRange(spanIngresos);
    let sum = 0;
    for (const r of historyRows) {
      if (r.deleted) continue;
      const d = toDateAny(r.citaAt);
      if (!d || d < start || d >= end) continue;
      const pago = parsePago(r.pago);
      if (pago > 0) sum += pago;
    }
    return sum;
  }, [historyRows, spanIngresos]);

  const citasRealizadas = useMemo(() => {
    const { start, end } = spanToRange(spanRealizadas);
    const now = new Date();
    let n = 0;
    for (const r of historyRows) {
      if (r.deleted) continue;
      const d = toDateAny(r.citaAt);
      if (!d || d < start || d >= end) continue;
      if (d > now) continue;
      n += 1;
    }
    return n;
  }, [historyRows, spanRealizadas]);

  const pacientesNuevos = useMemo(() => {
    const { start, end } = spanToRange(spanNuevos);
    return visiblePatients.filter((p) => {
      const d = toDateAny(p.createdAt);
      return d && d >= start && d < end;
    }).length;
  }, [visiblePatients, spanNuevos]);

  const showPatientsSkeleton = patientsLoading || enterPulse;
  const showAgendaSkeleton = agendaLoading || enterPulse;
  const showExtraSkeleton = historyLoading || enterPulse;

  const metricsReady = !patientsLoading && !agendaLoading;

  const slideCount = 2;
  const canLeft = slide > 0;
  const canRight = slide < slideCount - 1;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <h1 className="text-xl font-extrabold text-slate-900">Inicio</h1>
        <p className="mt-2 text-sm text-slate-600">
          Usuario: {user?.email || user?.uid} • Rol: {member?.role} • Estado: {member?.status}
        </p>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => canLeft && setSlide((s) => Math.max(0, s - 1))}
          disabled={!canLeft}
          className={cn(
            "absolute -left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-2 ring-1 ring-slate-200 shadow-sm",
            !canLeft ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"
          )}
          aria-label="Métricas anteriores"
          title="Anterior"
        >
          <ChevronLeft className="h-5 w-5 text-slate-700" />
        </button>

        <button
          type="button"
          onClick={() => canRight && setSlide((s) => Math.min(slideCount - 1, s + 1))}
          disabled={!canRight}
          className={cn(
            "absolute -right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-2 ring-1 ring-slate-200 shadow-sm",
            !canRight ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"
          )}
          aria-label="Métricas siguientes"
          title="Siguiente"
        >
          <ChevronRight className="h-5 w-5 text-slate-700" />
        </button>

        <div className="overflow-hidden">
          <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${slide * 100}%)` }}>
            {/* SLIDE 0 */}
            <div className="w-full shrink-0">
              <div className="grid gap-4 lg:grid-cols-3">
                {showPatientsSkeleton ? (
                  <DashboardSkeletonCard title="Pacientes activos" />
                ) : (
                  <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-900">
                      <Users className="h-5 w-5 text-sky-600" />
                      <div className="font-extrabold">Pacientes activos</div>
                    </div>
                    <div className="mt-4 text-4xl font-extrabold text-slate-900">{visiblePatients.length}</div>
                    <div className="mt-2 text-sm text-slate-600">Visibles (no incluye ocultos por auditoría).</div>
                  </div>
                )}

                {showPatientsSkeleton ? (
                  <DashboardSkeletonPie />
                ) : (
                  <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-900">
                      <PieChart className="h-5 w-5 text-emerald-600" />
                      <div className="font-extrabold">Distribución por género</div>
                    </div>

                    <div className="mt-4 flex items-center gap-4">
                      <div className="h-24 w-24 rounded-full ring-1 ring-slate-200" style={pieStyle} />
                      <div className="text-sm text-slate-700 space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span>Femenino</span>
                          <b>{gender.Femenino}</b>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Masculino</span>
                          <b>{gender.Masculino}</b>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>No especificado</span>
                          <b>{gender["No especificado"]}</b>
                        </div>
                        {gender.Otro ? (
                          <div className="flex items-center justify-between gap-3">
                            <span>Otro</span>
                            <b>{gender.Otro}</b>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-500">Nota: el gráfico se calcula solo con expedientes visibles.</div>
                  </div>
                )}

                {showAgendaSkeleton ? (
                  <DashboardSkeletonAgenda />
                ) : (
                  <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-slate-900">
                        <CalendarDays className="h-5 w-5 text-amber-500" />
                        <div className="font-extrabold">Agenda</div>
                      </div>

                      <Link
                        to="/patients"
                        className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700"
                      >
                        <FolderOpen className="h-4 w-4" />
                        Pacientes
                      </Link>
                    </div>

                    <SpanChips value={view} onChange={setView} withCounts counts={counts} />

                    {apptsError ? (
                      <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{apptsError}</div>
                    ) : null}

                    {apptsInRange.length === 0 ? (
                      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
                        No hay próximas citas registradas (campo “Próxima cita” en el histórico).
                      </div>
                    ) : (
                      <div className="mt-4 max-h-[230px] overflow-y-auto pr-1 space-y-2 nice-scroll">
                        {apptsInRange.map((a) => {
                          const name = a.patientNombre || "Paciente";
                          const exp = a.patientExpediente || "—";

                          return (
                            <Link
                              key={a.id}
                              to={a.patientId ? `/patients/${a.patientId}` : "/patients"}
                              className="block rounded-2xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
                            >
                              <div className="text-sm font-extrabold text-slate-900 truncate">
                                {name} <span className="text-slate-500 font-semibold">• Exp: {exp}</span>
                              </div>
                              <div className="mt-1 text-xs text-slate-600">
                                Próxima: <b>{fmtDateTime(a.proximaCitaAt)}</b>
                              </div>
                              <div className="mt-1 text-xs text-slate-600 truncate">
                                Motivo: {a.titulo || "—"}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* SLIDE 1 */}
            <div className="w-full shrink-0">
              <div className="grid gap-4 lg:grid-cols-3">
                {showExtraSkeleton ? (
                  <DashboardSkeletonCard title="Ingresos" />
                ) : (
                  <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-900">
                      <Wallet className="h-5 w-5 text-emerald-600" />
                      <div className="font-extrabold">Ingresos</div>
                    </div>

                    <SpanChips value={spanIngresos} onChange={setSpanIngresos} />

                    {historyError ? (
                      <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{historyError}</div>
                    ) : (
                      <>
                        <div className="mt-4 text-4xl font-extrabold text-slate-900">{fmtMoneyCRC(ingresos)}</div>
                        <div className="mt-2 text-sm text-slate-600">Suma de “Pago” en citas dentro del rango.</div>
                      </>
                    )}
                  </div>
                )}

                {showExtraSkeleton ? (
                  <DashboardSkeletonCard title="Citas realizadas" />
                ) : (
                  <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-900">
                      <ClipboardCheck className="h-5 w-5 text-sky-600" />
                      <div className="font-extrabold">Citas realizadas</div>
                    </div>

                    <SpanChips value={spanRealizadas} onChange={setSpanRealizadas} />

                    {historyError ? (
                      <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{historyError}</div>
                    ) : (
                      <>
                        <div className="mt-4 text-4xl font-extrabold text-slate-900">{citasRealizadas}</div>
                        <div className="mt-2 text-sm text-slate-600">Citas con fecha en pasado dentro del rango.</div>
                      </>
                    )}
                  </div>
                )}

                {showPatientsSkeleton ? (
                  <DashboardSkeletonCard title="Pacientes nuevos" />
                ) : (
                  <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-900">
                      <UserPlus className="h-5 w-5 text-amber-500" />
                      <div className="font-extrabold">Pacientes nuevos</div>
                    </div>

                    <SpanChips value={spanNuevos} onChange={setSpanNuevos} />

                    <div className="mt-4 text-4xl font-extrabold text-slate-900">{pacientesNuevos}</div>
                    <div className="mt-2 text-sm text-slate-600">Nuevos expedientes creados dentro del rango.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSlide(i)}
              className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-slate-200", slide === i ? "bg-slate-900" : "bg-white")}
              aria-label={`Ir a métricas ${i + 1}`}
              title={`Métricas ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <CalendarDays className="h-5 w-5 text-sky-600" />
          <div className="text-base font-extrabold">Calendario (mes actual)</div>
        </div>

        {!metricsReady && agendaLoading ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">Cargando calendario…</div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-slate-600">
              {["D", "L", "K", "M", "J", "V", "S"].map((d) => (
                <div key={d} className="text-center font-bold">
                  {d}
                </div>
              ))}

              {monthGrid.map((d, idx) => {
                if (!d) return <div key={`e-${idx}`} className="h-12" />;

                const k = dateKey(d);
                const count = apptsCountByDay.get(k) || 0;

                return (
                  <div
                    key={k}
                    className={cn(
                      "h-12 rounded-2xl border border-slate-200 bg-white flex items-center justify-center relative",
                      count ? "ring-2 ring-emerald-300" : ""
                    )}
                    title={count ? `${count} cita(s)` : ""}
                  >
                    <div className="text-sm font-semibold text-slate-900">{d.getDate()}</div>

                    {count ? (
                      <div className="absolute -top-1 -right-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
                        {count}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Nota: el número indica cuántas “Próximas citas” hay en ese día (según agenda).
            </div>
          </>
        )}
      </div>
    </div>
  );
}
