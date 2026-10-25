import { parseContactsCsv, sanitizeCsvCell, toCsv } from "./csv";

describe("CSV import", () => {
  it("parses English and Persian headers, normalizes phones and reports invalid rows", () => {
    const csv = "﻿نام,موبایل,شناسه چت\nسارا,۰۹۱۲۱۲۳۴۵۶۷,\nعلی,123,\nرضا,,555\nتکرار,+989121234567,\n";
    const r = parseContactsCsv(Buffer.from(csv));
    expect(r.totalRows).toBe(4);
    expect(r.rows).toEqual([
      expect.objectContaining({ row: 2, firstName: "سارا", phone: "+989121234567" }),
      expect.objectContaining({ row: 4, firstName: "رضا", baleChatId: "555", phone: null }),
    ]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 5]);
  });

  it("accepts semicolon-delimited files", () => {
    const r = parseContactsCsv(Buffer.from("first_name;phone\nA;09121234567\n"));
    expect(r.rows).toHaveLength(1);
  });

  it("rejects files without an address column", () => {
    expect(() => parseContactsCsv(Buffer.from("name,city\na,b\n"))).toThrow(/ستون/);
  });

  it("rejects markup in names", () => {
    const r = parseContactsCsv(Buffer.from("name,phone\n<script>,09121234567\n"));
    expect(r.errors).toHaveLength(1);
  });
});

describe("CSV export", () => {
  it("neutralizes formulas but keeps numbers", () => {
    expect(sanitizeCsvCell("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(sanitizeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(sanitizeCsvCell("-2+3")).toBe("'-2+3");
    expect(sanitizeCsvCell("+989121234567")).toBe("+989121234567");
    expect(sanitizeCsvCell("-100123")).toBe("-100123");
    expect(sanitizeCsvCell("سلام")).toBe("سلام");
  });

  it("quotes cells with delimiters and starts with a BOM", () => {
    const out = toCsv(["a", "b"], [["x,y", "=1"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('"x,y",\'=1');
  });
});
