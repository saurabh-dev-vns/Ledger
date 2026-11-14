/** Same output as the Express helpers in src/core/money.js. */
export function money(n: number | string | null | undefined): string {
  return Number(n || 0).toFixed(2);
}

/** "2026-11-14T00:00:00Z" or "2026-11-14" -> "2026-11-14". */
export function formatDate(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : "";
}
