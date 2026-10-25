import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { API_ENV, ApiEnv } from "../config/env";

export const EMAIL_QUEUE = "email";

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }): { text: string; html: string } {
  const text = [title, "", ...paragraphs, ...(action ? ["", `${action.label}: ${action.url}`] : [])].join("\n");
  const html = `<!doctype html><html lang="fa" dir="rtl"><body style="font-family:Tahoma,sans-serif;line-height:1.8;color:#0f172a">
<h2>${escapeHtml(title)}</h2>${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
${action ? `<p><a href="${escapeHtml(action.url)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(action.label)}</a></p>` : ""}
</body></html>`;
  return { text, html };
}

/**
 * Builds transactional e-mails and hands them to the worker through BullMQ.
 * When SMTP is not configured, nothing is queued: links containing tokens are
 * never written to logs as a fallback.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  readonly queue: Queue<EmailJob> | null;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.queue = env.SMTP_URL
      ? new Queue<EmailJob>(EMAIL_QUEUE, {
          connection: { url: env.REDIS_URL },
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: "exponential", delay: 30_000 },
            removeOnComplete: true,
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        })
      : null;
  }

  get enabled(): boolean {
    return this.queue !== null;
  }

  private link(path: string, token: string): string {
    const url = new URL(path, this.env.APP_URL);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private async send(job: EmailJob, kind: string): Promise<void> {
    if (!this.queue) {
      this.logger.warn({ kind }, "e-mail delivery is not configured (SMTP_URL empty); message not sent");
      return;
    }
    await this.queue.add(kind, job);
  }

  sendEmailVerification(to: string, fullName: string, token: string): Promise<void> {
    const body = layout(
      "تأیید ایمیل",
      [`${fullName} عزیز، برای تأیید ایمیل حساب خود روی دکمه زیر بزنید.`, "این پیوند تا ۴۸ ساعت معتبر است."],
      { label: "تأیید ایمیل", url: this.link("/verify-email", token) },
    );
    return this.send({ to, subject: "تأیید ایمیل حساب بله‌کمپین", ...body }, "email-verification");
  }

  sendPasswordReset(to: string, token: string): Promise<void> {
    const body = layout(
      "بازیابی رمز عبور",
      ["درخواست بازیابی رمز عبور برای حساب شما ثبت شد.", "این پیوند تا ۶۰ دقیقه و فقط یک بار معتبر است. اگر شما درخواست نداده‌اید، این پیام را نادیده بگیرید."],
      { label: "تعیین رمز جدید", url: this.link("/reset-password", token) },
    );
    return this.send({ to, subject: "بازیابی رمز عبور بله‌کمپین", ...body }, "password-reset");
  }

  sendInvitation(to: string, organizationName: string, inviterName: string, token: string): Promise<void> {
    const body = layout(
      "دعوت به فضای کاری",
      [`${inviterName} شما را به فضای کاری «${organizationName}» در بله‌کمپین دعوت کرده است.`, "این دعوت‌نامه تا ۷ روز معتبر است."],
      { label: "پذیرش دعوت", url: this.link("/invitations/accept", token) },
    );
    return this.send({ to, subject: `دعوت به فضای کاری ${organizationName}`, ...body }, "invitation");
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
