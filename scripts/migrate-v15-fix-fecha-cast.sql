-- migrate-v15-fix-fecha-cast.sql
-- Fix: p_fecha TEXT → explicit ::date cast to avoid "column is of type date but expression is of type text"
-- Fix: existing saldo-allocation CC haber entries with wrong venta_id (Norma Maidana case + similar)

-- ============================================================
-- 1. FIX atomic_register_cobro_v2 — add ::date casts
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_register_cobro_v2(
  p_client_id UUID,
  p_monto NUMERIC,
  p_forma_pago TEXT,
  p_observacion TEXT,
  p_fecha TEXT,
  p_hora TEXT,
  p_cuenta_bancaria_id UUID,
  p_cuenta_bancaria_nombre TEXT,
  p_allocations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_saldo NUMERIC;
  v_cobro_id UUID;
  v_numero TEXT;
  v_alloc JSONB;
  v_venta_id UUID;
  v_monto_aplicado NUMERIC;
BEGIN
  SELECT next_numero('cobro') INTO v_numero;

  UPDATE clientes
  SET saldo = saldo - p_monto, updated_at = now()
  WHERE id = p_client_id
  RETURNING saldo INTO v_new_saldo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente % no encontrado', p_client_id;
  END IF;

  INSERT INTO cobros (id, numero, cliente_id, fecha, hora, monto, forma_pago, observacion, cuenta_bancaria_id, estado)
  VALUES (gen_random_uuid(), v_numero, p_client_id, p_fecha::date, p_hora, p_monto, p_forma_pago, p_observacion, p_cuenta_bancaria_id, 'aplicado')
  RETURNING id INTO v_cobro_id;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_venta_id := (v_alloc->>'venta_id')::UUID;
    v_monto_aplicado := (v_alloc->>'monto_aplicado')::NUMERIC;

    INSERT INTO cobro_items (cobro_id, venta_id, monto_aplicado)
    VALUES (v_cobro_id, v_venta_id, v_monto_aplicado);

    UPDATE ventas
    SET monto_pagado = COALESCE(monto_pagado, 0) + v_monto_aplicado
    WHERE id = v_venta_id;
  END LOOP;

  INSERT INTO cuenta_corriente (cliente_id, fecha, comprobante, descripcion, debe, haber, saldo, forma_pago, venta_id)
  VALUES (p_client_id, p_fecha::date, v_numero, 'Cobro - ' || p_forma_pago, 0, p_monto, v_new_saldo, p_forma_pago, NULL);

  INSERT INTO caja_movimientos (fecha, hora, tipo, descripcion, metodo_pago, monto, referencia_id, referencia_tipo, cuenta_bancaria)
  VALUES (
    p_fecha::date, p_hora, 'ingreso',
    'Cobro ' || v_numero || ' — ' || (SELECT nombre FROM clientes WHERE id = p_client_id) ||
      CASE WHEN p_cuenta_bancaria_nombre IS NOT NULL THEN ' → ' || p_cuenta_bancaria_nombre ELSE '' END,
    p_forma_pago, p_monto, v_cobro_id, 'cobro',
    p_cuenta_bancaria_nombre
  );

  RETURN jsonb_build_object(
    'cobro_id', v_cobro_id,
    'numero', v_numero,
    'nuevo_saldo', v_new_saldo
  );
END;
$$;

-- ============================================================
-- 2. FIX atomic_register_pago_proveedor — add ::date casts
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_register_pago_proveedor(
  p_proveedor_id UUID,
  p_monto NUMERIC,
  p_forma_pago TEXT,
  p_observacion TEXT,
  p_fecha TEXT,
  p_hora TEXT,
  p_cuenta_bancaria_id UUID,
  p_cuenta_bancaria_nombre TEXT,
  p_registrar_caja BOOLEAN,
  p_allocations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_saldo NUMERIC;
  v_pago_id UUID;
  v_numero TEXT;
  v_alloc JSONB;
  v_compra_id UUID;
  v_monto_aplicado NUMERIC;
  v_nuevo_pagado NUMERIC;
  v_compra_total NUMERIC;
BEGIN
  SELECT next_numero('orden_pago') INTO v_numero;

  UPDATE proveedores
  SET saldo = saldo - p_monto, updated_at = now()
  WHERE id = p_proveedor_id
  RETURNING saldo INTO v_new_saldo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor % no encontrado', p_proveedor_id;
  END IF;

  INSERT INTO pagos_proveedores (id, numero, proveedor_id, fecha, monto, forma_pago, observacion, cuenta_bancaria_id)
  VALUES (gen_random_uuid(), v_numero, p_proveedor_id, p_fecha::date, p_monto, p_forma_pago, p_observacion, p_cuenta_bancaria_id)
  RETURNING id INTO v_pago_id;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_compra_id := (v_alloc->>'compra_id')::UUID;
    v_monto_aplicado := (v_alloc->>'monto_aplicado')::NUMERIC;

    INSERT INTO pago_proveedor_items (pago_id, compra_id, monto_aplicado)
    VALUES (v_pago_id, v_compra_id, v_monto_aplicado);

    UPDATE compras
    SET monto_pagado = COALESCE(monto_pagado, 0) + v_monto_aplicado,
        estado_pago = CASE
          WHEN COALESCE(monto_pagado, 0) + v_monto_aplicado >= total THEN 'Pagada'
          ELSE 'Pago Parcial'
        END
    WHERE id = v_compra_id;
  END LOOP;

  INSERT INTO cuenta_corriente_proveedor (proveedor_id, fecha, tipo, descripcion, monto, saldo_resultante, referencia_id, referencia_tipo)
  VALUES (p_proveedor_id, p_fecha::date, 'pago', 'Pago ' || v_numero || ' - ' || p_forma_pago, p_monto, v_new_saldo, v_pago_id, 'pago');

  IF p_registrar_caja AND p_forma_pago <> 'Cuenta Corriente' THEN
    INSERT INTO caja_movimientos (fecha, hora, tipo, descripcion, metodo_pago, monto, referencia_id, referencia_tipo, cuenta_bancaria)
    VALUES (
      p_fecha::date, p_hora, 'egreso',
      'Pago ' || v_numero || ' — ' || (SELECT nombre FROM proveedores WHERE id = p_proveedor_id) ||
        CASE WHEN p_cuenta_bancaria_nombre IS NOT NULL THEN ' → ' || p_cuenta_bancaria_nombre ELSE '' END,
      p_forma_pago, -p_monto, v_pago_id, 'pago_proveedor',
      p_cuenta_bancaria_nombre
    );
  END IF;

  RETURN jsonb_build_object(
    'pago_id', v_pago_id,
    'numero', v_numero,
    'nuevo_saldo', v_new_saldo
  );
END;
$$;

-- ============================================================
-- 3. FIX existing saldo-allocation CC haber entries with wrong venta_id
--    (entries like "Cobro saldo entrega" / "Cobro deuda anterior" that were
--     incorrectly linked to the paying venta instead of NULL)
-- ============================================================
UPDATE cuenta_corriente cc
SET venta_id = NULL
WHERE cc.haber > 0
  AND cc.venta_id IS NOT NULL
  AND (
    cc.comprobante ILIKE '%cobro saldo%'
    OR cc.descripcion ILIKE '%deuda anterior%'
  )
  AND EXISTS (
    SELECT 1 FROM caja_movimientos cm
    WHERE cm.referencia_id = cc.venta_id
      AND cm.referencia_tipo = 'venta'
      AND cm.tipo = 'ingreso'
  );
