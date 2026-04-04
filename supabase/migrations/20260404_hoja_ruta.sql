-- Migration: hoja_ruta + hoja_ruta_items
-- Run this in the Supabase SQL Editor

create table if not exists hoja_ruta (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  nombre text not null default '',
  estado text not null default 'borrador' check (estado in ('borrador','activa','completada')),
  modo_link text not null default 'confirmar_cobrar' check (modo_link in ('solo_ver','confirmar','confirmar_cobrar')),
  token_fijo text unique,
  token_temp text unique,
  token_temp_expira timestamptz,
  creado_por uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table hoja_ruta enable row level security;
drop policy if exists "auth users can manage hoja_ruta" on hoja_ruta;
create policy "auth users can manage hoja_ruta"
  on hoja_ruta for all
  using (auth.uid() is not null);

create table if not exists hoja_ruta_items (
  id uuid primary key default gen_random_uuid(),
  hoja_ruta_id uuid not null references hoja_ruta(id) on delete cascade,
  venta_id uuid not null references ventas(id),
  orden int not null default 0,
  completado boolean not null default false,
  completado_at timestamptz,
  unique(hoja_ruta_id, venta_id)
);

alter table hoja_ruta_items enable row level security;
drop policy if exists "auth users can manage hoja_ruta_items" on hoja_ruta_items;
create policy "auth users can manage hoja_ruta_items"
  on hoja_ruta_items for all
  using (auth.uid() is not null);
