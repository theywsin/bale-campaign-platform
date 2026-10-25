import type { INestApplication } from "@nestjs/common";
import { dispatchCampaign, recoverStuckRecipients, relayOutbox, type DispatchDeps } from "@bcp/engine";
import { MockMessagingProvider } from "@bcp/messaging";
import { RedisService } from "../src/redis/redis.module";
import { addMember, createTestApp, prisma, registerUser, type Registered } from "./helpers";

describe("campaigns: lifecycle, dispatch, retry and recovery", () => {
  let app: INestApplication;
  let deps: DispatchDeps;
  const enqueued: { campaignId: string; delayMs: number }[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    deps = {
      prisma: prisma(app),
      redis: app.get(RedisService).client,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
      providerFor: () => new MockMessagingProvider(),
      enqueue: async (campaignId, delayMs) => void enqueued.push({ campaignId, delayMs }),
      retryPolicy: { maxAttempts: 3, baseDelayMs: 1500, maxDelayMs: 3000 },
    };
  });
  afterAll(async () => {
    await app.close();
  });

  async function setup(u: Registered, chatIds: (string | null)[]) {
    const org = `/organizations/${u.orgId}`;
    const { body: account } = await u.client.post(`${org}/messaging-accounts/mock`, { displayName: "حساب آزمایشی", rateLimitPerMinute: 600 }).expect(201);
    expect(account.isTestOnly).toBe(true);
    for (const [i, chat] of chatIds.entries()) {
      await u.client.post(`${org}/contacts`, chat ? { firstName: `م${i}`, baleChatId: chat } : { firstName: `م${i}`, phone: `0912000${String(i).padStart(4, "0")}` }).expect(201);
    }
    const { body: campaign } = await u.client
      .post(`${org}/campaigns`, { name: "کمپین آزمایشی", messageText: "سلام", messagingAccountId: account.id })
      .expect(201);
    expect(campaign.status).toBe("DRAFT");
    return { org, account, campaign, base: `${org}/campaigns/${campaign.id}` };
  }

  const recipients = async (campaignId: string) =>
    prisma(app).campaignRecipient.findMany({ where: { campaignId }, orderBy: { chatId: "asc" } });

  it("snapshots recipients, relays the outbox and sends with the right final states", async () => {
    const u = await registerUser(app);
    const { org, campaign, base } = await setup(u, ["5000", "5991", "5992", "5993", "5444", null]);
    // 5444 is on the suppression list; the contact without chat id cannot be messaged by a bot.
    await u.client.post(`${org}/suppressions`, { baleChatId: "5444" }).expect(201);

    const started = await u.client.post(`${base}/start`, {}).expect(200);
    expect(started.body.status).toBe("QUEUED");
    expect(started.body.totalRecipients).toBe(6);
    expect(started.body.counts).toMatchObject({ PENDING: 4, SUPPRESSED: 1, FAILED: 1 });
    // Editing or starting again is refused once started.
    await u.client.patch(base, { name: "تغییر" }).expect(409);
    await u.client.post(`${base}/start`, {}).expect(409);

    const published: unknown[] = [];
    await relayOutbox(prisma(app), { publish: async (e) => void published.push(e.payload) });
    expect(published).toContainEqual({ campaignId: campaign.id });
    // Relaying again publishes nothing new.
    const before = published.length;
    await relayOutbox(prisma(app), { publish: async (e) => void published.push(e.payload) });
    expect(published.filter((p) => (p as { campaignId: string }).campaignId === campaign.id)).toHaveLength(1);
    expect(published.length).toBeGreaterThanOrEqual(before);

    const first = await dispatchCampaign(deps, campaign.id);
    expect(first.outcome).toBe("waiting"); // 5992 got a retryable error
    let rows = await recipients(campaign.id);
    const by = (chat: string | null) => rows.find((r) => r.chatId === chat)!;
    expect(by("5000").status).toBe("ACCEPTED");
    expect(by("5000").deliveredAt).toBeNull(); // accepted is not delivered
    expect(by("5991")).toMatchObject({ status: "FAILED", lastErrorCode: "MOCK_REJECTED" });
    expect(by("5992")).toMatchObject({ status: "PENDING", attemptCount: 1 });
    expect(by("5993")).toMatchObject({ status: "UNKNOWN", attemptCount: 1 });
    expect(by("5444").status).toBe("SUPPRESSED");
    expect(by(null)).toMatchObject({ status: "FAILED", lastErrorCode: "NO_CHAT_ID" });
    expect(enqueued.some((e) => e.campaignId === campaign.id)).toBe(true);

    await new Promise((r) => setTimeout(r, 1600));
    const second = await dispatchCampaign(deps, campaign.id);
    expect(second.outcome).toBe("completed");
    rows = await recipients(campaign.id);
    expect(rows.find((r) => r.chatId === "5992")).toMatchObject({ status: "ACCEPTED", attemptCount: 2 });
    // UNKNOWN is never retried automatically.
    expect(rows.find((r) => r.chatId === "5993")).toMatchObject({ status: "UNKNOWN", attemptCount: 1 });

    const attempts = await prisma(app).messageAttempt.count({ where: { recipient: { campaignId: campaign.id } } });
    expect(attempts).toBe(5);
    const done = await u.client.get(base).expect(200);
    expect(done.body.status).toBe("COMPLETED");
    expect(done.body.counts).toMatchObject({ ACCEPTED: 2, FAILED: 2, UNKNOWN: 1, SUPPRESSED: 1, DELIVERED: 0 });

    const report = await u.client.get(`${base}/recipients?status=UNKNOWN`).expect(200);
    expect(report.body.total).toBe(1);
    expect(report.body.items[0].lastErrorCode).toBe("TIMEOUT");
  });

  it("pauses, resumes and cancels a campaign", async () => {
    const u = await registerUser(app);
    const { campaign, base } = await setup(u, ["6001", "6002", "6003"]);
    await u.client.post(`${base}/start`, {}).expect(200);
    const paused = await u.client.post(`${base}/pause`).expect(200);
    expect(paused.body.status).toBe("PAUSED");
    expect((await dispatchCampaign(deps, campaign.id)).outcome).toBe("not-runnable");
    expect((await recipients(campaign.id)).every((r) => r.status === "PENDING")).toBe(true);
    await u.client.post(`${base}/pause`).expect(409);

    const resumed = await u.client.post(`${base}/resume`).expect(200);
    expect(resumed.body.status).toBe("QUEUED");
    const events = await prisma(app).outboxEvent.count({ where: { payload: { equals: { campaignId: campaign.id } } } });
    expect(events).toBe(2);

    const cancelled = await u.client.post(`${base}/cancel`).expect(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.counts.FAILED).toBe(3);
    expect((await recipients(campaign.id))[0]!.lastErrorCode).toBe("CAMPAIGN_CANCELLED");
    await u.client.post(`${base}/resume`).expect(409);
    await u.client.delete(base).expect(409);
  });

  it("targets only the members of the chosen list and skips archived contacts", async () => {
    const u = await registerUser(app);
    const { org, account } = await setup(u, []);
    const ids: string[] = [];
    for (const chat of ["7101", "7102", "7103"]) {
      ids.push((await u.client.post(`${org}/contacts`, { baleChatId: chat }).expect(201)).body.id);
    }
    const { body: list } = await u.client.post(`${org}/lists`, { name: "ویژه" }).expect(201);
    await u.client.post(`${org}/lists/${list.id}/members`, { contactIds: [ids[0], ids[1]] }).expect(201);
    await u.client.put(`${org}/contacts/${ids[1]}/archived`, { archived: true }).expect(200);
    const { body: c } = await u.client
      .post(`${org}/campaigns`, { name: "فهرستی", messageText: "سلام", messagingAccountId: account.id, listId: list.id })
      .expect(201);
    const started = await u.client.post(`${org}/campaigns/${c.id}/start`, {}).expect(200);
    expect(started.body.totalRecipients).toBe(1);
    expect((await recipients(c.id))[0]!.chatId).toBe("7101");
    // A list in use by an active campaign cannot be deleted.
    await u.client.delete(`${org}/lists/${list.id}`).expect(409);
  });

  it("schedules a campaign for later", async () => {
    const u = await registerUser(app);
    const { base } = await setup(u, ["7001"]);
    const at = new Date(Date.now() + 3600_000).toISOString();
    const res = await u.client.post(`${base}/start`, { scheduledAt: at }).expect(200);
    expect(res.body.status).toBe("SCHEDULED");
    expect(res.body.scheduledAt).toBe(at);
    await u.client.post(`${base}/start`, { scheduledAt: "2001-01-01T00:00:00Z" }).expect(400);
  });

  it("recovers stuck sends: unfinished attempt → UNKNOWN, unclaimed → PENDING", async () => {
    const u = await registerUser(app);
    const { campaign, base } = await setup(u, ["8001", "8002"]);
    await u.client.post(`${base}/start`, {}).expect(200);
    const [r1, r2] = await recipients(campaign.id);
    const old = new Date(Date.now() - 10 * 60_000);
    await prisma(app).campaignRecipient.updateMany({ where: { id: { in: [r1!.id, r2!.id] } }, data: { status: "PROCESSING", lockedAt: old } });
    await prisma(app).messageAttempt.create({ data: { recipientId: r1!.id, attemptNo: 1 } });

    const result = await recoverStuckRecipients(prisma(app));
    expect(result.unknown).toBeGreaterThanOrEqual(1);
    const rows = await recipients(campaign.id);
    expect(rows.find((r) => r.id === r1!.id)).toMatchObject({ status: "UNKNOWN", lastErrorCode: "WORKER_INTERRUPTED" });
    expect(rows.find((r) => r.id === r2!.id)!.status).toBe("PENDING");
  });

  it("refuses to start without active contacts and enforces permissions and isolation", async () => {
    const owner = await registerUser(app);
    const { org, account, base } = await setup(owner, []);
    const empty = await owner.client.post(`${base}/start`, {}).expect(409);
    expect(empty.body.message).toContain("مخاطب");

    const member = await registerUser(app);
    await addMember(app, owner.orgId, member.userId, "ORGANIZATION_MEMBER");
    await member.client.get(base).expect(200);
    await member.client.post(`${base}/start`, {}).expect(403);
    await member.client.post(`${org}/messaging-accounts/mock`, { displayName: "x" }).expect(403);

    const other = await registerUser(app);
    await other.client.get(base).expect(404);
    await other.client.get(`/organizations/${other.orgId}/campaigns/${base.split("/").pop()}`).expect(404);
    // Another tenant's messaging account cannot be referenced.
    await other.client
      .post(`/organizations/${other.orgId}/campaigns`, { name: "سرقت", messageText: "x", messagingAccountId: account.id })
      .expect(400);
  });

  it("does not offer the mock provider when it is disabled", async () => {
    const prod = await createTestApp({ MESSAGING_MOCK_ENABLED: "false" });
    try {
      const u = await registerUser(prod);
      const res = await u.client.get(`/organizations/${u.orgId}/messaging-accounts`).expect(200);
      expect(res.body.mockEnabled).toBe(false);
      await u.client.post(`/organizations/${u.orgId}/messaging-accounts/mock`, { displayName: "آزمایشی" }).expect(403);
    } finally {
      await prod.close();
    }
  });
});
