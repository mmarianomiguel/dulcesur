"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { DollarSign, ShoppingCart, Clock, TrendingUp } from "lucide-react";

export function VentasHoyWidget() {
  const [stats, setStats] = useState({
    total: 0,
    cantidad: 0,
    pendientes: 0,
    ultimaVenta: null as string | null,
  });

  const fetchStats = useCallback(async () => {
    const hoy = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    });

    const { data } = await supabase
      .from("ventas")
      .select("total, estado, entregado, created_at")
      .eq("fecha", hoy)
      .neq("estado", "anulada")
      .not("tipo_comprobante", "ilike", "Nota de Crédito%");

    const ventas = data || [];
    const total = ventas.reduce((s, v) => s + v.total, 0);
    const pendientes = ventas.filter((v) => !v.entregado).length;
    const ultima = ventas.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]?.created_at || null;

    setStats({ total, cantidad: ventas.length, pendientes, ultimaVenta: ultima });
  }, []);

  useEffect(() => {
    fetchStats();

    const channel = supabase
      .channel("ventas_hoy_widget")
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas" }, fetchStats)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchStats]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Facturado hoy</p>
          <p className="text-lg font-bold">{formatCurrency(stats.total)}</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ShoppingCart className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ventas</p>
          <p className="text-lg font-bold">{stats.cantidad}</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
          <Clock className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pendientes entrega</p>
          <p className="text-lg font-bold text-amber-600">{stats.pendientes}</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Última venta</p>
          <p className="text-sm font-semibold">
            {stats.ultimaVenta
              ? new Date(stats.ultimaVenta).toLocaleTimeString("es-AR", {
                  hour: "2-digit", minute: "2-digit", hour12: false,
                  timeZone: "America/Argentina/Buenos_Aires",
                })
              : "\u2014"}
          </p>
        </div>
      </div>
    </div>
  );
}
