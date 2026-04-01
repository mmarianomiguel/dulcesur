export interface Database {
  public: {
    Tables: {
      empresa: {
        Row: Empresa;
        Insert: Partial<Empresa>;
        Update: Partial<Empresa>;
      };
      usuarios: {
        Row: Usuario;
        Insert: Partial<Usuario>;
        Update: Partial<Usuario>;
      };
      categorias: {
        Row: Categoria;
        Insert: Partial<Categoria>;
        Update: Partial<Categoria>;
      };
      productos: {
        Row: Producto;
        Insert: Partial<Producto>;
        Update: Partial<Producto>;
      };
      clientes: {
        Row: Cliente;
        Insert: Partial<Cliente>;
        Update: Partial<Cliente>;
      };
      proveedores: {
        Row: Proveedor;
        Insert: Partial<Proveedor>;
        Update: Partial<Proveedor>;
      };
      ventas: {
        Row: Venta;
        Insert: Partial<Venta>;
        Update: Partial<Venta>;
      };
      venta_items: {
        Row: VentaItem;
        Insert: Partial<VentaItem>;
        Update: Partial<VentaItem>;
      };
      compras: {
        Row: Compra;
        Insert: Partial<Compra>;
        Update: Partial<Compra>;
      };
      compra_items: {
        Row: CompraItem;
        Insert: Partial<CompraItem>;
        Update: Partial<CompraItem>;
      };
      caja_movimientos: {
        Row: CajaMovimiento;
        Insert: Partial<CajaMovimiento>;
        Update: Partial<CajaMovimiento>;
      };
      numeradores: {
        Row: Numerador;
        Insert: Partial<Numerador>;
        Update: Partial<Numerador>;
      };
    };
    Functions: {
      next_numero: {
        Args: { p_tipo: string };
        Returns: string;
      };
    };
  };
}

export interface Empresa {
  id: string;
  nombre: string;
  razon_social: string | null;
  cuit: string | null;
  situacion_iva: string;
  domicilio: string | null;
  telefono: string | null;
  email: string | null;
  punto_venta: string;
  tipo_comprobante_default: string;
  lista_precios_default: string;
  moneda_default: string;
  formato_ticket: string;
  created_at: string;
  updated_at: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string | null;
  rol: string;
  activo: boolean;
  created_at: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  created_at: string;
  restringida?: boolean;
  imagen_url?: string | null;
}

export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  categoria_id: string | null;
  stock: number;
  stock_minimo: number;
  stock_maximo: number;
  precio: number;
  costo: number;
  unidad_medida: string;
  activo: boolean;
  fecha_actualizacion: string;
  created_at: string;
  updated_at: string;
}

export interface Cliente {
  id: string;
  codigo_cliente: string | null;
  nombre: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  cuit: string | null;
  situacion_iva: string;
  tipo_factura: string | null;
  razon_social: string | null;
  domicilio: string | null;
  domicilio_comercial: string | null;
  domicilio_fiscal: string | null;
  telefono: string | null;
  email: string | null;
  provincia: string | null;
  localidad: string | null;
  codigo_postal: string | null;
  barrio: string | null;
  vendedor_id: string | null;
  observacion: string | null;
  fecha_nacimiento: string | null;
  saldo: number;
  limite_credito: number;
  zona_entrega: string | null;
  dias_entrega: string[] | null;
  activo: boolean;
  categorias_permitidas: string[];
  created_at: string;
  updated_at: string;
}

export interface ZonaEntrega {
  id: string;
  nombre: string;
  dias: string[];
  created_at: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  cuit: string | null;
  telefono: string | null;
  email: string | null;
  domicilio: string | null;
  rubro: string | null;
  saldo: number;
  observacion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Venta {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  cliente_id: string | null;
  vendedor_id: string | null;
  forma_pago: string;
  moneda: string;
  subtotal: number;
  descuento_porcentaje: number;
  recargo_porcentaje: number;
  total: number;
  estado: string;
  observacion: string | null;
  metodo_entrega: string | null;
  entregado?: boolean;
  facturado?: boolean;
  origen?: string;
  remito_origen_id?: string | null;
  lista_precio_id?: string | null;
  monto_pagado?: number;
  created_at: string;
}

export interface VentaItem {
  id: string;
  venta_id: string;
  producto_id: string | null;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  unidad_medida: string;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  presentacion?: string;
  unidades_por_presentacion?: number;
  costo_unitario?: number;
  created_at: string;
}

export interface Compra {
  id: string;
  numero: string;
  fecha: string;
  proveedor_id: string | null;
  subtotal: number;
  total: number;
  estado: string;
  forma_pago: string | null;
  estado_pago: string;
  monto_pagado: number | null;
  observacion: string | null;
  created_at: string;
}

export interface CompraItem {
  id: string;
  compra_id: string;
  producto_id: string | null;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  created_at: string;
}

export interface CajaMovimiento {
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
  sub_tipo?: string | null;
  created_at: string;
}

// MIGRATION NOTE: Existing caja_movimientos records that represent sale cancellations
// (referencia_tipo = 'anulacion' or 'nota_credito') currently have tipo = 'egreso'.
// They should be migrated to tipo = 'cancelacion' with the following SQL:
//
//   UPDATE caja_movimientos
//   SET tipo = 'cancelacion'
//   WHERE tipo = 'egreso'
//     AND referencia_tipo IN ('anulacion', 'nota_credito');

export interface Cobro {
  id: string;
  numero: string;
  cliente_id: string;
  fecha: string;
  hora: string;
  monto: number;
  forma_pago: string;
  observacion: string | null;
  cuenta_bancaria_id: string | null;
  estado: "aplicado" | "anulado";
  created_at: string;
}

export interface CobroItem {
  id: string;
  cobro_id: string;
  venta_id: string;
  monto_aplicado: number;
  created_at: string;
}

export interface PagoProveedor {
  id: string;
  numero: string;
  proveedor_id: string;
  fecha: string;
  monto: number;
  forma_pago: string;
  compra_id: string | null;
  observacion: string | null;
  cuenta_bancaria_id: string | null;
  created_at: string;
}

export interface PagoProveedorItem {
  id: string;
  pago_id: string;
  compra_id: string;
  monto_aplicado: number;
  created_at: string;
}

export interface ProductoProveedor {
  id: string;
  producto_id: string;
  proveedor_id: string;
  codigo_proveedor: string | null;
  precio_proveedor: number | null;
  es_principal: boolean;
  cantidad_minima_pedido: number;
  created_at: string;
  updated_at: string;
}

export interface CuentaCorrienteProveedor {
  id: string;
  proveedor_id: string;
  fecha: string;
  tipo: "compra" | "pago" | "ajuste";
  descripcion: string;
  monto: number;
  saldo_resultante: number;
  referencia_id: string | null;
  referencia_tipo: string | null;
  created_at: string;
}

export interface Numerador {
  id: string;
  tipo: string;
  punto_venta: string;
  ultimo_numero: number;
}
