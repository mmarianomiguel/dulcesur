"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Store,
  Loader2,
  Check,
  Image,
  Upload,
} from "lucide-react";

interface TiendaConfig {
  id: string;
  nombre_tienda: string;
  logo_url: string;
  descripcion: string;
  tienda_activa: boolean;
  monto_minimo_pedido: number;
  umbral_envio_gratis: number;
}

export default function TiendaGeneralPage() {
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: cfg } = await supabase
      .from("tienda_config")
      .select("id, nombre_tienda, logo_url, descripcion, tienda_activa, monto_minimo_pedido, umbral_envio_gratis")
      .limit(1)
      .single();
    if (cfg) setConfig(cfg as TiendaConfig);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const update = <K extends keyof TiendaConfig>(key: K, value: TiendaConfig[K]) => {
    if (config) setConfig({ ...config, [key]: value });
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    await supabase.from("tienda_config").update({
      nombre_tienda: config.nombre_tienda,
      logo_url: config.logo_url,
      descripcion: config.descripcion,
      tienda_activa: config.tienda_activa,
      monto_minimo_pedido: config.monto_minimo_pedido,
      umbral_envio_gratis: config.umbral_envio_gratis,
    }).eq("id", config.id);
    setSaving(false);
    showAdminToast("Configuración guardada", "success");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">General</h2>
            <p className="text-sm text-muted-foreground">
              Nombre, logo, descripción y estado de la tienda
            </p>
          </div>
        </div>
        {config && (
          <Badge
            variant={config.tienda_activa ? "default" : "secondary"}
            className={
              config.tienda_activa
                ? "bg-emerald-500/15 text-emerald-700 border-emerald-200 hover:bg-emerald-500/15"
                : "bg-red-500/10 text-red-600 border-red-200 hover:bg-red-500/10"
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                config.tienda_activa ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            {config.tienda_activa ? "Activa" : "Inactiva"}
          </Badge>
        )}
      </div>

      {/* Tienda Activa Toggle */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Store className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Estado de la tienda</p>
                <p className="text-xs text-muted-foreground">
                  Activa o desactiva la tienda para los clientes
                </p>
              </div>
            </div>
            <button
              onClick={() => update("tienda_activa", !config?.tienda_activa)}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                config?.tienda_activa ? "bg-emerald-500" : "bg-red-400"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  config?.tienda_activa ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Store Info */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Información general</CardTitle>
          <CardDescription>Nombre, logo y descripción de la tienda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Nombre de la tienda</Label>
            <Input
              value={config?.nombre_tienda || ""}
              onChange={(e) => update("nombre_tienda", e.target.value)}
              placeholder="Mi Tienda"
            />
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-start gap-4">
              <div className="flex-1 flex gap-2">
                <Input
                  value={config?.logo_url || ""}
                  onChange={(e) => update("logo_url", e.target.value)}
                  placeholder="https://... o subir imagen"
                  className="flex-1"
                />
                <label className="cursor-pointer shrink-0 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9">
                  <Upload className="w-4 h-4" />
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append("file", file);
                    try {
                      const res = await fetch("/api/upload", { method: "POST", body: formData });
                      if (!res.ok) { showAdminToast("Error al subir imagen", "error"); return; }
                      const data = await res.json();
                      if (data.secure_url) {
                        update("logo_url", data.secure_url);
                        showAdminToast("Logo subido", "success");
                      }
                    } catch { showAdminToast("Error al subir imagen", "error"); }
                  }} />
                </label>
              </div>
              {config?.logo_url ? (
                <div className="w-16 h-16 rounded-xl border bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={config.logo_url}
                    alt="Logo preview"
                    className="w-full h-full object-contain p-1"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border border-dashed bg-muted/30 flex items-center justify-center shrink-0">
                  <Image className="w-5 h-5 text-muted-foreground/50" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={config?.descripcion || ""}
              onChange={(e) => update("descripcion", e.target.value)}
              placeholder="Describe tu tienda..."
              className="min-h-[100px] resize-none"
            />
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label>Monto mínimo de pedido</Label>
              <p className="text-xs text-muted-foreground">Monto mínimo para que el cliente pueda hacer un pedido</p>
              <MoneyInput
                value={config?.monto_minimo_pedido ?? 0}
                onValueChange={(v) => update("monto_minimo_pedido", v)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label>Umbral envío gratis</Label>
              <p className="text-xs text-muted-foreground">Monto mínimo para acceder a envío sin costo</p>
              <MoneyInput
                value={config?.umbral_envio_gratis ?? 0}
                onValueChange={(v) => update("umbral_envio_gratis", v)}
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sticky Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-end px-6 lg:px-8 py-3">
          <Button onClick={save} disabled={saving} className="min-w-[160px]">
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  );
}
