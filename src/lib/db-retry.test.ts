import type { Client, InStatement } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { isConnectionError, retryReads } from "./db-retry";

function dropped() {
  const socket = Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" });
  return new Error("Failed query", { cause: new TypeError("fetch failed", { cause: socket }) });
}

function fakeClient(results: (Error | "ok")[]) {
  const execute = vi.fn<(stmt: InStatement) => Promise<{ rows: never[] }>>(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    return { rows: [] };
  });
  return { client: { execute, close: vi.fn() } as unknown as Client, execute };
}

describe("isConnectionError", () => {
  it("finds a dropped connection anywhere in the causes", () => {
    expect(isConnectionError(dropped())).toBe(true);
  });

  it("ignores SQL errors", () => {
    expect(isConnectionError(new Error("SQLITE_CONSTRAINT"))).toBe(false);
  });
});

describe("retryReads", () => {
  it("sends a read again after a dropped connection", async () => {
    const { client, execute } = fakeClient([dropped(), "ok"]);
    await expect(retryReads(client, 0).execute({ sql: "select 1", args: [] })).resolves.toEqual({ rows: [] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("gives up after three tries", async () => {
    const { client, execute } = fakeClient([dropped(), dropped(), dropped(), "ok"]);
    await expect(retryReads(client, 0).execute("select 1")).rejects.toThrow("Failed query");
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("doesn't send a write twice", async () => {
    const { client, execute } = fakeClient([dropped(), "ok"]);
    await expect(retryReads(client, 0).execute({ sql: "insert into vote values (?)", args: [1] })).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry SQL errors", async () => {
    const { client, execute } = fakeClient([new Error("no such table"), "ok"]);
    await expect(retryReads(client, 0).execute("select 1")).rejects.toThrow("no such table");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("leaves the rest of the client alone", () => {
    const { client } = fakeClient([]);
    retryReads(client, 0).close();
    expect(client.close).toHaveBeenCalled();
  });
});
