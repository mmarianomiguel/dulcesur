-- V21: Separar horario de entregas del horario de atención del local.
-- Antes: envios-dinamico mostraba horario_atencion_* (mismo dato que el local abre/cierra).
-- Ahora: existen horario_entrega_inicio/fin para reflejar la franja real de reparto.

ALTER TABLE tienda_config
  ADD COLUMN IF NOT EXISTS horario_entrega_inicio TIME,
  ADD COLUMN IF NOT EXISTS horario_entrega_fin    TIME;
