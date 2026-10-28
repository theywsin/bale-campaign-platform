import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { adminTicketUpdateSchema, createTicketSchema, ticketListQuerySchema, ticketReplySchema } from "@bcp/shared";
import type { Prisma } from "@bcp/database";
import { CurrentOrg, CurrentUser, RequireOrgPermission, RequirePlatformPermission } from "../common/decorators/auth.decorators";
import { ApiPaginationQuery, ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo, OrgContext } from "../common/request-context";
import { SupportService } from "./support.service";

const uuid = new ParseUUIDPipe();
type ListQuery = z.infer<typeof ticketListQuerySchema>;

@ApiTags("support")
@Controller({ path: "organizations/:orgId/tickets", version: "1" })
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @RequireOrgPermission("support:read")
  @ApiPaginationQuery()
  list(@CurrentOrg() ctx: OrgContext, @Query(new ZodValidationPipe(ticketListQuerySchema)) q: ListQuery) {
    return this.support.list({ organizationId: ctx.organizationId, ...(q.status ? { status: q.status } : {}) }, q);
  }

  @Post()
  @RequireOrgPermission("support:write")
  @ApiZodBody(createTicketSchema)
  create(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTicketSchema)) body: z.infer<typeof createTicketSchema>, @Req() req: AppRequest) {
    return this.support.create(ctx, user, body, clientInfo(req));
  }

  @Get(":ticketId")
  @RequireOrgPermission("support:read")
  get(@CurrentOrg() ctx: OrgContext, @Param("ticketId", uuid) id: string) {
    return this.support.detail({ id, organizationId: ctx.organizationId }, false);
  }

  @Post(":ticketId/messages")
  @RequireOrgPermission("support:write")
  @ApiZodBody(ticketReplySchema)
  reply(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("ticketId", uuid) id: string, @Body(new ZodValidationPipe(ticketReplySchema)) body: z.infer<typeof ticketReplySchema>, @Req() req: AppRequest) {
    return this.support.reply({ id, organizationId: ctx.organizationId }, user, body.body, false, clientInfo(req));
  }

  /** Customers can only close their tickets; replying reopens them. */
  @Post(":ticketId/close")
  @RequireOrgPermission("support:write")
  @HttpCode(HttpStatus.OK)
  close(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("ticketId", uuid) id: string, @Req() req: AppRequest) {
    return this.support.update({ id, organizationId: ctx.organizationId }, user, { status: "CLOSED" }, false, clientInfo(req));
  }
}

@ApiTags("admin-support")
@Controller({ path: "admin/tickets", version: "1" })
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @RequirePlatformPermission("admin:tickets:read")
  @ApiPaginationQuery()
  list(@Query(new ZodValidationPipe(ticketListQuerySchema)) q: ListQuery) {
    const where: Prisma.SupportTicketWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? { OR: [{ subject: { contains: q.q, mode: "insensitive" } }, { organization: { name: { contains: q.q, mode: "insensitive" } } }] }
        : {}),
    };
    return this.support.list(where, q);
  }

  @Get(":ticketId")
  @RequirePlatformPermission("admin:tickets:read")
  get(@Param("ticketId", uuid) id: string) {
    return this.support.detail({ id }, true);
  }

  @Post(":ticketId/messages")
  @RequirePlatformPermission("admin:tickets:write")
  @ApiZodBody(ticketReplySchema)
  reply(@CurrentUser() user: AuthUser, @Param("ticketId", uuid) id: string, @Body(new ZodValidationPipe(ticketReplySchema)) body: z.infer<typeof ticketReplySchema>, @Req() req: AppRequest) {
    return this.support.reply({ id }, user, body.body, true, clientInfo(req));
  }

  @Patch(":ticketId")
  @RequirePlatformPermission("admin:tickets:write")
  @ApiZodBody(adminTicketUpdateSchema)
  update(@CurrentUser() user: AuthUser, @Param("ticketId", uuid) id: string, @Body(new ZodValidationPipe(adminTicketUpdateSchema)) body: z.infer<typeof adminTicketUpdateSchema>, @Req() req: AppRequest) {
    return this.support.update({ id }, user, body, true, clientInfo(req));
  }
}
