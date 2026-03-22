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
    : currencyFormatter.format(value);
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

/** Formats date for PDF: "05/01/2026" (padded) */
export function formatDatePDF(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

/** Returns current month padded: "03" */
export function currentMonthPadded(): string {
  return String(new Date().getMonth() + 1).padStart(2, "0");
}

/** Returns current year: "2026" */
export function currentYear(): string {
  return String(new Date().getFullYear());
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
