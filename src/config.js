function mustEnv(name) {
  const v = import.meta.env[name];
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

export const CLINIC_ID = mustEnv("VITE_CLINIC_ID");

// Solo para mostrar en UI (NO seguridad). La seguridad está en Rules (whitelist).
export const UID_ROLE_MAP = {
  ixtKfayZf3RqrgkiJW4oNVb9ETY2: "admin",
  WQN86XwBcjPYKv02nTBS5PNzJTs1: "doctor",
};
