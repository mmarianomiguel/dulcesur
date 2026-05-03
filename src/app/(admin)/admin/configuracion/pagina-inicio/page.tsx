"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showAdminToast } from "@/components/admin-toast";
import { APP_NAME } from "@/lib/constants";
import { sanitizeHtml } from "@/lib/sanitize";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Monitor,
  Tablet,
  Smartphone,
  Save,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  GripVertical,
  X,
  Check,
  Loader2,
  Layout,
  ShoppingBag,
  Star,
  Truck,
  Shield,
  RefreshCw,
  Headphones,
  Megaphone,
  FileText,
  ChevronDown as ChevronDownIcon,
  Settings,
  MousePointer,
  Image,
  Package,
  Pencil,
  DollarSign,
  Zap,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface Bloque {
  id: string;
  tipo: string;
  titulo: string;
  orden: number;
  activo: boolean;
  config: Record<string, unknown>;
}

interface BlockTypeDef {
  tipo: string;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultTitulo: string;
  defaultConfig: Record<string, unknown>;
}

// ── Block type definitions ─────────────────────────────────────────────────

const BLOCK_TYPES: BlockTypeDef[] = [
  {
    tipo: "hero",
    label: "Hero Banner",
    description: "Banner principal con gradiente y botones",
    icon: Monitor,
    defaultTitulo: "Hero Banner",
    defaultConfig: {
      titulo: "Bienvenido a nuestra tienda",
      subtitulo: "Encontrá los mejores productos",
      boton_texto: "Ver productos",
      boton_link: "/productos",
      boton_secundario_texto: "",
      boton_secundario_link: "",
      color_inicio: "#4f46e5",
      color_fin: "#7c3aed",
    },
  },
  {
    tipo: "trust_badges",
    label: "Badges de Confianza",
    description: "Iconos de confianza en fila",
    icon: Shield,
    defaultTitulo: "Badges de Confianza",
    defaultConfig: {
      items: [
        { icono: "Truck", titulo: "Envío gratis", subtitulo: "En compras +$50.000" },
        { icono: "Shield", titulo: "Pago seguro", subtitulo: "Todas las tarjetas" },
        { icono: "RefreshCw", titulo: "Devoluciones", subtitulo: "30 días" },
        { icono: "Headphones", titulo: "Soporte", subtitulo: "Lun a Vie" },
      ],
    },
  },
  {
    tipo: "categorias_destacadas",
    label: "Categorías Destacadas",
    description: "Grilla de categorías de la tienda",
    icon: Layout,
    defaultTitulo: "Categorías Destacadas",
    defaultConfig: { titulo_seccion: "Categorías Destacadas", max_items: 6 },
  },
  {
    tipo: "productos_destacados",
    label: "Productos Destacados",
    description: "Grilla con tabs: Destacados, Más vendidos y Nuevos ingresos",
    icon: ShoppingBag,
    defaultTitulo: "Productos Destacados",
    defaultConfig: {
      titulo_seccion: "Productos Destacados",
      max_items: 8,
      orden: "manual",
      tab_defecto: "destacados",
      tabs: [
        { key: "destacados", activo: true },
        { key: "mas_vendidos", activo: true },
        { key: "nuevos", activo: true },
      ],
    },
  },
  {
    tipo: "banner_promo",
    label: "Banner Promocional",
    description: "Banner con color de fondo y CTA",
    icon: Megaphone,
    defaultTitulo: "Banner Promocional",
    defaultConfig: {
      titulo: "Promoción Especial",
      subtitulo: "Hasta 30% de descuento",
      boton_texto: "Ver ofertas",
      link: "/productos",
      color_fondo: "#4f46e5",
    },
  },
  {
    tipo: "por_que_elegirnos",
    label: "Por Qué Elegirnos",
    description: "3 tarjetas con iconos y texto",
    icon: Star,
    defaultTitulo: "Por Qué Elegirnos",
    defaultConfig: {
      titulo_seccion: "¿Por qué elegirnos?",
      cards: [
        { icono: "Star", titulo: "Calidad", descripcion: "Productos de primera calidad" },
        { icono: "Truck", titulo: "Envío rápido", descripcion: "Entrega en 24-48hs" },
        { icono: "Shield", titulo: "Garantía", descripcion: "Garantía en todos los productos" },
      ],
    },
  },
  {
    tipo: "texto_libre",
    label: "Texto Libre",
    description: "Bloque de texto o HTML personalizado",
    icon: FileText,
    defaultTitulo: "Texto Libre",
    defaultConfig: { contenido: "" },
  },
  {
    tipo: "imagen_banner",
    label: "Imagen Banner",
    description: "Imagen de ancho completo con link",
    icon: Image,
    defaultTitulo: "Imagen Banner",
    defaultConfig: { url_imagen: "", link: "", alt: "", alto: "mediano" },
  },
  {
    tipo: "aumentos_recientes",
    label: "Aumentos Recientes",
    description: "Productos con precio actualizado recientemente",
    icon: TrendingUp,
    defaultTitulo: "Aumentos Recientes",
    defaultConfig: {
      dias_atras: 3,
      max_items_home: 8,
    },
  },
  {
    tipo: "ultimas_unidades",
    label: "Últimas Unidades",
    description: "Productos con stock bajo",
    icon: Package,
    defaultTitulo: "Últimas Unidades",
    defaultConfig: {
      umbral_stock: 5,
      max_items: 8,
      titulo: "Últimas Unidades",
    },
  },
];

// Tipos legacy: se renderizan si existen en DB pero no pueden crearse nuevos desde el editor.
// "mas_vendidos" y "nuevos_ingresos" ahora viven como tabs dentro de "productos_destacados".
const LEGACY_BLOCK_TYPES: BlockTypeDef[] = [
  {
    tipo: "mas_vendidos",
    label: "Más Vendidos (legacy)",
    description: "Bloque legacy. Ahora es un tab dentro de Productos Destacados.",
    icon: Star,
    defaultTitulo: "Más Vendidos",
    defaultConfig: { dias_atras: 30, max_items: 8, titulo: "Los Más Vendidos" },
  },
  {
    tipo: "nuevos_ingresos",
    label: "Nuevos Ingresos (legacy)",
    description: "Bloque legacy. Ahora es un tab dentro de Productos Destacados.",
    icon: Zap,
    defaultTitulo: "Nuevos Ingresos",
    defaultConfig: { dias_atras: 7, max_items: 16, titulo: "Nuevos Ingresos" },
  },
];

const ALL_BLOCK_TYPES: BlockTypeDef[] = [...BLOCK_TYPES, ...LEGACY_BLOCK_TYPES];

const ICON_OPTIONS = [
  "Truck", "Shield", "RefreshCw", "Headphones", "Star", "ShoppingBag", "Settings", "Check",
];

const ICON_MAP: Record<string, LucideIcon> = {
  Truck, Shield, RefreshCw, Headphones, Star, ShoppingBag, Settings, Check,
  DollarSign, Package, Zap,
};

