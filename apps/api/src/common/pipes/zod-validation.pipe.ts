import { PipeTransform } from "@nestjs/common";
import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiQuery } from "@nestjs/swagger";
import { z } from "zod";
import { AppException } from "../errors";

/** Validates and transforms a request part with a Zod schema. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const first = result.error.issues[0]?.message ?? "ورودی نامعتبر است.";
    throw AppException.validation(first, fieldErrors);
  }
}

/** Documents a Zod schema as the request body in OpenAPI. */
export function ApiZodBody(schema: z.ZodType) {
  return applyDecorators(ApiBody({ schema: z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as object }));
}

/** Documents the standard pagination query in OpenAPI. */
export function ApiPaginationQuery() {
  return applyDecorators(
    ApiQuery({ name: "page", required: false, type: Number }),
    ApiQuery({ name: "pageSize", required: false, type: Number }),
    ApiQuery({ name: "q", required: false, type: String }),
  );
}
