"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { APIProvider, Map, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Search, MapPin, Phone, Mail, Loader2, RefreshCw, Crosshair, Link2, X } from "lucide-react";
import Link from "next/link";
import { showAdminToast } from "@/components/admin-toast";

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const ICON_VERDE = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";
const ICON_ROJO = "https://maps.google.com/mapfiles/ms/icons/red-dot.png";

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
  zona_entrega: string | null;
}

interface Zona {
  id: string;
  nombre: string;
}

// ─── Marcadores agrupados (clustering) ───
// Renderiza los marcadores de forma imperativa con MarkerClusterer: cuando hay
// muchos clientes juntos, se agrupan en un círculo numerado. Mucho más liviano
// y prolijo que pintar 100+ pines sueltos.
function ClusteredMarkers({
  clientes,
  onSelect,
}: {
  clientes: ClienteMap[];
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map });
    }
    const markers = markersRef.current;
    const wanted = new Set(clientes.map((c) => c.id));

    // Eliminar marcadores de clientes que ya no están.
    for (const id of Object.keys(markers)) {
      if (!wanted.has(id)) {
        google.maps.event.clearInstanceListeners(markers[id]);
        markers[id].setMap(null);
        delete markers[id];
      }
    }
    // Crear o actualizar el resto.
    for (const c of clientes) {
      if (c.lat == null || c.lng == null) continue;
      const pos = { lat: c.lat, lng: c.lng };
      const icon = c.saldo > 0 ? ICON_ROJO : ICON_VERDE;
      const m = markers[c.id];
      if (!m) {
        const nuevo = new google.maps.Marker({ position: pos, icon });
        nuevo.addListener("click", () => onSelectRef.current(c.id));
        markers[c.id] = nuevo;
      } else {
        m.setPosition(pos);
        m.setIcon(icon);
      }
    }
    clustererRef.current.clearMarkers();
    clustererRef.current.addMarkers(Object.values(markers));
  }, [map, clientes]);

  // Limpieza al desmontar.
  useEffect(() => {
    return () => {
      clustererRef.current?.clearMarkers();
      for (const id of Object.keys(markersRef.current)) {
        markersRef.current[id].setMap(null);
      }
      markersRef.current = {};
    };
  }, []);

  return null;
}

