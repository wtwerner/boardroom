import type { Client, InStatement } from "@libsql/client";

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 200;

/**
 * Turso sometimes drops a connection mid-request ("fetch failed", "other side closed"),
 * which shows up as a page that couldn't load. A read that fails this way is safe to
 * send again. Writes aren't retried: the database may have applied one before the
 * connection dropped, and sending it again could apply it twice.
 */
export function isConnectionError(error: unknown) {
  for (let e = error; e; e = (e as { cause?: unknown }).cause) {
    if (e instanceof TypeError && e.message === "fetch failed") return true;
  }
  return false;
}

function isRead(stmt: InStatement) {
  const sql = typeof stmt === "string" ? stmt : stmt.sql;
  return /^\s*(select|with)\b/i.test(sql);
}

/** Retries `client.execute` reads that lost their connection. Transactions and batches pass through. */
export function retryReads(client: Client, delayMs = RETRY_DELAY_MS): Client {
  const execute = client.execute.bind(client) as (stmt: InStatement) => ReturnType<Client["execute"]>;
  const retrying = async (stmt: InStatement) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await execute(stmt);
      } catch (error) {
        if (attempt >= ATTEMPTS || !isRead(stmt) || !isConnectionError(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  };
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "execute") return retrying;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
