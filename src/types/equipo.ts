export interface Equipo {
  id: string;
  nombre: string;
  pin: string;
  rol: "armador" | "repartidor" | "admin";
  activo: boolean;
  created_at: string;
}

export interface PedidoArmado {
  id: string;
  venta_id: string;
  estado: "pendiente" | "armando" | "armado" | "listo";
  armador_id: string | null;
  notas: string | null;
  orden_entrega: number | null;
  inicio_armado_at: string | null;
  fin_armado_at: string | null;
  aprobado_at: string | null;
  aprobado_por: string | null;
  rechazos: number;
  motivo_rechazo: string | null;
  urgente: boolean;
  created_at: string;
  updated_at: string;
}

/** Shape returned by GET /api/equipo/pedidos */
export interface PedidoConArmado {
  id: string;
  numero: string;
  total: number;
  forma_pago: string;
  metodo_entrega: string | null;
  origen: string | null;
  created_at: string;
  clientes: {
    id: string;
    nombre: string;
    telefono: string | null;
    domicilio: string | null;
    localidad: string | null;
    auth_id?: string | null;
  } | null;
  venta_items: {
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    presentacion?: string | null;
    unidades_por_presentacion?: number | null;
  }[];
  pedido_armado: {
    id: string;
    estado: "pendiente" | "armando" | "armado" | "listo";
    armador_id: string | null;
    notas: string | null;
    orden_entrega: number | null;
    armador_nombre?: string;
    aprobador_nombre?: string;
    inicio_armado_at?: string | null;
    fin_armado_at?: string | null;
    aprobado_at?: string | null;
    aprobado_por?: string | null;
    rechazos?: number;
    motivo_rechazo?: string | null;
    urgente?: boolean;
  } | null;
}

/** Session stored in sessionStorage after PIN auth */
export interface EquipoSession {
  id: string;
  nombre: string;
  rol: "armador" | "repartidor" | "admin";
}
