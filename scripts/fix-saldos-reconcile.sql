-- fix-saldos-reconcile.sql
-- Reconcile client saldos from actual transactions.
--
-- RULE: saldo = totalFacturado - totalPagado
--   totalFacturado = SUM(ventas.total where CC/Mixto/Pendiente) - SUM(notas_credito.total)
--   totalPagado = SUM(caja_movimientos where cobro_saldo) + SUM(cobro_items.monto_aplicado)
--                 + any direct monto_pagado on CC ventas
--
-- This script recalculates saldo for EVERY client and fixes mismatches.
-- Run this AFTER deploying the code fixes.

-- =====================================================================
-- STEP 1: DIAGNOSTIC — Show current vs calculated saldo for each client
-- =====================================================================

-- View: what each client's saldo SHOULD be based on actual transactions
-- Formula: saldo = SUM(debe) - SUM(haber) from cuenta_corriente
-- This is the ledger-based recalculation.

WITH ledger_saldo AS (
  SELECT
    cliente_id,
    COALESCE(SUM(debe), 0) - COALESCE(SUM(haber), 0) AS saldo_calculado
  FROM cuenta_corriente
  GROUP BY cliente_id
),
current_saldo AS (
  SELECT id, nombre, saldo AS saldo_actual
  FROM clientes
  WHERE saldo IS NOT NULL AND saldo != 0
),
mismatches AS (
  SELECT
    c.id,
    c.nombre,
    c.saldo_actual,
    COALESCE(l.saldo_calculado, 0) AS saldo_calculado,
    c.saldo_actual - COALESCE(l.saldo_calculado, 0) AS diferencia
  FROM current_saldo c
  LEFT JOIN ledger_saldo l ON l.cliente_id = c.id
  WHERE ABS(c.saldo_actual - COALESCE(l.saldo_calculado, 0)) > 0.01
)
SELECT * FROM mismatches ORDER BY ABS(diferencia) DESC;

-- =====================================================================
-- STEP 2: FIX — Recalculate saldo from cuenta_corriente ledger
-- =====================================================================

-- This updates clientes.saldo to match the sum of debe-haber in cuenta_corriente.
-- cuenta_corriente IS the source of truth for CC operations.

UPDATE clientes c
SET saldo = COALESCE(sub.saldo_real, 0),
    updated_at = now()
FROM (
  SELECT
    cliente_id,
    SUM(debe) - SUM(haber) AS saldo_real
  FROM cuenta_corriente
  GROUP BY cliente_id
) sub
WHERE c.id = sub.cliente_id
  AND ABS(c.saldo - sub.saldo_real) > 0.01;

-- For clients with NO cuenta_corriente entries but non-zero saldo, reset to 0
UPDATE clientes
SET saldo = 0, updated_at = now()
WHERE saldo != 0
  AND id NOT IN (SELECT DISTINCT cliente_id FROM cuenta_corriente WHERE cliente_id IS NOT NULL);

-- =====================================================================
-- STEP 3: FIX DUPLICATE CUENTA_CORRIENTE ENTRIES
-- =====================================================================

-- Find potential duplicates: same cliente, same venta, same monto, same day
-- This identifies Norma-type bugs where a cobro was registered twice

SELECT
  cc.cliente_id,
  cl.nombre,
  cc.venta_id,
  cc.fecha,
  cc.debe,
  cc.haber,
  cc.comprobante,
  cc.descripcion,
  COUNT(*) as duplicates
FROM cuenta_corriente cc
JOIN clientes cl ON cl.id = cc.cliente_id
GROUP BY cc.cliente_id, cl.nombre, cc.venta_id, cc.fecha, cc.debe, cc.haber, cc.comprobante, cc.descripcion
HAVING COUNT(*) > 1
ORDER BY cl.nombre, cc.fecha DESC;

-- =====================================================================
-- STEP 4: FIX VENTAS WITH monto_pagado > total (corrupted by double cobro)
-- =====================================================================

-- Cap monto_pagado at total (should never exceed)
UPDATE ventas
SET monto_pagado = total
WHERE monto_pagado > total
  AND estado != 'anulada';

-- =====================================================================
-- STEP 5: VERIFY — Final check
-- =====================================================================

-- Show final state of all clients with non-zero saldo
SELECT
  c.id,
  c.nombre,
  c.saldo,
  COALESCE(l.debe_total, 0) AS total_debe,
  COALESCE(l.haber_total, 0) AS total_haber,
  COALESCE(l.debe_total, 0) - COALESCE(l.haber_total, 0) AS saldo_verificado
FROM clientes c
LEFT JOIN (
  SELECT
    cliente_id,
    SUM(debe) AS debe_total,
    SUM(haber) AS haber_total
  FROM cuenta_corriente
  GROUP BY cliente_id
) l ON l.cliente_id = c.id
WHERE c.saldo != 0 OR COALESCE(l.debe_total, 0) - COALESCE(l.haber_total, 0) != 0
ORDER BY c.nombre;
