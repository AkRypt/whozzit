"use client";

import { useEffect, useRef } from "react";

type Props = {
  index: number;
  value: string;
  onChange: (value: string) => void;
  onDelete: () => void;
  autoFocus?: boolean;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
};

/** Full-width wrapping question editor — never clips mid-sentence. */
export default function QuestionRow({
  index,
  value,
  onChange,
  onDelete,
  autoFocus,
  inputRef,
}: Props) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = (el: HTMLTextAreaElement | null) => {
    localRef.current = el;
    inputRef?.(el);
  };

  const grow = () => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 52)}px`;
  };

  useEffect(() => {
    grow();
  }, [value]);

  return (
    <li className="rounded-2xl border border-[var(--wz-border)] bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-[var(--wz-muted)] tabular-nums">
          Q{index + 1}
        </span>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-lg leading-none text-[var(--wz-muted)] transition hover:bg-white/5 hover:text-[var(--wz-accent)] active:scale-95"
          onClick={onDelete}
          aria-label={`Delete question ${index + 1}`}
          title="Delete"
        >
          ×
        </button>
      </div>
      <textarea
        ref={setRefs}
        className="wz-input min-h-[52px] resize-none overflow-hidden py-3 text-[16px] leading-snug"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onInput={grow}
        placeholder="Most likely to…"
        aria-label={`Question ${index + 1}`}
        rows={2}
        autoFocus={autoFocus}
      />
    </li>
  );
}
