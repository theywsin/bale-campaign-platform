import { Injectable } from "@nestjs/common";
import type { Paginated, TicketDetail, TicketSummary } from "@bcp/shared";
import type { Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/errors";
import type { AuthUser, ClientInfo, OrgContext } from "../common/request-context";

const summaryInclude = {
  createdBy: { select: { fullName: true } },
  organization: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} as const;
type SummaryRow = Prisma.SupportTicketGetPayload<{ include: typeof summaryInclude }>;

function toSummary(t: SummaryRow): TicketSummary {
  return {
    id: t.id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    lastMessageAt: t.lastMessageAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    createdBy: t.createdBy?.fullName ?? null,
    organization: t.organization,
    messageCount: t._count.messages,
  };
}

const MAX_OPEN_TICKETS_PER_ORG = 20;

/** Customer side is scoped by organization; staff side by platform permission (see controllers). */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async list(where: Prisma.SupportTicketWhereInput, q: { page: number; pageSize: number }): Promise<Paginated<TicketSummary>> {
    const [items, total] = await Promise.all([
      this.db.supportTicket.findMany({ where, include: summaryInclude, orderBy: { lastMessageAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.db.supportTicket.count({ where }),
    ]);
    return { items: items.map(toSummary), page: q.page, pageSize: q.pageSize, total };
  }

  /** Staff authors are shown as «پشتیبانی» to customers; staff see the real name. */
  async detail(where: Prisma.SupportTicketWhereInput, forStaff: boolean): Promise<TicketDetail> {
    const t = await this.db.supportTicket.findFirst({
      where,
      include: {
        ...summaryInclude,
        messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { fullName: true } } } },
      },
    });
    if (!t) throw AppException.notFound("تیکت یافت نشد.");
    return {
      ...toSummary(t),
      messages: t.messages.map((m) => ({
        id: m.id,
        body: m.body,
        fromStaff: m.fromStaff,
        authorName: m.fromStaff && !forStaff ? "پشتیبانی" : (m.author?.fullName ?? null),
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async create(ctx: OrgContext, actor: AuthUser, input: { subject: string; category: TicketSummary["category"]; priority: TicketSummary["priority"]; body: string }, client: ClientInfo) {
    const open = await this.db.supportTicket.count({ where: { organizationId: ctx.organizationId, status: { not: "CLOSED" } } });
    if (open >= MAX_OPEN_TICKETS_PER_ORG) throw AppException.conflict(`حداکثر ${MAX_OPEN_TICKETS_PER_ORG} تیکت باز مجاز است؛ تیکت‌های حل‌شده را ببندید.`);
    const id = await this.db.$transaction(async (tx) => {
      const t = await tx.supportTicket.create({
        data: {
          organizationId: ctx.organizationId,
          createdById: actor.id,
          subject: input.subject,
          category: input.category,
          priority: input.priority,
          messages: { create: { authorId: actor.id, fromStaff: false, body: input.body } },
        },
      });
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "ticket.created", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "ticket", targetId: t.id, client });
      return t.id;
    });
    return this.detail({ id }, false);
  }

  /** A reply reopens a closed ticket; the status shows whose turn it is. */
  async reply(ticketWhere: Prisma.SupportTicketWhereInput, actor: AuthUser, body: string, fromStaff: boolean, client: ClientInfo) {
    const t = await this.db.supportTicket.findFirst({ where: ticketWhere, select: { id: true, organizationId: true } });
    if (!t) throw AppException.notFound("تیکت یافت نشد.");
    await this.db.$transaction(async (tx) => {
      await tx.supportTicketMessage.create({ data: { ticketId: t.id, authorId: actor.id, fromStaff, body } });
      await tx.supportTicket.update({
        where: { id: t.id },
        data: { lastMessageAt: new Date(), status: fromStaff ? "ANSWERED" : "OPEN", closedAt: null },
      });
      await this.audit.recordTx(tx, {
        category: fromStaff ? "ADMIN" : "ORGANIZATION",
        action: fromStaff ? "admin.ticket.replied" : "ticket.replied",
        actorUserId: actor.id,
        organizationId: t.organizationId,
        targetType: "ticket",
        targetId: t.id,
        client,
      });
    });
    return this.detail({ id: t.id }, fromStaff);
  }

  async update(ticketWhere: Prisma.SupportTicketWhereInput, actor: AuthUser, data: { status?: TicketSummary["status"]; priority?: TicketSummary["priority"] }, fromStaff: boolean, client: ClientInfo) {
    const t = await this.db.supportTicket.findFirst({ where: ticketWhere, select: { id: true, organizationId: true, status: true } });
    if (!t) throw AppException.notFound("تیکت یافت نشد.");
    await this.db.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: t.id },
        data: { ...data, ...(data.status ? { closedAt: data.status === "CLOSED" ? new Date() : null } : {}) },
      });
      await this.audit.recordTx(tx, {
        category: fromStaff ? "ADMIN" : "ORGANIZATION",
        action: fromStaff ? "admin.ticket.updated" : "ticket.closed",
        actorUserId: actor.id,
        organizationId: t.organizationId,
        targetType: "ticket",
        targetId: t.id,
        client,
        metadata: { from: t.status, ...data },
      });
    });
    return this.detail({ id: t.id }, fromStaff);
  }
}
