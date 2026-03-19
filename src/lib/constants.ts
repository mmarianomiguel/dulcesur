// ─── App Config ───
export const APP_NAME = "Dulcesur";
export const APP_DESCRIPTION = "Sistema de gestión comercial moderno";

// ─── Locale ───
export const TIMEZONE = "America/Argentina/Buenos_Aires";
export const LOCALE = "es-AR";
export const CURRENCY = "ARS";

// ─── Pagination ───
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

// ─── Payment Methods ───
export const FORMAS_PAGO = [
  "Efectivo",
  "Transferencia",
  "Mixto",
  "Cuenta Corriente",
] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

// ─── Document Types ───
export const TIPOS_COMPROBANTE = [
  "Factura A",
  "Factura B",
  "Factura C",
  "Remito X",
  "Nota de Crédito",
  "Nota de Débito",
] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];

// ─── Delivery ───
export const METODOS_DESPACHO = ["Retira en local", "Envio a domicilio"] as const;

// ─── IVA ───
export const SITUACIONES_IVA = [
  "Responsable Inscripto",
  "Monotributista",
  "Consumidor Final",
  "Exento",
] as const;

// ─── Units ───
export const UNIDADES_MEDIDA = ["Unidad", "Kg", "Litro", "Metro", "Caja"] as const;
