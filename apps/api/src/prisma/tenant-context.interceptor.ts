import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import type { AppRequest } from "../common/request-context";
import { tenantStorage } from "./tenant-context";

/** For routes under an organization (req.org set by OrgPermissionGuard), runs the handler in that tenant's context. */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const orgId = req.org?.organizationId;
    if (!orgId) return next.handle();
    return new Observable((subscriber) => tenantStorage.run({ orgId }, () => next.handle().subscribe(subscriber)));
  }
}
