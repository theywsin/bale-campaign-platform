/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Normalizes a phone number to E.164.
 * Iranian mobiles are accepted as 09xxxxxxxxx, 9xxxxxxxxx, 989…, 00989… or +989…;
 * other countries only in international form (+ or 00 prefix).
 * Returns null when the input is not a plausible number.
 */
export function normalizePhone(input: string): string | null {
  let v = toAsciiDigits(input).trim().replace(/[\s\-().‌]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (!/^\+?\d+$/.test(v)) return null;

  const iranMobile = /^(?:\+?98|0)?(9\d{9})$/.exec(v);
  if (iranMobile && (v.startsWith("+98") || v.startsWith("98") || v.startsWith("09") || v.length === 10)) {
    return `+98${iranMobile[1]}`;
  }
  if (v.startsWith("+98")) return null; // Iranian number that is not a valid mobile
  if (v.startsWith("+") && /^\+[1-9]\d{7,14}$/.test(v)) return v;
  return null;
}

/** Bale chat ids are integers (negative for groups/channels). */
export function normalizeChatId(input: string): string | null {
  const v = toAsciiDigits(input).trim();
  return /^-?\d{1,20}$/.test(v) ? v : null;
}
