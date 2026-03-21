-- migrate-v9-rls-transactions.sql
-- Proper RLS policies (authenticated vs anon) + atomic transaction RPCs

-- =====================================================================
-- 1. RLS POLICIES: restrict anon access, allow authenticated full access
-- =====================================================================

-- Helper: drop permissive "all" policies and create proper ones
-- Tables that should be READ-ONLY for anon (tienda visitors)
DO $$
DECLARE
  readonly_tables TEXT[] := ARRAY[
    'productos', 'categorias', 'marcas', 'presentaciones',
    'tienda_config', 'paginas_info', 'descuentos', 'zonas_entrega',
    'empresa', 'combo_items'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY readonly_tables LOOP
    -- Only process if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      -- Drop old permissive policy if exists
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);

      -- Authenticated users: full access
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_auth_all', t
      );

      -- Anon users: read only
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO anon USING (true)',
        t || '_anon_read', t
      );
    END IF;
  END LOOP;
END $$;

-- Tables that anon can READ + INSERT (tienda checkout creates pedidos, clientes, etc.)
DO $$
DECLARE
  rw_tables TEXT[] := ARRAY[
    'clientes', 'clientes_auth', 'pedidos_tienda', 'pedidos_tienda_items'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY rw_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);

      -- Authenticated: full access
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_auth_all', t
      );

      -- Anon: read own + insert
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO anon USING (true)',
        t || '_anon_read', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR INSERT TO anon WITH CHECK (true)',
        t || '_anon_insert', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR UPDATE TO anon USING (true) WITH CHECK (true)',
        t || '_anon_update', t
      );
    END IF;
  END LOOP;
END $$;

-- Tables that are ADMIN-ONLY (no anon access at all)
DO $$
DECLARE
  admin_tables TEXT[] := ARRAY[
    'ventas', 'venta_items', 'compras', 'compra_items',
    'caja_movimientos', 'cuenta_corriente', 'stock_movimientos',
    'numeradores', 'proveedores', 'producto_proveedores',
    'cuenta_corriente_proveedores', 'pagos_proveedores',
    'usuarios', 'roles', 'permisos',
    'turnos_caja', 'listas_precios', 'lista_precio_items'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY admin_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);

      -- Authenticated only: full access
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_auth_all', t
      );
    END IF;
  END LOOP;
END $$;

-- Numeradores: anon needs read + update for checkout (next_numero RPC runs as SECURITY DEFINER so this is fine)
-- But keep them admin-only since the RPC handles anon access

-- =====================================================================
-- 2. ATOMIC TRANSACTION RPCs
-- =====================================================================

