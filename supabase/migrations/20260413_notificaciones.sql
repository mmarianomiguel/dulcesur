-- 1. Agregar cliente_id a push_subscriptions (si no existe)
ALTER TABLE push_subscriptions
ADD COLUMN IF NOT EXISTS cliente_id integer REFERENCES clientes_auth(id) ON DELETE CASCADE;

-- 2. Tabla de notificaciones enviadas
CREATE TABLE IF NOT EXISTS notificaciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  mensaje text NOT NULL,
  tipo text NOT NULL DEFAULT 'pedido', -- pedido | promocion | recordatorio | catalogo | cuenta_corriente | sistema
  url text,
  enviada_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. Tabla de destinatarios (relación notificación → cliente)
CREATE TABLE IF NOT EXISTS notificacion_destinatarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  notificacion_id uuid REFERENCES notificaciones(id) ON DELETE CASCADE,
  cliente_id integer REFERENCES clientes_auth(id) ON DELETE CASCADE,
  leida boolean DEFAULT false,
  leida_at timestamptz,
  push_enviada boolean DEFAULT false,
  push_error text,
  created_at timestamptz DEFAULT now()
);

-- 4. Tabla de preferencias por cliente
CREATE TABLE IF NOT EXISTS notificacion_preferencias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id integer REFERENCES clientes_auth(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  push_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(cliente_id, tipo)
);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_notif_dest_cliente ON notificacion_destinatarios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_notif_dest_notif ON notificacion_destinatarios(notificacion_id);
CREATE INDEX IF NOT EXISTS idx_notif_dest_created ON notificacion_destinatarios(created_at);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_cliente ON notificacion_preferencias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_cliente ON push_subscriptions(cliente_id);
