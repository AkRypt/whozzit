"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPackLabel } from "@/app/questions";

type Packs = Record<string, string[]>;

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [packs, setPacks] = useState<Packs>({});
  const [selected, setSelected] = useState("");
  const [draftWords, setDraftWords] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [packsLoading, setPacksLoading] = useState(false);

  const categories = useMemo(() => Object.keys(packs).sort(), [packs]);

  const applyPacks = useCallback((next: Packs) => {
    setPacks(next);
    const keys = Object.keys(next).sort();
    setSelected((prev) => {
      if (prev && next[prev]) return prev;
      return keys[0] || "";
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      try {
        const { data } = await fetchJson("/api/admin/session", undefined, 8000);
        if (cancelled) return;
        setConfigured(data?.configured !== false);
        if (!data?.authenticated) {
          setAuthed(false);
          return;
        }
        setAuthed(true);
        setPacksLoading(true);
        const { res, data: packData } = await fetchJson("/api/admin/words");
        if (cancelled) return;
        if (res.status === 401) {
          setAuthed(false);
          return;
        }
        if (!res.ok || !packData?.ok) {
          setError(packData?.error || `Failed to load packs (${res.status})`);
          return;
        }
        applyPacks(packData.packs || {});
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.name === "AbortError"
              ? "Timed out reaching admin API."
              : e?.message || "Could not reach admin API"
          );
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
          setPacksLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPacks]);

  useEffect(() => {
    if (!selected) {
      setDraftWords("");
      return;
    }
    setDraftWords((packs[selected] || []).join("\n"));
  }, [selected, packs]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { res, data } = await fetchJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!data?.ok) {
        setError(data?.error || (res.status === 401 ? "Invalid password" : "Login failed"));
        return;
      }
      setAuthed(true);
      setPacksLoading(true);
      const loaded = await fetchJson("/api/admin/words");
      if (loaded.res.ok && loaded.data?.ok) applyPacks(loaded.data.packs || {});
      else setError(loaded.data?.error || "Logged in but failed to load packs");
    } finally {
      setBusy(false);
      setPacksLoading(false);
    }
  };

  const logout = async () => {
    await fetchJson("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setPacks({});
    setSelected("");
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setStatus("");
    setError("");
    try {
      const words = draftWords
        .split(/\r?\n/)
        .map((w) => w.trim())
        .filter(Boolean);
      const { res, data } = await fetchJson("/api/admin/words", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selected, words }),
      });
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Save failed");
        return;
      }
      setPacks((prev) => ({ ...prev, [selected]: words }));
      setStatus(`Saved ${selected} (${words.length})`);
    } finally {
      setBusy(false);
    }
  };

  const createPack = async () => {
    const category = newCategory
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!category) return;
    setBusy(true);
    setError("");
    try {
      const { res, data } = await fetchJson("/api/admin/words", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, words: [] }),
      });
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Create failed");
        return;
      }
      setPacks((prev) => ({ ...prev, [category]: [] }));
      setSelected(category);
      setNewCategory("");
      setStatus(`Created ${category}`);
    } finally {
      setBusy(false);
    }
  };

  const removePack = async () => {
    if (!selected || !confirm(`Delete pack “${selected}”?`)) return;
    setBusy(true);
    setError("");
    try {
      const { res, data } = await fetchJson(
        `/api/admin/words?category=${encodeURIComponent(selected)}`,
        { method: "DELETE" }
      );
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Delete failed");
        return;
      }
      setPacks((prev) => {
        const next = { ...prev };
        delete next[selected];
        return next;
      });
      setSelected("");
      setStatus(`Deleted ${selected}`);
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    if (!confirm("Seed fallback packs into Firestore (merge)?")) return;
    setBusy(true);
    setError("");
    try {
      const { res, data } = await fetchJson("/api/admin/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replace: false }),
      });
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Seed failed");
        return;
      }
      const loaded = await fetchJson("/api/admin/words");
      if (loaded.res.ok && loaded.data?.ok) applyPacks(loaded.data.packs || {});
      setStatus(`Seeded: ${(data.seeded || []).join(", ")}`);
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <main className="flex flex-1 items-center justify-center text-[var(--wz-muted)]">
        Loading…
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="flex flex-1 flex-col justify-center animate-riseIn max-w-md mx-auto w-full">
        <h1 className="wz-brand text-4xl mb-2">Who zzit? admin</h1>
        <p className="text-[var(--wz-muted)] mb-5 text-sm">
          Pack editor · Firestore source of truth
        </p>
        {!configured && (
          <p className="mb-4 text-sm text-[var(--wz-accent)]">
            ADMIN_PASSWORD is not set on the server.
          </p>
        )}
        <form onSubmit={login} className="wz-panel rounded-2xl p-5 space-y-3">
          <input
            type="password"
            className="wz-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
          />
          <button type="submit" className="wz-btn w-full" disabled={busy || !password}>
            Sign in
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-[var(--wz-accent)]">{error}</p>}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 animate-riseIn py-2">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="wz-brand text-3xl">Pack admin</h1>
          <p className="text-sm text-[var(--wz-muted)]">whozzit_words</p>
        </div>
        <button type="button" className="wz-btn-ghost py-2 px-3 text-sm" onClick={logout}>
          Log out
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="wz-btn-ghost py-2 px-3 text-sm" onClick={seed} disabled={busy}>
          Seed fallbacks
        </button>
        <button type="button" className="wz-btn-ghost py-2 px-3 text-sm" onClick={removePack} disabled={busy || !selected}>
          Delete pack
        </button>
      </div>

      <div className="wz-panel rounded-2xl p-4 flex flex-wrap gap-2">
        {packsLoading && <span className="text-sm text-[var(--wz-muted)]">Loading packs…</span>}
        {categories.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelected(id)}
            className={`wz-chip ${selected === id ? "wz-chip-on" : ""}`}
          >
            {formatPackLabel(id)} ({(packs[id] || []).length})
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="wz-input py-2"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="new_pack_id"
        />
        <button type="button" className="wz-btn py-2 px-3 text-sm shrink-0" onClick={createPack} disabled={busy}>
          Add
        </button>
      </div>

      {selected && (
        <div className="wz-panel rounded-2xl p-4 space-y-3 flex-1 flex flex-col">
          <h2 className="font-display text-xl">{formatPackLabel(selected)}</h2>
          <textarea
            className="wz-input min-h-[280px] flex-1 font-mono text-sm"
            value={draftWords}
            onChange={(e) => setDraftWords(e.target.value)}
            placeholder="One question per line"
          />
          <button type="button" className="wz-btn w-full" onClick={save} disabled={busy}>
            Save pack
          </button>
        </div>
      )}

      {status && <p className="text-sm text-[var(--wz-mint)]">{status}</p>}
      {error && <p className="text-sm text-[var(--wz-accent)]">{error}</p>}
    </main>
  );
}
