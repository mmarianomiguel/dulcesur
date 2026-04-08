# Sistema de Notificaciones - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a centralized notification system with push + in-app notifications for all roles (clients, admin, vendors), configurable templates, audience segmentation, and client preference management.

**Architecture:** New Supabase tables for templates, notifications, recipients, and preferences. New API routes under `/api/notificaciones/`. Admin section at `/admin/notificaciones/` with dashboard, templates CRUD, send form, history, and config. Client-side bell icon in tienda navbar with dropdown + `/cuenta/notificaciones` page for preferences and history. Notification button on hoja de ruta page.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL), web-push (existing), shadcn/ui, Tailwind CSS, lucide-react icons.

**Design doc:** `docs/plans/2026-04-08-sistema-notificaciones-design.md`

---

## File Structure

### New Files
- `src/services/notificaciones.ts` — Service layer for notification CRUD operations
- `src/app/api/notificaciones/enviar/route.ts` — Send notification API
- `src/app/api/notificaciones/cliente/route.ts` — Get client notifications API
- `src/app/api/notificaciones/leer/route.ts` — Mark as read API
- `src/app/api/notificaciones/preferencias/route.ts` — Client preferences API
- `src/app/api/notificaciones/plantillas/route.ts` — Templates CRUD API
- `src/app/(admin)/admin/notificaciones/page.tsx` — Admin notifications dashboard
- `src/app/(admin)/admin/notificaciones/plantillas/page.tsx` — Templates management
- `src/app/(admin)/admin/notificaciones/enviar/page.tsx` — Send notification form
- `src/app/(admin)/admin/notificaciones/historial/page.tsx` — Notification history
- `src/app/(admin)/admin/notificaciones/configuracion/page.tsx` — Notification settings
- `src/app/(tienda)/cuenta/notificaciones/page.tsx` — Client notification preferences + history
- `src/components/tienda/notification-bell.tsx` — Bell icon with dropdown for tienda navbar

### Modified Files
- `src/types/database.ts` — Add notification-related interfaces
- `src/components/sidebar.tsx` — Add "Notificaciones" nav item (line ~131, before "Vendedores")
- `src/components/tienda/navbar.tsx` — Add NotificationBell component (line ~237, before cart)
- `src/app/(tienda)/cuenta/page.tsx` — Add "Notificaciones" link (line ~506, before logout)
- `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx` — Add "Enviar notificaciones" button
- `src/app/api/push/subscribe/route.ts` — Support `cliente_id` parameter
- `public/sw.js` — No changes needed (already handles push payloads generically)

---

### Task 1: Database Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add notification interfaces to database.ts**

Open `src/types/database.ts` and add these interfaces at the end of the file (after all existing interfaces):

```typescript
// ── Notification System ──

export type NotificacionTipo = "pedido" | "promocion" | "recordatorio" | "catalogo" | "cuenta_corriente" | "sistema";
export type NotificacionDestinatario = "cliente" | "admin" | "vendedor" | "todos";

export interface NotificacionPlantilla {
  id: string;
  nombre: string;
  titulo_template: string;
  mensaje_template: string;
  tipo: NotificacionTipo;
  destinatario_default: NotificacionDestinatario;
  activa: boolean;
  variables_disponibles: string[];
  created_at: string;
  updated_at: string;
}

export interface Notificacion {
  id: string;
  plantilla_id: string | null;
  titulo: string;
  mensaje: string;
  tipo: NotificacionTipo;
  url: string | null;
  enviada_por: string | null;
  segmentacion: {
    tipo: "todos" | "cliente" | "zona" | "rol" | "inactividad";
    valor?: string | number;
  };
  created_at: string;
}

export interface NotificacionDestinatarioRow {
  id: string;
  notificacion_id: string;
  cliente_id: number | null;
  usuario_id: string | null;
  leida: boolean;
  leida_at: string | null;
  push_enviada: boolean;
  push_error: string | null;
  created_at: string;
}

export interface NotificacionPreferencia {
  id: string;
  cliente_id: number;
  tipo: NotificacionTipo;
  push_enabled: boolean;
  created_at: string;
  updated_at: string;
}
```

Also add these tables to the `Database` interface `Tables` section (before the closing `};` of Tables):

```typescript
notificacion_plantillas: {
  Row: NotificacionPlantilla;
  Insert: Partial<NotificacionPlantilla>;
  Update: Partial<NotificacionPlantilla>;
};
notificaciones: {
  Row: Notificacion;
  Insert: Partial<Notificacion>;
  Update: Partial<Notificacion>;
};
notificacion_destinatarios: {
  Row: NotificacionDestinatarioRow;
  Insert: Partial<NotificacionDestinatarioRow>;
  Update: Partial<NotificacionDestinatarioRow>;
};
notificacion_preferencias: {
  Row: NotificacionPreferencia;
  Insert: Partial<NotificacionPreferencia>;
  Update: Partial<NotificacionPreferencia>;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(notificaciones): add notification system types"
```

