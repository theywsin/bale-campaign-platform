import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@bcp/shared";
import { Prisma } from "@bcp/database";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MailService } from "../mail/mail.service";
import { PasswordService } from "../common/security/password.service";
import { generateToken, hashToken } from "../common/security/tokens";
import { AppException } from "../common/errors";
import type { ClientInfo } from "../common/request-context";
import { LoginRateLimiter } from "./login-rate-limiter";
import { SessionService } from "./session.service";

const EMAIL_VERIFICATION_TTL_MS = 48 * 3600 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function newOrganizationSlug(): string {
  return `ws-${randomBytes(6).toString("hex")}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly limiter: LoginRateLimiter,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /** Creates the user and their first workspace (as owner) atomically, then signs them in. */
  async register(input: RegisterInput, client: ClientInfo) {
    const passwordHash = await this.passwords.hash(input.password);
    let userId: string;
    try {
      userId = await this.prisma.client.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: input.email, passwordHash, fullName: input.fullName },
          select: { id: true },
        });
        const org = await tx.organization.create({
          data: { name: input.organizationName, slug: newOrganizationSlug(), createdById: user.id },
          select: { id: true },
        });
        await tx.organizationMember.create({
          data: { organizationId: org.id, userId: user.id, role: "ORGANIZATION_OWNER" },
        });
        await this.audit.recordTx(tx, { category: "SECURITY", action: "auth.register", actorUserId: user.id, targetType: "user", targetId: user.id, client });
        await this.audit.recordTx(tx, { category: "ORGANIZATION", action: "org.created", actorUserId: user.id, organizationId: org.id, targetType: "organization", targetId: org.id, client });
        return user.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw AppException.conflict("حسابی با این ایمیل وجود دارد. وارد شوید یا رمز خود را بازیابی کنید.");
      }
      throw err;
    }

    if (this.mail.enabled) await this.issueEmailVerification(userId, input.email, input.fullName);
    const session = await this.sessions.create(userId, client);
    return session;
  }

  async login(input: LoginInput, client: ClientInfo) {
    const lockedFor = await this.limiter.lockedFor(input.email, client.ipAddress);
    if (lockedFor > 0) {
      await this.audit.record({ category: "SECURITY", action: "auth.login.locked", client, metadata: { email: input.email } });
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        "LOGIN_LOCKED",
        `به دلیل تلاش‌های ناموفق متعدد، ورود موقتاً مسدود شده است. حدود ${Math.ceil(lockedFor / 60)} دقیقه دیگر دوباره تلاش کنید.`,
      );
    }

    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    const valid = user ? await this.passwords.verify(user.passwordHash, input.password) : (await this.passwords.verifyDummy(input.password), false);

    if (!user || !valid) {
      await this.limiter.registerFailure(input.email, client.ipAddress);
      await this.audit.record({
        category: "SECURITY",
        action: "auth.login.failed",
        actorUserId: user?.id ?? null,
        client,
        metadata: { email: input.email },
      });
      throw new AppException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "ایمیل یا رمز عبور نادرست است.");
    }
    if (user.status !== "ACTIVE") {
      await this.audit.record({ category: "SECURITY", action: "auth.login.suspended", actorUserId: user.id, client });
      throw new AppException(HttpStatus.FORBIDDEN, "ACCOUNT_SUSPENDED", "حساب کاربری شما غیرفعال شده است. با پشتیبانی تماس بگیرید.");
    }

    await this.limiter.reset(input.email);
    const data: Prisma.UserUpdateInput = { lastLoginAt: new Date() };
    if (this.passwords.needsRehash(user.passwordHash)) data.passwordHash = await this.passwords.hash(input.password);
    await this.prisma.client.user.update({ where: { id: user.id }, data });
    const session = await this.sessions.create(user.id, client);
    await this.audit.record({ category: "SECURITY", action: "auth.login.success", actorUserId: user.id, targetType: "session", targetId: session.sessionId, client });
    return session;
  }

  async logout(sessionId: string, userId: string, client: ClientInfo): Promise<void> {
    await this.sessions.revoke(sessionId, userId);
    await this.audit.record({ category: "SECURITY", action: "auth.logout", actorUserId: userId, targetType: "session", targetId: sessionId, client });
  }

  /** Always succeeds from the caller's point of view, so it cannot be used to discover accounts. */
  async requestPasswordReset(email: string, client: ClientInfo): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { email }, select: { id: true, status: true } });
    if (!user || user.status !== "ACTIVE") return;
    const token = generateToken();
    await this.prisma.client.$transaction(async (tx) => {
      // Only the newest reset link stays valid.
      await tx.userToken.updateMany({
        where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.userToken.create({
        data: { userId: user.id, purpose: "PASSWORD_RESET", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
      });
      await this.audit.recordTx(tx, { category: "SECURITY", action: "auth.password_reset.requested", actorUserId: user.id, client });
    });
    await this.mail.sendPasswordReset(email, token);
  }

  async resetPassword(input: ResetPasswordInput, client: ClientInfo): Promise<void> {
    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      // Atomically consume the token: concurrent requests cannot both succeed.
      const consumed = await tx.userToken.updateManyAndReturn({
        where: { tokenHash: hashToken(input.token), purpose: "PASSWORD_RESET", usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
        select: { userId: true },
      });
      const userId = consumed[0]?.userId;
      if (!userId) throw new AppException(HttpStatus.BAD_REQUEST, "TOKEN_INVALID", "پیوند بازیابی نامعتبر یا منقضی شده است. دوباره درخواست دهید.");
      await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: now } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit.recordTx(tx, { category: "SECURITY", action: "auth.password_reset.completed", actorUserId: userId, client });
    });
  }

  async changePassword(userId: string, input: ChangePasswordInput, client: ClientInfo) {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      await this.audit.record({ category: "SECURITY", action: "auth.password_change.failed", actorUserId: userId, client });
      throw AppException.validation("رمز فعلی نادرست است.", { currentPassword: ["رمز فعلی نادرست است."] });
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    const now = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: now } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit.recordTx(tx, { category: "SECURITY", action: "auth.password.changed", actorUserId: userId, client });
    });
    // All sessions (including the current one) were invalidated; issue a fresh one for this device.
    return this.sessions.create(userId, client);
  }

  async issueEmailVerification(userId: string, email: string, fullName: string): Promise<void> {
    const token = generateToken();
    await this.prisma.client.userToken.create({
      data: { userId, purpose: "EMAIL_VERIFICATION", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) },
    });
    await this.mail.sendEmailVerification(email, fullName, token);
  }

  async resendEmailVerification(userId: string): Promise<void> {
    if (!this.mail.enabled) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "ارسال ایمیل در این سامانه پیکربندی نشده است.");
    }
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;
    await this.issueEmailVerification(user.id, user.email, user.fullName);
  }

  async verifyEmail(token: string, client: ClientInfo): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const consumed = await tx.userToken.updateManyAndReturn({
        where: { tokenHash: hashToken(token), purpose: "EMAIL_VERIFICATION", usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
        select: { userId: true },
      });
      const userId = consumed[0]?.userId;
      if (!userId) throw new AppException(HttpStatus.BAD_REQUEST, "TOKEN_INVALID", "پیوند تأیید نامعتبر یا منقضی شده است.");
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
      await this.audit.recordTx(tx, { category: "SECURITY", action: "auth.email.verified", actorUserId: userId, client });
    });
  }
}
