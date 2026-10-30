import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, Prisma, PrismaClient } from "@bcp/database";
import { API_ENV, ApiEnv } from "../config/env";
import { tenantStorage } from "./tenant-context";

/** Runs the rest of the transaction as the restricted role, scoped to one organization (see the RLS migration). */
function scopeSql(orgId: string) {
  return Prisma.sql`SELECT set_config('role', 'bcp_app', true), set_config('app.org_id', ${orgId}, true)`;
}

/**
 * Wraps the client so that, inside an organization-scoped request (see TenantContextInterceptor),
 * every query runs in a transaction under row-level security. Outside one, queries run unchanged.
 */
function withRowLevelSecurity(base: PrismaClient): PrismaClient {
  const extended = base.$extends({
    query: {
      async $allOperations({ args, query }) {
        const store = tenantStorage.getStore();
        if (!store || store.inTx) return query(args);
        const [, result] = await base.$transaction([base.$queryRaw(scopeSql(store.orgId)), query(args)]);
        return result;
      },
    },
  }) as unknown as PrismaClient;

  // Interactive transactions set the scope once, then run their queries as they are.
  return new Proxy(extended, {
    get(target, prop, receiver) {
      if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
      return (arg: unknown, options?: unknown) => {
        const store = tenantStorage.getStore();
        if (!store || store.inTx) return (target.$transaction as (a: unknown, o?: unknown) => unknown)(arg, options);
        const inner = { ...store, inTx: true };
        if (typeof arg === "function") {
          return target.$transaction(
            (tx) =>
              tenantStorage.run(inner, async () => {
                await tx.$queryRaw(scopeSql(store.orgId));
                return (arg as (t: typeof tx) => Promise<unknown>)(tx);
              }),
            options as never,
          );
        }
        return tenantStorage.run(inner, async () => {
          const results = await target.$transaction([target.$queryRaw(scopeSql(store.orgId)), ...(arg as Prisma.PrismaPromise<unknown>[])], options as never);
          return results.slice(1);
        });
      };
    },
  });
}

/**
 * Holds the single PrismaClient of this process. Services use `prisma.client`.
 * Composition instead of inheritance keeps the generated client's types intact.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  /** The unwrapped client, for code that must see every organization (platform admin, background jobs). */
  readonly base: PrismaClient;
  readonly client: PrismaClient;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.base = createPrismaClient({ databaseUrl: env.DATABASE_URL, poolMax: env.DATABASE_POOL_MAX });
    this.client = withRowLevelSecurity(this.base);
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}
