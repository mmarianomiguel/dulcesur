"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Search, MapPin, Phone, Mail, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { showAdminToast } from "@/components/admin-toast";

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
  lat: number | null;
  lng: number | null;
}

export default function ClientesMapaPage() {
  const [clientes, setClientes] = useState<ClienteMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [L, setL] = useState<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    setLeafletLoaded(true);
    import("leaflet").then((m) => setL(m.default || m));
  }, []);

  const fetchClientes = useCallback(async () => {
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, domicilio, localidad, provincia, telefono, email, maps_url, saldo, lat, lng")
      .eq("activo", true)
      .not("domicilio", "is", null)
      .order("nombre")
      .range(0, 49999);
    setClientes((data || []) as ClienteMap[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  // Marcador con forma de pin, color según deuda.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinIcon = useCallback((color: string): any => {
    if (!L) return undefined;
    return L.divIcon({
      className: "",
      html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 26 14 26s14-16.5 14-26C28 6.27 21.73 0 14 0z" fill="${color}"/>
        <circle cx="14" cy="14" r="5.5" fill="#fff"/>
      </svg>`,
      iconSize: [28, 40],
      iconAnchor: [14, 40],
      popupAnchor: [0, -34],
    });
  }, [L]);

  const actualizarUbicaciones = async () => {
    setUpdating(true);
    try {
      let restantes = 1;
      let totalGeo = 0;
      let totalFail = 0;
      // Geocodifica en tandas hasta procesar todos los pendientes.
      while (restantes > 0) {
        const res = await fetch("/api/clientes/geocode", { method: "POST" });
        if (!res.ok) {
          showAdminToast("Error al geocodificar. Probá de nuevo.", "error");
          break;
        }
        const r = await res.json();
        totalGeo += r.geocodificados || 0;
        totalFail += r.fallidos || 0;
        restantes = r.restantes || 0;
      }
      await fetchClientes();
      if (totalGeo === 0 && totalFail === 0) {
        showAdminToast("Todos los clientes ya están ubicados", "success");
      } else {
        showAdminToast(
          `${totalGeo} cliente(s) ubicado(s)` + (totalFail > 0 ? `, ${totalFail} sin resultado` : ""),
          totalFail > 0 ? "info" : "success"
        );
      }
    } catch {
      showAdminToast("Error al geocodificar", "error");
    } finally {
      setUpdating(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = clientes.filter((c) =>
    !q ||
    c.nombre.toLowerCase().includes(q) ||
    (c.domicilio || "").toLowerCase().includes(q) ||
    (c.localidad || "").toLowerCase().includes(q)
  );

  const withCoords = filtered.filter((c) => c.lat != null && c.lng != null);
  const sinUbicar = filtered.filter((c) => c.lat == null || c.lng == null);
  const defaultCenter: [number, number] = withCoords.length > 0
    ? [withCoords[0].lat!, withCoords[0].lng!]
    : [-34.9, -58.27]; // Guernica / Glew aprox.

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/clientes">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div className="flex-1 min-w-[180px]">
          <h1 className="text-xl font-bold">Mapa de Clientes</h1>
          <p className="text-sm text-muted-foreground">{withCoords.length} de {clientes.length} clientes ubicados</p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button onClick={actualizarUbicaciones} disabled={updating || loading} variant="outline" className="h-9 gap-2">
          {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {updating ? "Actualizando..." : "Actualizar ubicaciones"}
        </Button>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: "#16a34a" }} /> Al día
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: "#dc2626" }} /> Con deuda
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Cargando clientes...</p>
          </div>
        </div>
      ) : leafletLoaded && L ? (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-lg" style={{ height: "70vh" }}>
            <MapContainer center={defaultCenter} zoom={13} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {withCoords.map((c) => (
                <Marker key={c.id} position={[c.lat!, c.lng!]} icon={pinIcon(c.saldo > 0 ? "#dc2626" : "#16a34a")}>
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
      {!loading && sinUbicar.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Clientes sin ubicar ({sinUbicar.length}) — corregí la dirección o pegá un link de Google Maps en su perfil y tocá &quot;Actualizar ubicaciones&quot;
            </p>
            <div className="space-y-1">
              {sinUbicar.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-1.5 text-sm border-b last:border-0 px-1"
                >
                  <span className="font-medium">{c.nombre}</span>
                  <span className="text-xs text-muted-foreground">{[c.domicilio, c.localidad].filter(Boolean).join(", ")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
