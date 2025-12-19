// src/lib/cn.js
export function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}
