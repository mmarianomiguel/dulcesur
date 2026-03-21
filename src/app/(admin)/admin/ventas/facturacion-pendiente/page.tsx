"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Loader2,
  FileText,
  DollarSign,
  Eye,
  Receipt,
} from "lucide-react";

interface RemitoRow {
  id: string;
  numero: string;
  fecha: string;
  forma_pago: string;
  subtotal: number;
  descuento_porcentaje: number;
  recargo_porcentaje: number;
  total: number;
  estado: string;
  observacion: string | null;
  entregado: boolean;
  cliente_id: string | null;
  vendedor_id: string | null;
  clientes: { id: string; nombre: string; cuit: string | null; tipo_factura?: string } | null;
}

interface VentaItemRow {
  id: string;
  producto_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

export default function FacturacionPendientePage() {
  const [remitos, setRemitos] = useState<RemitoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRemito, setDetailRemito] = useState<RemitoRow | null>(null);
  const [detailItems, setDetailItems] = useState<VentaItemRow[]>([]);

  const fetchRemitos = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, clientes(id, nombre, cuit, tipo_factura)")
      .eq("tipo_comprobante", "Remito X")
      .eq("facturado", false)
      .order("fecha", { ascending: false });

    if (dateFrom) query = query.gte("fecha", dateFrom);
    if (dateTo) query = query.lte("fecha", dateTo);

    const { data } = await query;
    let results = (data as unknown as RemitoRow[]) || [];

    if (search) {
      const s = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.numero.toLowerCase().includes(s) ||
          (r.clientes?.nombre || "").toLowerCase().includes(s)
      );
    }

    setRemitos(results);
    setLoading(false);
  }, [search, dateFrom, dateTo]);

  useEffect(() => { fetchRemitos(); }, [fetchRemitos]);

  const openDetail = async (r: RemitoRow) => {
    setDetailRemito(r);
    const { data } = await supabase
      .from("venta_items")
      .select("*")
      .eq("venta_id", r.id)
      .order("created_at");
    setDetailItems((data as VentaItemRow[]) || []);
    setDetailOpen(true);
  };

  const facturarRemito = async (r: RemitoRow) => {
    setActionLoading(r.id);
    try {
      const tipoFactura = r.clientes?.tipo_factura || "Factura B";
      const { data: numData } = await supabase.rpc("next_numero", { p_tipo: tipoFactura });
      const nuevoNumero = numData as string;

      const { data: items } = await supabase
        .from("venta_items")
        .select("*")
        .eq("venta_id", r.id);

      const { data: newVenta } = await supabase
        .from("ventas")
        .insert({
          numero: nuevoNumero,
          tipo_comprobante: tipoFactura,
          fecha: new Date().toISOString().split("T")[0],
          cliente_id: r.cliente_id,
          vendedor_id: r.vendedor_id,
          forma_pago: r.forma_pago,
          subtotal: r.subtotal,
          descuento_porcentaje: r.descuento_porcentaje,
          recargo_porcentaje: r.recargo_porcentaje,
          total: r.total,
          estado: r.estado,
          observacion: r.observacion,
          entregado: r.entregado,
          facturado: false,
          remito_origen_id: r.id,
        })
        .select("id")
        .single();

      if (newVenta && items) {
        const newItems = items.map((item: VentaItemRow) => ({
          venta_id: newVenta.id,
          producto_id: item.producto_id,
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidad_medida: item.unidad_medida,
          precio_unitario: item.precio_unitario,
          descuento: item.descuento,
          subtotal: item.subtotal,
        }));
        await supabase.from("venta_items").insert(newItems);
      }

      await supabase.from("ventas").update({ facturado: true }).eq("id", r.id);
      await fetchRemitos();
    } catch (e) {
      console.error("Error facturando remito:", e);
    }
    setActionLoading(null);
  };

  const totalSinFacturar = remitos.length;
  const montoPendiente = remitos.reduce((a, r) => a + r.total, 0);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Facturacion Pendiente</h1>
        <p className="text-muted-foreground text-sm">Remitos pendientes de facturacion</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><FileText className="w-5 h-5 text-amber-500" /></div>
            <div><p className="text-xs text-muted-foreground">Remitos sin facturar</p><p className="text-xl font-bold">{totalSinFacturar}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-xs text-muted-foreground">Monto pendiente</p><p className="text-xl font-bold">{formatCurrency(montoPendiente)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Numero o cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">N. Remito</th>
                    <th className="text-left py-3 px-4 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                    <th className="text-right py-3 px-4 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {remitos.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{r.numero}</td>
                      <td className="py-3 px-4 text-muted-foreground">{new Date(r.fecha + "T12:00:00").toLocaleDateString("es-AR")}</td>
                      <td className="py-3 px-4 font-medium">{r.clientes?.nombre || "—"}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(r.total)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(r)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={actionLoading === r.id}
                            onClick={() => facturarRemito(r)}
                          >
                            {actionLoading === r.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Receipt className="w-3 h-3 mr-1" />}
                            Facturar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {remitos.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">No hay remitos pendientes de facturacion</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="truncate">Remito {detailRemito?.numero}</DialogTitle>
          </DialogHeader>
          {detailRemito && (
            <div className="w-full overflow-hidden space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">Fecha:</span> <span className="font-medium ml-1">{new Date(detailRemito.fecha + "T12:00:00").toLocaleDateString("es-AR")}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium ml-1">{detailRemito.clientes?.nombre || "—"}</span></div>
                <div><span className="text-muted-foreground">Pago:</span> <span className="font-medium ml-1">{detailRemito.forma_pago}</span></div>
              </div>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium">Codigo</th>
                      <th className="text-left py-2 px-3 font-medium">Articulo</th>
                      <th className="text-center py-2 px-3 font-medium">Cant</th>
                      <th className="text-right py-2 px-3 font-medium">Precio</th>
                      <th className="text-right py-2 px-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                        <td className="py-2 px-3">{item.descripcion}</td>
                        <td className="py-2 px-3 text-center">{item.cantidad}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(item.precio_unitario)}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end text-lg font-bold">
                Total: {formatCurrency(detailRemito.total)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
