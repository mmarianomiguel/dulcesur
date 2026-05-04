"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showAdminToast } from "@/components/admin-toast";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { ArrowLeft, Plus, Pencil, Trash2, Calendar, Power, PowerOff, Upload, X as XIcon, Image as ImageIcon, Tag, Layout, Zap, Megaphone, Clock } from "lucide-react";

type HeroTipo = "personalizado" | "aumento_marca" | "oferta_descuento" | "producto_destacado" | "imagen_libre" | "marca_destacada" | "categoria_destacada" | "oferta_countdown";

const TIPO_META: Record<HeroTipo, { label: string; descripcion: string; Icon: typeof Tag }> = {
  personalizado: { label: "Texto sobre gradiente", descripcion: "Banner clásico con título, subtítulo, botón y fondo de color", Icon: Megaphone },
  imagen_libre: { label: "Imagen libre", descripcion: "Subís tu propia imagen pre-armada (Canva/diseñador)", Icon: ImageIcon },
  producto_destacado: { label: "Producto destacado", descripcion: "Foto del producto + precio + tachado + CTA", Icon: Tag },
  marca_destacada: { label: "Marca destacada", descripcion: "Foto + nombre de marca + CTA", Icon: Tag },
  categoria_destacada: { label: "Categoría destacada", descripcion: "Foto + nombre + cantidad de productos", Icon: Layout },
  oferta_descuento: { label: "Oferta / descuento", descripcion: "Promoción con descuento activo", Icon: Zap },
  oferta_countdown: { label: "Oferta con countdown", descripcion: "Promoción con timer al fin de la fecha", Icon: Clock },
  aumento_marca: { label: "Aumento de marca", descripcion: "% promedio de aumento de una marca (auto)", Icon: Megaphone },
};

interface HeroTemplate {
  id: string;
  nombre: string;
  tipo: HeroTipo;
  titulo: string;
  subtitulo: string;
  boton_texto: string;
  boton_link: string;
  boton_secundario_texto: string;
  boton_secundario_link: string;
  color_inicio: string;
  color_fin: string;
  imagen_url: string | null;
  mostrar_countdown: boolean;
  placeholders: string[];
}

interface HeroProgramacion {
  id: string;
  template_id: string | null;
  tipo: HeroTipo;
  titulo: string;
  subtitulo: string;
  boton_texto: string;
  boton_link: string;
  boton_secundario_texto: string;
  boton_secundario_link: string;
  color_inicio: string;
  color_fin: string;
  fecha_desde: string;
  fecha_hasta: string;
  activo: boolean;
  prioridad: number;
  marcas: string[] | null;
  auto_porcentaje: boolean;
  producto_id: string | null;
  descuento_id: string | null;
  imagen_url: string | null;
  marca_id: string | null;
  categoria_id: string | null;
  mostrar_countdown: boolean;
}

interface ProductoLite { id: string; nombre: string; precio: number; precio_anterior: number | null; imagen_url: string | null }
interface DescuentoLite { id: string; nombre: string; porcentaje: number | null; activo: boolean; fecha_inicio: string | null; fecha_fin: string | null }
interface MarcaLite { id: string; nombre: string }
interface CategoriaLite { id: string; nombre: string }

// Helper: upload file to /api/upload, returns secure_url or null
async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) return null;
    const data = await res.json();
    return data.secure_url || null;
  } catch { return null; }
}

