import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Receipt,
  DollarSign,
  Loader2,
  Download,
  Package,
  Clock,
  ArrowRight,
} from "lucide-react";
import { formatCurrency, todayARG } from "@/lib/formatters";
import { showAdminToast } from "@/components/admin-toast";
import type { CompraRow, Proveedor } from "./types";

/* ───────── Props ───────── */

interface ComprasListProps {
  purchases: CompraRow[];
  providers: Proveedor[];
  loading: boolean;
  // Filters
  search: string;
  setSearch: (v: string) => void;
  quickPeriod: "today" | "week" | "month" | "custom";
  setQuickPeriod: (v: "today" | "week" | "month" | "custom") => void;
  purchaseFilterMode: "day" | "month" | "range" | "all";
  setPurchaseFilterMode: (v: "day" | "month" | "range" | "all") => void;
  purchaseFilterDay: string;
  setPurchaseFilterDay: (v: string) => void;
  purchaseFilterMonth: string;
  setPurchaseFilterMonth: (v: string) => void;
  purchaseFilterYear: string;
  setPurchaseFilterYear: (v: string) => void;
  purchaseFilterFrom: string;
  setPurchaseFilterFrom: (v: string) => void;
  purchaseFilterTo: string;
  setPurchaseFilterTo: (v: string) => void;
  // Actions
  onNewCompra: () => void;
  onOpenDetail: (compra: CompraRow) => void;
  onIngresarPendiente: (compra: CompraRow) => void;
}

/* ───────── Helpers ───────── */

type StatFilter = "all" | "pendientePago" | "sinIngresar";

function relativeDate(fecha: string): string {
  const today = todayARG();
  if (fecha === today) return "Hoy";

  const dateMs = new Date(fecha + "T12:00:00").getTime();
  const todayMs = new Date(today + "T12:00:00").getTime();
  const diffDays = Math.round((todayMs - dateMs) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "Ayer";
  if (diffDays > 1 && diffDays <= 30) return `Hace ${diffDays} días`;
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays === 1) return "Mañana";
    return `En ${absDays} días`;
  }

  const d = new Date(fecha + "T12:00:00");
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function formatTime(fecha: string): string {
  // fecha is YYYY-MM-DD, no time info — return empty
  return "";
}

/* ───────── Component ───────── */

