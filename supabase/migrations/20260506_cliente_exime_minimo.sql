-- Cliente especial: las categorías excluidas (ej. cigarros) SÍ cuentan
-- para alcanzar el mínimo de envío. El mínimo en sí (ej. $50.000) sigue
-- aplicándose normalmente — solo cambia que los productos antes excluidos
-- ahora suman.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS ignora_categorias_excluidas BOOLEAN DEFAULT false;

COMMENT ON COLUMN clientes.ignora_categorias_excluidas IS 'Si true, para este cliente las categorías excluidas (cigarros, etc.) SI cuentan para alcanzar el mínimo de envío. El mínimo en sí sigue aplicándose.';
