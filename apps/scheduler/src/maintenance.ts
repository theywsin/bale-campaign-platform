import type { PrismaClient } from "@bcp/database";

/** How long expired/revoked rows are kept for investigation before deletion. */
export const RETENTION = {
  sessionsDays: 30,
  userTokensDays: 7,
  invitationsDays: 30,
};

const days = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);

/**
 * Deletes expired authentication artefacts. Idempotent and safe to run on
 * several schedulers at once (plain DELETE ... WHERE), though only one is
 * expected to run.
 */
export async function purgeExpiredAuthData(prisma: PrismaClient): Promise<Record<string, number>> {
  const sessionCutoff = days(RETENTION.sessionsDays);
  const [sessions, tokens, invitations] = await Promise.all([
    prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] },
    }),
    prisma.userToken.deleteMany({ where: { expiresAt: { lt: days(RETENTION.userTokensDays) } } }),
    prisma.invitation.deleteMany({
      where: { status: { not: "ACCEPTED" }, expiresAt: { lt: days(RETENTION.invitationsDays) } },
    }),
  ]);
  return { sessions: sessions.count, userTokens: tokens.count, invitations: invitations.count };
}
