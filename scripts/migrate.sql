-- =============================================
-- DULCESUR - Database Schema Migration
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. EMPRESA (Company settings)
-- =============================================
CREATE TABLE IF NOT EXISTS empresa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  razon_social TEXT,
  cuit TEXT,
  situacion_iva TEXT DEFAULT 'Responsable Inscripto',
  domicilio TEXT,
  telefono TEXT,
  email TEXT,
  punto_venta TEXT DEFAULT '00001',
  tipo_comprobante_default TEXT DEFAULT 'Remito X',
  lista_precios_default TEXT DEFAULT 'Contado',
  moneda_default TEXT DEFAULT 'ARS',
  formato_ticket TEXT DEFAULT '58mm',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 2. USUARIOS
-- =============================================
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  email TEXT,
  rol TEXT DEFAULT 'vendedor',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 3. CATEGORIAS
-- =============================================
CREATE TABLE IF NOT EXISTS categorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 4. PRODUCTOS
-- =============================================
CREATE TABLE IF NOT EXISTS productos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  stock INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 0,
  precio NUMERIC(12,2) DEFAULT 0,
  costo NUMERIC(12,2) DEFAULT 0,
  unidad_medida TEXT DEFAULT 'UN',
  activo BOOLEAN DEFAULT true,
  fecha_actualizacion TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 5. CLIENTES
-- =============================================
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  tipo_documento TEXT,
  numero_documento TEXT,
  cuit TEXT,
  situacion_iva TEXT DEFAULT 'Consumidor final',
  tipo_factura TEXT,
  razon_social TEXT,
  domicilio TEXT,
  domicilio_comercial TEXT,
  domicilio_fiscal TEXT,
  telefono TEXT,
  email TEXT,
  provincia TEXT,
  localidad TEXT,
  codigo_postal TEXT,
  observacion TEXT,
  fecha_nacimiento DATE,
  saldo NUMERIC(12,2) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 6. PROVEEDORES
-- =============================================
CREATE TABLE IF NOT EXISTS proveedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  cuit TEXT,
  telefono TEXT,
  email TEXT,
  domicilio TEXT,
  rubro TEXT,
  saldo NUMERIC(12,2) DEFAULT 0,
  observacion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 7. VENTAS (header)
