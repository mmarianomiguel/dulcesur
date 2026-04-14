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

    if (clienteId) query = query.eq("cliente_id", clienteId);
    if (usuarioId) query = query.eq("usuario_id", usuarioId);

    const { data, error, count } = await query;
    if (error) throw error;

    // Count unread
    let unreadQuery = supabase
      .from("notificacion_destinatarios")
      .select("*", { count: "exact", head: true })
      .eq("leida", false)
      .gte("created_at", desde.toISOString());

    if (clienteId) unreadQuery = unreadQuery.eq("cliente_id", clienteId);
    if (usuarioId) unreadQuery = unreadQuery.eq("usuario_id", usuarioId);

    const { count: unread } = await unreadQuery;

    return NextResponse.json({ data: data || [], total: count ?? 0, no_leidas: unread ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
