// src/firebase.js
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Persistencia: solo dura mientras la pestaña esté abierta.
let _persistenceSet = false;
export async function ensureSessionPersistence() {
  if (_persistenceSet) return;
  _persistenceSet = true;
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (e) {
    // Si falla por alguna razón, no rompemos la app.
    console.warn("No pude aplicar browserSessionPersistence:", e);
  }
}
