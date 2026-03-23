"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG, nowTimeARG, formatCurrency, formatDatePDF, currentMonthPadded } from "@/lib/formatters";
import { logAudit } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { showAdminToast } from "@/components/admin-toast";
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
import { useCurrentUser } from "@/hooks/use-current-user";

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
  codigo?: string;
  descuento?: number;
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
  // Unified detail fields (populated from historial)
  _source?: "historial" | "pedidos";
  _ventaId?: string;
  _clienteId?: string | null;
  _entregado?: boolean;
  _tipo_comprobante?: string;
  _descuento_porcentaje?: number;
  _recargo_porcentaje?: number;
  _vendedor?: string;
  _cuit?: string;
  _domicilio?: string;
  _comboIds?: Set<string>;
}

interface ProductoSearch {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  unidad_medida?: string;
}

// ─── Helpers ───

const estadoBadge: Record<string, { bg: string; text: string; label: string }> = {
  pendiente: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Pendiente" },
  armado: { bg: "bg-violet-50 border-violet-200", text: "text-violet-700", label: "Armado" },
  confirmado: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Confirmado" },
  entregado: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Entregado" },
  cancelado: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Cancelado" },
};

export default function ListadoVentasPage() {
  const currentUser = useCurrentUser();
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
  const [filterDay, setFilterDay] = useState(todayARG());
  const [filterMonth, setFilterMonth] = useState(currentMonthPadded());
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
  const [printSaldoAnteriorCC, setPrintSaldoAnteriorCC] = useState(0);
  const [printPagos, setPrintPagos] = useState<{ efectivo: number; transferencia: number; cuentaCorriente: number; recibido: number; vuelto: number }>({ efectivo: 0, transferencia: 0, cuentaCorriente: 0, recibido: 0, vuelto: 0 });
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

  // PO Cancel confirmation
  const [poCancelPedido, setPoCancelPedido] = useState<Pedido | null>(null);
  const [poCancelling, setPoCancelling] = useState(false);

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
    } catch (err) { console.error("Error loading receipt config:", err); }
    // Load empresa data for receipt fallback
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
          logoUrl: prev.logoUrl || tc.logo_url || "",
          empresaWeb: prev.empresaWeb || tc.url_tienda || "",
        }));
      }
    });
  }, []);

  const openDetail = async (v: VentaRow) => {
    const { data } = await supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at");
    const vitems = (data as VentaItemRow[]) || [];

    // Check for combos
    const productIds = vitems.map((i) => i.producto_id).filter(Boolean) as string[];
    let comboIds = new Set<string>();
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", productIds);
      for (const p of prods || []) { if ((p as any).es_combo) comboIds.add(p.id); }
    }

    // Convert VentaRow → Pedido format for unified dialog
    const estado = v.estado === "anulada" ? "cancelado" : v.entregado ? "entregado" : v.estado || "pendiente";
    const pedidoItems: PedidoItem[] = vitems.map((item) => ({
      producto_id: item.producto_id || "",
      nombre: item.descripcion
        .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
        .replace(/\s*\(Unidad\)$/, "")
        .replace(/(\([^)]+\))\s*\1/gi, "$1")
        .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
        .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1"),
      presentacion: item.presentacion || "Unidad",
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
      unidades_por_presentacion: item.unidades_por_presentacion || 1,
      codigo: item.codigo,
      descuento: item.descuento,
    }));

    const pseudoPedido: Pedido = {
      id: 0,
      numero: v.numero,
      created_at: v.created_at || v.fecha,
      estado,
      nombre_cliente: v.clientes?.nombre || "Consumidor Final",
      email: "",
      telefono: v.clientes?.telefono || "",
      metodo_entrega: v.metodo_entrega || "",
      direccion_texto: v.clientes?.domicilio || null,
      fecha_entrega: null,
      metodo_pago: v.forma_pago,
      subtotal: v.subtotal,
      costo_envio: 0,
      total: v.total,
      observacion: v.observacion,
      cliente_auth_id: null,
      items: pedidoItems,
      _source: "historial",
      _ventaId: v.id,
      _clienteId: v.cliente_id,
      _entregado: v.entregado,
      _tipo_comprobante: v.tipo_comprobante,
      _descuento_porcentaje: v.descuento_porcentaje,
      _recargo_porcentaje: v.recargo_porcentaje,
      _vendedor: getVendedorNombre(v.vendedor_id),
      _cuit: v.clientes?.cuit || "",
      _domicilio: v.clientes?.domicilio || "",
      _comboIds: comboIds,
    };

    setPoSelectedPedido(pseudoPedido);
    setPoEditItems(pedidoItems.map((i) => ({ ...i })));
    setPoHasChanges(false);
    setPoDetailOpen(true);
  };

  const marcarEntregado = async (v: VentaRow) => {
    setActionLoading(v.id);
    await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", v.id);
    // Sync to pedidos_tienda so client sees "entregado"
    await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", v.numero);
    await fetchVentas();
    await fetchPedidos();
    setActionLoading(null);
  };

  const handleAnular = async () => {
    if (!anularVenta) return;
    if (anularVenta.estado === "anulada") { showAdminToast("Esta venta ya fue anulada", "error"); setAnularOpen(false); return; }
    setAnulando(true);
    const v = anularVenta;
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const hora = nowTimeARG();
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
              usuario: currentUser?.nombre || "Admin Sistema",
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
            usuario: currentUser?.nombre || "Admin Sistema",
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

      // 6. Sync to pedidos_tienda so client sees "cancelado"
      await supabase.from("pedidos_tienda").update({ estado: "cancelado" }).eq("numero", v.numero);

      logAudit({
        userName: currentUser?.nombre || "Admin Sistema",
        action: "ANULACION",
        module: "ventas",
        entityId: v.id,
        before: { numero: v.numero, total: v.total, estado: v.estado },
        after: { estado: "anulada", motivo: anularMotivo },
      });

      if (errores.length > 0) {
        showAdminToast(`Venta anulada con advertencias: ${errores.join(". ")}`, "info");
      }

      setAnularVenta(null);
      setAnularMotivo("");
      await fetchVentas();
      await fetchPedidos();
    } catch (err: any) {
      showAdminToast(`Error al anular: ${err?.message || String(err)}`, "error");
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
    let saldoAnteriorCC = 0;
    if (v.cliente_id) {
      // Get saldo at the time of this sale from cuenta_corriente (not current client saldo)
      const { data: ccRow } = await supabase
        .from("cuenta_corriente")
        .select("saldo, debe")
        .eq("venta_id", v.id)
        .eq("cliente_id", v.cliente_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (ccRow) {
        saldo = ccRow.saldo;
        saldoAnteriorCC = ccRow.saldo - ccRow.debe;
      } else {
        // No CC entry for this sale — use current client saldo as fallback
        const { data: cd } = await supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single();
        saldo = cd?.saldo || 0;
      }
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

    // Load payment breakdown from caja_movimientos
    const { data: movs } = await supabase.from("caja_movimientos").select("metodo_pago, monto, tipo").eq("referencia_id", v.id).eq("referencia_tipo", "venta");
    let pagoEf = 0, pagoTr = 0, pagoCC = 0;
    for (const m of movs || []) {
      if (m.tipo === "ingreso") {
        if (m.metodo_pago === "Efectivo") pagoEf += m.monto;
        else if (m.metodo_pago === "Transferencia") pagoTr += m.monto;
        else if (m.metodo_pago === "Cuenta Corriente") pagoCC += m.monto;
      }
    }
    // If no movimientos found, estimate from forma_pago
    if ((movs || []).length === 0) {
      if (v.forma_pago === "Efectivo") pagoEf = v.total;
      else if (v.forma_pago === "Transferencia") pagoTr = v.total;
      else if (v.forma_pago === "Cuenta Corriente") pagoCC = v.total;
    }
    setPrintPagos({ efectivo: pagoEf, transferencia: pagoTr, cuentaCorriente: pagoCC, recibido: 0, vuelto: 0 });
    setPrintClienteSaldo(saldo);
    setPrintSaldoAnteriorCC(saldoAnteriorCC);
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
    setPoSelectedPedido({ ...pedido, _source: "pedidos" });
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

      // Identify combo products and fetch their components
      const allProductIds = [...new Set([
        ...originalItems.map((i) => i.producto_id),
        ...poEditItems.map((i) => i.producto_id),
      ])].filter(Boolean);

      const comboComponentsMap: Record<string, { producto_id: string; cantidad: number; nombre: string }[]> = {};
      if (allProductIds.length > 0) {
        const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", allProductIds);
        const comboIds = (prods || []).filter((p: any) => p.es_combo).map((p: any) => p.id);
        for (const comboId of comboIds) {
          const { data: ciData } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", comboId);
          comboComponentsMap[comboId] = (ciData || []).map((ci: any) => ({
            producto_id: ci.producto_id,
            cantidad: ci.cantidad,
            nombre: ci.productos?.nombre || "",
          }));
        }
      }

      // Calculate stock differences per product (in UNITS)
      // For combos: expand to component products
      const stockDiffs: Record<string, number> = {};
      const addStockDiff = (productoId: string, qty: number, upp: number) => {
        const components = comboComponentsMap[productoId];
        if (components && components.length > 0) {
          // Combo: apply to each component
          for (const comp of components) {
            stockDiffs[comp.producto_id] = (stockDiffs[comp.producto_id] || 0) + (qty * comp.cantidad);
          }
        } else {
          // Regular product
          stockDiffs[productoId] = (stockDiffs[productoId] || 0) + (qty * upp);
        }
      };

      // Return stock from original items (positive = freed)
      for (const orig of originalItems) {
        addStockDiff(orig.producto_id, orig.cantidad, orig.unidades_por_presentacion || 1);
      }
      // Deduct stock from new items (negative = consumed)
      for (const item of poEditItems) {
        addStockDiff(item.producto_id, -item.cantidad, item.unidades_por_presentacion || 1);
      }
      // stockDiffs > 0 means units freed -> return stock
      // stockDiffs < 0 means units consumed -> decrement stock

      // Apply stock adjustments
      const isHistorialRef = poSelectedPedido._source === "historial";
      const refLabelStock = isHistorialRef ? `Edición Venta #${poSelectedPedido.numero}` : `Edición Pedido Web #${poSelectedPedido.numero}`;
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
          referencia: refLabelStock,
          descripcion: diff > 0 ? "Devolución por edición de pedido" : "Agregado por edición de pedido",
          usuario: currentUser?.nombre || "Admin Sistema",
        });
      }

      const nuevoSubtotal = poEditItems.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);
      const nuevoTotal = nuevoSubtotal + (poSelectedPedido.costo_envio || 0);
      const isHistorial = poSelectedPedido._source === "historial";
      const refLabel = isHistorial ? `Edición Venta #${poSelectedPedido.numero}` : `Edición Pedido Web #${poSelectedPedido.numero}`;

      // Update pedido_tienda_items (only for PO source)
      if (!isHistorial) {
        const { error: delErr } = await supabase.from("pedido_tienda_items").delete().eq("pedido_id", poSelectedPedido.id);
        if (delErr) throw new Error(`Error eliminando items: ${delErr.message}`);
        const { error: insErr } = await supabase.from("pedido_tienda_items").insert(
          poEditItems.map((item) => ({
            pedido_id: poSelectedPedido.id,
            producto_id: item.producto_id,
            nombre: item.nombre,
            presentacion: item.presentacion,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.precio_unitario * item.cantidad,
          }))
        );
        if (insErr) throw new Error(`Error insertando items: ${insErr.message}`);

        const { error: pedErr } = await supabase.from("pedidos_tienda").update({
          subtotal: nuevoSubtotal,
          total: nuevoTotal,
        }).eq("id", poSelectedPedido.id);
        if (pedErr) throw new Error(`Error actualizando pedido: ${pedErr.message}`);
      }

      // Update venta + venta_items
      const ventaId = isHistorial
        ? poSelectedPedido._ventaId
        : (await supabase.from("ventas").select("id, total, cliente_id, forma_pago").eq("numero", poSelectedPedido.numero).maybeSingle()).data?.id;

      if (ventaId) {
        const { data: ventaData } = await supabase.from("ventas").select("total, cliente_id, forma_pago").eq("id", ventaId).single();
        const totalAnterior = ventaData?.total || 0;
        const diferencia = nuevoTotal - totalAnterior;

        const { error: ventaErr } = await supabase.from("ventas").update({
          subtotal: nuevoSubtotal,
          total: nuevoTotal,
        }).eq("id", ventaId);
        if (ventaErr) errores.push(`Error sync venta: ${ventaErr.message}`);

        await supabase.from("venta_items").delete().eq("venta_id", ventaId);
        const { error: viErr } = await supabase.from("venta_items").insert(
          poEditItems.map((item) => ({
            venta_id: ventaId,
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

        // Adjust caja + CC if total changed
        if (Math.abs(diferencia) > 0.01) {
          const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
          const hora = nowTimeARG();

          const { data: cajaRows } = await supabase
            .from("caja_movimientos")
            .select("metodo_pago, cuenta_bancaria")
            .eq("referencia_id", ventaId)
            .eq("referencia_tipo", "venta")
            .limit(1);
          const metodoPago = cajaRows?.[0]?.metodo_pago || ventaData?.forma_pago || "Efectivo";
          const cuentaBancaria = cajaRows?.[0]?.cuenta_bancaria || null;

          const { error: cajaErr } = await supabase.from("caja_movimientos").insert({
            fecha: hoy, hora,
            tipo: diferencia > 0 ? "ingreso" : "egreso",
            descripcion: `Ajuste por edición #${poSelectedPedido.numero} (${diferencia > 0 ? "+" : ""}${formatCurrency(diferencia)})`,
            metodo_pago: metodoPago,
            monto: Math.abs(diferencia),
            referencia_id: ventaId,
            referencia_tipo: diferencia > 0 ? "venta" : "ajuste_edicion",
            cuenta_bancaria: cuentaBancaria,
          });
          if (cajaErr) errores.push(`Error caja: ${cajaErr.message}`);

          const clienteId = ventaData?.cliente_id;
          if (clienteId) {
            const { data: ccRows } = await supabase
              .from("cuenta_corriente")
              .select("id")
              .eq("venta_id", ventaId)
              .limit(1);
            if (ccRows && ccRows.length > 0) {
              const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", clienteId).single();
              const saldoActual = clienteData?.saldo || 0;
              const nuevoSaldo = saldoActual + diferencia;
              await supabase.from("cuenta_corriente").insert({
                cliente_id: clienteId,
                fecha: hoy,
                comprobante: refLabel,
                descripcion: `Ajuste por edición (${diferencia > 0 ? "aumento" : "reducción"})`,
                debe: diferencia > 0 ? diferencia : 0,
                haber: diferencia < 0 ? Math.abs(diferencia) : 0,
                saldo: nuevoSaldo,
                forma_pago: "Ajuste",
                venta_id: ventaId,
              });
              await supabase.from("clientes").update({ saldo: nuevoSaldo }).eq("id", clienteId);
            }
          }
        }
      }

      if (errores.length > 0) {
        showAdminToast("Guardado con advertencias: " + errores.join(". "), "info");
      }
      setPoHasChanges(false);
      await fetchPedidos();
      await fetchVentas();
      setPoDetailOpen(false);
    } catch (err: any) {
      showAdminToast("Error al guardar: " + (err.message || "Error desconocido"), "error");
    } finally {
      setPoSaving(false);
    }
  };

  // Update estado -- sync to linked venta, return stock + caja + CC on cancel
  const poHandleEstadoChange = async (pedido: Pedido, nuevoEstado: string) => {
    const estadoAnterior = pedido.estado;
    const isHistorial = pedido._source === "historial";
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const hora = nowTimeARG();

    // Only update pedidos_tienda for actual pedidos (not historial ventas)
    if (pedido._source !== "historial" && pedido.id > 0) {
      await supabase.from("pedidos_tienda").update({ estado: nuevoEstado }).eq("id", pedido.id);
    }

    // Find linked venta
    let ventaLinked: { id: string; cliente_id: string | null } | null = null;
    if (pedido._source === "historial" && pedido._ventaId) {
      ventaLinked = { id: pedido._ventaId, cliente_id: pedido._clienteId || null };
    } else {
      const { data } = await supabase
        .from("ventas")
        .select("id, cliente_id")
        .eq("numero", pedido.numero)
        .maybeSingle();
      ventaLinked = data as typeof ventaLinked;
    }

    // Sync estado to linked venta (ventas uses "anulada" instead of "cancelado")
    const ventaEstado = nuevoEstado === "cancelado" ? "anulada" : nuevoEstado;
    const ventaUpdate: Record<string, unknown> = { estado: ventaEstado };
    if (nuevoEstado === "entregado") ventaUpdate.entregado = true;
    if (nuevoEstado === "cancelado") {
      ventaUpdate.entregado = false;
      ventaUpdate.observacion = isHistorial
        ? `ANULADA (Cancelación desde Historial)`
        : `ANULADA (Cancelación desde Pedidos Online)`;
    }
    if (ventaLinked) {
      await supabase.from("ventas").update(ventaUpdate).eq("id", ventaLinked.id);
    }

    // Also sync to pedidos_tienda if this is a historial venta (might be a linked web order)
    if (isHistorial) {
      const ptEstado = nuevoEstado === "cancelado" ? "cancelado" : nuevoEstado;
      await supabase.from("pedidos_tienda").update({ estado: ptEstado }).eq("numero", pedido.numero);
    }

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
          usuario: currentUser?.nombre || "Admin Sistema",
        });
      }

      // Reverse caja_movimientos for linked venta
      if (ventaLinked) {
        const { data: cajaRows } = await supabase
          .from("caja_movimientos")
          .select("*")
          .eq("referencia_id", ventaLinked.id)
          .eq("referencia_tipo", "venta");
        for (const cm of cajaRows || []) {
          await supabase.from("caja_movimientos").insert({
            fecha: hoy, hora,
            tipo: "egreso",
            descripcion: `Cancelación Pedido Web #${pedido.numero}`,
            metodo_pago: (cm as any).metodo_pago,
            monto: (cm as any).monto,
            referencia_id: ventaLinked.id,
            referencia_tipo: "anulacion",
            cuenta_bancaria: (cm as any).cuenta_bancaria || null,
          });
        }

        // Reverse cuenta_corriente entries
        if (ventaLinked.cliente_id) {
          const { data: ccRows } = await supabase
            .from("cuenta_corriente")
            .select("*")
            .eq("venta_id", ventaLinked.id);
          if (ccRows && ccRows.length > 0) {
            const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", ventaLinked.cliente_id).single();
            let saldoActual = clienteData?.saldo || 0;
            for (const cc of ccRows) {
              const nuevoSaldo = saldoActual - (cc as any).debe + (cc as any).haber;
              await supabase.from("cuenta_corriente").insert({
                cliente_id: ventaLinked.cliente_id,
                fecha: hoy,
                comprobante: `Cancelación Pedido Web #${pedido.numero}`,
                descripcion: `Cancelación de pedido online`,
                debe: (cc as any).haber,
                haber: (cc as any).debe,
                saldo: nuevoSaldo,
                forma_pago: "Anulación",
                venta_id: ventaLinked.id,
              });
              saldoActual = nuevoSaldo;
            }
            await supabase.from("clientes").update({ saldo: saldoActual }).eq("id", ventaLinked.cliente_id);
          }
        }
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
          usuario: currentUser?.nombre || "Admin Sistema",
        });
      }
    }

    await fetchPedidos();
    await fetchVentas();
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
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Historial y Pedidos</h1>
            <p className="text-sm text-muted-foreground">
              {activeTab === "historial"
                ? `${ventas.length} comprobantes encontrados${ventas.length !== ventasActivas.length ? ` (${ventas.length - ventasActivas.length} anulados)` : ""}`
                : `${poPedidos.length} pedidos en total`
              }
            </p>
          </div>
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
      <div className="bg-muted rounded-xl p-1 inline-flex gap-1">
        <button
          onClick={() => setActiveTab("historial")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "historial"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Historial de Ventas
        </button>
        <button
          onClick={() => setActiveTab("pedidos")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === "pedidos"
              ? "bg-background shadow text-foreground"
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
                        <th className="text-left py-3 px-4 font-medium">N°</th>
                        <th className="text-left py-3 px-4 font-medium">Tipo</th>
                        <th className="text-left py-3 px-4 font-medium">Fecha / Hora</th>
                        <th className="text-left py-3 px-4 font-medium">Cliente</th>
                        <th className="text-left py-3 px-4 font-medium">Forma pago</th>
                        <th className="text-center py-3 px-4 font-medium">Entrega</th>
                        <th className="text-center py-3 px-4 font-medium">Estado</th>
                        <th className="text-right py-3 px-4 font-medium">Total</th>
                        <th className="text-right py-3 px-4 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map((v) => {
                        const vEstado = v.estado === "anulada" ? "cancelado" : v.entregado ? "entregado" : v.estado || "pendiente";
                        const est = estadoBadge[vEstado] || estadoBadge.pendiente;
                        return (
                        <tr key={v.id} className={`border-b last:border-0 transition-colors ${v.estado === "anulada" ? "opacity-50 bg-red-50/50" : "hover:bg-muted/50"}`}>
                          <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{v.numero}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`text-xs font-normal ${v.origen === "tienda" ? "border-pink-300 text-pink-700 bg-pink-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}>
                                {v.origen === "tienda" ? "Tienda" : "POS"}
                              </Badge>
                              <Badge variant={v.tipo_comprobante.includes("Nota de Crédito") ? "destructive" : "secondary"} className="text-xs font-normal">
                                {v.tipo_comprobante}
                              </Badge>
                              {v.estado === "anulada" && (
                                <Badge variant="destructive" className="text-[10px] font-bold">ANULADA</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            <div>{new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
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
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <Badge variant={v.entregado ? "default" : "secondary"} className={`text-xs ${!v.entregado ? "" : "bg-blue-100 text-blue-700 hover:bg-blue-100"}`}>
                                {v.entregado ? "Entregado" : "Pendiente"}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {v.tipo_comprobante.includes("Nota de Crédito") ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border ${est.bg} ${est.text}`}>
                                {est.label}
                              </span>
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
                        );
                      })}
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
          {/* Stats - workflow focused */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className={`cursor-pointer transition-all ${poFilterEstado === "pendiente" ? "ring-2 ring-amber-400" : "hover:shadow-md"}`} onClick={() => setPoFilterEstado(poFilterEstado === "pendiente" ? "todos" : "pendiente")}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-500" /></div>
                <div><p className="text-xs text-muted-foreground">Pendientes</p><p className="text-xl font-bold text-amber-600">{poPendientes}</p></div>
              </CardContent>
            </Card>
            <Card className={`cursor-pointer transition-all ${poFilterEstado === "armado" ? "ring-2 ring-violet-400" : "hover:shadow-md"}`} onClick={() => setPoFilterEstado(poFilterEstado === "armado" ? "todos" : "armado")}>
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por numero, cliente o email..."
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={poFilterEstado} onValueChange={(v) => setPoFilterEstado(v || "todos")}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="armado">Armado</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="entregado">Entregado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={poFilterEntrega} onValueChange={(v) => setPoFilterEntrega(v || "todos")}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Entrega" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="envio">Envío</SelectItem>
                <SelectItem value="retiro_local">Retiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Pedidos cards */}
          {poLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : poFiltered.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No hay pedidos con los filtros seleccionados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {poFiltered.map((pedido) => {
                const est = estadoBadge[pedido.estado] || estadoBadge.pendiente;
                const capitalPago = pedido.metodo_pago ? pedido.metodo_pago.charAt(0).toUpperCase() + pedido.metodo_pago.slice(1) : "—";
                const estadoSteps = ["pendiente", "armado", "entregado"];
                const currentStep = pedido.estado === "cancelado" ? -1 : estadoSteps.indexOf(pedido.estado);
                return (
                  <Card key={pedido.id} className={`transition-all ${pedido.estado === "cancelado" ? "opacity-50" : "hover:shadow-md"}`}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        {/* Left: Customer & order info */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-base">{pedido.nombre_cliente}</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.bg} ${est.text}`}>
                                  {est.label}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{pedido.email}</span>
                                {pedido.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{pedido.telefono}</span>}
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(pedido.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })} {new Date(pedido.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-lg font-bold ${pedido.estado === "cancelado" ? "line-through text-muted-foreground" : ""}`}>{formatCurrency(pedido.total)}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">#{pedido.numero}</p>
                            </div>
                          </div>

                          {/* Delivery & payment info */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline" className={`font-normal ${pedido.metodo_entrega === "envio" ? "border-blue-300 text-blue-700 bg-blue-50" : "border-gray-300"}`}>
                              {pedido.metodo_entrega === "envio" ? (
                                <><Truck className="w-3 h-3 mr-1" />Envío</>
                              ) : (
                                <><Store className="w-3 h-3 mr-1" />Retiro en local</>
                              )}
                            </Badge>
                            {pedido.metodo_entrega === "envio" && pedido.direccion_texto && (
                              <span className="text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate max-w-[300px]">{pedido.direccion_texto}</span></span>
                            )}
                            <Badge variant="outline" className="font-normal">
                              <DollarSign className="w-3 h-3 mr-1" />{capitalPago}
                            </Badge>
                            {pedido.items.length > 0 && (
                              <span className="text-muted-foreground">{pedido.items.length} {pedido.items.length === 1 ? "producto" : "productos"}</span>
                            )}
                          </div>

                          {/* Progress stepper */}
                          {pedido.estado !== "cancelado" && (
                            <div className="flex items-center gap-1 pt-1">
                              {estadoSteps.map((step, i) => (
                                <div key={step} className="flex items-center gap-1">
                                  <div className={`w-2 h-2 rounded-full ${i <= currentStep ? "bg-primary" : "bg-gray-200"}`} />
                                  <span className={`text-[10px] ${i <= currentStep ? "text-foreground font-medium" : "text-muted-foreground/50"}`}>
                                    {step === "pendiente" ? "Pendiente" : step === "armado" ? "Armado" : "Entregado"}
                                  </span>
                                  {i < estadoSteps.length - 1 && <div className={`w-6 h-[2px] ${i < currentStep ? "bg-primary" : "bg-gray-200"}`} />}
                                </div>
                              ))}
                            </div>
                          )}
                          {pedido.estado === "cancelado" && (
                            <div className="flex items-center gap-1 pt-1">
                              <Ban className="w-3 h-3 text-red-500" />
                              <span className="text-[10px] text-red-500 font-medium">Pedido cancelado</span>
                            </div>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex sm:flex-col items-center gap-1.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => poOpenDetail(pedido)} title="Ver detalle">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => poOpenDetail(pedido)} title="Editar pedido">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {pedido.estado !== "entregado" && pedido.estado !== "cancelado" && (
                            <>
                              {pedido.estado === "pendiente" && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-violet-600 hover:text-violet-700 hover:bg-violet-50" onClick={() => poHandleEstadoChange(pedido, "armado")} title="Marcar armado">
                                  <Package className="w-4 h-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => poHandleEstadoChange(pedido, "entregado")} title="Marcar entregado">
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {pedido.estado !== "cancelado" && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setPoCancelPedido(pedido)} title="Cancelar pedido">
                              <Ban className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

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
      {/* UNIFIED DETAIL / EDIT DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={poDetailOpen} onOpenChange={(open) => {
        if (!open && poHasChanges) {
          if (!confirm("Tenés cambios sin guardar. ¿Cerrar de todas formas?")) return;
        }
        setPoDetailOpen(open);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {poSelectedPedido && (() => {
            const isHistorial = poSelectedPedido._source === "historial";
            const isCancelled = poSelectedPedido.estado === "cancelado";
            const estBadge = estadoBadge[poSelectedPedido.estado] || estadoBadge.pendiente;
            const itemsSubtotal = poEditItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);
            const descPct = poSelectedPedido._descuento_porcentaje || 0;
            const recPct = poSelectedPedido._recargo_porcentaje || 0;
            const envio = poSelectedPedido.costo_envio || 0;
            const computedTotal = isHistorial
              ? itemsSubtotal * (1 - descPct / 100) * (1 + recPct / 100)
              : itemsSubtotal + envio;

            return (
            <>
              {/* Header */}
              <div className="px-6 py-4 border-b bg-muted/30">
                <DialogHeader className="p-0 space-y-0">
                  <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                    {isHistorial ? <Receipt className="w-5 h-5 text-primary" /> : <ShoppingCart className="w-5 h-5 text-primary" />}
                    {isHistorial ? `${poSelectedPedido._tipo_comprobante} #${poSelectedPedido.numero}` : `Pedido #${poSelectedPedido.numero}`}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(poSelectedPedido.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
                    {poSelectedPedido.created_at.includes("T") && `, ${new Date(poSelectedPedido.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}`}
                  </p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${estBadge.bg} ${estBadge.text}`}>
                    {estBadge.label}
                  </span>
                  {!isHistorial && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-50 text-pink-700 border border-pink-200">
                      <Globe className="w-3 h-3 mr-1" />Pedido Web
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Client + Delivery info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <User className="w-4 h-4" /> Cliente
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      <p className="font-medium">{poSelectedPedido.nombre_cliente}</p>
                      {poSelectedPedido.email && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{poSelectedPedido.email}</p>}
                      {poSelectedPedido.telefono && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{poSelectedPedido.telefono}</p>}
                      {poSelectedPedido._domicilio && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{poSelectedPedido._domicilio}</p>}
                      {poSelectedPedido._cuit && <p className="text-xs text-muted-foreground">CUIT: {poSelectedPedido._cuit}</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Truck className="w-4 h-4" /> Entrega y Pago
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      {poSelectedPedido.metodo_entrega ? (
                        <p className="flex items-center gap-1.5">
                          {poSelectedPedido.metodo_entrega === "envio" ? (
                            <><Truck className="w-3.5 h-3.5 text-blue-500" /> Envio a domicilio</>
                          ) : poSelectedPedido.metodo_entrega === "retiro" ? (
                            <><Store className="w-3.5 h-3.5 text-green-500" /> Retiro en local</>
                          ) : (
                            <>{poSelectedPedido.metodo_entrega}</>
                          )}
                        </p>
                      ) : isHistorial ? (
                        <p className="flex items-center gap-1.5">
                          {poSelectedPedido._entregado ? (
                            <><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Entregado</>
                          ) : (
                            <><Clock className="w-3.5 h-3.5 text-amber-500" /> Pendiente de entrega</>
                          )}
                        </p>
                      ) : null}
                      {!isHistorial && poSelectedPedido.direccion_texto && (
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{poSelectedPedido.direccion_texto}</p>
                      )}
                      {poSelectedPedido.fecha_entrega && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(poSelectedPedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Pago: {poSelectedPedido.metodo_pago}</p>
                      {poSelectedPedido._vendedor && poSelectedPedido._vendedor !== "—" && (
                        <p className="text-xs text-muted-foreground">Vendedor: {poSelectedPedido._vendedor}</p>
                      )}
                    </div>
                  </div>
                </div>

                {poSelectedPedido.observacion && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-amber-800 text-xs mb-1">Observacion:</p>
                    <p className="text-amber-700">{poSelectedPedido.observacion}</p>
                  </div>
                )}

                {/* Estado selector */}
                {!isCancelled && (
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
                )}

                {/* Items table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Package className="w-4 h-4" /> Productos ({poEditItems.length})
                    </h3>
                    {!isCancelled && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setPoAddProductOpen(true)}>
                        <Plus className="w-3 h-3" /> Agregar producto
                      </Button>
                    )}
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Producto</th>
                          <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-24">Presentacion</th>
                          <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-20">Cant.</th>
                          <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Precio</th>
                          {poEditItems.some((i) => (i.descuento || 0) > 0) && (
                            <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-16">Desc.</th>
                          )}
                          <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Subtotal</th>
                          {!isCancelled && <th className="w-10"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {poEditItems.map((item, idx) => {
                          const isCombo = poSelectedPedido._comboIds?.has(item.producto_id);
                          return (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {isCombo && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-black text-white tracking-wider shrink-0">COMBO</span>
                                )}
                                <span className="font-medium">{item.nombre}</span>
                              </div>
                              {item.codigo && <p className="text-[10px] text-muted-foreground font-mono">{item.codigo}</p>}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.presentacion}</td>
                            <td className="px-3 py-2 text-center">
                              {isCancelled ? (
                                <span>{item.cantidad}</span>
                              ) : (
                                <Input
                                  type="number"
                                  min={1}
                                  value={item.cantidad}
                                  onChange={(e) => poUpdateItemQty(idx, Number(e.target.value))}
                                  className="h-7 w-16 text-center mx-auto"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                            {poEditItems.some((i) => (i.descuento || 0) > 0) && (
                              <td className="px-3 py-2 text-right text-xs">{(item.descuento || 0) > 0 ? `-${item.descuento}%` : ""}</td>
                            )}
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.precio_unitario * item.cantidad * (1 - (item.descuento || 0) / 100))}</td>
                            {!isCancelled && (
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
                            )}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="mt-3 space-y-1 text-sm text-right">
                    <p className="text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{formatCurrency(itemsSubtotal)}</span></p>
                    {descPct > 0 && (
                      <p className="text-muted-foreground">Descuento ({descPct}%): <span className="font-medium text-red-500">-{formatCurrency(itemsSubtotal * descPct / 100)}</span></p>
                    )}
                    {recPct > 0 && (
                      <p className="text-muted-foreground">Recargo ({recPct}%): <span className="font-medium text-foreground">+{formatCurrency(itemsSubtotal * recPct / 100)}</span></p>
                    )}
                    {envio > 0 && (
                      <p className="text-muted-foreground">Envio: <span className="font-medium text-foreground">{formatCurrency(envio)}</span></p>
                    )}
                    <p className="text-base font-bold">Total: {formatCurrency(computedTotal)}</p>
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
                  {isHistorial && (
                    <Button variant="outline" size="sm" onClick={() => {
                      const v = ventas.find((vr) => vr.id === poSelectedPedido._ventaId);
                      if (v) { setPoDetailOpen(false); preparePrint(v); }
                    }}>
                      <Printer className="w-3.5 h-3.5 mr-1.5" />Imprimir
                    </Button>
                  )}
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
            );
          })()}
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

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PO CANCEL CONFIRMATION DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!poCancelPedido} onOpenChange={(open) => { if (!open) setPoCancelPedido(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Cancelar pedido
            </DialogTitle>
          </DialogHeader>
          {poCancelPedido && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-red-800">Esta acción revertirá:</p>
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  <li>El stock de los productos será restaurado</li>
                  <li>Se generará un egreso en caja para compensar</li>
                  <li>Se revertirán los movimientos en cuenta corriente</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Pedido:</span> <span className="font-medium">#{poCancelPedido.numero}</span></div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{formatCurrency(poCancelPedido.total)}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{poCancelPedido.nombre_cliente}</span></div>
                <div><span className="text-muted-foreground">Pago:</span> <span className="font-medium">{poCancelPedido.metodo_pago}</span></div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setPoCancelPedido(null)} disabled={poCancelling}>
                  Volver
                </Button>
                <Button
                  variant="destructive"
                  disabled={poCancelling}
                  onClick={async () => {
                    setPoCancelling(true);
                    await poHandleEstadoChange(poCancelPedido, "cancelado");
                    setPoCancelling(false);
                    setPoCancelPedido(null);
                  }}
                >
                  {poCancelling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
                  Confirmar cancelación
                </Button>
              </div>
            </div>
          )}
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
              vendedor: getVendedorNombre(printVenta.vendedor_id) === "—" && (printVenta.origen === "tienda" || printVenta.tipo_comprobante?.toLowerCase().includes("web")) ? "Tienda Online" : getVendedorNombre(printVenta.vendedor_id),
              fecha: formatDatePDF(printVenta.fecha),
              saldoAnterior: printSaldoAnteriorCC || (printClienteSaldo - (printPagos.cuentaCorriente || 0)),
              saldoNuevo: printClienteSaldo,
              items: printLineItems,
              pagoEfectivo: printPagos.efectivo || undefined,
              pagoTransferencia: printPagos.transferencia || undefined,
              pagoCuentaCorriente: printPagos.cuentaCorriente || undefined,
            }}
          />
        </div>
      )}
    </div>
  );
}
