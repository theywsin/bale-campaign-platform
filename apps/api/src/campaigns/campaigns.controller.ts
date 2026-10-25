import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  createBaleBotAccountSchema,
  createCampaignSchema,
  createMockAccountSchema,
  rotateBotTokenSchema,
  paginationQuerySchema,
  recipientQuerySchema,
  startCampaignSchema,
  updateCampaignSchema,
} from "@bcp/shared";
import { CurrentOrg, CurrentUser, RequireOrgPermission } from "../common/decorators/auth.decorators";
import { ApiPaginationQuery, ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo, OrgContext } from "../common/request-context";
import { CampaignsService } from "./campaigns.service";
import { MessagingAccountsService } from "./messaging-accounts.service";

const uuid = new ParseUUIDPipe();
const accountStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });

@ApiTags("messaging-accounts")
@Controller({ path: "organizations/:orgId/messaging-accounts", version: "1" })
export class MessagingAccountsController {
  constructor(private readonly accounts: MessagingAccountsService) {}

  @Get()
  @RequireOrgPermission("messaging-accounts:read")
  async list(@CurrentOrg() ctx: OrgContext) {
    return { mockEnabled: this.accounts.mockEnabled, baleEnabled: this.accounts.baleEnabled, items: await this.accounts.list(ctx) };
  }

  /** Verifies the token with Bale getMe, then stores it encrypted. The token is never returned. */
  @Post("bale-bot")
  @RequireOrgPermission("messaging-accounts:write")
  @ApiZodBody(createBaleBotAccountSchema)
  createBaleBot(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBaleBotAccountSchema)) body: z.infer<typeof createBaleBotAccountSchema>,
    @Req() req: AppRequest,
  ) {
    return this.accounts.createBaleBot(ctx, user, body, clientInfo(req));
  }

  @Post(":accountId/check")
  @RequireOrgPermission("messaging-accounts:write")
  @HttpCode(HttpStatus.OK)
  check(@CurrentOrg() ctx: OrgContext, @Param("accountId", uuid) id: string) {
    return this.accounts.check(ctx, id);
  }

  @Put(":accountId/token")
  @RequireOrgPermission("messaging-accounts:write")
  @ApiZodBody(rotateBotTokenSchema)
  rotateToken(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("accountId", uuid) id: string,
    @Body(new ZodValidationPipe(rotateBotTokenSchema)) body: z.infer<typeof rotateBotTokenSchema>,
    @Req() req: AppRequest,
  ) {
    return this.accounts.rotateToken(ctx, user, id, body.token, clientInfo(req));
  }

  /** Test-only provider: never sends real messages. */
  @Post("mock")
  @RequireOrgPermission("messaging-accounts:write")
  @ApiZodBody(createMockAccountSchema)
  createMock(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMockAccountSchema)) body: z.infer<typeof createMockAccountSchema>,
    @Req() req: AppRequest,
  ) {
    return this.accounts.createMock(ctx, user, body, clientInfo(req));
  }

  @Put(":accountId/status")
  @RequireOrgPermission("messaging-accounts:write")
  @ApiZodBody(accountStatusSchema)
  setStatus(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("accountId", uuid) id: string,
    @Body(new ZodValidationPipe(accountStatusSchema)) body: z.infer<typeof accountStatusSchema>,
    @Req() req: AppRequest,
  ) {
    return this.accounts.setStatus(ctx, user, id, body.status, clientInfo(req));
  }

  @Delete(":accountId")
  @RequireOrgPermission("messaging-accounts:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("accountId", uuid) id: string, @Req() req: AppRequest) {
    await this.accounts.remove(ctx, user, id, clientInfo(req));
  }
}

@ApiTags("campaigns")
@Controller({ path: "organizations/:orgId/campaigns", version: "1" })
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequireOrgPermission("campaigns:read")
  @ApiPaginationQuery()
  list(@CurrentOrg() ctx: OrgContext, @Query(new ZodValidationPipe(paginationQuerySchema)) q: z.infer<typeof paginationQuerySchema>) {
    return this.campaigns.list(ctx, q);
  }

  @Post()
  @RequireOrgPermission("campaigns:write")
  @ApiZodBody(createCampaignSchema)
  create(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCampaignSchema)) body: z.infer<typeof createCampaignSchema>,
    @Req() req: AppRequest,
  ) {
    return this.campaigns.create(ctx, user, body, clientInfo(req));
  }

  @Get(":campaignId")
  @RequireOrgPermission("campaigns:read")
  get(@CurrentOrg() ctx: OrgContext, @Param("campaignId", uuid) id: string) {
    return this.campaigns.get(ctx, id);
  }

  @Patch(":campaignId")
  @RequireOrgPermission("campaigns:write")
  @ApiZodBody(updateCampaignSchema)
  update(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("campaignId", uuid) id: string,
    @Body(new ZodValidationPipe(updateCampaignSchema)) body: z.infer<typeof updateCampaignSchema>,
    @Req() req: AppRequest,
  ) {
    return this.campaigns.update(ctx, user, id, body, clientInfo(req));
  }

  @Delete(":campaignId")
  @RequireOrgPermission("campaigns:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("campaignId", uuid) id: string, @Req() req: AppRequest) {
    await this.campaigns.remove(ctx, user, id, clientInfo(req));
  }

  @Post(":campaignId/start")
  @RequireOrgPermission("campaigns:send")
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(startCampaignSchema)
  start(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("campaignId", uuid) id: string,
    @Body(new ZodValidationPipe(startCampaignSchema)) body: z.infer<typeof startCampaignSchema>,
    @Req() req: AppRequest,
  ) {
    return this.campaigns.start(ctx, user, id, body.scheduledAt ? new Date(body.scheduledAt) : undefined, clientInfo(req));
  }

  @Post(":campaignId/pause")
  @RequireOrgPermission("campaigns:send")
  @HttpCode(HttpStatus.OK)
  pause(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("campaignId", uuid) id: string, @Req() req: AppRequest) {
    return this.campaigns.pause(ctx, user, id, clientInfo(req));
  }

  @Post(":campaignId/resume")
  @RequireOrgPermission("campaigns:send")
  @HttpCode(HttpStatus.OK)
  resume(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("campaignId", uuid) id: string, @Req() req: AppRequest) {
    return this.campaigns.resume(ctx, user, id, clientInfo(req));
  }

  @Post(":campaignId/cancel")
  @RequireOrgPermission("campaigns:send")
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentOrg() ctx: OrgContext, @CurrentUser() user: AuthUser, @Param("campaignId", uuid) id: string, @Req() req: AppRequest) {
    return this.campaigns.cancel(ctx, user, id, clientInfo(req));
  }

  @Get(":campaignId/recipients")
  @RequireOrgPermission("campaigns:read")
  @ApiPaginationQuery()
  recipients(
    @CurrentOrg() ctx: OrgContext,
    @Param("campaignId", uuid) id: string,
    @Query(new ZodValidationPipe(recipientQuerySchema)) q: z.infer<typeof recipientQuerySchema>,
  ) {
    return this.campaigns.recipients(ctx, id, q);
  }
}
