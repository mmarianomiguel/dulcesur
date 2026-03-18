"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  CheckCircle,
  Eye,
  Truck,
  Receipt,
  Printer,
  Download,
} from "lucide-react";
import type { Empresa } from "@/types/database";

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
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

function formatCurrencyPDF(value: number) {
  return "$" + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatCurrencyTotal(value: number) {
  return "$ " + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDatePDF(fecha: string) {
  const d = new Date(fecha + "T12:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ─── Remito PDF Component (matches the DulceSur format) ───
function RemitoPrintView({
  remito,
  items,
  empresa,
  vendedorNombre,
  clienteSaldo,
}: {
  remito: RemitoRow;
  items: VentaItemRow[];
  empresa: Empresa | null;
  vendedorNombre: string;
  clienteSaldo: number;
}) {
  const cliente = remito.clientes;
  const clienteDomicilio = [
    cliente?.domicilio,
    cliente?.localidad,
    cliente?.provincia,
    cliente?.codigo_postal ? `CP ${cliente.codigo_postal}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const saldoLabel = `Saldo al ${formatDatePDF(remito.fecha)}: ${formatCurrencyTotal(clienteSaldo)}`;

  return (
    <div
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm 10mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "11px",
        color: "#000",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", borderBottom: "2px solid #000", paddingBottom: "6px", marginBottom: "4px" }}>
        {/* Left: Logo & company */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.dulcesur.com/assets/logotipo.png" alt="Logo" style={{ height: "50px" }} />
          </div>
          <div style={{ fontSize: "9px", lineHeight: "1.4" }}>
            <div style={{ fontWeight: "bold" }}>www.dulcesur.com</div>
            <div>{empresa?.domicilio || "Francisco Canaro 4012"} | Tel: {empresa?.telefono || "116299-1571"}</div>
          </div>
        </div>

        {/* Center: X */}
        <div style={{ width: "50px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", borderLeft: "2px solid #000", borderRight: "2px solid #000", padding: "0 8px" }}>
          <div style={{ fontSize: "28px", fontWeight: "bold", lineHeight: 1 }}>X</div>
          <div style={{ fontSize: "7px", textAlign: "center", lineHeight: "1.2", marginTop: "2px" }}>Documento no válido como factura</div>
          <div style={{ fontSize: "11px", fontWeight: "bold", marginTop: "4px" }}>Remito X</div>
        </div>

        {/* Right: Number & fiscal data */}
        <div style={{ flex: 1, paddingLeft: "10px" }}>
          <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "4px" }}>
            N° {remito.numero}
          </div>
          <div style={{ fontSize: "9px", lineHeight: "1.5" }}>
            <div>Fecha: {formatDatePDF(remito.fecha)}</div>
            <div>CUIT: {empresa?.cuit || "20443387898"}</div>
            <div>Ing.Brutos: {empresa?.cuit || "20443387898"}</div>
            <div>Cond.IVA: {empresa?.situacion_iva || "Monotributista Social"}</div>
            <div>Inicio de Actividad: 15/2/2021</div>
          </div>
        </div>
      </div>

      {/* ── Client info ── */}
      <div style={{ border: "1px solid #ccc", padding: "4px 6px", marginBottom: "4px", fontSize: "10px", lineHeight: "1.6" }}>
        <div style={{ display: "flex", gap: "20px" }}>
          <div style={{ flex: 1 }}>
            <span>Cliente: {cliente?.numero_documento || ""} - {cliente?.nombre || "Consumidor Final"}</span>
          </div>
          <div>
            <span>Tel.: {cliente?.telefono || ""}</span>
          </div>
          <div>
            <span>Cond.Fiscal: {cliente?.situacion_iva || "Consumidor final"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          <div style={{ flex: 1 }}>
            <span>Domicilio: {clienteDomicilio || "—"}</span>
          </div>
          <div>
            <span>CUIT: {cliente?.cuit || ""}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          <div style={{ flex: 1 }}>
            <span>Forma de pago: {remito.forma_pago}</span>
          </div>
          <div>
            <span>Moneda: {remito.moneda || "Peso"}</span>
          </div>
          <div>
            <span>Vendedor: {vendedorNombre}</span>
          </div>
        </div>
      </div>

      {/* ── Items table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", flex: 1 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #000", borderTop: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Cant.</th>
            <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Producto</th>
            <th style={{ textAlign: "center", padding: "4px 4px", fontWeight: "bold" }}>U/Med</th>
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Precio Un.</th>
            <th style={{ textAlign: "center", padding: "4px 4px", fontWeight: "bold" }}>Desc.%</th>
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "3px 4px", textAlign: "left" }}>{item.cantidad}</td>
              <td style={{ padding: "3px 4px", textAlign: "left" }}>{item.descripcion}</td>
              <td style={{ padding: "3px 4px", textAlign: "center" }}>{item.unidad_medida || "Un"}</td>
              <td style={{ padding: "3px 4px", textAlign: "right" }}>{formatCurrencyPDF(item.precio_unitario)}</td>
              <td style={{ padding: "3px 4px", textAlign: "center" }}>{item.descuento || 0}</td>
              <td style={{ padding: "3px 4px", textAlign: "right" }}>{formatCurrencyPDF(item.subtotal)}</td>
            </tr>
          ))}
          {/* Empty rows to fill space */}
          {items.length < 20 &&
            Array.from({ length: 20 - items.length }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td style={{ padding: "3px 4px" }}>&nbsp;</td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* ── Footer totals ── */}
      <div style={{ borderTop: "2px solid #000", marginTop: "auto" }}>
        <div style={{ display: "flex", fontSize: "9px", borderBottom: "1px solid #ccc", padding: "4px 0" }}>
          <div style={{ flex: 1 }}>
            <span>Subtotal</span>
          </div>
          <div style={{ width: "70px", textAlign: "right" }}>
            <span>IVA 0%</span>
          </div>
          <div style={{ width: "70px", textAlign: "right" }}>
            <span>IVA 10.5%</span>
          </div>
          <div style={{ width: "70px", textAlign: "right" }}>
            <span>IVA 21%</span>
          </div>
          <div style={{ width: "70px", textAlign: "right" }}>
            <span>Percep.IIBB</span>
          </div>
          <div style={{ width: "70px", textAlign: "right" }}>
            <span>Descuento</span>
          </div>
          <div style={{ width: "70px", textAlign: "right" }}>
            <span>C.F.T.%</span>
          </div>
          <div style={{ width: "120px", textAlign: "right", fontWeight: "bold", fontSize: "11px", background: "#e5e7eb", padding: "2px 6px" }}>
            Total
          </div>
        </div>
        <div style={{ display: "flex", fontSize: "10px", padding: "4px 0", fontWeight: "bold" }}>
          <div style={{ flex: 1 }}>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(remito.subtotal)}</div>
          <div style={{ width: "70px", textAlign: "right" }}></div>
          <div style={{ width: "70px", textAlign: "right" }}></div>
          <div style={{ width: "70px", textAlign: "right" }}></div>
          <div style={{ width: "70px", textAlign: "right" }}></div>
          <div style={{ width: "70px", textAlign: "right" }}></div>
          <div style={{ width: "70px", textAlign: "right" }}></div>
          <div style={{ width: "120px", textAlign: "right", fontSize: "14px", background: "#e5e7eb", padding: "2px 6px" }}>
            {formatCurrencyTotal(remito.total)}
          </div>
        </div>
      </div>

      {/* ── Bottom ── */}
      <div style={{ display: "flex", borderTop: "1px solid #ccc", padding: "4px 0", fontSize: "9px", marginTop: "4px" }}>
        <div style={{ flex: 1 }}>Despacho:</div>
        <div style={{ textAlign: "right" }}>{saldoLabel}</div>
      </div>
      {clienteSaldo > 0 && (
        <div style={{ borderTop: "1px solid #e00", padding: "6px 0", fontSize: "10px", marginTop: "2px", color: "#c00", fontWeight: "bold" }}>
          DEUDA DEL CLIENTE: {formatCurrencyTotal(clienteSaldo)}
        </div>
      )}
    </div>
  );
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);

  // Print state
  const [printRemito, setPrintRemito] = useState<RemitoRow | null>(null);
  const [printItems, setPrintItems] = useState<VentaItemRow[]>([]);
  const [printReady, setPrintReady] = useState(false);
  const [printClienteSaldo, setPrintClienteSaldo] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    fetchRemitos();
    // Load empresa & vendedores
    supabase.from("empresa").select("*").limit(1).single().then(({ data }) => setEmpresa(data));
    supabase.from("usuarios").select("id, nombre").eq("activo", true).then(({ data }) => setVendedores(data || []));
  }, [fetchRemitos]);

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

  const marcarEntregado = async (r: RemitoRow) => {
    setActionLoading(r.id);
    await supabase.from("ventas").update({ entregado: true }).eq("id", r.id);
    await fetchRemitos();
    setActionLoading(null);
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

  // ─── Print / PDF ───
  const preparePrint = async (r: RemitoRow) => {
    const { data } = await supabase
      .from("venta_items")
      .select("*")
      .eq("venta_id", r.id)
      .order("created_at");
    // Fetch client saldo (debt)
    let saldo = 0;
    if (r.cliente_id) {
      const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", r.cliente_id).single();
      saldo = clienteData?.saldo || 0;
    }
    setPrintClienteSaldo(saldo);
    setPrintRemito(r);
    setPrintItems((data as VentaItemRow[]) || []);
    setPrintReady(true);
  };

  useEffect(() => {
    if (printReady && printRef.current) {
      // Small delay to ensure render
      const timeout = setTimeout(() => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const content = printRef.current!.innerHTML;
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Remito ${printRemito?.numero || ""}</title>
            <style>
              @page { size: A4; margin: 0; }
              body { margin: 0; padding: 0; }
              @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              }
            </style>
          </head>
          <body>${content}</body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();

        setPrintReady(false);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [printReady, printRemito]);

  const exportPDF = async (r: RemitoRow) => {
    const { data } = await supabase
      .from("venta_items")
      .select("*")
      .eq("venta_id", r.id)
      .order("created_at");
    setPrintRemito(r);
    setPrintItems((data as VentaItemRow[]) || []);

    // Use html2canvas + jsPDF approach via print dialog with save as PDF
    setTimeout(() => {
      const printWindow = window.open("", "_blank");
      if (!printWindow || !printRef.current) return;

      const content = printRef.current.innerHTML;
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Remito ${r.numero}</title>
          <style>
            @page { size: A4; margin: 0; }
            body { margin: 0; padding: 0; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${content}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      // User can choose "Save as PDF" from the print dialog
      printWindow.print();
    }, 200);
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
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Remitos</h1>
        <p className="text-muted-foreground text-sm">{totalRemitos} remitos encontrados</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Buscar por numero/cliente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                      <td className="py-3 px-4 text-muted-foreground">{new Date(r.fecha).toLocaleDateString("es-AR")}</td>
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
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="truncate">Remito {detailRemito?.numero}</DialogTitle>
          </DialogHeader>
          {detailRemito && (
            <div className="w-full overflow-hidden space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Fecha:</span> <span className="font-medium ml-1">{new Date(detailRemito.fecha).toLocaleDateString("es-AR")}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium ml-1">{detailRemito.clientes?.nombre || "—"}</span></div>
                <div><span className="text-muted-foreground">Entrega:</span> <Badge variant={detailRemito.entregado ? "default" : "secondary"} className="ml-1">{detailRemito.entregado ? "Entregado" : "Pendiente"}</Badge></div>
                <div><span className="text-muted-foreground">Facturado:</span> <Badge variant={detailRemito.facturado ? "default" : "outline"} className="ml-1">{detailRemito.facturado ? "Si" : "No"}</Badge></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); preparePrint(detailRemito); }}>
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); exportPDF(detailRemito); }}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Exportar PDF
                </Button>
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

      {/* Hidden print view */}
      <div ref={printRef} style={{ position: "absolute", left: "-9999px", top: 0 }}>
        {printRemito && (
          <RemitoPrintView
            remito={printRemito}
            items={printItems}
            empresa={empresa}
            vendedorNombre={getVendedorNombre(printRemito.vendedor_id)}
            clienteSaldo={printClienteSaldo}
          />
        )}
      </div>
    </div>
  );
}
