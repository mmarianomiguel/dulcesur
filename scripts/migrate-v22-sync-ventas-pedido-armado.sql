-- V22: Sincronización bidireccional ventas ↔ pedido_armado
-- Antes: cada call site del admin tenía que recordar actualizar pedido_armado, y a veces
-- lo olvidaba (listado/page.tsx tenía 4 sitios que solo actualizaban ventas.estado).
-- Igual al revés desde la app del armador en /equipo.
-- Ahora: triggers DB garantizan que cualquier cambio se propaga automáticamente.

-- ──────────────────────────────────────────
-- Trigger 1: ventas.estado → pedido_armado
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_ventas_to_pedido_armado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  -- Admin marcó armado o entregado → upsert pedido_armado como 'listo' (sin degradar)
  IF NEW.estado IN ('armado', 'entregado') THEN
    INSERT INTO pedido_armado (venta_id, estado, fin_armado_at, aprobado_at, updated_at)
    VALUES (NEW.id, 'listo', COALESCE(now(), now()), now(), now())
    ON CONFLICT (venta_id) DO UPDATE
      SET estado = 'listo',
          fin_armado_at = COALESCE(pedido_armado.fin_armado_at, EXCLUDED.fin_armado_at),
          aprobado_at = COALESCE(pedido_armado.aprobado_at, EXCLUDED.aprobado_at),
          updated_at = now()
      WHERE pedido_armado.estado != 'listo';
    RETURN NEW;
  END IF;

  -- Anulada/cancelado → eliminar fila del tablero del armador
  IF NEW.estado IN ('anulada', 'cancelado') THEN
    DELETE FROM pedido_armado WHERE venta_id = NEW.id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_ventas_to_pedido_armado ON ventas;
CREATE TRIGGER trg_sync_ventas_to_pedido_armado
AFTER UPDATE OF estado ON ventas
FOR EACH ROW
EXECUTE FUNCTION sync_ventas_to_pedido_armado();

-- ──────────────────────────────────────────
-- Trigger 2: pedido_armado.estado → ventas
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_pedido_armado_to_ventas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  -- Armador marcó armado o listo → ventas.estado = 'armado' (si no está ya entregado)
  IF NEW.estado IN ('armado', 'listo') THEN
    UPDATE ventas SET estado = 'armado'
     WHERE id = NEW.venta_id AND estado IN ('pendiente', 'cerrada');
    RETURN NEW;
  END IF;

  -- Vuelve a pendiente/armando desde listo/armado → revertir ventas a pendiente
  IF NEW.estado IN ('pendiente', 'armando') AND OLD.estado IN ('armado', 'listo') THEN
    UPDATE ventas SET estado = 'pendiente'
     WHERE id = NEW.venta_id AND estado = 'armado';
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_pedido_armado_to_ventas ON pedido_armado;
CREATE TRIGGER trg_sync_pedido_armado_to_ventas
AFTER UPDATE OF estado ON pedido_armado
FOR EACH ROW
EXECUTE FUNCTION sync_pedido_armado_to_ventas();

-- ──────────────────────────────────────────
-- Backfill: ventas armadas/entregadas sin fila pedido_armado
-- ──────────────────────────────────────────
INSERT INTO pedido_armado (venta_id, estado, fin_armado_at, aprobado_at, updated_at)
SELECT v.id, 'listo', v.created_at, v.created_at, now()
FROM ventas v
LEFT JOIN pedido_armado pa ON pa.venta_id = v.id
WHERE v.estado IN ('armado', 'entregado') AND pa.id IS NULL
ON CONFLICT (venta_id) DO NOTHING;
