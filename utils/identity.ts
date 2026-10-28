import { WZ } from "@/app/constants";

/** Stable device player id — no Firebase Auth. */
export function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(WZ.userId)?.trim();
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `wz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(WZ.userId, id);
  return id;
}

export function getStoredPlayerName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(WZ.playerName)?.trim() || "";
}

export function setStoredPlayerName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WZ.playerName, name.trim().slice(0, 24));
}
