import { Injectable } from "@nestjs/common";
import type { MeResponse, OrganizationRole, PlatformRole } from "@bcp/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Builds the MeResponse; selects explicit columns so password hashes never leave the database layer. */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async forSession(sessionId: string): Promise<MeResponse> {
    const session = await this.prisma.client.session.findUniqueOrThrow({ where: { id: sessionId }, select: { userId: true } });
    return this.forUser(session.userId);
  }

  async forUser(userId: string): Promise<MeResponse> {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        emailVerifiedAt: true,
        platformRole: true,
        createdAt: true,
        memberships: {
          where: { organization: { status: { not: "ARCHIVED" } } },
          orderBy: { createdAt: "asc" },
          select: { role: true, organization: { select: { id: true, name: true, slug: true, createdAt: true } } },
        },
      },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerified: user.emailVerifiedAt !== null,
        platformRole: (user.platformRole as PlatformRole | null) ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role as OrganizationRole,
        createdAt: m.organization.createdAt.toISOString(),
      })),
    };
  }
}
