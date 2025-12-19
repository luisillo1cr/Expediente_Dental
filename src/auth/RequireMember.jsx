import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "./useSession";
import { FullScreenDentalLoader } from "../ui/DentalLoader";

/**
 * RequireMember
 * Protege rutas que requieren un miembro válido de clínica.
 * Reglas:
 * - Debe existir el doc members/{uid}.
 * - status debe ser active o approved.
 * - Si allowRoles se pasa, el rol debe estar dentro del arreglo.
 */
export default function RequireMember({ children, allowRoles }) {
  const { loading, user, member, error } = useSession();
  const loc = useLocation();

  if (loading) return <FullScreenDentalLoader label="Cargando clínica…" />;

  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;

  // Si Firestore falló por permisos u otro problema, se envía a no-access.
  if (error) return <Navigate to="/no-access" replace />;

  // Si no existe member, se envía a request-access (aunque ya no lo uses, evita pantallas rotas).
  if (!member) return <Navigate to="/request-access" replace />;

  const okStatus = member.status === "active" || member.status === "approved";
  if (!okStatus) return <Navigate to="/no-access" replace />;

  if (allowRoles?.length && !allowRoles.includes(member.role)) {
    return <Navigate to="/no-access" replace />;
  }

  return children;
}
