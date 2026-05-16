import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { geocodeGoogle } from "@/lib/geocode";

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Geocodifica clientes sin coordenadas. maps_url tiene prioridad (coords exactas);
// si no, geocodifica el texto de la dirección con Nominatim (OpenStreetMap).
// Disparado desde el botón "Actualizar ubicaciones" del mapa de clientes.

async function isAdminCaller(req: NextRequest): Promise<boolean> {
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return false;
  const { data: u } = await supabase.from("usuarios").select("activo").eq("auth_id", user.id).maybeSingle();
  return !!u?.activo;
}

function parseCoordsFromUrl(url: string): [number, number] | null {
  let m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  m = url.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  return null;
}

async function resolveMapsUrl(shortUrl: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(shortUrl, { redirect: "follow" });
    let coords = parseCoordsFromUrl(decodeURIComponent(res.url));
    if (coords) return coords;
    const html = await res.text();
    return parseCoordsFromUrl(html);
  } catch { return null; }
}

async function geocodeText(addr: string): Promise<[number, number] | null> {
  // Google primero (más preciso para direcciones argentinas); Nominatim de fallback.
  const g = await geocodeGoogle(addr);
  if (g) return [g.lat, g.lng];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`,
      { headers: { "User-Agent": "DulceSur-Geocoder/1.0" } }
    );
    const r = await res.json();
    if (Array.isArray(r) && r.length > 0) return [parseFloat(r[0].lat), parseFloat(r[0].lon)];
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));

  // Modo puntual: resolver un link de Google Maps para un cliente y guardar coords + link.
  if (body?.id && body?.maps_url) {
    const coords = await resolveMapsUrl(String(body.maps_url));
    if (!coords) {
      return NextResponse.json(
        { ok: false, error: "No se pudieron extraer coordenadas de ese link" },
        { status: 422 }
      );
    }
    await supabase.from("clientes")
      .update({ lat: coords[0], lng: coords[1], geocoded_at: new Date().toISOString(), maps_url: String(body.maps_url) })
      .eq("id", body.id);
    return NextResponse.json({ ok: true, lat: coords[0], lng: coords[1] });
  }

  let query = supabase
    .from("clientes")
    .select("id, nombre, domicilio, localidad, provincia, maps_url")
    .eq("activo", true)
    .not("domicilio", "is", null);
  if (body?.id) query = query.eq("id", body.id);
  else query = query.is("lat", null);

  const { data: clientes } = await query.range(0, 4999);
  const todos = clientes || [];
  // Cap por request para no exceder el límite de tiempo de la función serverless.
  const batch = todos.slice(0, 25);

  let ok = 0;
  let fail = 0;
  for (const c of batch) {
    let coords: [number, number] | null = null;
    if (c.maps_url) coords = await resolveMapsUrl(c.maps_url);
    if (!coords) {
      const addr = [c.domicilio, c.localidad, c.provincia, "Argentina"]
        .filter(Boolean).map((s) => String(s).trim()).join(", ");
      coords = await geocodeText(addr);
      await new Promise((r) => setTimeout(r, 200)); // pausa breve (Google no requiere rate limit)
    }
    if (coords) {
      await supabase.from("clientes")
        .update({ lat: coords[0], lng: coords[1], geocoded_at: new Date().toISOString() })
        .eq("id", c.id);
      ok++;
    } else {
      fail++;
    }
  }

  return NextResponse.json({
    procesados: batch.length,
    geocodificados: ok,
    fallidos: fail,
    restantes: Math.max(0, todos.length - batch.length),
  });
}
