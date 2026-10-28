import { constants, GAME_STATE, PLAY_MODE, WZ } from "@/app/constants";
import type { CurrentRound, Lobby, Player } from "@/app/types";
import { pickRandomQuestion } from "@/app/questions";
import { generateLobbyCode, makeLocalPlayerId } from ".";
import {
  getStore,
  patchStoreLobby,
  patchStoreUser,
} from "@/utils/firebase/firebaseHelpers";
import { getOrCreatePlayerId } from "@/utils/identity";

const STORAGE_KEY = "whozzit_hotseat_lobby";

export function loadLocalLobby(): Lobby | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Lobby;
  } catch {
    return null;
  }
}

export function clearLocalLobby() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

function persist(lobby: Lobby) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lobby));
  }
  patchStoreLobby({ ...lobby, lobbyFetched: true });
}

export function isLocalHotseatCode(code: string): boolean {
  const lobby = loadLocalLobby();
  return !!(lobby && lobby.lobbyCode.toUpperCase() === code.toUpperCase());
}

export function createLocalHotseat(hostName: string): Lobby {
  const lobbyCode = generateLobbyCode();
  const hostId = getOrCreatePlayerId();
  const host: Player = {
    userId: hostId,
    name: hostName || "Host",
    isHost: true,
  };
  const lobby: Lobby = {
    lobbyCode,
    playMode: PLAY_MODE.HOTSEAT,
    hostId: host.userId,
    gameState: GAME_STATE.LOBBY,
    players: [host],
    enabledPacks: null,
    timerSeconds: constants.defaultTimerSeconds,
    round: 0,
    currentRound: null,
    usedQuestions: [],
  };
  patchStoreUser({
    userId: host.userId,
    playerName: host.name,
    playerLobbyCode: lobbyCode,
    userFetched: true,
  });
  if (typeof window !== "undefined") {
    localStorage.setItem(WZ.playerName, host.name);
    localStorage.setItem(WZ.lobbyCode, lobbyCode);
  }
  persist(lobby);
  return lobby;
}

export function hydrateLocalIfMatch(code: string): boolean {
  const lobby = loadLocalLobby();
  if (!lobby || lobby.lobbyCode.toUpperCase() !== code.toUpperCase()) return false;
  persist(lobby);
  const store = getStore();
  if (!store.user?.userId && lobby.hostId) {
    patchStoreUser({
      userId: lobby.hostId,
      playerName: lobby.players?.[0]?.name || "Host",
      playerLobbyCode: lobby.lobbyCode,
      userFetched: true,
    });
  }
  return true;
}

function getLobby(): Lobby {
  const fromState = getStore().lobby;
  if (fromState?.playMode === PLAY_MODE.HOTSEAT && fromState.lobbyCode) {
    return JSON.parse(JSON.stringify(fromState));
  }
  const stored = loadLocalLobby();
  if (!stored) throw new Error("No local lobby");
  return stored;
}

export function localAddPlayer(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, message: "Name required" };
  const lobby = getLobby();
  if ((lobby.players || []).length >= constants.maxPlayers) {
    return { ok: false as const, message: "Lobby is full" };
  }
  if ((lobby.players || []).some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false as const, message: "Name already taken" };
  }
  lobby.players = [
    ...(lobby.players || []),
    {
      userId: makeLocalPlayerId(trimmed, (lobby.players || []).length),
      name: trimmed,
      isHost: false,
    },
  ];
  persist(lobby);
  return { ok: true as const };
}

export function localRemovePlayer(userId: string) {
  const lobby = getLobby();
  lobby.players = (lobby.players || []).filter((p) => p.userId !== userId);
  persist(lobby);
  return { ok: true as const };
}

export function localSetPacks(enabledPacks: string[]) {
  const lobby = getLobby();
  lobby.enabledPacks = enabledPacks;
  persist(lobby);
}

export function localSetTimer(timerSeconds: number) {
  const lobby = getLobby();
  lobby.timerSeconds = Math.min(
    constants.maxTimerSeconds,
    Math.max(constants.minTimerSeconds, Math.round(timerSeconds))
  );
  persist(lobby);
}

function buildRound(
  packs: Record<string, string[]>,
  lobby: Lobby
): CurrentRound | null {
  const enabled = lobby.enabledPacks || Object.keys(packs);
  const pick = pickRandomQuestion(packs, enabled, lobby.usedQuestions || []);
  if (!pick) return null;
  const now = Date.now();
  const timer = lobby.timerSeconds || constants.defaultTimerSeconds;
  return {
    question: pick.question,
    packId: pick.packId,
    startedAt: now,
    endsAt: now + timer * 1000,
    votes: {},
    hotseatVoterId: lobby.players?.[0]?.userId || null,
  };
}

export function localStartGame(packs: Record<string, string[]>, enabledPacks: string[]) {
  const lobby = getLobby();
  if ((lobby.players || []).length < constants.minPlayers) {
    return {
      ok: false as const,
      error: `Need at least ${constants.minPlayers} players`,
    };
  }
  if (!enabledPacks.length) {
    return { ok: false as const, error: "Select at least one pack" };
  }
  lobby.enabledPacks = enabledPacks;
  lobby.usedQuestions = [];
  const round = buildRound(packs, lobby);
  if (!round) return { ok: false as const, error: "No questions available" };
  lobby.gameState = GAME_STATE.VOTING;
  lobby.round = 1;
  lobby.currentRound = round;
  lobby.usedQuestions = [round.question];
  persist(lobby);
  return { ok: true as const, playerCount: lobby.players.length };
}

export function localCastVote(voterId: string, targetId: string) {
  const lobby = getLobby();
  if (lobby.gameState !== GAME_STATE.VOTING || !lobby.currentRound) {
    return { ok: false as const, error: "Not voting" };
  }
  lobby.currentRound.votes = {
    ...(lobby.currentRound.votes || {}),
    [voterId]: targetId,
  };

  const players = lobby.players || [];
  const idx = players.findIndex((p) => p.userId === voterId);
  const next = players[idx + 1];
  if (next) {
    lobby.currentRound.hotseatVoterId = next.userId;
  } else {
    lobby.gameState = GAME_STATE.RESULTS;
    lobby.currentRound.hotseatVoterId = null;
  }
  persist(lobby);
  return { ok: true as const };
}

export function localLockIfNeeded() {
  const lobby = getLobby();
  if (lobby.gameState !== GAME_STATE.VOTING || !lobby.currentRound) return;
  const allVoted =
    Object.keys(lobby.currentRound.votes || {}).length >= (lobby.players || []).length;
  const timedOut = Date.now() >= lobby.currentRound.endsAt;
  if (allVoted || timedOut) {
    lobby.gameState = GAME_STATE.RESULTS;
    lobby.currentRound.hotseatVoterId = null;
    persist(lobby);
  }
}

export function localNextRound(packs: Record<string, string[]>) {
  const lobby = getLobby();
  const round = buildRound(packs, lobby);
  if (!round) return { ok: false as const, error: "No more questions" };
  lobby.gameState = GAME_STATE.VOTING;
  lobby.round = (lobby.round || 0) + 1;
  lobby.currentRound = round;
  lobby.usedQuestions = [...(lobby.usedQuestions || []), round.question];
  persist(lobby);
  return { ok: true as const };
}

export function localReturnToLobby() {
  const lobby = getLobby();
  lobby.gameState = GAME_STATE.LOBBY;
  lobby.currentRound = null;
  lobby.round = 0;
  lobby.usedQuestions = [];
  persist(lobby);
}
