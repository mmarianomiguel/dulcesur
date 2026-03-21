"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  FileText,
  Download,
  Loader2,
  Eye,
  DollarSign,
  Receipt,
  Printer,
  Truck,
  CheckCircle,
  Filter,
  Ban,
  AlertTriangle,
  Store,
  ShoppingCart,
  Package,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Plus,
  X,
  Trash2,
  Save,
  Globe,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { ReceiptPrintView, defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptLineItem } from "@/components/receipt-print-view";

// ─── Historial types ───
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

interface VentaRow {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  created_at: string;
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
  origen: string | null;
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

// ─── Pedidos Online types ───
interface PedidoItem {
  id?: number;
  pedido_id?: number;
  producto_id: string;
  nombre: string;
  presentacion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  unidades_por_presentacion: number;
}

interface Pedido {
  id: number;
  numero: string;
  created_at: string;
  estado: string;
  nombre_cliente: string;
  email: string;
  telefono: string;
  metodo_entrega: string;
  direccion_texto: string | null;
  fecha_entrega: string | null;
  metodo_pago: string;
  subtotal: number;
  costo_envio: number;
  total: number;
  observacion: string | null;
  cliente_auth_id: string | null;
  items: PedidoItem[];
}

interface ProductoSearch {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  unidad_medida?: string;
}

// ─── Helpers ───
function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

function formatDatePDF(fecha: string) {
  const d = new Date(fecha + "T12:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

const estadoBadge: Record<string, { bg: string; text: string; label: string }> = {
  pendiente: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Pendiente" },
  armado: { bg: "bg-violet-50 border-violet-200", text: "text-violet-700", label: "Armado" },
  confirmado: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Confirmado" },
  entregado: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Entregado" },
  cancelado: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Cancelado" },
};

export default function ListadoVentasPage() {
  // ─── Main tab state ───
  const [activeTab, setActiveTab] = useState<"historial" | "pedidos">("historial");

  // ══════════════════════════════════════════════════════════════
  // HISTORIAL DE VENTAS STATE
  // ══════════════════════════════════════════════════════════════
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOrigen, setFilterOrigen] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterMode, setFilterMode] = useState<"day" | "month" | "range" | "all">("month");
  const [filterDay, setFilterDay] = useState(new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [searchClient, setSearchClient] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("buscar") || "";
    }
    return "";
  });
  const [showFilters, setShowFilters] = useState(false);

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVenta, setDetailVenta] = useState<VentaRow | null>(null);
  const [detailItems, setDetailItems] = useState<VentaItemRow[]>([]);
  const [detailComboIds, setDetailComboIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Anulacion
  const [anularVenta, setAnularVenta] = useState<VentaRow | null>(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

  // Print
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);
  const [receiptConfig, setReceiptConfig] = useState(defaultReceiptConfig);
  const [printVenta, setPrintVenta] = useState<VentaRow | null>(null);
  const [printItems, setPrintItems] = useState<VentaItemRow[]>([]);
  const [printLineItems, setPrintLineItems] = useState<ReceiptLineItem[]>([]);
  const [printReady, setPrintReady] = useState(false);
  const [printClienteSaldo, setPrintClienteSaldo] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  // ══════════════════════════════════════════════════════════════
  // PEDIDOS ONLINE STATE
  // ══════════════════════════════════════════════════════════════
  const [poPedidos, setPoPedidos] = useState<Pedido[]>([]);
  const [poLoading, setPoLoading] = useState(true);
  const [poFilterEstado, setPoFilterEstado] = useState("todos");
  const [poFilterEntrega, setPoFilterEntrega] = useState("todos");
  const [poSearch, setPoSearch] = useState("");

  // PO Detail/Edit dialog
  const [poDetailOpen, setPoDetailOpen] = useState(false);
  const [poSelectedPedido, setPoSelectedPedido] = useState<Pedido | null>(null);
  const [poEditItems, setPoEditItems] = useState<PedidoItem[]>([]);
  const [poSaving, setPoSaving] = useState(false);
  const [poHasChanges, setPoHasChanges] = useState(false);

  // PO Add product search
  const [poAddProductOpen, setPoAddProductOpen] = useState(false);
  const [poProductSearch, setPoProductSearch] = useState("");
  const [poProductResults, setPoProductResults] = useState<ProductoSearch[]>([]);
  const [poSearchingProducts, setPoSearchingProducts] = useState(false);

  // ══════════════════════════════════════════════════════════════
  // HISTORIAL LOGIC
  // ══════════════════════════════════════════════════════════════

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, created_at, clientes(id, nombre, cuit, tipo_factura, domicilio, telefono, situacion_iva, localidad, provincia, codigo_postal, numero_documento)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filterOrigen === "pos") query = query.or("origen.eq.pos,origen.is.null");
    else if (filterOrigen === "tienda") query = query.eq("origen", "tienda");
    if (filterType !== "all") query = query.eq("tipo_comprobante", filterType);
    if (filterPayment !== "all") query = query.eq("forma_pago", filterPayment);

    if (filterMode === "day") {
      query = query.eq("fecha", filterDay);
    } else if (filterMode === "month") {
      const m = filterMonth.padStart(2, "0");
      const start = `${filterYear}-${m}-01`;
      const nextMonth = Number(filterMonth) === 12 ? 1 : Number(filterMonth) + 1;
      const nextYear = Number(filterMonth) === 12 ? Number(filterYear) + 1 : Number(filterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      query = query.gte("fecha", start).lt("fecha", end);
    } else if (filterMode === "range" && filterFrom && filterTo) {
      query = query.gte("fecha", filterFrom).lte("fecha", filterTo);
    }

    const { data } = await query;
    let results = (data as unknown as VentaRow[]) || [];

    if (searchClient) {
      results = results.filter((v) =>
        (v.clientes?.nombre || "").toLowerCase().includes(searchClient.toLowerCase()) ||
        v.numero.toLowerCase().includes(searchClient.toLowerCase())
      );
    }

    setVentas(results);
    setLoading(false);
  }, [filterOrigen, filterType, filterPayment, filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo, searchClient]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);

  useEffect(() => {
    supabase.from("usuarios").select("id, nombre").eq("activo", true).then(({ data }) => setVendedores(data || []));
    // Load saved receipt config
    try {
      const stored = localStorage.getItem("receipt_config");
      if (stored) setReceiptConfig((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch {}
  }, []);

  const openDetail = async (v: VentaRow) => {
    setDetailVenta(v);
    const { data } = await supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at");
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

    setDetailOpen(true);
  };

  const marcarEntregado = async (v: VentaRow) => {
    setActionLoading(v.id);
    await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", v.id);
    // Sync to pedidos_tienda so client sees "entregado"
    await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", v.numero);
    await fetchVentas();
    setActionLoading(null);
  };

  const handleAnular = async () => {
    if (!anularVenta) return;
    setAnulando(true);
    const v = anularVenta;
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const hora = new Date().toTimeString().split(" ")[0];
    const motivoTexto = anularMotivo ? ` (${anularMotivo})` : "";
    const errores: string[] = [];

    try {
      // 1. Get venta_items to reverse stock
      const { data: vitems, error: vitemsErr } = await supabase.from("venta_items").select("*").eq("venta_id", v.id);
      if (vitemsErr) throw new Error(`Error obteniendo items: ${vitemsErr.message}`);
      const items = (vitems as VentaItemRow[]) || [];

      // 2. Reverse stock for each item
      for (const item of items) {
        if (!item.producto_id) continue;
        const { data: prod, error: prodErr } = await supabase.from("productos").select("id, stock, es_combo").eq("id", item.producto_id).single();
        if (prodErr || !prod) { errores.push(`Producto ${item.descripcion} no encontrado`); continue; }

        if ((prod as any).es_combo) {
          // Combo: reverse each component
          const { data: comboItems } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", item.producto_id);
          for (const ci of comboItems || []) {
            const { data: compProd } = await supabase.from("productos").select("id, stock").eq("id", (ci as any).producto_id).single();
            if (!compProd) { errores.push(`Componente combo no encontrado`); continue; }
            const unitsToRestore = item.cantidad * (ci as any).cantidad;
            const newStock = compProd.stock + unitsToRestore;
            const { error: updErr } = await supabase.from("productos").update({ stock: newStock }).eq("id", (ci as any).producto_id);
            if (updErr) { errores.push(`Error stock combo: ${updErr.message}`); continue; }
            await supabase.from("stock_movimientos").insert({
              producto_id: (ci as any).producto_id,
              tipo: "anulacion",
              cantidad_antes: compProd.stock,
              cantidad_despues: newStock,
              cantidad: unitsToRestore,
              referencia: `Anulación Venta #${v.numero}`,
              descripcion: `Anulación venta - ${(ci as any).productos?.nombre || item.descripcion}${motivoTexto}`,
              usuario: "Admin Sistema",
              orden_id: v.id,
            });
          }
        } else {
          // Regular product
          const upp = item.unidades_por_presentacion || 1;
          const unitsToRestore = item.cantidad * upp;
          const newStock = prod.stock + unitsToRestore;
          const { error: updErr } = await supabase.from("productos").update({ stock: newStock }).eq("id", item.producto_id);
          if (updErr) { errores.push(`Error stock ${item.descripcion}: ${updErr.message}`); continue; }
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            tipo: "anulacion",
            cantidad_antes: prod.stock,
            cantidad_despues: newStock,
            cantidad: unitsToRestore,
            referencia: `Anulación Venta #${v.numero}`,
            descripcion: `Anulación venta - ${item.descripcion}${motivoTexto}`,
            usuario: "Admin Sistema",
            orden_id: v.id,
          });
        }
      }

      // 3. Reverse caja_movimientos
      const { data: cajaRows } = await supabase
        .from("caja_movimientos")
        .select("*")
        .eq("referencia_id", v.id)
        .eq("referencia_tipo", "venta");
      for (const cm of cajaRows || []) {
        const { error: cajaErr } = await supabase.from("caja_movimientos").insert({
          fecha: hoy, hora,
          tipo: "egreso",
          descripcion: `Anulación Venta #${v.numero}${motivoTexto}`,
          metodo_pago: (cm as any).metodo_pago,
          monto: (cm as any).monto,
          referencia_id: v.id,
          referencia_tipo: "anulacion",
          cuenta_bancaria: (cm as any).cuenta_bancaria || null,
        });
        if (cajaErr) errores.push(`Error caja: ${cajaErr.message}`);
      }

      // 4. Reverse cuenta_corriente entries and update client saldo
      if (v.cliente_id) {
        const { data: ccRows } = await supabase
          .from("cuenta_corriente")
          .select("*")
          .eq("venta_id", v.id);
        if (ccRows && ccRows.length > 0) {
          const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single();
          let saldoActual = clienteData?.saldo || 0;

          for (const cc of ccRows) {
            const nuevoSaldo = saldoActual - (cc as any).debe + (cc as any).haber;
            await supabase.from("cuenta_corriente").insert({
              cliente_id: v.cliente_id,
              fecha: hoy,
              comprobante: `Anulación Venta #${v.numero}`,
              descripcion: `Anulación de venta${motivoTexto}`,
              debe: (cc as any).haber,
              haber: (cc as any).debe,
              saldo: nuevoSaldo,
              forma_pago: "Anulación",
              venta_id: v.id,
            });
            saldoActual = nuevoSaldo;
          }
          await supabase.from("clientes").update({ saldo: saldoActual }).eq("id", v.cliente_id);
        }
      }

      // 5. Mark venta as anulada
      const { error: anularErr } = await supabase.from("ventas").update({
        estado: "anulada",
        observacion: v.observacion
          ? `${v.observacion} | ANULADA${motivoTexto}`
          : `ANULADA${motivoTexto}`,
      }).eq("id", v.id);
      if (anularErr) throw new Error(`Error marcando como anulada: ${anularErr.message}`);

      if (errores.length > 0) {
        alert(`Venta anulada con advertencias:\n${errores.join("\n")}`);
      }

      setAnularVenta(null);
      setAnularMotivo("");
      await fetchVentas();
    } catch (err: any) {
      alert(`Error al anular: ${err?.message || String(err)}`);
    } finally {
      setAnulando(false);
    }
  };

  const getVendedorNombre = (id: string | null) => {
    if (!id) return "—";
    return vendedores.find((v) => v.id === id)?.nombre || "—";
  };

  // ─── Print ───
  const preparePrint = async (v: VentaRow) => {
    const { data } = await supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at");
    const items = (data as VentaItemRow[]) || [];
    let saldo = 0;
    if (v.cliente_id) {
      const { data: cd } = await supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single();
      saldo = cd?.saldo || 0;
    }

    // Load combo data for combo products
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
      presentacion: (item as any).presentacion || "",
      unidades_por_presentacion: (item as any).unidades_por_presentacion ?? 1,
      stock: 0,
      es_combo: comboIds.has(item.producto_id || ""),
      comboItems: comboItemsMap[item.producto_id || ""] || [],
    }));

    setPrintClienteSaldo(saldo);
    setPrintVenta(v);
    setPrintItems(items);
    setPrintLineItems(lineItems);
    setPrintReady(true);
  };

  useEffect(() => {
    if (printReady && printRef.current) {
      const timeout = setTimeout(() => {
        const win = window.open("", "_blank");
        if (!win) return;
        const content = printRef.current!.innerHTML;
        win.document.write(`<!DOCTYPE html><html><head><title>Remito ${printVenta?.numero || ""}</title><style>@page{size:A4;margin:0}body{margin:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${content}</body></html>`);
        win.document.close();
        win.focus();
        win.print();
        setPrintReady(false);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [printReady, printVenta]);

  const exportCSV = () => {
    const header = "Tipo,N° Comprobante,Fecha,Cliente,Forma Pago,Total\n";
    const rows = ventas.map((v) =>
      `"${v.tipo_comprobante}","${v.numero}","${v.fecha}","${v.clientes?.nombre || ""}","${v.forma_pago}",${v.total}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ventas_${filterYear}_${filterMonth}.csv`;
    a.click();
  };

  // ─── Historial Derived ───
  const ventasActivas = ventas.filter((v) => v.estado !== "anulada");
  const totalSum = ventasActivas.reduce((a, v) => {
    const isNC = v.tipo_comprobante.includes("Nota de Crédito");
    return a + (isNC ? -v.total : v.total);
  }, 0);
  const pendientesEntrega = ventasActivas.filter((v) => !v.entregado).length;
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  // ══════════════════════════════════════════════════════════════
  // PEDIDOS ONLINE LOGIC
  // ══════════════════════════════════════════════════════════════

  // Compute unidades_por_presentacion from presentation name
  const getUPP = (presentacion: string): number => {
    const lower = (presentacion || "").toLowerCase();
    if (lower.includes("medio")) return 0.5;
    const boxMatch = presentacion.match(/[Cc]aja\s*\(?x?(\d+)\)?/);
    if (boxMatch) return Number(boxMatch[1]);
    return 1;
  };

  const fetchPedidos = useCallback(async () => {
    setPoLoading(true);
    const { data } = await supabase
      .from("pedidos_tienda")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) { setPoLoading(false); return; }

    // Fetch items for all pedidos
    const ids = data.map((p: any) => p.id);
    const { data: allItems } = await supabase
      .from("pedido_tienda_items")
      .select("*")
      .in("pedido_id", ids);

    // Also fetch venta_items to get unidades_por_presentacion
    const numeros = data.map((p: any) => p.numero);
    const { data: ventasData } = await supabase
      .from("ventas")
      .select("id, numero")
      .in("numero", numeros);
    const ventaIdMap: Record<string, string> = {};
    for (const v of ventasData || []) ventaIdMap[v.numero] = v.id;
    const ventaIds = Object.values(ventaIdMap);

    let uppByProducto: Record<string, number> = {};
    if (ventaIds.length > 0) {
      const { data: vitems } = await supabase
        .from("venta_items")
        .select("producto_id, presentacion, unidades_por_presentacion")
        .in("venta_id", ventaIds);
      for (const vi of vitems || []) {
        if (vi.producto_id && vi.unidades_por_presentacion) {
          const key = `${vi.producto_id}_${vi.presentacion || ""}`;
          uppByProducto[key] = vi.unidades_por_presentacion;
        }
      }
    }

    const itemsByPedido: Record<number, PedidoItem[]> = {};
    (allItems || []).forEach((item: any) => {
      if (!itemsByPedido[item.pedido_id]) itemsByPedido[item.pedido_id] = [];
      // Try to get UPP from venta_items, fallback to computing from presentation name
      const key = `${item.producto_id}_${item.presentacion || ""}`;
      const upp = uppByProducto[key] || getUPP(item.presentacion || "");
      itemsByPedido[item.pedido_id].push({ ...item, unidades_por_presentacion: upp });
    });

    setPoPedidos(data.map((p: any) => ({ ...p, items: itemsByPedido[p.id] || [] })));
    setPoLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // Filter pedidos
  const poFiltered = poPedidos.filter((p) => {
    if (poFilterEstado !== "todos" && p.estado !== poFilterEstado) return false;
    if (poFilterEntrega !== "todos" && p.metodo_entrega !== poFilterEntrega) return false;
    if (poSearch) {
      const q = poSearch.toLowerCase();
      if (!p.numero.toLowerCase().includes(q) && !p.nombre_cliente.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Open PO detail
  const poOpenDetail = (pedido: Pedido) => {
    setPoSelectedPedido(pedido);
    setPoEditItems(pedido.items.map((i) => ({ ...i })));
    setPoHasChanges(false);
    setPoDetailOpen(true);
  };

  // Update item quantity
  const poUpdateItemQty = (index: number, qty: number) => {
    if (qty <= 0) return;
    setPoEditItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, cantidad: qty, subtotal: qty * item.precio_unitario } : item
    ));
    setPoHasChanges(true);
  };

  // Remove item
  const poRemoveItem = (index: number) => {
    if (poEditItems.length <= 1) return; // Don't allow empty pedido
    setPoEditItems((prev) => prev.filter((_, i) => i !== index));
    setPoHasChanges(true);
  };

  // Search products to add
  const poSearchProducts = async (query: string) => {
    setPoProductSearch(query);
    if (query.length < 2) { setPoProductResults([]); return; }
    setPoSearchingProducts(true);
    const { data } = await supabase
      .from("productos")
      .select("id, codigo, nombre, precio, unidad_medida")
      .eq("activo", true)
      .or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`)
      .limit(10);
    setPoProductResults((data || []) as ProductoSearch[]);
    setPoSearchingProducts(false);
  };

  // Add product to pedido
  const poAddProduct = (product: ProductoSearch) => {
    // Check if already exists
    const existing = poEditItems.findIndex((i) => i.producto_id === product.id);
    if (existing >= 0) {
      poUpdateItemQty(existing, poEditItems[existing].cantidad + 1);
    } else {
      setPoEditItems((prev) => [...prev, {
        producto_id: product.id,
        nombre: product.nombre,
        presentacion: product.unidad_medida || "Unidad",
        cantidad: 1,
        precio_unitario: product.precio,
        subtotal: product.precio,
        unidades_por_presentacion: 1,
      }]);
      setPoHasChanges(true);
    }
    setPoAddProductOpen(false);
    setPoProductSearch("");
    setPoProductResults([]);
  };

  // Save changes
  const poHandleSave = async () => {
    if (!poSelectedPedido) return;
    setPoSaving(true);
    const errores: string[] = [];

    try {
      const originalItems = poSelectedPedido.items;

      // Calculate stock differences per product (in UNITS, accounting for unidades_por_presentacion)
      const stockDiffs: Record<string, number> = {};
      for (const orig of originalItems) {
        const upp = orig.unidades_por_presentacion || 1;
        stockDiffs[orig.producto_id] = (stockDiffs[orig.producto_id] || 0) + (orig.cantidad * upp);
      }
      for (const item of poEditItems) {
        const upp = item.unidades_por_presentacion || 1;
        stockDiffs[item.producto_id] = (stockDiffs[item.producto_id] || 0) - (item.cantidad * upp);
      }
      // stockDiffs > 0 means units freed -> return stock
      // stockDiffs < 0 means units consumed -> decrement stock

      // Apply stock adjustments
      for (const [productoId, diff] of Object.entries(stockDiffs)) {
        if (Math.abs(diff) < 0.001) continue;
        const { data: prod, error: prodErr } = await supabase.from("productos").select("stock").eq("id", productoId).single();
        if (prodErr || !prod) { errores.push(`Producto ${productoId} no encontrado`); continue; }
        const stockAntes = prod.stock;
        const stockDespues = stockAntes + diff;
        const { error: updErr } = await supabase.from("productos").update({ stock: stockDespues }).eq("id", productoId);
        if (updErr) { errores.push(`Error stock: ${updErr.message}`); continue; }
        await supabase.from("stock_movimientos").insert({
          producto_id: productoId,
          tipo: diff > 0 ? "Ajuste" : "Venta",
          cantidad: diff,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          referencia: `Edición Pedido Web #${poSelectedPedido.numero}`,
          descripcion: diff > 0 ? "Devolución por edición de pedido" : "Agregado por edición de pedido",
          usuario: "Admin Sistema",
        });
      }

      // Delete existing items
      const { error: delErr } = await supabase.from("pedido_tienda_items").delete().eq("pedido_id", poSelectedPedido.id);
      if (delErr) throw new Error(`Error eliminando items: ${delErr.message}`);

      // Insert updated items
      const newItems = poEditItems.map((item) => ({
        pedido_id: poSelectedPedido.id,
        producto_id: item.producto_id,
        nombre: item.nombre,
        presentacion: item.presentacion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.precio_unitario * item.cantidad,
      }));

      const { error: insErr } = await supabase.from("pedido_tienda_items").insert(newItems);
      if (insErr) throw new Error(`Error insertando items: ${insErr.message}`);

      // Update pedido total
      const nuevoSubtotal = poEditItems.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);
      const nuevoTotal = nuevoSubtotal + (poSelectedPedido.costo_envio || 0);

      const { error: pedErr } = await supabase.from("pedidos_tienda").update({
        subtotal: nuevoSubtotal,
        total: nuevoTotal,
      }).eq("id", poSelectedPedido.id);
      if (pedErr) throw new Error(`Error actualizando pedido: ${pedErr.message}`);

      // Sync linked venta + venta_items
      const { data: venta } = await supabase
        .from("ventas")
        .select("id")
        .eq("numero", poSelectedPedido.numero)
        .maybeSingle();

      if (venta) {
        const { error: ventaErr } = await supabase.from("ventas").update({
          subtotal: nuevoSubtotal,
          total: nuevoTotal,
        }).eq("id", venta.id);
        if (ventaErr) errores.push(`Error sync venta: ${ventaErr.message}`);

        await supabase.from("venta_items").delete().eq("venta_id", venta.id);
        const { error: viErr } = await supabase.from("venta_items").insert(
          poEditItems.map((item) => ({
            venta_id: venta.id,
            producto_id: item.producto_id,
            descripcion: `${item.nombre} (${item.presentacion})`,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.precio_unitario * item.cantidad,
            unidad_medida: "Un",
            presentacion: item.presentacion,
            unidades_por_presentacion: item.unidades_por_presentacion || 1,
          }))
        );
        if (viErr) errores.push(`Error sync venta_items: ${viErr.message}`);
      }

      if (errores.length > 0) {
        alert("Guardado con advertencias:\n" + errores.join("\n"));
      }
      setPoHasChanges(false);
      fetchPedidos();
      setPoDetailOpen(false);
    } catch (err: any) {
      alert("Error al guardar: " + (err.message || "Error desconocido"));
    } finally {
      setPoSaving(false);
    }
  };

  // Update estado -- sync to linked venta, return stock on cancel
  const poHandleEstadoChange = async (pedido: Pedido, nuevoEstado: string) => {
    const estadoAnterior = pedido.estado;

    await supabase.from("pedidos_tienda").update({ estado: nuevoEstado }).eq("id", pedido.id);

    // Sync estado to linked venta
    const ventaUpdate: Record<string, unknown> = { estado: nuevoEstado };
    if (nuevoEstado === "entregado") ventaUpdate.entregado = true;
    if (nuevoEstado === "cancelado") ventaUpdate.entregado = false;
    await supabase.from("ventas").update(ventaUpdate).eq("numero", pedido.numero);

    // Return stock when cancelling (only if wasn't already cancelled)
    if (nuevoEstado === "cancelado" && estadoAnterior !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        const upp = item.unidades_por_presentacion || 1;
        const unitsToRestore = item.cantidad * upp;
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        if (!prod) continue;
        const stockAntes = prod.stock;
        const stockDespues = stockAntes + unitsToRestore;
        await supabase.from("productos").update({ stock: stockDespues }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "anulacion",
          cantidad: unitsToRestore,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          referencia: `Cancelación Pedido Web #${pedido.numero}`,
          descripcion: `Devolución stock - ${item.nombre} (${item.presentacion})`,
          usuario: "Admin Sistema",
        });
      }
    }

    // Re-decrement stock if un-cancelling (restoring a previously cancelled pedido)
    if (estadoAnterior === "cancelado" && nuevoEstado !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        const upp = item.unidades_por_presentacion || 1;
        const unitsToDecrement = item.cantidad * upp;
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        if (!prod) continue;
        const stockAntes = prod.stock;
        const stockDespues = stockAntes - unitsToDecrement;
        await supabase.from("productos").update({ stock: stockDespues }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "Venta",
          cantidad: -unitsToDecrement,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          referencia: `Reactivación Pedido Web #${pedido.numero}`,
          descripcion: `Descuento stock - ${item.nombre} (${item.presentacion})`,
          usuario: "Admin Sistema",
        });
      }
    }

    fetchPedidos();
  };

  // PO Stats
  const poPendientes = poPedidos.filter((p) => p.estado === "pendiente").length;
  const poArmados = poPedidos.filter((p) => p.estado === "armado").length;
  const poTotalPendiente = poPedidos.filter((p) => p.estado === "pendiente" || p.estado === "armado").reduce((s, p) => s + p.total, 0);

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Ventas</h1>
          <p className="text-muted-foreground text-sm">
            {activeTab === "historial"
              ? `${ventas.length} comprobantes encontrados${ventas.length !== ventasActivas.length ? ` (${ventas.length - ventasActivas.length} anulados)` : ""}`
              : `${poPedidos.length} pedidos en total`
            }
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === "historial" && (
            <>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-2" />Exportar
              </Button>
              <Link href="/admin/ventas/carga-manual">
                <Button variant="outline" size="sm"><FileText className="w-4 h-4 mr-2" />Carga manual</Button>
              </Link>
              <Link href="/admin/ventas/cambios">
                <Button variant="outline" size="sm">Cambios</Button>
              </Link>
              <Link href="/admin/ventas">
                <Button size="sm">Nueva venta</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <div className="bg-gray-100 rounded-xl p-1 inline-flex gap-1">
        <button
          onClick={() => setActiveTab("historial")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "historial"
              ? "bg-white shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Historial de Ventas
        </button>
        <button
          onClick={() => setActiveTab("pedidos")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === "pedidos"
              ? "bg-white shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Globe className="w-4 h-4" />
          Pedidos Online
          {poPendientes > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {poPendientes}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* HISTORIAL TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === "historial" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-primary" /></div>
                <div><p className="text-xs text-muted-foreground">Comprobantes</p><p className="text-xl font-bold">{ventasActivas.length}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-500" /></div>
                <div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{formatCurrency(totalSum)}</p></div>
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
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"><FileText className="w-5 h-5 text-violet-500" /></div>
                <div><p className="text-xs text-muted-foreground">Promedio por ticket</p><p className="text-xl font-bold">{ventasActivas.length > 0 ? formatCurrency(totalSum / ventasActivas.length) : "$0"}</p></div>
              </CardContent>
            </Card>
          </div>

          {/* Page nav tabs */}
          <div className="flex gap-2 text-sm">
            <Link href="/admin/ventas/listado">
              <Button variant="default" size="sm" className="h-8 text-xs">Todas las Ventas</Button>
            </Link>
            <Link href="/admin/ventas/hoja-ruta">
              <Button variant="outline" size="sm" className="h-8 text-xs">Entregas y Ruta</Button>
            </Link>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6 space-y-4 overflow-visible">
              <div className="flex items-end gap-4">
                <div className="flex-1 max-w-md space-y-1.5">
                  <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar número / cliente..." value={searchClient} onChange={(e) => setSearchClient(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <Button variant={showFilters ? "default" : "outline"} className={showFilters ? "bg-blue-600 hover:bg-blue-700 text-white" : "text-blue-600 border-blue-600 hover:bg-blue-50"} onClick={() => setShowFilters(!showFilters)}>
                  <Filter className="w-4 h-4 mr-2" />Filtros
                </Button>
              </div>
              {showFilters && (
                <div className="border-t pt-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Origen</Label>
                      <Select value={filterOrigen} onValueChange={(v) => setFilterOrigen(v ?? "all")}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="pos">Punto de Venta</SelectItem>
                          <SelectItem value="tienda">Tienda Online</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Tipo de comprobante</Label>
                      <Select value={filterType} onValueChange={(v) => setFilterType(v ?? "all")}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="Remito X">Remito X</SelectItem>
                          <SelectItem value="Pedido Web">Pedido Web</SelectItem>
                          <SelectItem value="Nota de Crédito B">Nota de Crédito B</SelectItem>
                          <SelectItem value="Nota de Crédito C">Nota de Crédito C</SelectItem>
                          <SelectItem value="Nota de Débito B">Nota de Débito B</SelectItem>
                          <SelectItem value="Nota de Débito C">Nota de Débito C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Forma de cobro</Label>
                      <Select value={filterPayment} onValueChange={(v) => setFilterPayment(v ?? "all")}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="Efectivo">Efectivo</SelectItem>
                          <SelectItem value="Transferencia">Transferencia</SelectItem>
                          <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                          <SelectItem value="Mixto">Mixto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Período</Label>
                      <Select value={filterMode} onValueChange={(v) => setFilterMode((v ?? "month") as "day" | "month" | "range" | "all")}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Mensual" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="day">Dia</SelectItem>
                          <SelectItem value="month">Mensual</SelectItem>
                          <SelectItem value="range">Entre fechas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {filterMode === "day" && (
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Fecha:</Label>
                      <Input type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="w-44 h-9" />
                    </div>
                  )}
                  {filterMode === "month" && (
                    <div className="flex items-center gap-3">
                      <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? "1")}>
                        <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Mes" /></SelectTrigger>
                        <SelectContent>
                          {months.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Input type="number" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="w-24 h-9" />
                    </div>
                  )}
                  {filterMode === "range" && (
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground">Desde</Label>
                      <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-40 h-9" />
                      <Label className="text-xs text-muted-foreground">Hasta</Label>
                      <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-40 h-9" />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="pt-0">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : ventas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No se encontraron comprobantes</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-3 px-4 font-medium">Origen</th>
                        <th className="text-left py-3 px-4 font-medium">Tipo</th>
                        <th className="text-left py-3 px-4 font-medium">N°</th>
                        <th className="text-left py-3 px-4 font-medium">Fecha / Hora</th>
                        <th className="text-left py-3 px-4 font-medium">Cliente</th>
                        <th className="text-left py-3 px-4 font-medium">Forma pago</th>
                        <th className="text-center py-3 px-4 font-medium">Entrega</th>
                        <th className="text-right py-3 px-4 font-medium">Total</th>
                        <th className="text-right py-3 px-4 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map((v) => (
                        <tr key={v.id} className={`border-b last:border-0 transition-colors ${v.estado === "anulada" ? "opacity-50 bg-red-50/50" : "hover:bg-muted/50"}`}>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={`text-xs font-normal ${v.origen === "tienda" ? "border-pink-300 text-pink-700 bg-pink-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}>
                              {v.origen === "tienda" ? "Tienda" : "POS"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={v.tipo_comprobante.includes("Nota de Crédito") ? "destructive" : "secondary"} className="text-xs font-normal">
                                {v.tipo_comprobante}
                              </Badge>
                              {v.estado === "anulada" && (
                                <Badge variant="destructive" className="text-[10px] font-bold">ANULADA</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{v.numero}</td>
                          <td className="py-3 px-4 text-muted-foreground">
                            <div>{new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR")}</div>
                            {v.created_at && (
                              <div className="text-xs text-muted-foreground/70">
                                {new Date(v.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium">{v.clientes?.nombre || "—"}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-xs font-normal">{v.forma_pago}</Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {v.tipo_comprobante.includes("Nota de Crédito") ? (
                              <Badge variant="outline" className="text-xs">N/A</Badge>
                            ) : (
                              <Badge variant={v.entregado ? "default" : "secondary"} className="text-xs">
                                {v.entregado ? "Entregado" : "Pendiente"}
                              </Badge>
                            )}
                          </td>
                          <td className={`py-3 px-4 text-right font-semibold ${v.estado === "anulada" ? "line-through text-muted-foreground" : v.tipo_comprobante.includes("Nota de Crédito") ? "text-red-500" : ""}`}>
                            {v.tipo_comprobante.includes("Nota de Crédito") ? `-${formatCurrency(v.total)}` : formatCurrency(v.total)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground">
                                  <MoreHorizontal className="w-4 h-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => openDetail(v)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  Ver detalle
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => preparePrint(v)}>
                                  <Printer className="w-4 h-4 mr-2" />
                                  Imprimir
                                </DropdownMenuItem>
                                {!v.entregado && !v.tipo_comprobante.includes("Nota de Crédito") && v.estado !== "anulada" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => marcarEntregado(v)}
                                      disabled={actionLoading === v.id}
                                    >
                                      <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                                      <span className="text-green-600">Marcar entregado</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {v.estado !== "anulada" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => { setAnularVenta(v); setAnularMotivo(""); }}
                                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    >
                                      <Ban className="w-4 h-4 mr-2" />
                                      Anular
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ventas.length > 0 && (
                    <div className="flex justify-end border-t pt-3 mt-1 px-4">
                      <span className="text-sm text-muted-foreground mr-4">Total:</span>
                      <span className="text-sm font-bold">{formatCurrency(totalSum)}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PEDIDOS ONLINE TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === "pedidos" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-500" /></div>
                <div><p className="text-xs text-muted-foreground">Pendientes</p><p className="text-xl font-bold text-amber-600">{poPendientes}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"><Package className="w-5 h-5 text-violet-500" /></div>
                <div><p className="text-xs text-muted-foreground">Armados</p><p className="text-xl font-bold text-violet-600">{poArmados}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-500" /></div>
                <div><p className="text-xs text-muted-foreground">Total por entregar</p><p className="text-xl font-bold">{formatCurrency(poTotalPendiente)}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-primary" /></div>
                <div><p className="text-xs text-muted-foreground">Total pedidos</p><p className="text-xl font-bold">{poPedidos.length}</p></div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6 space-y-4 overflow-visible">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px] space-y-1.5">
                  <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por numero, cliente o email..."
                      value={poSearch}
                      onChange={(e) => setPoSearch(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Estado</Label>
                  <Select value={poFilterEstado} onValueChange={(v) => setPoFilterEstado(v || "todos")}>
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los estados</SelectItem>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="armado">Armado</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="entregado">Entregado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Entrega</Label>
                  <Select value={poFilterEntrega} onValueChange={(v) => setPoFilterEntrega(v || "todos")}>
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="Entrega" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      <SelectItem value="envio">Envio</SelectItem>
                      <SelectItem value="retiro_local">Retiro en local</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pedidos list */}
          <Card>
            <CardContent className="pt-0">
              {poLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : poFiltered.length === 0 ? (
                <div className="text-center py-16">
                  <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No hay pedidos con los filtros seleccionados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left px-4 py-3 font-medium">Pedido</th>
                        <th className="text-left px-4 py-3 font-medium">Cliente</th>
                        <th className="text-left px-4 py-3 font-medium">Entrega</th>
                        <th className="text-left px-4 py-3 font-medium">Fecha entrega</th>
                        <th className="text-center px-4 py-3 font-medium">Items</th>
                        <th className="text-right px-4 py-3 font-medium">Total</th>
                        <th className="text-center px-4 py-3 font-medium">Estado</th>
                        <th className="text-right px-4 py-3 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poFiltered.map((pedido) => {
                        const est = estadoBadge[pedido.estado] || estadoBadge.pendiente;
                        return (
                          <tr key={pedido.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-semibold">#{pedido.numero}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(pedido.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{pedido.nombre_cliente}</p>
                              <p className="text-[10px] text-muted-foreground">{pedido.email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                {pedido.metodo_entrega === "envio" ? (
                                  <><Truck className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs">Envio</span></>
                                ) : (
                                  <><Store className="w-3.5 h-3.5 text-green-500" /><span className="text-xs">Retiro</span></>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {pedido.fecha_entrega ? new Date(pedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }) : "---"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="secondary" className="text-xs">{pedido.items.length}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">{formatCurrency(pedido.total)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border ${est.bg} ${est.text}`}>
                                {est.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground">
                                    <MoreHorizontal className="w-4 h-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={() => poOpenDetail(pedido)}>
                                    <Eye className="w-4 h-4 mr-2" />
                                    Ver detalle
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => poOpenDetail(pedido)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Editar pedido
                                  </DropdownMenuItem>
                                  {pedido.estado !== "entregado" && pedido.estado !== "cancelado" && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => poHandleEstadoChange(pedido, "entregado")}>
                                        <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                                        <span className="text-green-600">Marcar entregado</span>
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {pedido.estado !== "cancelado" && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => poHandleEstadoChange(pedido, "cancelado")}
                                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                      >
                                        <Ban className="w-4 h-4 mr-2" />
                                        Cancelar pedido
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* HISTORIAL DETAIL DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">Comprobante {detailVenta?.numero}</DialogTitle>
          </DialogHeader>
          {detailVenta && (
            <div className="w-full overflow-hidden space-y-4">
              {detailVenta.estado === "anulada" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <Ban className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">COMPROBANTE ANULADO</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium ml-1">{detailVenta.tipo_comprobante}</span></div>
                <div><span className="text-muted-foreground">Fecha:</span> <span className="font-medium ml-1">{new Date(detailVenta.fecha + "T12:00:00").toLocaleDateString("es-AR")}</span></div>
                <div><span className="text-muted-foreground">Pago:</span> <span className="font-medium ml-1">{detailVenta.forma_pago}</span></div>
                <div><span className="text-muted-foreground">Entrega:</span> <Badge variant={detailVenta.entregado ? "default" : "secondary"} className="ml-1">{detailVenta.entregado ? "Entregado" : "Pendiente"}</Badge></div>
              </div>
              <div className="text-sm"><span className="text-muted-foreground">Cliente:</span> <span className="font-medium ml-1">{detailVenta.clientes?.nombre || "—"}</span></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); preparePrint(detailVenta); }}>
                  <Printer className="w-3.5 h-3.5 mr-1.5" />Imprimir
                </Button>
              </div>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium">Código</th>
                      <th className="text-left py-2 px-3 font-medium">Artículo</th>
                      <th className="text-center py-2 px-3 font-medium">Cant</th>
                      <th className="text-right py-2 px-3 font-medium">Precio</th>
                      <th className="text-right py-2 px-3 font-medium">Desc.%</th>
                      <th className="text-right py-2 px-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item) => {
                      const cleanDesc = item.descripcion
                        .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
                        .replace(/\s*\(Unidad\)$/, "")
                        .replace(/(\([^)]+\))\s*\1/gi, "$1")
                        .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
                        .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
                      const isCombo = detailComboIds.has(item.producto_id || "");
                      const upp = item.unidades_por_presentacion ?? 1;
                      const displayQty = upp > 0 && upp < 1 ? item.cantidad * upp : item.cantidad;
                      return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                        <td className="py-2 px-3">
                          {isCombo && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-black text-white mr-1.5 tracking-wider">COMBO</span>
                          )}
                          {cleanDesc}
                        </td>
                        <td className="py-2 px-3 text-center">{displayQty}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(item.precio_unitario)}</td>
                        <td className="py-2 px-3 text-right">{item.descuento > 0 ? `(-${item.descuento}%)` : ""}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end text-lg font-bold">
                Total: {formatCurrency(detailVenta.total)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ANULAR DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!anularVenta} onOpenChange={(open) => { if (!open) setAnularVenta(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Anular comprobante
            </DialogTitle>
          </DialogHeader>
          {anularVenta && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-red-800">Esta acción revertirá:</p>
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  <li>El stock de los productos será restaurado</li>
                  <li>Se generará un egreso en caja para compensar</li>
                  {anularVenta.forma_pago === "Cuenta Corriente" || anularVenta.forma_pago === "Mixto" ? (
                    <li>Se revertirá el movimiento en cuenta corriente del cliente</li>
                  ) : null}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Comprobante:</span> <span className="font-medium">{anularVenta.numero}</span></div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{formatCurrency(anularVenta.total)}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{anularVenta.clientes?.nombre || "—"}</span></div>
                <div><span className="text-muted-foreground">Pago:</span> <span className="font-medium">{anularVenta.forma_pago}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Motivo de anulación (opcional)</Label>
                <Input
                  placeholder="Ej: Error en el monto, devolución del cliente..."
                  value={anularMotivo}
                  onChange={(e) => setAnularMotivo(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setAnularVenta(null)} disabled={anulando}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleAnular} disabled={anulando}>
                  {anulando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
                  Confirmar anulación
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PEDIDOS ONLINE DETAIL / EDIT DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={poDetailOpen} onOpenChange={(open) => {
        if (!open && poHasChanges) {
          if (!confirm("Tenés cambios sin guardar. ¿Cerrar de todas formas?")) return;
        }
        setPoDetailOpen(open);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {poSelectedPedido && (
            <>
              {/* Header */}
              <div className="px-6 py-4 border-b bg-muted/30">
                <DialogHeader className="p-0 space-y-0">
                  <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    Pedido #{poSelectedPedido.numero}
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground mt-1">
                  Creado el {new Date(poSelectedPedido.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Client info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <User className="w-4 h-4" /> Cliente
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      <p className="font-medium">{poSelectedPedido.nombre_cliente}</p>
                      {poSelectedPedido.email && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{poSelectedPedido.email}</p>}
                      {poSelectedPedido.telefono && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{poSelectedPedido.telefono}</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Truck className="w-4 h-4" /> Entrega
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      <p className="flex items-center gap-1.5">
                        {poSelectedPedido.metodo_entrega === "envio" ? (
                          <><Truck className="w-3.5 h-3.5 text-blue-500" /> Envio a domicilio</>
                        ) : (
                          <><Store className="w-3.5 h-3.5 text-green-500" /> Retiro en local</>
                        )}
                      </p>
                      {poSelectedPedido.direccion_texto && (
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{poSelectedPedido.direccion_texto}</p>
                      )}
                      {poSelectedPedido.fecha_entrega && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(poSelectedPedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Pago: {poSelectedPedido.metodo_pago}</p>
                    </div>
                  </div>
                </div>

                {poSelectedPedido.observacion && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-amber-800 text-xs mb-1">Observacion del cliente:</p>
                    <p className="text-amber-700">{poSelectedPedido.observacion}</p>
                  </div>
                )}

                {/* Estado */}
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">Estado:</Label>
                  <Select
                    value={poSelectedPedido.estado}
                    onValueChange={(v) => {
                      if (!v) return;
                      poHandleEstadoChange(poSelectedPedido, v);
                      setPoSelectedPedido({ ...poSelectedPedido, estado: v });
                    }}
                  >
                    <SelectTrigger className="w-44 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="armado">Armado</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="entregado">Entregado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Items table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Package className="w-4 h-4" /> Productos ({poEditItems.length})
                    </h3>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setPoAddProductOpen(true)}>
                      <Plus className="w-3 h-3" /> Agregar producto
                    </Button>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Producto</th>
                          <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-24">Presentacion</th>
                          <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-20">Cant.</th>
                          <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Precio</th>
                          <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Subtotal</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {poEditItems.map((item, idx) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="px-3 py-2 font-medium">{item.nombre}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.presentacion}</td>
                            <td className="px-3 py-2 text-center">
                              <Input
                                type="number"
                                min={1}
                                value={item.cantidad}
                                onChange={(e) => poUpdateItemQty(idx, Number(e.target.value))}
                                className="h-7 w-16 text-center mx-auto"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.precio_unitario * item.cantidad)}</td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => poRemoveItem(idx)}
                                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                                disabled={poEditItems.length <= 1}
                                title="Quitar producto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="mt-3 space-y-1 text-sm text-right">
                    <p className="text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{formatCurrency(poEditItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0))}</span></p>
                    {(poSelectedPedido.costo_envio || 0) > 0 && (
                      <p className="text-muted-foreground">Envio: <span className="font-medium text-foreground">{formatCurrency(poSelectedPedido.costo_envio)}</span></p>
                    )}
                    <p className="text-base font-bold">Total: {formatCurrency(poEditItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0) + (poSelectedPedido.costo_envio || 0))}</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
                <div>
                  {poHasChanges && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Cambios sin guardar
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => {
                    if (poHasChanges && !confirm("Tenés cambios sin guardar. ¿Cerrar de todas formas?")) return;
                    setPoDetailOpen(false);
                  }}>
                    Cerrar
                  </Button>
                  {poHasChanges && (
                    <Button onClick={poHandleSave} disabled={poSaving}>
                      {poSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Guardar cambios
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PO ADD PRODUCT DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={poAddProductOpen} onOpenChange={setPoAddProductOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> Agregar producto al pedido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o codigo..."
                value={poProductSearch}
                onChange={(e) => poSearchProducts(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            {poSearchingProducts && <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
            {poProductResults.length > 0 && (
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {poProductResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => poAddProduct(p)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">{p.codigo}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(p.precio)}</span>
                  </button>
                ))}
              </div>
            )}
            {poProductSearch.length >= 2 && !poSearchingProducts && poProductResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No se encontraron productos</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden print area */}
      {printVenta && (
        <div style={{ position: "fixed", left: "-9999px", top: 0 }} ref={printRef}>
          <ReceiptPrintView
            config={receiptConfig}
            sale={{
              numero: printVenta.numero,
              total: printVenta.total,
              subtotal: printVenta.subtotal,
              descuento: Math.round(printVenta.subtotal * (printVenta.descuento_porcentaje || 0) / 100),
              recargo: Math.round(printVenta.subtotal * (printVenta.recargo_porcentaje || 0) / 100),
              transferSurcharge: 0,
              tipoComprobante: printVenta.tipo_comprobante,
              formaPago: printVenta.forma_pago,
              moneda: printVenta.moneda || "ARS",
              cliente: printVenta.clientes?.nombre || "Consumidor Final",
              clienteDireccion: printVenta.clientes?.domicilio || null,
              clienteTelefono: printVenta.clientes?.telefono || null,
              clienteCondicionIva: printVenta.clientes?.situacion_iva || null,
              vendedor: getVendedorNombre(printVenta.vendedor_id),
              fecha: formatDatePDF(printVenta.fecha),
              saldoAnterior: printClienteSaldo,
              saldoNuevo: printClienteSaldo,
              items: printLineItems,
            }}
          />
        </div>
      )}
    </div>
  );
}
