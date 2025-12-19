import React from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "./useSession";
import { FullScreenDentalLoader } from "../ui/DentalLoader";

/**
 * RequireAuth
 * Protege rutas que requieren autenticación.
 * - Si está cargando la sesión, muestra loader a pantalla completa.
 * - Si no hay usuario, redirige a /login.
 */
export default function RequireAuth({ children }) {
  const { loading, user } = useSession();

  if (loading) return <FullScreenDentalLoader label="Verificando sesión…" />;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}
