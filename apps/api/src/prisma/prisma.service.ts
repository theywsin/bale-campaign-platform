import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, PrismaClient } from "@bcp/database";
import { API_ENV, ApiEnv } from "../config/env";

/**
 * Holds the single PrismaClient of this process. Services use `prisma.client`.
 * Composition instead of inheritance keeps the generated client's types intact.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = createPrismaClient({ databaseUrl: env.DATABASE_URL, poolMax: env.DATABASE_POOL_MAX });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
