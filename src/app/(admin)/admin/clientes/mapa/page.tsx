"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Search, MapPin, Phone, Mail, Loader2 } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

// Dynamic import for Leaflet (SSR incompatible)
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

interface ClienteMap {
  id: string;
  nombre: string;
  domicilio: string | null;
  localidad: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
  maps_url: string | null;
  saldo: number;
  lat?: number;
  lng?: number;
}

export default function ClientesMapaPage() {
  const [clientes, setClientes] = useState<ClienteMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    // Load Leaflet CSS
    if (typeof window !== "undefined") {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
      setLeafletLoaded(true);
    }
  }, []);

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, domicilio, localidad, provincia, telefono, email, maps_url, saldo")
      .eq("activo", true)
      .not("domicilio", "is", null)
      .order("nombre");

    const clientesConDir = (data || []).filter((c: any) => c.domicilio);

    // Geocode addresses using Nominatim (free)
    setGeocoding(true);
    const geocoded: ClienteMap[] = [];
    for (const c of clientesConDir) {
      const addr = [c.domicilio, c.localidad, c.provincia, "Argentina"].filter(Boolean).join(", ");
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`);
        const results = await res.json();
        if (results.length > 0) {
          geocoded.push({ ...c, lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
        } else {
          geocoded.push(c as ClienteMap);
        }
      } catch {
        geocoded.push(c as ClienteMap);
      }
      // Rate limit Nominatim (1 req/sec)
      await new Promise((r) => setTimeout(r, 1100));
    }
    setClientes(geocoded);
    setGeocoding(false);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const filtered = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (c.domicilio || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.localidad || "").toLowerCase().includes(search.toLowerCase())
  );

  const withCoords = filtered.filter((c) => c.lat && c.lng);
  const defaultCenter: [number, number] = withCoords.length > 0
    ? [withCoords[0].lat!, withCoords[0].lng!]
    : [-34.6037, -58.3816]; // Buenos Aires default

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4">
      <div className="flex items-center gap-4">
        <Link href="/admin/clientes">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Mapa de Clientes</h1>
          <p className="text-sm text-muted-foreground">{withCoords.length} de {clientes.length} clientes ubicados</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {loading || geocoding ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">{geocoding ? "Ubicando clientes en el mapa..." : "Cargando clientes..."}</p>
          </div>
        </div>
      ) : leafletLoaded ? (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-lg" style={{ height: "70vh" }}>
            <MapContainer center={defaultCenter} zoom={12} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {withCoords.map((c) => (
                <Marker key={c.id} position={[c.lat!, c.lng!]}>
                  <Popup>
                    <div className="space-y-1 min-w-[180px]">
                      <p className="font-bold text-sm">{c.nombre}</p>
                      {c.domicilio && <p className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{c.domicilio}{c.localidad ? `, ${c.localidad}` : ""}</p>}
                      {c.telefono && <p className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />{c.telefono}</p>}
                      {c.email && <p className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</p>}
                      {c.saldo > 0 && <p className="text-xs font-semibold text-orange-600">Deuda: ${c.saldo.toLocaleString("es-AR")}</p>}
                      <a
                        href={c.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.domicilio, c.localidad].filter(Boolean).join(", "))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline block mt-1"
                      >
                        Abrir en Google Maps →
                      </a>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </CardContent>
        </Card>
      ) : null}

      {/* Clientes sin ubicar */}
      {!loading && !geocoding && filtered.filter((c) => !c.lat || !c.lng).length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Clientes sin ubicar ({filtered.filter((c) => !c.lat || !c.lng).length})
            </p>
            <div className="space-y-1">
              {filtered.filter((c) => !c.lat || !c.lng).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 text-sm border-b last:border-0">
                  <span className="font-medium">{c.nombre}</span>
                  <span className="text-xs text-muted-foreground">{c.domicilio}, {c.localidad}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
