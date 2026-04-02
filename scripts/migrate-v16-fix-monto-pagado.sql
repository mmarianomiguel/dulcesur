-- migrate-v16-fix-monto-pagado.sql
-- Recalculate monto_pagado for all ventas based on actual payments,
-- capped at venta.total to avoid double-counting when both sources exist.
--
-- Payment sources:
--   1. caja_movimientos ingreso referencia_tipo='venta'  (direct POS/online payments)
--   2. cobro_items.monto_aplicado  (cobros applied from client management / hoja de ruta)

UPDATE ventas v
SET monto_pagado = LEAST(
  v.total,
  COALESCE(
    (SELECT SUM(cm.monto)
     FROM caja_movimientos cm
     WHERE cm.referencia_id = v.id
       AND cm.referencia_tipo = 'venta'
       AND cm.tipo = 'ingreso'),
    0
  ) + COALESCE(
    (SELECT SUM(ci.monto_aplicado)
     FROM cobro_items ci
     WHERE ci.venta_id = v.id),
    0
  )
)
WHERE v.estado <> 'anulada'
  AND v.tipo_comprobante NOT ILIKE 'Nota de Crédito%'
  AND v.tipo_comprobante NOT ILIKE 'Nota de Débito%';
