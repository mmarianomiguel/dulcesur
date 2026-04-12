-- Migration v20: Productos redesign — precio_oferta + tags
-- Run this migration in Supabase SQL Editor

-- Precio de oferta temporal por producto
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS precio_oferta numeric,
  ADD COLUMN IF NOT EXISTS precio_oferta_hasta date;

-- Etiquetas libres por producto
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Index for tag searches
CREATE INDEX IF NOT EXISTS idx_productos_tags ON productos USING gin(tags);
