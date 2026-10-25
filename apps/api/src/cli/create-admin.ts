/**
 * Creates (or promotes) a platform administrator.
 *
 *   ADMIN_EMAIL=ops@example.com ADMIN_FULL_NAME="مدیر سامانه" ADMIN_PASSWORD='...' \
 *   ADMIN_ROLE=SUPER_ADMIN npm run admin:create
 *
 * There are no default credentials: the password must be supplied by the operator
 * and is validated with the same policy as user sign-up.
 */
import "reflect-metadata";
import { createPrismaClient } from "@bcp/database";
import { emailSchema, fullNameSchema, passwordSchema, PLATFORM_ROLES } from "@bcp/shared";
import { z } from "zod";
import { PasswordService } from "../common/security/password.service";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ADMIN_EMAIL: emailSchema,
  ADMIN_FULL_NAME: fullNameSchema,
  ADMIN_PASSWORD: passwordSchema.optional(),
  ADMIN_ROLE: z.enum(PLATFORM_ROLES).default("SUPER_ADMIN"),
});

async function main(): Promise<void> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
    process.exit(1);
  }
  const env = parsed.data;
  const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL, poolMax: 1 });
  try {
    const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
    if (existing) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: existing.id }, data: { platformRole: env.ADMIN_ROLE } }),
        prisma.auditLog.create({
          data: { category: "ADMIN", action: "admin.cli.role_granted", targetType: "user", targetId: existing.id, metadata: { role: env.ADMIN_ROLE } },
        }),
      ]);
      console.log(`Granted ${env.ADMIN_ROLE} to existing user ${env.ADMIN_EMAIL}`);
      return;
    }
    if (!env.ADMIN_PASSWORD) {
      console.error("ADMIN_PASSWORD is required to create a new user");
      process.exit(1);
    }
    const passwordHash = await new PasswordService().hash(env.ADMIN_PASSWORD);
    const user = await prisma.user.create({
      data: {
        email: env.ADMIN_EMAIL,
        fullName: env.ADMIN_FULL_NAME,
        passwordHash,
        platformRole: env.ADMIN_ROLE,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: { category: "ADMIN", action: "admin.cli.user_created", targetType: "user", targetId: user.id, metadata: { role: env.ADMIN_ROLE } },
    });
    console.log(`Created ${env.ADMIN_ROLE} ${env.ADMIN_EMAIL}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
