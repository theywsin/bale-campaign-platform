import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type MeResponse,
} from "@bcp/shared";
import type { Response } from "express";
import { API_ENV, ApiEnv } from "../config/env";
import { Public } from "../common/decorators/public.decorator";
import { CurrentSessionId, CurrentUser } from "../common/decorators/auth.decorators";
import { ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo } from "../common/request-context";
import { clearSessionCookie, CSRF_COOKIE, setCsrfCookie, setSessionCookie } from "../common/security/cookies";
import { generateToken } from "../common/security/tokens";
import { rateLimits } from "../common/rate-limits";
import { AuthService } from "./auth.service";
import { MeService } from "./me.service";

/** Stricter per-IP limit for unauthenticated, abuse-prone endpoints. */
const STRICT = { default: { limit: () => rateLimits.authPerMinute, ttl: 60_000 } };

@ApiTags("auth")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly auth: AuthService,
    private readonly me: MeService,
  ) {}

  @Public()
  @Get("csrf")
  @ApiOperation({ summary: "Issues the CSRF cookie (bcp_csrf) that must be echoed in X-CSRF-Token" })
  csrf(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const existing: unknown = req.cookies?.[CSRF_COOKIE];
    const token = typeof existing === "string" && existing.length >= 32 ? existing : generateToken();
    setCsrfCookie(res, this.env, token);
    return { csrfToken: token };
  }

  @Public()
  @Throttle(STRICT)
  @Post("register")
  @ApiZodBody(registerSchema)
  @ApiOperation({ summary: "Creates an account and its first workspace, then signs in" })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: ReturnType<typeof registerSchema.parse>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const session = await this.auth.register(body, clientInfo(req));
    setSessionCookie(res, this.env, session.token, session.expiresAt);
    return this.me.forSession(session.sessionId);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(loginSchema)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: ReturnType<typeof loginSchema.parse>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const session = await this.auth.login(body, clientInfo(req));
    setSessionCookie(res, this.env, session.token, session.expiresAt);
    return this.me.forSession(session.sessionId);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthUser,
    @CurrentSessionId() sessionId: string,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(sessionId, user.id, clientInfo(req));
    clearSessionCookie(res, this.env);
  }

  @Get("me")
  @ApiOperation({ summary: "Current user and the workspaces they belong to" })
  meEndpoint(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.me.forUser(user.id);
  }

  @Public()
  @Throttle(STRICT)
  @Post("password/forgot")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(forgotPasswordSchema)
  async forgot(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ReturnType<typeof forgotPasswordSchema.parse>,
    @Req() req: AppRequest,
  ): Promise<{ message: string }> {
    await this.auth.requestPasswordReset(body.email, clientInfo(req));
    return { message: "اگر حسابی با این ایمیل وجود داشته باشد، پیوند بازیابی برای آن ارسال می‌شود." };
  }

  @Public()
  @Throttle(STRICT)
  @Post("password/reset")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(resetPasswordSchema)
  async reset(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ReturnType<typeof resetPasswordSchema.parse>,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.auth.resetPassword(body, clientInfo(req));
  }

  @Public()
  @Throttle(STRICT)
  @Post("email/verify")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(verifyEmailSchema)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: ReturnType<typeof verifyEmailSchema.parse>,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.auth.verifyEmail(body.token, clientInfo(req));
  }

  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @Post("email/resend")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.resendEmailVerification(user.id);
  }

  @Public()
  @Get("capabilities")
  @ApiOperation({ summary: "Which optional auth features are configured on this deployment" })
  capabilities(): { emailDelivery: boolean } {
    return { emailDelivery: Boolean(this.env.SMTP_URL) };
  }
}
