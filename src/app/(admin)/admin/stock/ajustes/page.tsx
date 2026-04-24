"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { showAdminToast } from "@/components/admin-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Search, Loader2, AlertTriangle, X, PackageSearch, Package,
} from "lucide-react";
import { todayARG, currentMonthPadded } from "@/lib/formatters";
import { logAudit } from "@/lib/audit";

/* ─── Types ─── */
interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  stock: number;
  costo: number;
  unidad_medida?: string;
}

interface AjusteRow {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costo: number;
  subtotal: number;
  motivo: string;
  comentario: string;
  presentacion?: string;
  unidades_por_presentacion?: number;
  cajas?: number;
  sueltas?: number;
  direccion?: "in" | "out";
}

interface PresData {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  costo: number;
  precio: number;
}

interface Ajuste {
  id: string;
  fecha: string;
  motivo: string;
  observacion: string | null;
  usuario: string | null;
}

const MOTIVOS_GLOBALES = [
  "Mercadería defectuosa",
  "Mercadería vencida",
  "Consumo interno",
  "Venta al costo",
  "Robo interno",
  "Robo por agentes externos",
  "Diferencia de inventario",
];

const MOTIVOS_ITEM = [
  "Mercadería defectuosa",
  "Mercadería vencida",
  "Consumo interno",
  "Robo interno",
  "Robo por agentes externos",
  "Diferencia de inventario",
  "Otro",
];



