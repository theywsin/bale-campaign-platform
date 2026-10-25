import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { changePasswordSchema, updateProfileSchema, type MeResponse, type SessionInfo } from "@bcp/shared";
import type { Response } from "express";
import { API_ENV, ApiEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { MeService } from "../auth/me.service";
import { SessionService } from "../auth/session.service";
import { CurrentSessionId, CurrentUser } from "../common/decorators/auth.decorators";
import { ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo } from "../common/request-context";
import { setSessionCookie } from "../common/security/cookies";
import { AppException } from "../common/errors";

@ApiTags("account")
@Controller({ path: "users/me", version: "1" })
export class UsersController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly me: MeService,
  ) {}

  @Patch()
  @ApiZodBody(updateProfileSchema)
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: ReturnType<typeof updateProfileSchema.parse>,
  ): Promise<MeResponse> {
    await this.prisma.client.user.update({ where: { id: user.id }, data: { fullName: body.fullName } });
    return this.me.forUser(user.id);
  }

  @Post("password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ReturnType<typeof changePasswordSchema.parse>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const session = await this.auth.changePassword(user.id, body, clientInfo(req));
    setSessionCookie(res, this.env, session.token, session.expiresAt);
  }

  @Get("sessions")
  async listSessions(@CurrentUser() user: AuthUser, @CurrentSessionId() currentId: string): Promise<SessionInfo[]> {
    const rows = await this.sessions.listActive(user.id);
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      current: s.id === currentId,
    }));
  }

  @Delete("sessions/:sessionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    // Scoped by userId: a user can never revoke another user's session.
    if (!(await this.sessions.revoke(sessionId, user.id))) throw AppException.notFound("نشست یافت نشد.");
    await this.audit.record({ category: "SECURITY", action: "auth.session.revoked", actorUserId: user.id, targetType: "session", targetId: sessionId, client: clientInfo(req) });
  }

  @Post("sessions/revoke-others")
  async revokeOthers(@CurrentUser() user: AuthUser, @CurrentSessionId() currentId: string, @Req() req: AppRequest): Promise<{ revoked: number }> {
    const revoked = await this.sessions.revokeAllExcept(user.id, currentId);
    await this.audit.record({ category: "SECURITY", action: "auth.session.revoked_others", actorUserId: user.id, client: clientInfo(req), metadata: { revoked } });
    return { revoked };
  }
}
