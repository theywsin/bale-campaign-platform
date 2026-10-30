import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantStore {
  /** Organization of the current request; queries run under row-level security for it. */
  orgId: string;
  /** True inside a transaction that already set the role and app.org_id. */
  inTx?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();
