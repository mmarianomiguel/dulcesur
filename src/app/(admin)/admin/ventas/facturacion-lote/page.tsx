"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  FileText,
  DollarSign,
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

interface ClienteOption {
  id: string;
  nombre: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

export default function FacturacionLotePage() {
  const [remitos, setRemitos] = useState<RemitoRow[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCliente, setFilterCliente] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const fetchRemitos = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, clientes(id, nombre, cuit, tipo_factura)")
      .eq("tipo_comprobante", "Remito X")
      .eq("facturado", false)
      .order("fecha", { ascending: false });

    if (filterCliente !== "all") query = query.eq("cliente_id", filterCliente);
    if (dateFrom) query = query.gte("fecha", dateFrom);
    if (dateTo) query = query.lte("fecha", dateTo);

    const { data } = await query;
    setRemitos((data as unknown as RemitoRow[]) || []);
    setLoading(false);
  }, [filterCliente, dateFrom, dateTo]);

  const fetchClientes = useCallback(async () => {
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre");
    setClientes((data as ClienteOption[]) || []);
  }, []);

  useEffect(() => { fetchRemitos(); }, [fetchRemitos]);
  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === remitos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(remitos.map((r) => r.id)));
    }
  };

  const facturarSeleccionados = async () => {
    const seleccionados = remitos.filter((r) => selected.has(r.id));
    if (seleccionados.length === 0) return;

    setProcessing(true);
    setProgress({ current: 0, total: seleccionados.length });

    for (let i = 0; i < seleccionados.length; i++) {
      const r = seleccionados[i];
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
            fecha: todayARG(),
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
      } catch (e) {
        console.error(`Error facturando remito ${r.numero}:`, e);
      }
      setProgress({ current: i + 1, total: seleccionados.length });
    }

    setSelected(new Set());
    setProcessing(false);
    await fetchRemitos();
  };

  const selectedRemitos = remitos.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRemitos.reduce((a, r) => a + r.total, 0);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Facturación en Lote</h1>
            <p className="text-sm text-muted-foreground">Facturar múltiples remitos a la vez</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><FileText className="w-5 h-5 text-amber-500" /></div>
            <div><p className="text-xs text-muted-foreground">Remitos sin facturar</p><p className="text-xl font-bold">{remitos.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-xs text-muted-foreground">Monto total pendiente</p><p className="text-xl font-bold">{formatCurrency(remitos.reduce((a, r) => a + r.total, 0))}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <Select value={filterCliente} onValueChange={(v) => setFilterCliente(v || "all")}>
                <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Progress */}
      {processing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">Facturando remitos... {progress.current} de {progress.total}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={remitos.length > 0 && selected.size === remitos.length}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded border-gray-300"
                        disabled={processing}
                      />
                    </th>
                    <th className="text-left py-3 px-4 font-medium">N. Remito</th>
                    <th className="text-left py-3 px-4 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {remitos.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${selected.has(r.id) ? "bg-primary/5" : ""}`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="w-4 h-4 rounded border-gray-300"
                          disabled={processing}
                        />
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{r.numero}</td>
                      <td className="py-3 px-4 text-muted-foreground">{new Date(r.fecha + "T12:00:00").toLocaleDateString("es-AR")}</td>
                      <td className="py-3 px-4 font-medium">{r.clientes?.nombre || "—"}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(r.total)}</td>
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

      {/* Summary & Action */}
      {selected.size > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">{selected.size} remitos seleccionados</span>
                <span className="text-muted-foreground mx-2">|</span>
                <span className="font-bold text-lg">{formatCurrency(selectedTotal)}</span>
              </div>
              <Button onClick={facturarSeleccionados} disabled={processing}>
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Receipt className="w-4 h-4 mr-2" />}
                Facturar seleccionados
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
