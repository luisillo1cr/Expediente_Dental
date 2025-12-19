/**
 * Formatea un número de expediente a un código profesional visible.
 * - Mantiene ceros a la izquierda (pad) para lectura rápida.
 * - No depende de fecha (estable y fácil de buscar).
 */
export function formatExpedienteCode(n, { prefix = "EXP", pad = 6 } = {}) {
  const num = Number(n || 0);
  const safe = Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
  const body = String(safe).padStart(pad, "0");
  return `${prefix}-${body}`;
}
