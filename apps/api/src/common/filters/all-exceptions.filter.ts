import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import type { ApiErrorBody } from "@bcp/shared";
import type { Request, Response } from "express";
import { AppException, ErrorCode } from "../errors";

const DEFAULT_MESSAGES: Partial<Record<number, { code: ErrorCode; message: string }>> = {
  400: { code: "VALIDATION_ERROR", message: "درخواست نامعتبر است." },
  401: { code: "UNAUTHENTICATED", message: "لطفاً ابتدا وارد حساب خود شوید." },
  403: { code: "FORBIDDEN", message: "شما اجازه انجام این عملیات را ندارید." },
  404: { code: "NOT_FOUND", message: "مسیر یا مورد درخواستی یافت نشد." },
  409: { code: "CONFLICT", message: "این عملیات با وضعیت فعلی سازگار نیست." },
  413: { code: "PAYLOAD_TOO_LARGE", message: "حجم درخواست بیش از حد مجاز است." },
  429: { code: "RATE_LIMITED", message: "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید." },
};

/**
 * Converts every error into the ApiErrorBody shape. Unexpected errors are
 * logged server-side and returned as a generic message, so internals
 * (stack traces, SQL, connection strings) never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = typeof req.id === "string" ? req.id : undefined;

    let body: ApiErrorBody;
    if (exception instanceof AppException) {
      body = {
        statusCode: exception.status,
        code: exception.code,
        message: exception.message,
        fieldErrors: exception.fieldErrors,
      };
    } else if (exception instanceof ThrottlerException) {
      body = { statusCode: 429, ...DEFAULT_MESSAGES[429]! };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const fallback = DEFAULT_MESSAGES[status] ?? { code: "INTERNAL_ERROR" as const, message: "خطای نامشخص." };
      body = { statusCode: status, code: fallback.code, message: fallback.message };
    } else if (isBodyParserError(exception)) {
      const status = exception.status;
      const fallback = DEFAULT_MESSAGES[status] ?? DEFAULT_MESSAGES[400]!;
      body = { statusCode: status, code: fallback.code, message: fallback.message };
    } else {
      this.logger.error(
        { err: exception instanceof Error ? { name: exception.name, message: exception.message, stack: exception.stack } : String(exception), requestId },
        "Unhandled error",
      );
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: "INTERNAL_ERROR",
        message: "خطای داخلی سرور رخ داد. لطفاً دوباره تلاش کنید.",
      };
    }

    if (requestId) body.requestId = requestId;
    res.status(body.statusCode).json(body);
  }
}

function isBodyParserError(e: unknown): e is { status: number; type: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "type" in e &&
    "status" in e &&
    typeof (e as { status: unknown }).status === "number"
  );
}
