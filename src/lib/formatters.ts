// ─── Currency ───
const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
});

const currencyFormatterDecimals = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

export function formatCurrency(value: number, decimals = false): string {
  return decimals
    ? currencyFormatterDecimals.format(value)
    : currencyFormatter.format(Math.round(value));
}

// ─── Dates ───
const TIMEZONE = "America/Argentina/Buenos_Aires";

/** Returns YYYY-MM-DD in Argentina timezone */
export function todayARG(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/** Returns HH:MM:SS */
export function nowTimeARG(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: TIMEZONE });
}

/** Formats a date string for display: "15/03/2026" */
export function formatDateARG(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-AR", { timeZone: TIMEZONE });
}

/** Formats date for display: "15 mar 2026" */
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIMEZONE,
  });
}

/** Formats date for PDF: "05/01/2026" (padded) - uses Argentina timezone */
export function formatDatePDF(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
  const parts = d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" }).split("/");
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}

/** Returns current month padded: "03" - Argentina timezone */
export function currentMonthPadded(): string {
  const m = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE, month: "2-digit" });
  return m;
}

/** Returns current year: "2026" - Argentina timezone */
export function currentYear(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE, year: "numeric" });
}

// ─── Text ───
export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Truncate text with ellipsis */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}

// ─── Numbers ───
const numberFormatter = new Intl.NumberFormat("es-AR");

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
