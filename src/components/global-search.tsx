"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Package, Users, FileText, Loader2 } from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: "producto" | "cliente" | "venta";
  url: string;
}

const ICONS = {
  producto: Package,
  cliente: Users,
  venta: FileText,
};

const LABELS = {
  producto: "Productos",
  cliente: "Clientes",
  venta: "Ventas",
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const searchIdRef = useRef(0);
  const router = useRouter();

  // Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const thisSearchId = ++searchIdRef.current;

    const term = `%${q}%`;
    const [{ data: productos }, { data: clientes }, { data: ventasNum }, { data: ventasCliente }] = await Promise.all([
      supabase.from("productos").select("id, nombre, codigo, precio, stock").eq("activo", true).ilike("nombre", term).limit(5),
      supabase.from("clientes").select("id, nombre, cuit, telefono").eq("activo", true).ilike("nombre", term).limit(5),
      supabase.from("ventas").select("id, numero, fecha, total, clientes(nombre)").ilike("numero", term).order("created_at", { ascending: false }).limit(3),
      supabase.from("ventas").select("id, numero, fecha, total, clientes!inner(nombre)").ilike("clientes.nombre", term).order("created_at", { ascending: false }).limit(3),
    ]);
    // Merge ventas, deduplicate by id
    const ventasMap = new Map<string, any>();
    for (const v of [...(ventasNum || []), ...(ventasCliente || [])]) ventasMap.set(v.id, v);
    const ventas = Array.from(ventasMap.values()).slice(0, 5);

    const all: SearchResult[] = [];

    for (const p of productos || []) {
      all.push({
        id: p.id,
        title: p.nombre,
        subtitle: `${p.codigo || "Sin código"} · Stock: ${p.stock} · $${Math.round(p.precio).toLocaleString()}`,
        type: "producto",
        url: "/admin/productos",
      });
    }

    for (const c of clientes || []) {
      all.push({
        id: c.id,
        title: c.nombre,
        subtitle: [c.cuit, c.telefono].filter(Boolean).join(" · ") || "Sin datos",
        type: "cliente",
        url: "/admin/clientes",
      });
    }

    for (const v of ventas || []) {
      all.push({
        id: v.id,
        title: `Venta ${v.numero}`,
        subtitle: `${v.fecha} · $${Math.round(v.total).toLocaleString()} · ${(v as any).clientes?.nombre || "S/C"}`,
        type: "venta",
        url: "/admin/ventas/listado",
      });
    }

    // Discard if a newer search was started
    if (thisSearchId !== searchIdRef.current) return;
    setResults(all);
    setSelected(0);
    setLoading(false);
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (value.length < 2) { setResults([]); setLoading(false); }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const navigate = (result: SearchResult) => {
    setOpen(false);
    const searchParam = encodeURIComponent(result.type === "venta" ? result.title.replace("Venta ", "") : result.title);
    const url = `${result.url}?buscar=${searchParam}`;
    setTimeout(() => {
      if (window.location.pathname === result.url) {
        window.location.href = url;
      } else {
        router.push(url);
      }
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && results.length > 0) { e.preventDefault(); navigate(results[selected]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  let globalIdx = 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b px-3">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar productos, clientes o ventas..."
            className="border-0 focus-visible:ring-0 shadow-none h-12 text-sm"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono ml-2">
            ESC
          </kbd>
        </div>

        {query.length >= 2 && (
          <div className="max-h-[400px] overflow-y-auto p-1">
            {results.length === 0 && !loading && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Sin resultados para &ldquo;{query}&rdquo;
              </div>
            )}

            {(["producto", "cliente", "venta"] as const).map((type) => {
              const items = grouped[type];
              if (!items || items.length === 0) return null;
              const Icon = ICONS[type];
              return (
                <div key={type}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {LABELS[type]}
                  </div>
                  {items.map((r) => {
                    const idx = globalIdx++;
                    const isSelected = idx === selected;
                    return (
                      <button
                        key={r.id}
                        onClick={() => navigate(r)}
                        onMouseEnter={() => setSelected(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors ${isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{r.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {query.length < 2 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Escribí al menos 2 caracteres para buscar
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
