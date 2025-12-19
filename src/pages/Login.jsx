// src/pages/Login.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { Mail, Lock, Loader2, ArrowRight } from "lucide-react";

import { auth } from "../firebase";
import { useSession } from "../auth/useSession";
import logo from "../assets/ovares-logo.png";
import { DentalOverlay } from "../ui/DentalLoader";

export default function Login() {
  const { user, member, memberLoading } = useSession();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("Procesando…");

  useEffect(() => {
    // Evita mostrar el login si ya hay sesión y el miembro está activo.
    if (user && !memberLoading && member?.status === "active") {
      navigate("/", { replace: true });
    }
  }, [user, memberLoading, member?.status, navigate]);

  async function handleEmailLogin(e) {
    e.preventDefault();
    setMessage("");

    if (!email.trim() || !password) {
      setMessage("Debo ingresar correo y contraseña.");
      return;
    }

    setLoadingLabel("Verificando credenciales…");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setMessage(normalizeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setMessage("");

    if (!email.trim()) {
      setMessage("Debo escribir mi correo para enviar el restablecimiento de contraseña.");
      return;
    }

    setLoadingLabel("Enviando correo de restablecimiento…");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Envié un correo para restablecer la contraseña. Revisá tu bandeja y spam.");
    } catch (err) {
      setMessage(normalizeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-emerald-50 via-white to-slate-50 text-slate-900">
      {loading ? <DentalOverlay label={loadingLabel} /> : null}

      <div className="mx-auto flex min-h-dvh max-w-7xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-3xl bg-white/90 p-6 shadow-2xl ring-1 ring-slate-200 backdrop-blur">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-3xl bg-white p-2 ring-1 ring-slate-200">
                <img
                  src={logo}
                  alt="Logo clínica"
                  className="h-20 w-20 rounded-2xl object-contain"
                  draggable="false"
                />
              </div>

              <div className="mt-4 text-xl font-extrabold leading-tight">Clínica Dental Ovares</div>
              <div className="mt-1 text-sm text-slate-600">Expediente electrónico</div>
            </div>

            <div className="mt-6 space-y-2 text-center">
              <h1 className="text-lg font-extrabold">Iniciar sesión</h1>
              <p className="text-sm text-slate-600">Accedé con tu correo.</p>
            </div>

            {message ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
                {message}
              </div>
            ) : null}

            <form className="mt-5 space-y-4" onSubmit={handleEmailLogin}>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-700">Correo</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="w-full rounded-2xl bg-white py-3 pl-10 pr-4 text-sm outline-none ring-1 ring-slate-200 focus:ring-emerald-300"
                    placeholder="correo@clinica.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-700">Contraseña</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    className="w-full rounded-2xl bg-white py-3 pl-10 pr-4 text-sm outline-none ring-1 ring-slate-200 focus:ring-emerald-300"
                    placeholder="Tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {loading ? "Ingresando..." : "Ingresar"}
              </button>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="text-sm font-semibold underline underline-offset-4 text-slate-600 hover:text-slate-900"
                  onClick={handleResetPassword}
                  disabled={loading}
                >
                  Olvidé mi contraseña
                </button>
              </div>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500">
              © {new Date().getFullYear()} Clínica Dental Ovares
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeAuthError(e) {
  const code = String(e?.code || "");

  if (code === "auth/invalid-email") return "El correo no tiene un formato válido.";
  if (code === "auth/user-disabled") return "El usuario está deshabilitado.";
  if (code === "auth/user-not-found") return "No encontré un usuario con ese correo.";
  if (code === "auth/wrong-password") return "La contraseña es incorrecta.";
  if (code === "auth/too-many-requests") return "Demasiados intentos. Probá más tarde.";
  if (code) return `Error de autenticación: ${code}`;

  return "No pude iniciar sesión. Revisá tus credenciales e intentá de nuevo.";
}
