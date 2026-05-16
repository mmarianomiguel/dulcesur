"use client";

import { useEffect } from "react";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const ICON_LOCAL = "https://maps.google.com/mapfiles/ms/icons/blue-dot.png";

export interface PuntoRuta {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
}

// Ajusta el encuadre a todos los puntos y dibuja la línea del recorrido
// (local → parada 1 → 2 → ... → última → local).
function EncuadreYLinea({
  origin,
  stops,
}: {
  origin: PuntoRuta | null;
  stops: PuntoRuta[];
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const todos = [...(origin ? [origin] : []), ...stops];
    if (todos.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    todos.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 56);

    const path = [
      ...(origin ? [{ lat: origin.lat, lng: origin.lng }] : []),
      ...stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      ...(origin ? [{ lat: origin.lat, lng: origin.lng }] : []),
    ];
    const line = new google.maps.Polyline({
      path,
      map,
      strokeColor: "#2563eb",
      strokeOpacity: 0.65,
      strokeWeight: 3,
    });
    return () => line.setMap(null);
  }, [map, origin, stops]);
  return null;
}

export function HojaRutaMapa({
  origin,
  stops,
}: {
  origin: PuntoRuta | null;
  stops: PuntoRuta[];
}) {
  if (!GMAPS_KEY || stops.length === 0) return null;
  const center = origin || stops[0];

  return (
    <APIProvider apiKey={GMAPS_KEY}>
      <Map
        defaultCenter={{ lat: center.lat, lng: center.lng }}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI={true}
        zoomControl={true}
        clickableIcons={false}
        style={{ width: "100%", height: "100%" }}
      >
        {origin && (
          <Marker
            position={{ lat: origin.lat, lng: origin.lng }}
            icon={ICON_LOCAL}
            title="Tu local (salida y regreso)"
          />
        )}
        {stops.map((s, i) => (
          <Marker
            key={s.id}
            position={{ lat: s.lat, lng: s.lng }}
            label={{ text: String(i + 1), color: "#ffffff", fontWeight: "bold", fontSize: "12px" }}
            title={`${i + 1}. ${s.nombre}`}
          />
        ))}
        <EncuadreYLinea origin={origin} stops={stops} />
      </Map>
    </APIProvider>
  );
}
