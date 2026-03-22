"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart3, TrendingUp, Users, Package, ShoppingCart, Receipt,
  Loader2, DollarSign, Crown, Star, ArrowUpRight, ArrowDownRight, Wallet, Calendar,
} from "lucide-react";

function fc(v: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);
}

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
  const [topProductos, setTopProductos] = useState<{ nombre: string; cantidad: number; total: number }[]>([]);
  const [ventasPorPago, setVentasPorPago] = useState<{ metodo: string; total: number; qty: number }[]>([]);
  const [egresosPorPago, setEgresosPorPago] = useState<{ metodo: string; total: number }[]>([]);
  const [egresosDetalle, setEgresosDetalle] = useState<{ descripcion: string; metodo: string; monto: number }[]>([]);
  const [transferPorCuenta, setTransferPorCuenta] = useState<{ cuenta: string; total: number }[]>([]);
  const [totalNC, setTotalNC] = useState(0);

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    const m = Number(mes);
    const y = Number(anio);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    // Ventas (excluyendo NC)
    const { data: ventas } = await supabase.from("ventas").select("id, total, forma_pago, cliente_id, tipo_comprobante, clientes(nombre)")
      .gte("fecha", start).lt("fecha", end)
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .not("tipo_comprobante", "ilike", "Nota de Débito%")
      .neq("estado", "anulada");
    const vList = ventas || [];
    setTotalVentas(vList.reduce((a: number, v: any) => a + v.total, 0));
    setCantVentas(vList.length);

    // Notas de credito
    const { data: ncs } = await supabase.from("ventas").select("total")
      .gte("fecha", start).lt("fecha", end)
      .ilike("tipo_comprobante", "Nota de Crédito%")
      .neq("estado", "anulada");
    setTotalNC((ncs || []).reduce((a: number, n: any) => a + n.total, 0));

    // Compras
    const { data: compras } = await supabase.from("compras").select("total")
      .gte("fecha", start).lt("fecha", end);
    setTotalCompras((compras || []).reduce((a: number, c: any) => a + c.total, 0));

    // Ganancia from venta_items
    if (vList.length > 0) {
      const ids = vList.map((v: any) => v.id);
      const { data: items } = await supabase.from("venta_items")
        .select("cantidad, precio_unitario, unidades_por_presentacion, productos(costo)")
        .in("venta_id", ids);
      let sinCosto = 0;
      const g = (items || []).reduce((a: number, item: any) => {
        const costoU = item.productos?.costo || 0;
        if (!costoU) sinCosto++;
        const u = Number(item.unidades_por_presentacion) || 1;
        return a + (item.precio_unitario - costoU * u) * item.cantidad;
      }, 0);
      setGanancia(g);
      setItemsSinCosto(sinCosto);
    } else {
      setGanancia(0);
      setItemsSinCosto(0);
    }

    // Top 10 clientes
    const clientMap: Record<string, { nombre: string; total: number; qty: number }> = {};
    vList.forEach((v: any) => {
      const name = v.clientes?.nombre || "Sin cliente";
      if (!clientMap[name]) clientMap[name] = { nombre: name, total: 0, qty: 0 };
      clientMap[name].total += v.total;
      clientMap[name].qty += 1;
    });
    setTopClientes(Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 10));

    // Top 10 productos
    if (vList.length > 0) {
      const ids = vList.map((v: any) => v.id);
      const { data: allItems } = await supabase.from("venta_items")
        .select("descripcion, cantidad, subtotal")
        .in("venta_id", ids);
      const prodMap: Record<string, { nombre: string; cantidad: number; total: number }> = {};
      (allItems || []).forEach((item: any) => {
        const key = item.descripcion;
        if (!prodMap[key]) prodMap[key] = { nombre: key, cantidad: 0, total: 0 };
        prodMap[key].cantidad += Number(item.cantidad);
        prodMap[key].total += Number(item.subtotal);
      });
      setTopProductos(Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 10));
    } else {
      setTopProductos([]);
    }

    // Ventas por forma de pago — split Mixto into Efectivo+Transferencia
    const mixtoVentaIds = vList.filter((v: any) => v.forma_pago === "Mixto").map((v: any) => v.id);
    let mixtoMovs: { referencia_id: string; metodo_pago: string; monto: number }[] = [];
    if (mixtoVentaIds.length > 0) {
      const { data: movs } = await supabase.from("caja_movimientos")
        .select("referencia_id, metodo_pago, monto")
        .eq("tipo", "ingreso").eq("referencia_tipo", "venta")
        .in("referencia_id", mixtoVentaIds);
      mixtoMovs = (movs || []) as any[];
    }
    const pagoMap: Record<string, { total: number; qty: number }> = {};
    vList.forEach((v: any) => {
      if (v.forma_pago === "Mixto") {
        const movs = mixtoMovs.filter((m) => m.referencia_id === v.id);
        if (movs.length > 0) {
          movs.forEach((m) => {
            if (!pagoMap[m.metodo_pago]) pagoMap[m.metodo_pago] = { total: 0, qty: 0 };
            pagoMap[m.metodo_pago].total += m.monto;
          });
          // CC portion
          const movsTotal = movs.reduce((a, m) => a + m.monto, 0);
          const ccPart = v.total - movsTotal;
          if (ccPart > 0) {
            if (!pagoMap["Cuenta Corriente"]) pagoMap["Cuenta Corriente"] = { total: 0, qty: 0 };
            pagoMap["Cuenta Corriente"].total += ccPart;
          }
        } else {
          if (!pagoMap["Mixto"]) pagoMap["Mixto"] = { total: 0, qty: 0 };
          pagoMap["Mixto"].total += v.total;
          pagoMap["Mixto"].qty += 1;
        }
      } else {
        if (!pagoMap[v.forma_pago]) pagoMap[v.forma_pago] = { total: 0, qty: 0 };
        pagoMap[v.forma_pago].total += v.total;
        pagoMap[v.forma_pago].qty += 1;
      }
    });
    setVentasPorPago(Object.entries(pagoMap).map(([metodo, d]) => ({ metodo, ...d })).sort((a, b) => b.total - a.total));

    // Egresos (caja_movimientos tipo egreso)
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
    const { data: transfs } = await supabase.from("caja_movimientos")
      .select("cuenta_bancaria, monto")
      .eq("tipo", "ingreso")
      .eq("metodo_pago", "Transferencia")
      .gte("fecha", start).lt("fecha", end);
    const cuentaMap: Record<string, number> = {};
    (transfs || []).forEach((t: any) => {
      const cuenta = t.cuenta_bancaria || "Sin especificar";
      cuentaMap[cuenta] = (cuentaMap[cuenta] || 0) + Math.abs(t.monto);
    });
    setTransferPorCuenta(Object.entries(cuentaMap).map(([cuenta, total]) => ({ cuenta, total })).sort((a, b) => b.total - a.total));

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
              <p className="text-lg font-bold mt-1">{fc(totalVentas)}</p>
              <p className="text-[11px] text-muted-foreground">{cantVentas} operaciones</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Compras</p>
              <p className="text-lg font-bold mt-1">{fc(totalCompras)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ganancia</p>
              <p className={`text-lg font-bold mt-1 ${itemsSinCosto > 0 ? "text-amber-500" : ganancia >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fc(ganancia)}</p>
              {itemsSinCosto > 0 ? (
                <p className="text-[11px] text-amber-500 font-medium">{itemsSinCosto} items sin costo cargado</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">{totalVentas > 0 ? `${((ganancia / totalVentas) * 100).toFixed(1)}%` : "—"}</p>
              )}
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Notas Credito</p>
              <p className="text-lg font-bold mt-1 text-red-500">-{fc(totalNC)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Egresos</p>
              <p className="text-lg font-bold mt-1 text-orange-500">{fc(totalEgresos)}</p>
            </CardContent></Card>
            <Card className="bg-primary/5"><CardContent className="pt-5 pb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Neto</p>
              <p className="text-lg font-bold mt-1">{fc(totalVentas - totalNC - totalCompras - totalEgresos)}</p>
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
                          <p className="text-[11px] text-muted-foreground">{c.qty} compras</p>
                        </div>
                        <span className="text-sm font-bold">{fc(c.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 10 Productos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4 text-blue-500" />Top 10 Productos</CardTitle>
              </CardHeader>
              <CardContent>
                {topProductos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                ) : (
                  <div className="space-y-2">
                    {topProductos.map((p, i) => (
                      <div key={p.nombre} className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.nombre}</p>
                          <p className="text-[11px] text-muted-foreground">{p.cantidad} vendidos</p>
                        </div>
                        <span className="text-sm font-bold">{fc(p.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
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
                        <span className="text-sm font-bold">{fc(v.total)}</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(v.total / totalVentas) * 100}%` }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{v.qty} operaciones · {((v.total / totalVentas) * 100).toFixed(1)}%</p>
                      {v.metodo === "Transferencia" && transferPorCuenta.length > 0 && (
                        <div className="mt-1.5 pl-3 space-y-0.5 border-l-2 border-primary/20">
                          {transferPorCuenta.map((tc) => (
                            <div key={tc.cuenta} className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">{tc.cuenta}</span>
                              <span className="font-medium">{fc(tc.total)}</span>
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
                          <span className="text-sm font-bold text-orange-600">{fc(e.total)}</span>
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
                              <span className="font-medium text-orange-600 shrink-0">{fc(e.monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t font-bold">
                      <span className="text-sm">Total egresos</span>
                      <span className="text-sm text-orange-600">{fc(totalEgresos)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
