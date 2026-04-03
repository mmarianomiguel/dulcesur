-- migrate-v18-descuentos-clientes-precio-fijo.sql
-- Adds: client-specific discounts + fixed-price discount type

-- New column: clientes_ids — if non-empty, discount only applies to these clients
ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS clientes_ids UUID[] DEFAULT '{}';

-- New column: tipo_descuento — "porcentaje" (default, existing behavior) or "precio_fijo"
ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS tipo_descuento TEXT DEFAULT 'porcentaje';

-- New column: precio_fijo — the fixed price to apply when tipo_descuento = 'precio_fijo'
ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS precio_fijo NUMERIC DEFAULT NULL;
