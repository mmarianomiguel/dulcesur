"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Package, Users, FileText, Loader2, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: "producto" | "cliente" | "venta";
  url: string;
  meta?: {
    // Producto
    codigo?: string;
    stock?: number;
    stockMinimo?: number;
    precio?: number;
    // Cliente
    saldo?: number;
    email?: string;
    zonaEntrega?: string;
    telefono?: string;
    cuit?: string;
    // Venta
    estado?: string;
    tipoComprobante?: string;
    formaPago?: string;
    entregado?: boolean;
    fecha?: string;
    total?: number;
    clienteNombre?: string;
  };
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

function fc(v: number) {
  return `$${Math.round(v).toLocaleString("es-AR")}`;
}

const estadoColors: Record<string, { bg: string; text: string; label: string }> = {
  pendiente: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Pendiente" },
  entregado: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Entregado" },
  anulada: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Anulada" },
  cancelado: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Cancelado" },
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
      supabase.from("productos").select("id, nombre, codigo, precio, stock, stock_minimo").eq("activo", true).or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`).limit(5),
      supabase.from("clientes").select("id, nombre, cuit, telefono, email, saldo, zona_entrega").eq("activo", true).or(`nombre.ilike.%${q}%,cuit.ilike.%${q}%`).limit(5),
      supabase.from("ventas").select("id, numero, fecha, total, estado, tipo_comprobante, forma_pago, entregado, clientes(nombre)").ilike("numero", term).order("created_at", { ascending: false }).limit(3),
      supabase.from("ventas").select("id, numero, fecha, total, estado, tipo_comprobante, forma_pago, entregado, clientes!inner(nombre)").ilike("clientes.nombre", term).order("created_at", { ascending: false }).limit(3),
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
        subtitle: `${p.codigo || "Sin código"} · Stock: ${p.stock} · ${fc(p.precio)}`,
        type: "producto",
        url: "/admin/productos",
        meta: { codigo: p.codigo, stock: p.stock, stockMinimo: p.stock_minimo, precio: p.precio },
      });
    }

    for (const c of clientes || []) {
      all.push({
        id: c.id,
        title: c.nombre,
        subtitle: [c.cuit, c.telefono].filter(Boolean).join(" · ") || "Sin datos",
        type: "cliente",
        url: "/admin/clientes",
        meta: { cuit: c.cuit, telefono: c.telefono, email: c.email, saldo: c.saldo, zonaEntrega: c.zona_entrega },
      });
    }

    for (const v of ventas || []) {
      const cNombre = (v as any).clientes?.nombre || "S/C";
      all.push({
        id: v.id,
        title: `Venta ${v.numero}`,
        subtitle: `${v.fecha} · ${fc(v.total)} · ${cNombre}`,
        type: "venta",
        url: "/admin/ventas/listado",
        meta: { estado: v.estado, tipoComprobante: v.tipo_comprobante, formaPago: v.forma_pago, entregado: v.entregado, fecha: v.fecha, total: v.total, clienteNombre: cNombre },
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

  const navigatingRef = useRef(false);
  const navigate = (result: SearchResult) => {
    if (navigatingRef.current) return; // Prevent double-click
    navigatingRef.current = true;
    setOpen(false);
    const searchParam = encodeURIComponent(result.type === "venta" ? result.title.replace("Venta ", "") : result.title);
    const url = `${result.url}?buscar=${searchParam}`;
    setTimeout(() => {
      if (window.location.pathname === result.url) {
        window.location.href = url;
      } else {
        router.push(url);
      }
      navigatingRef.current = false;
    }, 150);
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

  const renderProducto = (r: SearchResult) => {
    const m = r.meta;
    if (!m) return <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>;
    const stockLow = m.stockMinimo != null && m.stock != null && m.stock <= m.stockMinimo;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground truncate">
            <span className="font-mono">{m.codigo || "Sin código"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium flex items-center gap-1 ${stockLow ? "text-red-600" : "text-muted-foreground"}`}>
            {stockLow && <AlertTriangle className="w-3 h-3" />}
            {m.stock}
          </span>
          <span className="text-xs font-bold">{fc(m.precio || 0)}</span>
        </div>
      </div>
    );
  };

  const renderCliente = (r: SearchResult) => {
    const m = r.meta;
    if (!m) return <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>;
    const hasDebt = m.saldo != null && m.saldo > 0;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground truncate">
            {[m.cuit, m.telefono].filter(Boolean).join(" · ") || m.email || "Sin datos"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {m.zonaEntrega && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 shrink-0">{m.zonaEntrega}</Badge>
          )}
          {m.saldo != null && m.saldo !== 0 && (
            <span className={`text-xs font-bold ${hasDebt ? "text-red-600" : "text-green-600"}`}>
              {hasDebt ? `Debe ${fc(m.saldo)}` : fc(m.saldo)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderVenta = (r: SearchResult) => {
    const m = r.meta;
    if (!m) return <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>;
    const est = m.estado === "anulada" ? "anulada" : m.entregado ? "entregado" : m.estado || "pendiente";
    const badge = estadoColors[est] || estadoColors.pendiente;
    const isAnulada = m.estado === "anulada";
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
            <span>{m.fecha}</span>
            <span>·</span>
            <span>{m.clienteNombre}</span>
            {m.formaPago && (
              <>
                <span>·</span>
                <span>{m.formaPago}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={`text-[10px] py-0 h-4 border ${badge.bg} ${badge.text}`}>
            {badge.label}
          </Badge>
          <span className={`text-xs font-bold ${isAnulada ? "line-through text-muted-foreground" : ""}`}>
            {fc(m.total || 0)}
          </span>
        </div>
      </div>
    );
  };

  const renderMeta = (r: SearchResult) => {
    if (r.type === "producto") return renderProducto(r);
    if (r.type === "cliente") return renderCliente(r);
    if (r.type === "venta") return renderVenta(r);
    return <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
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
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-sm transition-colors ${isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{r.title}</div>
                          {renderMeta(r)}
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
