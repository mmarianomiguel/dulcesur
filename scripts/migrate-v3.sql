-- =============================================
-- DULCESUR V3 - Ventas Module Full Features
-- =============================================

-- Add delivery/invoicing tracking to ventas
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS entregado BOOLEAN DEFAULT false;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS facturado BOOLEAN DEFAULT false;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS remito_origen_id UUID REFERENCES ventas(id) ON DELETE SET NULL;

-- Anticipos / Señas
CREATE TABLE IF NOT EXISTS anticipos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero TEXT NOT NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  fecha DATE DEFAULT CURRENT_DATE,
  monto NUMERIC(12,2) NOT NULL,
  concepto TEXT,
  estado TEXT DEFAULT 'Vigente',
  venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Percepciones (tax perceptions on sales)
CREATE TABLE IF NOT EXISTS percepciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'IIBB',
  jurisdiccion TEXT,
  alicuota NUMERIC(5,2) DEFAULT 0,
  base_imponible NUMERIC(12,2) DEFAULT 0,
  monto NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cambios de artículos
CREATE TABLE IF NOT EXISTS cambios_articulos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero TEXT NOT NULL,
  fecha DATE DEFAULT CURRENT_DATE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cambio_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cambio_id UUID NOT NULL REFERENCES cambios_articulos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE anticipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE percepciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE cambios_articulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cambio_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'anticipos','percepciones','cambios_articulos','cambio_items'
  ]) LOOP
    EXECUTE format('CREATE POLICY "allow_all_select_%s" ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_insert_%s" ON %I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_update_%s" ON %I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_delete_%s" ON %I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_anticipos_cliente ON anticipos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_percepciones_venta ON percepciones(venta_id);
CREATE INDEX IF NOT EXISTS idx_cambios_articulos_cliente ON cambios_articulos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cambio_items_cambio ON cambio_items(cambio_id);
CREATE INDEX IF NOT EXISTS idx_ventas_entregado ON ventas(entregado);
CREATE INDEX IF NOT EXISTS idx_ventas_facturado ON ventas(facturado);
CREATE INDEX IF NOT EXISTS idx_ventas_remito_origen ON ventas(remito_origen_id);

-- Numeradores for new types
INSERT INTO numeradores (tipo, ultimo_numero) VALUES ('anticipo', 0) ON CONFLICT (tipo) DO NOTHING;
INSERT INTO numeradores (tipo, ultimo_numero) VALUES ('cambio', 0) ON CONFLICT (tipo) DO NOTHING;
INSERT INTO numeradores (tipo, ultimo_numero) VALUES ('nota_credito', 0) ON CONFLICT (tipo) DO NOTHING;
INSERT INTO numeradores (tipo, ultimo_numero) VALUES ('nota_debito', 0) ON CONFLICT (tipo) DO NOTHING;

-- Mark existing remitos as entregado=true, facturado=false by default
UPDATE ventas SET entregado = true WHERE tipo_comprobante = 'Remito X' AND entregado IS NULL;
UPDATE ventas SET facturado = false WHERE tipo_comprobante = 'Remito X' AND facturado IS NULL;
