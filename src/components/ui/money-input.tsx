"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Format number with Argentine thousand separators (dots) */
function formatDisplay(val: number | string): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num) || num === 0) return "";
  // Split into integer and decimal parts
  const parts = num.toString().split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.length > 1 ? `${intPart},${parts[1]}` : intPart;
}

/** Parse display string back to number */
function parseDisplay(display: string): number {
  if (!display) return 0;
  // Remove dots (thousand sep), replace comma with dot (decimal sep)
  const cleaned = display.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
}

function MoneyInput({ className, value, onValueChange, min, max, ...props }: MoneyInputProps) {
  const [display, setDisplay] = React.useState(() => formatDisplay(value));
  const [focused, setFocused] = React.useState(false);

  // Sync display when value changes externally (not during editing)
  React.useEffect(() => {
    if (!focused) {
      setDisplay(formatDisplay(value));
    }
  }, [value, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow only digits, dots, commas, and minus
    const cleaned = raw.replace(/[^0-9.,-]/g, "");
    setDisplay(cleaned);
    const num = parseDisplay(cleaned);
    let clamped = num;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    onValueChange(clamped);
  };

  const handleFocus = () => {
    setFocused(true);
    // Show raw number for easier editing
    if (value !== 0) {
      setDisplay(value.toString().replace(".", ","));
    }
  };

  const handleBlur = () => {
    setFocused(false);
    setDisplay(formatDisplay(value));
  };

  return (
    <input
      inputMode="decimal"
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30",
        className
      )}
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    />
  );
}

export { MoneyInput, formatDisplay, parseDisplay };
