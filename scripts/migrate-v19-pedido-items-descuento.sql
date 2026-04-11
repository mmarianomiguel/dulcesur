-- migrate-v19-pedido-items-descuento.sql
-- Add descuento column to pedido_tienda_items so checkout can store
-- per-item discount percentages (matching venta_items behavior).

ALTER TABLE pedido_tienda_items ADD COLUMN IF NOT EXISTS descuento NUMERIC(5,2) DEFAULT 0;
