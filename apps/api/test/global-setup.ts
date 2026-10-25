import { execSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import Redis from "ioredis";
import { testEnvSource } from "./env";

/** Creates the test database if needed, applies migrations and clears the test Redis DB. */
export default async function globalSetup(): Promise<void> {
  const env = testEnvSource();
  const url = new URL(env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`);
  await client.end();

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../../.."),
    env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
    stdio: "ignore",
  });

  const redis = new Redis(env.REDIS_URL!);
  await redis.flushdb();
  redis.disconnect();
}
