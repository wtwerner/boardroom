"use client";

import { createContext, use, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { type EditingPlay, LogPlayForm } from "./log-play-form";

type Target = EditingPlay & { name: string };

const OpenEditor = createContext<((play: Target) => void) | null>(null);

/**
 * One edit dialog for the whole Plays page, so the game and player lists are sent
 * once rather than with every play.
 */
export function PlayEditorProvider({
  games,
  players,
  canPost,
  nightNames,
  children,
}: Omit<React.ComponentProps<typeof LogPlayForm>, "editing" | "onDone"> & { children: React.ReactNode }) {
  const [editing, setEditing] = useState<Target | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (editing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);

  return (
    <OpenEditor value={setEditing}>
      {children}
      <dialog
        ref={dialog}
        onClose={() => setEditing(null)}
        aria-labelledby="edit-play-title"
        className="m-auto w-[min(42rem,calc(100%-2rem))] rounded-xl border border-ink/70 bg-card p-5 text-ink shadow-token backdrop:bg-ink/40"
      >
        {editing && (
          <>
            <h2 id="edit-play-title" className="font-wide mb-4 text-lg">
              Edit {editing.name}
            </h2>
            <LogPlayForm key={editing.playId} games={games} players={players} canPost={canPost} nightNames={nightNames} editing={editing} onDone={() => setEditing(null)} />
          </>
        )}
      </dialog>
    </OpenEditor>
  );
}

export function EditPlayButton({ play }: { play: Target }) {
  const open = use(OpenEditor);
  return (
    <button
      type="button"
      aria-label={`Edit this play of ${play.name}`}
      onClick={() => open?.(play)}
      className="rounded-md p-1.5 text-slate hover:text-ink pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
    >
      <Pencil className="size-4" />
    </button>
  );
}
