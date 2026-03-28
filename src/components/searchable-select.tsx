"use client";

import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { norm } from "@/lib/utils";

interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}

export function SearchableSelect({ label, value, onChange, allLabel, options }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = value === "all" || !value ? allLabel : options.find((o) => o.value === value)?.label ?? allLabel;

  const filtered = search
    ? options.filter((o) => norm(o.label).includes(norm(search)))
    : options;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setSearch("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="space-y-1.5 relative" ref={containerRef}>
      <Label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">{label}</Label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap h-9 text-left hover:bg-accent/50 transition-colors"
      >
        <span className="truncate">{selectedLabel}</span>
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-md max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-7 pr-2 py-1.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="overflow-y-auto p-1">
            {!search && (
              <button
                type="button"
                onClick={() => { onChange("all"); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent ${value === "all" || !value ? "bg-accent font-medium" : ""}`}
              >
                {allLabel}
              </button>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent ${value === o.value ? "bg-accent font-medium" : ""}`}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
