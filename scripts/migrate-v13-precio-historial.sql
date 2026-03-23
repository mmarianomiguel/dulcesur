-- Migration v13: Historial de cambios de precio
-- Registra cada cambio de precio con producto, precio anterior, nuevo precio, fecha y usuario

CREATE TABLE IF NOT EXISTS precio_historial (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  presentacion_id UUID REFERENCES presentaciones(id) ON DELETE CASCADE,
  precio_anterior NUMERIC(12,2) NOT NULL,
  precio_nuevo NUMERIC(12,2) NOT NULL,
  costo_anterior NUMERIC(12,2),
  costo_nuevo NUMERIC(12,2),
  usuario TEXT,
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_precio_historial_producto ON precio_historial(producto_id);
CREATE INDEX IF NOT EXISTS idx_precio_historial_fecha ON precio_historial(created_at);

-- Add limite_credito to clientes (for FASE 2.3)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS limite_credito NUMERIC(12,2) DEFAULT 0;
