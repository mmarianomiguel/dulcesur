-- =============================================
-- DULCESUR V2 - New Features Migration
-- =============================================

-- Subcategorias
CREATE TABLE IF NOT EXISTS subcategorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  categoria_id UUID REFERENCES categorias(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Marcas
CREATE TABLE IF NOT EXISTS marcas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Producto-Proveedor junction
CREATE TABLE IF NOT EXISTS producto_proveedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  UNIQUE(producto_id, proveedor_id)
);

-- Presentaciones de producto (Unidad, Caja, etc.)
CREATE TABLE IF NOT EXISTS presentaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL DEFAULT 'Unidad',
  cantidad INTEGER NOT NULL DEFAULT 1,
  sku TEXT,
  costo NUMERIC(12,2) DEFAULT 0,
  precio NUMERIC(12,2) DEFAULT 0,
  precio_oferta NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enhance productos table
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_maximo INTEGER DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS subcategoria_id UUID REFERENCES subcategorias(id) ON DELETE SET NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS marca_id UUID REFERENCES marcas(id) ON DELETE SET NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion_detallada TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen_url TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS visibilidad TEXT DEFAULT 'visible';

-- Cuenta corriente movimientos (Debe/Haber for clients)
CREATE TABLE IF NOT EXISTS cuenta_corriente (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  fecha DATE DEFAULT CURRENT_DATE,
  comprobante TEXT,
  descripcion TEXT,
  debe NUMERIC(12,2) DEFAULT 0,
  haber NUMERIC(12,2) DEFAULT 0,
  saldo NUMERIC(12,2) DEFAULT 0,
  forma_pago TEXT,
  venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cobros (payments received from clients)
CREATE TABLE IF NOT EXISTS cobros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  fecha DATE DEFAULT CURRENT_DATE,
  monto NUMERIC(12,2) NOT NULL,
  forma_pago TEXT DEFAULT 'Efectivo',
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pedidos a proveedor
CREATE TABLE IF NOT EXISTS pedidos_proveedor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha DATE DEFAULT CURRENT_DATE,
  estado TEXT DEFAULT 'Borrador',
  costo_total_estimado NUMERIC(12,2) DEFAULT 0,
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedido_proveedor_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pedido_id UUID NOT NULL REFERENCES pedidos_proveedor(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  codigo TEXT,
  descripcion TEXT,
  cantidad INTEGER NOT NULL DEFAULT 0,
  faltante INTEGER DEFAULT 0,
  precio_unitario NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for new tables
ALTER TABLE subcategorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta_corriente ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobros ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_proveedor_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'subcategorias','marcas','producto_proveedores','presentaciones',
    'cuenta_corriente','cobros','pedidos_proveedor','pedido_proveedor_items'
  ]) LOOP
    EXECUTE format('CREATE POLICY "allow_all_select_%s" ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_insert_%s" ON %I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_update_%s" ON %I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_delete_%s" ON %I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cuenta_corriente_cliente ON cuenta_corriente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cuenta_corriente_fecha ON cuenta_corriente(fecha);
CREATE INDEX IF NOT EXISTS idx_cobros_cliente ON cobros(cliente_id);
CREATE INDEX IF NOT EXISTS idx_presentaciones_producto ON presentaciones(producto_id);
CREATE INDEX IF NOT EXISTS idx_producto_proveedores_producto ON producto_proveedores(producto_id);
CREATE INDEX IF NOT EXISTS idx_producto_proveedores_proveedor ON producto_proveedores(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_proveedor_proveedor ON pedidos_proveedor(proveedor_id);

-- Seed subcategorias
INSERT INTO subcategorias (nombre, categoria_id) VALUES
  ('Gaseosas', (SELECT id FROM categorias WHERE nombre='Bebidas')),
  ('Aguas', (SELECT id FROM categorias WHERE nombre='Bebidas')),
  ('Aceites', (SELECT id FROM categorias WHERE nombre='Almacén')),
  ('Harinas', (SELECT id FROM categorias WHERE nombre='Almacén')),
  ('Analgésicos', (SELECT id FROM categorias WHERE nombre='Farmacia')),
  ('Snacks', (SELECT id FROM categorias WHERE nombre='Golosinas')),
  ('Alfajores', (SELECT id FROM categorias WHERE nombre='Golosinas'));

-- Seed marcas
INSERT INTO marcas (nombre) VALUES
  ('Cañuelas'), ('Cocinero'), ('Natura'), ('Premier'), ('San Vicente'),
  ('Cellier'), ('Bayer'), ('Villa Iris'), ('Aguila');

-- Set some stock_maximo values on existing products
UPDATE productos SET stock_maximo = 50 WHERE stock_maximo = 0 OR stock_maximo IS NULL;
UPDATE productos SET stock_minimo = 5 WHERE stock_minimo = 0;

-- Create default presentaciones for existing products
INSERT INTO presentaciones (producto_id, nombre, cantidad, costo, precio)
SELECT id, 'Unidad', 1, costo, precio FROM productos WHERE activo = true
ON CONFLICT DO NOTHING;

-- Add numerador for pedidos
INSERT INTO numeradores (tipo, ultimo_numero) VALUES ('pedido', 0)
ON CONFLICT (tipo) DO NOTHING;

-- Function to recalc client balance
CREATE OR REPLACE FUNCTION recalc_cliente_saldo(p_cliente_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_saldo NUMERIC;
BEGIN
  SELECT COALESCE(SUM(debe) - SUM(haber), 0) INTO v_saldo
  FROM cuenta_corriente WHERE cliente_id = p_cliente_id;

  UPDATE clientes SET saldo = v_saldo WHERE id = p_cliente_id;
  RETURN v_saldo;
END;
$$ LANGUAGE plpgsql;
