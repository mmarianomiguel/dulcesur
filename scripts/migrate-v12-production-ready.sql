-- migrate-v12-production-ready.sql
-- Production readiness: atomic stock RPC + database cleanup

-- =====================================================================
-- 1. ATOMIC STOCK DECREMENT RPC (prevents race conditions)
-- =====================================================================

-- This function atomically decrements stock for multiple products in a single transaction.
-- Used by POS when finalizing a sale. Logs all stock movements.
CREATE OR REPLACE FUNCTION decrementar_stock_venta(
  p_items JSONB,
  p_referencia TEXT,
  p_usuario TEXT,
  p_orden_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  item JSONB;
  v_producto_id UUID;
  v_cantidad NUMERIC;
  v_descripcion TEXT;
  v_stock_antes NUMERIC;
  v_stock_despues NUMERIC;
  v_all_ok BOOLEAN := true;
  v_insufficient TEXT[] := '{}';
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (item->>'producto_id')::UUID;
    v_cantidad := (item->>'cantidad')::NUMERIC;
    v_descripcion := COALESCE(item->>'descripcion', '');

    -- Get current stock with row lock to prevent race conditions
    SELECT stock INTO v_stock_antes
    FROM productos
    WHERE id = v_producto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_stock_despues := v_stock_antes - v_cantidad;

    -- Track insufficient stock but still allow (POS has "facturar igual" option)
    IF v_stock_despues < 0 THEN
      v_all_ok := false;
      v_insufficient := array_append(v_insufficient, v_producto_id::TEXT);
    END IF;

    -- Update stock
    UPDATE productos SET stock = v_stock_despues WHERE id = v_producto_id;

    -- Log stock movement
    INSERT INTO stock_movimientos (
      producto_id, tipo, cantidad, cantidad_antes, cantidad_despues,
      referencia, descripcion, usuario, orden_id
    ) VALUES (
      v_producto_id, 'Venta', -v_cantidad, v_stock_antes, v_stock_despues,
      p_referencia, v_descripcion, p_usuario, p_orden_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', v_all_ok,
    'insufficient', to_jsonb(v_insufficient)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 1b. UNIQUE CONSTRAINT on ventas.numero (prevent duplicate receipt numbers)
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS ventas_numero_unique ON ventas(numero);

-- =====================================================================
-- 2. CLEANUP: Remove test data from migrate.sql seed inserts
-- =====================================================================
-- IMPORTANT: Only run this section if you want to wipe ALL existing data
-- and start fresh. Comment out if you want to keep current data.

-- Uncomment the block below to wipe test data:
/*
-- Delete in correct order (respecting foreign keys)
DELETE FROM stock_movimientos;
DELETE FROM cuenta_corriente;
DELETE FROM caja_movimientos;
DELETE FROM venta_items;
DELETE FROM ventas;
DELETE FROM compra_items;
DELETE FROM compras;
DELETE FROM pedido_tienda_items;
DELETE FROM pedidos_tienda;
DELETE FROM pedido_proveedor_items;
DELETE FROM pedidos_proveedor;
DELETE FROM combo_items;
DELETE FROM presentaciones;
DELETE FROM vendedor_categorias_excluidas;
DELETE FROM descuentos;
DELETE FROM backups;

-- Reset numeradores to start from 1
UPDATE numeradores SET ultimo_numero = 0;

-- Reset all product stock to 0
UPDATE productos SET stock = 0;

-- Reset all client balances to 0
UPDATE clientes SET saldo = 0;

-- Reset all provider balances to 0
UPDATE proveedores SET saldo = 0;
*/

-- =====================================================================
-- 3. DATA INTEGRITY CHECKS (run these to verify your data is clean)
-- =====================================================================

-- Find orphan venta_items (no matching venta)
-- SELECT vi.id, vi.venta_id FROM venta_items vi LEFT JOIN ventas v ON v.id = vi.venta_id WHERE v.id IS NULL;

-- Find orphan compra_items (no matching compra)
-- SELECT ci.id, ci.compra_id FROM compra_items ci LEFT JOIN compras c ON c.id = ci.compra_id WHERE c.id IS NULL;

-- Find products with NULL precio or costo
-- SELECT id, nombre, precio, costo FROM productos WHERE precio IS NULL OR costo IS NULL OR precio <= 0;

-- Find stock_movimientos with mismatched antes/despues
-- SELECT id, producto_id, cantidad, cantidad_antes, cantidad_despues
-- FROM stock_movimientos
-- WHERE cantidad_antes + cantidad != cantidad_despues;
