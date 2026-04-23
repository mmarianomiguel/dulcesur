import type { Proveedor } from "@/types/database";

/* ───────── Compras ───────── */

export interface CompraRow {
  id: string;
  numero: string;
  fecha: string;
  proveedor_id: string | null;
  total: number;
  subtotal: number | null;
  descuento_porcentaje: number | null;
  estado: string;
  forma_pago: string | null;
  estado_pago: string | null;
  monto_pagado: number | null;
  tipo_comprobante: string | null;
  numero_comprobante: string | null;
  observacion: string | null;
  proveedores: { nombre: string } | null;
}

export interface CompraItemRow {
  id: string;
  compra_id: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface ProductSearch {
  id: string;
  codigo: string;
  nombre: string;
  stock: number;
  costo: number;
  precio: number;
  imagen_url: string | null;
}

export interface CompraItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  imagen_url: string | null;
  stock_actual: number;
  cantidad: number;
  cajas: number;
  sueltas: number;
  unidades_por_caja: number;
  costo_unitario: number;
  costo_original: number;
  precio_original: number;
  descuento: number;
  subtotal: number;
  actualizarPrecio: boolean;
  actualizarCosto: boolean;
  precio_nuevo_custom?: number;
}

/* ───────── Pedidos ───────── */

export interface PedidoRow {
  id: string;
  proveedor_id: string | null;
  fecha: string;
  estado: string;
  costo_total_estimado: number;
  observacion: string | null;
  proveedores: { nombre: string } | null;
}

export interface PedidoItemRow {
  id: string;
  pedido_id: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  faltante: number;
  cantidad_recibida: number;
  precio_unitario: number;
  subtotal: number;
}

export interface SuggestedItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
  stock_maximo: number;
  faltante: number;
  unidades_por_caja: number;
  cajas: number;
  precio_unitario: number;
  subtotal: number;
}

/* ───────── Stock Crítico / Reposición ───────── */

export interface ReposicionItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  imagen_url: string | null;
  categoria_id: string | null;
  categoria: string;
  subcategoria_id: string | null;
  subcategoria: string;
  marca_id: string | null;
  marca: string;
  stock: number;
  stock_minimo: number;
  stock_maximo: number;
  costo: number;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  precio_proveedor: number | null;
  cantidad_minima_pedido: number;
  nivel: "critico" | "bajo" | "ok";
  faltante: number;
  velDiaria: number;
  diasStock: number | null;
}

/* ───────── Shared ───────── */

export interface Categoria {
  id: string;
  nombre: string;
}

export interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
}

export interface Marca {
  id: string;
  nombre: string;
}

export type { Proveedor };

export type ActiveTab =
  | "compras"
  | "pedidos"
  | "stock-critico"
  | "nueva-compra"
  | "nuevo-pedido"
  | "detalle-compra"
  | "detalle-pedido";

/* ───────── Helpers ───────── */

export function calcSubtotal(costo: number, cantidad: number, descuento: number) {
  return Math.round(costo * cantidad * (1 - descuento / 100) * 100) / 100;
}

export function pedidoDisplayNum(id: string): string {
  return "PED-" + id.slice(0, 6).toUpperCase();
}
