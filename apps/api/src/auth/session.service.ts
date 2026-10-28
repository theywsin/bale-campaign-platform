import { Inject, Injectable } from "@nestjs/common";
import type { PlatformRole } from "@bcp/shared";
import { API_ENV, ApiEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser, ClientInfo } from "../common/request-context";
import { generateToken, hashToken } from "../common/security/tokens";

/** lastSeenAt is refreshed at most this often, to avoid a write per request. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly prisma: PrismaService,
  ) {}

  async create(userId: string, client: ClientInfo): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3600 * 1000);
    const session = await this.prisma.client.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt, ipAddress: client.ipAddress, userAgent: client.userAgent },
      select: { id: true },
    });
    return { token, expiresAt, sessionId: session.id };
  }

  /** Resolves a session token to an active user, or null when invalid, expired, idle or suspended. */
  async validate(token: string): Promise<{ user: AuthUser; sessionId: string } | null> {
    if (!token || token.length > 100) return null;
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt) return null;
    const now = Date.now();
    const idleLimit = this.env.SESSION_IDLE_TIMEOUT_HOURS * 3600 * 1000;
    if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + idleLimit <= now) return null;
    // Sessions created before a password change are no longer valid.
    if (session.createdAt.getTime() < session.user.passwordChangedAt.getTime()) return null;
    if (session.user.status !== "ACTIVE") return null;

    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.client.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
    }

    const u = session.user;
    return {
      sessionId: session.id,
      user: {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        platformRole: (u.platformRole as PlatformRole | null) ?? null,
        emailVerified: u.emailVerifiedAt !== null,
        mfaEnabled: u.totpEnabledAt !== null,
        createdAt: u.createdAt,
      },
    };
  }

  async revoke(sessionId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.client.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAllExcept(userId: string, keepSessionId: string | null): Promise<number> {
    const result = await this.prisma.client.session.updateMany({
      where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async listActive(userId: string) {
    const now = new Date();
    const idleCutoff = new Date(now.getTime() - this.env.SESSION_IDLE_TIMEOUT_HOURS * 3600 * 1000);
    return this.prisma.client.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now }, lastSeenAt: { gt: idleCutoff } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    });
  }
}
