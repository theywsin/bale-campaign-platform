import { Body, Controller, Get, Global, Injectable, Module, Put, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DEFAULT_SYSTEM_SETTINGS, systemSettingsSchema, type PublicSettings, type SystemSettings } from "@bcp/shared";
import type { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CurrentUser, RequirePlatformPermission } from "../common/decorators/auth.decorators";
import { Public } from "../common/decorators/public.decorator";
import { ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo } from "../common/request-context";

const KEY = "system";
const CACHE_MS = 5_000;

/** Operator-editable settings, stored as one JSON row in system_settings. Unknown or invalid stored values fall back to defaults. */
@Injectable()
export class SettingsService {
  private cache: { value: SystemSettings; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<SystemSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.prisma.client.systemSetting.findUnique({ where: { key: KEY } });
    const parsed = systemSettingsSchema.safeParse({ ...DEFAULT_SYSTEM_SETTINGS, ...((row?.value as object | null) ?? {}) });
    const value = parsed.success ? parsed.data : DEFAULT_SYSTEM_SETTINGS;
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(actor: AuthUser, value: SystemSettings, req: AppRequest): Promise<SystemSettings> {
    const before = await this.get();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: KEY },
        create: { key: KEY, value, updatedById: actor.id, description: "Operator settings (admin panel)" },
        update: { value, updatedById: actor.id },
      });
      await this.audit.recordTx(tx, {
        category: "ADMIN",
        action: "admin.settings.updated",
        actorUserId: actor.id,
        targetType: "settings",
        targetId: KEY,
        client: clientInfo(req),
        metadata: { changed: (Object.keys(value) as (keyof SystemSettings)[]).filter((k) => before[k] !== value[k]) },
      });
    });
    this.cache = null;
    return this.get();
  }
}

@ApiTags("settings")
@Controller({ version: "1" })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** What the web panel needs before sign-in (registration open, banner). */
  @Get("settings")
  @Public()
  async publicSettings(): Promise<PublicSettings> {
    return this.settings.get();
  }

  @Get("admin/settings")
  @RequirePlatformPermission("admin:settings:write")
  get() {
    return this.settings.get();
  }

  @Put("admin/settings")
  @RequirePlatformPermission("admin:settings:write")
  @ApiZodBody(systemSettingsSchema)
  update(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(systemSettingsSchema)) body: z.infer<typeof systemSettingsSchema>, @Req() req: AppRequest) {
    return this.settings.update(user, body, req);
  }
}

@Global()
@Module({ controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
