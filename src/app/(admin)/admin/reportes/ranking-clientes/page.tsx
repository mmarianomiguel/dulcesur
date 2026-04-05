"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Crown, Loader2, TrendingUp, Users, ShoppingCart, ArrowUpDown, Search,
} from "lucide-react";


const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

type ClienteRank = {
  cliente_id: string;
  nombre: string;
  total: number;
  qty: number;
  ticketPromedio: number;
  ultimaCompra: string;
  productoTop?: string;
  productoTopQty?: number;
};

type SortKey = "total" | "qty" | "ticketPromedio" | "nombre";

export default function RankingClientesPage() {
  const now = new Date();
  const [mes, setMes] = useState(String(now.getMonth() + 1));
  const [anio, setAnio] = useState(String(now.getFullYear()));
  const [periodo, setPeriodo] = useState<"mes" | "anio" | "todo">("mes");
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteRank[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const fetchRanking = useCallback(async () => {
    setLoading(true);

    let query = supabase.from("ventas")
      .select("id, total, fecha, cliente_id, clientes(nombre)")
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .not("tipo_comprobante", "ilike", "Nota de Débito%")
      .neq("estado", "anulada");

    if (periodo === "mes") {
      const m = Number(mes);
      const y = Number(anio);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      query = query.gte("fecha", start).lt("fecha", end);
    } else if (periodo === "anio") {
      const y = Number(anio);
      query = query.gte("fecha", `${y}-01-01`).lt("fecha", `${y + 1}-01-01`);
    }

    const { data: ventas } = await query;
    const vList = ventas || [];

    const clientMap: Record<string, ClienteRank> = {};
    vList.forEach((v: any) => {
      const id = v.cliente_id || "sin-cliente";
      const name = v.clientes?.nombre || "Consumidor Final";
      if (!clientMap[id]) {
        clientMap[id] = { cliente_id: id, nombre: name, total: 0, qty: 0, ticketPromedio: 0, ultimaCompra: "" };
      }
      clientMap[id].total += v.total;
      clientMap[id].qty += 1;
      if (!clientMap[id].ultimaCompra || v.fecha > clientMap[id].ultimaCompra) {
        clientMap[id].ultimaCompra = v.fecha;
      }
    });

    Object.values(clientMap).forEach((c) => {
      c.ticketPromedio = c.qty > 0 ? Math.round(c.total / c.qty) : 0;
    });

    // Get top product per client from venta_items
    const ventasByClient: Record<string, string[]> = {};
    vList.forEach((v: any) => {
      const cid = v.cliente_id || "sin-cliente";
      if (!ventasByClient[cid]) ventasByClient[cid] = [];
      ventasByClient[cid].push(v.id);
    });

    const allVentaIds = vList.map((v: any) => v.id);
    if (allVentaIds.length > 0) {
      // Batch in chunks of 200 to avoid URL length limits
      const chunks: string[][] = [];
      for (let i = 0; i < allVentaIds.length; i += 200) {
        chunks.push(allVentaIds.slice(i, i + 200));
      }
      const allItems: { venta_id: string; descripcion: string; cantidad: number }[] = [];
      for (const chunk of chunks) {
        const { data } = await supabase.from("venta_items").select("venta_id, descripcion, cantidad").in("venta_id", chunk);
        if (data) allItems.push(...(data as any));
      }

      // Group items by client, then by product
      const ventaToClient: Record<string, string> = {};
      vList.forEach((v: any) => { ventaToClient[v.id] = v.cliente_id || "sin-cliente"; });

      const clientProducts: Record<string, Record<string, number>> = {};
      allItems.forEach((item) => {
        const cid = ventaToClient[item.venta_id];
        if (!cid) return;
        if (!clientProducts[cid]) clientProducts[cid] = {};
        clientProducts[cid][item.descripcion] = (clientProducts[cid][item.descripcion] || 0) + Number(item.cantidad);
      });

      Object.entries(clientProducts).forEach(([cid, prods]) => {
        if (!clientMap[cid]) return;
        let topName = "";
        let topQty = 0;
        Object.entries(prods).forEach(([name, qty]) => {
          if (qty > topQty) { topName = name; topQty = qty; }
        });
        if (topName) {
          clientMap[cid].productoTop = topName;
          clientMap[cid].productoTopQty = topQty;
        }
      });
    }

    setClientes(Object.values(clientMap));
    setLoading(false);
  }, [mes, anio, periodo]);

  useEffect(() => { fetchRanking(); }, [fetchRanking]);

  const sorted = [...clientes]
    .filter((c) => !busqueda || norm(c.nombre).includes(norm(busqueda)))
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortBy === "nombre") return dir * a.nombre.localeCompare(b.nombre);
      return dir * (a[sortBy] - b[sortBy]);
    });

  const totalGeneral = clientes.reduce((a, c) => a + c.total, 0);
  const totalOps = clientes.reduce((a, c) => a + c.qty, 0);
  const ticketGlobal = totalOps > 0 ? Math.round(totalGeneral / totalOps) : 0;

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  const formatFecha = (f: string) => {
    if (!f) return "-";
    const d = new Date(f + "T12:00:00");
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-500" />Ranking de Clientes
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodo} onValueChange={(v) => { if (v) setPeriodo(v as any); }}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Por Mes</SelectItem>
              <SelectItem value="anio">Por Año</SelectItem>
              <SelectItem value="todo">Histórico</SelectItem>
            </SelectContent>
          </Select>
          {periodo !== "todo" && (
            <Select value={anio} onValueChange={(v) => { if (v) setAnio(v); }}>
              <SelectTrigger className="w-[90px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {periodo === "mes" && (
            <Select value={mes} onValueChange={(v) => { if (v) setMes(v); }}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Clientes Activos</p>
          <p className="text-2xl font-bold mt-1 flex items-center gap-2"><Users className="w-5 h-5 text-primary" />{clientes.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Facturado</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalGeneral)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Operaciones</p>
          <p className="text-2xl font-bold mt-1 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-primary" />{totalOps}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ticket Promedio</p>
          <p className="text-2xl font-bold mt-1 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-500" />{formatCurrency(ticketGlobal)}</p>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Sin datos para el período seleccionado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium w-12">#</th>
                    <th className="text-left px-4 py-3 font-medium">
                      <button onClick={() => toggleSort("nombre")} className="flex items-center gap-1 hover:text-primary">
                        Cliente <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      <button onClick={() => toggleSort("total")} className="flex items-center gap-1 ml-auto hover:text-primary">
                        Total <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-right px-4 py-3 font-medium hidden md:table-cell">
                      <button onClick={() => toggleSort("qty")} className="flex items-center gap-1 ml-auto hover:text-primary">
                        Compras <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-right px-4 py-3 font-medium hidden md:table-cell">
                      <button onClick={() => toggleSort("ticketPromedio")} className="flex items-center gap-1 ml-auto hover:text-primary">
                        Ticket Prom. <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">% del Total</th>
                    <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">Prod. Top</th>
                    <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Última Compra</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => {
                    const pct = totalGeneral > 0 ? (c.total / totalGeneral) * 100 : 0;
                    return (
                      <tr key={c.cliente_id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            i < 3 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                          }`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            {c.nombre}
                            {i === 0 && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Top</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(c.total)}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">{c.qty}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">{formatCurrency(c.ticketPromedio)}</td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {c.productoTop ? (
                            <div>
                              <p className="text-xs truncate max-w-[180px]">{c.productoTop}</p>
                              <p className="text-[10px] text-muted-foreground">{c.productoTopQty} uds</p>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">{formatFecha(c.ultimaCompra)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
