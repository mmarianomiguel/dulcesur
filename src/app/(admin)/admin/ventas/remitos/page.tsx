"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { todayARG, formatCurrency, formatDatePDF } from "@/lib/formatters";
import { VentaDetailDialog } from "@/components/venta-detail-dialog";
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
  CheckCircle,
  Eye,
  Truck,
  Receipt,
  Printer,
  Download,
} from "lucide-react";
import { defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptLineItem, ReceiptSale } from "@/components/receipt-print-view";
import { PrintPreviewDialog } from "@/components/print-preview-dialog";

interface ClienteInfo {
  id: string;
  nombre: string;
  cuit: string | null;
  tipo_factura?: string;
  domicilio?: string | null;
  telefono?: string | null;
  situacion_iva?: string;
  localidad?: string | null;
  provincia?: string | null;
  codigo_postal?: string | null;
  numero_documento?: string | null;
}

interface RemitoRow {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  forma_pago: string;
  moneda: string;
  subtotal: number;
  descuento_porcentaje: number;
  recargo_porcentaje: number;
  total: number;
  estado: string;
  observacion: string | null;
  entregado: boolean;
  facturado: boolean;
  cliente_id: string | null;
  vendedor_id: string | null;
  metodo_entrega: string | null;
  clientes: ClienteInfo | null;
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
  presentacion?: string;
  unidades_por_presentacion?: number;
}

