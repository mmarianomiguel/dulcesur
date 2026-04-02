"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { CobroVentaSection, type CobroVentaResult } from "@/components/cobro-venta-section";
import {
  Receipt,
  ShoppingCart,
  User,
  Phone,
  Mail,
  MapPin,
  Truck,
  Store,
  CheckCircle,
  Clock,
  Calendar,
  Package,
  Globe,
  Printer,
  AlertTriangle,
  Banknote,
  Plus,
  Trash2,
  Save,
  Loader2,
  CreditCard,
  Landmark,
  FileText,
  PackageCheck,
  ArrowRight,
  XCircle,
  Search,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";

// ─── Types ───
export interface VentaDetailItem {
  id?: string;
  producto_id?: string | null;
  codigo?: string;
  descripcion: string;
  nombre?: string;
  presentacion?: string;
  cantidad: number;
  unidad_medida?: string | null;
  precio_unitario: number;
  descuento?: number;
  subtotal: number;
  unidades_por_presentacion?: number;
}

export interface VentaDetailData {
  numero: string;
  created_at: string;
  fecha?: string;
  estado?: string;
  tipo_comprobante?: string;
  forma_pago?: string;
  metodo_pago?: string;
  metodo_entrega?: string;
  subtotal?: number;
  total: number;
  observacion?: string | null;
  entregado?: boolean;
  descuento_porcentaje?: number;
  recargo_porcentaje?: number;
  costo_envio?: number;
  // Client info
  nombre_cliente?: string;
  email?: string;
  telefono?: string;
  domicilio?: string;
  cuit?: string;
  direccion_texto?: string | null;
  fecha_entrega?: string | null;
  vendedor?: string;
  // Transfer account
  cuenta_transferencia_alias?: string | null;
  // Payment amounts (from checkout / cobro)
  monto_efectivo?: number;
  monto_transferencia?: number;
  // Source
  origen?: "historial" | "pedidos" | "pos";
  // Combo product IDs
  comboIds?: Set<string>;
}

export interface VentaDetailPago {
  metodo: string;
  monto: number;
  cuenta_bancaria?: string | null;
}

export interface NCDetail {
  numero: number;
  total: number;
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[];
}

// ─── Edit feature types ───
export interface EditableItem {
  producto_id: string;
  nombre: string;
  presentacion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  unidades_por_presentacion: number;
}

export interface ProductSearchResult {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  unidad_medida?: string;
}

// ─── Status badge config ───
const estadoBadge: Record<string, { bg: string; text: string; label: string; icon: typeof Package }> = {
  pendiente: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Pendiente", icon: ShoppingCart },
  armado: { bg: "bg-violet-50 border-violet-200", text: "text-violet-700", label: "Armado", icon: PackageCheck },
  confirmado: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Confirmado", icon: Package },
  entregado: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Entregado", icon: CheckCircle },
  cancelado: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Cancelado", icon: XCircle },
  anulada: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Anulada", icon: XCircle },
};

const estadoFlow: Record<string, string[]> = {
  pendiente: ["armado", "cancelado"],
  armado: ["confirmado", "entregado", "cancelado"],
  confirmado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: ["pendiente"],
  anulada: [],
};

function cleanDesc(desc: string) {
  return desc
    .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
    .replace(/\s*\(Unidad\)$/, "")
    .replace(/(\([^)]+\))\s*\1/gi, "$1")
    .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
    .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
}

// ─── Props ───
interface VentaDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: VentaDetailData | null;
  items: VentaDetailItem[];
  pagos?: VentaDetailPago[];
  onPrint?: () => void;
  footerExtra?: React.ReactNode;
  // ─── Edit mode (optional) ───
  editable?: boolean;
  editItems?: EditableItem[];
  onEditItemsChange?: (items: EditableItem[]) => void;
  onSave?: () => void;
  saving?: boolean;
  hasChanges?: boolean;
  // ─── Status flow (optional) ───
  onEstadoChange?: (nuevoEstado: string) => void;
  // ─── NCs (optional) ───
  ncs?: NCDetail[];
  // ─── Product search for adding items (optional) ───
  onSearchProducts?: (query: string) => Promise<ProductSearchResult[]>;
  // ─── Confirm dialog callback (optional) ───
  onConfirmAction?: (title: string, message: string, action: () => void) => void;
  // ─── Cobro inline (optional) ───
  cobroConfig?: {
    ventaId: string;
    clienteId: string;
    clienteSaldo: number;
    cuentasBancarias: { id: string; nombre: string; alias: string }[];
    recargoTransferencia: number;
    onRegistrarCobro: (result: CobroVentaResult) => Promise<void>;
  };
}

