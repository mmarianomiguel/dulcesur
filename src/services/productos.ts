import { supabase } from "@/lib/supabase";
import type { Producto, Categoria } from "@/types/database";
import { BaseService } from "./base";

class ProductoService extends BaseService<Producto> {
  constructor() {
    super("productos");
  }

  async getActivos(): Promise<Producto[]> {
    return this.getAll({ filters: { activo: true }, orderBy: "nombre" });
  }

  async getByCodigo(codigo: string): Promise<Producto | null> {
    const { data } = await supabase
      .from(this.table)
      .select("*")
      .eq("codigo", codigo)
      .single();
    return (data as Producto) || null;
  }

  async getByCategoria(categoriaId: string): Promise<Producto[]> {
    return this.getAll({ filters: { categoria_id: categoriaId, activo: true }, orderBy: "nombre" });
  }

  async updateStock(id: string, newStock: number): Promise<void> {
    await supabase.from(this.table).update({ stock: Math.max(0, newStock) }).eq("id", id);
  }

  async updatePrecio(id: string, precio: number): Promise<void> {
    await supabase.from(this.table).update({ precio }).eq("id", id);
  }

  async bulkUpdatePrecios(updates: { id: string; precio: number }[]): Promise<void> {
    const promises: PromiseLike<unknown>[] = updates.map((u) =>
      supabase.from(this.table).update({ precio: u.precio }).eq("id", u.id)
    );
    await Promise.all(promises);
  }

  async getLowStock(): Promise<Producto[]> {
    const { data } = await supabase
      .from(this.table)
      .select("*")
      .eq("activo", true)
      .gt("stock_minimo", 0)
      .order("stock");
    return ((data as Producto[]) || []).filter((p) => p.stock <= p.stock_minimo);
  }
}

class CategoriaService extends BaseService<Categoria> {
  constructor() {
    super("categorias");
  }

  async getAllOrdered(): Promise<Categoria[]> {
    return this.getAll({ orderBy: "nombre" });
  }
}

class PresentacionService extends BaseService<{
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  codigo: string;
}> {
  constructor() {
    super("presentaciones");
  }

  async getByProducto(productoId: string) {
    const { data } = await supabase
      .from(this.table)
      .select("*")
      .eq("producto_id", productoId);
    return data || [];
  }

  async getByCodigo(codigo: string) {
    const { data } = await supabase
      .from(this.table)
      .select("*")
      .eq("codigo", codigo)
      .single();
    return data;
  }
}

class MarcaService extends BaseService<{ id: string; nombre: string; imagen_url: string | null; created_at: string }> {
  constructor() {
    super("marcas");
  }

  async getAllOrdered() {
    return this.getAll({ orderBy: "nombre" });
  }
}

// Stock movement logging
export async function logStockMovimiento(opts: {
  producto_id: string;
  tipo: string;
  cantidad_antes: number;
  cantidad_despues: number;
  cantidad: number;
  referencia?: string;
  descripcion?: string;
  usuario?: string;
  orden_id?: string;
}) {
  await supabase.from("stock_movimientos").insert({
    producto_id: opts.producto_id,
    tipo: opts.tipo,
    cantidad_antes: opts.cantidad_antes,
    cantidad_despues: opts.cantidad_despues,
    cantidad: opts.cantidad,
    referencia: opts.referencia || null,
    descripcion: opts.descripcion || null,
    usuario: opts.usuario || null,
    orden_id: opts.orden_id || null,
  });
}

// Singleton exports
export const productoService = new ProductoService();
export const categoriaService = new CategoriaService();
export const presentacionService = new PresentacionService();
export const marcaService = new MarcaService();