-- =============================================
CREATE TABLE IF NOT EXISTS ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero TEXT NOT NULL,
  tipo_comprobante TEXT DEFAULT 'Remito X',
  fecha DATE DEFAULT CURRENT_DATE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  vendedor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  forma_pago TEXT DEFAULT 'Efectivo',
  moneda TEXT DEFAULT 'ARS',
  subtotal NUMERIC(12,2) DEFAULT 0,
  descuento_porcentaje NUMERIC(5,2) DEFAULT 0,
  recargo_porcentaje NUMERIC(5,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  estado TEXT DEFAULT 'cerrada',
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 8. VENTA_ITEMS (line items)
-- =============================================
CREATE TABLE IF NOT EXISTS venta_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
  codigo TEXT,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(10,2) DEFAULT 1,
  unidad_medida TEXT DEFAULT 'UN',
  precio_unitario NUMERIC(12,2) NOT NULL,
  descuento NUMERIC(5,2) DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 9. COMPRAS (header)
-- =============================================
CREATE TABLE IF NOT EXISTS compras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero TEXT NOT NULL,
  fecha DATE DEFAULT CURRENT_DATE,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  estado TEXT DEFAULT 'Confirmada',
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 10. COMPRA_ITEMS
-- =============================================
CREATE TABLE IF NOT EXISTS compra_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compra_id UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
  codigo TEXT,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(10,2) DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 11. CAJA_MOVIMIENTOS
-- =============================================
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha DATE DEFAULT CURRENT_DATE,
  hora TIME DEFAULT CURRENT_TIME,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  descripcion TEXT NOT NULL,
  metodo_pago TEXT DEFAULT 'Efectivo',
  monto NUMERIC(12,2) NOT NULL,
  referencia_id UUID,
  referencia_tipo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 12. NUMERADORES (auto-increment voucher numbers)
-- =============================================
CREATE TABLE IF NOT EXISTS numeradores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT NOT NULL UNIQUE,
  punto_venta TEXT DEFAULT '00001',
  ultimo_numero INTEGER DEFAULT 0
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_clientes_cuit ON clientes(cuit);
CREATE INDEX IF NOT EXISTS idx_proveedores_nombre ON proveedores(nombre);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(fecha);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_fecha ON caja_movimientos(fecha);

-- =============================================
-- RLS Policies (allow all for now - open access)
-- =============================================
ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE numeradores ENABLE ROW LEVEL SECURITY;

-- Allow anon full access (for dev - tighten in production)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'empresa','usuarios','categorias','productos','clientes',
    'proveedores','ventas','venta_items','compras','compra_items',
    'caja_movimientos','numeradores'
  ]) LOOP
    EXECUTE format('CREATE POLICY "allow_all_select_%s" ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_insert_%s" ON %I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_update_%s" ON %I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "allow_all_delete_%s" ON %I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;

-- =============================================
-- SEED DATA
-- =============================================

-- Empresa
INSERT INTO empresa (nombre, razon_social, cuit, domicilio, telefono)
VALUES ('DulceSur', 'DulceSur SRL', '30-71234567-9', 'Av. Principal 1234', '351-4441122');

-- Usuario
INSERT INTO usuarios (nombre, email, rol)
VALUES ('Mariano Miguel', 'mariano@dulcesur.com', 'admin');

-- Categorias
INSERT INTO categorias (nombre) VALUES
  ('Bebidas'), ('Almacén'), ('Farmacia'), ('Golosinas'), ('Limpieza');

-- Numeradores
INSERT INTO numeradores (tipo, ultimo_numero) VALUES
  ('venta', 13258),
  ('compra', 5);

-- Cliente default
INSERT INTO clientes (nombre, situacion_iva) VALUES ('Consumidor Final', 'Consumidor final');

-- Productos (sample from Enexpro)
INSERT INTO productos (codigo, nombre, categoria_id, stock, precio, fecha_actualizacion) VALUES
  ('30974', '7Up 500ml x6 Un', (SELECT id FROM categorias WHERE nombre='Bebidas'), 0, 4800, '2025-07-23'),
  ('7792180001641', 'Aceite Cañuelas Girasol 900ml', (SELECT id FROM categorias WHERE nombre='Almacén'), 0, 2400, '2025-06-21'),
  ('7790070012050', 'Aceite Cocinero Girasol 900ml', (SELECT id FROM categorias WHERE nombre='Almacén'), 0, 2200, '2025-06-21'),
  ('7798316700808', 'Aceite Legitimo Girasol 900ml', (SELECT id FROM categorias WHERE nombre='Almacén'), 0, 2000, '2025-06-21'),
  ('7790070231468', 'Aceite Lira Girasol 900ml', (SELECT id FROM categorias WHERE nombre='Almacén'), 0, 2200, '2025-08-27'),
  ('7790272001005', 'Aceite Natura Girasol 900ml', (SELECT id FROM categorias WHERE nombre='Almacén'), 0, 2700, '2025-09-22'),
  ('7798382460057', 'Aceite Premier Girasol 900ml', (SELECT id FROM categorias WHERE nombre='Almacén'), 18, 2200, '2026-02-23'),
  ('7792012000392', 'Aceite San Vicente Girasol 900ml', (SELECT id FROM categorias WHERE nombre='Almacén'), 83, 2200, '2026-01-24'),
  ('AN001', 'Actron 400 x10 comp', (SELECT id FROM categorias WHERE nombre='Farmacia'), 10, 3050, '2026-02-05'),
  ('AN002', 'Actron 600 x10 comp', (SELECT id FROM categorias WHERE nombre='Farmacia'), 20, 6900, '2026-03-02'),
  ('AN003', 'Actron Mujer x10 comp', (SELECT id FROM categorias WHERE nombre='Farmacia'), 3, 3300, '2026-02-26'),
  ('AN004', 'Actron plus x8 comp', (SELECT id FROM categorias WHERE nombre='Farmacia'), 4, 3400, '2025-09-15'),
  ('11239545', 'Agua Cellier 12x600ml', (SELECT id FROM categorias WHERE nombre='Bebidas'), 12, 8100, '2026-03-10'),
  ('11239', 'Agua Cellier x2L', (SELECT id FROM categorias WHERE nombre='Bebidas'), 7, 5250, '2026-03-10'),
  ('AN052', 'Agua oxigenada vol 10 x UN', (SELECT id FROM categorias WHERE nombre='Farmacia'), 23, 450, '2025-05-27'),
  ('7793049100246', 'Alcohol Villa Iris 500ml', (SELECT id FROM categorias WHERE nombre='Limpieza'), 23, 1650, '2026-02-21'),
  ('7790040133570', 'Alfajor Aguila Blanco Triple', (SELECT id FROM categorias WHERE nombre='Golosinas'), 21, 1190, '2025-12-29');

-- Clientes
INSERT INTO clientes (nombre, cuit, situacion_iva, telefono, email, saldo) VALUES
  ('María López', '20-34567890-1', 'Responsable Inscripto', '351-4567890', 'maria@email.com', 45200),
  ('Juan Pérez', '20-12345678-9', 'Monotributista', '351-1234567', 'juan@email.com', 0),
  ('Ana García', '27-98765432-1', 'Responsable Inscripto', '351-9876543', 'ana@empresa.com', 128500),
  ('Carlos Ruiz', '20-11223344-5', 'Consumidor final', '351-5544332', 'carlos@email.com', 0),
  ('Distribuidora Norte SRL', '30-71234567-9', 'Responsable Inscripto', '351-4443322', 'admin@distnorte.com', 810280);

-- Proveedores
INSERT INTO proveedores (nombre, cuit, telefono, email, saldo, rubro) VALUES
  ('Distribuidora Central', '30-71234567-9', '351-4441122', 'ventas@distcentral.com', 450000, 'Almacén'),
  ('Bebidas del Sur', '30-72345678-1', '351-4443344', 'pedidos@bebidasur.com', 280000, 'Bebidas'),
  ('Droguería Farma', '30-73456789-2', '351-4445566', 'ventas@farma.com', 120880, 'Farmacia'),
  ('Golosinas Express', '30-74567890-3', '351-4447788', 'info@goloexpress.com', 0, 'Golosinas'),
  ('Limpieza Total SA', '30-75678901-4', '351-4449900', 'ventas@limpiezatotal.com', 319000, 'Limpieza');

-- Compras sample
INSERT INTO compras (numero, fecha, proveedor_id, total, estado) VALUES
  ('C-0001', '2026-03-12', (SELECT id FROM proveedores WHERE nombre='Distribuidora Central'), 185400, 'Confirmada'),
  ('C-0002', '2026-03-10', (SELECT id FROM proveedores WHERE nombre='Bebidas del Sur'), 312000, 'Confirmada'),
  ('C-0003', '2026-03-08', (SELECT id FROM proveedores WHERE nombre='Droguería Farma'), 94500, 'Pendiente'),
  ('C-0004', '2026-03-05', (SELECT id FROM proveedores WHERE nombre='Golosinas Express'), 78200, 'Confirmada'),
  ('C-0005', '2026-03-01', (SELECT id FROM proveedores WHERE nombre='Limpieza Total SA'), 156000, 'Confirmada');

-- Caja movimientos sample
INSERT INTO caja_movimientos (fecha, hora, tipo, descripcion, metodo_pago, monto) VALUES
  ('2026-03-15', '09:00', 'ingreso', 'Apertura de caja', 'Efectivo', 50000),
  ('2026-03-15', '10:30', 'egreso', 'Gasto - Flete', 'Efectivo', -8500),
  ('2026-03-15', '10:55', 'ingreso', 'Venta #00013254', 'Efectivo', 6800),
  ('2026-03-15', '11:20', 'ingreso', 'Venta #00013255', 'Tarjeta', 43100),
  ('2026-03-15', '12:00', 'egreso', 'Pago proveedor - Droguería Farma', 'Transferencia', -45000),
  ('2026-03-15', '12:40', 'ingreso', 'Venta #00013256', 'Efectivo', 9200),
  ('2026-03-15', '13:15', 'ingreso', 'Venta #00013257', 'Transferencia', 28750),
  ('2026-03-15', '14:32', 'ingreso', 'Venta #00013258', 'Efectivo', 15400);

-- Function to get next voucher number
CREATE OR REPLACE FUNCTION next_numero(p_tipo TEXT)
RETURNS TEXT AS $$
DECLARE
  v_num INTEGER;
  v_pv TEXT;
BEGIN
  UPDATE numeradores
  SET ultimo_numero = ultimo_numero + 1
  WHERE tipo = p_tipo
  RETURNING ultimo_numero, punto_venta INTO v_num, v_pv;

  RETURN v_pv || '-' || LPAD(v_num::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;
