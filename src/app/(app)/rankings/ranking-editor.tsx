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
import { type Placement, answer, compareIndex, startPlacement } from "@/lib/ranking";

type Game = { id: number; name: string; thumbnail: string | null; image: string | null; plays: number };

/**
 * Your ranking of every game you've played with the group. New games are placed
 * with a few "which would you rather play?" questions (a binary search through the
 * list); drag to fine-tune.
 */
export function RankingEditor({ tier, games, initial }: { tier: Tier; games: Game[]; initial: number[] }) {
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const [ids, setIds] = useState(() => initial.filter((id) => byId.has(id)));
  // Most-played first: the games you know best are the easiest to place
  const [queue, setQueue] = useState(() => games.filter((g) => !initial.includes(g.id)).map((g) => g.id));
  const [placement, setPlacement] = useState<Placement>(() => startPlacement(ids.length));
  const [saving, start] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commit = (next: number[]) => {
    setIds(next);
    start(() => saveRanking(tier, next));
  };

  const placing = queue.length ? byId.get(queue[0]) : undefined;
  const mid = compareIndex(placement);

  /** Moves the placement on; once its spot is found the game is inserted and the next one starts. */
  const step = (next: Placement) => {
    if (compareIndex(next) !== null || !placing) return setPlacement(next);
    const list = [...ids.slice(0, next.lo), placing.id, ...ids.slice(next.lo)];
    commit(list);
    setQueue(queue.slice(1));
    setPlacement(startPlacement(list.length));
  };

  // Starting from nothing: the first question is between two of your own games
  const seeding = ids.length === 0 && queue.length > 0;
  const rival = seeding ? byId.get(queue[1]) : mid !== null ? byId.get(ids[mid]) : undefined;
  const choose = (prefersNew: boolean | "same") => {
    if (!seeding) return step(answer(placement, prefersNew));
    const [a, b] = queue;
    const first = b === undefined ? [a] : prefersNew === false ? [b, a] : [a, b];
    commit(first);
    setQueue(queue.slice(first.length));
    setPlacement(startPlacement(first.length));
  };

  const skip = () => {
    setQueue([...queue.slice(1), queue[0]]);
    setPlacement(startPlacement(ids.length));
  };

  const remove = (id: number) => {
    commit(ids.filter((x) => x !== id));
    // Back in the queue, so it can be placed again
    if (byId.get(id)?.plays) setQueue([...queue, id]);
    setPlacement(startPlacement(ids.length - 1));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    commit(arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id))));
  };

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
          </div>
        </section>
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
