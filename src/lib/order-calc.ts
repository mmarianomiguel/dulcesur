// ─── Motor Central de Cálculo de Totales ───
// Única fuente de verdad para TODOS los cálculos monetarios del sistema.
// Usado en: POS, carga manual, hoja de ruta, checkout tienda, listado, pedidos, cobro.

export interface CalcItem {
  /** Item subtotal (ya incluye descuento de item: precio_unitario * cantidad * (1 - desc/100)) */
  subtotal: number;
}

export type FormaPago =
  | "Efectivo"
  | "Transferencia"
  | "Mixto"
  | "Cuenta Corriente"
  | "Pendiente";

export interface PaymentContext {
  formaPago: FormaPago | string;
  porcentajeTransferencia: number;
  mixtoEfectivo?: number;
  mixtoTransferencia?: number;
  mixtoCuentaCorriente?: number;
}

export interface OrderCalcInput {
  items: CalcItem[];
  descuentoPorcentaje: number;
  recargoPorcentaje: number;
  payment?: PaymentContext;
  costoEnvio?: number;
}

export interface OrderCalcResult {
  subtotalBruto: number;
  descuentoMonto: number;
  subtotalConDescuento: number;
  recargoMonto: number;
  totalBase: number;
  costoEnvio: number;
  transferSurcharge: number;
  totalFinal: number;
}

/** Redondeo ARS: entero más cercano */
function arsRound(n: number): number {
  return Math.round(n);
}

/**
 * Calcula el recargo por transferencia sobre el monto del pedido actual.
 * NUNCA sobre saldo pendiente.
 */
export function calcTransferSurcharge(
  orderAmount: number,
  payment: PaymentContext
): number {
  const pct = payment.porcentajeTransferencia;
  if (pct <= 0 || orderAmount <= 0) return 0;

  const fp = payment.formaPago.toLowerCase();

  if (fp === "transferencia" || fp === "transfer") {
    return arsRound(orderAmount * pct / 100);
  }

  if (fp === "mixto" || fp === "mix") {
    const ef = payment.mixtoEfectivo ?? 0;
    const cc = payment.mixtoCuentaCorriente ?? 0;
    const tr = payment.mixtoTransferencia ?? 0;
    // Solo la porción de transferencia que cubre ESTE pedido
    const transferForOrder = Math.min(tr, Math.max(0, orderAmount - ef - cc));
    return arsRound(transferForOrder * pct / 100);
  }

  return 0;
}

/**
 * Motor central de cálculo de totales.
 *
 * Fórmula canónica:
 * 1. subtotalBruto = SUM(items.subtotal)
 * 2. descuentoMonto = round(subtotalBruto * descuentoPorcentaje / 100)
 * 3. subtotalConDescuento = subtotalBruto - descuentoMonto
 * 4. recargoMonto = round(subtotalConDescuento * recargoPorcentaje / 100)  ← DESPUÉS de descuento
 * 5. totalBase = subtotalConDescuento + recargoMonto
 * 6. transferSurcharge = f(formaPago, totalBase, pctTransferencia)
 * 7. totalFinal = totalBase + costoEnvio + transferSurcharge
 */
export function calculateOrderFinancials(input: OrderCalcInput): OrderCalcResult {
  const {
    items,
    descuentoPorcentaje,
    recargoPorcentaje,
    payment,
    costoEnvio = 0,
  } = input;

  const subtotalBruto = items.reduce((acc, i) => acc + i.subtotal, 0);
  const descuentoMonto = arsRound(subtotalBruto * descuentoPorcentaje / 100);
  const subtotalConDescuento = subtotalBruto - descuentoMonto;
  const recargoMonto = arsRound(subtotalConDescuento * recargoPorcentaje / 100);
  const totalBase = subtotalConDescuento + recargoMonto;
  const transferSurcharge = payment
    ? calcTransferSurcharge(totalBase, payment)
    : 0;
  const totalFinal = totalBase + costoEnvio + transferSurcharge;

  return {
    subtotalBruto,
    descuentoMonto,
    subtotalConDescuento,
    recargoMonto,
    totalBase,
    costoEnvio,
    transferSurcharge,
    totalFinal,
  };
}

/**
 * Calcula el total de una venta después de aplicar NCs, respetando el recargo de
 * transferencia. El recargo se recalcula sobre la base neta (subtotal - NC),
 * no sobre el total original.
 */
export function calcTotalConNC(params: {
  subtotal: number;
  total: number;
  recargo_porcentaje?: number;
  ncTotal: number;
}): number {
  const { subtotal, total, recargo_porcentaje, ncTotal } = params;
  if (ncTotal === 0) return total;
  const baseNeta = subtotal - ncTotal;
  if (baseNeta <= 0) return 0;
  const pct = recargo_porcentaje != null && recargo_porcentaje > 0
    ? recargo_porcentaje / 100
    : (total - subtotal) > 0 && subtotal > 0
      ? (total - subtotal) / subtotal
      : 0;
  return baseNeta + Math.round(baseNeta * pct);
}

/**
 * Reconstruye el desglose financiero desde una venta almacenada.
 * Útil para display en listados, detalle y pedidos sin recalcular desde items.
 */
export function recalcFromVenta(venta: {
  subtotal: number;
  descuento_porcentaje: number;
  recargo_porcentaje: number;
  total: number;
}): {
  descuentoMonto: number;
  recargoMonto: number;
  subtotalConDescuento: number;
  transferSurcharge: number;
} {
  const descuentoMonto = arsRound(
    venta.subtotal * venta.descuento_porcentaje / 100
  );
  const subtotalConDescuento = venta.subtotal - descuentoMonto;
  const recargoMonto = arsRound(
    subtotalConDescuento * venta.recargo_porcentaje / 100
  );
  // Transfer surcharge es el residual: total - (subtotal - desc + rec)
  const transferSurcharge = Math.max(
    0,
    venta.total - (subtotalConDescuento + recargoMonto)
  );
  return { descuentoMonto, recargoMonto, subtotalConDescuento, transferSurcharge };
}
