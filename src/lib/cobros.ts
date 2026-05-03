import { supabase } from "@/lib/supabase";

/**
 * Genera un recibo de cobro formal (numero 001-XXX) en la tabla `cobros`
 * + cobro_items vinculando a la(s) venta(s).
 *
 * Usar desde flujos donde YA se hicieron las mutaciones de caja_movimientos /
 * monto_pagado / saldo (POS, hoja-ruta, confirmDelivery). Esta función NO toca
 * esas tablas — solo persiste el recibo para que aparezca en "Resumen de Cuenta
 * → Cobros" con su numero formal y se pueda imprimir.
 *
 * Si no hay clienteId (venta a "consumidor final" sin cliente), retorna null
 * sin error.
 */
export async function createCobroRecibo(opts: {
  clienteId: string | null | undefined;
  monto: number;
  formaPago: string;
  fecha: string;
  hora: string;
  cuentaBancariaId?: string | null;
  observacion?: string | null;
  allocations: Array<{ venta_id: string; monto_aplicado: number }>;
}): Promise<{ cobro_id: string; numero: string } | null> {
  if (!opts.clienteId || opts.monto <= 0) return null;
  try {
    const { data, error } = await supabase.rpc("create_cobro_recibo", {
      p_client_id: opts.clienteId,
      p_monto: opts.monto,
      p_forma_pago: opts.formaPago,
      p_observacion: opts.observacion || null,
      p_fecha: opts.fecha,
      p_hora: opts.hora,
      p_cuenta_bancaria_id: opts.cuentaBancariaId || null,
      p_allocations: opts.allocations,
    });
    if (error) {
      console.error("create_cobro_recibo error:", error);
      return null;
    }
    return data as { cobro_id: string; numero: string };
  } catch (err) {
    console.error("create_cobro_recibo exception:", err);
    return null;
  }
}
