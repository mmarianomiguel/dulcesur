"use client";

import { useEffect, useState, useCallback } from "react";
import { showAdminToast } from "@/components/admin-toast";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ShoppingCart, Loader2, Check, AlertTriangle, Eye, MessageSquare } from "lucide-react";

interface CheckoutConfig {
  id: string;
  categorias_excluidas_minimo: string[];
  excluidas_aplican_a_retiro: boolean;
  mostrar_progreso_minimo: boolean;
  mostrar_desglose_excluidos: boolean;
  mostrar_badge_excluidos: boolean;
  texto_badge_excluidos: string;
  mensaje_minimo_no_alcanzado: string;
}

interface Categoria {
  id: string;
  nombre: string;
}

const DEFAULTS: Omit<CheckoutConfig, "id"> = {
  categorias_excluidas_minimo: [],
  excluidas_aplican_a_retiro: false,
  mostrar_progreso_minimo: true,
  mostrar_desglose_excluidos: true,
  mostrar_badge_excluidos: true,
  texto_badge_excluidos: "No suma al mínimo de envío",
  mensaje_minimo_no_alcanzado: "Sumá {faltante} más en productos para llegar al mínimo de {minimo} y activar el envío a domicilio.",
};

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 w-full text-left p-3 rounded-lg hover:bg-muted/40 transition-colors"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors mt-0.5 ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>}
      </span>
    </button>
  );
}

