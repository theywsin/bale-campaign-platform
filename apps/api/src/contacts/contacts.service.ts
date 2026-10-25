import { Injectable } from "@nestjs/common";
import type {
  ContactImportResult,
  ContactInfo,
  ContactListInfo,
  ContactListQuery,
  ImportRowError,
  Paginated,
  PaginationQuery,
  SuppressionInfo,
} from "@bcp/shared";
import { Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/errors";
import type { AuthUser, ClientInfo, OrgContext } from "../common/request-context";
import { MAX_IMPORT_ERRORS_STORED, parseContactsCsv, toCsv, type ParsedContactRow } from "./csv";

type ContactRow = Prisma.ContactGetPayload<object>;

export interface ContactData {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  baleChatId?: string | null;
  notes?: string | null;
  consent?: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";
}

export function toContactInfo(c: ContactRow): ContactInfo {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    baleChatId: c.baleChatId,
    notes: c.notes,
    consent: c.consent,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const MAX_CONTACTS_PER_ORG = 200_000;
const EXPORT_BATCH = 2000;

/** Translates unique-constraint violations on contacts into a user-facing conflict. */
function rethrowDuplicate(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = JSON.stringify(err.meta ?? {});
    throw AppException.conflict(
      target.includes("bale_chat_id") || target.includes("baleChatId")
        ? "مخاطبی با این شناسه چت بله وجود دارد."
        : "مخاطبی با این شماره موبایل وجود دارد.",
    );
  }
  throw err;
}

/** All queries are scoped by ctx.organizationId (see OrgPermissionGuard). */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // ---- contacts -----------------------------------------------------------

  async list(ctx: OrgContext, q: ContactListQuery): Promise<Paginated<ContactInfo>> {
    const where: Prisma.ContactWhereInput = { organizationId: ctx.organizationId, status: q.status };
    if (q.listId) where.lists = { some: { listId: q.listId } };
    if (q.q) {
      const term = q.q;
      where.OR = [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { phone: { contains: term.replace(/^0/, "") } },
        { baleChatId: { contains: term } },
      ];
    }
    const [items, total] = await Promise.all([
      this.db.contact.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.db.contact.count({ where }),
    ]);
    return { items: items.map(toContactInfo), page: q.page, pageSize: q.pageSize, total };
  }

  async get(ctx: OrgContext, id: string): Promise<ContactInfo & { lists: { id: string; name: string }[] }> {
    const c = await this.db.contact.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { lists: { select: { list: { select: { id: true, name: true } } } } },
    });
    if (!c) throw AppException.notFound("مخاطب یافت نشد.");
    return { ...toContactInfo(c), lists: c.lists.map((l) => l.list) };
  }

  async create(ctx: OrgContext, actor: AuthUser, data: ContactData, client: ClientInfo): Promise<ContactInfo> {
    const count = await this.db.contact.count({ where: { organizationId: ctx.organizationId } });
    if (count >= MAX_CONTACTS_PER_ORG) throw AppException.conflict("سقف تعداد مخاطبان این فضای کاری پر شده است.");
    try {
      return await this.db.$transaction(async (tx) => {
        const c = await tx.contact.create({
          data: {
            organizationId: ctx.organizationId,
            ...data,
            consentAt: data.consent && data.consent !== "UNKNOWN" ? new Date() : null,
          },
        });
        await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "contact.created", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "contact", targetId: c.id, client });
        return toContactInfo(c);
      });
    } catch (err) {
      rethrowDuplicate(err);
    }
  }

  async update(ctx: OrgContext, actor: AuthUser, id: string, data: ContactData, client: ClientInfo): Promise<ContactInfo> {
    const existing = await this.db.contact.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) throw AppException.notFound("مخاطب یافت نشد.");
    const phone = data.phone === undefined ? existing.phone : data.phone;
    const chat = data.baleChatId === undefined ? existing.baleChatId : data.baleChatId;
    if (!phone && !chat) throw AppException.validation("حداقل یکی از شماره موبایل یا شناسه چت بله لازم است.");
    const consentChanged = data.consent !== undefined && data.consent !== existing.consent;
    try {
      return await this.db.$transaction(async (tx) => {
        const c = await tx.contact.update({
          where: { id: existing.id },
          data: { ...data, ...(consentChanged ? { consentAt: new Date() } : {}) },
        });
        await this.audit.recordTx(tx, {
          category: "ORGANIZATION",
          action: "contact.updated",
          actorUserId: actor.id,
          organizationId: ctx.organizationId,
          targetType: "contact",
          targetId: c.id,
          client,
          metadata: consentChanged ? { consent: data.consent ?? null } : undefined,
        });
        return toContactInfo(c);
      });
    } catch (err) {
      rethrowDuplicate(err);
    }
  }

  async setArchived(ctx: OrgContext, actor: AuthUser, id: string, archived: boolean, client: ClientInfo): Promise<ContactInfo> {
    const existing = await this.db.contact.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!existing) throw AppException.notFound("مخاطب یافت نشد.");
    return this.db.$transaction(async (tx) => {
      const c = await tx.contact.update({
        where: { id: existing.id },
        data: archived ? { status: "ARCHIVED", archivedAt: new Date() } : { status: "ACTIVE", archivedAt: null },
      });
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: archived ? "contact.archived" : "contact.restored", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "contact", targetId: c.id, client });
      return toContactInfo(c);
    });
  }

  /** Permanent delete. Campaign reports keep only the anonymous recipient row (contact link is set to null). */
  async remove(ctx: OrgContext, actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // Messages not yet sent to this contact must not go out after deletion.
      await tx.campaignRecipient.updateMany({
        where: { contactId: id, organizationId: ctx.organizationId, status: "PENDING" },
        data: { status: "SUPPRESSED", lastErrorCode: "CONTACT_DELETED", lastErrorMessage: "مخاطب حذف شد." },
      });
      const { count } = await tx.contact.deleteMany({ where: { id, organizationId: ctx.organizationId } });
      if (count === 0) throw AppException.notFound("مخاطب یافت نشد.");
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "contact.deleted", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "contact", targetId: id, client });
    });
  }

  // ---- CSV ------------------------------------------------------------------

  async importCsv(
    ctx: OrgContext,
    actor: AuthUser,
    file: { originalname: string; buffer: Buffer },
    listId: string | undefined,
    client: ClientInfo,
  ): Promise<ContactImportResult> {
    if (listId) await this.requireList(ctx, listId);
    const { rows, errors, totalRows } = parseContactsCsv(file.buffer);
    const orgId = ctx.organizationId;

    const phones = rows.map((r) => r.phone).filter((v): v is string => !!v);
    const chats = rows.map((r) => r.baleChatId).filter((v): v is string => !!v);
    const existing = await this.db.contact.findMany({
      where: { organizationId: orgId, OR: [{ phone: { in: phones } }, { baleChatId: { in: chats } }] },
      select: { id: true, phone: true, baleChatId: true },
    });
    const byPhone = new Map(existing.filter((c) => c.phone).map((c) => [c.phone!, c]));
    const byChat = new Map(existing.filter((c) => c.baleChatId).map((c) => [c.baleChatId!, c]));

    const toCreate: ParsedContactRow[] = [];
    const toUpdate: { id: string; row: ParsedContactRow }[] = [];
    for (const r of rows) {
      const a = r.phone ? byPhone.get(r.phone) : undefined;
      const b = r.baleChatId ? byChat.get(r.baleChatId) : undefined;
      if (a && b && a.id !== b.id) {
        errors.push({ row: r.row, message: "شماره و شناسه چت به دو مخاطب متفاوت تعلق دارند." });
      } else if (a || b) {
        toUpdate.push({ id: (a ?? b)!.id, row: r });
      } else {
        toCreate.push(r);
      }
    }

    const count = await this.db.contact.count({ where: { organizationId: orgId } });
    if (count + toCreate.length > MAX_CONTACTS_PER_ORG) {
      throw AppException.conflict("با این فایل سقف تعداد مخاطبان فضای کاری پر می‌شود.");
    }

    const sortedErrors: ImportRowError[] = errors.sort((x, y) => x.row - y.row);
    const record = await this.db.$transaction(
      async (tx) => {
        const created = toCreate.length
          ? await tx.contact.createManyAndReturn({
              data: toCreate.map((r) => ({
                organizationId: orgId,
                firstName: r.firstName,
                lastName: r.lastName,
                phone: r.phone,
                baleChatId: r.baleChatId,
                notes: r.notes,
              })),
              select: { id: true },
            })
          : [];
        for (const u of toUpdate) {
          // Only fill in what the file provides; empty cells never erase data.
          const data: Prisma.ContactUpdateInput = {};
          for (const k of ["firstName", "lastName", "phone", "baleChatId", "notes"] as const) {
            if (u.row[k]) data[k] = u.row[k];
          }
          await tx.contact.update({ where: { id: u.id }, data });
        }
        if (listId) {
          const ids = [...created.map((c) => c.id), ...toUpdate.map((u) => u.id)];
          if (ids.length) {
            await tx.contactListMember.createMany({ data: ids.map((contactId) => ({ listId, contactId })), skipDuplicates: true });
          }
        }
        const imp = await tx.contactImport.create({
          data: {
            organizationId: orgId,
            fileName: file.originalname.slice(0, 255),
            listId: listId ?? null,
            totalRows,
            createdCount: created.length,
            updatedCount: toUpdate.length,
            invalidCount: sortedErrors.length,
            errors: sortedErrors.slice(0, MAX_IMPORT_ERRORS_STORED) as unknown as Prisma.InputJsonValue,
            createdById: actor.id,
          },
        });
        await this.audit.recordTx(tx, {
          category: "ORGANIZATION",
          action: "contacts.imported",
          actorUserId: actor.id,
          organizationId: orgId,
          targetType: "contact_import",
          targetId: imp.id,
          client,
          metadata: { totalRows, created: created.length, updated: toUpdate.length, invalid: sortedErrors.length },
        });
        return imp;
      },
      { timeout: 60_000 },
    );
    return this.toImportResult(record);
  }

  private toImportResult(i: Prisma.ContactImportGetPayload<object>): ContactImportResult {
    return {
      id: i.id,
      fileName: i.fileName,
      totalRows: i.totalRows,
      createdCount: i.createdCount,
      updatedCount: i.updatedCount,
      invalidCount: i.invalidCount,
      errors: i.errors as unknown as ImportRowError[],
      createdAt: i.createdAt.toISOString(),
    };
  }

  async listImports(ctx: OrgContext): Promise<ContactImportResult[]> {
    const items = await this.db.contactImport.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 20 });
    return items.map((i) => this.toImportResult(i));
  }

  async exportCsv(ctx: OrgContext, actor: AuthUser, listId: string | undefined, client: ClientInfo): Promise<string> {
    if (listId) await this.requireList(ctx, listId);
    const where: Prisma.ContactWhereInput = { organizationId: ctx.organizationId, ...(listId ? { lists: { some: { listId } } } : {}) };
    const rows: (string | null)[][] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.db.contact.findMany({
        where,
        orderBy: { id: "asc" },
        take: EXPORT_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      for (const c of batch) {
        rows.push([c.firstName, c.lastName, c.phone, c.baleChatId, c.consent, c.status, c.notes, c.createdAt.toISOString()]);
      }
      if (batch.length < EXPORT_BATCH) break;
      cursor = batch[batch.length - 1]!.id;
    }
    await this.audit.record({ category: "ORGANIZATION", action: "contacts.exported", actorUserId: actor.id, organizationId: ctx.organizationId, client, metadata: { rows: rows.length, listId: listId ?? null } });
    return toCsv(["first_name", "last_name", "phone", "bale_chat_id", "consent", "status", "notes", "created_at"], rows);
  }

  // ---- lists ----------------------------------------------------------------

  private async requireList(ctx: OrgContext, id: string) {
    const list = await this.db.contactList.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!list) throw AppException.notFound("فهرست یافت نشد.");
    return list;
  }

  async lists(ctx: OrgContext): Promise<ContactListInfo[]> {
    const lists = await this.db.contactList.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    });
    return lists.map((l) => ({ id: l.id, name: l.name, description: l.description, contactCount: l._count.members, createdAt: l.createdAt.toISOString() }));
  }

  async createList(ctx: OrgContext, actor: AuthUser, data: { name: string; description?: string | null }, client: ClientInfo): Promise<ContactListInfo> {
    try {
      return await this.db.$transaction(async (tx) => {
        const l = await tx.contactList.create({ data: { organizationId: ctx.organizationId, name: data.name, description: data.description ?? null } });
        await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "list.created", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "contact_list", targetId: l.id, client });
        return { id: l.id, name: l.name, description: l.description, contactCount: 0, createdAt: l.createdAt.toISOString() };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw AppException.conflict("فهرستی با این نام وجود دارد.");
      throw err;
    }
  }

  async updateList(ctx: OrgContext, actor: AuthUser, id: string, data: { name: string; description?: string | null }, client: ClientInfo) {
    await this.requireList(ctx, id);
    try {
      await this.db.$transaction(async (tx) => {
        await tx.contactList.update({ where: { id }, data: { name: data.name, description: data.description ?? null } });
        await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "list.updated", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "contact_list", targetId: id, client });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw AppException.conflict("فهرستی با این نام وجود دارد.");
      throw err;
    }
    return (await this.lists(ctx)).find((l) => l.id === id)!;
  }

  async deleteList(ctx: OrgContext, actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    await this.requireList(ctx, id);
    const active = await this.db.campaign.count({ where: { listId: id, status: { in: ["SCHEDULED", "QUEUED", "RUNNING", "PAUSED"] } } });
    if (active) throw AppException.conflict("این فهرست در یک کمپین فعال استفاده می‌شود.");
    await this.db.$transaction(async (tx) => {
      await tx.contactList.delete({ where: { id } });
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "list.deleted", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "contact_list", targetId: id, client });
    });
  }

  async addToList(ctx: OrgContext, listId: string, contactIds: string[]): Promise<{ added: number }> {
    await this.requireList(ctx, listId);
    const owned = await this.db.contact.findMany({ where: { id: { in: contactIds }, organizationId: ctx.organizationId }, select: { id: true } });
    if (owned.length !== new Set(contactIds).size) throw AppException.notFound("برخی مخاطبان یافت نشدند.");
    const r = await this.db.contactListMember.createMany({ data: owned.map((c) => ({ listId, contactId: c.id })), skipDuplicates: true });
    return { added: r.count };
  }

  async removeFromList(ctx: OrgContext, listId: string, contactIds: string[]): Promise<{ removed: number }> {
    await this.requireList(ctx, listId);
    const r = await this.db.contactListMember.deleteMany({ where: { listId, contactId: { in: contactIds } } });
    return { removed: r.count };
  }

  // ---- suppression ------------------------------------------------------------

  async suppressions(ctx: OrgContext, q: PaginationQuery): Promise<Paginated<SuppressionInfo>> {
    const where: Prisma.SuppressionEntryWhereInput = { organizationId: ctx.organizationId, ...(q.q ? { value: { contains: q.q } } : {}) };
    const [items, total] = await Promise.all([
      this.db.suppressionEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.db.suppressionEntry.count({ where }),
    ]);
    return {
      items: items.map((s) => ({ id: s.id, kind: s.kind, value: s.value, reason: s.reason, createdAt: s.createdAt.toISOString() })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async addSuppression(
    ctx: OrgContext,
    actor: AuthUser,
    data: { phone?: string | null; baleChatId?: string | null; reason?: string },
    client: ClientInfo,
  ): Promise<SuppressionInfo> {
    const kind = data.phone ? "PHONE" : "BALE_CHAT_ID";
    const value = (data.phone ?? data.baleChatId)!;
    return this.db.$transaction(async (tx) => {
      const s = await tx.suppressionEntry.upsert({
        where: { organizationId_kind_value: { organizationId: ctx.organizationId, kind, value } },
        create: { organizationId: ctx.organizationId, kind, value, reason: data.reason || null, createdById: actor.id },
        update: { reason: data.reason || null },
      });
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "suppression.added", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "suppression", targetId: s.id, client });
      return { id: s.id, kind: s.kind, value: s.value, reason: s.reason, createdAt: s.createdAt.toISOString() };
    });
  }

  async removeSuppression(ctx: OrgContext, actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.suppressionEntry.deleteMany({ where: { id, organizationId: ctx.organizationId } });
      if (count === 0) throw AppException.notFound("مورد یافت نشد.");
      await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "suppression.removed", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "suppression", targetId: id, client });
    });
  }
}
