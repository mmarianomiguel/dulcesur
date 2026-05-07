-- V24: Soporte para anular ajustes de stock
-- Antes: un ajuste de stock no podía revertirse. Si te equivocabas, quedaba para siempre.
-- Ahora: cada ajuste puede anularse. La anulación devuelve el stock vía un movimiento
-- reverso en stock_movimientos, marca el registro como anulado y queda auditable.

ALTER TABLE ajustes_stock
  ADD COLUMN IF NOT EXISTS anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por text,
  ADD COLUMN IF NOT EXISTS anulado_motivo text;
