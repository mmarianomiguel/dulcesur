"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Store,
  Truck,
  Star,
  CreditCard,
  Loader2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Clock,
  DollarSign,
  Package,
  Plus,
  GripVertical,
  Settings,
  Image,
  CalendarDays,
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
  dias_entrega: string[];
  hora_corte: string;
  dias_max_programacion: number;
  max_categorias_destacadas: number;
  pago_mixto_habilitado: boolean;
  recargo_transferencia: number;
  horario_atencion_inicio: string;
  horario_atencion_fin: string;
  dias_atencion: string[];
  minimo_unidades_mayorista: number;
  dias_ocultar_sin_stock: number;
  dias_badge_nuevo: number;
}

interface CategoriaDestacada {
  id: string;
  categoria_id: string;
  orden: number;
  categoria?: { id: string; nombre: string };
}

interface Categoria {
  id: string;
  nombre: string;
}

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const formatARS = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

type Section = "general" | "pedidos" | "categorias" | "pagos";

const NAV_ITEMS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "general", label: "General", icon: <Store className="w-4 h-4" /> },
  { key: "pedidos", label: "Pedidos y Envíos", icon: <Truck className="w-4 h-4" /> },
  { key: "categorias", label: "Categorías Destacadas", icon: <Star className="w-4 h-4" /> },
  { key: "pagos", label: "Pagos", icon: <CreditCard className="w-4 h-4" /> },
];