export default function CheckoutConfigPage() {
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missingMigration, setMissingMigration] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: cfg, error: cfgErr }, { data: cats }] = await Promise.all([
      supabase
        .from("tienda_config")
        .select(
          "id, categorias_excluidas_minimo, excluidas_aplican_a_retiro, mostrar_progreso_minimo, mostrar_desglose_excluidos, mostrar_badge_excluidos, texto_badge_excluidos, mensaje_minimo_no_alcanzado"
        )
        .limit(1)
        .single(),
      supabase.from("categorias").select("id, nombre").order("nombre").range(0, 999),
    ]);

    if (cfgErr || !cfg) {
      // Las columnas nuevas no existen todavía. Cargamos solo el id.
      const { data: legacy } = await supabase.from("tienda_config").select("id").limit(1).single();
      setMissingMigration(true);
      setConfig({ id: (legacy as { id: string } | null)?.id ?? "", ...DEFAULTS });
    } else {
      const c = cfg as Partial<CheckoutConfig> & { id: string };
      setConfig({
        id: c.id,
        categorias_excluidas_minimo: c.categorias_excluidas_minimo ?? [],
        excluidas_aplican_a_retiro: c.excluidas_aplican_a_retiro ?? false,
        mostrar_progreso_minimo: c.mostrar_progreso_minimo ?? true,
        mostrar_desglose_excluidos: c.mostrar_desglose_excluidos ?? true,
        mostrar_badge_excluidos: c.mostrar_badge_excluidos ?? true,
        texto_badge_excluidos: c.texto_badge_excluidos ?? DEFAULTS.texto_badge_excluidos,
        mensaje_minimo_no_alcanzado: c.mensaje_minimo_no_alcanzado ?? DEFAULTS.mensaje_minimo_no_alcanzado,
      });
    }
    setCategorias((cats as Categoria[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const update = <K extends keyof CheckoutConfig>(key: K, value: CheckoutConfig[K]) => {
    if (config) setConfig({ ...config, [key]: value });
    setDirty(true);
    setJustSaved(false);
  };

  const toggleCategoria = (catId: string) => {
    if (!config) return;
    const set = new Set(config.categorias_excluidas_minimo);
    if (set.has(catId)) set.delete(catId);
    else set.add(catId);
    update("categorias_excluidas_minimo", [...set]);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from("tienda_config")
      .update({
        categorias_excluidas_minimo: config.categorias_excluidas_minimo,
        excluidas_aplican_a_retiro: config.excluidas_aplican_a_retiro,
        mostrar_progreso_minimo: config.mostrar_progreso_minimo,
        mostrar_desglose_excluidos: config.mostrar_desglose_excluidos,
        mostrar_badge_excluidos: config.mostrar_badge_excluidos,
        texto_badge_excluidos: config.texto_badge_excluidos,
        mensaje_minimo_no_alcanzado: config.mensaje_minimo_no_alcanzado,
      })
      .eq("id", config.id);
    setSaving(false);
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      if (msg.includes("column") || msg.includes("does not exist")) {
        showAdminToast("Falta aplicar la migration en Supabase", "error");
        setMissingMigration(true);
      } else {
        showAdminToast("Error al guardar: " + error.message, "error");
      }
      return;
    }
    setMissingMigration(false);
    setDirty(false);
    setJustSaved(true);
    showAdminToast("Configuración guardada", "success");
    // Volver a refetchear para confirmar visualmente lo que quedó en BD
    fetchData();
    setTimeout(() => setJustSaved(false), 2500);
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const seleccionadas = config.categorias_excluidas_minimo.length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ShoppingCart className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Checkout</h2>
          <p className="text-sm text-muted-foreground">Cómo se calcula y muestra el mínimo en el carrito y checkout</p>
        </div>
      </div>

      {missingMigration && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900">Falta aplicar la migration en Supabase</p>
              <p className="text-amber-800 text-xs mt-0.5">
                Esta sección usa columnas nuevas en <code className="bg-amber-100 px-1 rounded">tienda_config</code>.
                Aplicá <code className="bg-amber-100 px-1 rounded">supabase/migrations/20260506_minimo_envio_excluidas.sql</code> antes de guardar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card 1: Categorías excluidas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Categorías excluidas del mínimo de envío</CardTitle>
          <CardDescription>
            Los productos de estas categorías no cuentan para el mínimo de envío a domicilio.
            Igual aparecen en el total y se cobran normalmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categorias.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay categorías cargadas.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-2">
              {categorias.map((cat) => {
                const checked = config.categorias_excluidas_minimo.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategoria(cat.id)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      checked
                        ? "bg-primary/5 border-primary/40 text-foreground"
                        : "bg-background border-border hover:border-primary/30 text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}
                    >
                      {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                    </span>
                    <span className="truncate">{cat.nombre}</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {seleccionadas === 0 ? "Ninguna categoría excluida — el mínimo se calcula sobre todos los productos." : `${seleccionadas} categoría${seleccionadas !== 1 ? "s" : ""} excluida${seleccionadas !== 1 ? "s" : ""}.`}
          </p>

          <div className="border-t pt-3">
            <Toggle
              checked={config.excluidas_aplican_a_retiro}
              onChange={(v) => update("excluidas_aplican_a_retiro", v)}
              label="Excluir también del mínimo de retiro en local"
              description="Por defecto, las categorías excluidas solo afectan al mínimo de envío. Activá esto si no querés que cuenten para retiro tampoco."
            />
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Visualización */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="w-4 h-4 text-muted-foreground" />
            Visualización en el carrito
          </CardTitle>
          <CardDescription>Qué le mostramos al cliente cuando arma el pedido</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <Toggle
            checked={config.mostrar_progreso_minimo}
            onChange={(v) => update("mostrar_progreso_minimo", v)}
            label="Mostrar barra de progreso al mínimo"
            description="Aparece en el cart drawer y en el aviso del checkout. Muestra visualmente cuánto le falta al cliente."
          />
          <Toggle
            checked={config.mostrar_desglose_excluidos}
            onChange={(v) => update("mostrar_desglose_excluidos", v)}
            label="Desglosar productos excluidos en el subtotal"
            description="En cart drawer, /carrito y /checkout: dos líneas separadas — subtotal que cuenta para envío, y aparte el monto excluido."
          />
          <Toggle
            checked={config.mostrar_badge_excluidos}
            onChange={(v) => update("mostrar_badge_excluidos", v)}
            label="Mostrar badge en cards de productos excluidos"
            description="Etiqueta corta en la card del producto en el catálogo, avisando que no suma al mínimo."
          />

          <div className="border-t pt-4 mt-2 space-y-2">
            <Label className="text-sm">Texto del badge</Label>
            <Input
              value={config.texto_badge_excluidos}
              onChange={(e) => update("texto_badge_excluidos", e.target.value)}
              placeholder="Ej: No suma al mínimo de envío"
            />
            <p className="text-[11px] text-muted-foreground">
              Aparece en la card del producto cuando la categoría está excluida.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Mensaje de mínimo no alcanzado */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            Mensaje cuando no llega al mínimo
          </CardTitle>
          <CardDescription>
            Texto del cuerpo del aviso azul/verde en el <code className="bg-muted px-1 rounded text-[11px]">/checkout</code> cuando el subtotal elegible no alcanza el mínimo de envío.
            El título (&quot;¡Casi listo!&quot; / &quot;¡A un paso!&quot;) y la aclaración sobre categorías excluidas se generan automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={config.mensaje_minimo_no_alcanzado}
            onChange={(e) => update("mensaje_minimo_no_alcanzado", e.target.value)}
            placeholder="Sumá {faltante} más en productos para llegar al mínimo de {minimo} y activar el envío a domicilio."
            className="min-h-[80px] resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            Variables disponibles: <code className="bg-muted px-1 rounded">{"{faltante}"}</code> (cuánto le falta) · <code className="bg-muted px-1 rounded">{"{minimo}"}</code> (mínimo configurado) · <code className="bg-muted px-1 rounded">{"{subtotal}"}</code> (lo que el cliente ya tiene)
          </p>
        </CardContent>
      </Card>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-end gap-3 px-6 lg:px-8 py-3">
          {dirty && !saving && (
            <span className="text-xs text-amber-600 font-medium animate-pulse">Cambios sin guardar</span>
          )}
          {justSaved && (
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          <Button
            onClick={save}
            disabled={saving || (!dirty && !justSaved)}
            className={`min-w-[160px] ${justSaved ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>
            ) : justSaved ? (
              <><Check className="w-4 h-4 mr-2" /> Guardado</>
            ) : (
              <><Check className="w-4 h-4 mr-2" /> Guardar cambios</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
