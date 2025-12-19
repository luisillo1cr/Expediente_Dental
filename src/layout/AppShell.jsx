// src/layout/AppShell.jsx
import React, { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useSession } from "../auth/useSession";

import { Menu, X, Home, Users, Folder, LogOut, PanelLeftClose, PanelLeftOpen, User2 } from "lucide-react";

import logo from "../assets/ovares-logo.png";

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

function NavItem({ to, label, Icon, collapsed, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition",
          "text-slate-700 hover:bg-slate-100",
          isActive ? "bg-slate-900 text-white hover:bg-slate-900" : ""
        )
      }
    >
      <Icon className="h-5 w-5 opacity-90" />
      <span className={collapsed ? "hidden" : "block"}>{label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const { user, member } = useSession();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = member?.role === "admin";

  const items = useMemo(() => {
    const base = [
      { to: "/", label: "Inicio", Icon: Home },
      { to: "/patients", label: "Pacientes", Icon: Folder },
      { to: "/account", label: "Cuenta", Icon: User2 },
    ];
    if (isAdmin) base.push({ to: "/admin/users", label: "Usuarios", Icon: Users });
    return base;
  }, [isAdmin]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
  }

  async function handleLogout() {
    await signOut(auth);
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <aside
        className={cn(
          "hidden md:fixed md:inset-y-0 md:left-0 md:z-20 md:flex md:flex-col",
          "border-r border-slate-200 bg-white shadow-sm",
          collapsed ? "md:w-20" : "md:w-72"
        )}
      >
        {/* Header del sidebar (sin absolute para evitar superposición con el logo) */}
        <div
          className={cn(
            "px-4 py-4 border-b border-slate-200",
            collapsed ? "flex flex-col items-center gap-3" : "flex items-center justify-between"
          )}
        >
          <div className={cn("flex items-center gap-3 min-w-0", collapsed && "justify-center")}>
            <img
              src={logo}
              alt="Clínica Dental Ovares"
              className="h-10 w-10 rounded-2xl object-contain"
              draggable="false"
            />

            <div className={cn("min-w-0", collapsed && "hidden")}>
              <div className="text-sm font-extrabold leading-none text-slate-900">Expediente Dental</div>
              <div className="mt-1 text-xs text-slate-500 truncate">
                {member?.role || "member"} • {user?.email || user?.uid || "-"}
              </div>
            </div>
          </div>

          <button
            type="button"
            className={cn(
              "rounded-2xl px-3 py-2 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50",
              collapsed ? "w-full flex justify-center" : ""
            )}
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir" : "Contraer"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5 text-slate-700" />
            ) : (
              <PanelLeftClose className="h-5 w-5 text-slate-700" />
            )}
          </button>
        </div>

        <nav className="px-3 py-3 space-y-1">
          {items.map((it) => (
            <NavItem key={it.to} {...it} collapsed={collapsed} />
          ))}
        </nav>

        <div className="mt-auto p-3">
          <button
            type="button"
            className={cn("w-full rounded-2xl px-4 py-3 text-sm font-semibold", "bg-rose-500 text-white hover:bg-rose-600")}
            onClick={handleLogout}
          >
            <span className="inline-flex items-center gap-2 justify-center w-full">
              <LogOut className="h-4 w-4" />
              <span className={collapsed ? "hidden" : "inline"}>Cerrar sesión</span>
            </span>
          </button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            className="rounded-2xl px-3 py-2 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5 text-slate-800" />
          </button>

          <div className="inline-flex items-center gap-2">
            <img src={logo} alt="Clínica Dental Ovares" className="h-8 w-8 rounded-2xl object-contain" draggable="false" />
            <div className="text-sm font-extrabold text-slate-900">Expediente Dental</div>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-white border-r border-slate-200 p-3 shadow-xl">
            <div className="flex items-center justify-between px-1 py-2">
              <div className="inline-flex items-center gap-2">
                <img src={logo} alt="Clínica Dental Ovares" className="h-9 w-9 rounded-2xl object-contain" draggable="false" />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold leading-none text-slate-900">Expediente Dental</div>
                  <div className="mt-1 text-xs text-slate-500 truncate">
                    {member?.role || "member"} • {user?.email || user?.uid || "-"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="rounded-2xl px-3 py-2 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5 text-slate-800" />
              </button>
            </div>

            <nav className="mt-3 space-y-1">
              {items.map((it) => (
                <NavItem key={it.to} {...it} collapsed={false} onClick={() => setMobileOpen(false)} />
              ))}
            </nav>

            <div className="mt-6">
              <button
                type="button"
                className="w-full rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-600"
                onClick={handleLogout}
              >
                <span className="inline-flex items-center gap-2 justify-center w-full">
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className={cn("px-4 py-6", collapsed ? "md:ml-20" : "md:ml-72")}>
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
