import { NextResponse } from "next/server";
// @ts-ignore
import { Client } from "pg";

export async function POST(req: Request) {
  const secret = req.headers.get("x-pull-secret");
  if (secret !== process.env.PULL_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const client = new Client({
    connectionString: `postgresql://postgres.${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace("https://", "").replace(".supabase.co", "")}:${process.env.SUPABASE_DB_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  });

  try {
    await client.connect();

    // Create atomic stock deduction function
    await client.query(`
      CREATE OR REPLACE FUNCTION decrementar_stock_venta(
        p_items JSONB,
        p_referencia TEXT,
        p_usuario TEXT,
        p_orden_id UUID DEFAULT NULL
      ) RETURNS JSONB AS $$
      DECLARE
        item JSONB;
        v_stock_actual NUMERIC;
        v_stock_nuevo NUMERIC;
        v_producto_id UUID;
        v_cantidad NUMERIC;
        v_descripcion TEXT;
        v_faltantes JSONB := '[]'::JSONB;
      BEGIN
        -- First pass: lock all rows and validate stock
        FOR item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
          v_producto_id := (item->>'producto_id')::UUID;
          v_cantidad := (item->>'cantidad')::NUMERIC;
          v_descripcion := COALESCE(item->>'descripcion', '');

          -- Lock the row with FOR UPDATE to prevent concurrent modifications
          SELECT stock INTO v_stock_actual
          FROM productos
          WHERE id = v_producto_id
          FOR UPDATE;

          IF NOT FOUND THEN
            v_faltantes := v_faltantes || jsonb_build_object(
              'producto_id', v_producto_id,
              'error', 'Producto no encontrado',
              'descripcion', v_descripcion
            );
            CONTINUE;
          END IF;

          v_stock_nuevo := v_stock_actual - v_cantidad;

          IF v_stock_nuevo < 0 THEN
            v_faltantes := v_faltantes || jsonb_build_object(
              'producto_id', v_producto_id,
              'error', 'Stock insuficiente',
              'stock_disponible', v_stock_actual,
              'cantidad_pedida', v_cantidad,
              'descripcion', v_descripcion
            );
          END IF;
        END LOOP;

        -- If any item has insufficient stock, abort entire transaction
        IF jsonb_array_length(v_faltantes) > 0 THEN
          RETURN jsonb_build_object('ok', false, 'faltantes', v_faltantes);
        END IF;

        -- Second pass: all validated, now decrement and log
        FOR item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
          v_producto_id := (item->>'producto_id')::UUID;
          v_cantidad := (item->>'cantidad')::NUMERIC;
          v_descripcion := COALESCE(item->>'descripcion', '');

          SELECT stock INTO v_stock_actual
          FROM productos
          WHERE id = v_producto_id
          FOR UPDATE;

          v_stock_nuevo := v_stock_actual - v_cantidad;

          UPDATE productos SET stock = v_stock_nuevo WHERE id = v_producto_id;

          INSERT INTO stock_movimientos (
            producto_id, tipo, cantidad_antes, cantidad_despues,
            cantidad, referencia, descripcion, usuario, orden_id
          ) VALUES (
            v_producto_id, 'venta', v_stock_actual, v_stock_nuevo,
            v_cantidad, p_referencia, v_descripcion, p_usuario, p_orden_id
          );
        END LOOP;

        RETURN jsonb_build_object('ok', true);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.end();
    return NextResponse.json({ ok: true, message: "Funcion decrementar_stock_venta creada correctamente" });
  } catch (err: any) {
    try { await client.end(); } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
