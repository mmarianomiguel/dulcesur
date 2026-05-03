"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad(n: number) { return String(n).padStart(2, "0"); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseISO(s: string): { y: number; m: number; d: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
function formatDisplay(s: string): string {
  const p = parseISO(s);
  if (!p) return "";
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
}

export function DateInput({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
  disabled,
  min,
  max,
}: DateInputProps) {
  const parsed = parseISO(value);
  const initialView = parsed
    ? { y: parsed.y, m: parsed.m }
    : (() => { const t = parseISO(todayStr())!; return { y: t.y, m: t.m }; })();
  const [view, setView] = React.useState(initialView);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      const p = parseISO(value);
      if (p) setView({ y: p.y, m: p.m });
    }
  }, [open, value]);

  const minP = min ? parseISO(min) : null;
  const maxP = max ? parseISO(max) : null;
  const isOutOfRange = (y: number, m: number, d: number) => {
    const t = y * 10000 + m * 100 + d;
    if (minP && t < minP.y * 10000 + minP.m * 100 + minP.d) return true;
    if (maxP && t > maxP.y * 10000 + maxP.m * 100 + maxP.d) return true;
    return false;
  };

  const today = parseISO(todayStr())!;

  // Build calendar grid: 6 weeks × 7 days, lunes a domingo
  const firstDay = new Date(view.y, view.m - 1, 1);
  // JS getDay: 0=Dom..6=Sab. Queremos Lu=0..Do=6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const cells: { y: number; m: number; d: number; outside: boolean }[] = [];
  // leading from prev month
  const prevMonthDays = new Date(view.y, view.m - 1, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = view.m === 1 ? 12 : view.m - 1;
    const y = view.m === 1 ? view.y - 1 : view.y;
    cells.push({ y, m, d, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y: view.y, m: view.m, d, outside: false });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    const next = last.d + 1;
    const lastInMonth = new Date(last.y, last.m, 0).getDate();
    if (next > lastInMonth) {
      const nm = last.m === 12 ? 1 : last.m + 1;
      const ny = last.m === 12 ? last.y + 1 : last.y;
      cells.push({ y: ny, m: nm, d: 1, outside: true });
    } else {
      cells.push({ y: last.y, m: last.m, d: next, outside: true });
    }
  }

  const goPrev = () => setView((v) => v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 });
  const goNext = () => setView((v) => v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 });

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        disabled={disabled}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 text-left truncate">{value ? formatDisplay(value) : placeholder}</span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" sideOffset={6} align="start" className="z-[200]">
          <PopoverPrimitive.Popup className="rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 p-3 w-72 outline-none">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={goPrev}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium capitalize">
                {MONTH_LABELS[view.m - 1]} {view.y}
              </span>
              <button
                type="button"
                onClick={goNext}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_LABELS.map((d) => (
                <div key={d} className="text-[10px] font-medium text-muted-foreground text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                const isSelected = parsed && c.y === parsed.y && c.m === parsed.m && c.d === parsed.d;
                const isToday = c.y === today.y && c.m === today.m && c.d === today.d;
                const oor = isOutOfRange(c.y, c.m, c.d);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={oor}
                    onClick={() => {
                      onChange(`${c.y}-${pad(c.m)}-${pad(c.d)}`);
                      setOpen(false);
                    }}
                    className={cn(
                      "h-8 w-8 text-xs rounded-md flex items-center justify-center transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : c.outside
                        ? "text-muted-foreground/40 hover:bg-muted/50"
                        : "hover:bg-muted",
                      isToday && !isSelected && "ring-1 ring-primary/40",
                      oor && "opacity-30 cursor-not-allowed",
                    )}
                  >
                    {c.d}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t text-xs">
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" /> Borrar
              </button>
              <button
                type="button"
                onClick={() => { onChange(todayStr()); setOpen(false); }}
                className="text-primary hover:underline font-medium"
              >
                Hoy
              </button>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
