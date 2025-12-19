import React from "react";

/**
 * DentalLoader
 * Loader principal con estética odontológica (diente + anillo giratorio).
 * Uso recomendado:
 * - Dentro de tarjetas y bloques pequeños: <DentalLoader label="..." size={64} />
 */
export function DentalLoader({ label = "Cargando…", size = 64 }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Halo suave */}
        <div className="absolute inset-0 rounded-full bg-emerald-100/70 blur-md animate-pulse" />

        {/* Diente */}
        <svg
          viewBox="0 0 64 64"
          className="relative z-10 drop-shadow-sm"
          width={size}
          height={size}
          aria-hidden="true"
        >
          <path
            d="M22 10c-6.5 0-12 5.5-12 12.5 0 5.4 2.1 9.2 4.2 12.5 2 3.2 3.8 6 4.3 9.9.6 5 3.1 9.1 7.2 9.1 2.9 0 4.3-2 5.1-5.5l1.2-5.3 1.2 5.3c.8 3.5 2.2 5.5 5.1 5.5 4.1 0 6.6-4.1 7.2-9.1.5-3.9 2.3-6.7 4.3-9.9 2.1-3.3 4.2-7.1 4.2-12.5C54 15.5 48.5 10 42 10c-3.7 0-6.8 1.4-10 3.7C28.8 11.4 25.7 10 22 10z"
            fill="white"
            stroke="rgb(15 23 42)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Brillo */}
          <path
            d="M24 18c-3 1-5 3.8-5 7"
            fill="none"
            stroke="rgb(16 185 129)"
            strokeWidth="3"
            strokeLinecap="round"
            className="animate-pulse"
          />
        </svg>

        {/* Anillo giratorio */}
        <div className="absolute -inset-2 rounded-full border-2 border-emerald-300/70 border-t-emerald-600 animate-spin" />
      </div>

      <div className="text-sm font-semibold text-slate-700 text-center">{label}</div>
    </div>
  );
}

/**
 * DentalOverlay
 * Overlay para procesos que bloquean interacción (subidas, guardados, etc.).
 * Permite mostrar progreso opcional.
 */
export function DentalOverlay({ label = "Procesando…", progress = null }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-xl">
        <DentalLoader label={label} size={72} />

        {typeof progress === "number" ? (
          <div className="mt-5">
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-600 text-center">{progress}%</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * FullScreenDentalLoader
 * Loader a pantalla completa para rutas protegidas (RequireAuth / RequireMember).
 * No bloquea por encima de tu layout porque se usa como retorno directo del componente.
 */
export function FullScreenDentalLoader({ label = "Cargando…" }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
        <DentalLoader label={label} size={76} />
      </div>
    </div>
  );
}

/**
 * DashboardSkeletonCard
 * Skeleton para las tarjetas de métricas del Dashboard.
 * Se ve moderno y evita “saltos” visuales mientras llegan los datos.
 */
export function DashboardSkeletonCard({ title = "Cargando…" }) {
  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-slate-200 animate-pulse" />
        <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" title={title} />
      </div>

      <div className="mt-4 h-10 w-20 rounded bg-slate-200 animate-pulse" />
      <div className="mt-3 h-4 w-56 rounded bg-slate-200 animate-pulse" />
    </div>
  );
}

/**
 * DashboardSkeletonPie
 * Skeleton para la tarjeta de distribución por género.
 */
export function DashboardSkeletonPie() {
  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-slate-200 animate-pulse" />
        <div className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="h-24 w-24 rounded-full bg-slate-200 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-44 rounded bg-slate-200 animate-pulse" />
          <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
          <div className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
        </div>
      </div>

      <div className="mt-3 h-3 w-60 rounded bg-slate-200 animate-pulse" />
    </div>
  );
}

/**
 * DashboardSkeletonAgenda
 * Skeleton para la tarjeta de agenda.
 */
export function DashboardSkeletonAgenda() {
  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-slate-200 animate-pulse" />
          <div className="h-4 w-28 rounded bg-slate-200 animate-pulse" />
        </div>
        <div className="h-8 w-24 rounded-2xl bg-slate-200 animate-pulse" />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="h-9 w-20 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="h-9 w-24 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="h-9 w-20 rounded-2xl bg-slate-200 animate-pulse" />
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    </div>
  );
}
