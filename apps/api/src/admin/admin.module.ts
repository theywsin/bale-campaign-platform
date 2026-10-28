import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminOpsController } from "./admin-ops.controller";

@Module({ controllers: [AdminController, AdminOpsController] })
export class AdminModule {}
