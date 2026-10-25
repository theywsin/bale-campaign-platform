import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export * from "../generated/prisma/client";

export interface CreatePrismaClientOptions {
  databaseUrl: string;
  /** Maximum connections in this process's pool. */
  poolMax?: number;
  log?: ("query" | "info" | "warn" | "error")[];
}

/**
 * Creates a PrismaClient backed by the node-postgres driver adapter.
 * Each process should create exactly one client and reuse it.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.databaseUrl,
    max: options.poolMax ?? 10,
  });
  return new PrismaClient({ adapter, log: options.log ?? ["warn", "error"] });
}