---

### Task 2: Supabase Tables

**Files:** None (SQL executed in Supabase dashboard)

- [ ] **Step 1: Create tables in Supabase**

Run the following SQL in the Supabase SQL Editor:

```sql
-- Notification templates
CREATE TABLE notificacion_plantillas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  titulo_template text NOT NULL,
  mensaje_template text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('pedido','promocion','recordatorio','catalogo','cuenta_corriente','sistema')),
  destinatario_default text NOT NULL DEFAULT 'cliente' CHECK (destinatario_default IN ('cliente','admin','vendedor','todos')),
  activa boolean NOT NULL DEFAULT true,
  variables_disponibles jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Sent notifications
CREATE TABLE notificaciones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plantilla_id uuid REFERENCES notificacion_plantillas(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  mensaje text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('pedido','promocion','recordatorio','catalogo','cuenta_corriente','sistema')),
  url text,
  enviada_por uuid,
  segmentacion jsonb NOT NULL DEFAULT '{"tipo":"todos"}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Notification recipients
CREATE TABLE notificacion_destinatarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  notificacion_id uuid NOT NULL REFERENCES notificaciones(id) ON DELETE CASCADE,
  cliente_id bigint,
  usuario_id uuid,
  leida boolean NOT NULL DEFAULT false,
  leida_at timestamptz,
  push_enviada boolean NOT NULL DEFAULT false,
  push_error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notif_dest_cliente ON notificacion_destinatarios(cliente_id, created_at DESC);
CREATE INDEX idx_notif_dest_usuario ON notificacion_destinatarios(usuario_id, created_at DESC);
CREATE INDEX idx_notif_dest_notificacion ON notificacion_destinatarios(notificacion_id);

-- Client notification preferences
CREATE TABLE notificacion_preferencias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id bigint NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('pedido','promocion','recordatorio','catalogo','cuenta_corriente')),
  push_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(cliente_id, tipo)
);

-- Add cliente_id to push_subscriptions if not exists
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS cliente_id bigint;

-- RLS policies (allow all for service role, which is what API routes use)
ALTER TABLE notificacion_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacion_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacion_preferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON notificacion_plantillas FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON notificaciones FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON notificacion_destinatarios FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON notificacion_preferencias FOR ALL USING (true);

-- Seed default templates
INSERT INTO notificacion_plantillas (nombre, titulo_template, mensaje_template, tipo, destinatario_default, variables_disponibles) VALUES
  ('Pedido confirmado', 'Pedido #{{numero}} confirmado', 'Hola {{cliente}}, tu pedido #{{numero}} fue confirmado. Total: ${{total}}', 'pedido', 'cliente', '["numero","cliente","total"]'),
  ('Pedido en camino', 'Tu pedido #{{numero}} esta en camino', '{{cliente}}, tu pedido #{{numero}} esta siendo enviado. Monto: ${{total}}', 'pedido', 'cliente', '["numero","cliente","total"]'),
  ('Pedido listo para retirar', 'Tu pedido #{{numero}} esta listo', '{{cliente}}, tu pedido #{{numero}} esta listo para retirar en el local.', 'pedido', 'cliente', '["numero","cliente","total"]'),
  ('Promocion general', '{{titulo}}', '{{mensaje}}', 'promocion', 'cliente', '["titulo","mensaje"]'),
  ('Nuevo pedido (admin)', 'Nuevo pedido #{{numero}} - {{metodo}}', 'Cliente: {{cliente}} | Total: ${{total}} | Pago: {{forma_pago}}', 'pedido', 'admin', '["numero","cliente","total","forma_pago","metodo"]'),
  ('Pago registrado', 'Pago registrado en tu cuenta', '{{cliente}}, se registro un pago de ${{monto}} en tu cuenta corriente.', 'cuenta_corriente', 'cliente', '["cliente","monto"]'),
  ('Recordatorio caja abierta', 'Caja abierta', 'La caja sigue abierta. Recorda cerrarla antes de irte.', 'sistema', 'admin', '[]');
```

- [ ] **Step 2: Verify tables exist**

Run in Supabase SQL Editor:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'notificacion%';
```
Expected: 4 tables listed.

---

### Task 3: Notification Service

**Files:**
- Create: `src/services/notificaciones.ts`

- [ ] **Step 1: Create the notification service**

```typescript
import { BaseService } from "./base";
import { supabase } from "@/lib/supabase";
import type {
  NotificacionPlantilla,
  Notificacion,
  NotificacionDestinatarioRow,
  NotificacionPreferencia,
  NotificacionTipo,
} from "@/types/database";

class PlantillaService extends BaseService<NotificacionPlantilla> {
  constructor() {
    super("notificacion_plantillas");
  }

  async getActivas(): Promise<NotificacionPlantilla[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select("*")
      .eq("activa", true)
      .order("nombre");
    if (error) throw new Error(error.message);
    return (data as NotificacionPlantilla[]) || [];
  }
}