export default function TiendaConfigPage() {
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [destacadas, setDestacadas] = useState<CategoriaDestacada[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [selectedCatId, setSelectedCatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("general");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: cfg }, { data: dest }, { data: cats }] = await Promise.all([
      supabase.from("tienda_config").select("*").limit(1).single(),
      supabase
        .from("categorias_destacadas")
        .select("*, categoria:categorias(id, nombre)")
        .order("orden"),
      supabase.from("categorias").select("id, nombre").order("nombre"),
    ]);
    if (cfg) setConfig(cfg as TiendaConfig);
    // Deduplicate by categoria_id (keep first occurrence, preserve order)
    const seen = new Set<string>();
    const deduped = ((dest as CategoriaDestacada[]) || []).filter((d) => {
      if (seen.has(d.categoria_id)) return false;
      seen.add(d.categoria_id);
      return true;
    });
    setDestacadas(deduped);
    setCategorias((cats as Categoria[]) || []);
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

  const addDestacada = () => {
    if (!selectedCatId || !config) return;
    if (destacadas.length >= config.max_categorias_destacadas) return;
    if (destacadas.some((d) => d.categoria_id === selectedCatId)) return;
    const cat = categorias.find((c) => c.id === selectedCatId);
    if (!cat) return;
    setDestacadas([
      ...destacadas,
      {
        id: `new-${Date.now()}`,
        categoria_id: selectedCatId,
        orden: destacadas.length + 1,
        categoria: cat,
      },
    ]);
    setSelectedCatId("");
  };

  const removeDestacada = (catId: string) => {
    setDestacadas(
      destacadas
        .filter((d) => d.categoria_id !== catId)
        .map((d, i) => ({ ...d, orden: i + 1 }))
    );
  };

  const moveDestacada = (index: number, direction: "up" | "down") => {
    const newList = [...destacadas];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newList.length) return;
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
    setDestacadas(newList.map((d, i) => ({ ...d, orden: i + 1 })));
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
      dias_entrega: config.dias_entrega,
      hora_corte: config.hora_corte,
      dias_max_programacion: config.dias_max_programacion,
      max_categorias_destacadas: config.max_categorias_destacadas,
      pago_mixto_habilitado: config.pago_mixto_habilitado,
      recargo_transferencia: config.recargo_transferencia,
      horario_atencion_inicio: config.horario_atencion_inicio,
      horario_atencion_fin: config.horario_atencion_fin,
      dias_atencion: config.dias_atencion,
      minimo_unidades_mayorista: config.minimo_unidades_mayorista,
      dias_ocultar_sin_stock: config.dias_ocultar_sin_stock,
      dias_badge_nuevo: config.dias_badge_nuevo,
    }).eq("id", config.id);

    // Sync categorias_destacadas: delete all and re-insert
    await supabase.from("categorias_destacadas").delete().neq("id", "");

    if (destacadas.length > 0) {
      await supabase.from("categorias_destacadas").insert(
        destacadas.map((d, i) => ({
          categoria_id: d.categoria_id,
          orden: i + 1,
        }))
      );
    }

    setSaving(false);
  };

  // Auto-save destacadas to DB whenever they change (debounced)
  const destacadasInitialized = useRef(false);
  useEffect(() => {
    if (!destacadasInitialized.current) {
      // Skip the first render (initial load from DB)
      destacadasInitialized.current = true;
      return;
    }
    const timeout = setTimeout(async () => {
      await supabase.from("categorias_destacadas").delete().neq("id", "");
      if (destacadas.length > 0) {
        await supabase.from("categorias_destacadas").insert(
          destacadas.map((d, i) => ({ categoria_id: d.categoria_id, orden: i + 1 }))
        );
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [destacadas]);

  const availableCats = categorias.filter(
    (c) => !destacadas.some((d) => d.categoria_id === c.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Configuración de Tienda
            </h1>
            <p className="text-sm text-muted-foreground">
              Administra los ajustes de tu tienda online
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

      {/* Body: Sidebar + Content */}
      <div className="flex gap-6">
        {/* Left Sidebar Nav */}
        <nav className="w-56 shrink-0 hidden md:block">
          <div className="sticky top-6 space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeSection === item.key
                    ? "bg-accent text-accent-foreground border-l-2 border-primary pl-[10px]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Right Content */}
        <div className="flex-1 max-w-3xl space-y-6 pb-20">
          {/* Mobile section selector */}
          <div className="flex gap-1 overflow-x-auto md:hidden pb-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeSection === item.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          {/* ======================== GENERAL ======================== */}
          {activeSection === "general" && (
            <div className="space-y-6">
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
                </CardContent>
              </Card>
            </div>
          )}

          {/* ======================== PEDIDOS Y ENVIOS ======================== */}
          {activeSection === "pedidos" && (
            <div className="space-y-6">
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
                          onValueChange={(v) =>
                            update("monto_minimo_pedido", v)
                          }
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
                          onValueChange={(v) =>
                            update("umbral_envio_gratis", v)
                          }
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
                    <div className="grid grid-cols-2 gap-4">
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
          )}

          {/* ======================== CATEGORIAS DESTACADAS ======================== */}
          {activeSection === "categorias" && (
            <div className="space-y-6">
              {/* Max categories config */}
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Máximo de categorías</p>
                      <p className="text-xs text-muted-foreground">
                        Cantidad máxima de categorías destacadas en la tienda
                      </p>
                    </div>
                    <Input
                      type="number"
                      className="w-20 h-9 text-center"
                      value={config?.max_categorias_destacadas ?? 0}
                      onChange={(e) =>
                        update("max_categorias_destacadas", Number(e.target.value))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Category List */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Categorías seleccionadas</CardTitle>
                      <CardDescription>
                        Categorías que se muestran en la página principal
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      {destacadas.length} de {config?.max_categorias_destacadas ?? 0}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {destacadas.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No hay categorías destacadas</p>
                      <p className="text-xs">Agrega una categoría desde el selector de abajo</p>
                    </div>
                  )}

                  {destacadas.map((d, i) => (
                    <div
                      key={d.categoria_id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(i)); e.currentTarget.classList.add("opacity-50"); }}
                      onDragEnd={(e) => { e.currentTarget.classList.remove("opacity-50"); }}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary"); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary"); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("border-primary");
                        const from = Number(e.dataTransfer.getData("text/plain"));
                        if (from === i || isNaN(from)) return;
                        const list = [...destacadas];
                        const [moved] = list.splice(from, 1);
                        list.splice(i, 0, moved);
                        setDestacadas(list.map((d, idx) => ({ ...d, orden: idx + 1 })));
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-all group cursor-grab active:cursor-grabbing"
                    >
                      <div className="text-muted-foreground/40">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium flex-1">
                        {d.categoria?.nombre || d.categoria_id}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => moveDestacada(i, "up")}
                          disabled={i === 0}
                          className="h-7 w-7 p-0"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => moveDestacada(i, "down")}
                          disabled={i === destacadas.length - 1}
                          className="h-7 w-7 p-0"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDestacada(d.categoria_id)}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Separator />

                  {/* Add Category */}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1">
                      <Select
                        value={selectedCatId}
                        onValueChange={(v) => setSelectedCatId(v ?? "")}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Seleccionar categoría..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCats.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      onClick={addDestacada}
                      disabled={
                        !selectedCatId ||
                        destacadas.length >= (config?.max_categorias_destacadas ?? 0)
                      }
                      className="h-9 gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ======================== PAGOS ======================== */}
          {activeSection === "pagos" && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Pago mixto</p>
                        <p className="text-xs text-muted-foreground max-w-sm">
                          Permite a los clientes combinar múltiples métodos de pago
                          en una misma compra
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        update("pago_mixto_habilitado", !config?.pago_mixto_habilitado)
                      }
                      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        config?.pago_mixto_habilitado
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/30"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                          config?.pago_mixto_habilitado
                            ? "translate-x-8"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Transfer surcharge */}
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Recargo por transferencia</p>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        Porcentaje adicional que se aplica cuando el cliente paga con transferencia bancaria
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 max-w-xs">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={config?.recargo_transferencia ?? 0}
                      onChange={(e) => update("recargo_transferencia", Number(e.target.value))}
                      className="h-10"
                    />
                    <span className="text-sm font-medium text-muted-foreground shrink-0">%</span>
                  </div>
                  {(config?.recargo_transferencia ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Ej: un pedido de $10.000 tendrá un recargo de {formatARS(10000 * (config!.recargo_transferencia / 100))} (total: {formatARS(10000 + 10000 * (config!.recargo_transferencia / 100))})
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

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
