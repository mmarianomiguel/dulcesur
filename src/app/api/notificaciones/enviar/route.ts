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
  segmentacion: { tipo: string; valor?: string | number | string[] | number[] };
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
    let clientes: { id: string }[] = [];
    let usuarios: { id: string }[] = [];

    if (segmentacion.tipo === "todos") {
      const { data } = await supabase.from("clientes").select("id").eq("activo", true);
      clientes = data || [];
    } else if (segmentacion.tipo === "cliente") {
      clientes = [{ id: String(segmentacion.valor) }];
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
      const { data: allClientes } = await supabase.from("clientes").select("id").eq("activo", true);
      const { data: activos } = await supabase
        .from("ventas")
        .select("cliente_id")
        .gte("created_at", desde.toISOString());
      const activosSet = new Set((activos || []).map((v: any) => v.cliente_id));
      clientes = (allClientes || []).filter((c: any) => !activosSet.has(c.id));
    } else if (segmentacion.tipo === "clientes_ids") {
      const ids = segmentacion.valor as unknown as string[];
      clientes = (Array.isArray(ids) ? ids : []).map((id) => ({ id: String(id) }));
    }

    // 3. Check preferences - filter out clients who disabled this notification type
    if (clientes.length > 0 && tipo !== "sistema") {
      const clienteIds = clientes.map((c) => c.id);
      const { data: prefs } = await supabase
        .from("notificacion_preferencias")
        .select("cliente_id, push_enabled")
        .in("cliente_id", clienteIds)
        .eq("tipo", tipo)
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

    // Función para reemplazar variables en el mensaje por cliente
    function resolverVariables(texto: string, cliente: any): string {
      const nombre = cliente?.nombre || "";
      const primerNombre = nombre.trim().split(" ")[0] || nombre;
      const saldo = cliente?.saldo != null ? `$${Number(cliente.saldo).toLocaleString("es-AR")}` : "";
      return texto
        .replace(/\{\{nombre\}\}/g, primerNombre)
        .replace(/\{\{cliente\}\}/g, primerNombre)
        .replace(/\{\{saldo\}\}/g, saldo);
    }

    let sent = 0;
    let failed = 0;
    const expired: string[] = [];

    // ── Resolver suscripciones push por segmentación ──
    // push_subscriptions.cliente_id = clientes_auth.id (UUID)
    // push_subscriptions.user_id = usuarios.id (UUID)
    // El join entre clientes y clientes_auth es por email

    let subs: any[] = [];

    if (clientes.length > 0) {
      // Paso 1: obtener emails + nombre + saldo de los clientes resueltos
      const { data: clientesData } = await supabase
        .from("clientes")
        .select("id, email, nombre, saldo")
        .in("id", clientes.map((c) => c.id));

      const emails = (clientesData || [])
        .map((c: any) => c.email)
        .filter(Boolean);

      if (emails.length > 0) {
        // Paso 2: resolver clientes_auth.id por email
        const { data: authData } = await supabase
          .from("clientes_auth")
          .select("id")
          .in("email", emails);

        const clienteAuthIds = (authData || [])
          .map((a: any) => a.id)
          .filter(Boolean);

        if (clienteAuthIds.length > 0) {
          // Paso 3: obtener suscripciones push
          const { data: clienteSubs } = await supabase
            .from("push_subscriptions")
            .select("*")
            .in("cliente_id", clienteAuthIds);
          subs = [...subs, ...(clienteSubs || [])];
        }
      }
    }

    if (usuarios.length > 0) {
      // Para usuarios (por rol): push_subscriptions.user_id = usuarios.id
      const { data: usuarioSubs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", usuarios.map((u) => u.id));
      subs = [...subs, ...(usuarioSubs || [])];
    }

    // Construir mapa de cliente_id → datos del cliente para personalizar mensajes
    const clienteDataMap: Record<string, any> = {};
    if (clientes.length > 0) {
      const { data: clientesInfo } = await supabase
        .from("clientes")
        .select("id, nombre, saldo, email")
        .in("id", clientes.map((c) => c.id));
      (clientesInfo || []).forEach((c: any) => { clienteDataMap[c.id] = c; });
    }

    // Mapa de clientes_auth.id → cliente_data para resolver por suscripción
    const authToClienteMap: Record<string, any> = {};
    if (Object.keys(clienteDataMap).length > 0) {
      const emails = Object.values(clienteDataMap)
        .map((c: any) => c.email)
        .filter(Boolean);
      if (emails.length > 0) {
        const { data: authData2 } = await supabase
          .from("clientes_auth")
          .select("id, email")
          .in("email", emails);
        const emailToCliente: Record<string, any> = {};
        Object.values(clienteDataMap).forEach((c: any) => {
          if (c.email) emailToCliente[c.email] = c;
        });
        (authData2 || []).forEach((a: any) => {
          if (a.email && emailToCliente[a.email]) {
            authToClienteMap[a.id] = emailToCliente[a.email];
          }
        });
      }
    }

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          // Personalizar mensaje por cliente si hay variables
          let tituloFinal = titulo;
          let mensajeFinal = mensaje;
          if (sub.cliente_id && authToClienteMap[sub.cliente_id]) {
            const clienteInfo = authToClienteMap[sub.cliente_id];
            tituloFinal = resolverVariables(titulo, clienteInfo);
            mensajeFinal = resolverVariables(mensaje, clienteInfo);
          }
          const personalizedPayload = JSON.stringify({
            title: ascii(tituloFinal),
            body: ascii(mensajeFinal),
            tag: `notif-${notif.id}`,
            url: url || "/",
          });
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
            Buffer.from(personalizedPayload, "utf-8")
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

    // Update push_enviada on recipient records
    if (subs.length > 0) {
      const clienteIdsConPush = [...new Set(subs.filter((s: any) => s.cliente_id).map((s: any) => s.cliente_id))];
      const userIdsConPush = [...new Set(subs.filter((s: any) => s.user_id).map((s: any) => s.user_id))];

      if (clienteIdsConPush.length > 0) {
        await supabase
          .from("notificacion_destinatarios")
          .update({ push_enviada: true })
          .eq("notificacion_id", notif.id)
          .in("cliente_id", clienteIdsConPush);
      }
      if (userIdsConPush.length > 0) {
        await supabase
          .from("notificacion_destinatarios")
          .update({ push_enviada: true })
          .eq("notificacion_id", notif.id)
          .in("usuario_id", userIdsConPush);
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