// Drop zone para imagen — pequeño, embedded en formulario
function ImageDropField({ value, onChange, label = "Imagen de fondo", hint }: { value: string | null; onChange: (url: string | null) => void; label?: string; hint?: string }) {
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const handleFile = async (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    const url = await uploadImage(file);
    setUploading(false);
    if (url) { onChange(url); showAdminToast("Imagen subida", "success"); }
    else showAdminToast("Error al subir", "error");
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0] || null); }}
        className={`relative aspect-[1.91/1] rounded-lg border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden cursor-pointer group ${drag ? "border-pink-400 bg-pink-50" : value ? "border-gray-200" : "border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
        onClick={() => document.getElementById(`imgdrop-${label}`)?.click()}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={label} className="w-full h-full object-cover" />
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" onClick={(e) => { e.stopPropagation(); document.getElementById(`imgdrop-${label}`)?.click(); }} className="w-7 h-7 bg-white text-gray-900 rounded shadow flex items-center justify-center hover:bg-gray-100" title="Reemplazar"><Upload className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(null); }} className="w-7 h-7 bg-red-500 text-white rounded shadow flex items-center justify-center hover:bg-red-600" title="Quitar"><XIcon className="w-3.5 h-3.5" /></button>
            </div>
          </>
        ) : uploading ? (
          <div className="text-xs text-muted-foreground">Subiendo…</div>
        ) : (
          <div className="text-center text-muted-foreground px-3">
            <Upload className="w-5 h-5 mx-auto mb-1" />
            <p className="text-xs font-medium">Arrastrá una imagen o hacé click</p>
            {hint && <p className="text-[10px] opacity-70 mt-0.5">{hint}</p>}
          </div>
        )}
        <input id={`imgdrop-${label}`} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0] || null); e.target.value = ""; }} />
      </div>
      <Input value={value || ""} onChange={(e) => onChange(e.target.value || null)} placeholder="o pegá URL" className="h-7 text-[11px]" />
    </div>
  );
}

const PLACEHOLDER_RE = /\{([a-z_][a-z0-9_]*)\}/gi;

function extractPlaceholders(...textos: string[]): string[] {
  const set = new Set<string>();
  for (const t of textos) {
    if (!t) continue;
    for (const m of t.matchAll(PLACEHOLDER_RE)) set.add(m[1]);
  }
  return [...set];
}

function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (_, key) => values[key] ?? `{${key}}`);
}

function emptyTemplate(): HeroTemplate {
  return {
    id: "",
    nombre: "",
    tipo: "personalizado",
    titulo: "",
    subtitulo: "",
    boton_texto: "",
    boton_link: "",
    boton_secundario_texto: "",
    boton_secundario_link: "",
    color_inicio: "#ec4899",
    color_fin: "#a855f7",
    imagen_url: null,
    mostrar_countdown: false,
    placeholders: [],
  };
}

void emptyTemplate;

// Format datetime-local: YYYY-MM-DDTHH:mm (lo que devuelve <input type="datetime-local">)
function isoToLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localToIso(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}
function fmtFecha(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function getStatus(p: HeroProgramacion): "activa" | "futura" | "pasada" | "inactiva" {
  if (!p.activo) return "inactiva";
  const now = Date.now();
  const desde = new Date(p.fecha_desde).getTime();
  const hasta = new Date(p.fecha_hasta).getTime();
  if (now < desde) return "futura";
  if (now > hasta) return "pasada";
  return "activa";
}

const STATUS_BADGE: Record<ReturnType<typeof getStatus>, string> = {
  activa: "bg-green-100 text-green-700 border-green-200",
  futura: "bg-blue-100 text-blue-700 border-blue-200",
  pasada: "bg-gray-100 text-gray-500 border-gray-200",
  inactiva: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function ProgramacionesPage() {
  const [templates, setTemplates] = useState<HeroTemplate[]>([]);
  const [progs, setProgs] = useState<HeroProgramacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<HeroTemplate | null>(null);
  const [editingProg, setEditingProg] = useState<HeroProgramacion | null>(null);
  const [progTemplate, setProgTemplate] = useState<HeroTemplate | null>(null);
  const [progValues, setProgValues] = useState<Record<string, string>>({});
  const [progFechaDesde, setProgFechaDesde] = useState("");
  const [progFechaHasta, setProgFechaHasta] = useState("");
  const [progPrioridad, setProgPrioridad] = useState(0);
  const [progAutoPct, setProgAutoPct] = useState(true);
  const [progProductoId, setProgProductoId] = useState<string | null>(null);
  const [progDescuentoId, setProgDescuentoId] = useState<string | null>(null);
  const [productosCache, setProductosCache] = useState<ProductoLite[]>([]);
  const [descuentosCache, setDescuentosCache] = useState<DescuentoLite[]>([]);
  const [productoSearch, setProductoSearch] = useState("");
  const [productoSelected, setProductoSelected] = useState<ProductoLite | null>(null);
  const [marcasCache, setMarcasCache] = useState<MarcaLite[]>([]);
  const [categoriasCache, setCategoriasCache] = useState<CategoriaLite[]>([]);

  const load = async () => {
    setLoading(true);
    const [t, p, m, c] = await Promise.all([
      supabase.from("hero_templates").select("*").order("nombre"),
      supabase.from("hero_programaciones").select("*").order("fecha_desde", { ascending: false }),
      supabase.from("marcas").select("id, nombre").order("nombre"),
      supabase.from("categorias").select("id, nombre").order("nombre"),
    ]);
    setTemplates((t.data as HeroTemplate[]) || []);
    setProgs((p.data as HeroProgramacion[]) || []);
    setMarcasCache((m.data as MarcaLite[]) || []);
    setCategoriasCache((c.data as CategoriaLite[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // ── Templates ───────────────────────────────────────────────────────────

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    const t = editingTemplate;
    if (!t.nombre.trim()) { showAdminToast("Nombre requerido", "error"); return; }
    const placeholders = extractPlaceholders(t.titulo, t.subtitulo, t.boton_texto, t.boton_link, t.boton_secundario_texto, t.boton_secundario_link);
    const payload = {
      nombre: t.nombre.trim(),
      tipo: t.tipo,
      titulo: t.titulo,
      subtitulo: t.subtitulo,
      boton_texto: t.boton_texto,
      boton_link: t.boton_link,
      boton_secundario_texto: t.boton_secundario_texto,
      boton_secundario_link: t.boton_secundario_link,
      color_inicio: t.color_inicio,
      color_fin: t.color_fin,
      imagen_url: t.imagen_url,
      mostrar_countdown: t.mostrar_countdown,
      placeholders,
      updated_at: new Date().toISOString(),
    };
    const res = t.id
      ? await supabase.from("hero_templates").update(payload).eq("id", t.id)
      : await supabase.from("hero_templates").insert(payload);
    if (res.error) { showAdminToast("Error: " + res.error.message, "error"); return; }
    showAdminToast(t.id ? "Plantilla actualizada" : "Plantilla creada", "success");
    setEditingTemplate(null);
    load();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("¿Eliminar plantilla? Las programaciones existentes no se borran (mantienen sus textos resueltos).")) return;
    const res = await supabase.from("hero_templates").delete().eq("id", id);
    if (res.error) { showAdminToast("Error: " + res.error.message, "error"); return; }
    showAdminToast("Plantilla eliminada", "success");
    load();
  };

  // ── Programaciones ──────────────────────────────────────────────────────

  const ensureDescuentos = async () => {
    if (descuentosCache.length > 0) return;
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("descuentos")
      .select("id, nombre, porcentaje, activo, fecha_inicio, fecha_fin")
      .eq("activo", true)
      .lte("fecha_inicio", today)
      .or(`fecha_fin.is.null,fecha_fin.gte.${today}`)
      .order("porcentaje", { ascending: false })
      .limit(200);
    setDescuentosCache((data as DescuentoLite[]) || []);
  };

  const searchProductos = async (q: string) => {
    setProductoSearch(q);
    if (q.trim().length < 2) { setProductosCache([]); return; }
    const { data } = await supabase
      .from("productos")
      .select("id, nombre, precio, precio_anterior, imagen_url")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .ilike("nombre", `%${q}%`)
      .limit(15);
    setProductosCache((data as ProductoLite[]) || []);
  };

  const startNewProg = () => {
    setProgTemplate(null);
    setProgValues({});
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
    const after = new Date(tomorrow); after.setDate(after.getDate() + 1);
    setProgFechaDesde(isoToLocal(tomorrow.toISOString()));
    setProgFechaHasta(isoToLocal(after.toISOString()));
    setProgPrioridad(0);
    setProgAutoPct(true);
    setProgProductoId(null);
    setProgDescuentoId(null);
    setProductoSearch("");
    setProductoSelected(null);
    setEditingProg({
      id: "", template_id: null, tipo: "personalizado",
      titulo: "", subtitulo: "", boton_texto: "", boton_link: "",
      boton_secundario_texto: "", boton_secundario_link: "",
      color_inicio: "#ec4899", color_fin: "#a855f7",
      fecha_desde: tomorrow.toISOString(), fecha_hasta: after.toISOString(),
      activo: true, prioridad: 0,
      marcas: null, auto_porcentaje: false,
      producto_id: null, descuento_id: null,
      imagen_url: null, marca_id: null, categoria_id: null, mostrar_countdown: false,
    });
  };

  const editExistingProg = (p: HeroProgramacion) => {
    setProgTemplate(null);
    setProgValues({});
    setProgFechaDesde(isoToLocal(p.fecha_desde));
    setProgFechaHasta(isoToLocal(p.fecha_hasta));
    setProgPrioridad(p.prioridad);
    setProgAutoPct(p.auto_porcentaje);
    setProgProductoId(p.producto_id);
    setProgDescuentoId(p.descuento_id);
    setProductoSearch("");
    setProductoSelected(null);
    setEditingProg({ ...p });
    if (p.tipo === "oferta_descuento") ensureDescuentos();
    if (p.tipo === "producto_destacado" && p.producto_id) {
      // Hidratar el producto seleccionado para preview
      supabase
        .from("productos")
        .select("id, nombre, precio, precio_anterior, imagen_url")
        .eq("id", p.producto_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setProductoSelected(data as ProductoLite);
            setProductoSearch((data as any).nombre || "");
          }
        });
    }
  };

  const onPickTemplate = (templateId: string) => {
    const tpl = templates.find((x) => x.id === templateId) || null;
    setProgTemplate(tpl);
    setProgProductoId(null);
    setProgDescuentoId(null);
    setProductosCache([]);
    setProductoSearch("");
    setProductoSelected(null);
    if (tpl?.tipo === "oferta_descuento") ensureDescuentos();
    if (tpl && editingProg) {
      const vals: Record<string, string> = {};
      tpl.placeholders.forEach((k) => { vals[k] = ""; });
      setProgValues(vals);
      setEditingProg({
        ...editingProg,
        template_id: tpl.id,
        tipo: tpl.tipo,
        titulo: tpl.titulo,
        subtitulo: tpl.subtitulo,
        boton_texto: tpl.boton_texto,
        boton_link: tpl.boton_link,
        boton_secundario_texto: tpl.boton_secundario_texto,
        boton_secundario_link: tpl.boton_secundario_link,
        color_inicio: tpl.color_inicio,
        color_fin: tpl.color_fin,
        imagen_url: tpl.imagen_url,
        mostrar_countdown: tpl.mostrar_countdown,
      });
    }
  };

  const saveProg = async () => {
    if (!editingProg) return;
    if (!progFechaDesde || !progFechaHasta) { showAdminToast("Fechas requeridas", "error"); return; }
    if (new Date(progFechaHasta) <= new Date(progFechaDesde)) { showAdminToast("La fecha hasta debe ser posterior a la desde", "error"); return; }

    // Si hay template, resolver placeholders. Para tipos dinamicos (aumento_marca,
    // oferta_descuento, producto_destacado), dejamos los placeholders que se
    // resuelven en runtime literales (los completa el server al renderizar).
    let resolved = { ...editingProg };
    const tipo = progTemplate?.tipo || resolved.tipo || "personalizado";
    const useAutoPct = tipo === "aumento_marca" && progAutoPct;

    // Placeholders que deja el server (no se resuelven al guardar)
    const RUNTIME_KEYS_BY_TIPO: Record<string, string[]> = {
      aumento_marca: useAutoPct ? ["porcentaje"] : [],
      oferta_descuento: ["nombre_descuento", "porcentaje"],
      producto_destacado: ["nombre", "slug", "descripcion", "precio_actual", "precio_anterior", "descuento_pct"],
    };
    const runtimeKeys = RUNTIME_KEYS_BY_TIPO[tipo] || [];

    if (progTemplate && progTemplate.placeholders.length > 0) {
      const valsForFill = { ...progValues };
      runtimeKeys.forEach((k) => delete valsForFill[k]);
      // Para aumento_marca: la marca se llena al guardar (no es runtime)
      resolved = {
        ...resolved,
        titulo: fillPlaceholders(progTemplate.titulo, valsForFill),
        subtitulo: fillPlaceholders(progTemplate.subtitulo, valsForFill),
        boton_texto: fillPlaceholders(progTemplate.boton_texto, valsForFill),
        boton_link: fillPlaceholders(progTemplate.boton_link, valsForFill),
        boton_secundario_texto: fillPlaceholders(progTemplate.boton_secundario_texto, valsForFill),
        boton_secundario_link: fillPlaceholders(progTemplate.boton_secundario_link, valsForFill),
      };
    }

    // marcas array: para aumento_marca (singular)
    const marcasArray = tipo === "aumento_marca" && progValues.marca
      ? [progValues.marca.trim()].filter(Boolean)
      : (editingProg.id ? editingProg.marcas : null);

    // Validaciones por tipo
    if (resolved.tipo === "producto_destacado" && !progProductoId) {
      showAdminToast("Elegí un producto", "error"); return;
    }

    const payload = {
      template_id: resolved.template_id,
      tipo: resolved.tipo,
      titulo: resolved.titulo,
      subtitulo: resolved.subtitulo,
      boton_texto: resolved.boton_texto,
      boton_link: resolved.boton_link,
      boton_secundario_texto: resolved.boton_secundario_texto,
      boton_secundario_link: resolved.boton_secundario_link,
      color_inicio: resolved.color_inicio,
      color_fin: resolved.color_fin,
      fecha_desde: localToIso(progFechaDesde),
      fecha_hasta: localToIso(progFechaHasta),
      activo: resolved.activo,
      prioridad: progPrioridad,
      marcas: marcasArray && marcasArray.length > 0 ? marcasArray : null,
      auto_porcentaje: useAutoPct,
      producto_id: progProductoId,
      descuento_id: progDescuentoId,
      imagen_url: resolved.imagen_url,
      marca_id: resolved.marca_id,
      categoria_id: resolved.categoria_id,
      mostrar_countdown: resolved.mostrar_countdown,
    };
    const res = editingProg.id
      ? await supabase.from("hero_programaciones").update(payload).eq("id", editingProg.id)
      : await supabase.from("hero_programaciones").insert(payload);
    if (res.error) { showAdminToast("Error: " + res.error.message, "error"); return; }
    fetch("/api/revalidate-tienda", { method: "POST" }).catch(() => {});
    showAdminToast(editingProg.id ? "Programación actualizada" : "Programación creada", "success");
    setEditingProg(null); setProgTemplate(null); setProgValues({});
    load();
  };

  const toggleProg = async (p: HeroProgramacion) => {
    const res = await supabase.from("hero_programaciones").update({ activo: !p.activo }).eq("id", p.id);
    if (res.error) { showAdminToast("Error: " + res.error.message, "error"); return; }
    fetch("/api/revalidate-tienda", { method: "POST" }).catch(() => {});
    load();
  };

  const deleteProg = async (id: string) => {
    if (!confirm("¿Eliminar programación?")) return;
    const res = await supabase.from("hero_programaciones").delete().eq("id", id);
    if (res.error) { showAdminToast("Error: " + res.error.message, "error"); return; }
    fetch("/api/revalidate-tienda", { method: "POST" }).catch(() => {});
    showAdminToast("Programación eliminada", "success");
    load();
  };

  // Preview con placeholders sin resolver para vista previa
  const livePreview = useMemo(() => {
    if (!editingProg) return null;
    if (progTemplate && progTemplate.placeholders.length > 0) {
      const previewVals = { ...progValues };
      const tipo = progTemplate.tipo;
      if (tipo === "aumento_marca" && progAutoPct) previewVals.porcentaje = "~auto";
      if (tipo === "oferta_descuento") {
        const d = progDescuentoId ? descuentosCache.find((x) => x.id === progDescuentoId) : descuentosCache[0];
        previewVals.nombre_descuento = d?.nombre || "(descuento auto)";
        previewVals.porcentaje = d?.porcentaje ? String(d.porcentaje) : "?";
      }
      let prodInfo: any = null;
      if (tipo === "producto_destacado") {
        const prod = productoSelected || productosCache.find((p) => p.id === progProductoId);
        previewVals.nombre = prod?.nombre || "(producto)";
        previewVals.slug = prod?.id || "";
        if (prod) {
          const precio = Number(prod.precio || 0);
          const precioAnt = Number(prod.precio_anterior || 0);
          const tieneOferta = precioAnt > 0 && precioAnt > precio;
          prodInfo = {
            nombre: prod.nombre,
            imagen_url: prod.imagen_url,
            precio,
            precio_anterior: precioAnt,
            tiene_oferta: tieneOferta,
            descuento_pct: tieneOferta ? Math.round(((precioAnt - precio) / precioAnt) * 100) : 0,
          };
        }
      }
      return {
        tipo,
        titulo: fillPlaceholders(progTemplate.titulo, previewVals),
        subtitulo: fillPlaceholders(progTemplate.subtitulo, previewVals),
        boton_texto: fillPlaceholders(progTemplate.boton_texto, previewVals),
        color_inicio: editingProg.color_inicio,
        color_fin: editingProg.color_fin,
        producto: prodInfo,
      };
    }
    return {
      titulo: editingProg.titulo,
      subtitulo: editingProg.subtitulo,
      boton_texto: editingProg.boton_texto,
      color_inicio: editingProg.color_inicio,
      color_fin: editingProg.color_fin,
    };
  }, [editingProg, progTemplate, progValues, progAutoPct, progDescuentoId, descuentosCache, progProductoId, productosCache, productoSelected]);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/configuracion/pagina-inicio">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Plantillas y programaciones del Hero</h1>
          <p className="text-sm text-muted-foreground">Reemplaza el banner principal según fecha (feriados, cambios de mínimo, promos, etc.)</p>
        </div>
      </div>

      {/* Programaciones */}
      <Card className="mb-6">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Programaciones</h2>
              <p className="text-xs text-muted-foreground">La de mayor prioridad activa en su rango se muestra en la home.</p>
            </div>
            <Button onClick={startNewProg}><Plus className="h-4 w-4 mr-1.5" />Nueva</Button>
          </div>

          {loading ? <div className="text-sm text-muted-foreground">Cargando…</div> :
           progs.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">No hay programaciones todavía.</div> :
            <div className="space-y-2">
              {progs.map((p) => {
                const status = getStatus(p);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full border ${STATUS_BADGE[status]}`}>{status}</span>
                        <span className="text-sm font-medium truncate">{p.titulo || "(sin título)"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {fmtFecha(p.fecha_desde)} → {fmtFecha(p.fecha_hasta)}
                        {p.prioridad > 0 && <span className="ml-2">· prioridad {p.prioridad}</span>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => toggleProg(p)} title={p.activo ? "Desactivar" : "Activar"}>
                      {p.activo ? <Power className="h-4 w-4 text-green-600" /> : <PowerOff className="h-4 w-4 text-gray-400" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => editExistingProg(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteProg(p.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </div>
                );
              })}
            </div>
          }
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Plantillas</h2>
              <p className="text-xs text-muted-foreground">Usá <code className="text-[11px] bg-gray-100 px-1 rounded">{`{variable}`}</code> en los textos para placeholders que se completan al programar.</p>
            </div>
            <Button onClick={() => setEditingTemplate(emptyTemplate())}><Plus className="h-4 w-4 mr-1.5" />Nueva</Button>
          </div>
          {loading ? <div className="text-sm text-muted-foreground">Cargando…</div> :
           templates.length === 0 ? <div className="text-sm text-muted-foreground py-6 text-center">No hay plantillas.</div> :
            <div className="grid sm:grid-cols-2 gap-3">
              {templates.map((t) => {
                const tipoMeta = TIPO_META[t.tipo] || TIPO_META.personalizado;
                const TipoIcon = tipoMeta.Icon;
                const bgStyle: React.CSSProperties = t.imagen_url
                  ? { backgroundImage: `linear-gradient(135deg, ${t.color_inicio}cc, ${t.color_fin}aa), url("${t.imagen_url}")`, backgroundSize: "cover", backgroundPosition: "center" }
                  : { background: `linear-gradient(135deg, ${t.color_inicio}, ${t.color_fin})` };
                return (
                  <div key={t.id} className="border rounded-lg overflow-hidden">
                    <div className="relative h-24 px-4 flex items-center text-white text-sm font-bold" style={bgStyle}>
                      <span className="drop-shadow">{t.titulo || t.nombre}</span>
                      <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 bg-black/30 backdrop-blur-sm text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded">
                        <TipoIcon className="w-3 h-3" />
                        {tipoMeta.label}
                      </span>
                    </div>
                    <div className="p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{t.nombre}</div>
                        {t.placeholders.length > 0 && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            Variables: {t.placeholders.map((p) => `{${p}}`).join(", ")}
                          </div>
                        )}
                      </div>
                      <div className="flex">
                        <Button variant="ghost" size="icon" onClick={() => setEditingTemplate(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteTemplate(t.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </CardContent>
      </Card>

      {/* ── Template Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!editingTemplate} onOpenChange={(o) => !o && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTemplate?.id ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle></DialogHeader>
          {editingTemplate && (
            <div className="space-y-3">
              <div>
                <Label>Nombre interno</Label>
                <Input value={editingTemplate.nombre} onChange={(e) => setEditingTemplate({ ...editingTemplate, nombre: e.target.value })} placeholder="Ej: Feriado, Cambio de mínimo…" />
              </div>
              <div>
                <Label>Tipo de banner</Label>
                <Select value={editingTemplate.tipo} onValueChange={(v) => setEditingTemplate({ ...editingTemplate, tipo: v as HeroTipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_META) as HeroTipo[]).map((t) => {
                      const m = TIPO_META[t];
                      const Icon = m.Icon;
                      return (
                        <SelectItem key={t} value={t}>
                          <span className="flex items-center gap-2"><Icon className="w-3.5 h-3.5" /> {m.label}</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">{TIPO_META[editingTemplate.tipo]?.descripcion}</p>
              </div>

              {/* Imagen de fondo (todos los tipos la soportan; obligatoria para imagen_libre, marca, categoria) */}
              <ImageDropField
                value={editingTemplate.imagen_url}
                onChange={(url) => setEditingTemplate({ ...editingTemplate, imagen_url: url })}
                label="Imagen de fondo"
                hint={editingTemplate.tipo === "imagen_libre" ? "Recomendado: 1920×600 (banner pre-armado)" : "Opcional · si la dejás vacía, se usa el gradiente"}
              />

              <div>
                <Label>Título <span className="text-xs text-muted-foreground">(usá <code>{`{variable}`}</code> para placeholders)</span></Label>
                <Input value={editingTemplate.titulo} onChange={(e) => setEditingTemplate({ ...editingTemplate, titulo: e.target.value })} />
              </div>
              <div>
                <Label>Subtítulo</Label>
                <textarea className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm min-h-[60px]" value={editingTemplate.subtitulo} onChange={(e) => setEditingTemplate({ ...editingTemplate, subtitulo: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Botón principal — texto</Label><Input value={editingTemplate.boton_texto} onChange={(e) => setEditingTemplate({ ...editingTemplate, boton_texto: e.target.value })} /></div>
                <div><Label>Link</Label><Input value={editingTemplate.boton_link} onChange={(e) => setEditingTemplate({ ...editingTemplate, boton_link: e.target.value })} /></div>
                <div><Label>Botón secundario — texto</Label><Input value={editingTemplate.boton_secundario_texto} onChange={(e) => setEditingTemplate({ ...editingTemplate, boton_secundario_texto: e.target.value })} /></div>
                <div><Label>Link</Label><Input value={editingTemplate.boton_secundario_link} onChange={(e) => setEditingTemplate({ ...editingTemplate, boton_secundario_link: e.target.value })} /></div>
                <div><Label>Color inicio</Label><Input type="color" value={editingTemplate.color_inicio} onChange={(e) => setEditingTemplate({ ...editingTemplate, color_inicio: e.target.value })} /></div>
                <div><Label>Color fin</Label><Input type="color" value={editingTemplate.color_fin} onChange={(e) => setEditingTemplate({ ...editingTemplate, color_fin: e.target.value })} /></div>
              </div>
              {(editingTemplate.tipo === "oferta_descuento" || editingTemplate.tipo === "oferta_countdown") && (
                <label className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 p-2 rounded">
                  <input type="checkbox" checked={editingTemplate.mostrar_countdown} onChange={(e) => setEditingTemplate({ ...editingTemplate, mostrar_countdown: e.target.checked })} />
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Mostrar countdown a la fecha de fin</span>
                </label>
              )}
              {/* Preview real del template */}
              <div className="rounded-lg overflow-hidden border">
                <div
                  className="relative min-h-[120px] flex items-center px-5 py-4 text-white"
                  style={editingTemplate.imagen_url
                    ? { backgroundImage: `linear-gradient(135deg, ${editingTemplate.color_inicio}cc, ${editingTemplate.color_fin}aa), url("${editingTemplate.imagen_url}")`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: `linear-gradient(135deg, ${editingTemplate.color_inicio}, ${editingTemplate.color_fin})` }}
                >
                  <div>
                    <div className="font-extrabold text-xl drop-shadow">{editingTemplate.titulo || "Título de ejemplo"}</div>
                    {editingTemplate.subtitulo && <div className="text-sm opacity-90 mt-1 drop-shadow">{editingTemplate.subtitulo}</div>}
                    {editingTemplate.boton_texto && <div className="inline-block mt-2 px-3 py-1 bg-white text-gray-900 rounded-full text-xs font-semibold shadow">{editingTemplate.boton_texto} →</div>}
                  </div>
                </div>
              </div>
              {(() => {
                const detected = extractPlaceholders(
                  editingTemplate.titulo, editingTemplate.subtitulo, editingTemplate.boton_texto,
                  editingTemplate.boton_link, editingTemplate.boton_secundario_texto, editingTemplate.boton_secundario_link
                );
                return detected.length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Variables detectadas: {detected.map((d) => <code key={d} className="mx-0.5 bg-gray-100 px-1 rounded">{`{${d}}`}</code>)}
                  </div>
                ) : null;
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
            <Button onClick={saveTemplate}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Programación Edit Dialog ─────────────────────────────────────── */}
      <Dialog open={!!editingProg} onOpenChange={(o) => !o && (setEditingProg(null), setProgTemplate(null), setProgValues({}))}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingProg?.id ? "Editar programación" : "Nueva programación"}</DialogTitle></DialogHeader>
          {editingProg && (
            <div className="space-y-3">
              {!editingProg.id && (
                <div>
                  <Label>Plantilla</Label>
                  <Select value={progTemplate?.id || ""} onValueChange={(v) => v && onPickTemplate(v)}>
                    <SelectTrigger><SelectValue placeholder="Elegir plantilla…" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Inputs por tipo / placeholder */}
              {progTemplate && progTemplate.placeholders.length > 0 && (
                <div className="space-y-3 p-3 bg-blue-50/50 border border-blue-200 rounded-lg">
                  <div className="text-xs font-medium text-blue-800">Completá los datos:</div>

                  {/* TIPO: aumento_marca → input "marca" singular + auto pct toggle */}
                  {progTemplate.tipo === "aumento_marca" && (
                    <>
                      <label className="flex items-center gap-2 text-sm bg-white p-2 rounded border border-blue-200">
                        <input type="checkbox" checked={progAutoPct} onChange={(e) => setProgAutoPct(e.target.checked)} />
                        <span>Calcular % promedio automático <span className="text-xs text-muted-foreground">(de los aumentos de la marca, últimos 3 días)</span></span>
                      </label>
                      <div>
                        <Label>Marca</Label>
                        <Input
                          value={progValues.marca || ""}
                          onChange={(e) => setProgValues({ ...progValues, marca: e.target.value })}
                          placeholder="COCA COLA"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">Se usa para el texto y para filtrar el listado del botón.</p>
                      </div>
                      {!progAutoPct && (
                        <div>
                          <Label>Porcentaje</Label>
                          <Input value={progValues.porcentaje || ""} onChange={(e) => setProgValues({ ...progValues, porcentaje: e.target.value })} placeholder="12" />
                        </div>
                      )}
                    </>
                  )}

                  {/* TIPO: oferta_descuento → picker de descuento o "auto" (top descuento) */}
                  {progTemplate.tipo === "oferta_descuento" && (
                    <>
                      <label className="flex items-center gap-2 text-sm bg-white p-2 rounded border border-blue-200">
                        <input
                          type="checkbox"
                          checked={progDescuentoId === null}
                          onChange={(e) => setProgDescuentoId(e.target.checked ? null : (descuentosCache[0]?.id || null))}
                        />
                        <span>Auto · usar el descuento más grande activo</span>
                      </label>
                      {progDescuentoId !== null && (
                        <div>
                          <Label>Descuento</Label>
                          <Select value={progDescuentoId || ""} onValueChange={(v) => v && setProgDescuentoId(v)}>
                            <SelectTrigger><SelectValue placeholder="Elegir descuento…" /></SelectTrigger>
                            <SelectContent>
                              {descuentosCache.length === 0 && <div className="p-3 text-xs text-muted-foreground">No hay descuentos activos.</div>}
                              {descuentosCache.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.nombre}{d.porcentaje ? ` · ${d.porcentaje}%` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">El nombre y % se autocompletan desde el descuento al renderizar.</p>
                    </>
                  )}

                  {/* TIPO: producto_destacado → producto picker (search) */}
                  {progTemplate.tipo === "producto_destacado" && (
                    <>
                      <div>
                        <Label>Buscar producto</Label>
                        <Input
                          value={productoSearch}
                          onChange={(e) => searchProductos(e.target.value)}
                          placeholder="Empezá a escribir el nombre…"
                        />
                      </div>
                      {productosCache.length > 0 && (
                        <div className="max-h-48 overflow-y-auto bg-white border rounded space-y-1">
                          {productosCache.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setProgProductoId(p.id); setProductoSelected(p); setProductoSearch(p.nombre); setProductosCache([]); }}
                              className={`w-full text-left px-2 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2 ${progProductoId === p.id ? "bg-blue-100" : ""}`}
                            >
                              {p.imagen_url && <img src={p.imagen_url} alt="" className="w-8 h-8 rounded object-cover" />}
                              <span className="flex-1 truncate">{p.nombre}</span>
                              <span className="text-xs text-muted-foreground">${p.precio}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {progProductoId && productosCache.length === 0 && (
                        <div className="text-xs text-green-700 bg-green-50 p-2 rounded">Producto seleccionado.</div>
                      )}
                      <p className="text-[11px] text-muted-foreground">Nombre, imagen y precio se autocompletan desde el producto al renderizar.</p>
                    </>
                  )}

                  {/* TIPO: marca_destacada → selector de marca */}
                  {progTemplate.tipo === "marca_destacada" && (
                    <div>
                      <Label>Marca</Label>
                      <Select value={editingProg.marca_id || ""} onValueChange={(v) => setEditingProg({ ...editingProg, marca_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Elegí una marca…" /></SelectTrigger>
                        <SelectContent>
                          {marcasCache.map((m) => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* TIPO: categoria_destacada → selector de categoría */}
                  {progTemplate.tipo === "categoria_destacada" && (
                    <div>
                      <Label>Categoría</Label>
                      <Select value={editingProg.categoria_id || ""} onValueChange={(v) => setEditingProg({ ...editingProg, categoria_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Elegí una categoría…" /></SelectTrigger>
                        <SelectContent>
                          {categoriasCache.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* TIPO: imagen_libre / personalizado → todos los placeholders como inputs simples */}
                  {(progTemplate.tipo === "personalizado" || progTemplate.tipo === "imagen_libre") && progTemplate.placeholders.map((k) => (
                    <div key={k}>
                      <Label className="capitalize">{k.replace(/_/g, " ")}</Label>
                      <Input value={progValues[k] || ""} onChange={(e) => setProgValues({ ...progValues, [k]: e.target.value })} placeholder={`Valor para {${k}}`} />
                    </div>
                  ))}
                </div>
              )}

              {/* Imagen de fondo + countdown toggle (siempre visibles según tipo) */}
              {editingProg && (
                <div className="space-y-3 p-3 border rounded-lg bg-gray-50">
                  <ImageDropField
                    value={editingProg.imagen_url}
                    onChange={(url) => setEditingProg({ ...editingProg, imagen_url: url })}
                    label="Imagen de fondo (opcional)"
                    hint="Recomendado: 1920×600 · si la dejás vacía, se usa el gradiente"
                  />
                  {(editingProg.tipo === "oferta_descuento" || editingProg.tipo === "oferta_countdown") && (
                    <label className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 p-2 rounded">
                      <input type="checkbox" checked={editingProg.mostrar_countdown} onChange={(e) => setEditingProg({ ...editingProg, mostrar_countdown: e.target.checked })} />
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>Mostrar countdown hasta la fecha de fin</span>
                    </label>
                  )}
                </div>
              )}

              {/* Si edita una existente: campos de texto editables directos */}
              {editingProg.id && !progTemplate && (
                <>
                  <div><Label>Título</Label><Input value={editingProg.titulo} onChange={(e) => setEditingProg({ ...editingProg, titulo: e.target.value })} /></div>
                  <div>
                    <Label>Subtítulo</Label>
                    <textarea className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm min-h-[60px]" value={editingProg.subtitulo} onChange={(e) => setEditingProg({ ...editingProg, subtitulo: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Botón texto</Label><Input value={editingProg.boton_texto} onChange={(e) => setEditingProg({ ...editingProg, boton_texto: e.target.value })} /></div>
                    <div><Label>Botón link</Label><Input value={editingProg.boton_link} onChange={(e) => setEditingProg({ ...editingProg, boton_link: e.target.value })} /></div>
                    <div><Label>Color inicio</Label><Input type="color" value={editingProg.color_inicio} onChange={(e) => setEditingProg({ ...editingProg, color_inicio: e.target.value })} /></div>
                    <div><Label>Color fin</Label><Input type="color" value={editingProg.color_fin} onChange={(e) => setEditingProg({ ...editingProg, color_fin: e.target.value })} /></div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Desde</Label><DateTimeInput value={progFechaDesde} onChange={setProgFechaDesde} /></div>
                <div><Label>Hasta</Label><DateTimeInput value={progFechaHasta} onChange={setProgFechaHasta} min={progFechaDesde} /></div>
                <div>
                  <Label>Prioridad <span className="text-xs text-muted-foreground">(mayor gana si se solapan)</span></Label>
                  <Input type="number" value={progPrioridad} onChange={(e) => setProgPrioridad(parseInt(e.target.value) || 0)} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editingProg.activo} onChange={(e) => setEditingProg({ ...editingProg, activo: e.target.checked })} />
                    Activa
                  </label>
                </div>
              </div>

              {livePreview && (
                <div
                  className="relative rounded-lg p-4 text-white overflow-hidden"
                  style={editingProg?.imagen_url
                    ? { backgroundImage: `linear-gradient(135deg, ${livePreview.color_inicio}cc, ${livePreview.color_fin}aa), url("${editingProg.imagen_url}")`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: `linear-gradient(135deg, ${livePreview.color_inicio}, ${livePreview.color_fin})` }}
                >
                  {!editingProg?.imagen_url && <>
                    <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/8 rounded-full blur-3xl pointer-events-none" />
                  </>}
                  <div className="relative">
                    <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">Vista previa</div>
                    {livePreview.tipo === "producto_destacado" && livePreview.producto ? (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          {livePreview.producto.tiene_oferta && (
                            <span className="inline-block bg-yellow-400 text-gray-900 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5 uppercase tracking-wide">
                              ⚡ Oferta · {livePreview.producto.descuento_pct}% off
                            </span>
                          )}
                          <div className="font-extrabold text-lg leading-tight line-clamp-2">{livePreview.titulo}</div>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-xl font-bold">${livePreview.producto.precio.toLocaleString("es-AR")}</span>
                            {livePreview.producto.tiene_oferta && (
                              <span className="text-xs text-white/70 line-through">${livePreview.producto.precio_anterior.toLocaleString("es-AR")}</span>
                            )}
                          </div>
                          {livePreview.boton_texto && <div className="inline-block mt-2 px-3 py-1 bg-white text-gray-900 rounded-full text-xs font-semibold">{livePreview.boton_texto} →</div>}
                        </div>
                        {livePreview.producto.imagen_url && (
                          <div className="shrink-0 w-20 h-20 bg-white rounded-xl shadow-xl overflow-hidden flex items-center justify-center">
                            <img src={livePreview.producto.imagen_url} alt="" className="max-w-full max-h-full object-contain p-1" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="font-extrabold text-lg leading-tight">{livePreview.titulo || "Título"}</div>
                        <div className="text-sm opacity-90">{livePreview.subtitulo || "Subtítulo"}</div>
                        {livePreview.boton_texto && <div className="inline-block mt-2 px-3 py-1 bg-white/20 rounded text-xs">{livePreview.boton_texto}</div>}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingProg(null); setProgTemplate(null); setProgValues({}); }}>Cancelar</Button>
            <Button onClick={saveProg}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
