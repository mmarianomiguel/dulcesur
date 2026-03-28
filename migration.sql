-- Fix: Re-backfill costo_unitario for any venta_items that still have 0 or NULL
-- This uses current product costs (best available approximation for historical data)
-- Run this in the Supabase SQL Editor

-- Step 1: Items sold as "Unidad" → product base cost
UPDATE venta_items vi
SET costo_unitario = COALESCE(
  (SELECT p.costo FROM productos p WHERE p.id = vi.producto_id),
  0
)
WHERE (vi.costo_unitario = 0 OR vi.costo_unitario IS NULL)
  AND (vi.presentacion IS NULL OR vi.presentacion = 'Unidad');

-- Step 2: Presentation items → try presentation-specific cost first
UPDATE venta_items vi
SET costo_unitario = pres.costo
FROM presentaciones pres
WHERE vi.producto_id = pres.producto_id
  AND vi.unidades_por_presentacion = pres.cantidad
  AND pres.costo > 0
  AND vi.presentacion IS NOT NULL
  AND vi.presentacion != 'Unidad'
  AND (vi.costo_unitario = 0 OR vi.costo_unitario IS NULL);

-- Step 3: Remaining presentation items without specific cost → base cost × units
UPDATE venta_items vi
SET costo_unitario = COALESCE(
  (SELECT p.costo * COALESCE(vi.unidades_por_presentacion, 1)
   FROM productos p WHERE p.id = vi.producto_id),
  0
)
WHERE vi.presentacion IS NOT NULL
  AND vi.presentacion != 'Unidad'
  AND (vi.costo_unitario = 0 OR vi.costo_unitario IS NULL);

-- Step 4: Combo items → sum of component costs
UPDATE venta_items vi
SET costo_unitario = COALESCE(
  (SELECT SUM(ci.cantidad * comp.costo)
   FROM combo_items ci
   JOIN productos comp ON comp.id = ci.producto_id
   WHERE ci.combo_id = vi.producto_id),
  0
)
WHERE (vi.costo_unitario = 0 OR vi.costo_unitario IS NULL)
  AND EXISTS (SELECT 1 FROM productos p WHERE p.id = vi.producto_id AND p.es_combo = true);

-- Verify: check if any items still have 0 cost (optional)
-- SELECT COUNT(*) as sin_costo FROM venta_items WHERE costo_unitario = 0 OR costo_unitario IS NULL;
