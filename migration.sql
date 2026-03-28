-- Migration: Add new columns for compras improvements and caja sub_tipo
-- Run this in the Supabase SQL Editor

-- Compras: descuento, subtotal, tipo_comprobante, numero_comprobante, monto_pagado
ALTER TABLE compras ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS descuento_porcentaje numeric DEFAULT 0;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS tipo_comprobante text DEFAULT 'Factura A';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS numero_comprobante text;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS monto_pagado numeric DEFAULT 0;

-- Backfill: set subtotal = total for existing compras (no discount applied)
UPDATE compras SET subtotal = total WHERE subtotal = 0 OR subtotal IS NULL;

-- Backfill: set monto_pagado = total for already-paid compras
UPDATE compras SET monto_pagado = total WHERE estado_pago = 'Pagada' AND (monto_pagado = 0 OR monto_pagado IS NULL);

-- Caja movimientos: sub_tipo for egreso classification (Gasto/Retiro)
ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS sub_tipo text;

-- Backfill: classify existing egresos based on description (backwards compat)
UPDATE caja_movimientos
SET sub_tipo = CASE
  WHEN lower(descripcion) LIKE '%gasto%' THEN 'gasto'
  ELSE 'retiro'
END
WHERE tipo = 'egreso' AND sub_tipo IS NULL;
