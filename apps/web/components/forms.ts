import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api";

/** Copies server-side field errors onto the form; returns the general message, if any. */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): string {
  if (err instanceof ApiError) {
    if (err.fieldErrors) {
      for (const [field, messages] of Object.entries(err.fieldErrors)) {
        if (field !== "_" && messages[0]) setError(field as Path<T>, { type: "server", message: messages[0] });
      }
    }
    return err.message;
  }
  return "خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.";
}
