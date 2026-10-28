/**
 * After Leave, block auto-rejoin until the player intentionally
 * creates / joins again (same pattern as Spycy).
 */
export const WZ_SUPPRESS_REJOIN_KEY = "whozzit_suppress_rejoin";

export function markLeftLobby() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(WZ_SUPPRESS_REJOIN_KEY, "1");
  localStorage.setItem(WZ_SUPPRESS_REJOIN_KEY, "1");
}

export function clearSuppressRejoin() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(WZ_SUPPRESS_REJOIN_KEY);
  localStorage.removeItem(WZ_SUPPRESS_REJOIN_KEY);
}

export function shouldSuppressRejoin(): boolean {
  if (typeof window === "undefined") return false;
  return (
    sessionStorage.getItem(WZ_SUPPRESS_REJOIN_KEY) === "1" ||
    localStorage.getItem(WZ_SUPPRESS_REJOIN_KEY) === "1"
  );
}
