import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { z } from "zod";
import * as schema from "./schema";

const databaseUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "Expected a PostgreSQL connection string.",
  );

function getDatabaseUrl() {
  const result = databaseUrlSchema.safeParse(process.env.DATABASE_URL);
  if (!result.success) {
    throw new Error("DATABASE_URL must be set to a valid PostgreSQL connection string.");
  }
  return result.data;
}

const sql = neon(getDatabaseUrl());

export const db = drizzle({ client: sql, schema });