export default function RemitosPage() {
  const [remitos, setRemitos] = useState<RemitoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRemito, setDetailRemito] = useState<RemitoRow | null>(null);
  const [detailItems, setDetailItems] = useState<VentaItemRow[]>([]);
  const [detailComboIds, setDetailComboIds] = useState<Set<string>>(new Set());
  const [detailPagos, setDetailPagos] = useState<{ metodo: string; monto: number; cuenta_bancaria?: string | null }[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);

  // Print state - using PrintPreviewDialog
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(defaultReceiptConfig);
  const [printRemito, setPrintRemito] = useState<RemitoRow | null>(null);
  const [printLineItems, setPrintLineItems] = useState<ReceiptLineItem[]>([]);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printSaleObj, setPrintSaleObj] = useState<ReceiptSale | null>(null);
  const [printClienteSaldo, setPrintClienteSaldo] = useState(0);

  const fetchRemitos = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, clientes(id, nombre, cuit, tipo_factura, domicilio, telefono, situacion_iva, localidad, provincia, codigo_postal, numero_documento)")
      .eq("tipo_comprobante", "Remito X")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (dateFrom) query = query.gte("fecha", dateFrom);
    if (dateTo) query = query.lte("fecha", dateTo);

    const { data } = await query;
    let results = (data as unknown as RemitoRow[]) || [];

    if (search) {
      const s = norm(search);
      results = results.filter(
        (r) =>
          norm(r.numero).includes(s) ||
          norm(r.clientes?.nombre || "").includes(s)
      );
    }

    setRemitos(results);
    setLoading(false);
  }, [search, dateFrom, dateTo]);

  useEffect(() => {
    fetchRemitos();
    supabase.from("usuarios").select("id, nombre").eq("activo", true).then(({ data }) => setVendedores(data || []));
    try {
      const stored = localStorage.getItem("receipt_config");
      if (stored) setReceiptConfig((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch (err) { console.error("Error loading receipt config:", err); }
    // Load empresa data for logo fallback
    supabase.from("empresa").select("nombre, domicilio, telefono, cuit, situacion_iva").limit(1).single().then(({ data: emp }) => {
      if (emp) {
        setReceiptConfig((prev) => ({
          ...prev,
          empresaNombre: prev.empresaNombre || emp.nombre || "",
          empresaDomicilio: prev.empresaDomicilio || emp.domicilio || "",
          empresaTelefono: prev.empresaTelefono || emp.telefono || "",
          empresaCuit: prev.empresaCuit || emp.cuit || "",
          empresaIva: prev.empresaIva || emp.situacion_iva || "",
        }));
      }
    });
    // Load logo and web URL from tienda_config if not in receipt_config
    supabase.from("tienda_config").select("logo_url, url_tienda").limit(1).single().then(({ data: tc }) => {
      if (tc) {
        setReceiptConfig((prev) => ({
          ...prev,
          logoUrl: prev.logoUrl || "https://res.cloudinary.com/dss3lnovd/image/upload/v1774505786/dulcesur/logo-dulcesur-negro.jpg",
          empresaWeb: prev.empresaWeb || tc.url_tienda || "",
        }));
      }
    });
  }, [fetchRemitos]);

  const openDetail = async (r: RemitoRow) => {
    setDetailRemito(r);
    const { data } = await supabase
      .from("venta_items")
      .select("*")
      .eq("venta_id", r.id)
      .order("created_at");
    const items = (data as VentaItemRow[]) || [];
    setDetailItems(items);

    // Check for combos
    const productIds = items.map((i) => i.producto_id).filter(Boolean) as string[];
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", productIds);
      const cIds = new Set<string>();
      for (const p of prods || []) { if ((p as any).es_combo) cIds.add(p.id); }
      setDetailComboIds(cIds);
    } else {
      setDetailComboIds(new Set());
    }

    // Load payment breakdown
    setDetailPagos([]);
    const { data: movs } = await supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, cuenta_bancaria").eq("referencia_id", r.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso");
    if (movs && movs.length > 0) {
      setDetailPagos(movs.map((m: any) => ({ metodo: m.metodo_pago, monto: Math.abs(m.monto), cuenta_bancaria: m.cuenta_bancaria })));
    } else if (r.forma_pago) {
      setDetailPagos([{ metodo: r.forma_pago, monto: r.total }]);
    }

    setDetailOpen(true);
  };

  const marcarEntregado = async (r: RemitoRow) => {
    setActionLoading(r.id);
    await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", r.id);
    // Sync to pedidos_tienda so client sees "entregado"
    await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", r.numero);
    await fetchRemitos();
    setActionLoading(null);
  };

  const facturarRemito = async (r: RemitoRow) => {
    setActionLoading(r.id);
    try {
      const rawTipo = r.clientes?.tipo_factura || "B";
      const tipoFactura = rawTipo.startsWith("Factura") ? rawTipo : `Factura ${rawTipo}`;
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
      await fetchRemitos();
    } catch (e) {
      console.error("Error facturando remito:", e);
    }
    setActionLoading(null);
  };

  // ─── Print / PDF ───
  const preparePrint = async (r: RemitoRow) => {
    const { data } = await supabase
      .from("venta_items")
      .select("*")
      .eq("venta_id", r.id)
      .order("created_at");
    const items = (data as VentaItemRow[]) || [];

    // Fetch client saldo
    let saldo = 0;
    if (r.cliente_id) {
      const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", r.cliente_id).single();
      saldo = clienteData?.saldo || 0;
    }

    // Load combo data
    const productIds = items.map((i) => i.producto_id).filter(Boolean) as string[];
    const comboItemsMap: Record<string, { nombre: string; cantidad: number }[]> = {};
    const comboIds = new Set<string>();
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", productIds);
      for (const p of prods || []) {
        if ((p as any).es_combo) comboIds.add(p.id);
      }
      for (const comboId of comboIds) {
        const { data: ciData } = await supabase
          .from("combo_items")
          .select("cantidad, productos!combo_items_producto_id_fkey(nombre)")
          .eq("combo_id", comboId);
        comboItemsMap[comboId] = (ciData || []).map((ci: any) => ({ nombre: ci.productos?.nombre || "", cantidad: ci.cantidad }));
      }
    }

    const lineItems: ReceiptLineItem[] = items.map((item) => ({
      id: item.id,
      producto_id: item.producto_id || "",
      code: item.codigo,
      description: item.descripcion,
      qty: item.cantidad,
      unit: item.unidad_medida || "Un",
      price: item.precio_unitario,
      discount: item.descuento,
      subtotal: item.subtotal,
      presentacion: item.presentacion || "",
      unidades_por_presentacion: item.unidades_por_presentacion ?? 1,
      stock: 0,
      es_combo: comboIds.has(item.producto_id || ""),
      comboItems: comboItemsMap[item.producto_id || ""] || [],
    }));

    setPrintClienteSaldo(saldo);
    setPrintRemito(r);
    setPrintLineItems(lineItems);
    // Build sale object and show preview
    setPrintSaleObj({
      numero: r.numero,
      total: r.total,
      subtotal: r.subtotal,
      descuento: Math.round(r.subtotal * (r.descuento_porcentaje || 0) / 100),
      recargo: Math.round(r.subtotal * (r.recargo_porcentaje || 0) / 100),
      transferSurcharge: 0,
      tipoComprobante: r.tipo_comprobante,
      formaPago: r.forma_pago,
      moneda: r.moneda || "ARS",
      cliente: r.clientes?.nombre || "Consumidor Final",
      clienteDireccion: [r.clientes?.domicilio, r.clientes?.localidad].filter(Boolean).join(", ") || null,
      clienteTelefono: r.clientes?.telefono || null,
      clienteCondicionIva: r.clientes?.situacion_iva || null,
      metodoEntrega: r.metodo_entrega || null,
      vendedor: getVendedorNombre(r.vendedor_id),
      fecha: formatDatePDF(r.fecha),
      saldoAnterior: saldo,
      saldoNuevo: saldo,
      items: lineItems,
    });
    setPrintPreviewOpen(true);
  };

  const exportPDF = async (r: RemitoRow) => {
    await preparePrint(r);
  };

  const getVendedorNombre = (vendedorId: string | null) => {
    if (!vendedorId) return "—";
    return vendedores.find((v) => v.id === vendedorId)?.nombre || "—";
  };

  const totalRemitos = remitos.length;
  const pendientesEntrega = remitos.filter((r) => !r.entregado).length;
  const facturados = remitos.filter((r) => r.facturado).length;
  const montoTotal = remitos.reduce((a, r) => a + r.total, 0);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Remitos</h1>
            <p className="text-sm text-muted-foreground">{totalRemitos} remitos encontrados</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total remitos</p><p className="text-xl font-bold">{totalRemitos}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><Truck className="w-5 h-5 text-amber-500" /></div>
            <div><p className="text-xs text-muted-foreground">Pendientes entrega</p><p className="text-xl font-bold">{pendientesEntrega}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-xs text-muted-foreground">Facturados</p><p className="text-xl font-bold">{facturados}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-violet-500" /></div>
            <div><p className="text-xs text-muted-foreground">Monto total</p><p className="text-xl font-bold">{formatCurrency(montoTotal)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Buscar por numero o cliente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
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
                    <th className="text-left py-3 px-4 font-medium">Numero</th>
                    <th className="text-left py-3 px-4 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                    <th className="text-center py-3 px-4 font-medium">Entrega</th>
                    <th className="text-center py-3 px-4 font-medium">Facturado</th>
                    <th className="text-right py-3 px-4 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {remitos.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{r.numero}</td>
                      <td className="py-3 px-4 text-muted-foreground">{new Date(r.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                      <td className="py-3 px-4 font-medium">{r.clientes?.nombre || "—"}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(r.total)}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={r.entregado ? "default" : "secondary"}>{r.entregado ? "Entregado" : "Pendiente"}</Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={r.facturado ? "default" : "outline"}>{r.facturado ? "Si" : "No"}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(r)} title="Ver detalle">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => preparePrint(r)} title="Imprimir">
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => exportPDF(r)} title="Exportar PDF">
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          {!r.entregado && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              disabled={actionLoading === r.id}
                              onClick={() => marcarEntregado(r)}
                            >
                              {actionLoading === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                              Entregar
                            </Button>
                          )}
                          {!r.facturado && (
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={actionLoading === r.id}
                              onClick={() => facturarRemito(r)}
                            >
                              {actionLoading === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3 mr-1" />}
                              Facturar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {remitos.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">No se encontraron remitos</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <VentaDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        data={detailRemito ? {
          numero: detailRemito.numero,
          created_at: detailRemito.fecha,
          fecha: detailRemito.fecha,
          estado: detailRemito.estado,
          tipo_comprobante: detailRemito.tipo_comprobante,
          forma_pago: detailRemito.forma_pago,
          total: detailRemito.total,
          subtotal: detailRemito.subtotal,
          descuento_porcentaje: detailRemito.descuento_porcentaje,
          recargo_porcentaje: detailRemito.recargo_porcentaje,
          observacion: detailRemito.observacion,
          entregado: detailRemito.entregado,
          nombre_cliente: detailRemito.clientes?.nombre || "Consumidor Final",
          telefono: detailRemito.clientes?.telefono || undefined,
          domicilio: detailRemito.clientes?.domicilio || undefined,
          cuit: detailRemito.clientes?.cuit || undefined,
          vendedor: getVendedorNombre(detailRemito.vendedor_id),
          origen: "historial",
          comboIds: detailComboIds,
        } : null}
        items={detailItems.map((item) => ({
          id: item.id,
          producto_id: item.producto_id,
          codigo: item.codigo || undefined,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          descuento: item.descuento,
          subtotal: item.subtotal,
          unidades_por_presentacion: item.unidades_por_presentacion ?? undefined,
        }))}
        pagos={detailPagos}
        onPrint={detailRemito ? () => { setDetailOpen(false); preparePrint(detailRemito); } : undefined}
        footerExtra={detailRemito ? (
          <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); exportPDF(detailRemito); }}>
            <Download className="w-3.5 h-3.5 mr-1.5" />Exportar PDF
          </Button>
        ) : undefined}
      />

      {/* Print preview dialog */}
      {printSaleObj && (
        <PrintPreviewDialog
          open={printPreviewOpen}
          onClose={() => { setPrintPreviewOpen(false); setPrintSaleObj(null); }}
          config={receiptConfig}
          sale={printSaleObj}
          title={`Vista previa — ${printSaleObj.tipoComprobante} N° ${printSaleObj.numero}`}
        />
      )}
    </div>
  );
}
