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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Store,
  Loader2,
  Check,
  Image as ImageIcon,
  Upload,
  X,
  AlertTriangle,
  Search as SearchIcon,
  ShoppingCart,
} from "lucide-react";

interface TiendaConfig {
  id: string;
  nombre_tienda: string;
  logo_url: string;
  favicon_url: string;
  og_image_url: string;
  descripcion: string;
  meta_descripcion: string;
  mensaje_mantenimiento: string;
  tienda_activa: boolean;
}

const META_DESC_MAX = 160;

// ── Logo / Favicon / OG dropzone ───────────────────────────────────────────

function ImageDropzone({
  value,
  onChange,
  label,
  hint,
  ratio = "square",
  height = "h-32",
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  ratio?: "square" | "wide" | "tiny";
  height?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      showAdminToast("El archivo debe ser una imagen", "error");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        showAdminToast("Error al subir imagen", "error");
        return;
      }
      const data = await res.json();
      if (data.secure_url) {
        onChange(data.secure_url);
        showAdminToast(`${label} actualizado`, "success");
      }
    } catch {
      showAdminToast("Error al subir imagen", "error");
    } finally {
      setUploading(false);
    }
  };

  const aspectClass = ratio === "wide" ? "aspect-[1.91/1]" : ratio === "tiny" ? "aspect-square w-16" : "aspect-square";

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative ${aspectClass} ${ratio !== "tiny" ? height : ""} rounded-xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden group flex items-center justify-center ${
          dragOver ? "border-primary bg-primary/5" : value ? "border-border bg-muted/20" : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5"
        }`}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="w-full h-full object-contain p-2" />
            {/* Botones icon-only en esquina sup. derecha — siempre legibles aunque el dropzone sea chico */}
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="w-7 h-7 flex items-center justify-center bg-white text-foreground rounded-md shadow hover:bg-gray-100"
                title="Reemplazar imagen"
                aria-label="Reemplazar imagen"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                className="w-7 h-7 flex items-center justify-center bg-red-500 text-white rounded-md shadow hover:bg-red-600"
                title="Quitar imagen"
                aria-label="Quitar imagen"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : uploading ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground px-3 text-center">
            <Upload className="w-5 h-5" />
            <p className="text-xs font-medium">Arrastrá una imagen o hacé click</p>
            {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="o pegá una URL: https://..."
        className="h-7 text-[11px]"
      />
    </div>
  );
}

// ── Mini preview del navbar ───────────────────────────────────────────────

function NavbarPreview({ nombre, logo }: { nombre: string; logo: string }) {
  return (
    <div className="rounded-lg border bg-white overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {logo ? (
            <img src={logo} alt={nombre} className="h-8 w-auto max-w-[120px] object-contain" />
          ) : (
            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
            </div>
          )}
          <span className="text-sm font-bold truncate text-gray-900">{nombre || "Tu Tienda"}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-white border rounded-md text-[10px] text-muted-foreground">
            <SearchIcon className="w-3 h-3" />
            Buscar...
          </div>
          <ShoppingCart className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground px-3 py-1.5 bg-muted/30 text-center">
        Así se ve el header de tu tienda
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function TiendaGeneralPage() {
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: cfg } = await supabase
      .from("tienda_config")
      .select("id, nombre_tienda, logo_url, favicon_url, og_image_url, descripcion, meta_descripcion, mensaje_mantenimiento, tienda_activa")
      .limit(1)
      .single();
    if (cfg) {
      setConfig({
        ...(cfg as any),
        favicon_url: (cfg as any).favicon_url || "",
        og_image_url: (cfg as any).og_image_url || "",
        meta_descripcion: (cfg as any).meta_descripcion || "",
        mensaje_mantenimiento: (cfg as any).mensaje_mantenimiento || "",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const update = <K extends keyof TiendaConfig>(key: K, value: TiendaConfig[K]) => {
    if (config) setConfig({ ...config, [key]: value });
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    await supabase.from("tienda_config").update({
      nombre_tienda: config.nombre_tienda,
      logo_url: config.logo_url,
      favicon_url: config.favicon_url || null,
      og_image_url: config.og_image_url || null,
      descripcion: config.descripcion,
      meta_descripcion: config.meta_descripcion || null,
      mensaje_mantenimiento: config.mensaje_mantenimiento || null,
      tienda_activa: config.tienda_activa,
    }).eq("id", config.id);
    setSaving(false);
    showAdminToast("Configuración guardada", "success");
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const metaCount = (config.meta_descripcion || "").length;
  const metaCountColor =
    metaCount === 0 ? "text-muted-foreground" :
    metaCount > META_DESC_MAX ? "text-red-600" :
    metaCount < 50 ? "text-amber-600" :
    "text-emerald-600";

  return (
    <div className="space-y-5 pb-24">
      {/* Header con toggle integrado */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">General</h2>
            <p className="text-sm text-muted-foreground">
              Identidad, SEO y estado de la tienda
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => update("tienda_activa", !config.tienda_activa)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            config.tienda_activa
              ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
              : "bg-red-50 border-red-200 hover:bg-red-100"
          }`}
          title="Click para cambiar el estado de la tienda"
        >
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              config.tienda_activa ? "bg-emerald-500" : "bg-red-400"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                config.tienda_activa ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </span>
          <span className={`text-xs font-semibold ${config.tienda_activa ? "text-emerald-700" : "text-red-700"}`}>
            {config.tienda_activa ? "Tienda activa" : "Tienda cerrada"}
          </span>
        </button>
      </div>

      {/* Mensaje de mantenimiento (solo cuando inactiva) */}
      {!config.tienda_activa && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Tu tienda está cerrada</p>
                  <p className="text-xs text-amber-800">Los clientes verán el mensaje de abajo en lugar del catálogo.</p>
                </div>
                <Textarea
                  value={config.mensaje_mantenimiento}
                  onChange={(e) => update("mensaje_mantenimiento", e.target.value)}
                  placeholder="Ej: Estamos cerrados temporalmente. Volvemos el lunes a las 8hs. ¡Disculpá las molestias!"
                  className="min-h-[80px] resize-none bg-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identidad */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identidad</CardTitle>
          <CardDescription>Cómo se ve tu tienda para los clientes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label>Nombre de la tienda</Label>
              <Input
                value={config.nombre_tienda || ""}
                onChange={(e) => update("nombre_tienda", e.target.value)}
                placeholder="Mi Tienda"
              />
              <p className="text-[11px] text-muted-foreground">
                Aparece en el navbar, en la pestaña del browser y al compartir el link.
              </p>
            </div>
            <div>
              <Label className="mb-1.5 block">Vista previa del navbar</Label>
              <NavbarPreview nombre={config.nombre_tienda} logo={config.logo_url} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <ImageDropzone
                label="Logo"
                hint="Recomendado: PNG transparente, 200×80px"
                value={config.logo_url || ""}
                onChange={(v) => update("logo_url", v)}
              />
            </div>
            <div>
              <ImageDropzone
                label="Favicon"
                hint="Imagen de la pestaña del browser. PNG cuadrado 64×64px"
                value={config.favicon_url || ""}
                onChange={(v) => update("favicon_url", v)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descripción interna</Label>
            <Textarea
              value={config.descripcion || ""}
              onChange={(e) => update("descripcion", e.target.value)}
              placeholder="Describe tu tienda... (uso interno y footer)"
              className="min-h-[80px] resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Para uso interno y el footer. Para SEO/Google usá el campo de abajo.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SEO y Compartir */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SEO y compartir</CardTitle>
          <CardDescription>Cómo aparece tu tienda en Google y al pegar el link en WhatsApp/redes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Descripción para Google (meta description)</Label>
                <span className={`text-[11px] tabular-nums ${metaCountColor}`}>
                  {metaCount}/{META_DESC_MAX}
                </span>
              </div>
              <Textarea
                value={config.meta_descripcion || ""}
                onChange={(e) => update("meta_descripcion", e.target.value)}
                placeholder="Resumen breve que aparece en los resultados de búsqueda. Ideal: 120-160 caracteres."
                className="min-h-[80px] resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Si lo dejás vacío, se usa la descripción interna.
              </p>
            </div>
            <div>
              <ImageDropzone
                label="Imagen al compartir (Open Graph)"
                hint="WhatsApp/IG/FB. Recomendado: 1200×630px"
                value={config.og_image_url || ""}
                onChange={(v) => update("og_image_url", v)}
                ratio="wide"
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
