CREATE TABLE IF NOT EXISTS admin_notif_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- Push notification categories
  push_pedidos_nuevos BOOLEAN DEFAULT true,
  push_pedidos_armados BOOLEAN DEFAULT true,
  push_clientes_nuevos BOOLEAN DEFAULT true,
  push_stock_bajo BOOLEAN DEFAULT true,
  -- Sound settings
  sonido_enabled BOOLEAN DEFAULT true,
  -- Do not disturb
  dnd_enabled BOOLEAN DEFAULT false,
  dnd_hora_inicio TEXT DEFAULT '22:00',
  dnd_hora_fin TEXT DEFAULT '08:00',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id)
);
