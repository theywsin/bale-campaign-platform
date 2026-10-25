import { Module } from "@nestjs/common";
import { CampaignsController, MessagingAccountsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { MessagingAccountsService } from "./messaging-accounts.service";

@Module({
  controllers: [MessagingAccountsController, CampaignsController],
  providers: [MessagingAccountsService, CampaignsService],
})
export class CampaignsModule {}
