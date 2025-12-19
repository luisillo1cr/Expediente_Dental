// src/auth/RequireRole.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "./useSession";

function hasAccess(member) {
  if (!member) return false;
  const role = String(member.role || "");
  const status = String(member.status || "");
  return role === "admin" || status === "active" || status === "approved";
}

export default function RequireRole({ allowRoles = [], children }) {
  const { user, authLoading, member, memberLoading } = useSession();

  if (authLoading || memberLoading) return <div className="p-6 text-sm">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasAccess(member)) return <Navigate to="/request-access" replace />;

  const role = String(member?.role || "");
  if (!allowRoles.includes(role)) return <Navigate to="/" replace />;

  return children;
}
