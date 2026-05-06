-- Categorías excluidas del cálculo del mínimo para envío + toggles de visualización
-- Defensivo: todas las columnas tienen defaults sanos. Si no se aplica esta migration,
-- el frontend lee con `??` y mantiene el comportamiento previo.

ALTER TABLE tienda_config
  ADD COLUMN IF NOT EXISTS categorias_excluidas_minimo UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excluidas_aplican_a_retiro BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS mostrar_progreso_minimo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS mostrar_desglose_excluidos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS mostrar_badge_excluidos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS texto_badge_excluidos TEXT DEFAULT 'No suma al mínimo de envío',
  ADD COLUMN IF NOT EXISTS mensaje_minimo_no_alcanzado TEXT DEFAULT 'Te faltan {faltante} en productos para llegar al mínimo de envío.';
