import {
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  constants,
  GAME_STATE,
  PLAY_MODE,
  PlayMode,
  WZ,
  WZ_TABLES,
} from "@/app/constants";
import type { CurrentRound, Lobby, Player, UserData } from "@/app/types";
import { pickRandomQuestion } from "@/app/questions";
import { modeFromPlayMode, trackLobbyJoined } from "@/utils/analytics";

export type Store = {
  user: UserData;
  lobby: Lobby | null;
  error: string;
  loading: boolean;
};

type Listener = () => void;

const store: Store = {
  user: { userFetched: false },
  lobby: null,
  error: "",
  loading: false,
};

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function notifyStore() {
  emit();
}

export function getStore(): Store {
  return store;
}

export function subscribeStore(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchStoreLobby(lobby: Lobby | null) {
  store.lobby = lobby;
  emit();
}

export function patchStoreUser(partial: Partial<UserData>) {
  store.user = { ...store.user, ...partial };
  emit();
}

function setUser(partial: Partial<UserData>) {
  store.user = { ...store.user, ...partial };
  emit();
}

function setLobby(lobby: Lobby | null) {
  store.lobby = lobby;
  emit();
}

export async function initializeUser() {
  return new Promise<void>((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser({ userId: user.uid });
        localStorage.setItem(WZ.userId, user.uid);
        await fetchUserData(user.uid);
      } else {
        await signInAnonymouslyAndCreateUser();
      }
      resolve();
    });
  });
}

async function signInAnonymouslyAndCreateUser() {
  try {
    const cred = await signInAnonymously(auth);
    const userId = cred.user.uid;
    setUser({ userId });
    localStorage.setItem(WZ.userId, userId);
    await createUserDocument(userId);
    await fetchUserData(userId);
  } catch (error) {
    console.error("Anonymous sign-in failed:", error);
    // Pass & play still works without Auth.
    setUser({ userFetched: true });
  }
}

async function createUserDocument(userId: string) {
  try {
    await setDoc(
      doc(db, WZ_TABLES.USERS, userId),
      { createdAt: new Date(), userId },
      { merge: true }
    );
  } catch (error) {
    console.error("createUserDocument", error);
  }
}

async function fetchUserData(userId: string) {
  store.loading = true;
  emit();
  try {
    const snap = await getDoc(doc(db, WZ_TABLES.USERS, userId));
    if (snap.exists()) {
      const data = snap.data() as UserData;
      const localName = localStorage.getItem(WZ.playerName) || "";
      setUser({
        ...data,
        userId,
        playerName: data.playerName || localName || "",
        userFetched: true,
      });
    } else {
      await createUserDocument(userId);
      setUser({ userId, userFetched: true });
    }
  } catch (error) {
    console.error("fetchUserData", error);
    setUser({ userId, userFetched: true });
  }
  store.loading = false;
  emit();
}

export async function updateUserData(userId: string, newUserData: Partial<UserData>) {
  try {
    await setDoc(doc(db, WZ_TABLES.USERS, userId), newUserData, { merge: true });
    setUser(newUserData);
    if (newUserData.playerName) {
      localStorage.setItem(WZ.playerName, newUserData.playerName);
    }
  } catch (error) {
    console.error("updateUserData", error);
  }
}

export async function setDisplayName(name: string) {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return { ok: false as const, error: "Name required" };
  localStorage.setItem(WZ.playerName, trimmed);
  const userId = store.user.userId;
  if (userId) {
    await updateUserData(userId, { playerName: trimmed });
    const lobby = store.lobby;
    if (lobby?.lobbyCode && lobby.playMode === PLAY_MODE.ONLINE) {
      const players = (lobby.players || []).map((p) =>
        p.userId === userId ? { ...p, name: trimmed } : p
      );
      await updateDoc(doc(db, WZ_TABLES.LOBBIES, lobby.lobbyCode), { players });
    }
  } else {
    setUser({ playerName: trimmed });
  }
  return { ok: true as const };
}

