import { supabase } from "@/lib/supabase";
import type { Venta, VentaItem } from "@/types/database";
import { BaseService } from "./base";
import { todayARG, nowTimeARG } from "@/lib/formatters";

class VentaService extends BaseService<Venta> {
  constructor() {
    super("ventas");
  }

  async getNextNumero(): Promise<string> {
    const { data, error } = await supabase.rpc("next_numero", { p_tipo: "venta" });
    if (error) {
      console.error("Error obteniendo próximo número de venta:", error);
      throw new Error("No se pudo obtener el número de venta. Intentá de nuevo.");
    }
    return data || "00001-00000000";
  }

  async getByFecha(fecha: string): Promise<Venta[]> {
    const { data } = await supabase
      .from(this.table)
      .select("*")
      .eq("fecha", fecha)
      .order("created_at", { ascending: false });
    return (data as Venta[]) || [];
  }

  async getHoy(): Promise<Venta[]> {
    return this.getByFecha(todayARG());
  }

  async getByCliente(clienteId: string): Promise<Venta[]> {
    return this.getAll({
      filters: { cliente_id: clienteId },
      orderBy: "created_at",
      ascending: false,
    });
  }

  async getItems(ventaId: string): Promise<VentaItem[]> {
    const { data } = await supabase
      .from("venta_items")
      .select("*")
      .eq("venta_id", ventaId)
      .order("created_at");
    return (data as VentaItem[]) || [];
  }

  async createWithItems(
    venta: Partial<Venta>,
    items: Partial<VentaItem>[]
  ): Promise<Venta> {
    const { data, error } = await supabase
      .from(this.table)
      .insert(venta)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const ventaData = data as Venta;
    const ventaItems = items.map((i) => ({ ...i, venta_id: ventaData.id }));
    const { error: itemsError } = await supabase.from("venta_items").insert(ventaItems);
    if (itemsError) throw new Error(itemsError.message);

    return ventaData;
  }
}

class CajaService extends BaseService<{
  id: string;
  fecha: string;
  hora: string;
  tipo: "ingreso" | "egreso" | "cancelacion";
  descripcion: string;
  metodo_pago: string;
  monto: number;
  referencia_id: string | null;
  referencia_tipo: string | null;
  cuenta_bancaria: string | null;
  created_at: string;
}> {
  constructor() {
    super("caja_movimientos");
  }

  async registrarIngreso(opts: {
    descripcion: string;
    metodoPago: string;
    monto: number;
    referenciaId?: string;
    referenciaTipo?: string;
  }) {
    return this.create({
      fecha: todayARG(),
      hora: nowTimeARG(),
      tipo: "ingreso",
      descripcion: opts.descripcion,
      metodo_pago: opts.metodoPago,
      monto: opts.monto,
      referencia_id: opts.referenciaId || null,
      referencia_tipo: opts.referenciaTipo || null,
    } as never);
  }

  async registrarEgreso(opts: {
    descripcion: string;
    metodoPago: string;
    monto: number;
    referenciaId?: string;
    referenciaTipo?: string;
    subTipo?: string;
  }) {
    return this.create({
      fecha: todayARG(),
      hora: nowTimeARG(),
      tipo: "egreso",
      descripcion: opts.descripcion,
      metodo_pago: opts.metodoPago,
      monto: opts.monto,
      referencia_id: opts.referenciaId || null,
      referencia_tipo: opts.referenciaTipo || null,
      sub_tipo: opts.subTipo || null,
    } as never);
  }

  async registrarCancelacion(opts: {
    descripcion: string;
    metodoPago: string;
    monto: number;
    referenciaId?: string;
    referenciaTipo?: string;
  }) {
    return this.create({
      fecha: todayARG(),
      hora: nowTimeARG(),
      tipo: "cancelacion",
      descripcion: opts.descripcion,
      metodo_pago: opts.metodoPago,
      monto: opts.monto,
      referencia_id: opts.referenciaId || null,
      referencia_tipo: opts.referenciaTipo || null,
    } as never);
  }

  async getMovimientosHoy() {
    return this.getAll({ filters: { fecha: todayARG() }, orderBy: "hora", ascending: false });
  }

  async getByFecha(fecha: string) {
    return this.getAll({ filters: { fecha }, orderBy: "hora", ascending: false });
  }
}

class CuentaCorrienteService extends BaseService<{
  id: string;
  cliente_id: string;
  fecha: string;
  comprobante: string;
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
  forma_pago: string;
  venta_id: string | null;
  created_at: string;
}> {
  constructor() {
    super("cuenta_corriente");
  }

  async getByCliente(clienteId: string) {
    const { data } = await supabase
      .from(this.table)
      .select("*")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });
    return data || [];
  }
}

// Singleton exports
export const ventaService = new VentaService();
export const cajaService = new CajaService();
export const cuentaCorrienteService = new CuentaCorrienteService();
