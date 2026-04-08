import { BaseService } from "./base";
import { supabase } from "@/lib/supabase";
import type {
  NotificacionPlantilla,
  Notificacion,
  NotificacionDestinatarioRow,
  NotificacionPreferencia,
  NotificacionTipo,
} from "@/types/database";

class PlantillaService extends BaseService<NotificacionPlantilla> {
  constructor() {
    super("notificacion_plantillas");
  }

  async getActivas(): Promise<NotificacionPlantilla[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select("*")
      .eq("activa", true)
      .order("nombre");
    if (error) throw new Error(error.message);
    return (data as NotificacionPlantilla[]) || [];
  }
}

class NotificacionService extends BaseService<Notificacion> {
  constructor() {
    super("notificaciones");
  }

  async getHistorial(limit = 50, offset = 0): Promise<{ data: Notificacion[]; count: number }> {
    const { data, error, count } = await supabase
      .from(this.table)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { data: (data as Notificacion[]) || [], count: count ?? 0 };
  }
}

class DestinatarioService extends BaseService<NotificacionDestinatarioRow> {
  constructor() {
    super("notificacion_destinatarios");
  }

  async getByCliente(clienteId: number, diasMax = 5): Promise<(NotificacionDestinatarioRow & { notificacion: Notificacion })[]> {
    const desde = new Date();
    desde.setDate(desde.getDate() - diasMax);

    const { data, error } = await supabase
      .from(this.table)
      .select("*, notificacion:notificaciones(*)")
      .eq("cliente_id", clienteId)
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as any) || [];
  }

  async getByUsuario(usuarioId: string, diasMax = 5): Promise<(NotificacionDestinatarioRow & { notificacion: Notificacion })[]> {
    const desde = new Date();
    desde.setDate(desde.getDate() - diasMax);

    const { data, error } = await supabase
      .from(this.table)
      .select("*, notificacion:notificaciones(*)")
      .eq("usuario_id", usuarioId)
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as any) || [];
  }

  async countNoLeidas(clienteId: number): Promise<number> {
    const desde = new Date();
    desde.setDate(desde.getDate() - 5);

    const { count, error } = await supabase
      .from(this.table)
      .select("*", { count: "exact", head: true })
      .eq("cliente_id", clienteId)
      .eq("leida", false)
      .gte("created_at", desde.toISOString());
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async marcarLeida(id: string): Promise<void> {
    await supabase
      .from(this.table)
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq("id", id);
  }

  async marcarTodasLeidas(clienteId: number): Promise<void> {
    await supabase
      .from(this.table)
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq("cliente_id", clienteId)
      .eq("leida", false);
  }

  async getDestinatariosDeNotificacion(notificacionId: string): Promise<NotificacionDestinatarioRow[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select("*")
      .eq("notificacion_id", notificacionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as NotificacionDestinatarioRow[]) || [];
  }
}

class PreferenciaService extends BaseService<NotificacionPreferencia> {
  constructor() {
    super("notificacion_preferencias");
  }

  async getByCliente(clienteId: number): Promise<NotificacionPreferencia[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select("*")
      .eq("cliente_id", clienteId);
    if (error) throw new Error(error.message);
    return (data as NotificacionPreferencia[]) || [];
  }

  async upsertPreferencia(clienteId: number, tipo: NotificacionTipo, enabled: boolean): Promise<void> {
    const { error } = await supabase
      .from(this.table)
      .upsert(
        { cliente_id: clienteId, tipo, push_enabled: enabled, updated_at: new Date().toISOString() },
        { onConflict: "cliente_id,tipo" }
      );
    if (error) throw new Error(error.message);
  }
}

export const plantillaService = new PlantillaService();
export const notificacionService = new NotificacionService();
export const destinatarioService = new DestinatarioService();
export const preferenciaService = new PreferenciaService();
