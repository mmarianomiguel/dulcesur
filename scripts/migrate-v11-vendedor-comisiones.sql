-- migrate-v11-vendedor-comisiones.sql
-- Add commission system for vendedores

-- =====================================================================
-- 1. Add commission percentage to usuarios
-- =====================================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS comision_porcentaje NUMERIC(5,2) DEFAULT 0;

-- =====================================================================
-- 2. Table for excluded categories (per vendedor)
-- =====================================================================

CREATE TABLE IF NOT EXISTS vendedor_categorias_excluidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendedor_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS vce_vendedor_idx ON vendedor_categorias_excluidas(vendedor_id);

ALTER TABLE vendedor_categorias_excluidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY vce_auth_all ON vendedor_categorias_excluidas FOR ALL TO authenticated USING (true) WITH CHECK (true);
