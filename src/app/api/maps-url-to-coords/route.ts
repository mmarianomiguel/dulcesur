import { NextRequest, NextResponse } from "next/server";

// Orden importa: priorizamos coords del PIN/marcador sobre la cámara del mapa.
// !3d!4d = marcador real del lugar; @lat,lng = posición de la cámara (puede caer 100s de metros del pin).
const COORD_PATTERNS = [
  /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]daddr=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]center=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /"latitude":(-?\d+\.\d+),"longitude":(-?\d+\.\d+)/,
  /\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/,
  /center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/,
];

function matchCoords(s: string): { lat: number; lng: number } | null {
  if (!s) return null;
  for (const re of COORD_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (
        !isNaN(lat) && !isNaN(lng) &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        !(lat === 0 && lng === 0)
      ) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { url } = (await req.json()) as { url?: string };
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Falta el link" }, { status: 400 });
  }

  const trimmed = url.trim();

  // Intento 1: la URL ya trae coords
  const direct = matchCoords(trimmed);
  if (direct) return NextResponse.json(direct);

  // Intento 2: short URL → seguir redirects y revisar URL final + HTML
  const isMapsUrl = /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/|google\.com\/maps/i.test(trimmed);
  if (!isMapsUrl) {
    return NextResponse.json(
      { error: "El link no parece ser de Google Maps." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      },
    });
    const finalUrl = res.url || "";
    const fromUrl = matchCoords(finalUrl);
    if (fromUrl) return NextResponse.json(fromUrl);
    const html = await res.text();
    const fromHtml = matchCoords(html);
    if (fromHtml) return NextResponse.json(fromHtml);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Error al resolver el link: ${err?.message || "desconocido"}` },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { error: "No se pudieron extraer coordenadas del link. Probá pegando otro link más específico (con @lat,lng en la URL)." },
    { status: 400 },
  );
}