class NotificacionService extends BaseService<Notificacion> {
  constructor() {
    super("notificaciones");
  }

  async getHistorial(limit = 50, offset = 0): Promise<{ data: Notificacion[]; count: number }> {
    const { data, error, count } = await supabase
      .from(this.table)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return { data: (data as Notificacion[]) || [], count: count ?? 0 };
  }
}

class DestinatarioService extends BaseService<NotificacionDestinatarioRow> {
  constructor() {
    super("notificacion_destinatarios");
  }

  async getByCliente(clienteId: number, diasMax = 5): Promise<(NotificacionDestinatarioRow & { notificacion: Notificacion })[]> {
    const desde = new Date();
    desde.setDate(desde.getDate() - diasMax);

    const { data, error } = await supabase
      .from(this.table)
      .select("*, notificacion:notificaciones(*)")
      .eq("cliente_id", clienteId)
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as any) || [];
  }

  async getByUsuario(usuarioId: string, diasMax = 5): Promise<(NotificacionDestinatarioRow & { notificacion: Notificacion })[]> {
    const desde = new Date();
    desde.setDate(desde.getDate() - diasMax);

    const { data, error } = await supabase
      .from(this.table)
      .select("*, notificacion:notificaciones(*)")
      .eq("usuario_id", usuarioId)
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as any) || [];
  }

  async countNoLeidas(clienteId: number): Promise<number> {
    const desde = new Date();
    desde.setDate(desde.getDate() - 5);

    const { count, error } = await supabase
      .from(this.table)
      .select("*", { count: "exact", head: true })
      .eq("cliente_id", clienteId)
      .eq("leida", false)
      .gte("created_at", desde.toISOString());
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async marcarLeida(id: string): Promise<void> {
    await supabase
      .from(this.table)
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq("id", id);
  }

  async marcarTodasLeidas(clienteId: number): Promise<void> {
    await supabase
      .from(this.table)
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq("cliente_id", clienteId)
      .eq("leida", false);
  }

  async getDestinatariosDeNotificacion(notificacionId: string): Promise<NotificacionDestinatarioRow[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select("*")
      .eq("notificacion_id", notificacionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as NotificacionDestinatarioRow[]) || [];
  }
}

class PreferenciaService extends BaseService<NotificacionPreferencia> {
  constructor() {
    super("notificacion_preferencias");
  }

  async getByCliente(clienteId: number): Promise<NotificacionPreferencia[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select("*")
      .eq("cliente_id", clienteId);
    if (error) throw new Error(error.message);
    return (data as NotificacionPreferencia[]) || [];
  }

  async upsertPreferencia(clienteId: number, tipo: NotificacionTipo, enabled: boolean): Promise<void> {
    const { error } = await supabase
      .from(this.table)
      .upsert(
        { cliente_id: clienteId, tipo, push_enabled: enabled, updated_at: new Date().toISOString() },
        { onConflict: "cliente_id,tipo" }
      );
    if (error) throw new Error(error.message);
  }
}

export const plantillaService = new PlantillaService();
export const notificacionService = new NotificacionService();
export const destinatarioService = new DestinatarioService();
export const preferenciaService = new PreferenciaService();
```

- [ ] **Step 2: Commit**

```bash
git add src/services/notificaciones.ts
git commit -m "feat(notificaciones): add notification service layer"
```

---

### Task 4: API Routes - Templates CRUD

**Files:**
- Create: `src/app/api/notificaciones/plantillas/route.ts`

- [ ] **Step 1: Create templates API**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("notificacion_plantillas")
      .select("*")
      .order("nombre");
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, error } = await supabase
      .from("notificacion_plantillas")
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("notificacion_plantillas")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const { error } = await supabase
      .from("notificacion_plantillas")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/notificaciones/plantillas/route.ts
git commit -m "feat(notificaciones): add templates CRUD API"
```

---

### Task 5: API Routes - Send Notification

**Files:**
- Create: `src/app/api/notificaciones/enviar/route.ts`

- [ ] **Step 1: Create send notification API**

This is the core API. It resolves recipients based on segmentation, checks preferences, creates DB records, and sends push notifications.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  "mailto:admin@dulcesur.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function ascii(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

interface SendBody {
  titulo: string;
  mensaje: string;
  tipo: string;
  url?: string;
  plantilla_id?: string;
  enviada_por?: string;
  segmentacion: { tipo: string; valor?: string | number };
}