export async function createLobby(
  lobbyCode: string,
  hostId: string,
  playMode: PlayMode = PLAY_MODE.ONLINE
) {
  try {
    const lobby: Lobby = {
      lobbyCode,
      playMode,
      hostId,
      gameState: GAME_STATE.LOBBY,
      players: [],
      enabledPacks: null,
      timerSeconds: constants.defaultTimerSeconds,
      round: 0,
      currentRound: null,
      usedQuestions: [],
      createdAt: new Date(),
    };
    await setDoc(doc(db, WZ_TABLES.LOBBIES, lobbyCode), lobby);
    return { ok: true as const, data: { lobbyCode } };
  } catch (error) {
    console.error("createLobby", error);
    return { ok: false as const, error: "Failed to create lobby" };
  }
}

export async function joinLobby(lobbyCode: string, userId: string, playerName: string) {
  try {
    const code = String(lobbyCode).toUpperCase();
    const lobbyRef = doc(db, WZ_TABLES.LOBBIES, code);
    const snap = await getDoc(lobbyRef);
    if (!snap.exists()) {
      return { ok: false as const, message: "Lobby not found." };
    }
    const existing = snap.data() as Lobby;

    if (existing.gameState !== GAME_STATE.LOBBY) {
      const alreadyIn = (existing.players || []).some((p) => p.userId === userId);
      if (!alreadyIn) {
        return { ok: false as const, message: "This game has already started." };
      }
      setLobby({ ...existing, lobbyFetched: true });
      return { ok: true as const, data: existing };
    }

    const players = [...(existing.players || [])];
    const idx = players.findIndex((p) => p.userId === userId);
    if (idx === -1) {
      if (players.length >= constants.maxPlayers) {
        return { ok: false as const, message: "Lobby is full." };
      }
      const name =
        playerName.trim() ||
        localStorage.getItem(WZ.playerName) ||
        `Player ${players.length + 1}`;
      players.push({
        userId,
        name,
        isHost: existing.hostId === userId || players.length === 0,
      });
      await updateDoc(lobbyRef, { players });
      trackLobbyJoined(modeFromPlayMode(existing.playMode));
    }

    await updateUserData(userId, { playerLobbyCode: code, playerName: playerName.trim() || undefined });
    const refreshed = (await getDoc(lobbyRef)).data() as Lobby;
    setLobby({ ...refreshed, lobbyFetched: true });
    return { ok: true as const, data: refreshed };
  } catch (error) {
    console.error("joinLobby", error);
    return { ok: false as const, message: "Could not join lobby." };
  }
}

export async function leaveLobby(lobbyCode: string, userId: string) {
  try {
    const lobbyRef = doc(db, WZ_TABLES.LOBBIES, lobbyCode);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(lobbyRef);
      if (!snap.exists()) return;
      const lobby = snap.data() as Lobby;
      const players = (lobby.players || []).filter((p) => p.userId !== userId);
      const patch: Partial<Lobby> = { players };
      if (lobby.hostId === userId && players.length) {
        patch.hostId = players[0].userId;
        players[0] = { ...players[0], isHost: true };
        patch.players = players;
      }
      tx.update(lobbyRef, patch);
    });
    await updateUserData(userId, { playerLobbyCode: null });
    setLobby(null);
  } catch (error) {
    console.error("leaveLobby", error);
  }
}

export function subscribeLobby(lobbyCode: string) {
  const code = String(lobbyCode).toUpperCase();
  return onSnapshot(
    doc(db, WZ_TABLES.LOBBIES, code),
    (snap) => {
      if (!snap.exists()) {
        setLobby(null);
        return;
      }
      setLobby({ ...(snap.data() as Lobby), lobbyCode: code, lobbyFetched: true });
    },
    (error) => {
      console.error("subscribeLobby", error);
      store.error = "Lost lobby connection";
      emit();
    }
  );
}

export async function setEnabledPacks(lobbyCode: string, enabledPacks: string[]) {
  await updateDoc(doc(db, WZ_TABLES.LOBBIES, lobbyCode), { enabledPacks });
}

export async function setTimerSeconds(lobbyCode: string, timerSeconds: number) {
  const clamped = Math.min(
    constants.maxTimerSeconds,
    Math.max(constants.minTimerSeconds, Math.round(timerSeconds))
  );
  await updateDoc(doc(db, WZ_TABLES.LOBBIES, lobbyCode), { timerSeconds: clamped });
}

