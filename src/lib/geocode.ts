// Geocodificación con Google Maps Geocoding API.
// Devuelve { lat, lng } o null. Si no hay key configurada, devuelve null
// para que el llamador use su fallback (Nominatim / OpenRouteService).

export async function geocodeGoogle(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !address?.trim()) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(address.trim())}` +
      `&components=country:AR&region=ar&language=es&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;
    const loc = data.results[0].geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}
