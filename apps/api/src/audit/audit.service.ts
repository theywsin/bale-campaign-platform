import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { AuditCategory, Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import type { ClientInfo } from "../common/request-context";

export interface AuditEntry {
  category: AuditCategory;
  action: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  targetType?: string;
  targetId?: string;
  client?: ClientInfo;
  /** Must never contain secrets (passwords, tokens, credentials). */
  metadata?: Prisma.InputJsonValue;
}

type Tx = Pick<PrismaService["client"], "auditLog">;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private data(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      category: entry.category,
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      organizationId: entry.organizationId ?? null,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ipAddress: entry.client?.ipAddress ?? null,
      userAgent: entry.client?.userAgent ?? null,
      metadata: entry.metadata,
    };
  }

  /** Writes inside the caller's transaction, so the audit row commits with the change. */
  async recordTx(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: this.data(entry) });
  }

  /** Best-effort write for events without an accompanying change (e.g. failed logins). */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({ data: this.data(entry) });
    } catch (err) {
      this.logger.error({ action: entry.action, err: err instanceof Error ? err.message : String(err) }, "audit write failed");
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
