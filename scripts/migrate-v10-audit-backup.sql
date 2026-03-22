-- migrate-v10-audit-backup.sql
-- Audit logs, stock_movimientos improvements, backup metadata

-- =====================================================================
-- 1. AUDIT LOGS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT NOT NULL DEFAULT 'Sistema',
  action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, ANULACION, BACKUP, etc.
  module TEXT NOT NULL, -- ventas, productos, clientes, stock, compras, caja, auth, config
  entity_id TEXT,       -- ID of the affected entity
  before_data JSONB,    -- State before change (for UPDATE/DELETE)
  after_data JSONB,     -- State after change (for CREATE/UPDATE)
  metadata JSONB,       -- Extra context (IP, browser, etc.)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS audit_logs_module_idx ON audit_logs(module);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_id_idx ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_name_idx ON audit_logs(user_name);

-- RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_auth_all ON audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================================
-- 2. STOCK MOVIMIENTOS IMPROVEMENTS
-- =====================================================================

-- Add reference_type column if missing
ALTER TABLE stock_movimientos ADD COLUMN IF NOT EXISTS reference_type TEXT;

-- Add index for product lookups
CREATE INDEX IF NOT EXISTS stock_mov_producto_idx ON stock_movimientos(producto_id);
CREATE INDEX IF NOT EXISTS stock_mov_created_idx ON stock_movimientos(created_at DESC);

-- =====================================================================
-- 3. BACKUP METADATA TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'Admin',
  tablas_incluidas TEXT[] NOT NULL,
  total_registros INTEGER NOT NULL DEFAULT 0,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY backups_auth_all ON backups FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================================
-- 4. RPC: Log audit entry (callable from client)
-- =====================================================================

CREATE OR REPLACE FUNCTION log_audit(
  p_user_name TEXT,
  p_action TEXT,
  p_module TEXT,
  p_entity_id TEXT DEFAULT NULL,
  p_before JSONB DEFAULT NULL,
  p_after JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_logs (user_name, action, module, entity_id, before_data, after_data, metadata)
  VALUES (p_user_name, p_action, p_module, p_entity_id, p_before, p_after, p_metadata);
END;
$$;

GRANT EXECUTE ON FUNCTION log_audit TO authenticated;
GRANT EXECUTE ON FUNCTION log_audit TO anon;