function getBlockDef(tipo: string) {
  return ALL_BLOCK_TYPES.find((b) => b.tipo === tipo);
}

function getBlockIcon(tipo: string): LucideIcon {
  return getBlockDef(tipo)?.icon ?? Settings;
}

// ── Default blocks when table is empty ─────────────────────────────────────

function createDefaultBlocks(): Bloque[] {
  const defaults = ["hero", "trust_badges", "categorias_destacadas", "productos_destacados", "banner_promo", "por_que_elegirnos"];
  return defaults.map((tipo, i) => {
    const def = getBlockDef(tipo)!;
    return {
      id: crypto.randomUUID(),
      tipo,
      titulo: def.defaultTitulo,
      orden: i,
      activo: true,
      config: { ...def.defaultConfig },
    };
  });
}

// ── Collapsible Section ────────────────────────────────────────────────────

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/50 hover:bg-muted transition-colors text-sm font-medium"
      >
        {title}
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
}

// ── Inline Editable Text ──────────────────────────────────────────────────

function EditableText({
  value,
  onChange,
  tag: Tag = "span",
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  tag?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);

  const handleBlur = () => {
    setEditing(false);
    const text = ref.current?.innerText ?? "";
    if (text !== value) onChange(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ref.current?.blur();
    }
    if (e.key === "Escape") {
      if (ref.current) ref.current.innerText = value;
      ref.current?.blur();
    }
  };

  return (
    <Tag
      ref={ref as any}
      className={`${className ?? ""} ${editing ? "outline outline-2 outline-white/60 outline-offset-2 rounded" : ""} cursor-text`}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => setEditing(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(value || placeholder || "") }}
    />
  );
}

// ── Block Preview Renderers ────────────────────────────────────────────────

