"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { showToast } from "@/components/tienda/toast";
import { formatCurrency, daysSinceAR } from "@/lib/formatters";
import {
  Package,
  ShoppingCart,
  Truck,
  ShieldCheck,
  RefreshCw,
  Headphones,
  DollarSign,
  Zap,
  Star,
  ShoppingBag,
  Check,
  Settings,
  Plus,
  Minus,
  Candy,
  Store,
  BookOpen,
  Cigarette,
  MoreHorizontal,
  Pill,
  Milk,
  TrendingUp,
  RotateCw,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { slugify, productSlug } from "@/lib/utils";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";
import InstallPrompt from "@/components/tienda/install-prompt";
import { VistosRecientementeBlock } from "@/components/tienda/vistos-recientemente";

/* ──────────────── types ──────────────── */

interface Categoria {
  id: string;
  nombre: string;
  imagen_url?: string | null;
}

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  activo: boolean;
  stock: number;
  es_combo?: boolean;
  categorias?: Categoria | null;
  precio_anterior?: number | null;
  fecha_actualizacion?: string | null;
  updated_at?: string;
  created_at?: string;
}

interface CarritoItem {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  cantidad: number;
  presentacion?: string;
}

interface Bloque {
  id: string;
  tipo: string;
  titulo: string;
  orden: number;
  activo: boolean;
  config: Record<string, any>;
}

/* ──────────────── icon map ──────────────── */

const ICON_MAP: Record<string, LucideIcon> = {
  Truck,
  Shield: ShieldCheck,
  ShieldCheck,
  RefreshCw,
  Headphones,
  Star,
  ShoppingBag,
  DollarSign,
  Package,
  Zap,
  Check,
  Settings,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Package;
}

/* ──────────────── helpers ──────────────── */


/* ──────────────── skeleton helpers ──────────────── */

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
      <div className="aspect-square bg-gray-100" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-16 bg-gray-100 rounded-full" />
        <div className="h-4 w-3/4 bg-gray-100 rounded" />
        <div className="h-5 w-1/3 bg-gray-100 rounded" />
        <div className="h-10 w-full bg-gray-100 rounded-xl" />
      </div>
    </div>
  );
}

function SkeletonCategory() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 animate-pulse">
      <div className="h-4 w-20 bg-gray-100 rounded mx-auto" />
    </div>
  );
}

/* ──────────────── section title ──────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center mb-6 animate-fade-in-up">
      <h2 className="text-xl md:text-2xl font-bold text-gray-900">
        {children}
      </h2>
      <div className="w-12 h-0.5 bg-primary rounded-full mx-auto mt-2" />
    </div>
  );
}

/* ──────────────── block renderers ──────────────── */

// Decoraciones esteticas reutilizables para todos los hero variants
function HeroDecorations() {
  return (
    <>
      <div className="absolute -top-12 -right-12 w-72 h-72 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-white/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-6 right-1/3 w-2 h-2 bg-white/40 rounded-full hidden md:block" />
      <div className="absolute bottom-8 right-1/4 w-1.5 h-1.5 bg-white/40 rounded-full hidden md:block" />
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />
    </>
  );
}

