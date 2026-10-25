import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { createContactSchema, CSV_IMPORT_MAX_ROWS, type ImportRowError } from "@bcp/shared";
import { AppException } from "../common/errors";

/** Accepted header names (lower-cased, spaces/dashes → underscore) for each field. */
const HEADER_ALIASES: Record<string, "firstName" | "lastName" | "phone" | "baleChatId" | "notes"> = {
  first_name: "firstName",
  firstname: "firstName",
  name: "firstName",
  "نام": "firstName",
  last_name: "lastName",
  lastname: "lastName",
  "نام_خانوادگی": "lastName",
  phone: "phone",
  mobile: "phone",
  "موبایل": "phone",
  "شماره": "phone",
  "شماره_موبایل": "phone",
  bale_chat_id: "baleChatId",
  chat_id: "baleChatId",
  "شناسه_چت": "baleChatId",
  "شناسه_چت_بله": "baleChatId",
  notes: "notes",
  "یادداشت": "notes",
};

export interface ParsedContactRow {
  row: number;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  baleChatId: string | null;
  notes: string | null;
}

export const MAX_IMPORT_ERRORS_STORED = 500;

/**
 * Parses an uploaded CSV (UTF-8, optional BOM; comma or semicolon) into validated rows.
 * Row numbers are 1-based and count the header as row 1, matching spreadsheet apps.
 */
export function parseContactsCsv(buffer: Buffer): { rows: ParsedContactRow[]; errors: ImportRowError[]; totalRows: number } {
  const text = buffer.toString("utf8");
  if (text.includes("\u0000")) throw AppException.validation("فایل باید CSV متنی با کدگذاری UTF-8 باشد.");
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      delimiter,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true,
      to_line: CSV_IMPORT_MAX_ROWS + 2,
    }) as string[][];
  } catch {
    throw AppException.validation("فایل CSV قابل خواندن نیست. ساختار فایل را بررسی کنید.");
  }
  if (records.length < 2) throw AppException.validation("فایل خالی است یا فقط سطر عنوان دارد.");
  if (records.length > CSV_IMPORT_MAX_ROWS + 1) {
    throw AppException.validation(`حداکثر ${CSV_IMPORT_MAX_ROWS.toLocaleString("fa-IR")} سطر در هر فایل مجاز است.`);
  }

  const header = records[0]!.map((h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s-]+/g, "_")]);
  if (!header.includes("phone") && !header.includes("baleChatId")) {
    throw AppException.validation("فایل باید ستون phone (موبایل) یا bale_chat_id (شناسه چت) داشته باشد.");
  }

  const rows: ParsedContactRow[] = [];
  const errors: ImportRowError[] = [];
  const seenPhones = new Map<string, number>();
  const seenChats = new Map<string, number>();

  for (let i = 1; i < records.length; i++) {
    const rowNo = i + 1;
    const raw: Record<string, string> = {};
    records[i]!.forEach((cell, idx) => {
      const key = header[idx];
      if (key) raw[key] = cell;
    });
    const parsed = createContactSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ row: rowNo, message: parsed.error.issues[0]?.message ?? "سطر نامعتبر است." });
      continue;
    }
    const c = parsed.data;
    const dupOf = (c.phone && seenPhones.get(c.phone)) || (c.baleChatId && seenChats.get(c.baleChatId));
    if (dupOf) {
      errors.push({ row: rowNo, message: `تکراری؛ همین مخاطب در سطر ${dupOf} آمده است.` });
      continue;
    }
    if (c.phone) seenPhones.set(c.phone, rowNo);
    if (c.baleChatId) seenChats.set(c.baleChatId, rowNo);
    rows.push({
      row: rowNo,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      phone: c.phone ?? null,
      baleChatId: c.baleChatId ?? null,
      notes: c.notes ?? null,
    });
  }
  return { rows, errors, totalRows: records.length - 1 };
}

/**
 * Neutralizes spreadsheet formulas (CSV injection): a cell that starts with
 * = + - @ TAB or CR is prefixed with a single quote. Plain signed integers
 * (phone numbers, chat ids) cannot carry a formula and are left as they are.
 */
export function sanitizeCsvCell(value: string | null | undefined): string {
  if (value == null) return "";
  if (/^[+-]?\d+$/.test(value)) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(header: string[], rows: (string | null)[][]): string {
  // BOM so Excel opens UTF-8 Persian text correctly.
  return "﻿" + stringify([header, ...rows.map((r) => r.map(sanitizeCsvCell))], { record_delimiter: "\r\n" });
}
