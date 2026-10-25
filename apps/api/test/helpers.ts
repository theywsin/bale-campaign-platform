import type { INestApplication } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { createApp } from "../src/app.factory";
import { loadApiEnv } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";
import { MailService } from "../src/mail/mail.service";
import { testEnvSource } from "./env";

export const ORIGIN = "http://localhost:3000";

export async function createTestApp(overrides: Record<string, string> = {}): Promise<INestApplication> {
  const app = await createApp(loadApiEnv(testEnvSource(overrides)));
  await app.init();
  return app;
}

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomBytes(5).toString("hex")}@example.test`;
}

export const PASSWORD = "Str0ngPassw0rd";

/** A browser-like client: keeps cookies and sends the CSRF header on writes. */
export class Client {
  readonly agent: TestAgent;
  csrf = "";

  constructor(readonly app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  async init(): Promise<this> {
    const res = await this.agent.get("/api/v1/auth/csrf").expect(200);
    this.csrf = res.body.csrfToken;
    return this;
  }

  get(path: string) {
    return this.agent.get(`/api/v1${path}`);
  }
  post(path: string, body?: object) {
    return this.agent.post(`/api/v1${path}`).set("X-CSRF-Token", this.csrf).set("Origin", ORIGIN).send(body ?? {});
  }
  patch(path: string, body?: object) {
    return this.agent.patch(`/api/v1${path}`).set("X-CSRF-Token", this.csrf).set("Origin", ORIGIN).send(body ?? {});
  }
  delete(path: string) {
    return this.agent.delete(`/api/v1${path}`).set("X-CSRF-Token", this.csrf).set("Origin", ORIGIN);
  }
}

export interface Registered {
  client: Client;
  email: string;
  userId: string;
  orgId: string;
}

export async function registerUser(app: INestApplication, opts: { email?: string; org?: string } = {}): Promise<Registered> {
  const client = await new Client(app).init();
  const email = opts.email ?? uniqueEmail();
  const res = await client
    .post("/auth/register", {
      fullName: "کاربر آزمایشی",
      email,
      password: PASSWORD,
      organizationName: opts.org ?? "فضای آزمایشی",
      acceptTerms: true,
    })
    .expect(201);
  return { client, email, userId: res.body.user.id, orgId: res.body.organizations[0].id };
}

export function prisma(app: INestApplication) {
  return app.get(PrismaService).client;
}

export type EmailKind = "email-verification" | "password-reset" | "invitation";

/** Returns the token from the newest queued e-mail of `kind` sent to `to` (nothing is actually sent in tests). */
export async function lastEmailToken(app: INestApplication, to: string, kind: EmailKind): Promise<string> {
  const queue = app.get(MailService).queue!;
  const jobs = await queue.getJobs(["waiting", "delayed", "prioritized"]);
  const job = jobs.filter((j) => j.data.to === to && j.name === kind).sort((a, b) => b.timestamp - a.timestamp)[0];
  if (!job) throw new Error(`no e-mail queued for ${to}`);
  const match = /token=([A-Za-z0-9_-]+)/.exec(job.data.text);
  if (!match?.[1]) throw new Error("no token in e-mail");
  return match[1];
}
