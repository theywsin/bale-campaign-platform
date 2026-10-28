import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { CredentialsCipher } from "@bcp/messaging";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.module";
import { AuditService } from "../audit/audit.service";
import { API_ENV, type ApiEnv } from "../config/env";
import { AppException } from "../common/errors";
import type { AuthUser, ClientInfo } from "../common/request-context";
import { PasswordService } from "../common/security/password.service";
import { generateToken, hashToken } from "../common/security/tokens";
import { generateRecoveryCode, generateTotpSecret, otpauthUri, TOTP_STEP_SECONDS, verifyTotp } from "../common/security/totp";

const CHALLENGE_TTL_S = 300;
const CHALLENGE_MAX_ATTEMPTS = 5;
const RECOVERY_CODES = 10;
const ISSUER = "بله‌کمپین";
const aad = (userId: string) => `totp:${userId}`;

/**
 * TOTP two-factor authentication. Secrets are encrypted with CREDENTIALS_ENCRYPTION_KEY (AAD bound to
 * the user); each accepted time step is remembered so a code cannot be replayed; recovery codes are
 * one-time and stored hashed.
 */
@Injectable()
export class MfaService {
  private readonly cipher: CredentialsCipher | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.cipher = env.CREDENTIALS_ENCRYPTION_KEY ? new CredentialsCipher(env.CREDENTIALS_ENCRYPTION_KEY) : null;
  }

  get available(): boolean {
    return this.cipher !== null;
  }

  private requireCipher(): CredentialsCipher {
    if (!this.cipher) throw AppException.unavailable("ورود دومرحله‌ای در این استقرار پیکربندی نشده است (کلید رمزنگاری تنظیم نشده).");
    return this.cipher;
  }

  /** Starts (or restarts) setup. Not active until confirmed with a code. */
  async setup(user: AuthUser): Promise<{ secret: string; otpauthUri: string }> {
    const cipher = this.requireCipher();
    const row = await this.prisma.client.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpEnabledAt: true } });
    if (row.totpEnabledAt) throw AppException.conflict("ورود دومرحله‌ای از قبل فعال است.");
    const secret = generateTotpSecret();
    await this.prisma.client.user.update({ where: { id: user.id }, data: { totpSecretEncrypted: cipher.encrypt(secret, aad(user.id)) } });
    return { secret, otpauthUri: otpauthUri(secret, user.email, ISSUER) };
  }

  /** Activates 2FA, issues recovery codes (shown once) and ends the user's other sessions. */
  async confirm(user: AuthUser, sessionId: string, code: string, client: ClientInfo): Promise<{ recoveryCodes: string[] }> {
    const row = await this.prisma.client.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpEnabledAt: true, totpSecretEncrypted: true } });
    if (row.totpEnabledAt) throw AppException.conflict("ورود دومرحله‌ای از قبل فعال است.");
    if (!row.totpSecretEncrypted) throw AppException.validation("ابتدا راه‌اندازی را شروع کنید.");
    if (!(await this.checkTotp(user.id, row.totpSecretEncrypted, code))) throw AppException.validation("کد نادرست است.", { code: ["کد نادرست است."] });
    const codes = Array.from({ length: RECOVERY_CODES }, generateRecoveryCode);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
      await tx.userRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.userRecoveryCode.createMany({ data: codes.map((c) => ({ userId: user.id, codeHash: hashToken(c) })) });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: sessionId } }, data: { revokedAt: new Date() } });
      await this.audit.recordTx(tx, { category: "SECURITY", action: "auth.mfa.enabled", actorUserId: user.id, client });
    });
    return { recoveryCodes: codes };
  }

  async disable(user: AuthUser, password: string, code: string, client: ClientInfo): Promise<void> {
    const row = await this.prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!row.totpEnabledAt) throw AppException.conflict("ورود دومرحله‌ای فعال نیست.");
    if (!(await this.passwords.verify(row.passwordHash, password))) throw AppException.validation("رمز عبور نادرست است.", { password: ["رمز عبور نادرست است."] });
    if (!(await this.checkCode(user.id, row.totpSecretEncrypted, code))) throw AppException.validation("کد نادرست است.", { code: ["کد نادرست است."] });
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { totpEnabledAt: null, totpSecretEncrypted: null } });
      await tx.userRecoveryCode.deleteMany({ where: { userId: user.id } });
      await this.audit.recordTx(tx, { category: "SECURITY", action: "auth.mfa.disabled", actorUserId: user.id, client });
    });
  }

  /** After a correct password: a short-lived, single-purpose token for the second step. */
  async createChallenge(userId: string): Promise<string> {
    const token = generateToken();
    await this.redis.client.set(`mfa:challenge:${hashToken(token)}`, JSON.stringify({ userId, attempts: 0 }), "EX", CHALLENGE_TTL_S);
    return token;
  }

  /** Returns the user id if the code is right; the challenge dies after success or too many attempts. */
  async completeChallenge(token: string, code: string, client: ClientInfo): Promise<string> {
    const key = `mfa:challenge:${hashToken(token)}`;
    const raw = await this.redis.client.get(key);
    const expired = () => new AppException(HttpStatus.UNAUTHORIZED, "TOKEN_INVALID", "مهلت ورود به پایان رسیده است. دوباره وارد شوید.");
    if (!raw) throw expired();
    const challenge = JSON.parse(raw) as { userId: string; attempts: number };
    const user = await this.prisma.client.user.findUnique({ where: { id: challenge.userId }, select: { totpSecretEncrypted: true, totpEnabledAt: true, status: true } });
    if (!user || user.status !== "ACTIVE" || !user.totpEnabledAt) {
      await this.redis.client.del(key);
      throw expired();
    }
    if (await this.checkCode(challenge.userId, user.totpSecretEncrypted, code)) {
      await this.redis.client.del(key);
      return challenge.userId;
    }
    challenge.attempts += 1;
    await this.audit.record({ category: "SECURITY", action: "auth.mfa.failed", actorUserId: challenge.userId, client });
    if (challenge.attempts >= CHALLENGE_MAX_ATTEMPTS) {
      await this.redis.client.del(key);
      throw expired();
    }
    await this.redis.client.set(key, JSON.stringify(challenge), "KEEPTTL");
    throw AppException.validation("کد نادرست است.", { code: ["کد نادرست است."] });
  }

  /** TOTP code or an unused recovery code (consumed atomically). */
  private async checkCode(userId: string, secretEncrypted: string | null, code: string): Promise<boolean> {
    if (/^\d{6}$/.test(code)) return secretEncrypted ? this.checkTotp(userId, secretEncrypted, code) : false;
    const { count } = await this.prisma.client.userRecoveryCode.updateMany({
      where: { userId, codeHash: hashToken(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  private async checkTotp(userId: string, secretEncrypted: string, code: string): Promise<boolean> {
    const secret = this.requireCipher().decrypt(secretEncrypted, aad(userId));
    const step = verifyTotp(secret, code);
    if (step === null) return false;
    // NX: the first use of this step wins; a replay within the window is refused.
    const fresh = await this.redis.client.set(`mfa:used:${userId}:${step}`, "1", "EX", TOTP_STEP_SECONDS * 3, "NX");
    return fresh === "OK";
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.client.userRecoveryCode.count({ where: { userId, usedAt: null } });
  }
}
