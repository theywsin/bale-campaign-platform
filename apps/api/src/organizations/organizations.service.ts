import { HttpStatus, Injectable } from "@nestjs/common";
import {
  canAssignOrganizationRole,
  canRemoveOrganizationMember,
  ORGANIZATION_ROLE_RANK,
  type InvitationInfo,
  type InviteMemberInput,
  type MemberInfo,
  type OrganizationRole,
  type OrganizationSummary,
} from "@bcp/shared";
import { Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import { newOrganizationSlug } from "../auth/auth.service";
import { AppException } from "../common/errors";
import type { AuthUser, ClientInfo, OrgContext } from "../common/request-context";
import { generateToken, hashToken } from "../common/security/tokens";

const INVITATION_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_ORGS_PER_USER = 20;

/**
 * Every method that takes an OrgContext scopes its queries by
 * ctx.organizationId, which the OrgPermissionGuard derived from a verified
 * membership. IDs from the URL are never trusted on their own.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async create(user: AuthUser, name: string, client: ClientInfo): Promise<OrganizationSummary> {
    const owned = await this.prisma.client.organizationMember.count({ where: { userId: user.id } });
    if (owned >= MAX_ORGS_PER_USER) throw AppException.conflict(`حداکثر ${MAX_ORGS_PER_USER} فضای کاری برای هر کاربر مجاز است.`);
    return this.prisma.client.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name, slug: newOrganizationSlug(), createdById: user.id } });
      await tx.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "ORGANIZATION_OWNER" } });
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "org.created", actorUserId: user.id, organizationId: org.id, targetType: "organization", targetId: org.id, client });
      return { id: org.id, name: org.name, slug: org.slug, role: "ORGANIZATION_OWNER", createdAt: org.createdAt.toISOString() };
    });
  }

  async get(ctx: OrgContext): Promise<OrganizationSummary & { status: string; memberCount: number; pendingInvitations: number }> {
    const org = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        _count: { select: { members: true, invitations: { where: { status: "PENDING", expiresAt: { gt: new Date() } } } } },
      },
    });
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      role: ctx.role,
      createdAt: org.createdAt.toISOString(),
      memberCount: org._count.members,
      pendingInvitations: org._count.invitations,
    };
  }

  async rename(ctx: OrgContext, actor: AuthUser, name: string, client: ClientInfo) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { name } });
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "org.updated", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "organization", targetId: ctx.organizationId, client, metadata: { name } });
    });
    return this.get(ctx);
  }

  async listMembers(ctx: OrgContext): Promise<MemberInfo[]> {
    const rows = await this.prisma.client.organizationMember.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, fullName: true, email: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      userId: m.user.id,
      fullName: m.user.fullName,
      email: m.user.email,
      role: m.role as OrganizationRole,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  async updateMemberRole(ctx: OrgContext, actor: AuthUser, memberId: string, role: OrganizationRole, client: ClientInfo) {
    await this.prisma.client.$transaction(async (tx) => {
      const member = await tx.organizationMember.findFirst({ where: { id: memberId, organizationId: ctx.organizationId } });
      if (!member) throw AppException.notFound("عضو یافت نشد.");
      if (member.userId === actor.id) throw AppException.forbidden("نمی‌توانید نقش خودتان را تغییر دهید.");
      if (!canAssignOrganizationRole(ctx.role, member.role as OrganizationRole, role)) throw AppException.forbidden();
      if (member.role === role) return;
      await tx.organizationMember.update({ where: { id: member.id }, data: { role } });
      await this.audit.recordTx(tx, {
        category: "ORGANIZATION",
        action: "org.member.role_changed",
        actorUserId: actor.id,
        organizationId: ctx.organizationId,
        targetType: "member",
        targetId: member.id,
        client,
        metadata: { from: member.role, to: role },
      });
    });
    return this.listMembers(ctx);
  }

  /** Removes a member, or lets a member leave. The last owner can never be removed. */
  async removeMember(ctx: OrgContext, actor: AuthUser, memberId: string, client: ClientInfo): Promise<void> {
    await this.prisma.client.$transaction(
      async (tx) => {
        const member = await tx.organizationMember.findFirst({ where: { id: memberId, organizationId: ctx.organizationId } });
        if (!member) throw AppException.notFound("عضو یافت نشد.");
        const leaving = member.userId === actor.id;
        if (!leaving && !canRemoveOrganizationMember(ctx.role, member.role as OrganizationRole)) throw AppException.forbidden();
        if (member.role === "ORGANIZATION_OWNER") {
          const owners = await tx.organizationMember.count({ where: { organizationId: ctx.organizationId, role: "ORGANIZATION_OWNER" } });
          if (owners <= 1) throw AppException.conflict("فضای کاری باید حداقل یک مالک داشته باشد. ابتدا مالک دیگری تعیین کنید.");
        }
        await tx.organizationMember.delete({ where: { id: member.id } });
        await this.audit.recordTx(tx, {
          category: "ORGANIZATION",
          action: leaving ? "org.member.left" : "org.member.removed",
          actorUserId: actor.id,
          organizationId: ctx.organizationId,
          targetType: "member",
          targetId: member.id,
          client,
          metadata: { userId: member.userId, role: member.role },
        });
      },
      // Serializable so two concurrent removals cannot both pass the last-owner check.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listInvitations(ctx: OrgContext): Promise<InvitationInfo[]> {
    const rows = await this.prisma.client.invitation.findMany({
      where: { organizationId: ctx.organizationId, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { fullName: true } } },
    });
    return rows.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role as OrganizationRole,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      invitedBy: i.invitedBy?.fullName ?? null,
    }));
  }

  async invite(ctx: OrgContext, actor: AuthUser, input: InviteMemberInput, client: ClientInfo): Promise<InvitationInfo> {
    if (ORGANIZATION_ROLE_RANK[input.role] > ORGANIZATION_ROLE_RANK[ctx.role] || (input.role === "ORGANIZATION_OWNER" && ctx.role !== "ORGANIZATION_OWNER")) {
      throw AppException.forbidden("نمی‌توانید نقشی بالاتر از نقش خود اعطا کنید.");
    }
    const existingMember = await this.prisma.client.organizationMember.findFirst({
      where: { organizationId: ctx.organizationId, user: { email: input.email } },
      select: { id: true },
    });
    if (existingMember) throw AppException.conflict("این کاربر از قبل عضو فضای کاری است.");

    const token = generateToken();
    const org = await this.prisma.client.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } });
    let invitation;
    try {
      invitation = await this.prisma.client.$transaction(async (tx) => {
        // Expired pending invitations would otherwise block the partial unique index.
        await tx.invitation.updateMany({
          where: { organizationId: ctx.organizationId, email: input.email, status: "PENDING", expiresAt: { lte: new Date() } },
          data: { status: "REVOKED" },
        });
        const created = await tx.invitation.create({
          data: {
            organizationId: ctx.organizationId,
            email: input.email,
            role: input.role,
            tokenHash: hashToken(token),
            invitedById: actor.id,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          },
        });
        await this.audit.recordTx(tx, {
          category: "ORGANIZATION",
          action: "org.invitation.created",
          actorUserId: actor.id,
          organizationId: ctx.organizationId,
          targetType: "invitation",
          targetId: created.id,
          client,
          metadata: { email: input.email, role: input.role },
        });
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw AppException.conflict("برای این ایمیل یک دعوت‌نامه فعال وجود دارد.");
      }
      throw err;
    }
    await this.mail.sendInvitation(input.email, org.name, actor.fullName, token);
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as OrganizationRole,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      invitedBy: actor.fullName,
    };
  }

  async revokeInvitation(ctx: OrgContext, actor: AuthUser, invitationId: string, client: ClientInfo): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.invitation.updateMany({
        where: { id: invitationId, organizationId: ctx.organizationId, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      if (result.count === 0) throw AppException.notFound("دعوت‌نامه یافت نشد.");
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "org.invitation.revoked", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "invitation", targetId: invitationId, client });
    });
  }

  /** The signed-in user's e-mail must match the invited address. */
  async acceptInvitation(actor: AuthUser, token: string, client: ClientInfo): Promise<OrganizationSummary> {
    return this.prisma.client.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { organization: { select: { id: true, name: true, slug: true, status: true, createdAt: true } } },
      });
      const invalid = new AppException(HttpStatus.BAD_REQUEST, "TOKEN_INVALID", "دعوت‌نامه نامعتبر، لغوشده یا منقضی است.");
      if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date() || invitation.organization.status !== "ACTIVE") {
        throw invalid;
      }
      if (invitation.email !== actor.email) {
        throw AppException.forbidden("این دعوت‌نامه برای ایمیل دیگری صادر شده است. با همان ایمیل وارد شوید.");
      }
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw invalid;
      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: actor.id } },
      });
      const role = (existing?.role ?? invitation.role) as OrganizationRole;
      if (!existing) {
        await tx.organizationMember.create({ data: { organizationId: invitation.organizationId, userId: actor.id, role: invitation.role } });
      }
      await this.audit.recordTx(tx, {
        category: "ORGANIZATION",
        action: "org.invitation.accepted",
        actorUserId: actor.id,
        organizationId: invitation.organizationId,
        targetType: "invitation",
        targetId: invitation.id,
        client,
      });
      const org = invitation.organization;
      return { id: org.id, name: org.name, slug: org.slug, role, createdAt: org.createdAt.toISOString() };
    });
  }

  async recentActivity(ctx: OrgContext, limit = 10) {
    const rows = await this.prisma.client.auditLog.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, action: true, createdAt: true, actorUserId: true, targetType: true },
    });
    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => v !== null))];
    const actors = await this.prisma.client.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } });
    const names = new Map(actors.map((a) => [a.id, a.fullName]));
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
      actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
    }));
  }
}
