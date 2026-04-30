-- Hero templates + programaciones para el banner principal de la tienda.
-- Permite tener plantillas reutilizables (feriado, cambio de mínimo, etc.)
-- y programar cuándo se muestran (rango de fechas con prioridad).

create table if not exists public.hero_templates (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  titulo text not null default '',
  subtitulo text not null default '',
  boton_texto text not null default '',
  boton_link text not null default '',
  boton_secundario_texto text not null default '',
  boton_secundario_link text not null default '',
  color_inicio text not null default '#4f46e5',
  color_fin text not null default '#7c3aed',
  -- Lista auto-detectada de placeholders {var} presentes en los textos.
  -- Se calcula client-side al guardar para mostrar inputs al programar.
  placeholders text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hero_programaciones (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.hero_templates(id) on delete set null,
  -- Valores resueltos (placeholders ya reemplazados). Se guardan así para que
  -- la programación siga funcionando aunque borren el template.
  titulo text not null default '',
  subtitulo text not null default '',
  boton_texto text not null default '',
  boton_link text not null default '',
  boton_secundario_texto text not null default '',
  boton_secundario_link text not null default '',
  color_inicio text not null default '#4f46e5',
  color_fin text not null default '#7c3aed',
  fecha_desde timestamptz not null,
  fecha_hasta timestamptz not null,
  activo boolean not null default true,
  prioridad int not null default 0,
  created_at timestamptz not null default now(),
  check (fecha_hasta > fecha_desde)
);

create index if not exists idx_hero_programaciones_activas
  on public.hero_programaciones (fecha_desde, fecha_hasta)
  where activo = true;

-- RLS: lectura pública (la home necesita verlas), escritura solo autenticados.
alter table public.hero_templates enable row level security;
alter table public.hero_programaciones enable row level security;

create policy "hero_templates_read_all" on public.hero_templates
  for select using (true);
create policy "hero_templates_write_auth" on public.hero_templates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "hero_programaciones_read_all" on public.hero_programaciones
  for select using (true);
create policy "hero_programaciones_write_auth" on public.hero_programaciones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seeds: 5 plantillas iniciales típicas.
insert into public.hero_templates (nombre, titulo, subtitulo, boton_texto, boton_link, color_inicio, color_fin, placeholders) values
  ('Feriado',
    '¡Cerrado por feriado el {fecha}!',
    'Volvemos a atender el {fecha_vuelta}. Podés seguir haciendo tu pedido y lo entregamos cuando reabrimos.',
    'Ver productos', '/productos',
    '#dc2626', '#f59e0b',
    array['fecha','fecha_vuelta']),
  ('Cambio de mínimo de compra',
    'Atención: cambia el mínimo de compra',
    'A partir del {fecha} el mínimo de compra será de ${monto}.',
    'Hacer pedido ahora', '/productos',
    '#0891b2', '#7c3aed',
    array['fecha','monto']),
  ('Mantenimiento programado',
    'Mantenimiento programado el {fecha}',
    'La web puede tener interrupciones de {hora_desde} a {hora_hasta}. Disculpá las molestias.',
    '', '',
    '#475569', '#1e293b',
    array['fecha','hora_desde','hora_hasta']),
  ('Promoción',
    '{nombre_promo}',
    'Hasta el {fecha_fin}. ¡No te lo pierdas!',
    'Ver ofertas', '/ofertas',
    '#ec4899', '#a855f7',
    array['nombre_promo','fecha_fin']),
  ('Default',
    'Nueva Pagina web!',
    'Registrate y realiza tu pedido como lo haces normalmente. Cualquier consulta podes realizarla por Whatsapp.',
    'Registrarse', '/login',
    '#ec4899', '#a855f7',
    array[]::text[])
on conflict do nothing;