export function ComprasList({
  purchases,
  providers,
  loading,
  search,
  setSearch,
  quickPeriod,
  setQuickPeriod,
  purchaseFilterMode,
  setPurchaseFilterMode,
  purchaseFilterDay,
  setPurchaseFilterDay,
  purchaseFilterMonth,
  setPurchaseFilterMonth,
  purchaseFilterYear,
  setPurchaseFilterYear,
  purchaseFilterFrom,
  setPurchaseFilterFrom,
  purchaseFilterTo,
  setPurchaseFilterTo,
  onNewCompra,
  onOpenDetail,
  onIngresarPendiente,
}: ComprasListProps) {
  const [activeStatFilter, setActiveStatFilter] = useState<StatFilter>("all");

  /* ── Stats ── */
  const stats = useMemo(
    () => ({
      total: purchases.length,
      monto: purchases.reduce((a, p) => a + p.total, 0),
      pendientePago: purchases.filter(
        (p) => p.estado_pago === "Pendiente" || p.estado_pago === "Pago Parcial"
      ).length,
      sinIngresar: purchases.filter((p) => p.estado === "Pendiente").length,
    }),
    [purchases]
  );

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    let list = purchases.filter(
      (p) =>
        p.numero.toLowerCase().includes(term) ||
        (p.proveedores?.nombre || "").toLowerCase().includes(term) ||
        (p.numero_comprobante || "").toLowerCase().includes(term)
    );

    if (activeStatFilter === "pendientePago") {
      list = list.filter(
        (p) => p.estado_pago === "Pendiente" || p.estado_pago === "Pago Parcial"
      );
    } else if (activeStatFilter === "sinIngresar") {
      list = list.filter((p) => p.estado === "Pendiente");
    }

    return list;
  }, [purchases, search, activeStatFilter]);

  /* ── Export Excel ── */
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((p) => ({
      Número: p.numero,
      Fecha: p.fecha,
      Proveedor: p.proveedores?.nombre || "",
      Total: p.total,
      "Forma de Pago": p.forma_pago || "",
      "Estado Pago": p.estado_pago || "",
      Estado: p.estado || "",
      Comprobante: p.tipo_comprobante
        ? `${p.tipo_comprobante} ${p.numero_comprobante || ""}`
        : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 30 },
      { wch: 14 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras");
    XLSX.writeFile(wb, `Compras_${todayARG()}.xlsx`);
    showAdminToast(`${rows.length} compras exportadas`, "success");
  };

  /* ── Stat card click handler ── */
  function toggleStatFilter(filter: StatFilter) {
    setActiveStatFilter((prev) => (prev === filter ? "all" : filter));
  }

  /* ── Badge colors ── */
  function estadoBadge(estado: string) {
    if (estado === "Confirmada")
      return "border-green-300 bg-green-50 text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-400";
    if (estado === "Pendiente")
      return "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-400";
    if (estado === "Anulada")
      return "border-red-300 bg-red-50 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-400";
    return "";
  }

  function pagoBadge(estado_pago: string) {
    if (estado_pago === "Pagada")
      return "border-green-300 bg-green-50 text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-400";
    if (estado_pago === "Pago Parcial")
      return "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-400";
    if (estado_pago === "Pendiente")
      return "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-400";
    return "";
  }

  /* ═══════════════════ RENDER ═══════════════════ */

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Compras</h2>
          <p className="text-sm text-muted-foreground">
            Registro de compras a proveedores e ingreso de mercadería
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={onNewCompra}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Compra
          </Button>
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total purchases */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${
            activeStatFilter === "all"
              ? "ring-2 ring-primary/50"
              : "hover:ring-1 hover:ring-border"
          }`}
          onClick={() => setActiveStatFilter("all")}
        >
          <CardContent className="pt-5 pb-4 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Compras totales</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        {/* Total amount */}
        <Card
          className="cursor-default"
        >
          <CardContent className="pt-5 pb-4 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Monto total</p>
              <p className="text-xl font-bold truncate">{formatCurrency(stats.monto)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Pendiente pago */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${
            activeStatFilter === "pendientePago"
              ? "ring-2 ring-orange-500/50"
              : "hover:ring-1 hover:ring-border"
          }`}
          onClick={() => toggleStatFilter("pendientePago")}
        >
          <CardContent className="pt-5 pb-4 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Pendiente pago</p>
              <p className="text-xl font-bold">{stats.pendientePago}</p>
            </div>
          </CardContent>
        </Card>

        {/* Sin ingresar */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${
            activeStatFilter === "sinIngresar"
              ? "ring-2 ring-violet-500/50"
              : "hover:ring-1 hover:ring-border"
          }`}
          onClick={() => toggleStatFilter("sinIngresar")}
        >
          <CardContent className="pt-5 pb-4 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-violet-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Sin ingresar</p>
              <p className="text-xl font-bold">{stats.sinIngresar}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap">
            <div className="flex-1 sm:max-w-md w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número o proveedor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-lg border p-1">
              {(
                [
                  ["today", "Hoy"],
                  ["week", "Esta semana"],
                  ["month", "Este mes"],
                  ["custom", "Personalizado"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setQuickPeriod(key)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    quickPeriod === key
                      ? "bg-foreground text-background font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {quickPeriod === "custom" && (
              <div className="flex items-center gap-2">
                <Select
                  value={purchaseFilterMode}
                  onValueChange={(v) =>
                    setPurchaseFilterMode((v ?? "day") as "day" | "month" | "range" | "all")
                  }
                >
                  <SelectTrigger className="w-28">
                    {purchaseFilterMode === "day"
                      ? "Día"
                      : purchaseFilterMode === "month"
                        ? "Mes"
                        : purchaseFilterMode === "range"
                          ? "Rango"
                          : "Todos"}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Día</SelectItem>
                    <SelectItem value="month">Mes</SelectItem>
                    <SelectItem value="range">Rango</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
                {purchaseFilterMode === "day" && (
                  <Input
                    type="date"
                    value={purchaseFilterDay}
                    onChange={(e) => setPurchaseFilterDay(e.target.value)}
                    className="w-full sm:w-40"
                  />
                )}
                {purchaseFilterMode === "month" && (
                  <>
                    <Select
                      value={purchaseFilterMonth}
                      onValueChange={(v) => setPurchaseFilterMonth(v ?? "1")}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Mes" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "Enero",
                          "Febrero",
                          "Marzo",
                          "Abril",
                          "Mayo",
                          "Junio",
                          "Julio",
                          "Agosto",
                          "Septiembre",
                          "Octubre",
                          "Noviembre",
                          "Diciembre",
                        ].map((m, i) => (
                          <SelectItem key={i} value={String(i + 1)}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={purchaseFilterYear}
                      onChange={(e) => setPurchaseFilterYear(e.target.value)}
                      className="w-20"
                    />
                  </>
                )}
                {purchaseFilterMode === "range" && (
                  <>
                    <Input
                      type="date"
                      value={purchaseFilterFrom}
                      onChange={(e) => setPurchaseFilterFrom(e.target.value)}
                      className="w-full sm:w-40"
                    />
                    <span className="text-muted-foreground text-sm">a</span>
                    <Input
                      type="date"
                      value={purchaseFilterTo}
                      onChange={(e) => setPurchaseFilterTo(e.target.value)}
                      className="w-full sm:w-40"
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Active stat filter indicator */}
          {activeStatFilter !== "all" && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                {activeStatFilter === "pendientePago"
                  ? "Pendiente de pago"
                  : "Sin ingresar"}
                <button
                  onClick={() => setActiveStatFilter("all")}
                  className="ml-1 hover:text-foreground"
                >
                  &times;
                </button>
              </Badge>
              <span className="text-xs text-muted-foreground">
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Compra cards ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Receipt className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No se encontraron compras</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isPending = p.estado === "Pendiente";
            const provNombre = p.proveedores?.nombre || "Sin proveedor";
            const rel = relativeDate(p.fecha);

            return (
              <Card
                key={p.id}
                className={`transition-all hover:shadow-md cursor-pointer ${
                  isPending
                    ? "border-yellow-200 dark:border-yellow-800/50"
                    : ""
                }`}
                onClick={() => onOpenDetail(p)}
              >
                <CardContent className="py-4 px-4 sm:px-5">
                  {/* Row 1: Provider + Number + Total */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm sm:text-base truncate">
                          {provNombre}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          {p.numero}
                        </span>
                      </div>
                    </div>
                    <span className="font-bold text-base sm:text-lg shrink-0">
                      {formatCurrency(p.total)}
                    </span>
                  </div>

                  {/* Row 2: Date info */}
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>{rel}</span>
                    {p.tipo_comprobante && (
                      <>
                        <span>·</span>
                        <span>
                          {p.tipo_comprobante}
                          {p.numero_comprobante ? ` ${p.numero_comprobante}` : ""}
                        </span>
                      </>
                    )}
                    {p.descuento_porcentaje != null && p.descuento_porcentaje > 0 && (
                      <>
                        <span>·</span>
                        <span>{p.descuento_porcentaje}% dto.</span>
                      </>
                    )}
                  </div>

                  {/* Row 3: Badges + Ingresar button */}
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-[10px] sm:text-xs font-normal ${estadoBadge(p.estado)}`}
                      >
                        {p.estado === "Pendiente" ? "Pendiente ingreso" : p.estado}
                      </Badge>

                      {p.estado_pago && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] sm:text-xs font-normal ${pagoBadge(p.estado_pago)}`}
                        >
                          {p.estado_pago}
                        </Badge>
                      )}

                      {p.forma_pago && (
                        <Badge
                          variant="outline"
                          className="text-[10px] sm:text-xs font-normal"
                        >
                          {p.forma_pago}
                        </Badge>
                      )}
                    </div>

                    {isPending && (
                      <Button
                        size="sm"
                        variant="default"
                        className="shrink-0 h-7 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onIngresarPendiente(p);
                        }}
                      >
                        Ingresar
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Row 4: Observation if present */}
                  {p.observacion && (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-1 italic">
                      {p.observacion}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
