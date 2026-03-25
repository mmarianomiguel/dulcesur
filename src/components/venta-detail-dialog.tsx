"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

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
  // Source
  origen?: "historial" | "pedidos" | "pos";
  // Combo product IDs
  comboIds?: Set<string>;
}

// ─── Helpers ───
function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

const estadoBadge: Record<string, { bg: string; text: string; label: string }> = {
  pendiente: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Pendiente" },
  armado: { bg: "bg-violet-50 border-violet-200", text: "text-violet-700", label: "Armado" },
  confirmado: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Confirmado" },
  entregado: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Entregado" },
  cancelado: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Cancelado" },
  anulada: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Anulada" },
};

function cleanDesc(desc: string) {
  return desc
    .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
    .replace(/\s*\(Unidad\)$/, "")
    .replace(/(\([^)]+\))\s*\1/gi, "$1")
    .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
    .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
}

// ─── Component ───
interface VentaDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: VentaDetailData | null;
  items: VentaDetailItem[];
  onPrint?: () => void;
  footerExtra?: React.ReactNode;
}

export function VentaDetailDialog({ open, onOpenChange, data, items, onPrint, footerExtra }: VentaDetailDialogProps) {
  if (!data) return null;

  const isPedidoWeb = data.origen === "pedidos";
  const isHistorial = !isPedidoWeb;
  const estado = data.estado === "anulada" ? "cancelado" : data.entregado ? "entregado" : data.estado || "pendiente";
  const estBadge = estadoBadge[estado] || estadoBadge.pendiente;
  const pago = data.forma_pago || data.metodo_pago || "—";
  const hasDiscount = items.some((i) => (i.descuento || 0) > 0);
  const descPct = data.descuento_porcentaje || 0;
  const recPct = data.recargo_porcentaje || 0;
  const envio = data.costo_envio || 0;
  const itemsSubtotal = data.subtotal || items.reduce((s, i) => s + i.subtotal, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
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
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${estBadge.bg} ${estBadge.text}`}>
              {estBadge.label}
            </span>
            {isPedidoWeb && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-50 text-pink-700 border border-pink-200">
                <Globe className="w-3 h-3 mr-1" />Pedido Web
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Client + Delivery */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4" /> Cliente
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
              <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Truck className="w-4 h-4" /> Entrega y Pago
              </h3>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                {data.metodo_entrega ? (
                  <p className="flex items-center gap-1.5">
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
                <p className="text-xs text-muted-foreground">Pago: {pago}</p>
                {(() => {
                  const fp = ((data.forma_pago || "") + " " + (data.metodo_pago || "")).toLowerCase();
                  const hasTransfer = fp.includes("transferencia") || fp.includes("mixto");
                  if (!hasTransfer) return null;
                  return data.cuenta_transferencia_alias ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Banknote className="w-3 h-3" />
                      Cuenta: <span className="font-medium text-foreground">{data.cuenta_transferencia_alias}</span>
                    </p>
                  ) : (
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

          {/* Items table */}
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground mb-3">
              <Package className="w-4 h-4" /> Productos ({items.length})
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Producto</th>
                    <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-16">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Precio</th>
                    {hasDiscount && <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-16">Desc.</th>}
                    <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
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
                        <td className="px-3 py-2 text-center">{displayQty}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                        {hasDiscount && (
                          <td className="px-3 py-2 text-right text-xs">{(item.descuento || 0) > 0 ? `-${item.descuento}%` : ""}</td>
                        )}
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-3 space-y-1 text-sm text-right">
              {(descPct > 0 || recPct > 0 || envio > 0) && (
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
              <p className="text-base font-bold">Total: {formatCurrency(data.total)}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
          <div>{footerExtra}</div>
          <div className="flex gap-2">
            {onPrint && (
              <Button variant="outline" size="sm" onClick={onPrint}>
                <Printer className="w-3.5 h-3.5 mr-1.5" />Imprimir
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
