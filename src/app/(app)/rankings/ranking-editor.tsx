"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import clsx from "clsx";
import { saveRanking } from "@/app/actions";
import { GameCover, buttonClass } from "@/components/ui";
import type { Tier } from "@/db/enums";
import { CLEAR_BGG_GAP, type Placement, type Placing, answer, compareIndex, settleClearCalls, startPlacement } from "@/lib/ranking";

type Game = { id: number; name: string; thumbnail: string | null; image: string | null; plays: number; bggRating: number | null };

/**
 * Your ranking of every game you've played with the group. New games are placed
 * with a few "which would you rather play?" questions (a binary search through the
 * list); drag to fine-tune. Your own BGG ratings can answer the clear calls, once you say so.
 */
export function RankingEditor({ tier, games, initial }: { tier: Tier; games: Game[]; initial: number[] }) {
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const [{ ids, queue, placement }, setPlacing] = useState<Placing>(() => {
    const ids = initial.filter((id) => byId.has(id));
    // Most-played first: the games you know best are the easiest to place
    return { ids, queue: games.filter((g) => !initial.includes(g.id)).map((g) => g.id), placement: startPlacement(ids.length) };
  });
  const [useBgg, setUseBgg] = useState(false);
  const [settled, setSettled] = useState(0);
  const [saving, start] = useTransition();
  const rating = (id: number) => byId.get(id)?.bggRating;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = (list: number[]) => start(() => saveRanking(tier, list));

  /** Where things go next, after BGG ratings answer what they can (when on); the list is saved whenever it changes. */
  const advance = (next: Placing, bgg = useBgg) => {
    const s = bgg ? settleClearCalls(next, rating) : { ...next, answered: 0 };
    if (s.ids !== ids) save(s.ids);
    setPlacing({ ids: s.ids, queue: s.queue, placement: s.placement });
    if (s.answered) setSettled((n) => n + s.answered);
  };

  const placing = queue.length ? byId.get(queue[0]) : undefined;
  const mid = compareIndex(placement);

  /** Moves the placement on; once its spot is found the game is inserted and the next one starts. */
  const step = (next: Placement) => {
    if (compareIndex(next) !== null || !placing) return advance({ ids, queue, placement: next });
    const list = [...ids.slice(0, next.lo), placing.id, ...ids.slice(next.lo)];
    advance({ ids: list, queue: queue.slice(1), placement: startPlacement(list.length) });
  };

  // Starting from nothing: the first question is between two of your own games
  const seeding = ids.length === 0 && queue.length > 0;
  const rival = seeding ? byId.get(queue[1]) : mid !== null ? byId.get(ids[mid]) : undefined;
  const choose = (prefersNew: boolean | "same") => {
    if (!seeding) return step(answer(placement, prefersNew));
    const [a, b] = queue;
    const first = b === undefined ? [a] : prefersNew === false ? [b, a] : [a, b];
    advance({ ids: first, queue: queue.slice(first.length), placement: startPlacement(first.length) });
  };

  const skip = () => advance({ ids, queue: [...queue.slice(1), queue[0]], placement: startPlacement(ids.length) });

  // Not through advance: a game you just took out shouldn't be put straight back by its BGG rating
  const remove = (id: number) => {
    const list = ids.filter((x) => x !== id);
    save(list);
    // Back in the queue, so it can be placed again
    setPlacing({ ids: list, queue: byId.get(id)?.plays ? [...queue, id] : queue, placement: startPlacement(list.length) });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const list = arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
    save(list);
    setPlacing({ ids: list, queue, placement });
  };

  const turnOnBgg = () => {
    setUseBgg(true);
    advance({ ids, queue, placement }, true);
  };
  // Worth offering when a game waiting has a BGG rating, and the list or the queue has another to compare it with
  const bggCanHelp = !useBgg && queue.some((id) => rating(id) != null) && [...ids, ...queue].filter((id) => rating(id) != null).length >= 2;

  return (
    <div className="space-y-6">
      {placing && (seeding || mid !== null) && (
        <section aria-labelledby="place-title" className="rounded-xl border border-ink/70 bg-card p-4 shadow-token">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="place-title" className="font-wide text-base">Which would you rather play?</h3>
            <span className="tabular text-xs text-slate">{queue.length} to place</span>
          </div>
          <p className="mt-1 text-sm text-slate">
            {rival ? (
              <>
                Placing <strong className="font-semibold text-ink">{placing.name}</strong>. A few of these and it slots into your list.
              </>
            ) : (
              "Tap it to start your ranking."
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[placing, rival].filter((g) => g !== undefined).map((g, i) => (
              <button
                key={g.id}
                type="button"
                onClick={() => choose(i === 0)}
                className="group rounded-xl border border-line p-2 text-left transition-transform hover:border-ink/60 active:translate-y-0.5"
              >
                <GameCover src={g.thumbnail} image={g.image} name={g.name} size="fluid" sizes="(min-width: 1024px) 20vw, 45vw" />
                <span className="mt-2 line-clamp-2 block text-sm font-semibold group-hover:underline">{g.name}</span>
                <span className="block text-xs text-slate">{i === 0 || seeding ? `played ${g.plays}×` : `your #${mid! + 1}`}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => choose("same")} className={buttonClass("secondary", "px-3 py-1.5 text-xs")}>
              About the same
            </button>
            <button type="button" onClick={skip} className={buttonClass("ghost", "px-3 py-1.5 text-xs")}>
              Skip for now
            </button>
            {bggCanHelp && (
              <button type="button" onClick={turnOnBgg} className={buttonClass("ghost", "px-3 py-1.5 text-xs")}>
                Let my BGG ratings answer the clear ones
              </button>
            )}
          </div>
          {useBgg && (
            <p className="mt-3 text-xs text-slate">
              Games {CLEAR_BGG_GAP} or more points apart in your BGG ratings are placed without asking.{" "}
              <button type="button" onClick={() => setUseBgg(false)} className="text-accent underline-offset-4 hover:underline">
                Ask me every one
              </button>
            </p>
          )}
        </section>
      )}
      {settled > 0 && (
        <p className="text-xs text-slate" role="status">
          Your BGG ratings answered {settled === 1 ? "1 question" : `${settled} questions`}. Drag anything that landed wrong.
        </p>
      )}

      {ids.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-slate">
          Games you play with the group show up here to rank.
        </p>
      ) : (
        <DndContext id={`ranking-${tier}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="space-y-1.5" aria-label="Your ranking">
              {ids.map((id, i) => (
                <Fragment key={id}>
                  {i === 10 && (
                    <li aria-hidden className="flex items-center gap-2 py-1 text-xs text-slate">
                      <span className="h-px flex-1 bg-line" /> Your top 10 is above <span className="h-px flex-1 bg-line" />
                    </li>
                  )}
                  <RankedItem game={byId.get(id)!} position={i + 1} onRemove={() => remove(id)} />
                </Fragment>
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <p className="h-4 text-xs text-slate" role="status">{saving ? "Saving…" : ids.length ? "Saved" : ""}</p>
    </div>
  );
}

function RankedItem({ game, position, onRemove }: { game: Game; position: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: game.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "flex items-center gap-3 rounded-lg border bg-card py-1.5 pr-2 pl-1",
        isDragging ? "relative z-10 border-ink/80 shadow-token" : "border-line",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-slate active:cursor-grabbing"
        aria-label={`Move ${game.name}, currently #${position}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="font-display tabular w-7 text-right text-lg text-accent">{position}</span>
      <GameCover src={game.thumbnail} name={game.name} size="sm" />
      <span className="min-w-0 flex-1 truncate font-medium">{game.name}</span>
      <button type="button" onClick={onRemove} aria-label={`Take ${game.name} out of your ranking`} className="rounded p-1.5 text-slate hover:text-meeple-red">
        <X className="size-4" />
      </button>
    </li>
  );
}
