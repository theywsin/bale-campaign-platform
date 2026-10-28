import { HttpStatus } from "@nestjs/common";

/** Stable machine-readable error codes returned to clients. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CSRF_REJECTED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_SUSPENDED"
  | "LOGIN_LOCKED"
  | "TOKEN_INVALID"
  | "PAYLOAD_TOO_LARGE"
  | "SERVICE_UNAVAILABLE"
  | "PLAN_LIMIT_REACHED"
  | "MFA_REQUIRED"
  | "PAYMENT_UNAVAILABLE"
  | "INTERNAL_ERROR";

/** An error whose message is safe to show to end users (Persian). */
export class AppException extends Error {
  constructor(
    public readonly status: HttpStatus,
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppException";
  }

  static notFound(message = "مورد درخواستی یافت نشد."): AppException {
    return new AppException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
  }

  static forbidden(message = "شما اجازه انجام این عملیات را ندارید."): AppException {
    return new AppException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
  }

  static unauthenticated(message = "لطفاً ابتدا وارد حساب خود شوید."): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", message);
  }

  static conflict(message: string): AppException {
    return new AppException(HttpStatus.CONFLICT, "CONFLICT", message);
  }

  static unavailable(message: string): AppException {
    return new AppException(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", message);
  }

  /** The organization's plan does not allow this; the message names the limit. */
  static planLimit(message: string): AppException {
    return new AppException(HttpStatus.FORBIDDEN, "PLAN_LIMIT_REACHED", message);
  }

  static validation(message: string, fieldErrors?: Record<string, string[]>): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message, fieldErrors);
  }
}
