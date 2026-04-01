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
  const [tipoAjuste, setTipoAjuste] = useState<"egreso" | "ingreso">("egreso");

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

    const [{ data: aj }, { data: prods }] = await Promise.all([
      ajQuery,
      supabase.from("productos").select("id, codigo, nombre, stock, costo, unidad_medida, imagen_url").eq("activo", true).order("nombre").limit(10000),
    ]);
    setAjustes((aj as Ajuste[]) || []);
    setProductos((prods as Producto[]) || []);
    // Load presentations
    const { data: presData } = await supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, costo, precio").gt("cantidad", 1);
    const pm: Record<string, PresData[]> = {};
    (presData || []).forEach((p: any) => { if (!pm[p.producto_id]) pm[p.producto_id] = []; pm[p.producto_id].push(p); });
    setPresMap(pm);
    setLoading(false);
  }, [filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    setRows([]);
    setSelectedRowIdx(null);
    setDialogOpen(true);
  };

  const addProduct = (p: Producto, pres?: PresData) => {
    const motivo = motivoGlobal === MOTIVOS_GLOBALES[0] ? "" : motivoGlobal;
    const upp = pres ? pres.cantidad : 1;
    const presLabel = pres ? pres.nombre : "Unidad";
    const costo = pres ? (pres.costo || p.costo * upp) : (p.costo || 0);
    const key = `${p.id}_${presLabel}`;
    setRows((prev) => {
      const existing = prev.findIndex((r) => r.producto_id === p.id && (r.presentacion || "Unidad") === presLabel);
      if (existing >= 0) {
        const next = [...prev];
        const newQty = next[existing].cantidad + 1;
        next[existing] = { ...next[existing], cantidad: newQty, subtotal: newQty * next[existing].costo };
        return next;
      }
      return [...prev, {
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        cantidad: 1,
        unidad: pres ? `x${upp} un` : (p.unidad_medida || "UN"),
        costo,
        subtotal: costo,
        motivo,
        comentario: "",
        presentacion: presLabel,
        unidades_por_presentacion: upp,
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
    setSaving(true);

    const { data: ajuste, error: ajusteError } = await supabase.from("ajustes_stock").insert({
      fecha, motivo: motivoGlobal, observacion: observacion || null, usuario,
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
        const upp = row.unidades_por_presentacion || 1;
        const totalUnits = row.cantidad * upp;
        const motivo = motivoGlobal;

        // Atomic stock update via RPC
        const { data: stockResult } = await supabase.rpc("atomic_update_stock", {
          p_producto_id: row.producto_id,
          p_change: tipoAjuste === "ingreso" ? totalUnits : -totalUnits,
        });

        const stockAntes = stockResult?.stock_antes ?? prod.stock;
        const stockDespues = stockResult?.stock_despues ?? (tipoAjuste === "ingreso" ? prod.stock + totalUnits : Math.max(0, prod.stock - totalUnits));

        if (tipoAjuste !== "ingreso" && stockAntes - totalUnits < 0) {
          showAdminToast(`Stock insuficiente. Se ajustó a 0 (faltaban ${totalUnits - stockAntes} unidades)`, "info");
        }

        await supabase.from("ajuste_stock_items").insert({
          ajuste_id: ajuste.id,
          producto_id: row.producto_id,
          cantidad: row.cantidad,
          stock_antes: stockAntes,
          stock_despues: stockDespues,
        });

        await supabase.from("stock_movimientos").insert({
          producto_id: row.producto_id,
          tipo: tipoAjuste === "ingreso" ? "ajuste_ingreso" : "ajuste_egreso",
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          cantidad: tipoAjuste === "ingreso" ? totalUnits : -totalUnits,
          referencia: `Ajuste de stock - ${motivo}`,
          descripcion: `${motivo}${row.presentacion && row.presentacion !== "Unidad" ? ` (${row.cantidad} ${row.presentacion})` : ""}${row.comentario ? ` — ${row.comentario}` : ""}`,
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
      after: { motivo: motivoGlobal, observacion, items: rows.length, total },
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
    (p) => norm(p.nombre).includes(norm(productSearch)) || norm(p.codigo).includes(norm(productSearch))
  );

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
        <div className="border rounded-lg overflow-hidden overflow-x-auto">
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
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-3">
                        <p className="font-medium">{item.producto?.nombre || item.producto_id}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.producto?.codigo}</p>
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

      {/* New ajuste dialog — full screen style */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="text-base font-semibold">Ajuste de Stock</DialogTitle>
          </DialogHeader>

          {/* Form header */}
          <div className="px-6 py-3 border-b shrink-0 bg-muted/20">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Fecha</label>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Usuario</label>
                <Input
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className="h-8 w-40 text-sm"
                  placeholder="Usuario"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Motivo</label>
                <Select value={motivoGlobal} onValueChange={(v) => {
                  if (!v) return;
                  setMotivoGlobal(v);
                  // If not "por artículo", apply to all rows
                  if (v !== MOTIVOS_GLOBALES[0]) {
                    setRows((prev) => prev.map((r) => ({ ...r, motivo: v })));
                  }
                }}>
                  <SelectTrigger className="h-8 w-64 text-sm">
                    <SelectValue placeholder="Motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_GLOBALES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Tipo de ajuste</label>
                <Select value={tipoAjuste} onValueChange={(v) => v && setTipoAjuste(v as "egreso" | "ingreso")}>
                  <SelectTrigger className="h-8 w-40 text-sm">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="egreso">Egreso</SelectItem>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground w-28">Código</th>
                  <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Nombre</th>
                  <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground w-24">Cantidad</th>
                  <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground w-16">Med</th>
                  <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground w-28">Costo</th>
                  <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground w-28">Subtotal</th>
                  {motivoGlobal === MOTIVOS_GLOBALES[0] && (
                    <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground w-44">Motivo</th>
                  )}
                  <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Comentario</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">
                      Presioná <kbd className="border rounded px-1 py-0.5 text-xs bg-muted">F1</kbd> o el botón <strong>Agregar</strong> para agregar productos
                    </td>
                  </tr>
                )}
                {rows.map((row, idx) => (
                  <tr
                    key={row.producto_id + idx}
                    onClick={() => setSelectedRowIdx(idx)}
                    className={`border-b cursor-pointer transition-colors ${selectedRowIdx === idx ? "bg-blue-50 dark:bg-blue-950/20" : "hover:bg-muted/30"}`}
                  >
                    <td className="py-1 px-3">
                      <span className="font-mono text-xs text-muted-foreground">{row.codigo}</span>
                    </td>
                    <td className="py-1 px-3 font-medium text-sm">{row.nombre}</td>
                    <td className="py-1 px-3">
                      <Input
                        type="number"
                        min={1}
                        value={row.cantidad}
                        onChange={(e) => updateRow(idx, "cantidad", Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-full text-center text-sm"
                      />
                    </td>
                    <td className="py-1 px-3 text-center text-xs text-muted-foreground">{row.unidad}</td>
                    <td className="py-1 px-3">
                      <MoneyInput
                        value={row.costo}
                        onValueChange={(v) => updateRow(idx, "costo", v)}
                        min={0}
                        className="h-7 w-full text-right text-sm"
                      />
                    </td>
                    <td className="py-1 px-3 text-right text-sm font-medium tabular-nums">
                      {formatCurrency(row.subtotal)}
                    </td>
                    {motivoGlobal === MOTIVOS_GLOBALES[0] && (
                      <td className="py-1 px-3">
                        <Select
                          value={row.motivo || MOTIVOS_ITEM[0]}
                          onValueChange={(v) => v && updateRow(idx, "motivo", v)}
                        >
                          <SelectTrigger className="h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                            <SelectValue placeholder="Motivo" />
                          </SelectTrigger>
                          <SelectContent>
                            {MOTIVOS_ITEM.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    <td className="py-1 px-3">
                      <Input
                        value={row.comentario}
                        onChange={(e) => updateRow(idx, "comentario", e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Comentario..."
                        className="h-7 text-sm"
                      />
                    </td>
                    <td className="py-1 px-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); removeRow(idx); }}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t bg-muted/20 shrink-0">
            <div className="flex items-end gap-4">
              {/* Left: buttons + obs */}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Agregar <kbd className="ml-1 border rounded px-1 py-0.5 text-[10px] bg-background">F1</kbd>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedRowIdx === null}
                  onClick={() => selectedRowIdx !== null && removeRow(selectedRowIdx)}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  Quitar <kbd className="ml-1 border rounded px-1 py-0.5 text-[10px] bg-background">Supr</kbd>
                </Button>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Obs.</label>
                <textarea
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  rows={2}
                  placeholder="Observaciones..."
                  className="w-full border rounded-md px-2 py-1 text-sm bg-background resize-none outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {/* Right: total + actions */}
              <div className="shrink-0 text-right space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">Total</span>
                  <div className="border rounded-md px-3 py-1 bg-background text-sm font-bold tabular-nums w-36 text-right">
                    {formatCurrency(total)}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={rows.length === 0 || saving}
                    className="min-w-[90px]"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product search */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Agregar producto</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={codigoInputRef}
              placeholder="Buscar por nombre o código..."
              value={productSearch}
              onChange={(e) => { setProductSearch(e.target.value); setSearchHl(0); }}
              onKeyDown={(e) => {
                const results = filteredSearch.slice(0, 20);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSearchHl((h) => { const next = Math.min(h + 1, results.length - 1); document.querySelector(`[data-saidx="${next}"]`)?.scrollIntoView({ block: "nearest" }); return next; });
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSearchHl((h) => { const next = Math.max(h - 1, 0); document.querySelector(`[data-saidx="${next}"]`)?.scrollIntoView({ block: "nearest" }); return next; });
                } else if (e.key === "Enter" && results[searchHl]) { e.preventDefault(); addProduct(results[searchHl]); setSearchOpen(false); setProductSearch(""); }
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
                      {(p as any).imagen_url ? (
                        <img src={(p as any).imagen_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-5 h-5 text-muted-foreground/30" />
                      )}
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
                    <button
                      onClick={() => { addProduct(p); setSearchOpen(false); setProductSearch(""); }}
                      className="flex-1 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted transition"
                    >
                      + Unidad
                    </button>
                    {pres && pres.map((pr) => (
                      <button
                        key={pr.id}
                        onClick={() => { addProduct(p, pr); setSearchOpen(false); setProductSearch(""); }}
                        className="flex-1 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition"
                      >
                        + {pr.nombre} ({pr.cantidad} un.)
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredSearch.length === 0 && (
              <p className="text-center py-6 text-sm text-muted-foreground">Sin resultados</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
