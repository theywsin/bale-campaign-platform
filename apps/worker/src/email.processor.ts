import { Worker, type ConnectionOptions } from "bullmq";
import nodemailer from "nodemailer";
import type { Logger } from "pino";

/** Must match EMAIL_QUEUE / EmailJob in apps/api/src/mail/mail.service.ts. */
export const EMAIL_QUEUE = "email";
export interface EmailJob {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends transactional e-mail queued by the API. BullMQ retries failed jobs
 * with exponential backoff (configured on the queue). Recipient addresses and
 * bodies are not logged because bodies contain one-time links.
 */
export function startEmailWorker(opts: {
  connection: ConnectionOptions;
  smtpUrl: string;
  from: string;
  log: Logger;
}): Worker<EmailJob> {
  const transport = nodemailer.createTransport(opts.smtpUrl);
  const worker = new Worker<EmailJob>(
    EMAIL_QUEUE,
    async (job) => {
      const info = await transport.sendMail({
        from: opts.from,
        to: job.data.to,
        subject: job.data.subject,
        text: job.data.text,
        html: job.data.html,
      });
      return { messageId: info.messageId };
    },
    { connection: opts.connection, concurrency: 2 },
  );
  worker.on("completed", (job) => opts.log.info({ jobId: job.id, kind: job.name }, "email sent"));
  worker.on("failed", (job, err) =>
    opts.log.warn({ jobId: job?.id, kind: job?.name, attempts: job?.attemptsMade, err: err.message }, "email delivery failed"),
  );
  return worker;
}