export async function POST(req: NextRequest) {
  try {
    const body: SendBody = await req.json();
    const { titulo, mensaje, tipo, url, plantilla_id, enviada_por, segmentacion } = body;

    // 1. Create notification record
    const { data: notif, error: notifErr } = await supabase
      .from("notificaciones")
      .insert({ titulo, mensaje, tipo, url, plantilla_id, enviada_por, segmentacion })
      .select()
      .single();
    if (notifErr) throw notifErr;

    // 2. Resolve recipients based on segmentation
    let clientes: { id: number }[] = [];
    let usuarios: { id: string }[] = [];

    if (segmentacion.tipo === "todos") {
      const { data } = await supabase.from("clientes").select("id").eq("activo", true);
      clientes = data || [];
    } else if (segmentacion.tipo === "cliente") {
      clientes = [{ id: Number(segmentacion.valor) }];
    } else if (segmentacion.tipo === "zona") {
      const { data } = await supabase
        .from("clientes")
        .select("id")
        .eq("activo", true)
        .eq("zona_entrega_id", segmentacion.valor);
      clientes = data || [];
    } else if (segmentacion.tipo === "rol") {
      const { data } = await supabase
        .from("usuarios")
        .select("id")
        .eq("activo", true)
        .eq("rol", segmentacion.valor);
      usuarios = data || [];
    } else if (segmentacion.tipo === "inactividad") {
      const dias = Number(segmentacion.valor) || 30;
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);
      // Clients whose last purchase is before 'desde' or have no purchases
      const { data: allClientes } = await supabase.from("clientes").select("id").eq("activo", true);
      const { data: activos } = await supabase
        .from("ventas")
        .select("cliente_id")
        .gte("created_at", desde.toISOString());
      const activosSet = new Set((activos || []).map((v: any) => v.cliente_id));
      clientes = (allClientes || []).filter((c: any) => !activosSet.has(c.id));
    } else if (segmentacion.tipo === "clientes_ids") {
      // Direct list of client IDs (used by hoja de ruta)
      const ids = segmentacion.valor as unknown as number[];
      clientes = (Array.isArray(ids) ? ids : []).map((id) => ({ id }));
    }

    // 3. Check preferences and filter out clients who disabled this type
    const tipoNotif = tipo as string;
    if (clientes.length > 0 && tipoNotif !== "sistema") {
      const clienteIds = clientes.map((c) => c.id);
      const { data: prefs } = await supabase
        .from("notificacion_preferencias")
        .select("cliente_id, push_enabled")
        .in("cliente_id", clienteIds)
        .eq("tipo", tipoNotif)
        .eq("push_enabled", false);
      const disabledSet = new Set((prefs || []).map((p: any) => p.cliente_id));
      clientes = clientes.filter((c) => !disabledSet.has(c.id));
    }

    // 4. Create recipient records
    const destinatarios = [
      ...clientes.map((c) => ({
        notificacion_id: notif.id,
        cliente_id: c.id,
        usuario_id: null,
      })),
      ...usuarios.map((u) => ({
        notificacion_id: notif.id,
        cliente_id: null,
        usuario_id: u.id,
      })),
    ];

    if (destinatarios.length > 0) {
      await supabase.from("notificacion_destinatarios").insert(destinatarios);
    }

    // 5. Send push notifications
    const payload = JSON.stringify({
      title: ascii(titulo),
      body: ascii(mensaje),
      tag: `notif-${notif.id}`,
      url: url || "/",
    });

    let sent = 0;
    let failed = 0;
    const expired: string[] = [];

    // Get push subscriptions for recipients
    let subs: any[] = [];
    if (clientes.length > 0) {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("cliente_id", clientes.map((c) => c.id));
      subs = [...subs, ...(data || [])];
    }
    if (usuarios.length > 0) {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", usuarios.map((u) => u.id));
      subs = [...subs, ...(data || [])];
    }

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
            Buffer.from(payload, "utf-8")
          );
          sent++;
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            expired.push(sub.endpoint);
          } else {
            failed++;
          }
        }
      })
    );

    // Update push_enviada status on recipient records
    if (subs.length > 0) {
      const clienteIdsConPush = new Set(subs.filter((s: any) => s.cliente_id).map((s: any) => s.cliente_id));
      const userIdsConPush = new Set(subs.filter((s: any) => s.user_id).map((s: any) => s.user_id));

      if (clienteIdsConPush.size > 0) {
        await supabase
          .from("notificacion_destinatarios")
          .update({ push_enviada: true })
          .eq("notificacion_id", notif.id)
          .in("cliente_id", [...clienteIdsConPush]);
      }
      if (userIdsConPush.size > 0) {
        await supabase
          .from("notificacion_destinatarios")
          .update({ push_enviada: true })
          .eq("notificacion_id", notif.id)
          .in("usuario_id", [...userIdsConPush]);
      }
    }

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expired);
    }

    return NextResponse.json({
      notificacion_id: notif.id,
      destinatarios: destinatarios.length,
      push_enviadas: sent,
      push_fallidas: failed,
      sin_push: destinatarios.length - subs.length,
    });
  } catch (err: any) {
    console.error("Notificacion send error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/notificaciones/enviar/route.ts
git commit -m "feat(notificaciones): add send notification API with segmentation and push"
```

---

### Task 6: API Routes - Client Notifications, Read, Preferences

**Files:**
- Create: `src/app/api/notificaciones/cliente/route.ts`
- Create: `src/app/api/notificaciones/leer/route.ts`
- Create: `src/app/api/notificaciones/preferencias/route.ts`

- [ ] **Step 1: Create client notifications API**

`src/app/api/notificaciones/cliente/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const clienteId = req.nextUrl.searchParams.get("cliente_id");
    const usuarioId = req.nextUrl.searchParams.get("usuario_id");
    const limit = Number(req.nextUrl.searchParams.get("limit") || "10");

    if (!clienteId && !usuarioId) {
      return NextResponse.json({ error: "cliente_id or usuario_id required" }, { status: 400 });
    }

    const desde = new Date();
    desde.setDate(desde.getDate() - 5);

    let query = supabase
      .from("notificacion_destinatarios")
      .select("*, notificacion:notificaciones(*)", { count: "exact" })
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (clienteId) query = query.eq("cliente_id", Number(clienteId));
    if (usuarioId) query = query.eq("usuario_id", usuarioId);

    const { data, error, count } = await query;
    if (error) throw error;

    // Count unread
    let unreadQuery = supabase
      .from("notificacion_destinatarios")
      .select("*", { count: "exact", head: true })
      .eq("leida", false)
      .gte("created_at", desde.toISOString());

    if (clienteId) unreadQuery = unreadQuery.eq("cliente_id", Number(clienteId));
    if (usuarioId) unreadQuery = unreadQuery.eq("usuario_id", usuarioId);

    const { count: unread } = await unreadQuery;

    return NextResponse.json({ data: data || [], total: count ?? 0, no_leidas: unread ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create mark-as-read API**

`src/app/api/notificaciones/leer/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(req: NextRequest) {
  try {
    const { id, todas, cliente_id } = await req.json();
    const now = new Date().toISOString();

    if (todas && cliente_id) {
      await supabase
        .from("notificacion_destinatarios")
        .update({ leida: true, leida_at: now })
        .eq("cliente_id", cliente_id)
        .eq("leida", false);
    } else if (id) {
      await supabase
        .from("notificacion_destinatarios")
        .update({ leida: true, leida_at: now })
        .eq("id", id);
    } else {
      return NextResponse.json({ error: "id or (todas + cliente_id) required" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create preferences API**

`src/app/api/notificaciones/preferencias/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TIPOS = ["pedido", "promocion", "recordatorio", "catalogo", "cuenta_corriente"];

export async function GET(req: NextRequest) {
  try {
    const clienteId = req.nextUrl.searchParams.get("cliente_id");
    if (!clienteId) return NextResponse.json({ error: "cliente_id required" }, { status: 400 });

    const { data } = await supabase
      .from("notificacion_preferencias")
      .select("*")
      .eq("cliente_id", Number(clienteId));

    // Return all tipos, defaulting to enabled
    const prefsMap: Record<string, boolean> = {};
    TIPOS.forEach((t) => { prefsMap[t] = true; });
    (data || []).forEach((p: any) => { prefsMap[p.tipo] = p.push_enabled; });

    return NextResponse.json(prefsMap);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { cliente_id, tipo, push_enabled } = await req.json();
    if (!cliente_id || !tipo) return NextResponse.json({ error: "cliente_id and tipo required" }, { status: 400 });

    const { error } = await supabase
      .from("notificacion_preferencias")
      .upsert(
        { cliente_id, tipo, push_enabled, updated_at: new Date().toISOString() },
        { onConflict: "cliente_id,tipo" }
      );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/notificaciones/cliente/route.ts src/app/api/notificaciones/leer/route.ts src/app/api/notificaciones/preferencias/route.ts
git commit -m "feat(notificaciones): add client notifications, read, and preferences APIs"
```

---

### Task 7: Update Push Subscribe API

**Files:**
- Modify: `src/app/api/push/subscribe/route.ts`

- [ ] **Step 1: Add cliente_id support to subscribe API**

Read the current file, then modify the POST handler to accept an optional `cliente_id` field from the request body. When inserting/upserting to `push_subscriptions`, include `cliente_id` if provided.

In the upsert call, add `cliente_id: body.cliente_id || null` to the object being upserted.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/push/subscribe/route.ts
git commit -m "feat(notificaciones): support cliente_id in push subscribe API"
```

---

### Task 8: Admin Sidebar - Add Notificaciones

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add Notificaciones to navigation array**

In `src/components/sidebar.tsx`, add the `BellRing` icon import (already imported). Add this nav item to the `navigation` array at line ~131, before the `Vendedores` entry:

```typescript
{
  name: "Notificaciones",
  href: "/admin/notificaciones",
  icon: Bell,
  children: [
    { name: "Dashboard", href: "/admin/notificaciones" },
    { name: "Enviar", href: "/admin/notificaciones/enviar" },
    { name: "Plantillas", href: "/admin/notificaciones/plantillas" },
    { name: "Historial", href: "/admin/notificaciones/historial" },
    { name: "Configuración", href: "/admin/notificaciones/configuracion" },
  ],
},
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(notificaciones): add notifications section to admin sidebar"
```

---

### Task 9: Admin - Templates Page

**Files:**
- Create: `src/app/(admin)/admin/notificaciones/plantillas/page.tsx`

- [ ] **Step 1: Create templates management page**

Build the page with:
- Table listing all templates: nombre, tipo, destinatario_default, activa (toggle)
- Dialog for create/edit with fields: nombre, titulo_template, mensaje_template, tipo (select), destinatario_default (select), variables_disponibles (comma-separated input or chips)
- The titulo/mensaje fields should show available variables as clickable chips below the textarea that insert `{{variable}}` at cursor
- Delete button with confirmation
- Toggle activa/inactiva directly from table row

Pattern: Follow the same `"use client"` + useState + useEffect + fetch pattern as other admin pages. Use `showAdminToast()` for feedback. Use shadcn `Card`, `Button`, `Input`, `Dialog`, `Select`, `Switch`, `Textarea`, `Label`, `Badge` components.

Fetch from: `GET /api/notificaciones/plantillas`
Create: `POST /api/notificaciones/plantillas`
Update: `PUT /api/notificaciones/plantillas`
Delete: `DELETE /api/notificaciones/plantillas`

The tipo select options: `pedido`, `promocion`, `recordatorio`, `catalogo`, `cuenta_corriente`, `sistema`
The destinatario_default select options: `cliente`, `admin`, `vendedor`, `todos`

- [ ] **Step 2: Commit**

```bash
git add src/app/\(admin\)/admin/notificaciones/plantillas/page.tsx
git commit -m "feat(notificaciones): add templates management admin page"
```

---

### Task 10: Admin - Send Notification Page

**Files:**
- Create: `src/app/(admin)/admin/notificaciones/enviar/page.tsx`

- [ ] **Step 1: Create send notification page**

Build the page with:
- Optional template selector (dropdown loading from `/api/notificaciones/plantillas`). When selected, pre-fills titulo and mensaje.
- Titulo input and Mensaje textarea (editable even after template selection)
- URL input (optional, where notification click navigates)
- Segmentation selector (radio group):
  - "Todos los clientes" → `{tipo: "todos"}`
  - "Cliente específico" → shows a search input that queries `clientes` table by nombre, shows dropdown results. Selected → `{tipo: "cliente", valor: clienteId}`
  - "Por zona de entrega" → dropdown loading from `zona_entrega` table → `{tipo: "zona", valor: zonaId}`
  - "Por rol" → dropdown with admin/vendedor/repartidor → `{tipo: "rol", valor: rolName}`
  - "Por inactividad" → number input for days → `{tipo: "inactividad", valor: days}`
- Preview section: shows a mock notification card with the titulo/mensaje
- "Destinatarios estimados" count: query the API or Supabase to estimate how many will receive it
- Send button with confirmation dialog: "Se enviará a X destinatarios. ¿Confirmar?"
- After send, show result summary: enviadas, fallidas, sin push

POST to `/api/notificaciones/enviar` with the form data.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(admin\)/admin/notificaciones/enviar/page.tsx
git commit -m "feat(notificaciones): add send notification admin page"
```

---

### Task 11: Admin - Notification History Page

**Files:**
- Create: `src/app/(admin)/admin/notificaciones/historial/page.tsx`

- [ ] **Step 1: Create history page**

Build the page with:
- Table showing sent notifications: created_at (formatted), titulo, tipo (badge), segmentacion description, destinatarios count, leidas/total ratio, enviada_por (usuario name)
- Fetch from Supabase directly: `notificaciones` table with joins
- Click on row opens a detail dialog/drawer showing:
  - Full titulo and mensaje
  - List of recipients with columns: nombre (from clientes or usuarios), push_enviada (check/x icon), leida (check/x), leida_at
- Pagination (20 per page)
- Filter by tipo (select) and date range (date inputs)

Data fetching: Query `notificaciones` table ordered by `created_at desc`. For each notification, count recipients via `notificacion_destinatarios`. For detail view, join with `clientes` or `usuarios` table to get names.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(admin\)/admin/notificaciones/historial/page.tsx
git commit -m "feat(notificaciones): add notification history admin page"
```

---

### Task 12: Admin - Notifications Dashboard

**Files:**
- Create: `src/app/(admin)/admin/notificaciones/page.tsx`

- [ ] **Step 1: Create dashboard page**

Build the page with 3 stat cards at the top:
- "Enviadas hoy": count from `notificaciones` where `created_at >= today`
- "Suscriptores activos": count from `push_subscriptions`
- "Tasa de lectura": percentage of `notificacion_destinatarios` with `leida = true` (last 7 days)

Below stats, 4 quick-action cards linking to sub-pages:
- "Enviar notificación" → `/admin/notificaciones/enviar` (icon: Send)
- "Plantillas" → `/admin/notificaciones/plantillas` (icon: FileText)
- "Historial" → `/admin/notificaciones/historial` (icon: Clock)
- "Configuración" → `/admin/notificaciones/configuracion` (icon: Settings)

And a "Últimas 5 notificaciones" mini-table at the bottom.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(admin\)/admin/notificaciones/page.tsx
git commit -m "feat(notificaciones): add notifications dashboard admin page"
```

---

### Task 13: Admin - Notifications Config Page

**Files:**
- Create: `src/app/(admin)/admin/notificaciones/configuracion/page.tsx`

- [ ] **Step 1: Create config page**

Build the page with:
- Section "Tipos de notificación": For each tipo (pedido, promocion, recordatorio, catalogo, cuenta_corriente, sistema), show a card with:
  - Nombre del tipo
  - Description
  - Switch to globally enable/disable
  - These toggles control whether the template tipo is active. When disabled, all plantillas of that tipo are set to `activa = false`.
- Uses `showAdminToast()` for feedback on save

Implementation: Load all plantillas, group by tipo. A tipo is "active" if any plantilla of that tipo is active. Toggling updates all plantillas of that tipo.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(admin\)/admin/notificaciones/configuracion/page.tsx
git commit -m "feat(notificaciones): add notifications config admin page"
```

---

### Task 14: Tienda - Notification Bell Component

**Files:**
- Create: `src/components/tienda/notification-bell.tsx`
- Modify: `src/components/tienda/navbar.tsx`

- [ ] **Step 1: Create NotificationBell component**

`src/components/tienda/notification-bell.tsx`:

Build a component that:
- Accepts `clienteId: number` prop
- Fetches notifications from `GET /api/notificaciones/cliente?cliente_id=X&limit=10`
- Shows a Bell icon with a red badge showing `no_leidas` count (hidden if 0)
- On click, opens a dropdown (absolute positioned, right-aligned) with:
  - Header "Notificaciones" with "Marcar todas como leídas" button
  - List of notifications: each shows titulo, mensaje (truncated to 80 chars), relative time (e.g. "hace 2 hs")
  - Unread notifications have a slightly blue-tinted background
  - Click on a notification calls `PATCH /api/notificaciones/leer` with the id, then navigates to the notification's URL
  - Footer link "Ver todas" → `/cuenta/notificaciones`
  - If empty: "No tenés notificaciones"
- Polls every 60 seconds for new notifications (or uses `setInterval`)
- Closes dropdown when clicking outside (useRef + useEffect click listener)

Style: Match the existing navbar button styling (rounded-lg, px-3, py-2, text-gray-700, hover:bg-gray-100).

For relative time, implement a simple helper:
```typescript
function tiempoRelativo(fecha: string): string {
  const diff = Date.now() - new Date(fecha).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} hs`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}
```

- [ ] **Step 2: Add NotificationBell to TiendaNavbar**

In `src/components/tienda/navbar.tsx`, import and add `<NotificationBell clienteId={clienteId} />` between the "Mi cuenta" link and the cart button (around line 237 in the right actions section). Get `clienteId` from localStorage `cliente_auth`.

Add state:
```typescript
const [clienteId, setClienteId] = useState<number | null>(null);
useEffect(() => {
  try {
    const stored = localStorage.getItem("cliente_auth");
    if (stored) { const p = JSON.parse(stored); if (p?.id) setClienteId(p.id); }
  } catch {}
}, []);
```

Then conditionally render the bell only when `clienteId` is set:
```tsx
{clienteId && <NotificationBell clienteId={clienteId} />}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tienda/notification-bell.tsx src/components/tienda/navbar.tsx
git commit -m "feat(notificaciones): add notification bell to tienda navbar"
```

---

### Task 15: Tienda - Client Notifications Page

**Files:**
- Create: `src/app/(tienda)/cuenta/notificaciones/page.tsx`
- Modify: `src/app/(tienda)/cuenta/page.tsx`

- [ ] **Step 1: Create notifications preferences + history page**

`src/app/(tienda)/cuenta/notificaciones/page.tsx`:

Build the page following the same pattern as `perfil/page.tsx`:
- Check `cliente_auth` from localStorage, redirect to `/cuenta` if not logged in
- Breadcrumb back link: `← Mi Cuenta` linking to `/cuenta`
- Title: "Notificaciones"

**Preferences section:**
- "Preferencias de notificación" heading
- Toggle general: "Recibir notificaciones push" - this controls the browser push subscription
  - If browser doesn't support push: show info message "Tu navegador no soporta notificaciones push"
  - If permission denied: show "Permitir notificaciones en la configuración de tu navegador"
  - If not subscribed: show "Activar" button that requests permission and subscribes via `/api/push/subscribe` with `cliente_id`
  - If subscribed: show "Desactivar" button
- Individual toggles for each category (only shown if push is active):
  - Pedidos: "Actualizaciones de tus pedidos"
  - Promociones: "Ofertas y descuentos"
  - Recordatorios: "Recordatorios y avisos"
  - Novedades: "Nuevos productos y catálogo"
  - Cuenta corriente: "Movimientos de tu cuenta"
- Each toggle calls `PUT /api/notificaciones/preferencias` on change

**History section:**
- "Historial de notificaciones" heading
- Fetch from `GET /api/notificaciones/cliente?cliente_id=X&limit=50`
- List of notifications, unread with blue-tinted bg
- Each shows: titulo (bold), mensaje, relative time, tipo badge
- Click marks as read (PATCH) and navigates to URL
- "Marcar todas como leídas" button at top
- If empty: "No tenés notificaciones recientes"

Use `showToast()` from `@/components/tienda/toast` for feedback.

- [ ] **Step 2: Add "Notificaciones" link to cuenta page**

In `src/app/(tienda)/cuenta/page.tsx`, add a new navigation link after "Mis Pedidos" (line ~506) and before the logout button:

```tsx
<Link
  href="/cuenta/notificaciones"
  className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 hover:border-primary/20 hover:shadow-md transition-all duration-200 p-5 group"
>
  <div className="flex items-center gap-4">
    <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center">
      <Bell className="w-5 h-5 text-amber-600" />
    </div>
    <div>
      <h2 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">Notificaciones</h2>
      <p className="text-gray-400 text-sm">Preferencias y historial de notificaciones</p>
    </div>
  </div>
  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
</Link>
```

Add `Bell` to the lucide-react imports.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(tienda\)/cuenta/notificaciones/page.tsx src/app/\(tienda\)/cuenta/page.tsx
git commit -m "feat(notificaciones): add client notifications page with preferences and history"
```

---

### Task 16: Hoja de Ruta - Notify Clients Button

**Files:**
- Modify: `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx`

- [ ] **Step 1: Read the hoja de ruta page to understand its structure**

Read the full file to understand:
- How hoja de ruta data is structured (which state variables hold the ventas/clientes)
- Where the action buttons are in the header
- How to extract the list of cliente_ids from the current hoja de ruta

- [ ] **Step 2: Add "Enviar notificaciones" button**

Add state:
```typescript
const [notifSending, setNotifSending] = useState(false);
const [notifSent, setNotifSent] = useState(false);
```

Add the send function:
```typescript
const enviarNotificacionesRuta = async () => {
  // Extract unique cliente_ids from the hoja de ruta ventas
  // (adapt variable names based on actual page structure)
  const clienteIds = [...new Set(ventas.map((v: any) => v.cliente_id).filter(Boolean))];
  if (clienteIds.length === 0) {
    showAdminToast("No hay clientes en esta hoja de ruta", "error");
    return;
  }

  setNotifSending(true);
  try {
    const res = await fetch("/api/notificaciones/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: "Tu pedido está en camino",
        mensaje: "Tu pedido está siendo enviado. ¡Pronto lo recibirás!",
        tipo: "pedido",
        url: "/cuenta/pedidos",
        segmentacion: { tipo: "clientes_ids", valor: clienteIds },
      }),
    });
    const result = await res.json();
    showAdminToast(`Notificaciones enviadas: ${result.push_enviadas} de ${result.destinatarios}`, "success");
    setNotifSent(true);
  } catch {
    showAdminToast("Error al enviar notificaciones", "error");
  } finally {
    setNotifSending(false);
  }
};
```

Add the button next to existing action buttons in the header:
```tsx
<Button
  onClick={enviarNotificacionesRuta}
  disabled={notifSending || notifSent}
  variant={notifSent ? "outline" : "default"}
  size="sm"
>
  {notifSending ? (
    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</>
  ) : notifSent ? (
    <><CheckCircle className="h-4 w-4 mr-2 text-green-500" /> Notificaciones enviadas</>
  ) : (
    <><Bell className="h-4 w-4 mr-2" /> Notificar clientes</>
  )}
</Button>
```

Add `Bell`, `Loader2`, `CheckCircle` to lucide imports if not already there.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/ventas/hoja-ruta/page.tsx
git commit -m "feat(notificaciones): add notify clients button to hoja de ruta"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Run the dev server and verify no build errors**

```bash
npm run build
```

Expected: Build completes without errors.

- [ ] **Step 2: Manually verify the following flows work**

1. Visit `/admin/notificaciones` — dashboard loads with stats
2. Visit `/admin/notificaciones/plantillas` — seed templates are listed
3. Create a new template, edit it, toggle active, delete it
4. Visit `/admin/notificaciones/enviar` — select a template, choose segmentation, send
5. Visit `/admin/notificaciones/historial` — sent notification appears
6. As a client, visit `/cuenta/notificaciones` — preferences toggles work, history shows notifications
7. Bell icon appears in tienda navbar with badge count
8. Click on bell → dropdown shows notifications
9. Click a notification → marks as read, navigates to URL
10. On hoja de ruta, click "Notificar clientes" → notifications sent

- [ ] **Step 3: Commit and push**

```bash
git push
```
