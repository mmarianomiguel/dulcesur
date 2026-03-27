"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  formatCurrency,
  todayARG,
  currentMonthPadded,
  formatDateARG,
  initials,
  nowTimeARG,
} from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Search,
  Loader2,
  Plus,
  UserPlus,
  Package,
  Link2,
  Copy,
  Check,
  ShoppingBasket,
  Users,
  Undo2,
} from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";

/* ─── Types ─── */
interface Miembro {
  id: string;
  nombre: string;
  pin: string | null;
  activo: boolean;
  created_at: string;
}

interface Consumo {
  id: string;
  miembro_id: string;
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  fecha: string;
  hora: string;
  created_at: string;
}

interface Producto {
  id: string;
  nombre: string;
  codigo: string;
  stock: number;
  costo: number;
  precio: number;
}

type QuickPeriod = "today" | "week" | "month" | "custom";

/* ─── Colours for initials avatars ─── */
const COLORS = [
  "bg-purple-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];
function colorForIndex(i: number) {
  return COLORS[i % COLORS.length];
}

/* ─── Generate random 4-digit PIN ─── */
function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function AutoconsumoPage() {
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [loading, setLoading] = useState(true);

  // Period selector
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>("month");
  const [filterMode, setFilterMode] = useState<"day" | "month" | "range">("day");
  const [filterDay, setFilterDay] = useState(todayARG());
  const [filterMonth, setFilterMonth] = useState(currentMonthPadded());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterFrom, setFilterFrom] = useState(todayARG());
  const [filterTo, setFilterTo] = useState(todayARG());

  // Summary per member
  const [summary, setSummary] = useState<Record<string, { items: number; total: number }>>({});

  // Detail view
  const [selectedMiembro, setSelectedMiembro] = useState<Miembro | null>(null);
  const [consumos, setConsumos] = useState<Consumo[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add consumption
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Producto[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [addingConsumo, setAddingConsumo] = useState(false);

  // Add member dialog
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPin, setNewMemberPin] = useState(generatePin());
  const [savingMember, setSavingMember] = useState(false);

  // Link copy
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Date range computation
  const dateRange = useMemo(() => {
    if (quickPeriod === "today") {
      const today = todayARG();
      return { from: today, to: today };
    }
    if (quickPeriod === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const mondayStr = monday.toLocaleDateString("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
      });
      return { from: mondayStr, to: todayARG() };
    }
    if (quickPeriod === "month") {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
      return { from: firstDay, to: todayARG() };
    }
    // custom
    if (filterMode === "day") {
      return { from: filterDay, to: filterDay };
    }
    if (filterMode === "month") {
      const y = parseInt(filterYear);
      const m = parseInt(filterMonth);
      const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      return { from: firstDay, to: lastDay };
    }
    return { from: filterFrom, to: filterTo };
  }, [quickPeriod, filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo]);

  // Fetch members
  const fetchMiembros = useCallback(async () => {
    const { data } = await supabase
      .from("miembros_familia")
      .select("*")
      .eq("activo", true)
      .order("nombre");
    setMiembros(data || []);
  }, []);

  // Fetch summary for all members in date range
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("autoconsumo")
      .select("miembro_id, cantidad, costo_total")
      .gte("fecha", dateRange.from)
      .lte("fecha", dateRange.to);

    const map: Record<string, { items: number; total: number }> = {};
    for (const row of data || []) {
      if (!map[row.miembro_id]) map[row.miembro_id] = { items: 0, total: 0 };
      map[row.miembro_id].items += row.cantidad;
      map[row.miembro_id].total += row.costo_total;
    }
    setSummary(map);
    setLoading(false);
  }, [dateRange]);

  // Fetch detail consumos for a member
  const fetchConsumos = useCallback(
    async (miembroId: string) => {
      setLoadingDetail(true);
      const { data } = await supabase
        .from("autoconsumo")
        .select("*")
        .eq("miembro_id", miembroId)
        .gte("fecha", dateRange.from)
        .lte("fecha", dateRange.to)
        .order("fecha", { ascending: false })
        .order("hora", { ascending: false });
      setConsumos(data || []);
      setLoadingDetail(false);
    },
    [dateRange]
  );

  useEffect(() => {
    fetchMiembros();
  }, [fetchMiembros]);

  useEffect(() => {
    if (miembros.length >= 0) fetchSummary();
  }, [fetchSummary, miembros.length]);

  useEffect(() => {
    if (selectedMiembro) fetchConsumos(selectedMiembro.id);
  }, [selectedMiembro, fetchConsumos]);

  // Product search
  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingProducts(true);
      const term = productSearch.trim();

      // Search by barcode first
      const { data: byCode } = await supabase
        .from("productos")
        .select("id, nombre, codigo, stock, costo, precio")
        .eq("codigo", term)
        .eq("activo", true)
        .limit(5);

      if (byCode && byCode.length > 0) {
        setSearchResults(byCode);
        setSearchingProducts(false);
        return;
      }

      // Search by name
      const { data: byName } = await supabase
        .from("productos")
        .select("id, nombre, codigo, stock, costo, precio")
        .ilike("nombre", `%${term}%`)
        .eq("activo", true)
        .order("nombre")
        .limit(10);

      setSearchResults(byName || []);
      setSearchingProducts(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [productSearch]);

  // Add consumption
  const handleAddConsumo = async () => {
    if (!selectedMiembro || !selectedProduct) return;
    const qty = parseFloat(cantidad) || 0;
    if (qty <= 0) {
      showAdminToast("Ingrese una cantidad valida", "error");
      return;
    }
    if (selectedProduct.stock < qty) {
      showAdminToast("Stock insuficiente", "error");
      return;
    }

    setAddingConsumo(true);
    const hoy = todayARG();
    const hora = nowTimeARG();
    const costoTotal = selectedProduct.costo * qty;
    const stockAntes = selectedProduct.stock;
    const stockDespues = stockAntes - qty;

    // Insert autoconsumo record
    const { error: errConsumo } = await supabase.from("autoconsumo").insert({
      miembro_id: selectedMiembro.id,
      producto_id: selectedProduct.id,
      producto_nombre: selectedProduct.nombre,
      cantidad: qty,
      costo_unitario: selectedProduct.costo,
      costo_total: costoTotal,
      fecha: hoy,
      hora,
    });

    if (errConsumo) {
      showAdminToast("Error al registrar consumo", "error");
      setAddingConsumo(false);
      return;
    }

    // Decrement stock
    await supabase
      .from("productos")
      .update({ stock: stockDespues })
      .eq("id", selectedProduct.id);

    // Register stock movement
    await supabase.from("stock_movimientos").insert({
      producto_id: selectedProduct.id,
      tipo: "autoconsumo",
      cantidad_antes: stockAntes,
      cantidad_despues: stockDespues,
      cantidad: -qty,
      referencia: `Autoconsumo - ${selectedMiembro.nombre}`,
      descripcion: `Autoconsumo de ${qty} x ${selectedProduct.nombre} por ${selectedMiembro.nombre}`,
      usuario: selectedMiembro.nombre,
    });

    showAdminToast("Consumo registrado", "success");
    setSelectedProduct(null);
    setProductSearch("");
    setCantidad("1");
    setAddingConsumo(false);

    // Refresh
    fetchConsumos(selectedMiembro.id);
    fetchSummary();
  };

  // Add new member
  const handleAddMember = async () => {
    if (!newMemberName.trim()) {
      showAdminToast("Ingrese un nombre", "error");
      return;
    }
    setSavingMember(true);

    const pin = newMemberPin.trim() || generatePin();

    // Check unique pin
    const { data: existing } = await supabase
      .from("miembros_familia")
      .select("id")
      .eq("pin", pin)
      .limit(1);

    if (existing && existing.length > 0) {
      showAdminToast("El PIN ya existe, use otro", "error");
      setSavingMember(false);
      return;
    }

    const { error } = await supabase.from("miembros_familia").insert({
      nombre: newMemberName.trim(),
      pin,
      activo: true,
    });

    if (error) {
      showAdminToast("Error al agregar miembro", "error");
      setSavingMember(false);
      return;
    }

    showAdminToast("Miembro agregado", "success");
    setMemberDialogOpen(false);
    setNewMemberName("");
    setNewMemberPin(generatePin());
    setSavingMember(false);
    fetchMiembros();
  };

  // Copy link
  const handleCopyLink = (pin: string, id: string) => {
    const url = `${window.location.origin}/autoconsumo/${pin}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Totals
  const totalGeneral = useMemo(() => {
    return Object.values(summary).reduce((acc, s) => acc + s.total, 0);
  }, [summary]);

  const totalItems = useMemo(() => {
    return Object.values(summary).reduce((acc, s) => acc + s.items, 0);
  }, [summary]);

  /* ─── Detail consumos summary ─── */
  const detailSummary = useMemo(() => {
    const items = consumos.reduce((acc, c) => acc + c.cantidad, 0);
    const total = consumos.reduce((acc, c) => acc + c.costo_total, 0);
    return { items, total };
  }, [consumos]);

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */

  // Detail view for a selected member
  if (selectedMiembro) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedMiembro(null);
              setSelectedProduct(null);
              setProductSearch("");
              setConsumos([]);
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {selectedMiembro.nombre}
            </h1>
            <p className="text-sm text-muted-foreground">
              Detalle de autoconsumo
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Items consumidos</div>
              <div className="text-2xl font-bold mt-1">
                {detailSummary.items}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Costo total</div>
              <div className="text-2xl font-bold mt-1">
                {formatCurrency(detailSummary.total)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add consumption section */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Agregar consumo
            </h3>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto por nombre o codigo..."
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setSelectedProduct(null);
                  }}
                  className="pl-9"
                />
              </div>
              {selectedProduct && (
                <>
                  <div className="w-24">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                      placeholder="Cant."
                    />
                  </div>
                  <Button
                    onClick={handleAddConsumo}
                    disabled={addingConsumo}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {addingConsumo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Confirmar"
                    )}
                  </Button>
                </>
              )}
            </div>

            {/* Selected product preview */}
            {selectedProduct && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-purple-50 dark:bg-purple-950/20">
                <Package className="h-5 w-5 text-purple-600" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{selectedProduct.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    Codigo: {selectedProduct.codigo || "—"} | Stock: {selectedProduct.stock} | Costo: {formatCurrency(selectedProduct.costo, true)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatCurrency(selectedProduct.costo * (parseFloat(cantidad) || 0), true)}
                  </p>
                  <p className="text-xs text-muted-foreground">costo total</p>
                </div>
              </div>
            )}

            {/* Search results */}
            {!selectedProduct && productSearch.trim() && (
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {searchingProducts ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                    Buscando...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No se encontraron productos
                  </div>
                ) : (
                  searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        setSearchResults([]);
                        setCantidad("1");
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 border-b last:border-b-0 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{p.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.codigo || "Sin codigo"} | Stock: {p.stock}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {formatCurrency(p.costo, true)}
                          </p>
                          <p className="text-xs text-muted-foreground">costo</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Consumptions table */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-sm mb-4">Historial de consumos</h3>

            {loadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              </div>
            ) : consumos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay consumos en este periodo
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 font-medium">Fecha / Hora</th>
                        <th className="pb-3 font-medium">Producto</th>
                        <th className="pb-3 font-medium text-right">Cant.</th>
                        <th className="pb-3 font-medium text-right">Costo unit.</th>
                        <th className="pb-3 font-medium text-right">Costo total</th>
                        <th className="pb-3 font-medium text-right w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumos.map((c, idx) => {
                        const fechaShort = c.fecha
                          ? `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}`
                          : "—";
                        const horaShort = c.hora?.slice(0, 5) || "";
                        return (
                          <tr
                            key={c.id}
                            className={`border-b last:border-b-0 ${idx % 2 === 1 ? "bg-gray-50 dark:bg-muted/30" : ""}`}
                          >
                            <td className="py-4 text-muted-foreground">
                              {fechaShort}
                              {horaShort && (
                                <span className="mx-1.5 text-muted-foreground/50">&middot;</span>
                              )}
                              {horaShort}
                            </td>
                            <td className="py-4 font-semibold text-foreground">{c.producto_nombre}</td>
                            <td className="py-4 text-right">{c.cantidad}</td>
                            <td className="py-4 text-right text-muted-foreground">{formatCurrency(c.costo_unitario, true)}</td>
                            <td className="py-4 text-right font-semibold text-foreground">{formatCurrency(c.costo_total, true)}</td>
                            <td className="py-4 text-right">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <button
                                      onClick={async () => {
                                        if (!confirm(`¿Anular retiro de ${c.cantidad} ${c.producto_nombre}? Se devolverá el stock.`)) return;
                                        const { data: prod } = await supabase.from("productos").select("stock").eq("id", c.producto_id).single();
                                        const stockAntes = prod?.stock ?? 0;
                                        const newStock = stockAntes + c.cantidad;
                                        await supabase.from("productos").update({ stock: newStock }).eq("id", c.producto_id);
                                        await supabase.from("stock_movimientos").insert({
                                          producto_id: c.producto_id,
                                          tipo: "ajuste",
                                          cantidad_antes: stockAntes,
                                          cantidad_despues: newStock,
                                          cantidad: c.cantidad,
                                          referencia: "Anulación autoconsumo",
                                          descripcion: `Anulación autoconsumo - ${c.producto_nombre} (${selectedMiembro?.nombre})`,
                                          usuario: "Admin",
                                        });
                                        await supabase.from("autoconsumo").delete().eq("id", c.id);
                                        setConsumos((prev) => prev.filter((x) => x.id !== c.id));
                                        fetchSummary();
                                        showAdminToast("Consumo anulado, stock devuelto", "success");
                                      }}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                    >
                                      <Undo2 className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">Anular consumo</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold">
                        <td colSpan={4} className="py-4 text-right">
                          Total
                        </td>
                        <td className="py-4 text-right">
                          {formatCurrency(detailSummary.total, true)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="sm:hidden space-y-2">
                  {consumos.map((c, idx) => {
                    const fechaShort = c.fecha
                      ? `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}`
                      : "—";
                    const horaShort = c.hora?.slice(0, 5) || "";
                    return (
                      <div
                        key={c.id}
                        className={`rounded-lg border p-3.5 ${idx % 2 === 1 ? "bg-gray-50 dark:bg-muted/30" : "bg-background"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {c.producto_nombre}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {fechaShort}
                              {horaShort && ` \u00b7 ${horaShort}`}
                              {" \u00b7 "}x{c.cantidad}
                              {" \u00b7 "}unit. {formatCurrency(c.costo_unitario, true)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-semibold text-sm text-foreground">
                              {formatCurrency(c.costo_total, true)}
                            </span>
                            <button
                              onClick={async () => {
                                if (!confirm(`¿Anular retiro de ${c.cantidad} ${c.producto_nombre}? Se devolverá el stock.`)) return;
                                const { data: prod } = await supabase.from("productos").select("stock").eq("id", c.producto_id).single();
                                const stockAntes = prod?.stock ?? 0;
                                const newStock = stockAntes + c.cantidad;
                                await supabase.from("productos").update({ stock: newStock }).eq("id", c.producto_id);
                                await supabase.from("stock_movimientos").insert({
                                  producto_id: c.producto_id,
                                  tipo: "ajuste",
                                  cantidad_antes: stockAntes,
                                  cantidad_despues: newStock,
                                  cantidad: c.cantidad,
                                  referencia: "Anulación autoconsumo",
                                  descripcion: `Anulación autoconsumo - ${c.producto_nombre} (${selectedMiembro?.nombre})`,
                                  usuario: "Admin",
                                });
                                await supabase.from("autoconsumo").delete().eq("id", c.id);
                                setConsumos((prev) => prev.filter((x) => x.id !== c.id));
                                fetchSummary();
                                showAdminToast("Consumo anulado, stock devuelto", "success");
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              <Undo2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Mobile total */}
                  <div className="rounded-lg border bg-muted/50 p-3.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground">Total</span>
                    <span className="text-sm font-bold">{formatCurrency(detailSummary.total, true)}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ─── Main view: Members grid ─── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBasket className="h-6 w-6 text-purple-600" />
            Autoconsumo familiar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seguimiento de consumo por miembro de la familia
          </p>
        </div>
        <Button
          onClick={() => {
            setNewMemberName("");
            setNewMemberPin(generatePin());
            setMemberDialogOpen(true);
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          <UserPlus className="h-4 w-4 mr-2" /> Agregar miembro
        </Button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
          {([
            { key: "today" as QuickPeriod, label: "Hoy" },
            { key: "week" as QuickPeriod, label: "Esta semana" },
            { key: "month" as QuickPeriod, label: "Este mes" },
            { key: "custom" as QuickPeriod, label: "Personalizado" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setQuickPeriod(key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                quickPeriod === key
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {quickPeriod === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select
                value={filterMode}
                onValueChange={(v) =>
                  setFilterMode((v ?? "day") as "day" | "month" | "range")
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia</SelectItem>
                  <SelectItem value="month">Mes</SelectItem>
                  <SelectItem value="range">Rango</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filterMode === "day" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fecha</Label>
                <Input
                  type="date"
                  value={filterDay}
                  onChange={(e) => setFilterDay(e.target.value)}
                  className="w-40"
                />
              </div>
            )}

            {filterMode === "month" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Mes</Label>
                  <Select
                    value={filterMonth}
                    onValueChange={(v) => setFilterMonth(v ?? "1")}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
                      ].map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ano</Label>
                  <Select
                    value={filterYear}
                    onValueChange={(v) =>
                      setFilterYear(v ?? String(new Date().getFullYear()))
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(
                        (y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {filterMode === "range" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Desde</Label>
                  <Input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Hasta</Label>
                  <Input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="w-40"
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Global summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Miembros activos
            </div>
            <div className="text-2xl font-bold mt-1">{miembros.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" /> Items consumidos
            </div>
            <div className="text-2xl font-bold mt-1">{totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <ShoppingBasket className="h-4 w-4" /> Costo total
            </div>
            <div className="text-2xl font-bold mt-1">
              {formatCurrency(totalGeneral)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      ) : miembros.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            No hay miembros registrados. Agregue uno para comenzar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {miembros.map((m, i) => {
            const s = summary[m.id] || { items: 0, total: 0 };
            return (
              <Card
                key={m.id}
                className="cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => setSelectedMiembro(m)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 ${colorForIndex(i)}`}
                    >
                      {initials(m.nombre)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate group-hover:text-purple-600 transition-colors">
                        {m.nombre}
                      </p>
                      <p className="text-xl font-bold mt-1">
                        {formatCurrency(s.total)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.items} items en el periodo
                      </p>
                    </div>
                  </div>

                  {/* Link button */}
                  {m.pin && (
                    <div className="mt-4 pt-3 border-t">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyLink(m.pin!, m.id);
                        }}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-purple-600 transition-colors"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-emerald-500">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="h-3.5 w-3.5" />
                            <span>Copiar link personal</span>
                            <Copy className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add member dialog */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar miembro de la familia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                placeholder="Nombre del miembro"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
              />
            </div>
            <div className="space-y-2">
              <Label>PIN (opcional, para link personal)</Label>
              <Input
                placeholder="PIN de 4 digitos"
                value={newMemberPin}
                onChange={(e) => setNewMemberPin(e.target.value)}
                maxLength={6}
              />
              <p className="text-xs text-muted-foreground">
                Se usara para generar un link unico de autoconsumo
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setMemberDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddMember}
                disabled={savingMember}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {savingMember ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Agregar"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
