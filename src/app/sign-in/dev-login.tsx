import { connection } from "next/server";
import { db, schema } from "@/db";
import { buttonClass, Meeple } from "@/components/ui";
import { DEMO_PEOPLE } from "@/lib/demo";
import { isDevLoginEnabled } from "@/lib/dev-login";

/** Local development only — see src/lib/dev-login.ts. */
export async function DevLogin() {
  if (!isDevLoginEnabled()) return null;
  await connection();
  const users = await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).orderBy(schema.user.name);

  return (
    <div className="mt-8 rounded-xl border border-dashed border-felt-ink/40 p-4 text-left">
      <p className="text-sm font-semibold">Local development</p>
      {users.length === 0 ? (
        <p className="mt-1 text-sm text-felt-ink/75">
          No users yet. Run <code className="rounded bg-black/20 px-1">pnpm seed:dev</code> to create some.
        </p>
      ) : (
        <form action="/api/dev-login" method="post" className="mt-2 flex flex-wrap gap-2">
          {users.map((u) => (
            <button
              key={u.id}
              name="userId"
              value={u.id}
              className="rounded-lg border border-felt-ink/40 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Sign in as {u.name}
            </button>
          ))}
        </form>
      )}
    </div>
  );
}

/** A demo's sign-in, in place of Discord's: one tap to be one of the made-up members */
export function DemoLogin() {
  return (
    <>
      <p className="text-sm">It&apos;s a demo with a made-up group. Pick who you want to be:</p>
      <form action="/api/dev-login" method="post" className="mt-4 grid grid-cols-2 gap-2">
        {DEMO_PEOPLE.map((p) => (
          <button key={p.id} name="userId" value={p.id} className={buttonClass("secondary", "py-3 text-base")}>
            <Meeple color={p.color} className="size-5" />
            {p.name}
          </button>
        ))}
      </form>
      <p className="mt-6 text-xs text-felt-ink/60">A real group signs in with Discord. Change anything you like here: it all resets every night.</p>
    </>
  );
}
