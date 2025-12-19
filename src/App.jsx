// src/App.jsx
import React, { useEffect, useRef } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, ensureSessionPersistence } from "./firebase";

import Login from "./pages/Login";
import RequestAccess from "./pages/RequestAccess";
import AdminUsers from "./pages/AdminUsers";

import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import Profile from "./pages/Profile";

import RequireAuth from "./auth/RequireAuth";
import RequireMember from "./auth/RequireMember";
import RequireRole from "./auth/RequireRole";

import AppShell from "./layout/AppShell";
import { FeedbackProvider } from "./ui/feedback/FeedbackProvider";

/**
 * Seguridad global:
 * - Persistencia de sesión por pestaña (al cerrar, pide login otra vez).
 * - Logout automático tras 5 min de inactividad.
 */
function SecurityGuards() {
  const timerRef = useRef(null);
  const listenersOnRef = useRef(false);

  useEffect(() => {
    ensureSessionPersistence();
  }, []);

  useEffect(() => {
    const IDLE_MS = 5 * 60 * 1000;

    function clearTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    async function doLogout() {
      try {
        await signOut(auth);
      } catch (e) {
        console.warn("Auto-logout falló:", e);
      }
    }

    function armTimer() {
      clearTimer();
      // Solo arma el timer si hay sesión
      if (!auth.currentUser) return;
      timerRef.current = setTimeout(doLogout, IDLE_MS);
    }

    function onActivity() {
      // Si no hay sesión, no hacemos nada.
      if (!auth.currentUser) return;
      armTimer();
    }

    function addListeners() {
      if (listenersOnRef.current) return;
      listenersOnRef.current = true;

      const opts = { passive: true };
      window.addEventListener("mousemove", onActivity, opts);
      window.addEventListener("mousedown", onActivity, opts);
      window.addEventListener("keydown", onActivity, opts);
      window.addEventListener("scroll", onActivity, opts);
      window.addEventListener("touchstart", onActivity, opts);

      // Si vuelve a la pestaña, cuenta como actividad
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") onActivity();
      });
    }

    function removeListeners() {
      if (!listenersOnRef.current) return;
      listenersOnRef.current = false;

      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("mousedown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimer();

      if (u) {
        addListeners();
        armTimer();
      } else {
        removeListeners();
      }
    });

    return () => {
      clearTimer();
      removeListeners();
      unsub();
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <HashRouter>
      <FeedbackProvider>
        <SecurityGuards />

        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/request-access"
            element={
              <RequireAuth>
                <RequestAccess />
              </RequireAuth>
            }
          />

          <Route
            element={
              <RequireMember>
                <AppShell />
              </RequireMember>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients/new" element={<PatientDetail mode="new" />} />
            <Route path="patients/:id" element={<PatientDetail mode="edit" />} />
            <Route path="/account" element={<Profile />} />

            <Route
              path="admin/users"
              element={
                <RequireRole allowRoles={["admin"]}>
                  <AdminUsers />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </FeedbackProvider>
    </HashRouter>
  );
}