function buildRound(
  packs: Record<string, string[]>,
  enabled: string[],
  used: string[],
  timerSeconds: number,
  players: Player[],
  playMode: PlayMode
): CurrentRound | null {
  const pick = pickRandomQuestion(packs, enabled, used);
  if (!pick) return null;
  const now = Date.now();
  const round: CurrentRound = {
    question: pick.question,
    packId: pick.packId,
    startedAt: now,
    endsAt: now + timerSeconds * 1000,
    votes: {},
  };
  if (playMode === PLAY_MODE.HOTSEAT && players[0]) {
    round.hotseatVoterId = players[0].userId;
  }
  return round;
}

export async function startGame(
  lobbyCode: string,
  packs: Record<string, string[]>,
  enabledPacks: string[]
) {
  const lobbyRef = doc(db, WZ_TABLES.LOBBIES, lobbyCode);
  const snap = await getDoc(lobbyRef);
  if (!snap.exists()) return { ok: false as const, error: "Lobby not found" };
  const lobby = snap.data() as Lobby;
  const players = lobby.players || [];
  if (players.length < constants.minPlayers) {
    return {
      ok: false as const,
      error: `Need at least ${constants.minPlayers} players`,
    };
  }
  if (!enabledPacks.length) {
    return { ok: false as const, error: "Select at least one pack" };
  }
  const timer = lobby.timerSeconds || constants.defaultTimerSeconds;
  const round = buildRound(packs, enabledPacks, [], timer, players, lobby.playMode);
  if (!round) return { ok: false as const, error: "No questions in selected packs" };

  await updateDoc(lobbyRef, {
    gameState: GAME_STATE.VOTING,
    enabledPacks,
    round: 1,
    currentRound: round,
    usedQuestions: [round.question],
  });
  return { ok: true as const };
}

export async function castVote(lobbyCode: string, voterId: string, targetId: string) {
  const lobbyRef = doc(db, WZ_TABLES.LOBBIES, lobbyCode);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lobbyRef);
    if (!snap.exists()) throw new Error("Lobby missing");
    const lobby = snap.data() as Lobby;
    if (lobby.gameState !== GAME_STATE.VOTING || !lobby.currentRound) {
      throw new Error("Not voting");
    }
    if (Date.now() >= lobby.currentRound.endsAt) {
      throw new Error("Round locked");
    }
    const votes = { ...(lobby.currentRound.votes || {}), [voterId]: targetId };
    tx.update(lobbyRef, { "currentRound.votes": votes });

    const playerCount = (lobby.players || []).length;
    if (Object.keys(votes).length >= playerCount) {
      tx.update(lobbyRef, { gameState: GAME_STATE.RESULTS });
    }
  });
}

export async function lockRoundIfNeeded(lobbyCode: string) {
  const lobbyRef = doc(db, WZ_TABLES.LOBBIES, lobbyCode);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lobbyRef);
    if (!snap.exists()) return;
    const lobby = snap.data() as Lobby;
    if (lobby.gameState !== GAME_STATE.VOTING || !lobby.currentRound) return;
    const allVoted =
      Object.keys(lobby.currentRound.votes || {}).length >= (lobby.players || []).length;
    const timedOut = Date.now() >= lobby.currentRound.endsAt;
    if (allVoted || timedOut) {
      tx.update(lobbyRef, { gameState: GAME_STATE.RESULTS });
    }
  });
}

export async function hostNextRound(
  lobbyCode: string,
  packs: Record<string, string[]>
) {
  const lobbyRef = doc(db, WZ_TABLES.LOBBIES, lobbyCode);
  const snap = await getDoc(lobbyRef);
  if (!snap.exists()) return { ok: false as const, error: "Lobby not found" };
  const lobby = snap.data() as Lobby;
  const enabled = lobby.enabledPacks || Object.keys(packs);
  const used = lobby.usedQuestions || [];
  const timer = lobby.timerSeconds || constants.defaultTimerSeconds;
  const round = buildRound(
    packs,
    enabled,
    used,
    timer,
    lobby.players || [],
    lobby.playMode
  );
  if (!round) return { ok: false as const, error: "No more questions" };

  await updateDoc(lobbyRef, {
    gameState: GAME_STATE.VOTING,
    round: (lobby.round || 0) + 1,
    currentRound: round,
    usedQuestions: [...used, round.question],
  });
  return { ok: true as const };
}

export async function returnToLobby(lobbyCode: string) {
  await updateDoc(doc(db, WZ_TABLES.LOBBIES, lobbyCode), {
    gameState: GAME_STATE.LOBBY,
    currentRound: null,
    round: 0,
    usedQuestions: [],
  });
}
