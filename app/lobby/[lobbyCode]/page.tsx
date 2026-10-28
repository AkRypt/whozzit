"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  constants,
  GAME_STATE,
  PACK_META,
  PLAY_MODE,
  WZ,
} from "@/app/constants";
import { FALLBACK_WORDS, formatPackLabel } from "@/app/questions";
import { useLobby, useUser } from "@/hooks";
import {
  castVote,
  clearClientLobbyMembership,
  hostNextRound,
  joinLobby,
  leaveLobby,
  lockRoundIfNeeded,
  patchLobbyFields,
  returnToLobby,
  setEnabledPacks,
  setTimerSeconds,
  startGame,
  subscribeLobby,
} from "@/utils/firebase/firebaseHelpers";
import {
  clearLocalLobby,
  hydrateLocalIfMatch,
  isLocalHotseatCode,
  localAddPlayer,
  localCastVote,
  localLockIfNeeded,
  localNextRound,
  localRemovePlayer,
  localReturnToLobby,
  localSetPacks,
  localSetTimer,
  localStartGame,
} from "@/utils/localLobby";
import { tallyVotes } from "@/utils";
import NameEditor from "@/app/components/NameEditor";
import {
  modeFromPlayMode,
  trackGameStarted,
  trackRoundFinished,
  trackVoteCast,
} from "@/utils/analytics";
import {
  clearSuppressRejoin,
  markLeftLobby,
  shouldSuppressRejoin,
} from "@/utils/lobbyLeave";

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const lobbyCode = String(params.lobbyCode || "").toUpperCase();
  const lobby = useLobby();
  const { userId, playerName, userFetched, booted } = useUser();
  const [packs, setPacks] = useState<Record<string, string[]>>(FALLBACK_WORDS);
  const [packsState, setPacksState] = useState<"loading" | "ready" | "error">("loading");
  const [hotseatName, setHotseatName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [passReveal, setPassReveal] = useState(false);
  const joinedRef = useRef(false);
  const packsRef = useRef(packs);
  packsRef.current = packs;

  const local = lobby?.playMode === PLAY_MODE.HOTSEAT || isLocalHotseatCode(lobbyCode);
  const isHost = local || (!!userId && lobby?.hostId === userId);

  useEffect(() => {
    if (hydrateLocalIfMatch(lobbyCode)) return;
    if (shouldSuppressRejoin()) {
      clearClientLobbyMembership();
      router.replace("/");
      return;
    }
    if (!booted || !userFetched || !userId) return;
    const unsub = subscribeLobby(lobbyCode);
    return () => unsub();
  }, [lobbyCode, booted, userFetched, userId, router]);

  useEffect(() => {
    if (local || joinedRef.current || !userId || !userFetched) return;
    if (shouldSuppressRejoin()) return;
    joinedRef.current = true;
    clearSuppressRejoin();
    const name =
      playerName ||
      (typeof window !== "undefined" ? localStorage.getItem(WZ.playerName) : "") ||
      "Player";
    void joinLobby(lobbyCode, userId, name).then((res) => {
      if (!res.ok) setError(res.message || "Could not join");
    });
  }, [local, userId, userFetched, lobbyCode, playerName]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/words", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancel) return;
        if (res.ok && data?.ok && data.packs && Object.keys(data.packs).length) {
          setPacks(data.packs);
          setPacksState("ready");
        } else {
          setPacks(FALLBACK_WORDS);
          setPacksState("ready");
        }
      } catch {
        if (!cancel) {
          setPacks(FALLBACK_WORDS);
          setPacksState("ready");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (lobby?.gameState !== GAME_STATE.VOTING) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [lobby?.gameState, lobby?.currentRound?.endsAt]);

  useEffect(() => {
    if (lobby?.gameState !== GAME_STATE.VOTING || !lobby.currentRound) return;
    if (now < lobby.currentRound.endsAt) return;
    if (local) localLockIfNeeded();
    else void lockRoundIfNeeded(lobbyCode);
  }, [now, lobby?.gameState, lobby?.currentRound?.endsAt, local, lobbyCode]);

  useEffect(() => {
    if (lobby?.gameState === GAME_STATE.RESULTS && lobby.round) {
      trackRoundFinished({
        mode: modeFromPlayMode(lobby.playMode),
        round: lobby.round,
        lobbyCode,
        packId: lobby.currentRound?.packId,
      });
    }
  }, [lobby?.gameState, lobby?.round, lobby?.playMode, lobby?.currentRound?.packId, lobbyCode]);

  const catalog = useMemo(() => {
    const ids = Object.keys(packs);
    const preferred = Object.keys(PACK_META);
    const ordered = [
      ...preferred.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !preferred.includes(id)).sort(),
    ];
    return ordered;
  }, [packs]);

  const saved = Array.isArray(lobby?.enabledPacks) ? lobby!.enabledPacks! : null;
  const selectable = catalog.filter((id) => (packs[id] || []).length > 0);
  const enabled = saved ? selectable.filter((id) => saved.includes(id)) : selectable;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const players = lobby?.players || [];
  const timerSeconds = lobby?.timerSeconds ?? constants.defaultTimerSeconds;
  const secondsLeft = lobby?.currentRound
    ? Math.max(0, Math.ceil((lobby.currentRound.endsAt - now) / 1000))
    : 0;
  const myVote = userId ? lobby?.currentRound?.votes?.[userId] : undefined;
  const votedCount = Object.keys(lobby?.currentRound?.votes || {}).length;
  const results = tallyVotes(lobby?.currentRound?.votes, players);

  const hotseatVoterId = lobby?.currentRound?.hotseatVoterId;
  const hotseatVoter = players.find((p) => p.userId === hotseatVoterId);
  const showHotseatPass = local && lobby?.gameState === GAME_STATE.VOTING && !passReveal;

  const togglePack = (id: string) => {
    if (!isHost) {
      setError("Only the host can change packs.");
      return;
    }
    const current = enabledRef.current;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    enabledRef.current = next;
    if (local) {
      localSetPacks(next);
      return;
    }
    patchLobbyFields({ enabledPacks: next });
    void setEnabledPacks(lobbyCode, next).catch(() =>
      setError("Could not update packs — check Firestore rules on akxh-games.")
    );
  };

  const onTimerChange = (value: number) => {
    if (!isHost) return;
    if (local) {
      localSetTimer(value);
      return;
    }
    patchLobbyFields({ timerSeconds: value });
    void setTimerSeconds(lobbyCode, value).catch(() =>
      setError("Could not update timer — check Firestore rules on akxh-games.")
    );
  };

  const startBlockedReason =
    packsState !== "ready"
      ? "Loading packs…"
      : players.length < constants.minPlayers
        ? `Add ${constants.minPlayers - players.length} more player${
            constants.minPlayers - players.length === 1 ? "" : "s"
          } (${players.length}/${constants.minPlayers})`
        : enabled.length === 0
          ? "Select at least one pack"
          : "";

  const onStart = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const chosen = enabledRef.current;
    try {
      if (local) {
        const res = localStartGame(packsRef.current, chosen);
        if (!res.ok) setError(res.error || "Could not start");
        else {
          setPassReveal(false);
          trackGameStarted({
            mode: "pass_and_play",
            playerCount: res.playerCount || players.length,
            lobbyCode,
            packs: chosen,
          });
        }
      } else {
        const res = await startGame(lobbyCode, packsRef.current, chosen);
        if (!res.ok) setError(res.error || "Could not start");
        else {
          trackGameStarted({
            mode: "online",
            playerCount: players.length,
            lobbyCode,
            packs: chosen,
          });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const onVote = async (targetId: string) => {
    if (!lobby?.currentRound) return;
    if (local) {
      if (!hotseatVoterId) return;
      const res = localCastVote(hotseatVoterId, targetId);
      if (res.ok) {
        trackVoteCast("pass_and_play");
        setPassReveal(false);
      }
      return;
    }
    if (!userId) return;
    try {
      await castVote(lobbyCode, userId, targetId);
      trackVoteCast("online");
    } catch (e: any) {
      setError(e?.message || "Vote failed");
    }
  };

  const onNext = async () => {
    setBusy(true);
    setError("");
    try {
      if (local) {
        const res = localNextRound(packsRef.current);
        if (!res.ok) setError(res.error || "No more questions");
        else setPassReveal(false);
      } else {
        const res = await hostNextRound(lobbyCode, packsRef.current);
        if (!res.ok) setError(res.error || "Could not advance");
      }
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    markLeftLobby();
    if (local || isLocalHotseatCode(lobbyCode)) {
      clearLocalLobby();
      clearClientLobbyMembership();
      router.replace("/");
      return;
    }
    if (userId) await leaveLobby(lobbyCode, userId);
    else clearClientLobbyMembership();
    router.replace("/");
  };

  if (!local && !lobby?.lobbyFetched) {
    return (
      <main className="flex flex-1 items-center justify-center text-[var(--wz-muted)]">
        Connecting to lobby…
      </main>
    );
  }

  if (!lobby || lobby.missing) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-lg">Lobby not found or couldn’t connect.</p>
        <p className="text-sm text-[var(--wz-muted)] max-w-sm">
          If this is an online lobby, publish whozzit Firestore rules on akxh-games (no Auth).
          Pass &amp; play does not need that.
        </p>
        <button type="button" className="wz-btn" onClick={() => router.push("/")}>
          Home
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col animate-riseIn gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="wz-brand text-3xl leading-none">Who zzit?</p>
          <p className="mt-1 text-sm text-[var(--wz-muted)]">
            {local ? "Pass & play" : "Online"} · code{" "}
            <span className="tracking-[0.25em] text-[var(--wz-text)] font-semibold">
              {lobbyCode}
            </span>
          </p>
        </div>
        <button type="button" className="wz-btn-ghost py-2 px-3 text-sm" onClick={onLeave}>
          Leave
        </button>
      </header>

      {!local && (
        <div className="flex justify-start">
          <NameEditor name={playerName} compact />
        </div>
      )}

      {lobby.gameState === GAME_STATE.LOBBY && (
        <section className="space-y-5">
          <div className="wz-panel rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl">Players</h2>
              <span className="text-sm text-[var(--wz-muted)]">
                {players.length}/{constants.maxPlayers}
              </span>
            </div>
            <ul className="space-y-2">
              {players.map((p) => (
                <li
                  key={p.userId}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2"
                >
                  <span>
                    {p.name}
                    {(p.isHost || p.userId === lobby.hostId) && (
                      <span className="ml-2 text-xs text-[var(--wz-accent-2)]">host</span>
                    )}
                  </span>
                  {local && isHost && p.userId !== lobby.hostId && (
                    <button
                      type="button"
                      className="text-xs text-[var(--wz-muted)]"
                      onClick={() => localRemovePlayer(p.userId)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {local && (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const res = localAddPlayer(hotseatName);
                  if (!res.ok) setError(res.message || "Could not add");
                  else {
                    setHotseatName("");
                    setError("");
                  }
                }}
              >
                <input
                  className="wz-input py-2"
                  value={hotseatName}
                  onChange={(e) => setHotseatName(e.target.value.slice(0, 24))}
                  placeholder="Add player"
                  maxLength={24}
                />
                <button type="submit" className="wz-btn py-2 px-3 text-sm shrink-0">
                  Add
                </button>
              </form>
            )}
            <p className="mt-3 text-xs text-[var(--wz-muted)]">
              Need {constants.minPlayers}+ players to start.
            </p>
          </div>

          <div className="wz-panel rounded-2xl p-4 space-y-3">
            <h2 className="font-display text-xl">Question packs</h2>
            <p className="text-sm text-[var(--wz-muted)]">
              All packs listed — host can deselect any (including Adult 18+).
            </p>
            {packsState === "loading" && (
              <p className="text-sm text-[var(--wz-muted)]">Loading packs…</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {catalog.map((id) => {
                const on = enabled.includes(id);
                const meta = PACK_META[id];
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!isHost}
                    onClick={() => togglePack(id)}
                    className={`wz-chip ${on ? "wz-chip-on" : ""}`}
                  >
                    <div className="font-semibold">
                      {meta?.label || formatPackLabel(id)}
                      {meta?.nsfw ? " · 18+" : ""}
                    </div>
                    <div className="text-xs text-[var(--wz-muted)] mt-0.5">
                      {(packs[id] || []).length} prompts
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="wz-panel rounded-2xl p-4 space-y-3">
            <h2 className="font-display text-xl">Round timer</h2>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={constants.minTimerSeconds}
                max={constants.maxTimerSeconds}
                step={5}
                value={timerSeconds}
                disabled={!isHost}
                onChange={(e) => onTimerChange(Number(e.target.value))}
                className="flex-1 accent-[var(--wz-accent)]"
              />
              <span className="tabular-nums font-semibold w-12 text-right">{timerSeconds}s</span>
            </div>
          </div>

          {isHost ? (
            <div className="space-y-2">
              <button
                type="button"
                className="wz-btn w-full"
                disabled={busy || !!startBlockedReason}
                onClick={onStart}
              >
                {busy ? "Starting…" : "Start"}
              </button>
              {startBlockedReason && (
                <p className="text-center text-sm text-[var(--wz-muted)]">{startBlockedReason}</p>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-[var(--wz-muted)]">Waiting for host…</p>
          )}
        </section>
      )}

      {lobby.gameState === GAME_STATE.VOTING && lobby.currentRound && (
        <section className="space-y-4 flex-1 flex flex-col">
          {showHotseatPass ? (
            <div className="wz-panel rounded-2xl p-6 flex-1 flex flex-col items-center justify-center text-center gap-4 animate-scaleIn">
              <p className="text-sm uppercase tracking-[0.25em] text-[var(--wz-muted)]">
                Pass the phone
              </p>
              <h2 className="font-display text-3xl">
                {hotseatVoter?.name || "Next player"}
              </h2>
              <p className="text-[var(--wz-muted)]">Vote privately, then hand it on.</p>
              <button type="button" className="wz-btn w-full max-w-xs" onClick={() => setPassReveal(true)}>
                I&apos;m {hotseatVoter?.name || "ready"}
              </button>
            </div>
          ) : (
            <>
              <div className="wz-panel rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between text-sm text-[var(--wz-muted)]">
                  <span>Round {lobby.round}</span>
                  <span className="tabular-nums text-[var(--wz-accent-2)] font-semibold text-lg">
                    {local ? `${votedCount}/${players.length}` : `${secondsLeft}s`}
                  </span>
                </div>
                <h2 className="font-display text-2xl leading-snug">
                  {lobby.currentRound.question}
                </h2>
                {!local && (
                  <p className="text-sm text-[var(--wz-muted)]">
                    {votedCount}/{players.length} voted · change until lock
                  </p>
                )}
                {local && hotseatVoter && (
                  <p className="text-sm text-[var(--wz-mint)]">Voting as {hotseatVoter.name}</p>
                )}
              </div>

              <div className="space-y-2 flex-1">
                {players.map((p) => {
                  const selected = local
                    ? false
                    : myVote === p.userId;
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      className={`wz-vote ${selected ? "wz-vote-on" : ""}`}
                      onClick={() => onVote(p.userId)}
                    >
                      {p.name}
                      {p.userId === userId && !local ? " (you)" : ""}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {lobby.gameState === GAME_STATE.RESULTS && lobby.currentRound && (
        <section className="space-y-4 animate-scaleIn">
          <div className="wz-panel rounded-2xl p-5 space-y-2">
            <p className="text-sm text-[var(--wz-muted)]">Round {lobby.round} results</p>
            <h2 className="font-display text-2xl leading-snug">
              {lobby.currentRound.question}
            </h2>
          </div>

          <ol className="space-y-2">
            {results.length === 0 && (
              <li className="wz-panel rounded-2xl p-4 text-[var(--wz-muted)]">
                Nobody got a vote this round.
              </li>
            )}
            {results.map((r, i) => (
              <li
                key={r.userId}
                className="wz-panel rounded-2xl px-4 py-3 flex items-center justify-between"
              >
                <span className="font-semibold">
                  <span className="text-[var(--wz-muted)] mr-2">{i + 1}.</span>
                  {r.name}
                </span>
                <span className="tabular-nums text-[var(--wz-accent-2)] font-bold">
                  {r.votes}
                </span>
              </li>
            ))}
          </ol>

          {isHost ? (
            <div className="flex flex-col gap-2">
              <button type="button" className="wz-btn w-full" disabled={busy} onClick={onNext}>
                Next question
              </button>
              <button
                type="button"
                className="wz-btn-ghost w-full"
                onClick={() => {
                  if (local) localReturnToLobby();
                  else void returnToLobby(lobbyCode);
                }}
              >
                Back to lobby
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-[var(--wz-muted)]">
              Waiting for host to continue…
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="text-center text-sm text-[var(--wz-accent)]" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
