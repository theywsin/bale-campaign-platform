import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  acceptInvitationSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from "@bcp/shared";
import { CurrentOrg, CurrentUser, RequireOrgPermission } from "../common/decorators/auth.decorators";
import { ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo, OrgContext } from "../common/request-context";
import { MeService } from "../auth/me.service";
import { OrganizationsService } from "./organizations.service";

const uuid = new ParseUUIDPipe();

@ApiTags("organizations")
@Controller({ path: "organizations", version: "1" })
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly me: MeService,
  ) {}

  @Get()
  async mine(@CurrentUser() user: AuthUser) {
    return (await this.me.forUser(user.id)).organizations;
  }

  @Post()
  @ApiZodBody(createOrganizationSchema)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: ReturnType<typeof createOrganizationSchema.parse>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.create(user, body.name, clientInfo(req));
  }

  @Post("invitations/accept")
  @ApiZodBody(acceptInvitationSchema)
  accept(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: ReturnType<typeof acceptInvitationSchema.parse>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.acceptInvitation(user, body.token, clientInfo(req));
  }

  @Get(":orgId")
  @RequireOrgPermission("org:read")
  get(@CurrentOrg() ctx: OrgContext) {
    return this.orgs.get(ctx);
  }

  @Patch(":orgId")
  @RequireOrgPermission("org:update")
  @ApiZodBody(updateOrganizationSchema)
  update(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: ReturnType<typeof updateOrganizationSchema.parse>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.rename(ctx, user, body.name, clientInfo(req));
  }

  @Get(":orgId/activity")
  @RequireOrgPermission("audit:read")
  activity(@CurrentOrg() ctx: OrgContext) {
    return this.orgs.recentActivity(ctx);
  }

  @Get(":orgId/members")
  @RequireOrgPermission("members:read")
  members(@CurrentOrg() ctx: OrgContext) {
    return this.orgs.listMembers(ctx);
  }

  @Patch(":orgId/members/:memberId")
  @RequireOrgPermission("members:update-role")
  @ApiZodBody(updateMemberRoleSchema)
  updateRole(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("memberId", uuid) memberId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: ReturnType<typeof updateMemberRoleSchema.parse>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.updateMemberRole(ctx, user, memberId, body.role, clientInfo(req));
  }

  /** Members may remove themselves (leave); removing others requires members:remove (checked in the service). */
  @Delete(":orgId/members/:memberId")
  @RequireOrgPermission("org:read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("memberId", uuid) memberId: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.orgs.removeMember(ctx, user, memberId, clientInfo(req));
  }

  @Get(":orgId/invitations")
  @RequireOrgPermission("members:invite")
  invitations(@CurrentOrg() ctx: OrgContext) {
    return this.orgs.listInvitations(ctx);
  }

  @Post(":orgId/invitations")
  @RequireOrgPermission("members:invite")
  @ApiZodBody(inviteMemberSchema)
  invite(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: ReturnType<typeof inviteMemberSchema.parse>,
    @Req() req: AppRequest,
  ) {
    return this.orgs.invite(ctx, user, body, clientInfo(req));
  }

  @Delete(":orgId/invitations/:invitationId")
  @RequireOrgPermission("members:invite")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvitation(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param("invitationId", uuid) invitationId: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.orgs.revokeInvitation(ctx, user, invitationId, clientInfo(req));
  }
}