// Hero variant for producto_destacado: split layout con imagen
function HeroProductoSlide({ slide }: { slide: Record<string, any> }) {
  const colorInicio = slide.color_inicio || "hsl(var(--primary))";
  const colorFin = slide.color_fin || "hsl(var(--primary) / 0.7)";
  const prod = slide.producto;
  const link = slide.boton_link || (prod ? `/productos/${prod.id}` : "/productos");

  return (
    <Link
      href={link}
      className="relative overflow-hidden block min-h-[180px] md:min-h-[200px] group"
      style={{ background: `linear-gradient(135deg, ${colorInicio}, ${colorFin})` }}
    >
      <HeroDecorations />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 w-full">
        <div className="flex items-center justify-between gap-4 md:gap-8">
          <div className="min-w-0 flex-1">
            {prod?.tiene_oferta && (
              <span className="inline-block bg-yellow-400 text-gray-900 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full mb-2 uppercase tracking-wide">
                ⚡ Oferta · {prod.descuento_pct}% off
              </span>
            )}
            <h1 className="text-xl md:text-3xl font-extrabold text-white leading-tight tracking-tight line-clamp-2">
              {slide.titulo || prod?.nombre || "Producto destacado"}
            </h1>
            {prod && (
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl md:text-3xl font-bold text-white">${prod.precio.toLocaleString("es-AR")}</span>
                {prod.tiene_oferta && (
                  <span className="text-sm text-white/70 line-through">${prod.precio_anterior.toLocaleString("es-AR")}</span>
                )}
              </div>
            )}
            {slide.subtitulo && !prod?.tiene_oferta && (
              <p className="text-sm md:text-base text-white/85 mt-2 max-w-md">{slide.subtitulo}</p>
            )}
            <span className="inline-flex items-center gap-1.5 mt-3 bg-white text-gray-900 rounded-full px-5 py-2 text-sm font-semibold shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all">
              {slide.boton_texto || "Ver producto"} <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </div>
          {prod?.imagen_url && (
            <div className="shrink-0 w-24 h-24 md:w-40 md:h-40 relative">
              <div className="absolute inset-0 bg-white/15 rounded-2xl rotate-6 blur-sm" />
              <div className="relative w-full h-full bg-white rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center">
                <img src={prod.imagen_url} alt={prod.nombre} className="max-w-full max-h-full object-contain p-2" />
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function HeroCarousel({ slides }: { slides: Record<string, any>[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  const go = (delta: number) => setIdx((i) => (i + delta + slides.length) % slides.length);
  const cur = slides[idx] || {};
  const colorInicio = cur.color_inicio || "hsl(var(--primary))";
  const colorFin = cur.color_fin || "hsl(var(--primary) / 0.7)";
  const isProducto = cur.tipo === "producto_destacado" && cur.producto;
  const prod = cur.producto;

  return (
    <section
      className="relative overflow-hidden min-h-[180px] md:min-h-[200px] transition-[background] duration-700"
      style={{ background: `linear-gradient(135deg, ${colorInicio}, ${colorFin})` }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <HeroDecorations />

      <div key={idx} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 w-full animate-fade-in-up">
        <div className="flex items-center justify-between gap-4 md:gap-8">
          <div className="min-w-0 flex-1">
            {isProducto && prod.tiene_oferta && (
              <span className="inline-block bg-yellow-400 text-gray-900 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full mb-2 uppercase tracking-wide">
                ⚡ Oferta · {prod.descuento_pct}% off
              </span>
            )}
            <h1 className="text-xl md:text-3xl font-extrabold text-white leading-tight tracking-tight line-clamp-2">
              {cur.titulo || "Bienvenido a nuestra tienda"}
            </h1>
            {isProducto && prod && (
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl md:text-3xl font-bold text-white">${prod.precio.toLocaleString("es-AR")}</span>
                {prod.tiene_oferta && (
                  <span className="text-sm text-white/70 line-through">${prod.precio_anterior.toLocaleString("es-AR")}</span>
                )}
              </div>
            )}
            {cur.subtitulo && !(isProducto && prod.tiene_oferta) && (
              <p className="text-sm md:text-base text-white/85 mt-2 max-w-lg">{cur.subtitulo}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {cur.boton_texto && (
                <Link
                  href={cur.boton_link || "/productos"}
                  className="inline-flex items-center gap-1.5 bg-white text-gray-900 rounded-full px-5 py-2 text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
                >
                  {cur.boton_texto} <span>→</span>
                </Link>
              )}
              {cur.boton_secundario_texto && (
                <Link
                  href={cur.boton_secundario_link || "/productos"}
                  className="border-2 border-white text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-white/15 active:scale-95 transition-all duration-200"
                >
                  {cur.boton_secundario_texto}
                </Link>
              )}
            </div>
          </div>
          {isProducto && prod.imagen_url && (
            <div className="shrink-0 w-24 h-24 md:w-40 md:h-40 relative">
              <div className="absolute inset-0 bg-white/15 rounded-2xl rotate-6 blur-sm" />
              <div className="relative w-full h-full bg-white rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center">
                <img src={prod.imagen_url} alt={prod.nombre} className="max-w-full max-h-full object-contain p-2" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Flechas */}
      <button
        type="button"
        aria-label="Anterior"
        onClick={() => go(-1)}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors z-20"
      >
        <span className="text-lg leading-none">‹</span>
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => go(1)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors z-20"
      >
        <span className="text-lg leading-none">›</span>
      </button>

      {/* Dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
        {slides.map((_, i) => (
          <button
            key={i}
            aria-label={`Ir al slide ${i + 1}`}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/75"}`}
          />
        ))}
      </div>
    </section>
  );
}

function HeroBlock({ config }: { config: Record<string, any> }) {
  const colorInicio = config.color_inicio || "hsl(var(--primary))";
  const colorFin = config.color_fin || "hsl(var(--primary) / 0.7)";

  return (
    <section
      className="relative overflow-hidden min-h-[180px] md:min-h-[180px]"
      style={{ background: `linear-gradient(135deg, ${colorInicio}, ${colorFin})` }}
    >
      <HeroDecorations />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 w-full">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight tracking-tight">
              {config.titulo || "Bienvenido a nuestra tienda"}
            </h1>
            {config.subtitulo && (
              <p className="text-sm md:text-base text-white/85 mt-2 max-w-lg">
                {config.subtitulo}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 shrink-0 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            {config.boton_texto && (
              <Link
                href={config.boton_link || "/productos"}
                className="inline-flex items-center gap-1.5 bg-white text-gray-900 rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
              >
                {config.boton_texto} <span>→</span>
              </Link>
            )}
            {config.boton_secundario_texto && (
              <Link
                href={config.boton_secundario_link || "/productos"}
                className="border-2 border-white text-white rounded-full px-6 py-2 text-sm font-semibold hover:bg-white/15 active:scale-95 transition-all duration-200"
              >
                {config.boton_secundario_texto}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBadgesBlock({ config }: { config: Record<string, any> }) {
  const items: { icono: string; titulo: string; subtitulo: string }[] =
    config.items || [];

  if (items.length === 0) return null;

  return (
    <section className="bg-white border-y border-gray-100 py-4 min-h-[80px]">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 stagger-children">
          {items.map((b, i) => {
            const Icon = resolveIcon(b.icono);
            return (
              <div key={i} className="flex items-center gap-2 md:gap-3 py-2 animate-fade-in-up">
                <div className="w-9 h-9 md:w-12 md:h-12 rounded-full bg-primary/8 text-primary flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">
                    {b.titulo}
                  </p>
                  <p className="text-[10px] md:text-xs text-gray-500 leading-tight mt-0.5">{b.subtitulo}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const categoryIcons: Record<string, LucideIcon> = {
  kiosco: Candy,
  almacen: Store,
  libreria: BookOpen,
  cigarros: Cigarette,
  varios: MoreHorizontal,
  analgesicos: Pill,
  lacteos: Milk,
};

const categoryColors: Record<string, string> = {
  kiosco: "bg-primary/5 text-primary group-hover:bg-primary/10",
  almacen: "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
  libreria: "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
  cigarros: "bg-gray-100 text-gray-600 group-hover:bg-gray-200",
  varios: "bg-purple-50 text-purple-600 group-hover:bg-purple-100",
  analgesicos: "bg-green-50 text-green-600 group-hover:bg-green-100",
  lacteos: "bg-sky-50 text-sky-600 group-hover:bg-sky-100",
};

function CategoriasDestacadasBlock({
  config,
  categorias,
  loading,
}: {
  config: Record<string, any>;
  categorias: Categoria[];
  loading: boolean;
}) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const maxItems = config.max_items || 6;
  const titulo = config.titulo_seccion || "Categorías";
  const cats = filtrarCategorias(categorias).slice(0, maxItems);

  return (
    <section className="py-8 md:py-10">
      <div className="max-w-7xl mx-auto px-4">
        <SectionTitle>{titulo}</SectionTitle>

        {loading ? (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {Array.from({ length: maxItems }).map((_, i) => (
              <SkeletonCategory key={i} />
            ))}
          </div>
        ) : cats.length > 0 ? (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 stagger-children">
            {cats.map((cat, idx) => {
              const key = cat.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const Icon = categoryIcons[key] || Package;
              const colorClasses = categoryColors[key] || "bg-gray-50 text-gray-600 group-hover:bg-gray-100";
              return (
                <Link
                  key={cat.id}
                  href={`/productos?categoria=${slugify(cat.nombre)}`}
                  className="group animate-scale-in cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 text-center hover:shadow-lg hover:border-primary/20 hover:-translate-y-1 transition-all duration-300 flex flex-col items-center gap-3"
                >
                  {cat.imagen_url ? (
                    <div className="w-14 h-14 rounded-xl overflow-hidden">
                      <Image
                        src={cat.imagen_url}
                        alt={cat.nombre}
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                        {...(idx < 3 ? { priority: true } : { loading: "lazy" })}
                      />
                    </div>
                  ) : (
                    <div className={"w-14 h-14 rounded-xl flex items-center justify-center transition-colors " + colorClasses}>
                      <Icon className="w-7 h-7" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{cat.nombre}</p>
                    <p className="text-[11px] text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      Ver productos →
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProductosDestacadosBlock({
  config,
  productos,
  presMap,
  loading,
  agregarAlCarrito,
  diasNuevo,
  masVendidos = [],
  nuevosIngresos = [],
  reingresos = [],
  ofertasPool = [],
  activeDiscounts = [],
}: {
  config: Record<string, any>;
  productos: Producto[];
  presMap: Record<string, any[]>;
  loading: boolean;
  agregarAlCarrito: (p: Producto, qty: number) => void;
  diasNuevo: number;
  masVendidos?: any[];
  nuevosIngresos?: any[];
  reingresos?: any[];
  ofertasPool?: any[];
  activeDiscounts?: any[];
}) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const titulo = config.titulo_seccion || "Productos";
  const maxItems = 24;

  const VALID_TABS = ["destacados", "ofertas", "mas_vendidos", "nuevos", "reingresos"] as const;
  type TabKeyValid = typeof VALID_TABS[number];
  const rawTabsConfig = (config.tabs as Array<{ key: string; activo: boolean }> | undefined);
  const defaultTabsConfig = [
    { key: "destacados", activo: true },
    { key: "nuevos", activo: true },
    { key: "reingresos", activo: true },
    { key: "ofertas", activo: true },
    { key: "mas_vendidos", activo: true },
  ];
  const tabsConfig = Array.isArray(rawTabsConfig) && rawTabsConfig.length > 0
    ? (() => {
        const filtered = rawTabsConfig.filter((t) => t && (VALID_TABS as readonly string[]).includes(t.key));
        // Asegurar que estén todos los tabs en la config (los faltantes se agregan activos).
        for (const k of VALID_TABS) {
          if (!filtered.some((t) => t.key === k)) filtered.push({ key: k, activo: true });
        }
        return filtered;
      })()
    : defaultTabsConfig;
  const activeTabsConfig = tabsConfig.filter((t) => t.activo);
  const rawTabDefecto = (config.tab_defecto as TabKeyValid) ?? "destacados";
  const tabDefecto = (activeTabsConfig.some((t) => t.key === rawTabDefecto)
    ? rawTabDefecto
    : (activeTabsConfig[0]?.key ?? "nuevos")) as TabKeyValid;
  const intervalo = (config.carrusel_intervalo as number) ?? 0;
  const [activeTab, setActiveTab] = useState<TabKeyValid>(tabDefecto);
  const [grupoActual, setGrupoActual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [animating, setAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);
  // Detectar viewport para que las flechas avancen de a 1 página visual
  // (mobile = 2 cards, desktop = 4 cards) en vez de tener que clickear 2 veces en desktop.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedPres, setSelectedPres] = useState<Record<string, number>>({});

  const getQty = (id: string) => quantities[id] ?? 1;
  const setQty = (id: string, val: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, val) }));

  const filterCats = (list: any[]) =>
    list.filter((p: any) => {
      if (!p.categorias) return true;
      return filtrarCategorias([p.categorias]).length > 0;
    }).slice(0, maxItems);

  // Selector de período para "Más vendidos" — el cliente puede cambiarlo en runtime.
  const [vendidosPeriodo, setVendidosPeriodo] = useState<7 | 30 | 90>(7);
  const [masVendidosLocal, setMasVendidosLocal] = useState<any[] | null>(null);
  const [vendidosLoading, setVendidosLoading] = useState(false);
  useEffect(() => {
    // Default 30 días == lo que vino del SSR. No refetcheamos.
    if (vendidosPeriodo === 30) { setMasVendidosLocal(null); return; }
    let cancelled = false;
    (async () => {
      setVendidosLoading(true);
      const desde = new Date();
      desde.setDate(desde.getDate() - vendidosPeriodo);
      const { data: items } = await supabase
        .from("venta_items")
        .select("producto_id, cantidad")
        .gte("created_at", desde.toISOString())
        .limit(2000);
      const ranking: Record<string, number> = {};
      for (const it of items || []) {
        if (it.producto_id) ranking[it.producto_id] = (ranking[it.producto_id] || 0) + Number(it.cantidad || 0);
      }
      const topIds = Object.entries(ranking).sort((a, b) => b[1] - a[1]).slice(0, 24).map((x) => x[0]);
      if (topIds.length === 0) { if (!cancelled) { setMasVendidosLocal([]); setVendidosLoading(false); } return; }
      const { data: prods } = await supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url, activo, stock, es_combo, precio_anterior, fecha_actualizacion, created_at, updated_at, categorias(id, nombre)")
        .eq("activo", true)
        .eq("visibilidad", "visible")
        .in("id", topIds);
      const ordered = topIds.map((id) => (prods || []).find((p: any) => p.id === id)).filter(Boolean);
      if (!cancelled) { setMasVendidosLocal(ordered); setVendidosLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [vendidosPeriodo]);

  // Helper compartido para calcular el mejor descuento aplicable a un producto.
  const computeBestDiscount = (prod: any, presLabel: string = "Unidad"): number => {
    let bestPct = 0;
    const isBox = presLabel !== "Unidad" && !presLabel.startsWith("Unidad");
    for (const d of activeDiscounts) {
      if (d.clientes_ids && d.clientes_ids.length > 0) continue;
      if (d.cantidad_minima && d.cantidad_minima > 0) continue;
      if (d.excluir_combos && prod.es_combo) continue;
      if (d.productos_excluidos_ids?.includes(prod.id)) continue;
      if (d.presentacion === "unidad" && isBox) continue;
      if (d.presentacion === "caja" && !isBox) continue;
      let aplica = false;
      if (d.aplica_a === "todos") aplica = true;
      else if (d.aplica_a === "productos") aplica = (d.productos_ids || []).includes(prod.id);
      else if (d.aplica_a === "categorias") aplica = (d.categorias_ids || []).includes(prod.categoria_id) || (!!prod.subcategoria_id && (d.categorias_ids || []).includes(prod.subcategoria_id));
      else if (d.aplica_a === "subcategorias") aplica = !!prod.subcategoria_id && (d.subcategorias_ids || []).includes(prod.subcategoria_id);
      else if (d.aplica_a === "marcas") aplica = !!prod.marca_id && (d.marcas_ids || []).includes(prod.marca_id);
      if (!aplica) continue;
      let pct = Number(d.porcentaje) || 0;
      if (d.tipo_descuento === "precio_fijo" && d.precio_fijo != null && Number(d.precio_fijo) > 0 && prod.precio > 0) {
        pct = Math.max(0, Math.min(100, ((prod.precio - Number(d.precio_fijo)) / prod.precio) * 100));
      }
      if (pct > bestPct) bestPct = pct;
    }
    return bestPct;
  };

  const vendidos = filterCats((masVendidosLocal ?? masVendidos));
  // Tab "Nuevos": SOLO productos genuinamente nuevos del catálogo (created_at en últimos 7 días).
  const nuevos = filterCats(nuevosIngresos);
  // Tab "De vuelta": SOLO reingresos (productos viejos que volvieron del 0).
  const reingresosFiltered = filterCats(reingresos);
  // Tab "Ofertas": pool del server (catálogo amplio) + cualquier destacado adicional. Filtra a los que tengan descuento aplicable.
  // Orden: destacados primero, luego por mayor % de descuento.
  const ofertasSource = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const p of [...ofertasPool, ...productos]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [ofertasPool, productos]);
  const ofertas = filterCats(ofertasSource)
    .map((p: any) => ({ ...p, _ofertaPct: computeBestDiscount(p) }))
    .filter((p: any) => p._ofertaPct > 0 && p.stock > 0)
    .sort((a: any, b: any) => {
      const aDest = a.destacado ? 1 : 0;
      const bDest = b.destacado ? 1 : 0;
      if (aDest !== bDest) return bDest - aDest;
      return b._ofertaPct - a._ofertaPct;
    })
    .slice(0, 24);

  const activeProds: any[] =
    activeTab === "destacados" ? filterCats(productos) :
    activeTab === "ofertas" ? ofertas :
    activeTab === "mas_vendidos" ? vendidos :
    activeTab === "reingresos" ? reingresosFiltered :
    nuevos;

  const GRUPO_SIZE_MOBILE = 2;
  const GRUPO_SIZE_DESKTOP = 4;
  const gruposMobile = Math.ceil(activeProds.length / GRUPO_SIZE_MOBILE);
  const grupos = gruposMobile;
  const grupoProds = activeProds.slice(grupoActual * GRUPO_SIZE_MOBILE, (grupoActual + 1) * GRUPO_SIZE_MOBILE);
  const grupoProdsDesktop = activeProds.slice(
    Math.floor(grupoActual / 2) * GRUPO_SIZE_DESKTOP,
    Math.floor(grupoActual / 2) * GRUPO_SIZE_DESKTOP + GRUPO_SIZE_DESKTOP
  );

  type TabKey = TabKeyValid;
  type TabEntry = { key: TabKey; label: string; icon: typeof Star; count: number };
  const allTabsMeta: Record<TabKey, { label: string; icon: typeof Star; count: number }> = {
    destacados: { label: "Destacados", icon: Star, count: filterCats(productos).length },
    ofertas: { label: "Ofertas", icon: Sparkles, count: ofertas.length },
    mas_vendidos: { label: "Más vendidos", icon: TrendingUp, count: vendidos.length },
    nuevos: { label: "Nuevos ingresos", icon: Zap, count: nuevos.length },
    reingresos: { label: "De vuelta en stock", icon: RotateCw, count: reingresosFiltered.length },
  };
  const tabs: TabEntry[] = activeTabsConfig.flatMap(({ key }) => {
    const meta = allTabsMeta[key as TabKey];
    if (!meta || meta.count <= 0) return [];
    return [{ key: key as TabKey, ...meta }];
  });

  // Resetear grupo al cambiar tab (sin animación cuando viene del selector)
  useEffect(() => {
    setGrupoActual(0);
    setSlideDir(null);
    setAnimating(false);
    // Reset scroll en mobile cuando cambia tab.
    if (mobileScrollRef.current) mobileScrollRef.current.scrollLeft = 0;
  }, [activeTab]);

  // Sincronizar scroll mobile cuando grupoActual cambia desde fuera (botones flecha, autoplay).
  useEffect(() => {
    const el = mobileScrollRef.current;
    if (!el || activeProds.length === 0) return;
    const cardWidth = el.scrollWidth / activeProds.length;
    const target = cardWidth * 2 * grupoActual;
    if (Math.abs(el.scrollLeft - target) > 4) {
      el.scrollTo({ left: target, behavior: "smooth" });
    }
  }, [grupoActual, activeProds.length]);

  // Step de avance: en mobile cada flecha avanza 2 cards (1 página mobile = 2 cards),
  // en desktop avanza 4 cards (1 página desktop = 4 cards). grupoActual se cuenta de a 2 cards
  // siempre, por eso desktop usa step=2 grupos.
  const stepGrupo = isDesktop ? 2 : 1;

  // Función para avanzar con animación
  const irAlSiguiente = () => {
    if (animating) return;
    const tabKeys = tabs.map((t) => t.key);
    const currentTabIndex = tabKeys.indexOf(activeTab);

    if (grupoActual + stepGrupo <= gruposMobile - 1) {
      setSlideDir("left");
      setAnimating(true);
      setTimeout(() => {
        setGrupoActual((g) => Math.min(gruposMobile - 1, g + stepGrupo));
        setAnimating(false);
      }, 220);
    } else if (currentTabIndex < tabKeys.length - 1) {
      setSlideDir("left");
      setAnimating(true);
      setTimeout(() => {
        setActiveTab(tabKeys[currentTabIndex + 1] as any);
        setAnimating(false);
      }, 220);
    } else {
      setSlideDir("left");
      setAnimating(true);
      setTimeout(() => {
        setActiveTab(tabKeys[0] as any);
        setAnimating(false);
      }, 220);
    }
  };

  const irAlAnterior = () => {
    if (animating) return;
    const tabKeys = tabs.map((t) => t.key);
    const currentTabIndex = tabKeys.indexOf(activeTab);

    if (grupoActual > 0) {
      setSlideDir("right");
      setAnimating(true);
      setTimeout(() => {
        setGrupoActual((g) => Math.max(0, g - stepGrupo));
        setAnimating(false);
      }, 220);
    } else if (currentTabIndex > 0) {
      setSlideDir("right");
      setAnimating(true);
      setTimeout(() => {
        setActiveTab(tabKeys[currentTabIndex - 1] as any);
        setAnimating(false);
      }, 220);
    }
  };

  // Rotación automática por grupos
  useEffect(() => {
    if (!intervalo || intervalo <= 0 || pausado) return;
    const timer = setInterval(() => {
      irAlSiguiente();
    }, intervalo * 1000);
    return () => clearInterval(timer);
  }, [intervalo, pausado, grupoActual, activeTab, tabs.length]);

  // Calcula el mejor descuento aplicable a un producto (excluye descuentos por cliente o cantidad mínima).
  const getBestDiscount = (prod: any, presLabel: string): { pct: number; precioFijo: number | null } => {
    let bestPct = 0;
    let bestPrecioFijo: number | null = null;
    const isBox = presLabel !== "Unidad" && !presLabel.startsWith("Unidad");
    for (const d of activeDiscounts) {
      if (d.clientes_ids && d.clientes_ids.length > 0) continue;
      if (d.cantidad_minima && d.cantidad_minima > 0) continue;
      if (d.excluir_combos && prod.es_combo) continue;
      if (d.productos_excluidos_ids?.includes(prod.id)) continue;
      if (d.presentacion === "unidad" && isBox) continue;
      if (d.presentacion === "caja" && !isBox) continue;
      let aplica = false;
      if (d.aplica_a === "todos") aplica = true;
      else if (d.aplica_a === "productos") aplica = (d.productos_ids || []).includes(prod.id);
      else if (d.aplica_a === "categorias") aplica = (d.categorias_ids || []).includes(prod.categoria_id) || (!!prod.subcategoria_id && (d.categorias_ids || []).includes(prod.subcategoria_id));
      else if (d.aplica_a === "subcategorias") aplica = !!prod.subcategoria_id && (d.subcategorias_ids || []).includes(prod.subcategoria_id);
      else if (d.aplica_a === "marcas") aplica = !!prod.marca_id && (d.marcas_ids || []).includes(prod.marca_id);
      if (!aplica) continue;
      let pct = Number(d.porcentaje) || 0;
      if (d.tipo_descuento === "precio_fijo" && d.precio_fijo != null && Number(d.precio_fijo) > 0 && prod.precio > 0) {
        pct = Math.max(0, Math.min(100, ((prod.precio - Number(d.precio_fijo)) / prod.precio) * 100));
      }
      if (pct > bestPct) {
        bestPct = pct;
        bestPrecioFijo = d.tipo_descuento === "precio_fijo" && d.precio_fijo != null ? Number(d.precio_fijo) : null;
      }
    }
    return { pct: bestPct, precioFijo: bestPrecioFijo };
  };

  const renderProductCard = (prod: any, isPriority = false) => {
    const qty = getQty(prod.id);
    const sinStock = prod.stock <= 0;
    const pres = presMap[prod.id];
    const presIdx = selectedPres[prod.id] ?? 0;
    const activePres = pres && pres.length > 1 ? pres[presIdx] : null;
    const presLabel = activePres?.nombre || "Unidad";
    const presPrice = activePres && activePres.precio > 0 ? activePres.precio : prod.precio;
    const presUnits = activePres ? activePres.cantidad : 1;
    // Aplicar descuento: precio_fijo es por unidad, si es presentación caja se multiplica por unidades.
    const desc = getBestDiscount(prod, presLabel);
    let price = presPrice;
    let priceOriginal = presPrice;
    if (desc.precioFijo != null) {
      price = activePres ? Math.round(desc.precioFijo * presUnits) : desc.precioFijo;
    } else if (desc.pct > 0) {
      price = Math.round(presPrice * (1 - desc.pct / 100));
    }
    const hasDescuento = price < priceOriginal;
    const maxQty = Math.floor(prod.stock / Math.max(0.01, presUnits));

    return (
      <div key={prod.id} className="card-product group relative overflow-hidden rounded-2xl border border-gray-100 bg-white flex flex-col">
        <Link href={`/productos/${productSlug(prod.nombre, prod.id)}`}>
          <div className="relative aspect-square bg-gray-50 overflow-hidden">
            {prod.imagen_url ? (
              <Image src={prod.imagen_url} alt={prod.nombre} fill sizes="(max-width: 640px) 50vw, 25vw" {...(isPriority ? { priority: true } : { loading: "lazy" })} className="card-product-img object-contain p-3 group-hover:scale-105 transition-transform duration-300" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-300" /></div>
            )}
            {sinStock && (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                <span className="bg-gray-800 text-white text-xs font-semibold px-3 py-1 rounded-full">Sin stock</span>
              </div>
            )}
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              {prod.es_combo && (
                <span className="bg-gradient-to-r from-primary to-rose-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">COMBO</span>
              )}
              {activeTab === "nuevos" && !sinStock && (
                <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">NUEVO</span>
              )}
              {activeTab === "reingresos" && !sinStock && (
                <span className="bg-cyan-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">RE INGRESO</span>
              )}
              {activeTab === "ofertas" && !sinStock && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                  🔥 -{Math.round(desc.pct)}% OFF
                </span>
              )}
              {activeTab === "mas_vendidos" && !sinStock && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                  <TrendingUp className="w-2.5 h-2.5" /> Top
                </span>
              )}
              {/* En tabs distintos a "ofertas", si igual el producto tiene descuento, mostrar el badge para no perder la promo. */}
              {activeTab !== "ofertas" && hasDescuento && !sinStock && (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">-{Math.round(desc.pct)}% OFF</span>
              )}
            </div>
          </div>
          <div className="p-3">
            {prod.categorias && (
              <span className="inline-block text-[10px] font-medium text-primary bg-primary/5 rounded-full px-2 py-0.5">{prod.categorias.nombre}</span>
            )}
            <p className="text-xs font-medium text-gray-800 line-clamp-2 mt-1 min-h-[2rem]">{prod.nombre}</p>
            {pres && pres.length > 1 && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {[...pres].sort((a: any, b: any) => a.cantidad - b.cantidad).map((pr: any, idx: number) => (
                  <button key={pr.id} onClick={(e) => { e.preventDefault(); setSelectedPres((p) => ({ ...p, [prod.id]: idx })); }}
                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium border transition ${presIdx === idx ? "bg-primary text-white border-primary" : "bg-white text-gray-500 border-gray-200"}`}
                  >{pr.nombre || (pr.cantidad === 1 ? "Unidad" : `x${pr.cantidad}`)}</button>
                ))}
              </div>
            )}
            <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
              <p className="text-base font-bold text-gray-900">{formatCurrency(price)}</p>
              {hasDescuento && (
                <p className="text-xs text-gray-400 line-through">{formatCurrency(priceOriginal)}</p>
              )}
            </div>
          </div>
        </Link>
        <div className="px-3 pb-3 mt-auto">
          {sinStock ? (
            <button disabled className="w-full bg-gray-100 text-gray-400 text-xs py-2 rounded-xl font-medium cursor-not-allowed">Sin stock</button>
          ) : maxQty > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => setQty(prod.id, qty - 1)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"><Minus className="w-2.5 h-2.5" /></button>
                  <span className="w-6 text-center text-xs font-medium tabular-nums">{qty}</span>
                  <button onClick={() => setQty(prod.id, Math.min(qty + 1, maxQty))} disabled={qty >= maxQty} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"><Plus className="w-2.5 h-2.5" /></button>
                </div>
                <span className="text-xs font-bold text-gray-900">{formatCurrency(price * qty)}</span>
              </div>
              <button onClick={() => { agregarAlCarrito(prod as Producto, qty); setQty(prod.id, 1); }}
                className="btn-add-cart w-full bg-gray-900 hover:bg-primary text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-200">
                <ShoppingCart className="w-3 h-3" /> Agregar
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-orange-500 font-medium py-1.5">Quedan {prod.stock}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <section
      className="py-8 md:py-10 bg-gray-50/50 overflow-x-clip"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <div className="max-w-7xl mx-auto px-4 overflow-x-clip">
        {/* Header — en mobile el título arriba y tabs abajo en scroll horizontal con todos los 4 tabs visibles. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-gray-900">{titulo}</h2>
          {!loading && tabs.length > 1 && (
            <div className="tabs-scroller -mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible" style={{ scrollbarWidth: "none" }}>
              <div className="relative inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
                {tabs.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSlideDir(tabs.findIndex(t => t.key === key) > tabs.findIndex(t => t.key === activeTab) ? "left" : "right");
                      setActiveTab(key);
                    }}
                    className={`relative shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      activeTab === key
                        ? "bg-gray-900 text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                    style={{ transition: "background-color 0.2s ease, color 0.2s ease" }}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">
                      {key === "mas_vendidos" ? "Top" : key === "nuevos" ? "Nuevos" : key === "reingresos" ? "De vuelta" : label.split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>
              <style jsx>{`
                .tabs-scroller::-webkit-scrollbar { display: none; }
              `}</style>
            </div>
          )}
        </div>
        <div className="w-12 h-0.5 bg-primary rounded-full mb-4" />

        {/* Selector de período — solo visible en tab "Más vendidos" */}
        {activeTab === "mas_vendidos" && (
          <div className="flex items-center justify-end gap-1 mb-3 text-xs">
            <span className="text-gray-500 mr-1">Período:</span>
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setVendidosPeriodo(d)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  vendidosPeriodo === d
                    ? "bg-amber-500 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-amber-300"
                }`}
              >
                {d === 7 ? "7 días" : d === 30 ? "30 días" : "90 días"}
              </button>
            ))}
            {vendidosLoading && <span className="text-gray-400 ml-2 animate-pulse">cargando…</span>}
          </div>
        )}

        {/* Grid: scroll horizontal 2x2 en mobile con peek / 1x4 en desktop */}
        {loading ? (
          <>
            {/* Mobile skeleton */}
            <div className="md:hidden -mx-4 px-4 grid grid-cols-2 gap-3" style={{ gridTemplateColumns: "repeat(2, calc(50% - 20px))", overflowX: "auto", scrollbarWidth: "none" }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex-shrink-0"><SkeletonCard /></div>
              ))}
            </div>
            {/* Desktop skeleton */}
            <div className="hidden md:grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </>
        ) : activeProds.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No hay productos disponibles en esta sección</div>
        ) : (
          <>
            {/* Mobile: scroll-snap nativo (2 cards por viewport con peek). overflow-x-clip en padre evita scroll horizontal a la página. */}
            <div className="md:hidden -mx-4 overflow-x-clip">
              <div
                ref={mobileScrollRef}
                className="mobile-snap-scroller flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 pb-1"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                onTouchStart={(e) => {
                  setPausado(true);
                  touchStartX.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                  // Auto-advance tab si el user intenta seguir swipeando al final del último grupo.
                  const el = mobileScrollRef.current;
                  if (el && touchStartX.current !== null) {
                    const dx = touchStartX.current - e.changedTouches[0].clientX;
                    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
                    const atStart = el.scrollLeft <= 4;
                    if (dx > 50 && atEnd) irAlSiguiente();
                    else if (dx < -50 && atStart) irAlAnterior();
                  }
                  touchStartX.current = null;
                  setTimeout(() => setPausado(false), 3000);
                }}
                onScroll={(e) => {
                  // Usar requestAnimationFrame + cachear scrollWidth (vía dataset) para evitar forced reflow.
                  const el = e.currentTarget;
                  if (activeProds.length === 0) return;
                  // scrollWidth lo leemos solo una vez por activeProds.length cambio (cacheado en dataset).
                  let cachedSW = parseFloat(el.dataset.cachedSw || "");
                  if (!cachedSW || el.dataset.cachedCount !== String(activeProds.length)) {
                    cachedSW = el.scrollWidth;
                    el.dataset.cachedSw = String(cachedSW);
                    el.dataset.cachedCount = String(activeProds.length);
                  }
                  const cardWidth = cachedSW / activeProds.length;
                  const scrollLeft = el.scrollLeft; // lectura única
                  const idx = Math.round(scrollLeft / (cardWidth * 2));
                  if (idx !== grupoActual) setGrupoActual(idx);
                }}
              >
                {activeProds.map((prod, idx) => (
                  <div key={prod.id} className="snap-start shrink-0" style={{ width: "calc((100vw - 2rem - 0.75rem) / 2)", maxWidth: "240px" }}>
                    {renderProductCard(prod, idx < 4)}
                  </div>
                ))}
              </div>
              <style jsx>{`
                .mobile-snap-scroller::-webkit-scrollbar { display: none; }
              `}</style>
            </div>

            {/* Desktop: grilla 1x4 normal */}
            <div className="hidden md:grid grid-cols-4 gap-3">
              {grupoProdsDesktop.map((prod, idx) => renderProductCard(prod, idx < 2))}
            </div>
          </>
        )}

        {/* Navegación entre grupos */}
        {!loading && grupos > 1 && (
          <div className="flex flex-col items-center gap-2 mt-4">
            <div className="flex items-center gap-3">
              <button
                onClick={irAlAnterior}
                disabled={grupoActual === 0 && tabs.findIndex(t => t.key === activeTab) === 0}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              <div className="flex gap-2">
                {Array.from({ length: grupos }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setGrupoActual(i);
                      // Sincronizar scroll mobile cuando se clickea un dot.
                      const el = mobileScrollRef.current;
                      if (el && activeProds.length > 0) {
                        const cardWidth = el.scrollWidth / activeProds.length;
                        el.scrollTo({ left: cardWidth * 2 * i, behavior: "smooth" });
                      }
                    }}
                    className={`transition-all rounded-full ${
                      i === grupoActual
                        ? "w-6 h-2.5 bg-primary"
                        : "w-2.5 h-2.5 bg-gray-200 hover:bg-gray-300"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={irAlSiguiente}
                disabled={false}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 md:hidden">
              {grupoActual + 1} de {gruposMobile} · deslizá para ver más
            </p>
          </div>
        )}

        {/* Ver todos */}
        {!loading && activeProds.length > 0 && (
          <div className="flex justify-end mt-3">
            <Link href={activeTab === "ofertas" ? "/ofertas" : "/productos"} className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              Ver todos <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function AumentosRecientesBlock({ productos: initialData = [], presMap = {} }: { productos?: any[]; presMap?: Record<string, any[]> }) {
  const { filtrarCategorias } = useCategoriasPermitidas();

  const filtered = initialData.filter((p: any) => {
    const cat = p.categorias;
    if (!cat) return true;
    return filtrarCategorias([cat]).length > 0;
  }).slice(0, 4);

  if (filtered.length === 0) return null;

  return (
    <section className="py-8 md:py-10 bg-orange-50/40 border-t border-orange-100">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-orange-500" />
              Aumentos Recientes
            </h2>
            <div className="w-16 h-1 bg-orange-400 rounded-full mt-2" />
          </div>
          <Link
            href="/aumentos-recientes"
            className="text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors"
          >
            Ver todos →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((prod) => {
            const pa = Number((prod as any).precio_anterior);
            const diff = prod.precio - pa;
            const pct = Math.round((diff / pa) * 100);
            return (
              <Link
                key={prod.id}
                href={`/productos/${productSlug(prod.nombre, prod.id)}`}
                className="group rounded-2xl border border-orange-100 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
              >
                <div className="relative aspect-square bg-gray-50 overflow-hidden">
                  {prod.imagen_url ? (
                    <Image
                      src={prod.imagen_url}
                      alt={prod.nombre}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                      loading="lazy"
                      className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-10 h-10 text-gray-200" />
                    </div>
                  )}
                  <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                    <TrendingUp className="w-2.5 h-2.5" /> +{pct}%
                  </span>
                </div>
                <div className="p-3 flex flex-col gap-1 flex-1">
                  {(prod as any).categorias?.nombre && (
                    <span className="text-[10px] text-orange-500 font-medium">{(prod as any).categorias.nombre}</span>
                  )}
                  <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{prod.nombre}</p>
                  <div className="mt-auto pt-2">
                    <p className="text-base font-bold text-gray-900">{formatCurrency(prod.precio)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-gray-400 line-through">{formatCurrency(pa)}</span>
                      <span className="text-[11px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">
                        ↑ {formatCurrency(diff)}
                      </span>
                    </div>
                    {(() => {
                      const pres = presMap[prod.id];
                      const caja = pres?.find((p: any) => p.cantidad > 1);
                      if (!caja) return null;
                      const cajaPrice = caja.precio_oferta && caja.precio_oferta > 0 ? caja.precio_oferta : caja.precio;
                      return (
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
                            {caja.nombre || `Caja x${caja.cantidad}`}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-700">{formatCurrency(cajaPrice)}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="text-center mt-6">
          <Link
            href="/aumentos-recientes"
            className="inline-block border-2 border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white rounded-full px-8 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95"
          >
            Ver todos los aumentos recientes
          </Link>
        </div>
      </div>
    </section>
  );
}

function MasVendidosBlock({ config, productos: initialData = [] }: { config: Record<string, any>; productos?: any[] }) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const limit = config.max_items || 8;
  const titulo = config.titulo || "Los Más Vendidos";

  const filtered = initialData.filter((p: any) => {
    const cat = p.categorias;
    if (!cat) return true;
    return filtrarCategorias([cat]).length > 0;
  }).slice(0, limit);

  if (filtered.length === 0) return null;

  return (
    <section className="py-8 md:py-10">
      <div className="max-w-7xl mx-auto px-4">
        <SectionTitle>{titulo}</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((prod) => (
            <Link
              key={prod.id}
              href={`/productos/${productSlug(prod.nombre, prod.id)}`}
              className="group rounded-2xl border border-gray-100 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
            >
              <div className="relative aspect-square bg-gray-50 overflow-hidden">
                {prod.imagen_url ? (
                  <Image
                    src={prod.imagen_url}
                    alt={prod.nombre}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                    loading="lazy"
                    className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-10 h-10 text-gray-200" />
                  </div>
                )}
              </div>
              <div className="p-3 flex flex-col gap-1 flex-1">
                {(prod as any).categorias?.nombre && (
                  <span className="text-[10px] text-primary/70 font-medium">{(prod as any).categorias.nombre}</span>
                )}
                <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{prod.nombre}</p>
                <p className="text-sm font-bold text-gray-900 mt-auto pt-1">{formatCurrency(prod.precio)}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link
            href="/productos"
            className="inline-block border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white rounded-full px-8 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95"
          >
            Ver todos los productos
          </Link>
        </div>
      </div>
    </section>
  );
}

function UltimasUnidadesBlock({ config, productos: initialData = [] }: { config: Record<string, any>; productos?: any[] }) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const limit = config.max_items || 8;
  const umbral = config.umbral_stock || 5;
  const titulo = config.titulo || "Últimas Unidades";

  const filtered = initialData
    .filter((p: any) => {
      const cat = p.categorias;
      if (!cat) return true;
      return filtrarCategorias([cat]).length > 0;
    })
    .filter((p: any) => p.stock > 0 && p.stock <= umbral)
    .slice(0, limit);

  if (filtered.length === 0) return null;

  return (
    <section className="py-8 md:py-10 bg-red-50/40 border-t border-red-100">
      <div className="max-w-7xl mx-auto px-4">
        <SectionTitle>{titulo}</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((prod) => (
            <Link
              key={prod.id}
              href={`/productos/${productSlug(prod.nombre, prod.id)}`}
              className="group rounded-2xl border border-red-100 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
            >
              <div className="relative aspect-square bg-gray-50 overflow-hidden">
                {prod.imagen_url ? (
                  <Image
                    src={prod.imagen_url}
                    alt={prod.nombre}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                    loading="lazy"
                    className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-10 h-10 text-gray-200" />
                  </div>
                )}
                <span className="absolute bottom-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  ¡Últimas {prod.stock}!
                </span>
              </div>
              <div className="p-3 flex flex-col gap-1 flex-1">
                {(prod as any).categorias?.nombre && (
                  <span className="text-[10px] text-red-500 font-medium">{(prod as any).categorias.nombre}</span>
                )}
                <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{prod.nombre}</p>
                <p className="text-sm font-bold text-gray-900 mt-auto pt-1">{formatCurrency(prod.precio)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function BannerPromoBlock({ config }: { config: Record<string, any> }) {
  const colorFondo = config.color_fondo || "hsl(var(--primary))";

  return (
    <section className="py-6">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className="text-white p-6 md:p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4"
          style={{ background: `linear-gradient(to right, ${colorFondo}, ${colorFondo}dd)` }}
        >
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Truck className="w-8 h-8" />
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold">
                {config.titulo || "Promoción Especial"}
              </p>
              {config.subtitulo && (
                <p className="text-white/90 mt-1">{config.subtitulo}</p>
              )}
            </div>
          </div>
          {config.boton_texto && (
            <Link
              href={config.link || "/productos"}
              className="bg-white text-primary rounded-full px-8 py-3.5 font-semibold shadow-lg hover:shadow-xl transition-shadow shrink-0"
            >
              {config.boton_texto}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function PorQueElegirnosBlock({ config }: { config: Record<string, any> }) {
  const cards: { icono: string; titulo: string; descripcion: string }[] =
    config.cards || [];

  if (cards.length === 0) return null;

  return (
    <section className="border-y border-gray-100 bg-gray-50/50 py-5">
      <div className="max-w-7xl mx-auto px-4">
        <div className={`grid grid-cols-1 md:grid-cols-${Math.min(cards.length, 4)} gap-3`}>
          {cards.map((item, i) => {
            const Icon = resolveIcon(item.icono);
            return (
              <div
                key={i}
                className="flex items-center gap-3 py-1"
              >
                <div className="w-10 h-10 rounded-full bg-primary/8 text-primary flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">
                    {item.titulo}
                  </p>
                  <p className="text-xs text-gray-500 leading-tight mt-0.5 line-clamp-1">
                    {item.descripcion}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { sanitizeHtml } from "@/lib/sanitize";

function TextoLibreBlock({ config }: { config: Record<string, any> }) {
  const contenido = config.contenido || "";
  if (!contenido) return null;

  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className="prose prose-primary max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(contenido) }}
        />
      </div>
    </section>
  );
}

function ImagenBannerBlock({ config }: { config: Record<string, any> }) {
  const url = config.url_imagen || "";
  if (!url) return null;

  const altoMap: Record<string, string> = {
    bajo: "h-32 md:h-48",
    mediano: "h-48 md:h-64",
    alto: "h-64 md:h-96",
  };
  const altoClass = altoMap[config.alto] || altoMap.mediano;

  const img = (
    <div className={`relative w-full ${altoClass} overflow-hidden`}>
      <Image
        src={url}
        alt={config.alt || ""}
        fill
        sizes="(max-width: 1024px) 100vw, 1200px"
        priority
        className="object-cover"
      />
    </div>
  );

  if (config.link) {
    return (
      <Link href={config.link} className="block">
        {img}
      </Link>
    );
  }

  return img;
}

/* ──────────────── main page ──────────────── */

interface HeroSlide {
  titulo?: string;
  subtitulo?: string;
  boton_texto?: string;
  boton_link?: string;
  boton_secundario_texto?: string;
  boton_secundario_link?: string;
  color_inicio?: string;
  color_fin?: string;
  tipo?: string;
  producto?: {
    id: string;
    nombre: string;
    imagen_url: string | null;
    precio: number;
    precio_anterior: number;
    descuento_pct: number;
    tiene_oferta: boolean;
  };
}

interface HomeClientProps {
  initialBloques?: Bloque[];
  initialCategorias?: Categoria[];
  initialProductos?: Producto[];
  initialPresMap?: Record<string, any[]>;
  initialDiasNuevo?: number;
  initialAumentos?: any[];
  initialMasVendidos?: any[];
  initialUltimasUnidades?: any[];
  initialTopVendidos?: any[];
  initialTopPresMap?: Record<string, any[]>;
  initialNuevosIngresos?: any[];
  initialReingresos?: any[];
  initialOfertas?: any[];
  initialActiveDiscounts?: any[];
  initialHeroSlides?: HeroSlide[];
}

export default function TiendaPage({
  initialBloques,
  initialCategorias,
  initialProductos,
  initialPresMap,
  initialDiasNuevo = 7,
  initialAumentos = [],
  initialMasVendidos = [],
  initialUltimasUnidades = [],
  initialTopVendidos = [],
  initialTopPresMap = {},
  initialNuevosIngresos = [],
  initialReingresos = [],
  initialOfertas = [],
  initialActiveDiscounts = [],
  initialHeroSlides = [],
}: HomeClientProps = {}) {
  const hasInitial = !!initialBloques;
  const [bloques, setBloques] = useState<Bloque[]>(initialBloques || []);
  const [categorias, setCategorias] = useState<Categoria[]>(initialCategorias || []);
  const [productos, setProductos] = useState<Producto[]>(initialProductos || []);
  const [presMap, setPresMap] = useState<Record<string, any[]>>({ ...(initialPresMap || {}), ...(initialTopPresMap || {}) });
  const [loading, setLoading] = useState(!hasInitial);
  const [diasNuevo, setDiasNuevo] = useState(initialDiasNuevo);
  const [clienteAuthId, setClienteAuthId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (stored) {
        const p = JSON.parse(stored);
        if (p?.id) setClienteAuthId(p.id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (hasInitial) return; // Skip client fetch — server provided initial data
    async function fetchData() {
      // 1. Fetch blocks and tienda_config in parallel
      const [bloquesRes, configRes] = await Promise.all([
        supabase
          .from("pagina_inicio_bloques")
          .select("*")
          .eq("activo", true)
          .order("orden", { ascending: true }),
        supabase
          .from("tienda_config")
          .select("dias_badge_nuevo")
          .limit(1)
          .single(),
      ]);

      const blocks: Bloque[] = bloquesRes.data || [];
      setBloques(blocks);

      if (configRes.data?.dias_badge_nuevo != null) {
        setDiasNuevo(configRes.data.dias_badge_nuevo);
      }

      // 2. Determine what data we need based on block types
      const tipos = blocks.map((b) => b.tipo);

      // Build parallel fetches for categories and products
      const promises: Promise<void>[] = [];

      // Fetch categories if needed
      if (tipos.includes("categorias_destacadas")) {
        const catBlock = blocks.find((b) => b.tipo === "categorias_destacadas");
        const maxCats = catBlock?.config?.max_items || 6;

        promises.push(
          (async () => {
            const { data: destacadas } = await supabase
              .from("categorias_destacadas")
              .select("id, categorias(id, nombre, imagen_url)");

            if (destacadas && destacadas.length > 0) {
              const seen = new Set<number>();
              const unique = destacadas
                .map((d: any) => d.categorias)
                .filter((cat: any) => {
                  if (!cat || seen.has(cat.id)) return false;
                  seen.add(cat.id);
                  return true;
                });
              setCategorias(unique.slice(0, maxCats));
            } else {
              const { data: cats } = await supabase
                .from("categorias")
                .select("id, nombre, imagen_url")
                .limit(maxCats);
              if (cats) setCategorias(cats);
            }
          })()
        );
      }

      // Fetch products + presentaciones if needed
      if (tipos.includes("productos_destacados")) {
        const prodBlock = blocks.find(
          (b) => b.tipo === "productos_destacados"
        );
        const maxItems = prodBlock?.config?.max_items || 8;
        const orden = prodBlock?.config?.orden || "recientes";

        promises.push(
          (async () => {
            // First try to fetch manually featured products
            const baseSelect = "id, nombre, precio, imagen_url, activo, stock, es_combo, precio_anterior, fecha_actualizacion, created_at, updated_at, categorias(id, nombre)";
            let prods: any[] | null = null;

            if (orden === "manual" || orden === "recientes") {
              // Try featured products first — orden manual de admin (orden_destacado).
              const { data: featured } = await supabase
                .from("productos")
                .select(baseSelect)
                .eq("activo", true)
                .eq("visibilidad", "visible")
                .eq("destacado", true)
                .order("orden_destacado", { ascending: true, nullsFirst: false })
                .order("nombre", { ascending: true })
                .limit(maxItems);

              if (featured && featured.length > 0) {
                prods = featured;
              }
            }

            // Fallback: if no featured products or non-manual mode, use configured order
            if (!prods) {
              let query = supabase
                .from("productos")
                .select(baseSelect)
                .eq("activo", true)
                .eq("visibilidad", "visible");

              if (orden === "precio_asc") {
                query = query.order("precio", { ascending: true });
              } else if (orden === "precio_desc") {
                query = query.order("precio", { ascending: false });
              } else {
                query = query.order("nombre", { ascending: true });
              }

              const { data } = await query.limit(maxItems);
              prods = data;
            }
            if (prods) {
              setProductos(prods as unknown as Producto[]);
              // Load presentations in parallel (no dependency on categories)
              const ids = prods.map((p: any) => p.id);
              if (ids.length > 0) {
                const { data: presData } = await supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, precio, precio_oferta, sku").in("producto_id", ids).order("cantidad");
                const map: Record<string, any[]> = {};
                (presData || []).forEach((p: any) => { if (!map[p.producto_id]) map[p.producto_id] = []; map[p.producto_id].push(p); });
                setPresMap(map);
              }
            }
          })()
        );
      }

      // Run categories and products fetches in parallel
      await Promise.all(promises);

      setLoading(false);
    }

    fetchData();
  }, []);

  function agregarAlCarrito(producto: Producto, qty: number = 1) {
    const stored = localStorage.getItem("carrito");
    let carrito: CarritoItem[];
    try { const _p = stored ? JSON.parse(stored) : []; carrito = Array.isArray(_p) ? _p : []; } catch { carrito = []; }

    const cartKey = `${producto.id}_Unidad`;
    // Also check for legacy cart items without _Unidad suffix
    const existing = carrito.find((item) => item.id === cartKey || item.id === producto.id);
    const currentInCart = existing ? existing.cantidad : 0;
    // Normalize legacy key to new format
    if (existing && existing.id === producto.id) existing.id = cartKey;
    if (currentInCart >= producto.stock) {
      showToast("Ya tenés el máximo disponible en el carrito", "error");
      return;
    }
    const canAdd = Math.min(qty, producto.stock - currentInCart);
    if (existing) {
      existing.cantidad += canAdd;
    } else {
      carrito.push({
        id: cartKey,
        nombre: producto.nombre,
        precio: producto.precio,
        imagen_url: producto.imagen_url,
        cantidad: canAdd,
        presentacion: "Unidad",
      });
    }

    localStorage.setItem("carrito", JSON.stringify(carrito));
    window.dispatchEvent(new Event("cart-updated"));
    if (canAdd < qty) {
      showToast(`Se agregaron ${canAdd} (máximo disponible)`, { type: "info", subtitle: producto.nombre });
    } else {
      showToast(producto.nombre, { subtitle: "Agregado al carrito" });
    }
  }

  /* ──── render blocks ──── */

  function renderBlock(bloque: Bloque) {
    const config = bloque.config || {};

    switch (bloque.tipo) {
      case "hero":
        if (initialHeroSlides.length >= 2) {
          return <HeroCarousel key={bloque.id} slides={initialHeroSlides} />;
        }
        if (initialHeroSlides.length === 1) {
          const s = initialHeroSlides[0] as any;
          if (s.tipo === "producto_destacado" && s.producto) {
            return <HeroProductoSlide key={bloque.id} slide={s} />;
          }
          return <HeroBlock key={bloque.id} config={{ ...config, ...s }} />;
        }
        return <HeroBlock key={bloque.id} config={config} />;
      case "trust_badges":
        return <TrustBadgesBlock key={bloque.id} config={config} />;
      case "categorias_destacadas":
        return (
          <CategoriasDestacadasBlock
            key={bloque.id}
            config={config}
            categorias={categorias}
            loading={loading}
          />
        );
      case "productos_destacados":
        return (
          <ProductosDestacadosBlock
            key={bloque.id}
            config={config}
            productos={productos}
            presMap={presMap}
            loading={loading}
            agregarAlCarrito={agregarAlCarrito}
            diasNuevo={diasNuevo}
            masVendidos={initialTopVendidos}
            nuevosIngresos={initialNuevosIngresos}
            reingresos={initialReingresos}
            ofertasPool={initialOfertas}
            activeDiscounts={initialActiveDiscounts}
          />
        );
      case "banner_promo":
        return <BannerPromoBlock key={bloque.id} config={config} />;
      case "por_que_elegirnos":
        return <PorQueElegirnosBlock key={bloque.id} config={config} />;
      case "texto_libre":
        return <TextoLibreBlock key={bloque.id} config={config} />;
      case "imagen_banner":
        return <ImagenBannerBlock key={bloque.id} config={config} />;
      case "mas_vendidos":
        return <MasVendidosBlock key={bloque.id} config={config} productos={initialMasVendidos} />;
      case "ultimas_unidades":
        return <UltimasUnidadesBlock key={bloque.id} config={config} productos={initialUltimasUnidades} />;
      default:
        return null;
    }
  }

  /* ──── loading state (show skeletons before blocks load) ──── */
  if (loading && bloques.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        {/* hero skeleton */}
        <div className="bg-gray-100 min-h-[120px] md:min-h-[140px] animate-pulse" />
        {/* badges skeleton */}
        <div className="border-y border-gray-100 py-4">
          <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-gray-100" />
                <div className="space-y-1.5">
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                  <div className="h-2.5 w-16 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* categories skeleton */}
        <div className="py-16 max-w-7xl mx-auto px-4">
          <div className="h-8 w-48 bg-gray-100 rounded mx-auto mb-10 animate-pulse" />
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCategory key={i} />
            ))}
          </div>
        </div>
        {/* products skeleton */}
        <div className="py-16 bg-gray-50/50 max-w-7xl mx-auto px-4">
          <div className="h-8 w-56 bg-gray-100 rounded mx-auto mb-10 animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Enforce optimal section order: hero, trust_badges, productos_destacados, aumentos, categorias, por_que_elegirnos, rest
  const sectionOrder = ["hero", "trust_badges", "productos_destacados"];
  const afterAumentos = ["categorias_destacadas", "por_que_elegirnos"];

  const orderedBloques: Bloque[] = [];
  const used = new Set<string>();

  // First: ordered sections
  for (const tipo of sectionOrder) {
    const b = bloques.find((bl) => bl.tipo === tipo);
    if (b) { orderedBloques.push(b); used.add(b.id); }
  }

  // After aumentos: specific sections
  const afterAumentosBloques: Bloque[] = [];
  for (const tipo of afterAumentos) {
    const b = bloques.find((bl) => bl.tipo === tipo);
    if (b) { afterAumentosBloques.push(b); used.add(b.id); }
  }

  // Remaining blocks (banner_promo, texto_libre, imagen_banner, etc.)
  const remaining = bloques.filter((b) => !used.has(b.id));

  return (
    <div className="min-h-screen bg-white">
      {orderedBloques.map((bloque) => renderBlock(bloque))}
      <InstallPrompt clienteId={clienteAuthId} />
      <AumentosRecientesBlock productos={initialAumentos} presMap={presMap} />
      {afterAumentosBloques.map((bloque) => renderBlock(bloque))}
      {remaining.map((bloque) => renderBlock(bloque))}
      <VistosRecientementeBlock />
    </div>
  );
}
