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

// ─── Timezone-aware relative dates ───

/**
 * Returns calendar days elapsed since dateStr in Argentina timezone.
 * Returns -1 if dateStr is empty/invalid.
 * Uses calendar-day diff (not milliseconds) to avoid DST issues.
 */
export function daysSinceAR(dateStr: string | null | undefined): number {
  if (!dateStr) return -1;
  const todayStr = todayARG(); // "YYYY-MM-DD"
  const inputStr = dateStr.includes("T")
    ? new Date(dateStr).toLocaleDateString("en-CA", { timeZone: TIMEZONE })
    : dateStr.slice(0, 10);
  const today = new Date(todayStr + "T12:00:00");
  const input = new Date(inputStr + "T12:00:00");
  const diff = Math.round((today.getTime() - input.getTime()) / (1000 * 60 * 60 * 24));
  return isNaN(diff) ? -1 : Math.max(0, diff);
}

/**
 * Formats a date string as a human-readable relative label in Spanish.
 * Examples: "Hoy", "Ayer", "hace 5 días", "hace 2 meses", "hace 1 año"
 * Returns "—" for empty or invalid input.
 */
export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const days = daysSinceAR(dateStr);
  if (days < 0) return "—";
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? "hace 1 año" : `hace ${years} años`;
}

/**
 * Formats a full datetime string for display: "15/03/2026 14:30"
 * Uses Argentina timezone.
 */
export function formatDateTimeAR(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