export default function ClientesMapaPage() {
  const [clientes, setClientes] = useState<ClienteMap[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zonaFilter, setZonaFilter] = useState<string>("todas");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState(false);

  // Cliente seleccionado (InfoWindow abierta).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Cliente al que se le está asignando ubicación tocando el mapa.
  const [placingClientId, setPlacingClientId] = useState<string | null>(null);
  // Cliente cuyo input de "pegar link" está abierto.
  const [linkClientId, setLinkClientId] = useState<string | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

  const mapCardRef = useRef<HTMLDivElement>(null);
  const placingRef = useRef<string | null>(null);
  placingRef.current = placingClientId;

  const fetchClientes = useCallback(async () => {
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, domicilio, localidad, provincia, telefono, email, maps_url, saldo, lat, lng, zona_entrega")
      .eq("activo", true)
      .not("domicilio", "is", null)
      .order("nombre")
      .range(0, 49999);
    setClientes((data || []) as ClienteMap[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  useEffect(() => {
    supabase.from("zonas_entrega").select("id, nombre").order("nombre")
      .then(({ data }) => setZonas((data || []) as Zona[]));
  }, []);

  // Guarda coordenadas de un cliente (arrastre de marcador o toque en el mapa).
  const guardarCoords = useCallback(async (id: string, lat: number, lng: number) => {
    const nombre = clientes.find((c) => c.id === id)?.nombre?.trim() || "Cliente";
    await supabase.from("clientes")
      .update({ lat, lng, geocoded_at: new Date().toISOString() })
      .eq("id", id);
    setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, lat, lng } : c)));
    showAdminToast(`Ubicación de ${nombre} actualizada`, "success");
  }, [clientes]);

  const actualizarUbicaciones = async () => {
    setUpdating(true);
    try {
      let restantes = 1;
      let totalGeo = 0;
      let totalFail = 0;
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

  // Inicia el modo "tocar en el mapa" para un cliente.
  const iniciarUbicarEnMapa = (id: string) => {
    setLinkClientId(null);
    setSelectedId(null);
    setPlacingClientId(id);
    mapCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Resuelve un link de Google Maps y guarda las coords del cliente.
  const guardarLink = async (id: string) => {
    const url = linkValue.trim();
    if (!url) return;
    setLinkSaving(true);
    try {
      const res = await fetch("/api/clientes/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, maps_url: url }),
      });
      const r = await res.json();
      if (!res.ok || !r.ok) {
        showAdminToast(r.error || "No se pudo procesar el link", "error");
        return;
      }
      const nombre = clientes.find((c) => c.id === id)?.nombre?.trim() || "Cliente";
      setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, lat: r.lat, lng: r.lng, maps_url: url } : c)));
      setLinkClientId(null);
      setLinkValue("");
      showAdminToast(`Ubicación de ${nombre} actualizada`, "success");
    } catch {
      showAdminToast("Error al procesar el link", "error");
    } finally {
      setLinkSaving(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = clientes.filter((c) => {
    if (zonaFilter !== "todas" && c.zona_entrega !== zonaFilter) return false;
    if (!q) return true;
    return (
      c.nombre.toLowerCase().includes(q) ||
      (c.domicilio || "").toLowerCase().includes(q) ||
      (c.localidad || "").toLowerCase().includes(q)
    );
  });

  const withCoords = filtered.filter((c) => c.lat != null && c.lng != null);
  const sinUbicar = filtered.filter((c) => c.lat == null || c.lng == null);
  const defaultCenter = withCoords.length > 0
    ? { lat: withCoords[0].lat!, lng: withCoords[0].lng! }
    : { lat: -34.9, lng: -58.27 }; // Guernica / Glew aprox.

  const placingCliente = placingClientId ? clientes.find((c) => c.id === placingClientId) : null;
  const selected = selectedId ? clientes.find((c) => c.id === selectedId) : null;

  const onMapClick = useCallback((e: { detail: { latLng: google.maps.LatLngLiteral | null } }) => {
    const id = placingRef.current;
    const ll = e.detail.latLng;
    if (id && ll) {
      guardarCoords(id, ll.lat, ll.lng);
      setPlacingClientId(null);
    }
  }, [guardarCoords]);

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

      {/* Leyenda + tip de arrastre */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: "#16a34a" }} /> Al día
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: "#dc2626" }} /> Con deuda
        </span>
        <span className="text-muted-foreground/80">· Tocá un grupo para acercar · Tocá un marcador para ver el cliente</span>
      </div>

      {/* Filtro por zona de entrega */}
      {zonas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1">Zona:</span>
          <Button
            size="sm"
            variant={zonaFilter === "todas" ? "default" : "outline"}
            className="h-7 text-xs px-3"
            onClick={() => setZonaFilter("todas")}
          >
            Todas ({clientes.length})
          </Button>
          {zonas.map((z) => (
            <Button
              key={z.id}
              size="sm"
              variant={zonaFilter === z.id ? "default" : "outline"}
              className="h-7 text-xs px-3"
              onClick={() => setZonaFilter(z.id)}
            >
              {z.nombre} ({clientes.filter((c) => c.zona_entrega === z.id).length})
            </Button>
          ))}
        </div>
      )}

      {/* Banner modo "ubicar en mapa" */}
      {placingCliente && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-sky-50 border border-sky-200 px-4 py-2.5">
          <p className="text-sm text-sky-800 flex items-center gap-2">
            <Crosshair className="w-4 h-4 shrink-0" />
            Tocá en el mapa la ubicación de <span className="font-semibold">{placingCliente.nombre.trim()}</span>
          </p>
          <Button size="sm" variant="ghost" className="h-7 text-sky-700" onClick={() => setPlacingClientId(null)}>
            <X className="w-4 h-4 mr-1" />Cancelar
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Cargando clientes...</p>
          </div>
        </div>
      ) : !GMAPS_KEY ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Falta configurar la clave de Google Maps.
          </CardContent>
        </Card>
      ) : (
        <Card ref={mapCardRef}>
          <CardContent
            className={`p-0 overflow-hidden rounded-lg ${placingClientId ? "[&_.gm-style]:cursor-crosshair" : ""}`}
            style={{ height: "70vh" }}
          >
            <APIProvider apiKey={GMAPS_KEY}>
              <Map
                defaultCenter={defaultCenter}
                defaultZoom={12}
                gestureHandling="greedy"
                disableDefaultUI={false}
                clickableIcons={false}
                style={{ width: "100%", height: "100%" }}
                onClick={onMapClick}
              >
                <ClusteredMarkers clientes={withCoords} onSelect={setSelectedId} />
                {selected && selected.lat != null && selected.lng != null && (
                  <InfoWindow
                    position={{ lat: selected.lat, lng: selected.lng }}
                    onCloseClick={() => setSelectedId(null)}
                  >
                    <div className="space-y-1 min-w-[180px] text-gray-800">
                      <p className="font-bold text-sm">{selected.nombre.trim()}</p>
                      {selected.domicilio && (
                        <p className="text-xs flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {selected.domicilio}{selected.localidad ? `, ${selected.localidad}` : ""}
                        </p>
                      )}
                      {selected.telefono && (
                        <p className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />{selected.telefono}</p>
                      )}
                      {selected.email && (
                        <p className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" />{selected.email}</p>
                      )}
                      {selected.saldo > 0 && (
                        <p className="text-xs font-semibold text-orange-600">Deuda: ${selected.saldo.toLocaleString("es-AR")}</p>
                      )}
                      <a
                        href={selected.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([selected.domicilio, selected.localidad].filter(Boolean).join(", "))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline block mt-1"
                      >
                        Abrir en Google Maps →
                      </a>
                      <button
                        type="button"
                        onClick={() => iniciarUbicarEnMapa(selected.id)}
                        className="mt-1.5 flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                      >
                        <Crosshair className="w-3 h-3" />
                        Corregir ubicación
                      </button>
                    </div>
                  </InfoWindow>
                )}
              </Map>
            </APIProvider>
          </CardContent>
        </Card>
      )}

      {/* Clientes sin ubicar */}
      {!loading && sinUbicar.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Clientes sin ubicar ({sinUbicar.length}) — ubicalos tocando el mapa o pegando un link de Google Maps
            </p>
            <div className="space-y-1">
              {sinUbicar.map((c) => (
                <div key={c.id} className="border-b last:border-0 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{c.nombre.trim()}</p>
                      <p className="text-xs text-muted-foreground truncate">{[c.domicilio, c.localidad].filter(Boolean).join(", ")}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant={placingClientId === c.id ? "default" : "outline"}
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => iniciarUbicarEnMapa(c.id)}
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        Ubicar en mapa
                      </Button>
                      <Button
                        size="sm"
                        variant={linkClientId === c.id ? "default" : "outline"}
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => {
                          setPlacingClientId(null);
                          setLinkClientId(linkClientId === c.id ? null : c.id);
                          setLinkValue("");
                        }}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Pegar link
                      </Button>
                    </div>
                  </div>
                  {linkClientId === c.id && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        autoFocus
                        placeholder="Pegá el link de Google Maps..."
                        value={linkValue}
                        onChange={(e) => setLinkValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") guardarLink(c.id); }}
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        disabled={linkSaving || !linkValue.trim()}
                        onClick={() => guardarLink(c.id)}
                      >
                        {linkSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
