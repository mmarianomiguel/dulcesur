-- Migration: Add costo_unitario to venta_items for historical cost tracking
-- Run this in the Supabase SQL Editor

-- 1. Add costo_unitario column
ALTER TABLE venta_items ADD COLUMN IF NOT EXISTS costo_unitario numeric DEFAULT 0;

-- 2. Backfill: For items with a presentation, use presentation cost if available
-- First set all items to their product's current costo (best approximation for historical data)
UPDATE venta_items vi
SET costo_unitario = COALESCE(
  (SELECT p.costo FROM productos p WHERE p.id = vi.producto_id),
  0
)
WHERE vi.costo_unitario = 0 OR vi.costo_unitario IS NULL;

-- 3. For presentation items, try to use presentation-specific cost × units
-- This updates items sold as boxes/presentations to use the presentation cost
UPDATE venta_items vi
SET costo_unitario = pres.costo
FROM presentaciones pres
WHERE vi.producto_id = pres.producto_id
  AND vi.unidades_por_presentacion = pres.cantidad
  AND pres.costo > 0
  AND vi.presentacion IS NOT NULL
  AND vi.presentacion != 'Unidad'
  AND (vi.costo_unitario = 0 OR vi.costo_unitario IS NULL
       OR vi.costo_unitario = (SELECT p.costo FROM productos p WHERE p.id = vi.producto_id));

-- 4. For items still at base product cost that are presentations, compute costo * units
UPDATE venta_items vi
SET costo_unitario = (
  SELECT p.costo * COALESCE(vi.unidades_por_presentacion, 1)
  FROM productos p WHERE p.id = vi.producto_id
)
WHERE vi.presentacion IS NOT NULL
  AND vi.presentacion != 'Unidad'
  AND COALESCE(vi.unidades_por_presentacion, 1) > 1
  AND vi.costo_unitario = (SELECT p.costo FROM productos p WHERE p.id = vi.producto_id);