export function VentaDetailDialog({
  open, onOpenChange, data, items, pagos, onPrint, footerExtra,
  editable, editItems, onEditItemsChange, onSave, saving, hasChanges,
  onEstadoChange, ncs, onSearchProducts, onConfirmAction, cobroConfig,
}: VentaDetailDialogProps) {
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);


  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setAddProductOpen(false);
      setProductSearch("");
      setProductResults([]);
    }
  }, [open]);


  if (!data) return null;

  const isPedidoWeb = data.origen === "pedidos";
  const isHistorial = !isPedidoWeb;
  const estado = data.entregado ? "entregado" : data.estado || "pendiente";
  const estInfo = estadoBadge[estado] || estadoBadge.pendiente;
  const EstIcon = estInfo.icon;
  const pago = data.forma_pago || data.metodo_pago || "—";
  const displayItems = editable && editItems ? editItems : items;
  const hasDiscount = items.some((i) => (i.descuento || 0) > 0);
  const descPct = data.descuento_porcentaje || 0;
  const recPct = data.recargo_porcentaje || 0;
  const envio = data.costo_envio || 0;
  const itemsSubtotal = editable && editItems
    ? editItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
    : (data.subtotal || items.reduce((s, i) => s + i.subtotal, 0));
  const ncTotal = (pagos || []).filter(p => p.metodo.includes("Nota de Cr")).reduce((s, p) => s + p.monto, 0);
  const displayTotal = editable && editItems
    ? (() => {
        let t = itemsSubtotal + (envio || 0);
        if (descPct > 0) t = Math.round(t * (1 - descPct / 100) * 100) / 100;
        if (recPct > 0) t = Math.round(t * (1 + recPct / 100) * 100) / 100;
        return t;
      })()
    : data.total - ncTotal;
  const isEditable = editable && estado !== "entregado" && estado !== "cancelado";
  const hasCobro = (pagos || []).some(p => p.metodo !== "Pendiente de cobro" && !p.metodo.includes("Nota de Cr") && !p.metodo.includes("(a cobrar)"));
  // Calculate real payments total (excluding NCs and "Pendiente de cobro")
  const totalPagado = (pagos || []).reduce((s, p) => {
    if (p.metodo === "Pendiente de cobro") return s;
    if (p.metodo.includes("Nota de Cr")) return s - p.monto;
    return s + p.monto;
  }, 0);
  const saldoPendiente = displayTotal - totalPagado;
  const nextStates = onEstadoChange ? (estadoFlow[estado] || []) : [];

  // Edit helpers
  const updateItemQty = (index: number, qty: number) => {
    if (!editItems || !onEditItemsChange || qty <= 0) return;
    onEditItemsChange(editItems.map((item, i) =>
      i === index ? { ...item, cantidad: qty, subtotal: qty * item.precio_unitario } : item
    ));
  };

  const removeItem = (index: number) => {
    if (!editItems || !onEditItemsChange || editItems.length <= 1) return;
    onEditItemsChange(editItems.filter((_, i) => i !== index));
  };

  const addProduct = (product: ProductSearchResult) => {
    if (!editItems || !onEditItemsChange) return;
    const existing = editItems.findIndex((i) => i.producto_id === product.id);
    if (existing >= 0) {
      updateItemQty(existing, editItems[existing].cantidad + 1);
    } else {
      onEditItemsChange([...editItems, {
        producto_id: product.id,
        nombre: product.nombre,
        presentacion: "Unidad",
        cantidad: 1,
        precio_unitario: product.precio,
        subtotal: product.precio,
        unidades_por_presentacion: 1,
      }]);
    }
    setAddProductOpen(false);
    setProductSearch("");
    setProductResults([]);
  };

  const handleSearchProducts = async (query: string) => {
    setProductSearch(query);
    if (!onSearchProducts || query.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    const results = await onSearchProducts(query);
    setProductResults(results);
    setSearchingProducts(false);
  };

  const handleClose = () => {
    if (hasChanges && onConfirmAction) {
      onConfirmAction("Cambios sin guardar", "Tenés cambios sin guardar. ¿Cerrar de todas formas?", () => onOpenChange(false));
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o && hasChanges && onConfirmAction) {
        onConfirmAction("Cambios sin guardar", "Tenés cambios sin guardar. ¿Cerrar de todas formas?", () => onOpenChange(false));
        return;
      }
      onOpenChange(o);
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* ═══ HEADER ═══ */}
        <div className="px-6 py-4 border-b bg-muted/30">
          <DialogHeader className="p-0 space-y-0">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              {isPedidoWeb ? <ShoppingCart className="w-5 h-5 text-primary" /> : <Receipt className="w-5 h-5 text-primary" />}
              {isHistorial && data.tipo_comprobante ? `${data.tipo_comprobante} #${data.numero}` : `Pedido #${data.numero}`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-muted-foreground">
              {new Date(data.fecha ? data.fecha + "T12:00:00" : data.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
              {data.created_at.includes("T") && `, ${new Date(data.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}`}
            </p>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${estInfo.bg} ${estInfo.text}`}>
              <EstIcon className="w-3 h-3" />
              {estInfo.label}
            </span>
            {isPedidoWeb && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-50 text-pink-700 border border-pink-200">
                <Globe className="w-3 h-3 mr-1" />Pedido Web
              </span>
            )}
          </div>
        </div>

        {/* ═══ CONTENT ═══ */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Client + Delivery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Cliente
              </h3>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                <p className="font-medium">{data.nombre_cliente || "Consumidor Final"}</p>
                {data.email && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{data.email}</p>}
                {data.telefono && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{data.telefono}</p>}
                {data.domicilio && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{data.domicilio}</p>}
                {data.cuit && <p className="text-xs text-muted-foreground">CUIT: {data.cuit}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Entrega y Pago
              </h3>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                {data.metodo_entrega ? (
                  <p className="flex items-center gap-1.5 font-medium">
                    {data.metodo_entrega === "envio" ? (
                      <><Truck className="w-3.5 h-3.5 text-blue-500" /> Envio a domicilio</>
                    ) : data.metodo_entrega === "retiro" ? (
                      <><Store className="w-3.5 h-3.5 text-green-500" /> Retiro en local</>
                    ) : (
                      <>{data.metodo_entrega}</>
                    )}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5">
                    {data.entregado ? (
                      <><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Entregado</>
                    ) : (
                      <><Clock className="w-3.5 h-3.5 text-amber-500" /> Pendiente de entrega</>
                    )}
                  </p>
                )}
                {isPedidoWeb && data.direccion_texto && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{data.direccion_texto}</p>
                )}
                {data.fecha_entrega && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {new Date(data.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                )}
                {/* Payment breakdown — show for entregado/read-only, hide when cobro section handles it */}
                {!(cobroConfig && isEditable) && pagos && pagos.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Detalle de pago:</p>
                    {pagos.map((p, i) => {
                      const isNC = p.metodo.includes("Nota de Cr");
                      const isPending = p.metodo === "Pendiente de cobro";
                      return (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            {p.metodo === "Efectivo" && <Banknote className="w-3 h-3 text-green-600" />}
                            {p.metodo === "Transferencia" && <Landmark className="w-3 h-3 text-blue-600" />}
                            {p.metodo === "Cuenta Corriente" && <FileText className="w-3 h-3 text-orange-600" />}
                            {isPending && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                            {!["Efectivo", "Transferencia", "Cuenta Corriente", "Pendiente de cobro"].includes(p.metodo) && !isNC && <CreditCard className="w-3 h-3 text-muted-foreground" />}
                            <span className={isNC ? "text-amber-600" : isPending ? "text-amber-600" : "text-muted-foreground"}>
                              {p.metodo}
                            </span>
                            {p.cuenta_bancaria && <span className="text-[10px] ml-0.5">→ {p.cuenta_bancaria}</span>}
                          </div>
                          <span className={`font-semibold ${isNC ? "text-amber-600" : isPending ? "text-amber-600" : ""}`}>
                            {isNC ? `-${formatCurrency(p.monto)}` : formatCurrency(p.monto)}
                          </span>
                        </div>
                      );
                    })}
                    {pagos.length > 1 && (
                      <div className="flex items-center justify-between text-xs border-t pt-1">
                        <span className="font-bold">Total cobrado</span>
                        <span className="font-bold">{formatCurrency(totalPagado)}</span>
                      </div>
                    )}
                  </div>
                ) : !(cobroConfig && isEditable) ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Banknote className="w-3 h-3" /> Pago: {pago}
                  </p>
                ) : null}
                {(() => {
                  const fp = ((data.forma_pago || "") + " " + (data.metodo_pago || "")).toLowerCase();
                  const hasTransferPayment = fp.includes("transferencia") || (fp.includes("mixto") && ((data as any).monto_transferencia > 0 || (pagos || []).some((p: any) => (p.metodo_pago || p.metodo) === "Transferencia")));
                  if (!hasTransferPayment) return null;
                  const cuentaAlias = data.cuenta_transferencia_alias || (pagos || []).find((p: any) => p.cuenta_bancaria)?.cuenta_bancaria;
                  return cuentaAlias ? null : (
                    <p className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Falta asignar cuenta bancaria
                    </p>
                  );
                })()}
                {data.vendedor && data.vendedor !== "—" && (
                  <p className="text-xs text-muted-foreground">Vendedor: {data.vendedor}</p>
                )}
              </div>
            </div>
          </div>

          {data.observacion && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-amber-800 text-xs mb-1">Observacion:</p>
              <p className="text-amber-700">{data.observacion}</p>
            </div>
          )}

          {/* ═══ COBRO SECTION ═══ */}
          {cobroConfig && isEditable && !hasCobro && (
            <div className="border-2 border-emerald-200 bg-emerald-50/30 rounded-xl p-4">
              <CobroVentaSection
                ventaId={cobroConfig.ventaId}
                clienteId={cobroConfig.clienteId}
                clienteNombre={data.nombre_cliente || ""}
                clienteSaldo={cobroConfig.clienteSaldo}
                montoVenta={recPct > 0 ? Math.round(displayTotal / (1 + recPct / 100) * 100) / 100 : displayTotal}
                subtotalItems={itemsSubtotal}
                costoEnvio={envio}
                recargoTransferencia={cobroConfig.recargoTransferencia}
                cuentasBancarias={cobroConfig.cuentasBancarias}
                defaultMetodo={data.metodo_pago || data.forma_pago}
                defaultEfectivo={data.monto_efectivo}
                defaultTransferencia={data.monto_transferencia}
                defaultCuentaAlias={data.cuenta_transferencia_alias || undefined}
                onConfirmar={cobroConfig.onRegistrarCobro}
              />
            </div>
          )}

          {/* Status actions */}
          {nextStates.length > 0 && onEstadoChange && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">Cambiar estado:</span>
              {nextStates.map((ns) => {
                const nsInfo = estadoBadge[ns];
                const NsIcon = nsInfo?.icon || Package;
                const isCancel = ns === "cancelado";
                return (
                  <Button
                    key={ns}
                    variant={isCancel ? "outline" : "default"}
                    size="sm"
                    className={`h-8 text-xs gap-1.5 ${isCancel ? "text-destructive border-destructive/30 hover:bg-destructive/10" : ""}`}
                    onClick={() => {
                      if (isCancel && onConfirmAction) {
                        onConfirmAction("Cancelar pedido", `¿Cancelar el pedido #${data.numero}? Se devolverá el stock.`, () => onEstadoChange(ns));
                      } else {
                        onEstadoChange(ns);
                      }
                    }}
                  >
                    <NsIcon className="w-3.5 h-3.5" />
                    Marcar como {nsInfo?.label}
                  </Button>
                );
              })}
            </div>
          )}

          {/* ═══ ITEMS TABLE ═══ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Productos ({displayItems.length})
              </h3>
              {isEditable && onSearchProducts && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddProductOpen(true)}>
                  <Plus className="w-3 h-3" /> Agregar
                </Button>
              )}
            </div>

            {/* Add product popover */}
            {addProductOpen && isEditable && (
              <div className="mb-3 border rounded-lg p-3 bg-muted/20 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Buscar producto por nombre o código..."
                    value={productSearch}
                    onChange={(e) => handleSearchProducts(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
                {searchingProducts && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Buscando...</p>}
                {productResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 text-xs flex items-center justify-between"
                        onClick={() => addProduct(p)}
                      >
                        <span className="font-medium">{p.nombre}</span>
                        <span className="text-muted-foreground">{formatCurrency(p.precio)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setAddProductOpen(false); setProductSearch(""); setProductResults([]); }}>
                  Cancelar
                </Button>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Producto</th>
                    {(isEditable || items.some(i => i.presentacion)) && (
                      <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-28">Presentación</th>
                    )}
                    <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-20">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Precio</th>
                    {hasDiscount && !isEditable && <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-16">Desc.</th>}
                    <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Subtotal</th>
                    {isEditable && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {isEditable && editItems ? (
                    // ─── Editable rows ───
                    editItems.map((item, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{item.nombre}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.presentacion}</td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={item.cantidad}
                            onChange={(e) => updateItemQty(idx, Number(e.target.value))}
                            className="h-7 w-16 text-center mx-auto"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.precio_unitario * item.cantidad)}</td>
                        <td className="px-2 py-2">
                          <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={editItems.length <= 1} title="Quitar producto">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    // ─── Read-only rows ───
                    items.map((item, idx) => {
                      const name = item.nombre || cleanDesc(item.descripcion);
                      const isCombo = data.comboIds?.has(item.producto_id || "");
                      const upp = item.unidades_por_presentacion ?? 1;
                      const displayQty = upp > 0 && upp < 1 ? item.cantidad * upp : item.cantidad;
                      return (
                        <tr key={item.id || idx} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {isCombo && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-black text-white tracking-wider shrink-0">COMBO</span>
                              )}
                              <span className="font-medium">{name}</span>
                            </div>
                            {item.codigo && <p className="text-[10px] text-muted-foreground font-mono">{item.codigo}</p>}
                          </td>
                          {items.some(i => i.presentacion) && (
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.presentacion || ""}</td>
                          )}
                          <td className="px-3 py-2 text-center">{displayQty}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                          {hasDiscount && (
                            <td className="px-3 py-2 text-right text-xs">{(item.descuento || 0) > 0 ? `-${item.descuento}%` : ""}</td>
                          )}
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-3 space-y-1 text-sm text-right">
              {(descPct > 0 || recPct > 0 || envio > 0 || ncTotal > 0 || (isPedidoWeb && itemsSubtotal !== displayTotal)) && (
                <p className="text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{formatCurrency(itemsSubtotal)}</span></p>
              )}
              {descPct > 0 && (
                <p className="text-muted-foreground">Descuento ({descPct}%): <span className="font-medium text-red-500">-{formatCurrency(itemsSubtotal * descPct / 100)}</span></p>
              )}
              {recPct > 0 && (
                <p className="text-muted-foreground">Recargo ({recPct}%): <span className="font-medium text-foreground">+{formatCurrency(itemsSubtotal * recPct / 100)}</span></p>
              )}
              {envio > 0 && (
                <p className="text-muted-foreground">Envio: <span className="font-medium text-foreground">{formatCurrency(envio)}</span></p>
              )}
              {ncTotal > 0 && !editable && (
                <p className="text-muted-foreground">Nota de Crédito: <span className="font-medium text-amber-600">-{formatCurrency(ncTotal)}</span></p>
              )}
              <p className="text-base font-bold">Total: {formatCurrency(displayTotal)}</p>
            </div>
          </div>

          {/* ═══ NOTAS DE CRÉDITO ═══ */}
          {ncs && ncs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 flex items-center gap-1.5 mb-3">
                <FileText className="w-3.5 h-3.5" /> Notas de Crédito
              </h3>
              <div className="space-y-2">
                {ncs.map((nc, i) => (
                  <div key={i} className="border border-red-200 bg-red-50/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-red-700">NC #{nc.numero}</span>
                      <span className="text-sm font-bold text-red-700">-{formatCurrency(nc.total)}</span>
                    </div>
                    {nc.items.map((item, j) => (
                      <div key={j} className="flex justify-between text-xs text-red-600 pl-2">
                        <span>{item.cantidad} × {item.descripcion}</span>
                        <span>-{formatCurrency(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            {footerExtra}
            {hasChanges && (
              <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cambios sin guardar</p>
            )}
          </div>
          <div className="flex gap-2">
            {onPrint && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onPrint}>
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleClose}>
              Cerrar
            </Button>
            {hasChanges && onSave && (
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
