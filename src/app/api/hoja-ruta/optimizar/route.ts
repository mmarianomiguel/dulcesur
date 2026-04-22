import { NextRequest, NextResponse } from "next/server";

const ORS_KEY = process.env.OPENROUTESERVICE_API_KEY;
const GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";
const OPTIMIZE_URL = "https://api.openrouteservice.org/optimization";

type Stop = { id: string; address: string };

async function geocode(address: string): Promise<[number, number] | null> {
  const url = `${GEOCODE_URL}?api_key=${ORS_KEY}&text=${encodeURIComponent(address)}&boundary.country=AR&size=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  return [coords[0], coords[1]];
}

export async function POST(req: NextRequest) {
  if (!ORS_KEY) {
    return NextResponse.json({ error: "ORS key no configurada" }, { status: 500 });
  }

  const { stops, origen } = (await req.json()) as { stops: Stop[]; origen?: string };
  if (!Array.isArray(stops) || stops.length < 2) {
    return NextResponse.json({ error: "Se necesitan al menos 2 paradas" }, { status: 400 });
  }

  const geocoded = await Promise.all(
    stops.map(async (s) => ({ id: s.id, coords: await geocode(s.address) }))
  );
  const valid = geocoded.filter((s): s is { id: string; coords: [number, number] } => s.coords !== null);
  const failed = geocoded.filter((s) => s.coords === null).map((s) => s.id);

  if (valid.length < 2) {
    return NextResponse.json({ error: "No se pudieron geocodificar suficientes direcciones", failed }, { status: 400 });
  }

  let startCoords: [number, number] | null = null;
  if (origen) {
    startCoords = await geocode(origen);
    if (!startCoords) {
      return NextResponse.json({
        error: `No se pudo ubicar la dirección de la empresa ("${origen}"). Revisá Configuración → Empresa → Domicilio y Localidad.`,
      }, { status: 400 });
    }
  } else {
    startCoords = valid[0].coords;
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
  });
}
