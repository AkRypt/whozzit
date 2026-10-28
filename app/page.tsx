"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { constants, PLAY_MODE, WZ } from "./constants";
import { useUser } from "@/hooks";
import {
  createLobby,
  setDisplayName,
} from "@/utils/firebase/firebaseHelpers";
import { createLocalHotseat } from "@/utils/localLobby";
import { generateLobbyCode } from "@/utils";
import { trackLobbyCreated } from "@/utils/analytics";
import NameEditor from "./components/NameEditor";

export default function HomePage() {
  const router = useRouter();
  const { playerName, userId, userFetched, playerLobbyCode, booted } = useUser();
  const [nameDraft, setNameDraft] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsName, setNeedsName] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(WZ.playerName) : "";
    if (stored) setNameDraft(stored);
    else if (playerName) setNameDraft(playerName);
    setNeedsName(!(stored || playerName));
  }, [playerName]);

  useEffect(() => {
    if (!booted || !userFetched) return;
    if (playerLobbyCode) {
      router.replace(`/lobby/${playerLobbyCode}`);
    }
  }, [booted, userFetched, playerLobbyCode, router]);

  const ensureName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNeedsName(true);
      setError("Enter a display name first.");
      return null;
    }
    await setDisplayName(trimmed);
    setNeedsName(false);
    return trimmed;
  };

  const onSaveName = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    await ensureName();
  };

  const createOnline = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const name = await ensureName();
      if (!name || !userId) {
        if (!userId) setError("Firebase Auth isn’t ready — check env keys or use Pass & play.");
        return;
      }
      const lobbyCode = generateLobbyCode();
      const result = await createLobby(lobbyCode, userId, PLAY_MODE.ONLINE);
      if (!result.ok) {
        setError("Could not create lobby. Check Firebase Anonymous Auth + env.");
        return;
      }
      trackLobbyCreated("online");
      router.push(`/lobby/${lobbyCode}`);
    } catch {
      setError("Online lobby needs a valid Firebase project.");
    } finally {
      setBusy(false);
    }
  };

  const createPassPlay = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const name = await ensureName();
      if (!name) return;
      const lobby = createLocalHotseat(name);
      trackLobbyCreated("pass_and_play");
      router.push(`/lobby/${lobby.lobbyCode}`);
    } catch {
      setError("Could not start pass & play.");
    } finally {
      setBusy(false);
    }
  };

  const joinGame = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== constants.lobbyCodeLength) return;
    const name = await ensureName();
    if (!name) return;
    router.push(`/lobby/${trimmed}`);
  };

  return (
    <main className="flex flex-1 flex-col justify-center animate-riseIn">
      <header className="mb-8 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.35em] text-[var(--wz-muted)]">
          AkxH Games
        </p>
        <h1 className="wz-brand text-6xl sm:text-7xl leading-none">Who zzit?</h1>
        <p className="mt-4 text-[var(--wz-muted)] text-base max-w-sm mx-auto">
          Secret ballots. Shared timer. Who’s most likely — and who got roasted.
        </p>
      </header>

      {(needsName || !playerName) && (
        <form onSubmit={onSaveName} className="wz-panel mb-5 rounded-2xl p-4 space-y-3">
          <label className="block text-sm text-[var(--wz-muted)]">Your name</label>
          <input
            className="wz-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value.slice(0, 24))}
            placeholder="What should we call you?"
            maxLength={24}
            autoFocus
          />
          <button type="submit" className="wz-btn w-full">
            Continue
          </button>
        </form>
      )}

      {playerName && !needsName && (
        <div className="mb-5 flex justify-center">
          <NameEditor name={playerName} />
        </div>
      )}

      <section className="wz-panel rounded-2xl p-5 space-y-4">
        <p className="text-center text-xs uppercase tracking-[0.25em] text-[var(--wz-muted)]">
          Have a code?
        </p>
        <form onSubmit={joinGame} className="flex flex-col gap-3">
          <input
            className="wz-input text-center tracking-[0.35em] uppercase"
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, constants.lobbyCodeLength)
              )
            }
            placeholder="Enter code"
            maxLength={constants.lobbyCodeLength}
            inputMode="text"
          />
          <button
            type="submit"
            className="wz-btn w-full"
            disabled={code.length !== constants.lobbyCodeLength || busy}
          >
            Join game
          </button>
        </form>

        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-widest text-[var(--wz-muted)]">or host</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          className="wz-btn w-full"
          onClick={createPassPlay}
          disabled={busy}
        >
          {busy ? "Starting…" : "Pass & play"}
        </button>
        <button
          type="button"
          className="wz-btn-ghost w-full"
          onClick={createOnline}
          disabled={busy}
        >
          {busy ? "Creating…" : "Online lobby"}
        </button>
      </section>

      {error && (
        <p className="mt-4 text-center text-sm text-[var(--wz-accent)]" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
