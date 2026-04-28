import { NextRequest, NextResponse } from "next/server";

const ORS_KEY = process.env.OPENROUTESERVICE_API_KEY;
const GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";
const OPTIMIZE_URL = "https://api.openrouteservice.org/optimization";

type Stop = { id: string; address?: string; mapsUrl?: string | null };

const COORD_PATTERNS = [
  // URL patterns
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]daddr=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]center=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  // HTML body patterns (Google Maps APP_INITIALIZATION_STATE / JSON-LD)
  /"latitude":(-?\d+\.\d+),"longitude":(-?\d+\.\d+)/,
  /\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/,
  /center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/,
];

function matchCoordsInString(s: string): [number, number] | null {
  if (!s) return null;
  for (const re of COORD_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      // Sanity check: valid lat/lng range and not (0,0)
      if (
        !isNaN(lat) && !isNaN(lng) &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        !(lat === 0 && lng === 0)
      ) {
        return [lng, lat]; // ORS espera [lng, lat]
      }
    }
  }
  return null;
}

async function geocodeORS(
  address: string,
  focus?: [number, number] | null,
): Promise<[number, number] | null> {
  let url = `${GEOCODE_URL}?api_key=${ORS_KEY}&text=${encodeURIComponent(address)}&boundary.country=AR&size=1`;
  if (focus) {
    url += `&focus.point.lon=${focus[0]}&focus.point.lat=${focus[1]}`;
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  return [coords[0], coords[1]];
}

// Nominatim como fallback. Free para bajo volumen — incluye User-Agent obligatorio.
async function geocodeNominatim(
  address: string,
): Promise<[number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&countrycodes=ar&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Enexpro/1.0 (route-optimizer)",
        "Accept-Language": "es-AR,es",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return [lng, lat];
  } catch {
    return null;
  }
}

async function geocode(
  address: string,
  focus?: [number, number] | null,
): Promise<[number, number] | null> {
  const ors = await geocodeORS(address, focus);
  if (ors) return ors;
  return geocodeNominatim(address);
}

// Extrae [lng, lat] de una URL de Google Maps. Soporta short URLs (maps.app.goo.gl), formatos
// @lat,lng / q=lat,lng / !3d!4d / data y, como último recurso, parsea el HTML del redirect.
async function coordsFromMapsUrl(url: string): Promise<[number, number] | null> {
  if (!url) return null;
  const fullUrl = url.trim();

  // Intento 1: la URL ya trae coords
  const direct = matchCoordsInString(fullUrl);
  if (direct) return direct;

  // Intento 2: short URL → seguir redirects y revisar URL final + HTML
  const isShort = /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\//i.test(fullUrl);
  if (isShort || /google\.com\/maps/i.test(fullUrl)) {
    try {
      const res = await fetch(fullUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        },
      });
      const finalUrl = res.url || "";
      const fromUrl = matchCoordsInString(finalUrl);
      if (fromUrl) return fromUrl;
      // Fallback: parsear HTML body
      const html = await res.text();
      // Buscar primero en data del head, luego en el resto
      const fromHtml = matchCoordsInString(html);
      if (fromHtml) return fromHtml;
    } catch {
      return null;
    }
  }

  return null;
}

type ResolveResult = {
  coords: [number, number] | null;
  source: "maps_url" | "geocode" | "none";
};

async function resolveStop(
  stop: Stop,
  focus: [number, number] | null,
): Promise<ResolveResult> {
  if (stop.mapsUrl) {
    const coords = await coordsFromMapsUrl(stop.mapsUrl);
    if (coords) return { coords, source: "maps_url" };
  }
  if (stop.address) {
    const coords = await geocode(stop.address, focus);
    if (coords) return { coords, source: "geocode" };
  }
  return { coords: null, source: "none" };
}

export async function POST(req: NextRequest) {
  if (!ORS_KEY) {
    return NextResponse.json({ error: "ORS key no configurada" }, { status: 500 });
  }

  const { stops, origen, origenCoords } = (await req.json()) as {
    stops: Stop[];
    origen?: string;
    origenCoords?: { lat: number; lng: number } | null;
  };
  if (!Array.isArray(stops) || stops.length < 2) {
    return NextResponse.json({ error: "Se necesitan al menos 2 paradas" }, { status: 400 });
  }

  // Resolver origen primero, así podemos usarlo como focus.point para geocodings ambiguos.
  // Prioridad: coords explícitas de la empresa (precisas) > geocoding del domicilio (ambiguo).
  let startCoords: [number, number] | null = null;
  if (
    origenCoords &&
    typeof origenCoords.lat === "number" &&
    typeof origenCoords.lng === "number"
  ) {
    startCoords = [origenCoords.lng, origenCoords.lat];
  }
  if (!startCoords && origen) {
    startCoords = await geocode(origen);
  }
  if (!startCoords) {
    return NextResponse.json(
      {
        error: `No se pudo ubicar la dirección de la empresa ("${origen}"). Configurá la ubicación en Configuración → Empresa.`,
      },
      { status: 400 },
    );
  }

  const resolved = await Promise.all(
    stops.map(async (s) => {
      const r = await resolveStop(s, startCoords);
      return { id: s.id, coords: r.coords, source: r.source };
    }),
  );
  const valid = resolved.filter(
    (s): s is { id: string; coords: [number, number]; source: ResolveResult["source"] } =>
      s.coords !== null,
  );
  const failed = resolved.filter((s) => s.coords === null).map((s) => s.id);
  const debug = resolved.map((s) => ({
    id: s.id,
    source: s.source,
    lat: s.coords ? s.coords[1] : null,
    lng: s.coords ? s.coords[0] : null,
  }));

  if (valid.length < 2) {
    return NextResponse.json(
      { error: "No se pudieron geocodificar suficientes direcciones", failed },
      { status: 400 },
    );
  }

  const body = {
    jobs: valid.map((s, i) => ({ id: i + 1, location: s.coords })),
    vehicles: [{ id: 1, profile: "driving-car", start: startCoords, end: startCoords }],
  };

  const res = await fetch(OPTIMIZE_URL, {
    method: "POST",
    headers: {
      Authorization: ORS_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: "ORS error", details: err }, { status: 502 });
  }

  const data = await res.json();
  const route = data?.routes?.[0];
  const steps: any[] = route?.steps ?? [];
  const orderedIds = steps
    .filter((step) => step.type === "job")
    .map((step) => valid[(step.job as number) - 1]?.id)
    .filter(Boolean) as string[];

  return NextResponse.json({
    orderedIds,
    failed,
    duration: route?.duration ?? null, // segundos
    distance: route?.distance ?? null, // metros
    debug,
    origenCoords: startCoords ? { lat: startCoords[1], lng: startCoords[0] } : null,
  });
}
