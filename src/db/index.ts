import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { retryReads } from "@/lib/db-retry";
import * as schema from "./schema";

const client = retryReads(
  createClient({
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  }),
);

export const db = drizzle(client, { schema, casing: "snake_case" });
export { schema };
