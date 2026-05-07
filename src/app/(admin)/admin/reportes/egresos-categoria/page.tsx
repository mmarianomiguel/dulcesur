"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency, todayARG } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wallet, TrendingDown, Loader2, Download, Calendar } from "lucide-react";
import { EGRESO_CATEGORIAS } from "@/lib/constants";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

type EgresoMov = {
  id: string;
  fecha: string;
  hora: string | null;
  descripcion: string | null;
  monto: number;
  metodo_pago: string | null;
  categoria: string | null;
  sub_tipo: string | null;
};

export default function EgresosCategoriaPage() {
  const now = new Date();
  const [mode, setMode] = useState<"mensual" | "rango">("mensual");
  const [mes, setMes] = useState(String(now.getMonth() + 1));
  const [anio, setAnio] = useState(String(now.getFullYear()));
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  });
  const [hasta, setHasta] = useState(() => todayARG());
  const [loading, setLoading] = useState(true);
  const [movs, setMovs] = useState<EgresoMov[]>([]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let from = desde;
    let to = hasta;
    if (mode === "mensual") {
      const m = Number(mes);
      const y = Number(anio);
      from = `${y}-${String(m).padStart(2, "0")}-01`;
      to = m === 12
        ? `${y + 1}-01-01`
        : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
    const query = supabase.from("caja_movimientos")
      .select("id, fecha, hora, descripcion, monto, metodo_pago, categoria, sub_tipo")
      .eq("tipo", "egreso")
      .gte("fecha", from);
    const finalQuery = mode === "mensual" ? query.lt("fecha", to) : query.lte("fecha", to);
    const { data } = await finalQuery.order("fecha", { ascending: false }).range(0, 49999);
    setMovs((data || []) as EgresoMov[]);
    setLoading(false);
  }, [mode, mes, anio, desde, hasta]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = useMemo(() => {
    const total = movs.reduce((a, m) => a + Math.abs(m.monto), 0);
    const totalEfvo = movs.filter(m => (m.metodo_pago || "Efectivo") === "Efectivo").reduce((a, m) => a + Math.abs(m.monto), 0);
    const totalTr = movs.filter(m => m.metodo_pago === "Transferencia").reduce((a, m) => a + Math.abs(m.monto), 0);
    const porCategoria: Record<string, { total: number; cantidad: number; items: EgresoMov[] }> = {};
    for (const m of movs) {
      const cat = m.categoria || "Sin categoría";
      if (!porCategoria[cat]) porCategoria[cat] = { total: 0, cantidad: 0, items: [] };
      porCategoria[cat].total += Math.abs(m.monto);
      porCategoria[cat].cantidad += 1;
      porCategoria[cat].items.push(m);
    }
    const grupos = Object.entries(porCategoria)
      .map(([cat, g]) => ({ categoria: cat, total: g.total, cantidad: g.cantidad, items: g.items, porcentaje: total > 0 ? (g.total / total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
    return { total, totalEfvo, totalTr, grupos };
  }, [movs]);

  const handleExport = () => {
    if (stats.grupos.length === 0) return;
    const headers = ["Categoría", "Cantidad", "Total", "% del total"];
    const rows = stats.grupos.map(g => [
      g.categoria,
      g.cantidad,
      g.total.toFixed(2).replace(".", ","),
      g.porcentaje.toFixed(1) + "%",
    ]);
    rows.push(["TOTAL", String(movs.length), stats.total.toFixed(2).replace(".", ","), "100%"]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const periodo = mode === "mensual" ? `${MESES[Number(mes) - 1]}-${anio}` : `${desde}_${hasta}`;
    a.download = `egresos-categoria-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFecha = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Egresos por Categoría</h1>
            <p className="text-sm text-muted-foreground">En qué se fue la plata</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={stats.grupos.length === 0}>
          <Download className="w-4 h-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <Select value={mode} onValueChange={(v) => v && setMode(v as "mensual" | "rango")}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="rango">Entre fechas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "mensual" ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Mes</Label>
                  <Select value={mes} onValueChange={(v) => v && setMes(v)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MESES.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Año</Label>
                  <Select value={anio} onValueChange={(v) => v && setAnio(v)}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Desde</Label>
                  <DateInput value={desde} onChange={setDesde} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Hasta</Label>
                  <DateInput value={hasta} onChange={setHasta} className="w-40" />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {/* Stats top */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total egresos</p>
              <p className="text-2xl font-bold text-red-500 mt-1">−{formatCurrency(stats.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{movs.length} {movs.length === 1 ? "movimiento" : "movimientos"}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Efectivo</p>
              <p className="text-xl font-semibold mt-1">{formatCurrency(stats.totalEfvo)}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.total > 0 ? ((stats.totalEfvo / stats.total) * 100).toFixed(0) : 0}% del total</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Transferencia</p>
              <p className="text-xl font-semibold mt-1">{formatCurrency(stats.totalTr)}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats.total > 0 ? ((stats.totalTr / stats.total) * 100).toFixed(0) : 0}% del total</p>
            </div>
          </div>

          {/* Tabla por categoría con barras */}
          {stats.grupos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <TrendingDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No hay egresos en este período.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Desglose por categoría</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.grupos.map((g) => (
                  <div key={g.categoria}>
                    <button
                      onClick={() => setExpandedCat((p) => p === g.categoria ? null : g.categoria)}
                      className="w-full text-left rounded-lg border bg-card hover:bg-muted/30 transition-colors p-3"
                    >
                      <div className="flex items-baseline justify-between gap-3 mb-1.5">
                        <span className="font-medium text-sm">{g.categoria}</span>
                        <div className="flex items-baseline gap-3 shrink-0">
                          <span className="text-[11px] text-muted-foreground tabular-nums">{g.cantidad}</span>
                          <span className="text-sm font-bold text-red-500 tabular-nums">−{formatCurrency(g.total)}</span>
                          <span className="text-[11px] text-muted-foreground tabular-nums w-12 text-right">{g.porcentaje.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-red-400 rounded-full"
                          style={{ width: `${g.porcentaje}%` }}
                        />
                      </div>
                    </button>
                    {expandedCat === g.categoria && (
                      <div className="rounded-lg border-x border-b -mt-px divide-y bg-muted/10">
                        {g.items.map((m) => (
                          <div key={m.id} className="flex items-start justify-between gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{m.descripcion || "Egreso"}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatFecha(m.fecha)} · {m.metodo_pago || "Efectivo"}
                                {m.hora ? ` · ${m.hora.substring(0, 5)}` : ""}
                                {m.sub_tipo === "retiro" && <Badge variant="outline" className="ml-1.5 text-[9px] h-4 px-1">retiro</Badge>}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-red-500 tabular-nums shrink-0">−{formatCurrency(Math.abs(m.monto))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
