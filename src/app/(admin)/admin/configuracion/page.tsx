"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Empresa } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Building2, Loader2, Check, MapPin, ChevronDown, ChevronRight } from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";

export default function EmpresaPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mapsUrlInput, setMapsUrlInput] = useState("");
  const [resolvingMaps, setResolvingMaps] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("empresa").select("*").limit(1).single();
    setEmpresa(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const e = (key: keyof Empresa, value: string) => {
    if (empresa) setEmpresa({ ...empresa, [key]: value });
  };

  const updateLocationFromMapsUrl = async () => {
    if (!empresa) return;
    const url = mapsUrlInput.trim();
    if (!url) {
      showAdminToast("Pegá un link de Google Maps", "error");
      return;
    }
    setResolvingMaps(true);
    try {
      const res = await fetch("/api/maps-url-to-coords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        showAdminToast(data?.error || "No se pudo procesar el link", "error");
        return;
      }
      const { lat, lng } = data;
      const { error } = await supabase
        .from("empresa")
        .update({ lat, lng })
        .eq("id", empresa.id);
      if (error) {
        showAdminToast("Error al guardar las coordenadas", "error");
        return;
      }
      setEmpresa({ ...empresa, lat, lng } as any);
      setMapsUrlInput("");
      showAdminToast(`Ubicación actualizada (${lat.toFixed(5)}, ${lng.toFixed(5)})`, "success");
    } catch (err) {
      console.error(err);
      showAdminToast("Error de red al procesar el link", "error");
    } finally {
      setResolvingMaps(false);
    }
  };

  const save = async () => {
    if (!empresa) return;
    setSaving(true);
    await supabase.from("empresa").update({
      nombre: empresa.nombre,
      razon_social: empresa.razon_social,
      cuit: empresa.cuit,
      situacion_iva: empresa.situacion_iva,
      domicilio: empresa.domicilio,
      localidad: empresa.localidad,
      telefono: empresa.telefono,
    }).eq("id", empresa.id);
    setSaving(false);
    showAdminToast("Datos de empresa guardados correctamente");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Datos de la empresa</h2>
          <p className="text-sm text-muted-foreground">Información general y fiscal de tu negocio</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Identidad comercial */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Identidad comercial</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Nombre comercial</Label>
                <Input value={empresa?.nombre || ""} onChange={(ev) => e("nombre", ev.target.value)} placeholder="Dulce Sur" />
              </div>
              <div className="space-y-2">
                <Label>Razón social</Label>
                <Input value={empresa?.razon_social || ""} onChange={(ev) => e("razon_social", ev.target.value)} />
              </div>
            </div>
          </div>
          <Separator />
          {/* Datos fiscales */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Datos fiscales</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>CUIT</Label>
                <Input value={empresa?.cuit || ""} onChange={(ev) => e("cuit", ev.target.value)} placeholder="XX-XXXXXXXX-X" />
              </div>
              <div className="space-y-2">
                <Label>Situación IVA</Label>
                <Select value={empresa?.situacion_iva || ""} onValueChange={(v) => e("situacion_iva", v || "")}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar situación IVA" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                    <SelectItem value="Monotributista">Monotributista</SelectItem>
                    <SelectItem value="Exento">Exento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <Separator />
          {/* Contacto */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contacto</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Domicilio fiscal</Label>
                <Input value={empresa?.domicilio || ""} onChange={(ev) => e("domicilio", ev.target.value)} placeholder="Ej: Eduardo Gutierrez 5157" />
              </div>
              <div className="space-y-2">
                <Label>Localidad</Label>
                <Input value={empresa?.localidad || ""} onChange={(ev) => e("localidad", ev.target.value)} placeholder="Ej: Longchamps, Buenos Aires" />
                <p className="text-[11px] text-muted-foreground">Se usa como punto de partida para optimizar la ruta de entregas.</p>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={empresa?.telefono || ""} onChange={(ev) => e("telefono", ev.target.value)} />
              </div>
            </div>
          </div>
          <Separator />
          {/* Avanzado — ubicación exacta para hoja de ruta */}
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Avanzado
            </button>
            {advancedOpen && (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Ubicación exacta del local</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Punto de partida para optimizar la hoja de ruta. Pegá el link de tu local desde Google Maps (compartir → copiar link) y se actualizan las coordenadas automáticamente.
                      </p>
                      {empresa && ((empresa as any).lat != null && (empresa as any).lng != null) && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 font-mono">
                          Actual: {Number((empresa as any).lat).toFixed(5)}, {Number((empresa as any).lng).toFixed(5)}{" "}
                          <a
                            href={`https://www.google.com/maps?q=${(empresa as any).lat},${(empresa as any).lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline ml-1"
                          >
                            Ver en Maps
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={mapsUrlInput}
                      onChange={(ev) => setMapsUrlInput(ev.target.value)}
                      placeholder="https://maps.app.goo.gl/..."
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={updateLocationFromMapsUrl}
                      disabled={resolvingMaps || !mapsUrlInput.trim()}
                      variant="outline"
                    >
                      {resolvingMaps ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                      Actualizar ubicación
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Separator />
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
