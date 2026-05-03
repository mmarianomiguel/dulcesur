"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback, useMemo } from "react";
import { formatCurrency } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart3, Users, Package, ShoppingCart, Receipt,
  Loader2, DollarSign, Crown, Star, ArrowUpRight, ArrowDownRight, Wallet, Calendar,
} from "lucide-react";


const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function ResumenMensualPage() {
  const now = new Date();
  const [mes, setMes] = useState(String(now.getMonth() + 1));
  const [anio, setAnio] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(true);

  // Data
  const [totalVentas, setTotalVentas] = useState(0);
  const [cantVentas, setCantVentas] = useState(0);
  const [totalCompras, setTotalCompras] = useState(0);
  const [ganancia, setGanancia] = useState(0);
  const [itemsSinCosto, setItemsSinCosto] = useState(0);
  const [topClientes, setTopClientes] = useState<{ nombre: string; total: number; qty: number }[]>([]);
  const [topProductos, setTopProductos] = useState<{ nombre: string; cantidad: number; total: number; ganancia: number }[]>([]);
  const [topProdTab, setTopProdTab] = useState<"unidades" | "margen" | "facturacion">("unidades");
  const [ventasPorPago, setVentasPorPago] = useState<{ metodo: string; total: number; qty: number }[]>([]);
  const [egresosPorPago, setEgresosPorPago] = useState<{ metodo: string; total: number }[]>([]);
  const [egresosDetalle, setEgresosDetalle] = useState<{ descripcion: string; metodo: string; monto: number }[]>([]);
  const [transferPorCuenta, setTransferPorCuenta] = useState<{ cuenta: string; total: number }[]>([]);
  const [totalNC, setTotalNC] = useState(0);
  const [comparativa, setComparativa] = useState<{ label: string; actual: number; anterior: number; diff: number } | null>(null);

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    const m = Number(mes);
    const y = Number(anio);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    // Ventas + NCs + Compras en paralelo (las 3 queries son independientes)
    const [
      { data: ventas },
      { data: ncs },
      { data: compras },
    ] = await Promise.all([
      supabase.from("ventas").select("id, total, forma_pago, cliente_id, tipo_comprobante, estado, clientes(nombre)")
        .gte("fecha", start).lt("fecha", end)
        .not("tipo_comprobante", "ilike", "Nota de Crédito%")
        .not("tipo_comprobante", "ilike", "Nota de Débito%")
        .neq("estado", "anulada"),
      supabase.from("ventas").select("total")
        .gte("fecha", start).lt("fecha", end)
        .ilike("tipo_comprobante", "Nota de Crédito%")
        .neq("estado", "anulada"),
      supabase.from("compras").select("total")
        .gte("fecha", start).lt("fecha", end)
        .neq("estado", "Pendiente"),
    ]);
    // Exclude pending web orders from totals
    const vList = (ventas || []).filter((v: any) => !(v.estado === "pendiente" && v.tipo_comprobante === "Pedido Web"));
    setTotalVentas(vList.reduce((a: number, v: any) => a + v.total, 0));
    setCantVentas(vList.length);
    setTotalNC((ncs || []).reduce((a: number, n: any) => a + n.total, 0));
    setTotalCompras((compras || []).reduce((a: number, c: any) => a + c.total, 0));

    // Helper: get units per presentation with fallback
    const getU = (item: any) => {
      let u = Number(item.unidades_por_presentacion) || 1;
      const presTxt = (item.presentacion || "").toLowerCase();
      if (presTxt.includes("medio") && u === 1) u = 0.5;
      if (u === 1 && presTxt && presTxt !== "unidad") {
        const match = presTxt.match(/x\s*(\d+)/);
        if (match) u = Number(match[1]);
      }
      return u;
    };

    // Ganancia + Top productos — una sola query de venta_items (antes eran 2)
    if (vList.length > 0) {
      const ids = vList.map((v: any) => v.id);
      // Paginación EXPLÍCITA: chunks de 50 ventas + páginas de 1000 hasta agotar.
      const VENTAS_CHUNK = 50;
      const PAGE = 1000;
      const items: any[] = [];
      for (let i = 0; i < ids.length; i += VENTAS_CHUNK) {
        const chunk = ids.slice(i, i + VENTAS_CHUNK);
        let from = 0;
        while (true) {
          const { data: chunkItems } = await supabase.from("venta_items")
            .select("producto_id, descripcion, cantidad, unidades_por_presentacion, subtotal, precio_unitario, descuento, costo_unitario, productos(nombre)")
            .in("venta_id", chunk)
            .range(from, from + PAGE - 1);
          const rows = chunkItems || [];
          items.push(...rows);
          if (rows.length < PAGE) break;
          from += PAGE;
        }
      }

      let sinCosto = 0;
      const prodMap: Record<string, { nombre: string; cantidad: number; total: number; ganancia: number }> = {};
      const g = (items || []).reduce((a: number, item: any) => {
        const costoReal = (item.costo_unitario && item.costo_unitario > 0) ? item.costo_unitario : 0;
        if (!costoReal) sinCosto++;
        const descPct = Number(item.descuento) || 0;
        const precioVenta = item.precio_unitario * (1 - descPct / 100);
        const gananciaItem = (precioVenta - costoReal) * item.cantidad;
        // Agrupar para top productos por producto_id (fallback descripcion para items free-text).
        // Cantidad se normaliza a UNIDADES (cantidad × unidades_por_presentacion) para que cajas y sueltas sean comparables.
        const key = item.producto_id || `__free__${item.descripcion}`;
        const upp = Number(item.unidades_por_presentacion) || 1;
        const unidades = Number(item.cantidad) * upp;
        const nombreCanonico = item.productos?.nombre || item.descripcion;
        if (!prodMap[key]) prodMap[key] = { nombre: nombreCanonico, cantidad: 0, total: 0, ganancia: 0 };
        prodMap[key].cantidad += unidades;
        prodMap[key].total += Number(item.subtotal);
        prodMap[key].ganancia += gananciaItem;
        return a + gananciaItem;
      }, 0);
      setGanancia(g);
      setItemsSinCosto(sinCosto);
      setTopProductos(Object.values(prodMap));
    } else {
      setGanancia(0);
      setItemsSinCosto(0);
      setTopProductos([]);
    }

    // Top 10 clientes (exclude anonymous/consumidor final sales where cliente_id is null)
    const clientMap: Record<string, { nombre: string; total: number; qty: number }> = {};
    vList.forEach((v: any) => {
      if (!v.cliente_id) return; // Skip sales without a client (consumidor final)
      const name = v.clientes?.nombre || "Sin cliente";
      if (!clientMap[name]) clientMap[name] = { nombre: name, total: 0, qty: 0 };
      clientMap[name].total += v.total;
      clientMap[name].qty += 1;
    });
    setTopClientes(Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 10));

    // Ventas por forma de pago — desglosar Mixto en sus componentes
    const mixtoVentaIds = vList.filter((v: any) => v.forma_pago === "Mixto").map((v: any) => v.id);
    let mixtoMovs: { referencia_id: string; metodo_pago: string; monto: number }[] = [];
    let mixtoCCData: { venta_id: string; debe: number }[] = [];
    if (mixtoVentaIds.length > 0) {
      const [{ data: movs }, { data: ccRows }] = await Promise.all([
        supabase.from("caja_movimientos")
          .select("referencia_id, metodo_pago, monto")
          .eq("tipo", "ingreso").eq("referencia_tipo", "venta")
          .in("referencia_id", mixtoVentaIds),
        supabase.from("cuenta_corriente")
          .select("venta_id, debe")
          .in("venta_id", mixtoVentaIds),
      ]);
      mixtoMovs = (movs || []) as any[];
      mixtoCCData = (ccRows || []) as any[];
    }
    const pagoMap: Record<string, { total: number; qty: number }> = {};
    vList.forEach((v: any) => {
      if (v.forma_pago === "Mixto") {
        // Desglosar: efectivo/transf from caja_movimientos, CC from cuenta_corriente
        const movs = mixtoMovs.filter((m) => m.referencia_id === v.id);
        const ccParts = mixtoCCData.filter((c) => c.venta_id === v.id);
        let desglosado = false;
        for (const m of movs) {
          if (!pagoMap[m.metodo_pago]) pagoMap[m.metodo_pago] = { total: 0, qty: 0 };
          pagoMap[m.metodo_pago].total += m.monto;
          pagoMap[m.metodo_pago].qty += 1;
          desglosado = true;
        }
        for (const c of ccParts) {
          if (c.debe > 0) {
            if (!pagoMap["Cuenta Corriente"]) pagoMap["Cuenta Corriente"] = { total: 0, qty: 0 };
            pagoMap["Cuenta Corriente"].total += c.debe;
            pagoMap["Cuenta Corriente"].qty += 1;
            desglosado = true;
          }
        }
        // Fallback if no desglose found
        if (!desglosado) {
          if (!pagoMap["Efectivo"]) pagoMap["Efectivo"] = { total: 0, qty: 0 };
          pagoMap["Efectivo"].total += v.total;
          pagoMap["Efectivo"].qty += 1;
        }
      } else {
        if (!pagoMap[v.forma_pago]) pagoMap[v.forma_pago] = { total: 0, qty: 0 };
        pagoMap[v.forma_pago].total += v.total;
        pagoMap[v.forma_pago].qty += 1;
      }
    });
    setVentasPorPago(Object.entries(pagoMap).map(([metodo, d]) => ({ metodo, ...d })).sort((a, b) => b.total - a.total));

    // Egresos reales (tipo=egreso only, excludes tipo=cancelacion which are reversed income)
    const { data: egresos } = await supabase.from("caja_movimientos")
      .select("metodo_pago, monto, descripcion")
      .eq("tipo", "egreso")
      .gte("fecha", start).lt("fecha", end);
    const egresoMap: Record<string, number> = {};
    const egresoDetailList: { descripcion: string; metodo: string; monto: number }[] = [];
    (egresos || []).forEach((e: any) => {
      const m = e.metodo_pago || "Otros";
      egresoMap[m] = (egresoMap[m] || 0) + Math.abs(e.monto);
      egresoDetailList.push({ descripcion: e.descripcion || "Sin descripción", metodo: m, monto: Math.abs(e.monto) });
    });
    setEgresosPorPago(Object.entries(egresoMap).map(([metodo, total]) => ({ metodo, total })).sort((a, b) => b.total - a.total));
    setEgresosDetalle(egresoDetailList.sort((a, b) => b.monto - a.monto));

    // Transferencias por cuenta bancaria (from caja_movimientos with cuenta_bancaria)
    const [{ data: transfs }, { data: cbActivas }] = await Promise.all([
      supabase.from("caja_movimientos")
        .select("cuenta_bancaria, monto")
        .eq("tipo", "ingreso")
        .eq("metodo_pago", "Transferencia")
        .gte("fecha", start).lt("fecha", end),
      supabase.from("cuentas_bancarias")
        .select("nombre, alias")
        .eq("activo", true),
    ]);
    // El campo cuenta_bancaria de caja_movimientos guarda data inconsistente:
    // a veces "Banco", otras "Banco — alias", otras solo "alias", o null.
    // Normalizamos contra el master (cuentas_bancarias) para que aparezcan unificadas.
    const cuentasMaster = (cbActivas || []) as { nombre: string; alias: string }[];
    const normalizeCuenta = (raw: string | null) => {
      if (!raw) return "Sin especificar";
      const trimmed = raw.trim();
      const partes = trimmed.split(/\s+—\s+|\s+-\s+/);
      const banco = (partes[0] || "").trim();
      const alias = (partes[1] || "").trim();
      // 1) Exacto: nombre y alias.
      if (banco && alias) {
        const exact = cuentasMaster.find((c) => c.nombre === banco && c.alias === alias);
        if (exact) return `${exact.nombre} — ${exact.alias}`;
      }
      // 2) Solo el nombre (asumimos la unica cuenta de ese banco).
      if (banco && !alias) {
        const matches = cuentasMaster.filter((c) => c.nombre === banco);
        if (matches.length === 1) return `${matches[0].nombre} — ${matches[0].alias}`;
        if (matches.length > 1) return banco; // ambiguo, dejamos solo el nombre del banco
      }
      // 3) El "banco" en realidad es un alias suelto.
      if (banco) {
        const aliasMatch = cuentasMaster.find((c) => c.alias === banco);
        if (aliasMatch) return `${aliasMatch.nombre} — ${aliasMatch.alias}`;
      }
      // 4) Fallback: mostramos lo que vino.
      return trimmed;
    };
    const cuentaMap: Record<string, number> = {};
    (transfs || []).forEach((t: any) => {
      const cuenta = normalizeCuenta(t.cuenta_bancaria);
      cuentaMap[cuenta] = (cuentaMap[cuenta] || 0) + Math.abs(t.monto);
    });
    setTransferPorCuenta(Object.entries(cuentaMap).map(([cuenta, total]) => ({ cuenta, total })).sort((a, b) => b.total - a.total));

    // Comparativa con mes anterior
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevStart = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    const prevEnd = prevM === 12 ? `${prevY + 1}-01-01` : `${prevY}-${String(prevM + 1).padStart(2, "0")}-01`;
    const { data: prevVentas } = await supabase.from("ventas").select("total")
      .gte("fecha", prevStart).lt("fecha", prevEnd)
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .neq("estado", "anulada");
    const prevTotal = (prevVentas || []).reduce((a: number, v: any) => a + v.total, 0);
    const actualTotal = vList.reduce((a: number, v: any) => a + v.total, 0);
    const diff = prevTotal > 0 ? ((actualTotal - prevTotal) / prevTotal) * 100 : 0;
    setComparativa({
      label: `${MESES[prevM - 1]} ${prevY}`,
      actual: actualTotal,
      anterior: prevTotal,
      diff,
    });

    setLoading(false);
  }, [mes, anio]);

  useEffect(() => { fetchResumen(); }, [fetchResumen]);

  const totalEgresos = useMemo(() => egresosPorPago.reduce((a, e) => a + e.total, 0), [egresosPorPago]);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Resumen Mensual</h1>
            <p className="text-sm text-muted-foreground">{MESES[Number(mes) - 1]} {anio}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Mes</span>
            <Select value={mes} onValueChange={(v) => setMes(v ?? mes)}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Mes" /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Año</span>
            <Select value={anio} onValueChange={(v) => setAnio(v ?? anio)}>
              <SelectTrigger className="w-24 h-9"><SelectValue placeholder="Año" /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ventas</p>
              <p className="text-lg font-bold mt-1">{formatCurrency(totalVentas)}</p>
              <p className="text-[11px] text-muted-foreground">{cantVentas} operaciones</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Compras</p>
              <p className="text-lg font-bold mt-1">{formatCurrency(totalCompras)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ganancia</p>
              <p className={`text-lg font-bold mt-1 ${itemsSinCosto > 0 ? "text-amber-500" : ganancia >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(ganancia)}</p>
              {itemsSinCosto > 0 ? (
                <p className="text-[11px] text-amber-500 font-medium">{itemsSinCosto} items sin costo cargado</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">{totalVentas > 0 ? `${((ganancia / totalVentas) * 100).toFixed(1)}%` : "—"}</p>
              )}
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Notas Credito</p>
              <p className="text-lg font-bold mt-1 text-red-500">-{formatCurrency(totalNC)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Egresos</p>
              <p className="text-lg font-bold mt-1 text-orange-500">{formatCurrency(totalEgresos)}</p>
            </CardContent></Card>
            <Card className="bg-primary/5"><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Neto</p>
              <p className="text-lg font-bold mt-1">{formatCurrency(totalVentas - totalNC - totalCompras - totalEgresos)}</p>
            </CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top 10 Clientes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Crown className="w-4 h-4 text-amber-500" />Top 10 Clientes</CardTitle>
              </CardHeader>
              <CardContent>
                {topClientes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                ) : (
                  <div className="space-y-2">
                    {topClientes.map((c, i) => (
                      <div key={c.nombre} className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.nombre}</p>
                          <p className="text-[11px] text-muted-foreground">{c.qty} compras · Ticket prom. {formatCurrency(Math.round(c.total / c.qty))}</p>
                        </div>
                        <span className="text-sm font-bold">{formatCurrency(c.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 10 Productos */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4 text-blue-500" />Top 10 Productos</CardTitle>
                  <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
                    {([
                      { id: "unidades", label: "Unidades" },
                      { id: "margen", label: "Margen" },
                      { id: "facturacion", label: "Facturación" },
                    ] as const).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTopProdTab(t.id)}
                        className={`px-2.5 py-1 rounded-md font-medium transition ${topProdTab === t.id ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {topProductos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                ) : (() => {
                  const sorted = [...topProductos];
                  if (topProdTab === "unidades") sorted.sort((a, b) => b.cantidad - a.cantidad);
                  else if (topProdTab === "margen") sorted.sort((a, b) => b.ganancia - a.ganancia);
                  else sorted.sort((a, b) => b.total - a.total);
                  const top = sorted.slice(0, 10);
                  return (
                    <div className="space-y-2">
                      {top.map((p, i) => {
                        const margenPct = p.total > 0 ? (p.ganancia / p.total) * 100 : 0;
                        const main = topProdTab === "unidades"
                          ? `${p.cantidad} unidades`
                          : topProdTab === "margen"
                          ? `${formatCurrency(Math.round(p.ganancia))} (${margenPct >= 0 ? "+" : ""}${margenPct.toFixed(0)}%)`
                          : formatCurrency(p.total);
                        const sub = topProdTab === "unidades"
                          ? formatCurrency(p.total)
                          : topProdTab === "margen"
                          ? `Vendido ${formatCurrency(p.total)}`
                          : `${p.cantidad} unidades`;
                        return (
                          <div key={p.nombre} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{p.nombre}</p>
                              <p className="text-[11px] text-muted-foreground">{sub}</p>
                            </div>
                            <span className={`text-sm font-bold ${topProdTab === "margen" && p.ganancia < 0 ? "text-red-500" : ""}`}>{main}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Ventas por forma de pago */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4" />Ventas por Forma de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ventasPorPago.map((v) => (
                    <div key={v.metodo}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{v.metodo}</span>
                        <span className="text-sm font-bold">{formatCurrency(v.total)}</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${totalVentas > 0 ? (v.total / totalVentas) * 100 : 0}%` }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{v.qty} operaciones · {totalVentas > 0 ? ((v.total / totalVentas) * 100).toFixed(1) : "0"}%</p>
                      {v.metodo === "Transferencia" && transferPorCuenta.length > 0 && (
                        <div className="mt-1.5 pl-3 space-y-0.5 border-l-2 border-primary/20">
                          {transferPorCuenta.map((tc) => (
                            <div key={tc.cuenta} className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">{tc.cuenta}</span>
                              <span className="font-medium">{formatCurrency(tc.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Egresos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><ArrowDownRight className="w-4 h-4 text-orange-500" />Gastos / Egresos</CardTitle>
              </CardHeader>
              <CardContent>
                {egresosPorPago.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin egresos en el periodo</p>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Por método de pago</p>
                      {egresosPorPago.map((e) => (
                        <div key={e.metodo} className="flex items-center justify-between">
                          <Badge variant="outline">{e.metodo}</Badge>
                          <span className="text-sm font-bold text-orange-600">{formatCurrency(e.total)}</span>
                        </div>
                      ))}
                    </div>
                    {egresosDetalle.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detalle</p>
                        <div className="max-h-[200px] overflow-y-auto space-y-1">
                          {egresosDetalle.map((e, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate flex-1 mr-2">{e.descripcion}</span>
                              <span className="font-medium text-orange-600 shrink-0">{formatCurrency(e.monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t font-bold">
                      <span className="text-sm">Total egresos</span>
                      <span className="text-sm text-orange-600">{formatCurrency(totalEgresos)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Comparativa Mensual */}
          {comparativa && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" />Comparativa vs {comparativa.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Mes anterior</p>
                    <p className="text-lg font-bold">{formatCurrency(comparativa.anterior)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Mes actual</p>
                    <p className="text-lg font-bold">{formatCurrency(comparativa.actual)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Variación</p>
                    <div className={`flex items-center justify-center gap-1 text-lg font-bold ${comparativa.diff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {comparativa.diff >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {comparativa.anterior > 0 ? `${comparativa.diff >= 0 ? "+" : ""}${comparativa.diff.toFixed(1)}%` : "—"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </>
      )}
    </div>
  );
}
