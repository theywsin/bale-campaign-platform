import { Module } from "@nestjs/common";
import { AdminBillingController } from "./admin-billing.controller";
import { BillingController, PaymentsController, PlansController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({ controllers: [PlansController, BillingController, PaymentsController, AdminBillingController], providers: [BillingService] })
export class BillingModule {}
