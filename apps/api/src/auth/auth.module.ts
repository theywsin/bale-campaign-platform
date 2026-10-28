import { MfaService } from "./mfa.service";
import { Global, Module } from "@nestjs/common";
import { PasswordService } from "../common/security/password.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginRateLimiter } from "./login-rate-limiter";
import { MeService } from "./me.service";
import { SessionService } from "./session.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [MfaService, AuthService, SessionService, LoginRateLimiter, PasswordService, MeService],
  exports: [MfaService, AuthService, SessionService, PasswordService, MeService],
})
export class AuthModule {}
