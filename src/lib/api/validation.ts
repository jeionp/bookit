/** YYYY-MM-DD format check */
export function isYmdDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Parse a query-param integer with clamping and fallback.
 * Returns defaultVal when the param is absent, non-numeric, < 1, or > max.
 */
export function parseLimit(raw: string | null, defaultVal: number, max = 200): number {
  const n = parseInt(raw ?? "", 10);
  return isNaN(n) || n < 1 || n > max ? defaultVal : n;
}

/**
 * Returns the trimmed string if val is a non-empty string, null otherwise.
 * Use at body/param boundaries where you need both type and emptiness guards.
 */
export function requireString(val: unknown): string | null {
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : null;
}
