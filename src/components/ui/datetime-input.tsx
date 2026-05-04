"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad(n: number) { return String(n).padStart(2, "0"); }
function nowLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseLocal(s: string): { y: number; m: number; d: number; h: number; mn: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  return {
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    h: m[4] ? Number(m[4]) : 0,
    mn: m[5] ? Number(m[5]) : 0,
  };
}
function formatDisplay(s: string): string {
  const p = parseLocal(s);
  if (!p) return "";
  return `${pad(p.d)}/${pad(p.m)}/${p.y} ${pad(p.h)}:${pad(p.mn)}`;
}

interface DateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
}

export function DateTimeInput({
  value,
  onChange,
  placeholder = "Seleccionar fecha y hora",
  className,
  disabled,
  min,
  max,
}: DateTimeInputProps) {
  const parsed = parseLocal(value);
  const initialView = parsed
    ? { y: parsed.y, m: parsed.m }
    : (() => { const t = parseLocal(nowLocalStr())!; return { y: t.y, m: t.m }; })();
  const [view, setView] = React.useState(initialView);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      const p = parseLocal(value);
      if (p) setView({ y: p.y, m: p.m });
    }
  }, [open, value]);

  const minP = min ? parseLocal(min) : null;
  const maxP = max ? parseLocal(max) : null;
  const isDayOutOfRange = (y: number, m: number, d: number) => {
    const t = y * 10000 + m * 100 + d;
    if (minP && t < minP.y * 10000 + minP.m * 100 + minP.d) return true;
    if (maxP && t > maxP.y * 10000 + maxP.m * 100 + maxP.d) return true;
    return false;
  };

  const today = parseLocal(nowLocalStr())!;

  const firstDay = new Date(view.y, view.m - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const cells: { y: number; m: number; d: number; outside: boolean }[] = [];
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

  // Hora/minuto actuales (default a la actual si no hay value)
  const hour = parsed?.h ?? today.h;
  const minute = parsed?.mn ?? 0;

  const emit = (y: number, m: number, d: number, h: number, mn: number) => {
    onChange(`${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(mn)}`);
  };

  const onPickDay = (c: { y: number; m: number; d: number }) => {
    emit(c.y, c.m, c.d, hour, minute);
  };
  const onChangeHour = (h: number) => {
    if (parsed) emit(parsed.y, parsed.m, parsed.d, h, minute);
    else emit(today.y, today.m, today.d, h, minute);
  };
  const onChangeMinute = (mn: number) => {
    if (parsed) emit(parsed.y, parsed.m, parsed.d, hour, mn);
    else emit(today.y, today.m, today.d, hour, mn);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
                const oor = isDayOutOfRange(c.y, c.m, c.d);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={oor}
                    onClick={() => onPickDay(c)}
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

            {/* Time row */}
            <div className="mt-3 pt-3 border-t flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={pad(hour)}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(23, parseInt(e.target.value || "0", 10)));
                    onChangeHour(n);
                  }}
                  className="h-8 w-12 rounded-md border border-input bg-transparent text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <span className="text-muted-foreground font-medium">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={pad(minute)}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(59, parseInt(e.target.value || "0", 10)));
                    onChangeMinute(n);
                  }}
                  className="h-8 w-12 rounded-md border border-input bg-transparent text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
              <div className="flex gap-1">
                {["08:00", "12:00", "18:00", "23:59"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const [h, mn] = t.split(":").map(Number);
                      if (parsed) emit(parsed.y, parsed.m, parsed.d, h, mn);
                      else emit(today.y, today.m, today.d, h, mn);
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
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
                onClick={() => { onChange(nowLocalStr()); setOpen(false); }}
                className="text-primary hover:underline font-medium"
              >
                Ahora
              </button>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
