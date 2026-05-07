-- V25: Categoría de egreso en caja_movimientos
-- Antes: los egresos solo tenían descripción libre. Imposible agrupar al fin de mes
-- (¿cuánto se fue en sueldos? ¿en nafta?). Ahora cada egreso lleva una categoría
-- predefinida y los reportes pueden sumar por categoría.

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS categoria text;

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_categoria
  ON caja_movimientos (categoria)
  WHERE tipo = 'egreso';