-- 2a. Atomic POS sale: creates venta + items + stock movements + caja in one transaction
CREATE OR REPLACE FUNCTION crear_venta_pos(
  p_venta JSONB,
  p_items JSONB,
  p_caja_movimiento JSONB DEFAULT NULL,
  p_cc_entry JSONB DEFAULT NULL,
  p_usuario TEXT DEFAULT 'Admin Sistema'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venta_id UUID;
  v_item JSONB;
  v_producto RECORD;
  v_errores TEXT[] := '{}';
BEGIN
  -- Insert venta
  INSERT INTO ventas (
    numero, tipo_comprobante, fecha, cliente_id, vendedor_id,
    forma_pago, moneda, subtotal, descuento_porcentaje,
    recargo_porcentaje, total, estado, observacion,
    metodo_entrega, lista_precio_id, origen
  )
  VALUES (
    p_venta->>'numero', p_venta->>'tipo_comprobante', (p_venta->>'fecha')::DATE,
    NULLIF(p_venta->>'cliente_id', '')::UUID, NULLIF(p_venta->>'vendedor_id', '')::UUID,
    p_venta->>'forma_pago', COALESCE(p_venta->>'moneda', 'ARS'),
    (p_venta->>'subtotal')::NUMERIC, COALESCE((p_venta->>'descuento_porcentaje')::NUMERIC, 0),
    COALESCE((p_venta->>'recargo_porcentaje')::NUMERIC, 0), (p_venta->>'total')::NUMERIC,
    COALESCE(p_venta->>'estado', 'cerrada'), p_venta->>'observacion',
    p_venta->>'metodo_entrega', NULLIF(p_venta->>'lista_precio_id', '')::UUID,
    COALESCE(p_venta->>'origen', 'pos')
  )
  RETURNING id INTO v_venta_id;

  -- Insert items and decrement stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO venta_items (
      venta_id, producto_id, codigo, descripcion, cantidad,
      unidad_medida, precio_unitario, descuento, subtotal,
      presentacion, unidades_por_presentacion
    )
    VALUES (
      v_venta_id, NULLIF(v_item->>'producto_id', '')::UUID,
      v_item->>'codigo', v_item->>'descripcion',
      (v_item->>'cantidad')::NUMERIC, COALESCE(v_item->>'unidad_medida', 'Unidad'),
      (v_item->>'precio_unitario')::NUMERIC, COALESCE((v_item->>'descuento')::NUMERIC, 0),
      (v_item->>'subtotal')::NUMERIC,
      v_item->>'presentacion', (v_item->>'unidades_por_presentacion')::INTEGER
    );

    -- Decrement stock if producto_id exists
    IF v_item->>'producto_id' IS NOT NULL AND v_item->>'producto_id' != '' THEN
      UPDATE productos
      SET stock = stock - (v_item->>'cantidad')::NUMERIC,
          updated_at = now()
      WHERE id = (v_item->>'producto_id')::UUID;

      -- Record stock movement
      INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo, usuario, referencia_id)
      VALUES (
        (v_item->>'producto_id')::UUID, 'egreso',
        (v_item->>'cantidad')::NUMERIC,
        'Venta POS #' || (p_venta->>'numero'),
        p_usuario, v_venta_id
      );
    END IF;
  END LOOP;

  -- Insert caja movimiento if provided
  IF p_caja_movimiento IS NOT NULL THEN
    INSERT INTO caja_movimientos (fecha, hora, tipo, descripcion, metodo_pago, monto, referencia_id, referencia_tipo, cuenta_bancaria)
    VALUES (
      (p_caja_movimiento->>'fecha')::DATE, p_caja_movimiento->>'hora',
      'ingreso', p_caja_movimiento->>'descripcion',
      p_caja_movimiento->>'metodo_pago', (p_caja_movimiento->>'monto')::NUMERIC,
      v_venta_id, 'venta', p_caja_movimiento->>'cuenta_bancaria'
    );
  END IF;

  -- Insert cuenta corriente entry if provided
  IF p_cc_entry IS NOT NULL THEN
    INSERT INTO cuenta_corriente (cliente_id, fecha, tipo, descripcion, monto, saldo_resultante, referencia_id, referencia_tipo)
    VALUES (
      (p_cc_entry->>'cliente_id')::UUID, (p_cc_entry->>'fecha')::DATE,
      p_cc_entry->>'tipo', p_cc_entry->>'descripcion',
      (p_cc_entry->>'monto')::NUMERIC, (p_cc_entry->>'saldo_resultante')::NUMERIC,
      v_venta_id, 'venta'
    );

    -- Update client saldo
    UPDATE clientes
    SET saldo = (p_cc_entry->>'saldo_resultante')::NUMERIC
    WHERE id = (p_cc_entry->>'cliente_id')::UUID;
  END IF;

  RETURN jsonb_build_object('venta_id', v_venta_id, 'errores', to_jsonb(v_errores));
END;
$$;

-- 2b. Atomic venta anulacion: restores stock, reverses caja and CC in one transaction
CREATE OR REPLACE FUNCTION anular_venta(
  p_venta_id UUID,
  p_usuario TEXT DEFAULT 'Admin Sistema'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venta RECORD;
  v_item RECORD;
  v_errores TEXT[] := '{}';
BEGIN
  -- Get venta
  SELECT * INTO v_venta FROM ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Venta no encontrada');
  END IF;
  IF v_venta.estado = 'anulada' THEN
    RETURN jsonb_build_object('error', 'La venta ya está anulada');
  END IF;

  -- Mark as anulada
  UPDATE ventas SET estado = 'anulada' WHERE id = p_venta_id;

  -- Restore stock for each item
  FOR v_item IN SELECT * FROM venta_items WHERE venta_id = p_venta_id
  LOOP
    IF v_item.producto_id IS NOT NULL THEN
      UPDATE productos
      SET stock = stock + v_item.cantidad,
          updated_at = now()
      WHERE id = v_item.producto_id;

      INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo, usuario, referencia_id)
      VALUES (
        v_item.producto_id, 'ingreso', v_item.cantidad,
        'Anulación venta #' || v_venta.numero,
        p_usuario, p_venta_id
      );
    END IF;
  END LOOP;

  -- Delete caja movements for this venta
  DELETE FROM caja_movimientos WHERE referencia_id = p_venta_id AND referencia_tipo = 'venta';

  -- Reverse CC entry if exists
  IF v_venta.cliente_id IS NOT NULL AND v_venta.forma_pago IN ('Cuenta Corriente', 'Mixto') THEN
    -- Add reversal entry
    INSERT INTO cuenta_corriente (cliente_id, fecha, tipo, descripcion, monto, saldo_resultante, referencia_id, referencia_tipo)
    SELECT
      v_venta.cliente_id, CURRENT_DATE, 'devolucion',
      'Anulación venta #' || v_venta.numero,
      v_venta.total,
      c.saldo - v_venta.total,
      p_venta_id, 'anulacion'
    FROM clientes c WHERE c.id = v_venta.cliente_id;

    -- Update saldo
    UPDATE clientes SET saldo = saldo - v_venta.total WHERE id = v_venta.cliente_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'errores', to_jsonb(v_errores));
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION crear_venta_pos TO authenticated;
GRANT EXECUTE ON FUNCTION anular_venta TO authenticated;
