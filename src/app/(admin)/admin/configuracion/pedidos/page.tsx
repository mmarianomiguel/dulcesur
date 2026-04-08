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
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Save,
  Clock,
  DollarSign,
  Package,
  Star,
  CalendarDays,
} from "lucide-react";

interface TiendaConfig {
  id: string;
  monto_minimo_pedido: number;
  umbral_envio_gratis: number;
  dias_entrega: string[];
  hora_corte: string;
  dias_max_programacion: number;
  horario_atencion_inicio: string;
  horario_atencion_fin: string;
  dias_atencion: string[];
  minimo_unidades_mayorista: number;
  dias_ocultar_sin_stock: number;
  dias_badge_nuevo: number;
}

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const formatARS = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

export default function PedidosConfigPage() {
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: cfg } = await supabase
      .from("tienda_config")
      .select("*")
      .limit(1)
      .single();
    if (cfg) {
      setConfig(cfg as TiendaConfig);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const update = <K extends keyof TiendaConfig>(key: K, value: TiendaConfig[K]) => {
    if (config) setConfig({ ...config, [key]: value });
  };

  const toggleDia = (dia: string) => {
    if (!config) return;
    const dias = config.dias_entrega.includes(dia)
      ? config.dias_entrega.filter((d) => d !== dia)
      : [...config.dias_entrega, dia];
    update("dias_entrega", dias);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);

    const { error } = await supabase
      .from("tienda_config")
      .update({
        monto_minimo_pedido: config.monto_minimo_pedido,
        umbral_envio_gratis: config.umbral_envio_gratis,
        dias_entrega: config.dias_entrega,
        hora_corte: config.hora_corte,
        dias_max_programacion: config.dias_max_programacion,
        horario_atencion_inicio: config.horario_atencion_inicio,
        horario_atencion_fin: config.horario_atencion_fin,
        dias_atencion: config.dias_atencion,
        minimo_unidades_mayorista: config.minimo_unidades_mayorista,
        dias_ocultar_sin_stock: config.dias_ocultar_sin_stock,
        dias_badge_nuevo: config.dias_badge_nuevo,
      })
      .eq("id", config.id);

    setSaving(false);

    if (error) {
      showAdminToast("Error al guardar configuración");
    } else {
      showAdminToast("Configuración de pedidos guardada");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Pedidos y Envíos</h2>
            <p className="text-sm text-muted-foreground">
              Horarios, días de entrega y reglas de pedidos
            </p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Guardar
        </Button>
      </div>

      <Separator />

      {/* Currency Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">
                  Monto mínimo para retiro en local
                </Label>
                <MoneyInput
                  value={config?.monto_minimo_pedido ?? 0}
                  onValueChange={(v) => update("monto_minimo_pedido", v)}
                  className="h-9"
                />
                {config?.monto_minimo_pedido ? (
                  <p className="text-lg font-semibold text-foreground">
                    {formatARS(config.monto_minimo_pedido)}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">
                  Monto mínimo de compra para envíos
                </Label>
                <MoneyInput
                  value={config?.umbral_envio_gratis ?? 0}
                  onValueChange={(v) => update("umbral_envio_gratis", v)}
                  className="h-9"
                />
                {config?.umbral_envio_gratis ? (
                  <p className="text-lg font-semibold text-foreground">
                    {formatARS(config.umbral_envio_gratis)}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dias de Entrega */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Días de entrega</CardTitle>
          </div>
          <CardDescription>
            Selecciona los días en que realizas entregas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {DIAS_SEMANA.map((dia) => {
              const selected = config?.dias_entrega?.includes(dia) ?? false;
              return (
                <button
                  key={dia}
                  onClick={() => toggleDia(dia)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {dia}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Hora de corte + Dias max */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">
                  Hora de corte
                </Label>
                <Input
                  type="time"
                  value={config?.hora_corte || ""}
                  onChange={(e) => update("hora_corte", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <CalendarDays className="w-5 h-5 text-violet-500" />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">
                  Días máx. de programación
                </Label>
                <Input
                  type="number"
                  value={config?.dias_max_programacion ?? 0}
                  onChange={(e) =>
                    update("dias_max_programacion", Number(e.target.value))
                  }
                  className="h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Horarios y Mayorista */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-500" />
              Horarios de atención
            </CardTitle>
            <CardDescription className="text-xs">
              Se muestra en la navbar, info de contacto y envíos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">Hora apertura</Label>
                <Input
                  type="time"
                  value={config?.horario_atencion_inicio ?? "08:00"}
                  onChange={(e) => update("horario_atencion_inicio", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">Hora cierre</Label>
                <Input
                  type="time"
                  value={config?.horario_atencion_fin ?? "14:00"}
                  onChange={(e) => update("horario_atencion_fin", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-normal">Días de atención</Label>
              <div className="flex flex-wrap gap-2">
                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((dia) => {
                  const selected = config?.dias_atencion?.includes(dia) ?? false;
                  return (
                    <button
                      key={dia}
                      type="button"
                      onClick={() => {
                        const current = config?.dias_atencion || [];
                        const next = selected
                          ? current.filter((d) => d !== dia)
                          : [...current, dia];
                        update("dias_atencion", next);
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        selected
                          ? "bg-violet-100 text-violet-700 ring-1 ring-violet-300"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {dia.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">
                  Mínimo de unidades para precio mayorista
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={config?.minimo_unidades_mayorista ?? 3}
                  onChange={(e) => update("minimo_unidades_mayorista", Number(e.target.value))}
                  className="h-9 w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Cantidad mínima de unidades sueltas para acceder a precio mayorista
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-gray-500" />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">
                  Ocultar productos sin stock después de (días)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={config?.dias_ocultar_sin_stock ?? 7}
                  onChange={(e) => update("dias_ocultar_sin_stock", Number(e.target.value))}
                  className="h-9 w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Los productos sin stock se ocultan de la tienda si no se actualizan en esta cantidad de días. Poné 0 para no ocultar nunca.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
                <Star className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground font-normal">
                  Días para badge &quot;Nuevo&quot;
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={config?.dias_badge_nuevo ?? 7}
                  onChange={(e) => update("dias_badge_nuevo", Number(e.target.value))}
                  className="h-9 w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Los productos creados en los últimos X días muestran el badge &quot;Nuevo&quot;. Poné 0 para desactivar.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
