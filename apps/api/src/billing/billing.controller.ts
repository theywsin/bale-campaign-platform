import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { createOrderSchema, mockCheckoutSchema, redeemLicenseSchema } from "@bcp/shared";
import { CurrentOrg, CurrentUser, RequireOrgPermission, SkipCsrf } from "../common/decorators/auth.decorators";
import { Public } from "../common/decorators/public.decorator";
import { ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo, OrgContext } from "../common/request-context";
import { rateLimits } from "../common/rate-limits";
import { BillingService } from "./billing.service";

const STRICT = { default: { limit: () => rateLimits.authPerMinute, ttl: 60_000 } };

@ApiTags("billing")
@Controller({ path: "organizations/:orgId/billing", version: "1" })
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequireOrgPermission("billing:read")
  overview(@CurrentOrg() ctx: OrgContext) {
    return this.billing.overview(ctx);
  }

  @Post("checkout")
  @RequireOrgPermission("billing:write")
  @ApiZodBody(createOrderSchema)
  checkout(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrderSchema)) body: z.infer<typeof createOrderSchema>,
    @Req() req: AppRequest,
  ) {
    return this.billing.checkout(ctx, user, body.planId, clientInfo(req));
  }

  /** Same per-IP limit as login: keys are random, but guessing must stay impractical. */
  @Post("redeem-license")
  @Throttle(STRICT)
  @RequireOrgPermission("billing:write")
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(redeemLicenseSchema)
  redeem(
    @CurrentOrg() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(redeemLicenseSchema)) body: z.infer<typeof redeemLicenseSchema>,
    @Req() req: AppRequest,
  ) {
    return this.billing.redeemLicense(ctx, user, body.key, clientInfo(req));
  }
}

@ApiTags("plans")
@Controller({ path: "plans", version: "1" })
export class PlansController {
  constructor(private readonly billing: BillingService) {}

  /** Public price list for the pricing page. */
  @Get()
  @Public()
  plans() {
    return this.billing.publicPlans();
  }
}

@ApiTags("payments")
@Controller({ path: "payments", version: "1" })
export class PaymentsController {
  constructor(private readonly billing: BillingService) {}

  /** Test-only checkout page data. 404 unless the mock gateway is enabled. */
  @Get("mock/:paymentId")
  mockInfo(@CurrentUser() user: AuthUser, @Param("paymentId", new ParseUUIDPipe()) id: string) {
    return this.billing.mockCheckoutInfo(user, id);
  }

  @Post("mock/:paymentId/complete")
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(mockCheckoutSchema)
  mockComplete(
    @CurrentUser() user: AuthUser,
    @Param("paymentId", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(mockCheckoutSchema)) body: z.infer<typeof mockCheckoutSchema>,
  ) {
    return this.billing.mockComplete(user, id, body.outcome);
  }

  /** Gateway callback: authenticated by HMAC signature, not by session, hence no CSRF check. */
  @Post("webhooks/mock")
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  webhook(@Headers("x-mock-signature") signature: string | undefined, @Body() body: unknown) {
    return this.billing.handleWebhook("MOCK", signature, body);
  }
}