function formatDate(fecha: string) {
  return new Date(fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ─── Main component ─── */
export default function AjustesStockPage() {
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [currentUserName, setCurrentUserName] = useState("Admin");

  // Fetch current user name from auth + usuarios table
  const userFetched = useRef(false);
  useEffect(() => {
    if (userFetched.current) return;
    userFetched.current = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("nombre")
          .eq("auth_id", user.id)
          .single();
        if (usuario?.nombre) setCurrentUserName(usuario.nombre);
      } catch (err) { console.error("Error loading stock:", err); }
    })();
  }, []);

  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fecha, setFecha] = useState(todayARG());
  const [usuario, setUsuario] = useState(currentUserName);
  const [motivoGlobal, setMotivoGlobal] = useState(MOTIVOS_GLOBALES[0]);
  const [observacion, setObservacion] = useState("");
  const [rows, setRows] = useState<AjusteRow[]>([]);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [tipoAjuste, setTipoAjuste] = useState<"egreso" | "ingreso" | "intercambio">("egreso");
  const [addDireccion, setAddDireccion] = useState<"in" | "out">("out");

  // Product search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHl, setSearchHl] = useState(0);
  const [productSearch, setProductSearch] = useState("");

  // Filters
  const [filterMode, setFilterMode] = useState<"day" | "month" | "range" | "all">("range");
  const [filterDay, setFilterDay] = useState(todayARG());
  const [filterMonth, setFilterMonth] = useState(currentMonthPadded());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterFrom, setFilterFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [filterTo, setFilterTo] = useState(todayARG());

  // Detail
  const [detailAjuste, setDetailAjuste] = useState<Ajuste | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);

  const codigoInputRef = useRef<HTMLInputElement>(null);
  const [presMap, setPresMap] = useState<Record<string, PresData[]>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    let ajQuery = supabase.from("ajustes_stock").select("*").order("created_at", { ascending: false }).limit(200);

    if (filterMode === "day") {
      ajQuery = ajQuery.eq("fecha", filterDay);
    } else if (filterMode === "month") {
      const m = filterMonth.padStart(2, "0");
      const start = `${filterYear}-${m}-01`;
      const nextMonth = Number(filterMonth) === 12 ? 1 : Number(filterMonth) + 1;
      const nextYear = Number(filterMonth) === 12 ? Number(filterYear) + 1 : Number(filterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      ajQuery = ajQuery.gte("fecha", start).lt("fecha", end);
    } else if (filterMode === "range" && filterFrom && filterTo) {
      ajQuery = ajQuery.gte("fecha", filterFrom).lte("fecha", filterTo);
    }

    const [{ data: aj }, { data: prods }, { data: presData }] = await Promise.all([
      ajQuery,
      supabase.from("productos").select("id, codigo, codigos_adicionales, nombre, stock, costo, unidad_medida, imagen_url").eq("activo", true).order("nombre").limit(10000),
      supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, costo, precio").gt("cantidad", 1).limit(5000),
    ]);
    setAjustes((aj as Ajuste[]) || []);
    setProductos((prods as Producto[]) || []);
    const pm: Record<string, PresData[]> = {};
    (presData || []).forEach((p: any) => { if (!pm[p.producto_id]) pm[p.producto_id] = []; pm[p.producto_id].push(p); });
    setPresMap(pm);
    setLoading(false);
  }, [filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo]);

  useEffect(() => {
    fetchData();
    const onFocus = () => fetchData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!dialogOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "F1") { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Delete" && selectedRowIdx !== null) {
        setRows((prev) => prev.filter((_, i) => i !== selectedRowIdx));
        setSelectedRowIdx(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen, selectedRowIdx]);

  const openNew = () => {
    setFecha(todayARG());
    setUsuario(currentUserName);
    setMotivoGlobal(MOTIVOS_GLOBALES[0]);
    setObservacion("");
    setTipoAjuste("egreso");
    setAddDireccion("out");
    setRows([]);
    setSelectedRowIdx(null);
    setDialogOpen(true);
  };

  const addProduct = (p: Producto, pres?: PresData) => {
    const motivo = motivoGlobal === MOTIVOS_GLOBALES[0] ? "" : motivoGlobal;
    const upp = pres ? pres.cantidad : 1;
    const hasCaja = upp > 1;
    // Costo per unit (always). If pres has cost-per-package, divide.
    const costoPorUnidad = pres
      ? (pres.costo ? pres.costo / upp : (p.costo || 0))
      : (p.costo || 0);
    const direccion: "in" | "out" | undefined = tipoAjuste === "intercambio" ? addDireccion : undefined;
    // Default: 1 caja if has upp, else 1 suelta
    const defaultCajas = hasCaja ? 1 : 0;
    const defaultSueltas = hasCaja ? 0 : 1;
    const defaultCantidad = defaultCajas * upp + defaultSueltas;
    setRows((prev) => {
      const existing = prev.findIndex((r) =>
        r.producto_id === p.id &&
        (r.unidades_por_presentacion || 1) === upp &&
        (r.direccion || null) === (direccion || null)
      );
      if (existing >= 0) {
        const next = [...prev];
        const newCajas = (next[existing].cajas || 0) + defaultCajas;
        const newSueltas = (next[existing].sueltas || 0) + defaultSueltas;
        const newQty = newCajas * upp + newSueltas;
        next[existing] = {
          ...next[existing],
          cajas: newCajas,
          sueltas: newSueltas,
          cantidad: newQty,
          subtotal: newQty * next[existing].costo,
        };
        return next;
      }
      return [...prev, {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        cantidad: defaultCantidad,
        unidad: p.unidad_medida || "UN",
        costo: costoPorUnidad,
        subtotal: defaultCantidad * costoPorUnidad,
        motivo,
        comentario: "",
        presentacion: pres ? pres.nombre : "Unidad",
        unidades_por_presentacion: upp,
        cajas: defaultCajas,
        sueltas: defaultSueltas,
        direccion,
      }];
    });
    setSearchOpen(false);
    setProductSearch("");
  };

  const updateRow = <K extends keyof AjusteRow>(idx: number, key: K, value: AjusteRow[K]) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      if (key === "cantidad" || key === "costo") {
        const qty = key === "cantidad" ? Number(value) : next[idx].cantidad;
        const cost = key === "costo" ? Number(value) : next[idx].costo;
        next[idx].subtotal = qty * cost;
      }
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setSelectedRowIdx(null);
  };

  const total = rows.reduce((a, r) => a + r.subtotal, 0);

  const handleSave = async () => {
    if (rows.length === 0) return;
    // Validation: intercambio must have at least one in and one out
    if (tipoAjuste === "intercambio") {
      const hasOut = rows.some((r) => r.direccion === "out" && r.cantidad > 0);
      const hasIn = rows.some((r) => r.direccion === "in" && r.cantidad > 0);
      if (!hasOut || !hasIn) {
        showAdminToast("Intercambio: cargá al menos un producto que SALE y uno que ENTRA", "error");
        return;
      }
      if (!observacion.trim()) {
        showAdminToast("Intercambio: la observación es obligatoria (describí la contraparte)", "error");
        return;
      }
    }
    setSaving(true);

    const motivoHeader = tipoAjuste === "intercambio" ? "Intercambio" : motivoGlobal;
    const { data: ajuste, error: ajusteError } = await supabase.from("ajustes_stock").insert({
      fecha, motivo: motivoHeader, observacion: observacion || null, usuario,
    }).select("id").single();

    if (ajusteError) {
      showAdminToast(`Error al crear ajuste: ${ajusteError.message}`, "error");
      setSaving(false);
      return;
    }

    if (ajuste) {
      for (const row of rows) {
        if (row.cantidad <= 0) continue;
        const prod = productos.find((p) => p.id === row.producto_id);
        if (!prod) continue;
        // cantidad is already total units (cajas * upp + sueltas)
        const totalUnits = row.cantidad;

        // Sign of the stock delta and tipo for stock_movimientos
        let delta: number;
        let tipoMov: string;
        if (tipoAjuste === "intercambio") {
          delta = row.direccion === "in" ? totalUnits : -totalUnits;
          tipoMov = "intercambio";
        } else if (tipoAjuste === "ingreso") {
          delta = totalUnits;
          tipoMov = "ajuste_ingreso";
        } else {
          delta = -totalUnits;
          tipoMov = "ajuste_egreso";
        }

        // En ajustes de stock permitimos stock negativo para poder registrar faltantes
        // que luego se reponen al ingresar mercadería.
        const { data: stockResult } = await supabase.rpc("atomic_update_stock", {
          p_producto_id: row.producto_id,
          p_change: delta,
          p_allow_negative: true,
        });

        const stockAntes = stockResult?.stock_antes ?? prod.stock;
        const stockDespues = stockResult?.stock_despues ?? (prod.stock + delta);

        if (delta < 0 && stockDespues < 0) {
          showAdminToast(`${prod.nombre} queda con stock negativo (${stockDespues}). Se repone al ingresar mercadería.`, "info");
        }

        await supabase.from("ajuste_stock_items").insert({
          ajuste_id: ajuste.id,
          producto_id: row.producto_id,
          cantidad: row.cantidad,
          stock_antes: stockAntes,
          stock_despues: stockDespues,
          direccion: row.direccion || null,
        });

        const descBase = tipoAjuste === "intercambio"
          ? `Intercambio ${row.direccion === "in" ? "entra" : "sale"}`
          : motivoGlobal;
        // Human-friendly qty breakdown: "2×15 + 3"
        const upp = row.unidades_por_presentacion || 1;
        const qtyDesc = upp > 1 && (row.cajas || 0) > 0
          ? ` (${row.cajas}×${upp}${(row.sueltas || 0) > 0 ? `+${row.sueltas}` : ""} = ${totalUnits} un.)`
          : ` (${totalUnits} un.)`;
        await supabase.from("stock_movimientos").insert({
          producto_id: row.producto_id,
          tipo: tipoMov,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          cantidad: delta,
          referencia: tipoAjuste === "intercambio" ? "Intercambio de stock" : `Ajuste de stock - ${motivoGlobal}`,
          descripcion: `${descBase}${qtyDesc}${row.comentario ? ` — ${row.comentario}` : ""}`,
          usuario,
          orden_id: ajuste.id,
        });
      }
    }

    logAudit({
      userName: usuario || "Admin",
      action: "CREATE",
      module: "stock",
      entityId: ajuste?.id,
      after: { tipo: tipoAjuste, motivo: motivoHeader, observacion, items: rows.length, total },
    });

    setDialogOpen(false);
    fetchData();
    setSaving(false);
  };

  const viewDetail = async (aj: Ajuste) => {
    setDetailAjuste(aj);
    const { data } = await supabase.from("ajuste_stock_items").select("*").eq("ajuste_id", aj.id);
    const itemsWithProd = (data || []).map((d: any) => ({
      ...d,
      producto: productos.find((p) => p.id === d.producto_id),
    }));
    setDetailItems(itemsWithProd);
  };

  const filteredSearch = productos.filter(
    (p) => norm(p.nombre).includes(norm(productSearch)) || norm(p.codigo).includes(norm(productSearch)) || ((p as any).codigos_adicionales || []).some((c: string) => norm(c).includes(norm(productSearch)))
  );

  if (dialogOpen) {
    return (
      <div className="flex flex-col h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b flex items-center justify-between shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDialogOpen(false)}
              className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Volver"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
              <PackageSearch className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">Nuevo ajuste de stock</h1>
              <p className="text-xs text-muted-foreground">Egresos, ingresos o intercambios de inventario</p>
            </div>
          </div>
        </div>

        {/* Form header fields */}
        <div className="px-4 sm:px-6 py-3 border-b shrink-0 bg-card">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Fecha</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 w-36 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Usuario</label>
              <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} className="h-8 w-40 text-sm" placeholder="Usuario" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Tipo de ajuste</label>
              <Select value={tipoAjuste} onValueChange={(v) => {
                if (!v) return;
                const newTipo = v as "egreso" | "ingreso" | "intercambio";
                setTipoAjuste(newTipo);
                if (newTipo === "intercambio") {
                  setRows((prev) => prev.map((r) => ({ ...r, direccion: r.direccion || "out" })));
                  setAddDireccion("out");
                } else {
                  setRows((prev) => prev.map((r) => ({ ...r, direccion: undefined })));
                }
              }}>
                <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="egreso">Egreso</SelectItem>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="intercambio">Intercambio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipoAjuste !== "intercambio" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Motivo</label>
                <Select value={motivoGlobal} onValueChange={(v) => {
                  if (!v) return;
                  setMotivoGlobal(v);
                  if (v !== MOTIVOS_GLOBALES[0]) setRows((prev) => prev.map((r) => ({ ...r, motivo: v })));
                }}>
                  <SelectTrigger className="h-8 w-64 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_GLOBALES.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tipoAjuste === "intercambio" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Próximo item</label>
                <div className="flex gap-1 border rounded-md p-0.5 bg-background">
                  <button type="button" onClick={() => setAddDireccion("out")} className={`px-3 h-7 rounded text-xs font-medium transition ${addDireccion === "out" ? "bg-red-100 text-red-700" : "text-muted-foreground hover:bg-muted"}`}>Sale</button>
                  <button type="button" onClick={() => setAddDireccion("in")} className={`px-3 h-7 rounded text-xs font-medium transition ${addDireccion === "in" ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:bg-muted"}`}>Entra</button>
                </div>
              </div>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Agregar producto <kbd className="ml-1 border rounded px-1 py-0.5 text-[10px] bg-background">F1</kbd>
            </Button>
          </div>
        </div>

        {/* Items table — scrollable body (desktop) */}
        <div className="flex-1 overflow-auto bg-muted/10 hidden lg:block">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-card backdrop-blur z-10 border-b">
              <tr>
                <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground w-40">Código</th>
                <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Producto</th>
                <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground w-20">Cajas</th>
                <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground w-20">Sueltas</th>
                <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground w-20">Total un.</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground w-28">Costo Unit.</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground w-24">Costo Caja</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground w-28">Subtotal</th>
                {motivoGlobal === MOTIVOS_GLOBALES[0] && tipoAjuste !== "intercambio" && (
                  <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground w-40">Motivo</th>
                )}
                <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Comentario</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-20 text-center text-muted-foreground text-sm bg-card">
                    <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    Presioná <kbd className="border rounded px-1.5 py-0.5 text-xs bg-muted">F1</kbd> o el botón <strong>Agregar producto</strong> para empezar
                  </td>
                </tr>
              )}
              {rows.map((row, idx) => (
                <tr
                  key={row.producto_id + idx}
                  onClick={() => setSelectedRowIdx(idx)}
                  className={`border-b cursor-pointer transition-colors ${
                    selectedRowIdx === idx ? "bg-blue-50 dark:bg-blue-950/20" :
                    row.direccion === "out" ? "bg-red-50/40 hover:bg-red-50" :
                    row.direccion === "in" ? "bg-emerald-50/40 hover:bg-emerald-50" :
                    "bg-card hover:bg-muted/30"
                  }`}
                >
                  <td className="py-1 px-3">
                    <div className="flex items-center gap-1.5">
                      {row.direccion === "out" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-red-300 text-red-700 bg-red-50">SALE</Badge>}
                      {row.direccion === "in" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-emerald-300 text-emerald-700 bg-emerald-50">ENTRA</Badge>}
                      <span className="font-mono text-xs text-muted-foreground">{row.codigo}</span>
                    </div>
                  </td>
                  <td className="py-1 px-3 font-medium text-sm">{row.nombre}</td>
                  <td className="py-1 px-3">
                    {(row.unidades_por_presentacion || 1) > 1 ? (
                      <Input
                        type="number"
                        min={0}
                        value={row.cajas ?? 0}
                        onChange={(e) => {
                          const newCajas = Math.max(0, Number(e.target.value));
                          setRows((prev) => prev.map((r, i) => {
                            if (i !== idx) return r;
                            const upp = r.unidades_por_presentacion || 1;
                            const sueltas = r.sueltas || 0;
                            const cantidad = newCajas * upp + sueltas;
                            return { ...r, cajas: newCajas, cantidad, subtotal: cantidad * r.costo };
                          }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-full text-center text-sm"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1 px-3">
                    <Input
                      type="number"
                      min={0}
                      value={row.sueltas ?? 0}
                      onChange={(e) => {
                        const newSueltas = Math.max(0, Number(e.target.value));
                        setRows((prev) => prev.map((r, i) => {
                          if (i !== idx) return r;
                          const upp = r.unidades_por_presentacion || 1;
                          const cajas = r.cajas || 0;
                          const cantidad = cajas * upp + newSueltas;
                          return { ...r, sueltas: newSueltas, cantidad, subtotal: cantidad * r.costo };
                        }));
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-full text-center text-sm"
                    />
                  </td>
                  <td className="py-1 px-3 text-center text-sm font-medium tabular-nums">
                    {row.cantidad}
                    {(row.unidades_por_presentacion || 1) > 1 && (row.cajas || 0) > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        {row.cajas}×{row.unidades_por_presentacion}{(row.sueltas || 0) > 0 && `+${row.sueltas}`}
                      </div>
                    )}
                  </td>
                  <td className="py-1 px-3">
                    <MoneyInput value={row.costo} onValueChange={(v) => updateRow(idx, "costo", v)} min={0} className="h-7 w-full text-right text-sm" />
                  </td>
                  <td className="py-1 px-3 text-right text-sm tabular-nums text-muted-foreground">
                    {(row.unidades_por_presentacion || 1) > 1
                      ? formatCurrency(row.costo * (row.unidades_por_presentacion || 1))
                      : "—"}
                  </td>
                  <td className="py-1 px-3 text-right text-sm font-medium tabular-nums">{formatCurrency(row.subtotal)}</td>
                  {motivoGlobal === MOTIVOS_GLOBALES[0] && tipoAjuste !== "intercambio" && (
                    <td className="py-1 px-3">
                      <Select value={row.motivo || MOTIVOS_ITEM[0]} onValueChange={(v) => v && updateRow(idx, "motivo", v)}>
                        <SelectTrigger className="h-7 text-xs" onClick={(e) => e.stopPropagation()}><SelectValue placeholder="Motivo" /></SelectTrigger>
                        <SelectContent>
                          {MOTIVOS_ITEM.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </td>
                  )}
                  <td className="py-1 px-3">
                    <Input value={row.comentario} onChange={(e) => updateRow(idx, "comentario", e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Comentario..." className="h-7 text-sm" />
                  </td>
                  <td className="py-1 px-2">
                    <button onClick={(e) => { e.stopPropagation(); removeRow(idx); }} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Items list — mobile view (cards) */}
        <div className="flex-1 overflow-auto bg-muted/10 lg:hidden p-3 space-y-2">
          {rows.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm bg-card rounded-lg">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
              Tocá <strong>Agregar producto</strong> para empezar
            </div>
          )}
          {rows.map((row, idx) => {
            const upp = row.unidades_por_presentacion || 1;
            return (
              <div
                key={row.producto_id + idx}
                className={`rounded-lg border p-3 space-y-2 ${
                  row.direccion === "out" ? "border-red-200 bg-red-50/40" :
                  row.direccion === "in" ? "border-emerald-200 bg-emerald-50/40" :
                  "bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {row.direccion === "out" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-red-300 text-red-700 bg-red-50">SALE</Badge>}
                      {row.direccion === "in" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-emerald-300 text-emerald-700 bg-emerald-50">ENTRA</Badge>}
                      <span className="font-mono text-[10px] text-muted-foreground">{row.codigo}</span>
                    </div>
                    <p className="font-medium text-sm mt-0.5 break-words">{row.nombre}</p>
                  </div>
                  <button onClick={() => removeRow(idx)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {upp > 1 ? (
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium">Cajas</label>
                      <Input
                        type="number"
                        min={0}
                        value={row.cajas ?? 0}
                        onChange={(e) => {
                          const newCajas = Math.max(0, Number(e.target.value));
                          setRows((prev) => prev.map((r, i) => {
                            if (i !== idx) return r;
                            const cantidad = newCajas * upp + (r.sueltas || 0);
                            return { ...r, cajas: newCajas, cantidad, subtotal: cantidad * r.costo };
                          }));
                        }}
                        className="h-8 text-center text-sm"
                      />
                    </div>
                  ) : <div />}
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Sueltas</label>
                    <Input
                      type="number"
                      min={0}
                      value={row.sueltas ?? 0}
                      onChange={(e) => {
                        const newSueltas = Math.max(0, Number(e.target.value));
                        setRows((prev) => prev.map((r, i) => {
                          if (i !== idx) return r;
                          const cantidad = (r.cajas || 0) * upp + newSueltas;
                          return { ...r, sueltas: newSueltas, cantidad, subtotal: cantidad * r.costo };
                        }));
                      }}
                      className="h-8 text-center text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Total un.</label>
                    <div className="h-8 flex items-center justify-center border rounded-md bg-muted/30 text-sm font-semibold">
                      {row.cantidad}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Costo unit.</label>
                    <MoneyInput value={row.costo} onValueChange={(v) => updateRow(idx, "costo", v)} min={0} className="h-8 text-right text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Subtotal</label>
                    <div className="h-8 flex items-center justify-end px-2 border rounded-md bg-muted/30 text-sm font-semibold tabular-nums">
                      {formatCurrency(row.subtotal)}
                    </div>
                  </div>
                </div>
                {motivoGlobal === MOTIVOS_GLOBALES[0] && tipoAjuste !== "intercambio" && (
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium">Motivo</label>
                    <Select value={row.motivo || MOTIVOS_ITEM[0]} onValueChange={(v) => v && updateRow(idx, "motivo", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MOTIVOS_ITEM.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Input
                  value={row.comentario}
                  onChange={(e) => updateRow(idx, "comentario", e.target.value)}
                  placeholder="Comentario..."
                  className="h-8 text-sm"
                />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t bg-card shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">
                Observación {tipoAjuste === "intercambio" && <span className="text-red-500">(obligatoria — describí la contraparte)</span>}
              </label>
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                rows={2}
                placeholder={tipoAjuste === "intercambio" ? "Ej: Canje con proveedor X, cliente que devolvió Y..." : "Observaciones..."}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-background resize-none outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="shrink-0 text-right space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Total</span>
                <div className="border rounded-md px-3 py-1.5 bg-background text-base font-bold tabular-nums w-40 text-right">
                  {formatCurrency(total)}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={handleSave} disabled={rows.length === 0 || saving} className="min-w-[100px]">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Product search (reused as dialog in new-view) */}
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Agregar producto {tipoAjuste === "intercambio" && <span className={`text-xs font-normal ${addDireccion === "out" ? "text-red-600" : "text-emerald-600"}`}>({addDireccion === "out" ? "SALE" : "ENTRA"})</span>}</DialogTitle></DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={codigoInputRef}
                placeholder="Buscar por nombre o código..."
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setSearchHl(0); }}
                onKeyDown={(e) => {
                  const results = filteredSearch.slice(0, 20);
                  if (e.key === "ArrowDown") { e.preventDefault(); setSearchHl((h) => { const next = Math.min(h + 1, results.length - 1); document.querySelector(`[data-saidx="${next}"]`)?.scrollIntoView({ block: "nearest" }); return next; }); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setSearchHl((h) => { const next = Math.max(h - 1, 0); document.querySelector(`[data-saidx="${next}"]`)?.scrollIntoView({ block: "nearest" }); return next; }); }
                  else if (e.key === "Enter" && results[searchHl]) { e.preventDefault(); addProduct(results[searchHl]); setSearchOpen(false); setProductSearch(""); }
                }}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredSearch.slice(0, 20).map((p, pIdx) => {
                const pres = presMap[p.id];
                const isHl = pIdx === searchHl;
                return (
                  <div key={p.id} data-saidx={pIdx} className={`rounded-xl border p-3 transition-colors ${isHl ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/30 hover:bg-primary/5"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {(p as any).imagen_url ? (<img src={(p as any).imagen_url} alt="" className="w-full h-full object-cover" />) : (<Package className="w-5 h-5 text-muted-foreground/30" />)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.nombre}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono">{p.codigo}</span>
                          <span>·</span>
                          <span>Stock: <strong className={p.stock <= 0 ? "text-red-500" : ""}>{p.stock}</strong></span>
                          <span>·</span>
                          <span>Costo: {formatCurrency(p.costo)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => { addProduct(p); setSearchOpen(false); setProductSearch(""); }} className="flex-1 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted transition">+ Unidad</button>
                      {pres && pres.map((pr) => (
                        <button key={pr.id} onClick={() => { addProduct(p, pr); setSearchOpen(false); setProductSearch(""); }} className="flex-1 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition">+ {pr.nombre} ({pr.cantidad} un.)</button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filteredSearch.length === 0 && (<p className="text-center py-6 text-sm text-muted-foreground">Sin resultados</p>)}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <PackageSearch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Ajustes de Stock</h1>
            <p className="text-sm text-muted-foreground">Registro de ajustes de inventario</p>
          </div>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />Nuevo Ajuste
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <Select value={filterMode} onValueChange={(v) => setFilterMode((v ?? "day") as "day" | "month" | "range" | "all")}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="month">Mensual</SelectItem>
              <SelectItem value="range">Entre fechas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filterMode === "day" && (
          <Input type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="w-40" />
        )}
        {filterMode === "month" && (
          <>
            <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? "1")}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Mes" /></SelectTrigger>
              <SelectContent>
                {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="w-20" />
          </>
        )}
        {filterMode === "range" && (
          <>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-40" />
            </div>
          </>
        )}
      </div>

      {/* History table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : ajustes.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay ajustes registrados</p>
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="border rounded-lg overflow-hidden overflow-x-auto hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground text-xs">
                  <th className="text-left py-2.5 px-4 font-medium">Fecha</th>
                  <th className="text-left py-2.5 px-4 font-medium">Usuario</th>
                  <th className="text-left py-2.5 px-4 font-medium">Motivo</th>
                  <th className="text-left py-2.5 px-4 font-medium">Observación</th>
                  <th className="text-right py-2.5 px-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ajustes.map((aj) => (
                  <tr key={aj.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => viewDetail(aj)}>
                    <td className="py-2.5 px-4">{formatDate(aj.fecha)}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{aj.usuario || "—"}</td>
                    <td className="py-2.5 px-4"><Badge variant="outline">{aj.motivo}</Badge></td>
                    <td className="py-2.5 px-4 text-muted-foreground text-xs">{aj.observacion || "—"}</td>
                    <td className="py-2.5 px-4 text-right">
                      <Badge variant="secondary" className="cursor-pointer">Ver detalle</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="lg:hidden space-y-2">
            {ajustes.map((aj) => {
              const isIntercambio = aj.motivo === "Intercambio";
              return (
                <button
                  key={aj.id}
                  onClick={() => viewDetail(aj)}
                  className="w-full text-left rounded-lg border p-3 bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold">{formatDate(aj.fecha)}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${isIntercambio ? "border-violet-300 text-violet-700 bg-violet-50" : ""}`}
                    >
                      {aj.motivo}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{aj.usuario || "—"}</span>
                  </div>
                  {aj.observacion && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{aj.observacion}</p>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Detail dialog */}
      {detailAjuste && (
        <Dialog open={!!detailAjuste} onOpenChange={() => setDetailAjuste(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Ajuste de stock — {formatDate(detailAjuste.fecha)}</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground mb-3">
              <span className="font-medium">{detailAjuste.motivo}</span>
              {detailAjuste.observacion && <span> · {detailAjuste.observacion}</span>}
              {detailAjuste.usuario && <span> · {detailAjuste.usuario}</span>}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">Producto</th>
                    <th className="text-center py-2 px-3 font-medium">Cant.</th>
                    <th className="text-right py-2 px-3 font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((item, i) => (
                    <tr key={i} className={`border-b last:border-0 ${item.direccion === "out" ? "bg-red-50/40" : item.direccion === "in" ? "bg-emerald-50/40" : ""}`}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          {item.direccion === "out" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-red-300 text-red-700 bg-red-50">SALE</Badge>}
                          {item.direccion === "in" && <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-semibold border-emerald-300 text-emerald-700 bg-emerald-50">ENTRA</Badge>}
                          <p className="font-medium">{item.producto?.nombre || item.producto_id}</p>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.producto?.codigo}</p>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant={item.stock_despues >= item.stock_antes ? "default" : "destructive"}>
                          {item.stock_despues >= item.stock_antes ? "+" : "-"}{item.cantidad}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right text-xs text-muted-foreground">
                        {item.stock_antes} → {item.stock_despues}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
