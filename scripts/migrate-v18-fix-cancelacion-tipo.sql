-- migrate-v18-fix-cancelacion-tipo.sql
-- Fix: caja_movimientos CHECK constraint doesn't allow 'cancelacion' tipo,
-- causing silent failures when anulating paid sales.

-- 1. Drop and recreate CHECK constraint to include 'cancelacion'
ALTER TABLE caja_movimientos DROP CONSTRAINT IF EXISTS caja_movimientos_tipo_check;
ALTER TABLE caja_movimientos ADD CONSTRAINT caja_movimientos_tipo_check
  CHECK (tipo IN ('ingreso', 'egreso', 'cancelacion'));

-- 2. Migrate existing egreso records that are actually cancelaciones
-- (old records before the cancelacion type was introduced in code)
UPDATE caja_movimientos
SET tipo = 'cancelacion'
WHERE tipo = 'egreso'
  AND referencia_tipo IN ('anulacion', 'nota_credito');
