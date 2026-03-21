import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/types/database";
import { BaseService } from "./base";

class ClienteService extends BaseService<Cliente> {
  constructor() {
    super("clientes");
  }

  async getActivos(): Promise<Cliente[]> {
    return this.getAll({ filters: { activo: true }, orderBy: "nombre" });
  }

  async search(term: string): Promise<Cliente[]> {
    // Escape special characters to prevent filter injection
    const safeTerm = term.replace(/[%_\\(),.*]/g, (ch) => `\\${ch}`);
    const { data } = await supabase
      .from(this.table)
      .select("*")
      .eq("activo", true)
      .or(`nombre.ilike.%${safeTerm}%,email.ilike.%${safeTerm}%,telefono.ilike.%${safeTerm}%`)
      .order("nombre")
      .limit(20);
    return (data as Cliente[]) || [];
  }

  async updateSaldo(id: string, saldo: number): Promise<void> {
    await supabase.from(this.table).update({ saldo }).eq("id", id);
  }

  async getConSaldo(): Promise<Cliente[]> {
    const { data } = await supabase
      .from(this.table)
      .select("*")
      .eq("activo", true)
      .gt("saldo", 0)
      .order("saldo", { ascending: false });
    return (data as Cliente[]) || [];
  }
}

export const clienteService = new ClienteService();
