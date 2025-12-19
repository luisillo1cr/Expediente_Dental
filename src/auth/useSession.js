// src/auth/useSession.js
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { CLINIC_ID, UID_ROLE_MAP } from "../config";

export function useSession(clinicId = CLINIC_ID) {
  const [authLoading, setAuthLoading] = useState(true);
  const [memberLoading, setMemberLoading] = useState(true);

  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (cancelled) return;

      setError(null);
      setUser(u || null);
      setAuthLoading(false);

      if (!u) {
        setMember(null);
        setMemberLoading(false);
        return;
      }

      setMemberLoading(true);

      try {
        const ref = doc(db, "clinics", clinicId, "members", u.uid);
        const snap = await getDoc(ref);

        // Si el doc no existe, lo creamos automático (para Perfil + auditoría)
        if (!snap.exists()) {
          const role = UID_ROLE_MAP?.[u.uid] || "user";

          const payload = {
            uid: u.uid,
            email: u.email || "",
            displayName: u.displayName || "",
            phone: "",
            role,            // solo informativo (UI)
            status: "active",// solo informativo (UI)
            createdAt: serverTimestamp(),
            createdBy: u.uid,
            updatedAt: serverTimestamp(),
            updatedBy: u.uid,
          };

          await setDoc(ref, payload, { merge: true });

          const snap2 = await getDoc(ref);
          if (!cancelled) setMember(snap2.exists() ? snap2.data() : payload);
        } else {
          if (!cancelled) setMember(snap.data());
        }

        if (!cancelled) {
          setMemberLoading(false);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setMember(null);
          setMemberLoading(false);
          setError(e);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [clinicId]);

  const loading = authLoading || memberLoading;

  return {
    // compat con tu código actual
    loading,
    authLoading,
    memberLoading,

    user,
    member,
    error,
  };
}