function PreviewHero({ config, onConfigChange }: { config: Record<string, unknown>; onConfigChange?: (key: string, value: unknown) => void }) {
  const colorStart = (config.color_inicio as string) || "#be185d";
  const colorEnd = (config.color_fin as string) || "#ec4899";
  return (
    <section
      className="relative overflow-hidden min-h-[420px] flex items-center"
      style={{ background: `linear-gradient(to right, ${colorStart}, ${colorEnd})` }}
    >
      {/* decorative circles - matching tienda exactly */}
      <div className="absolute top-10 right-10 w-64 h-64 bg-white/10 rounded-full hidden md:block" />
      <div className="absolute top-40 right-56 w-40 h-40 bg-white/10 rounded-full hidden md:block" />
      <div className="absolute -bottom-10 right-20 w-32 h-32 bg-white/10 rounded-full hidden md:block" />
      <div className="absolute top-20 right-96 w-20 h-20 bg-white/10 rounded-full hidden md:block" />
      <div className="absolute bottom-16 right-72 w-12 h-12 bg-white/10 rounded-full hidden md:block" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
        <div className="max-w-2xl">
          <span className="inline-block text-sm font-semibold text-white/80 tracking-widest uppercase mb-4">
            {(config.marca as string) || APP_NAME}
          </span>
          {onConfigChange ? (
            <EditableText
              tag="h1"
              className="text-4xl md:text-5xl font-bold text-white leading-tight mb-5"
              value={(config.titulo as string) || "Título del Hero"}
              onChange={(v) => onConfigChange("titulo", v)}
              placeholder="Título del Hero"
            />
          ) : (
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-5">
              {(config.titulo as string) || "Título del Hero"}
            </h1>
          )}
          {onConfigChange ? (
            <EditableText
              tag="p"
              className="text-lg text-white/90 mb-8 max-w-lg"
              value={(config.subtitulo as string) || "Subtítulo del banner"}
              onChange={(v) => onConfigChange("subtitulo", v)}
              placeholder="Subtítulo del banner"
            />
          ) : (
            <p className="text-lg text-white/90 mb-8 max-w-lg">
              {(config.subtitulo as string) || "Subtítulo del banner"}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            {(config.boton_texto as string) && (
              onConfigChange ? (
                <EditableText
                  tag="span"
                  className="bg-white text-pink-600 rounded-full px-8 py-3.5 font-semibold shadow-lg"
                  value={config.boton_texto as string}
                  onChange={(v) => onConfigChange("boton_texto", v)}
                />
              ) : (
                <span className="bg-white text-pink-600 rounded-full px-8 py-3.5 font-semibold shadow-lg">
                  {config.boton_texto as string}
                </span>
              )
            )}
            {(config.boton_secundario_texto as string) && (
              onConfigChange ? (
                <EditableText
                  tag="span"
                  className="border-2 border-white text-white rounded-full px-8 py-3 font-semibold"
                  value={config.boton_secundario_texto as string}
                  onChange={(v) => onConfigChange("boton_secundario_texto", v)}
                />
              ) : (
                <span className="border-2 border-white text-white rounded-full px-8 py-3 font-semibold">
                  {config.boton_secundario_texto as string}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewTrustBadges({ config, onConfigChange }: { config: Record<string, unknown>; onConfigChange?: (key: string, value: unknown) => void }) {
  const items = (config.items as Array<{ icono: string; titulo: string; subtitulo: string }>) ?? [];
  const updateItem = (index: number, field: string, value: string) => {
    if (!onConfigChange) return;
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    onConfigChange("items", updated);
  };
  return (
    <section className="bg-white border-y border-gray-100 py-4">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((item, i) => {
            const Icon = ICON_MAP[item.icono] ?? Shield;
            return (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="w-12 h-12 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  {onConfigChange ? (
                    <>
                      <EditableText tag="p" className="text-sm font-semibold text-gray-800" value={item.titulo} onChange={(v) => updateItem(i, "titulo", v)} />
                      <EditableText tag="p" className="text-xs text-gray-500" value={item.subtitulo} onChange={(v) => updateItem(i, "subtitulo", v)} />
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-800">{item.titulo}</p>
                      <p className="text-xs text-gray-500">{item.subtitulo}</p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PreviewCategoriasDestacadas({ config, onConfigChange }: { config: Record<string, unknown>; onConfigChange?: (key: string, value: unknown) => void }) {
  const titulo = (config.titulo_seccion as string) || "Categorías";
  const max = (config.max_items as number) || 6;
  const placeholders = ["Golosinas", "Snacks", "Bebidas", "Galletitas", "Chocolates", "Caramelos", "Cereales", "Dulces"];
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-10">
          {onConfigChange ? (
            <EditableText tag="h2" className="text-2xl md:text-3xl font-bold text-gray-900" value={titulo} onChange={(v) => onConfigChange("titulo_seccion", v)} />
          ) : (
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{titulo}</h2>
          )}
          <div className="w-16 h-1 bg-pink-600 rounded-full mx-auto mt-2" />
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {Array.from({ length: Math.min(max, 6) }).map((_, i) => (
            <div
              key={i}
              className="group cursor-pointer rounded-2xl border border-gray-100 bg-white p-6 text-center hover:shadow-lg hover:border-pink-200 transition-all duration-300"
            >
              <p className="font-semibold text-gray-800">{placeholders[i] ?? `Cat. ${i + 1}`}</p>
              <p className="text-xs text-pink-600 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">Ver productos &rarr;</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewProductosDestacados({ config, onConfigChange }: { config: Record<string, unknown>; onConfigChange?: (key: string, value: unknown) => void }) {
  const titulo = (config.titulo_seccion as string) || "Productos Destacados";
  const max = (config.max_items as number) || 8;

  const TAB_META: Record<string, { label: string; shortLabel: string; Icon: LucideIcon }> = {
    destacados: { label: "Destacados", shortLabel: "Dest.", Icon: Star },
    nuevos: { label: "Nuevos ingresos", shortLabel: "Nuevos", Icon: Zap },
    reingresos: { label: "De vuelta en stock", shortLabel: "Vuelve", Icon: RefreshCw },
    ofertas: { label: "Ofertas", shortLabel: "Ofertas", Icon: DollarSign },
    mas_vendidos: { label: "Más vendidos", shortLabel: "Top", Icon: TrendingUp },
  };

  const rawTabs = (config.tabs as Array<{ key: string; activo: boolean }> | undefined);
  const defaultTabs = [
    { key: "destacados", activo: true },
    { key: "nuevos", activo: true },
    { key: "reingresos", activo: true },
    { key: "ofertas", activo: true },
    { key: "mas_vendidos", activo: true },
  ];
  const tabsSource = Array.isArray(rawTabs) && rawTabs.length > 0 ? rawTabs : defaultTabs;
  const visibleTabs = tabsSource.filter((t) => t && t.activo && TAB_META[t.key as string]);
  const defaultTab = (config.tab_defecto as string) ?? visibleTabs[0]?.key ?? "destacados";
  const resolvedDefault = visibleTabs.some((t) => t.key === defaultTab) ? defaultTab : (visibleTabs[0]?.key ?? "destacados");

  const [activeTab, setActiveTab] = useState(resolvedDefault);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setActiveTab(resolvedDefault); }, [resolvedDefault]);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("productos")
      .select("id, nombre, precio, imagen_url, stock, categorias(nombre)")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .eq("destacado", true)
      .limit(max)
      .then(({ data }) => { setProductos(data || []); setLoading(false); });
  }, [max]);

  const displayProds = loading
    ? Array.from({ length: Math.min(max, 4) }).map((_, i) => ({ id: `ph-${i}`, placeholder: true }))
    : productos.length > 0
    ? productos
    : Array.from({ length: Math.min(max, 4) }).map((_, i) => ({ id: `ph-${i}`, placeholder: true }));

  return (
    <section className="py-8 bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {onConfigChange ? (
            <EditableText tag="h2" className="text-xl font-bold text-gray-900" value={titulo} onChange={(v) => onConfigChange("titulo_seccion", v)} />
          ) : (
            <h2 className="text-xl font-bold text-gray-900">{titulo}</h2>
          )}
          {visibleTabs.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
              {visibleTabs.map((t) => {
                const meta = TAB_META[t.key as string];
                const Icon = meta.Icon;
                const isActive = t.key === activeTab;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key as string)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isActive ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="w-12 h-0.5 bg-primary rounded-full mb-4" />
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-3">
          {displayProds.map((p: any) => (
            <div key={p.id} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden">
                {p.placeholder || !p.imagen_url ? (
                  <Package className={`w-10 h-10 ${p.placeholder ? "text-gray-200 animate-pulse" : "text-gray-300"}`} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-contain p-2" />
                )}
              </div>
              <div className="p-3">
                {p.placeholder ? (
                  <>
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-16 mb-2" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-full mb-1" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4 mb-2" />
                    <div className="h-5 bg-gray-100 rounded animate-pulse w-20" />
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-medium text-pink-600 bg-pink-50 rounded-full px-2 py-0.5">
                      {(p.categorias as any)?.nombre ?? "Sin categoría"}
                    </span>
                    <p className="text-xs font-medium text-gray-800 line-clamp-2 mt-1.5">{p.nombre}</p>
                    <p className="text-base font-bold text-gray-900 mt-1">
                      ${Number(p.precio).toLocaleString("es-AR")}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewBannerPromo({ config, onConfigChange }: { config: Record<string, unknown>; onConfigChange?: (key: string, value: unknown) => void }) {
  const color = (config.color_fondo as string) || "#4f46e5";
  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className="text-white p-8 md:p-12 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6"
          style={{ background: `linear-gradient(to right, ${color}, ${color}dd)` }}
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Truck className="w-8 h-8" />
            </div>
            <div>
              {onConfigChange ? (
                <>
                  <EditableText tag="p" className="text-2xl md:text-3xl font-bold" value={(config.titulo as string) || "Promoción"} onChange={(v) => onConfigChange("titulo", v)} />
                  <EditableText tag="p" className="text-white/90 mt-1" value={(config.subtitulo as string) || "Descripción de la promo"} onChange={(v) => onConfigChange("subtitulo", v)} />
                </>
              ) : (
                <>
                  <p className="text-2xl md:text-3xl font-bold">{(config.titulo as string) || "Promoción"}</p>
                  <p className="text-white/90 mt-1">{(config.subtitulo as string) || "Descripción de la promo"}</p>
                </>
              )}
            </div>
          </div>
          {(config.boton_texto as string) && (
            onConfigChange ? (
              <span style={{ color }}>
                <EditableText
                  tag="span"
                  className="bg-white rounded-full px-8 py-3.5 font-semibold shadow-lg hover:shadow-xl transition-shadow shrink-0"
                  value={config.boton_texto as string}
                  onChange={(v) => onConfigChange("boton_texto", v)}
                />
              </span>
            ) : (
              <span className="bg-white rounded-full px-8 py-3.5 font-semibold shadow-lg shrink-0" style={{ color }}>
                {config.boton_texto as string}
              </span>
            )
          )}
        </div>
      </div>
    </section>
  );
}

function PreviewPorQueElegirnos({ config, onConfigChange }: { config: Record<string, unknown>; onConfigChange?: (key: string, value: unknown) => void }) {
  const titulo = (config.titulo_seccion as string) || "¿Por qué elegirnos?";
  const cards = (config.cards as Array<{ icono: string; titulo: string; descripcion: string }>) ?? [];
  const updateCard = (index: number, field: string, value: string) => {
    if (!onConfigChange) return;
    const updated = [...cards];
    updated[index] = { ...updated[index], [field]: value };
    onConfigChange("cards", updated);
  };
  return (
    <section className="bg-gray-50 py-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-10">
          {onConfigChange ? (
            <EditableText tag="h2" className="text-2xl md:text-3xl font-bold text-gray-900" value={titulo} onChange={(v) => onConfigChange("titulo_seccion", v)} />
          ) : (
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{titulo}</h2>
          )}
          <div className="w-16 h-1 bg-pink-600 rounded-full mx-auto mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, i) => {
            const Icon = ICON_MAP[card.icono] ?? Star;
            return (
              <div key={i} className="bg-white rounded-2xl p-8 text-center shadow-sm hover:shadow-md transition-shadow">
                <div className="w-14 h-14 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-6 h-6" />
                </div>
                {onConfigChange ? (
                  <>
                    <EditableText tag="h3" className="text-lg font-bold text-gray-900 mb-2" value={card.titulo} onChange={(v) => updateCard(i, "titulo", v)} />
                    <EditableText tag="p" className="text-sm text-gray-500 leading-relaxed" value={card.descripcion} onChange={(v) => updateCard(i, "descripcion", v)} />
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{card.titulo}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{card.descripcion}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PreviewTextoLibre({ config }: { config: Record<string, unknown> }) {
  const contenido = (config.contenido as string) || "";
  if (!contenido) {
    return (
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm italic">
          Bloque de texto vacío - editá el contenido en el panel lateral
        </div>
      </section>
    );
  }
  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(contenido) }} />
    </section>
  );
}

function PreviewImagenBanner({ config }: { config: Record<string, unknown> }) {
  const url = (config.url_imagen as string) || "";
  const alt = (config.alt as string) || "Banner";
  const alto = (config.alto as string) || "mediano";
  const heightMap: Record<string, string> = { pequeno: "200px", mediano: "300px", grande: "400px" };
  const h = heightMap[alto] || "300px";

  if (!url) {
    return (
      <section className="py-4">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-2xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center" style={{ height: h }}>
            <div className="text-center text-gray-400">
              <Image className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">Sin imagen configurada</p>
            </div>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="py-4">
      <div className="max-w-7xl mx-auto px-4">
        <img src={url} alt={alt} className="w-full rounded-2xl object-cover" style={{ height: h }} />
      </div>
    </section>
  );
}

// ── Block Preview Router ───────────────────────────────────────────────────

function BlockPreview({ bloque, onConfigChange }: { bloque: Bloque; onConfigChange?: (key: string, value: unknown) => void }) {
  switch (bloque.tipo) {
    case "hero":
      return <PreviewHero config={bloque.config} onConfigChange={onConfigChange} />;
    case "trust_badges":
      return <PreviewTrustBadges config={bloque.config} onConfigChange={onConfigChange} />;
    case "categorias_destacadas":
      return <PreviewCategoriasDestacadas config={bloque.config} onConfigChange={onConfigChange} />;
    case "productos_destacados":
      return <PreviewProductosDestacados config={bloque.config} onConfigChange={onConfigChange} />;
    case "banner_promo":
      return <PreviewBannerPromo config={bloque.config} onConfigChange={onConfigChange} />;
    case "por_que_elegirnos":
      return <PreviewPorQueElegirnos config={bloque.config} onConfigChange={onConfigChange} />;
    case "texto_libre":
      return <PreviewTextoLibre config={bloque.config} />;
    case "imagen_banner":
      return <PreviewImagenBanner config={bloque.config} />;

    case "aumentos_recientes":
      return (
        <section className="py-8 bg-orange-50/40 border-t border-orange-100">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-500" />
                Aumentos Recientes
              </h2>
              <span className="text-xs text-orange-500 font-medium">Ver todos →</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: Math.min((bloque.config.max_items_home as number) || 4, 4) }).map((_, i) => (
                <div key={i} className="rounded-xl border border-orange-100 bg-white p-3">
                  <div className="aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                    <Package className="w-8 h-8 text-gray-300" />
                  </div>
                  <div className="text-xs font-medium text-gray-700 line-clamp-1">Producto ejemplo {i + 1}</div>
                  <div className="text-sm font-bold text-gray-900 mt-1">$1.200</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-gray-400 line-through">$1.000</span>
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-1 rounded">↑ +20%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "ultimas_unidades":
      return (
        <section className="py-8 bg-red-50/40 border-t border-red-100">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">{(bloque.config.titulo as string) || "Últimas Unidades"}</h2>
              <div className="w-12 h-0.5 bg-red-400 rounded-full mx-auto mt-2" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-red-100 bg-white p-3">
                  <div className="aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center relative">
                    <Package className="w-8 h-8 text-gray-300" />
                    <span className="absolute bottom-1 right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">¡Últimas {i + 1}!</span>
                  </div>
                  <div className="text-xs font-medium text-gray-700 line-clamp-1">Producto ejemplo {i + 1}</div>
                  <div className="text-sm font-bold text-gray-900 mt-1">$1.200</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "mas_vendidos":
      return (
        <section className="py-8">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">{(bloque.config.titulo as string) || "Los Más Vendidos"}</h2>
              <div className="w-12 h-0.5 bg-primary rounded-full mx-auto mt-2" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-3">
                  <div className="aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                    <Package className="w-8 h-8 text-gray-300" />
                  </div>
                  <div className="text-xs font-medium text-gray-700 line-clamp-1">Producto ejemplo {i + 1}</div>
                  <div className="text-sm font-bold text-gray-900 mt-1">$1.200</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "nuevos_ingresos":
      return (
        <section className="py-8 bg-emerald-50/40 border-t border-emerald-100">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">{(bloque.config.titulo as string) || "Nuevos Ingresos"}</h2>
              <div className="w-12 h-0.5 bg-emerald-500 rounded-full mx-auto mt-2" />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-emerald-100 bg-white p-3 flex-shrink-0 w-36">
                  <div className="aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                    <Package className="w-8 h-8 text-gray-300" />
                  </div>
                  <div className="text-xs font-medium text-gray-700 line-clamp-1">Producto {i + 1}</div>
                  <div className="text-sm font-bold text-gray-900 mt-1">$1.200</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    default:
      return (
        <section className="py-8">
          <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm">
            Bloque desconocido: {bloque.tipo}
          </div>
        </section>
      );
  }
}

// ── Insert Point Button ────────────────────────────────────────────────────

function InsertPoint({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative group h-4 flex items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-pink-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="relative z-10 w-6 h-6 rounded-full bg-pink-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-md"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Featured Products Panel ─────────────────────────────────────────────────

function FeaturedProductsPanel() {
  const [products, setProducts] = useState<{ id: string; nombre: string; imagen_url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("productos")
      .select("id, nombre, imagen_url")
      .eq("destacado", true)
      .order("nombre")
      .then(({ data }) => {
        setProducts(data || []);
        setLoading(false);
      });
  }, []);

  const removeDestacado = async (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    await supabase.from("productos").update({ destacado: false }).eq("id", id);
  };

  if (loading) return <p className="text-xs text-muted-foreground">Cargando destacados...</p>;
  if (products.length === 0)
    return <p className="text-xs text-muted-foreground italic">Ningún producto marcado como destacado.</p>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
      {products.map((p) => (
        <div key={p.id} className="relative group rounded-lg border border-border bg-muted/40 p-2 flex flex-col items-center gap-1">
          {p.imagen_url ? (
            <img src={p.imagen_url} alt="" className="w-12 h-12 object-contain rounded" />
          ) : (
            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
              <Package className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <p className="text-[10px] text-center text-foreground leading-tight line-clamp-2">{p.nombre}</p>
          <button
            onClick={() => removeDestacado(p.id)}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold"
            title="Quitar de destacados"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PaginaInicioEditor() {
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addAtIndex, setAddAtIndex] = useState<number>(-1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [previewKey, setPreviewKey] = useState(0);
  const [containerWidth, setContainerWidth] = useState(900);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth - 32));
    ro.observe(el);
    setContainerWidth(el.clientWidth - 32);
    return () => ro.disconnect();
  }, []);

  const selectedBlock = bloques.find((b) => b.id === selectedId) ?? null;

  // Track unsaved changes
  useEffect(() => {
    const current = JSON.stringify(bloques);
    setHasChanges(current !== savedSnapshot);
  }, [bloques, savedSnapshot]);

  // ── Load ────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("pagina_inicio_bloques")
        .select("*")
        .order("orden", { ascending: true });

      if (error) {
        console.error("Error loading blocks:", error);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        const defaults = createDefaultBlocks();
        setBloques(defaults);
        setOriginalIds([]);
        setSavedSnapshot(JSON.stringify(defaults));
      } else {
        const loaded = data as Bloque[];
        setBloques(loaded);
        setOriginalIds(loaded.map((b) => b.id));
        setSavedSnapshot(JSON.stringify(loaded));
      }
      setLoading(false);
    })();
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const currentIds = bloques.map((b) => b.id);
      const idsToDelete = originalIds.filter((id) => !currentIds.includes(id));
      if (idsToDelete.length > 0) {
        await supabase.from("pagina_inicio_bloques").delete().in("id", idsToDelete);
      }

      const rows = bloques.map((b, i) => ({
        id: b.id,
        tipo: b.tipo,
        titulo: b.titulo,
        orden: i,
        activo: b.activo,
        config: b.config,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("pagina_inicio_bloques").upsert(rows);
      if (error) throw error;

      setOriginalIds(currentIds);
      setSavedSnapshot(JSON.stringify(bloques));
      setSaved(true);
      setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error saving:", err);
      showAdminToast("Error al guardar los cambios", "error");
    } finally {
      setSaving(false);
    }
  }, [bloques, originalIds]);

  // ── Block operations ────────────────────────────────────────────────────

  const moveBlock = (id: string, dir: -1 | 1) => {
    setBloques((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const toggleActivo = (id: string) => {
    setBloques((prev) =>
      prev.map((b) => (b.id === id ? { ...b, activo: !b.activo } : b))
    );
  };

  const deleteBlock = (id: string) => {
    setBloques((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDeleteConfirm(null);
  };

  const addBlock = (tipo: string) => {
    const def = getBlockDef(tipo)!;
    const newBlock: Bloque = {
      id: crypto.randomUUID(),
      tipo,
      titulo: def.defaultTitulo,
      orden: bloques.length,
      activo: true,
      config: { ...def.defaultConfig },
    };
    if (addAtIndex >= 0 && addAtIndex <= bloques.length) {
      setBloques((prev) => {
        const next = [...prev];
        next.splice(addAtIndex, 0, newBlock);
        return next;
      });
    } else {
      setBloques((prev) => [...prev, newBlock]);
    }
    setSelectedId(newBlock.id);
    setAddDialogOpen(false);
    setAddAtIndex(-1);
  };

  const updateConfig = (id: string, key: string, value: unknown) => {
    setBloques((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, config: { ...b.config, [key]: value } } : b
      )
    );
  };

  const updateTitulo = (id: string, titulo: string) => {
    setBloques((prev) =>
      prev.map((b) => (b.id === id ? { ...b, titulo } : b))
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const previewWidths = { desktop: "100%", tablet: "768px", mobile: "375px" };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* ── Top Toolbar ────────────────────────────────────────────────── */}
      <div className="h-14 border-b bg-background px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/configuracion" className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Editor de Página</h1>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setDevice("desktop")}
            className={`p-1.5 rounded-md transition-colors ${device === "desktop" ? "bg-background shadow-sm" : "hover:bg-muted-foreground/10"}`}
            title="Escritorio"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDevice("tablet")}
            className={`p-1.5 rounded-md transition-colors ${device === "tablet" ? "bg-background shadow-sm" : "hover:bg-muted-foreground/10"}`}
            title="Tablet"
          >
            <Tablet className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDevice("mobile")}
            className={`p-1.5 rounded-md transition-colors ${device === "mobile" ? "bg-background shadow-sm" : "hover:bg-muted-foreground/10"}`}
            title="Móvil"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/configuracion/pagina-inicio/programaciones">
            <Button variant="outline" size="sm">
              <Megaphone className="w-3.5 h-3.5 mr-1.5" />
              Plantillas y programaciones
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("/tienda", "_blank")}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Abrir tienda
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="relative">
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            {saved ? "Guardado" : "Guardar"}
            {hasChanges && !saved && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-pink-500 rounded-full" />
            )}
          </Button>
        </div>
      </div>

      {/* ── Main Area ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Real Store Preview (iframe) ────────────────── */}
        <div ref={previewContainerRef} className="flex-1 bg-gray-300 overflow-hidden flex flex-col items-center p-4 gap-2">
          {/* Toolbar de recarga */}
          <div className="flex items-center gap-2 self-stretch justify-end">
            <span className="text-xs text-gray-500">
              {device === "mobile" ? "375px" : device === "tablet" ? "768px" : "Escritorio"}
            </span>
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="flex items-center gap-1.5 text-xs bg-white border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors text-gray-600"
              title="Recargar preview"
            >
              <RefreshCw className="w-3 h-3" />
              Recargar
            </button>
          </div>

          {/* Contenedor del iframe con escalado */}
          {(() => {
            const devicePixelWidths: Record<string, number> = { mobile: 375, tablet: 768 };
            const iframeW = devicePixelWidths[device] ?? containerWidth;
            const scale = device === "desktop" ? 1 : Math.min(1, containerWidth / iframeW);
            const visibleH = `calc(100% - 32px)`;
            return (
              <div
                className="relative overflow-hidden rounded-xl shadow-2xl bg-white"
                style={{
                  width: device === "desktop" ? "100%" : iframeW * scale,
                  height: visibleH,
                  flexShrink: 0,
                }}
              >
                <iframe
                  ref={iframeRef}
                  key={previewKey}
                  src={`/?_t=${previewKey}`}
                  title="Vista previa de la tienda"
                  className="border-0 bg-white"
                  style={{
                    width: device === "desktop" ? "100%" : iframeW,
                    height: scale < 1 ? `${100 / scale}%` : "100%",
                    transform: scale < 1 ? `scale(${scale})` : undefined,
                    transformOrigin: "top left",
                    pointerEvents: "none",
                  }}
                />
              </div>
            );
          })()}
        </div>

        {/* ── Right: Settings Panel ──────────────────────────────────── */}
        <div ref={settingsPanelRef} className="w-[380px] bg-background border-l overflow-y-auto shrink-0">
          {selectedBlock ? (
            <div>
              {/* Panel header */}
              <div className="sticky top-0 bg-background z-10 px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => { const Icon = getBlockIcon(selectedBlock.tipo); return <Icon className="w-4 h-4 text-pink-600" />; })()}
                  <span className="text-sm font-semibold">Editar {getBlockDef(selectedBlock.tipo)?.label ?? selectedBlock.tipo}</span>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs (only Contenido active for now) */}
              <div className="flex border-b">
                <button className="flex-1 py-2.5 text-sm font-medium text-pink-600 border-b-2 border-pink-600">
                  Contenido
                </button>
                <button className="flex-1 py-2.5 text-sm font-medium text-gray-400 cursor-not-allowed">
                  Estilo
                </button>
              </div>

              {/* Config form */}
              <div className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>Nombre del bloque</Label>
                  <Input
                    value={selectedBlock.titulo}
                    onChange={(e) => updateTitulo(selectedBlock.id, e.target.value)}
                  />
                </div>
                <Separator />
                <BlockConfigForm
                  bloque={selectedBlock}
                  onConfigChange={(key, val) => updateConfig(selectedBlock.id, key, val)}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="px-4 py-3 border-b">
                <span className="text-sm font-semibold">Bloques de la página</span>
              </div>
              <div className="p-2">
                {bloques.length === 0 && (
                  <div className="py-12 text-center text-sm text-gray-400">
                    <MousePointer className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No hay bloques. Agregá uno para empezar.
                  </div>
                )}
                {bloques.map((bloque, idx: number) => {
                  const Icon = getBlockIcon(bloque.tipo);
                  const isSelected = selectedId === bloque.id;
                  return (
                    <div
                      key={bloque.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(idx)); e.currentTarget.classList.add("opacity-50"); }}
                      onDragEnd={(e) => { e.currentTarget.classList.remove("opacity-50"); }}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-pink-400"); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove("border-pink-400"); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("border-pink-400");
                        const from = Number(e.dataTransfer.getData("text/plain"));
                        if (from === idx || isNaN(from)) return;
                        setBloques((prev) => {
                          const list = [...prev];
                          const [moved] = list.splice(from, 1);
                          list.splice(idx, 0, moved);
                          return list;
                        });
                      }}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all group border ${
                        isSelected ? "bg-pink-50 border-pink-200" : "border-transparent hover:bg-gray-50"
                      }`}
                      onClick={() => setSelectedId(bloque.id)}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isSelected ? "bg-pink-100" : "bg-indigo-50"}`}>
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-pink-600" : "text-indigo-600"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{bloque.titulo}</p>
                        <p className="text-[10px] text-gray-400">{getBlockDef(bloque.tipo)?.label}</p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); moveBlock(bloque.id, -1); }}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                          disabled={idx === 0}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveBlock(bloque.id, 1); }}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                          disabled={idx === bloques.length - 1}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActivo(bloque.id);
                        }}
                        className="shrink-0"
                      >
                        <span
                          className={`w-7 h-3.5 rounded-full relative inline-flex items-center transition-colors ${
                            bloque.activo ? "bg-pink-500" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`w-2.5 h-2.5 rounded-full bg-white absolute transition-transform ${
                              bloque.activo ? "translate-x-3.5" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() => { setAddAtIndex(-1); setAddDialogOpen(true); }}
                  className="w-full mt-2 p-2 rounded-lg border-2 border-dashed border-gray-300 hover:border-pink-400 hover:bg-pink-50/50 transition-colors text-gray-400 hover:text-pink-500 flex items-center justify-center gap-2 text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar bloque
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Block Dialog ─────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar bloque</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {BLOCK_TYPES.map((bt) => {
              const Icon = bt.icon;
              return (
                <button
                  key={bt.tipo}
                  onClick={() => addBlock(bt.tipo)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-pink-300 hover:bg-pink-50 transition-colors text-center"
                >
                  <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-pink-600" />
                  </div>
                  <span className="text-sm font-medium">{bt.label}</span>
                  <span className="text-[10px] text-gray-400 leading-tight">{bt.description}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ────────────────────────────────── */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar bloque</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que querés eliminar este bloque? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteBlock(deleteConfirm)}
            >
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Block config forms ─────────────────────────────────────────────────────

function BlockConfigForm({
  bloque,
  onConfigChange,
}: {
  bloque: Bloque;
  onConfigChange: (key: string, value: unknown) => void;
}) {
  const c = bloque.config;

  switch (bloque.tipo) {
    case "hero":
      return (
        <div className="space-y-3">
          <CollapsibleSection title="Textos">
            <Field label="Título" value={c.titulo as string} onChange={(v) => onConfigChange("titulo", v)} />
            <div className="space-y-1.5">
              <Label>Subtítulo</Label>
              <textarea
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[60px] resize-y"
                rows={3}
                value={(c.subtitulo as string) ?? ""}
                onChange={(e) => onConfigChange("subtitulo", e.target.value)}
              />
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Botones">
            <Field label="Texto del botón principal" value={c.boton_texto as string} onChange={(v) => onConfigChange("boton_texto", v)} />
            <Field label="Link del botón" value={c.boton_link as string} onChange={(v) => onConfigChange("boton_link", v)} />
            <Field label="Texto del botón secundario" value={c.boton_secundario_texto as string} onChange={(v) => onConfigChange("boton_secundario_texto", v)} />
            <Field label="Link secundario" value={c.boton_secundario_link as string} onChange={(v) => onConfigChange("boton_secundario_link", v)} />
          </CollapsibleSection>
          <CollapsibleSection title="Estilo">
            <ColorField label="Color inicio gradiente" value={c.color_inicio as string} onChange={(v) => onConfigChange("color_inicio", v)} />
            <ColorField label="Color fin gradiente" value={c.color_fin as string} onChange={(v) => onConfigChange("color_fin", v)} />
          </CollapsibleSection>
        </div>
      );

    case "trust_badges":
      return (
        <div className="space-y-3">
          {((c.items as Array<{ icono: string; titulo: string; subtitulo: string }>) ?? []).map(
            (item, i) => (
              <CollapsibleSection key={i} title={`Badge ${i + 1}`} defaultOpen={i === 0}>
                <IconSelect
                  value={item.icono}
                  onChange={(v) => {
                    const items = [...(c.items as Array<{ icono: string; titulo: string; subtitulo: string }>)];
                    items[i] = { ...items[i], icono: v };
                    onConfigChange("items", items);
                  }}
                />
                <Field
                  label="Título"
                  value={item.titulo}
                  onChange={(v) => {
                    const items = [...(c.items as Array<{ icono: string; titulo: string; subtitulo: string }>)];
                    items[i] = { ...items[i], titulo: v };
                    onConfigChange("items", items);
                  }}
                />
                <Field
                  label="Subtítulo"
                  value={item.subtitulo}
                  onChange={(v) => {
                    const items = [...(c.items as Array<{ icono: string; titulo: string; subtitulo: string }>)];
                    items[i] = { ...items[i], subtitulo: v };
                    onConfigChange("items", items);
                  }}
                />
              </CollapsibleSection>
            )
          )}
        </div>
      );

    case "categorias_destacadas":
      return (
        <div className="space-y-3">
          <Field label="Título de sección" value={c.titulo_seccion as string} onChange={(v) => onConfigChange("titulo_seccion", v)} />
          <div className="space-y-1.5">
            <Label>Cantidad máxima</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={(c.max_items as number) ?? 6}
              onChange={(e) => onConfigChange("max_items", parseInt(e.target.value) || 6)}
            />
          </div>
        </div>
      );

    case "productos_destacados":
      return (
        <div className="space-y-3">
          <Field label="Título de sección" value={c.titulo_seccion as string} onChange={(v) => onConfigChange("titulo_seccion", v)} />
          <div className="space-y-1.5">
            <Label>Cantidad máxima</Label>
            <Select
              value={String((c.max_items as number) ?? 8)}
              onValueChange={(v) => onConfigChange("max_items", parseInt((v ?? "8"), 10))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Cantidad máxima" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="12">12</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Orden</Label>
            <Select
              value={(c.orden as string) ?? "recientes"}
              onValueChange={(v) => onConfigChange("orden", v ?? "recientes")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Orden" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (marcados como destacados)</SelectItem>
                <SelectItem value="recientes">Más recientes</SelectItem>
                <SelectItem value="precio_asc">Precio: menor a mayor</SelectItem>
                <SelectItem value="precio_desc">Precio: mayor a menor</SelectItem>
                <SelectItem value="nombre">Nombre A-Z</SelectItem>
                <SelectItem value="recien_repuestos">Recién repuestos (sin stock → con stock)</SelectItem>
                <SelectItem value="mas_vendidos">Más vendidos (últimos 30 días)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(() => {
            const TAB_META: Record<string, { label: string }> = {
              destacados: { label: "Destacados" },
              nuevos: { label: "Nuevos ingresos" },
              reingresos: { label: "De vuelta en stock" },
              ofertas: { label: "Ofertas" },
              mas_vendidos: { label: "Más vendidos" },
            };
            const rawTabs = (c.tabs as Array<{ key: string; activo: boolean }> | undefined);
            const defaultTabs = [
              { key: "destacados", activo: true },
              { key: "nuevos", activo: true },
              { key: "reingresos", activo: true },
              { key: "ofertas", activo: true },
              { key: "mas_vendidos", activo: true },
            ];
            const currentTabs = Array.isArray(rawTabs) && rawTabs.length > 0
              ? defaultTabs.map((d) => rawTabs.find((t) => t.key === d.key) ?? d)
                  .concat(rawTabs.filter((t) => !defaultTabs.some((d) => d.key === t.key)))
              : defaultTabs;
            // Preservar orden custom si existe
            const orderedTabs = Array.isArray(rawTabs) && rawTabs.length > 0
              ? rawTabs.filter((t) => t && typeof t.key === "string" && TAB_META[t.key])
              : defaultTabs;
            const updateTabs = (next: Array<{ key: string; activo: boolean }>) => {
              onConfigChange("tabs", next);
            };
            const moveTab = (idx: number, dir: -1 | 1) => {
              const next = [...orderedTabs];
              const target = idx + dir;
              if (target < 0 || target >= next.length) return;
              [next[idx], next[target]] = [next[target], next[idx]];
              updateTabs(next);
            };
            const toggleTab = (idx: number) => {
              const next = orderedTabs.map((t, i) => i === idx ? { ...t, activo: !t.activo } : t);
              updateTabs(next);
            };
            const activeKeys = orderedTabs.filter((t) => t.activo).map((t) => t.key);
            const defaultTab = (c.tab_defecto as string) ?? activeKeys[0] ?? "destacados";
            void currentTabs;
            return (
              <>
                <div className="space-y-1.5">
                  <Label>Tabs visibles (orden y activación)</Label>
                  <div className="space-y-1 rounded-lg border border-gray-200 p-2 bg-gray-50/50">
                    {orderedTabs.map((t, idx) => (
                      <div key={t.key} className="flex items-center gap-2 px-2 py-1.5 bg-white rounded border border-gray-100">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveTab(idx, -1)}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Subir"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === orderedTabs.length - 1}
                            onClick={() => moveTab(idx, 1)}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Bajar"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className={`flex-1 text-sm font-medium ${t.activo ? "text-gray-900" : "text-gray-400 line-through"}`}>
                          {TAB_META[t.key]?.label ?? t.key}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleTab(idx)}
                          className={`p-1.5 rounded-md transition ${t.activo ? "text-primary hover:bg-primary/10" : "text-gray-400 hover:bg-gray-100"}`}
                          aria-label={t.activo ? "Ocultar tab" : "Mostrar tab"}
                          title={t.activo ? "Ocultar tab" : "Mostrar tab"}
                        >
                          {t.activo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">El primer tab visible es el que se muestra por defecto cuando abre la tienda.</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Tab por defecto</Label>
                  <Select
                    value={activeKeys.includes(defaultTab) ? defaultTab : (activeKeys[0] ?? "destacados")}
                    onValueChange={(v) => onConfigChange("tab_defecto", v ?? "destacados")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {orderedTabs.filter((t) => t.activo).map((t) => (
                        <SelectItem key={t.key} value={t.key}>{TAB_META[t.key]?.label ?? t.key}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            );
          })()}

          <div className="space-y-1.5">
            <Label>Rotación automática</Label>
            <Select
              value={String((c.carrusel_intervalo as number) ?? 0)}
              onValueChange={(v) => onConfigChange("carrusel_intervalo", parseInt(v ?? "0", 10))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sin rotación</SelectItem>
                <SelectItem value="3">Cada 3 segundos</SelectItem>
                <SelectItem value="5">Cada 5 segundos</SelectItem>
                <SelectItem value="8">Cada 8 segundos</SelectItem>
                <SelectItem value="10">Cada 10 segundos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Productos destacados actuales</Label>
            <FeaturedProductsPanel />
          </div>
        </div>
      );

    case "banner_promo":
      return (
        <div className="space-y-3">
          <Field label="Título" value={c.titulo as string} onChange={(v) => onConfigChange("titulo", v)} />
          <Field label="Subtítulo" value={c.subtitulo as string} onChange={(v) => onConfigChange("subtitulo", v)} />
          <Field label="Texto del botón" value={c.boton_texto as string} onChange={(v) => onConfigChange("boton_texto", v)} />
          <Field label="Link" value={c.link as string} onChange={(v) => onConfigChange("link", v)} />
          <ColorField label="Color de fondo" value={c.color_fondo as string} onChange={(v) => onConfigChange("color_fondo", v)} />
        </div>
      );

    case "por_que_elegirnos":
      return (
        <div className="space-y-3">
          <Field label="Título de sección" value={c.titulo_seccion as string} onChange={(v) => onConfigChange("titulo_seccion", v)} />
          {((c.cards as Array<{ icono: string; titulo: string; descripcion: string }>) ?? []).map(
            (card, i) => (
              <CollapsibleSection key={i} title={`Tarjeta ${i + 1}`} defaultOpen={i === 0}>
                <IconSelect
                  value={card.icono}
                  onChange={(v) => {
                    const cards = [...(c.cards as Array<{ icono: string; titulo: string; descripcion: string }>)];
                    cards[i] = { ...cards[i], icono: v };
                    onConfigChange("cards", cards);
                  }}
                />
                <Field
                  label="Título"
                  value={card.titulo}
                  onChange={(v) => {
                    const cards = [...(c.cards as Array<{ icono: string; titulo: string; descripcion: string }>)];
                    cards[i] = { ...cards[i], titulo: v };
                    onConfigChange("cards", cards);
                  }}
                />
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <textarea
                    className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[60px] resize-y"
                    value={card.descripcion}
                    onChange={(e) => {
                      const cards = [...(c.cards as Array<{ icono: string; titulo: string; descripcion: string }>)];
                      cards[i] = { ...cards[i], descripcion: e.target.value };
                      onConfigChange("cards", cards);
                    }}
                  />
                </div>
              </CollapsibleSection>
            )
          )}
        </div>
      );

    case "texto_libre":
      return (
        <div className="space-y-1.5">
          <Label>Contenido</Label>
          <textarea
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[240px] resize-y font-mono"
            rows={10}
            value={(c.contenido as string) ?? ""}
            onChange={(e) => onConfigChange("contenido", e.target.value)}
            placeholder="HTML o Markdown..."
          />
        </div>
      );

    case "imagen_banner":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>URL de imagen</Label>
            <Input
              value={(c.url_imagen as string) ?? ""}
              onChange={(e) => onConfigChange("url_imagen", e.target.value)}
              placeholder="https://..."
            />
            {(c.url_imagen as string) && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                <img src={c.url_imagen as string} alt="Preview" className="w-full h-24 object-cover" />
              </div>
            )}
          </div>
          <Field label="Link destino" value={c.link as string} onChange={(v) => onConfigChange("link", v)} />
          <Field label="Texto alternativo" value={c.alt as string} onChange={(v) => onConfigChange("alt", v)} />
          <div className="space-y-1.5">
            <Label>Alto</Label>
            <Select
              value={(c.alto as string) ?? "mediano"}
              onValueChange={(v) => onConfigChange("alto", v ?? "mediano")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Alto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pequeno">Pequeño (200px)</SelectItem>
                <SelectItem value="mediano">Mediano (300px)</SelectItem>
                <SelectItem value="grande">Grande (400px)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "aumentos_recientes":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Días hacia atrás</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={(c.dias_atras as number) ?? 3}
              onChange={(e) => onConfigChange("dias_atras", parseInt(e.target.value) || 3)}
            />
            <p className="text-[11px] text-muted-foreground">Productos con precio actualizado en los últimos X días.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Productos en el home</Label>
            <Select
              value={String((c.max_items_home as number) ?? 8)}
              onValueChange={(v) => onConfigChange("max_items_home", parseInt(v || "8", 10))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="12">12</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">La página de aumentos siempre muestra todos.</p>
          </div>
        </div>
      );

    case "ultimas_unidades":
      return (
        <div className="space-y-3">
          <Field
            label="Título de sección"
            value={(c.titulo as string) ?? "Últimas Unidades"}
            onChange={(v) => onConfigChange("titulo", v)}
          />
          <div className="space-y-1.5">
            <Label>Umbral de stock</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={(c.umbral_stock as number) ?? 5}
              onChange={(e) => onConfigChange("umbral_stock", parseInt(e.target.value) || 5)}
            />
            <p className="text-[11px] text-muted-foreground">Mostrar productos con stock menor o igual a este número.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Cantidad máxima</Label>
            <Select
              value={String((c.max_items as number) ?? 8)}
              onValueChange={(v) => onConfigChange("max_items", parseInt(v || "8", 10))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="12">12</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "mas_vendidos":
      return (
        <div className="space-y-3">
          <Field
            label="Título de sección"
            value={(c.titulo as string) ?? "Los Más Vendidos"}
            onChange={(v) => onConfigChange("titulo", v)}
          />
          <div className="space-y-1.5">
            <Label>Días a considerar</Label>
            <Select
              value={String((c.dias_atras as number) ?? 30)}
              onValueChange={(v) => onConfigChange("dias_atras", parseInt(v || "30", 10))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="15">Últimos 15 días</SelectItem>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="60">Últimos 60 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cantidad máxima</Label>
            <Select
              value={String((c.max_items as number) ?? 8)}
              onValueChange={(v) => onConfigChange("max_items", parseInt(v || "8", 10))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="12">12</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "nuevos_ingresos":
      return (
        <div className="space-y-3">
          <Field
            label="Título de sección"
            value={(c.titulo as string) ?? "Nuevos Ingresos"}
            onChange={(v) => onConfigChange("titulo", v)}
          />
          <div className="space-y-1.5">
            <Label>Días hacia atrás</Label>
            <Select
              value={String((c.dias_atras as number) ?? 7)}
              onValueChange={(v) => onConfigChange("dias_atras", parseInt(v || "7", 10))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Últimos 3 días</SelectItem>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="14">Últimos 14 días</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Productos con movimiento de compra o ajuste de ingreso.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Cantidad máxima</Label>
            <Select
              value={String((c.max_items as number) ?? 16)}
              onValueChange={(v) => onConfigChange("max_items", parseInt(v || "16", 10))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="16">16</SelectItem>
                <SelectItem value="24">24</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    default:
      return (
        <p className="text-sm text-muted-foreground">
          Sin configuración disponible para este tipo de bloque.
        </p>
      );
  }
}

// ── Shared field components ────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? "#4f46e5"}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-input cursor-pointer"
        />
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

function IconSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Icono</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? value)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Icono" />
        </SelectTrigger>
        <SelectContent>
          {ICON_OPTIONS.map((icon) => (
            <SelectItem key={icon} value={icon}>
              {icon}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
