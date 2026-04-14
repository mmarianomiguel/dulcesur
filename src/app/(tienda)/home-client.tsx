"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { slugify, productSlug } from "@/lib/utils";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";
import InstallPrompt from "@/components/tienda/install-prompt";

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
      <div className="aspect-[4/3] bg-gray-100" />
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

function HeroBlock({ config }: { config: Record<string, any> }) {
  const colorInicio = config.color_inicio || "hsl(var(--primary))";
  const colorFin = config.color_fin || "hsl(var(--primary) / 0.7)";

  return (
    <section
      className="relative overflow-hidden min-h-[120px] md:min-h-[140px]"
      style={{
        background: `linear-gradient(135deg, ${colorInicio}, ${colorFin})`,
      }}
    >
      {/* subtle decorative elements */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/4 translate-x-1/4 hidden md:block" />
      <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-white/5 rounded-full translate-y-1/3 hidden md:block" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 w-full">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight animate-fade-in-up">
              {config.titulo || "Bienvenido a nuestra tienda"}
            </h1>
            {config.subtitulo && (
              <p className="text-sm md:text-base text-white/85 mt-2 max-w-lg animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
                {config.subtitulo}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 shrink-0 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            {config.boton_texto && (
              <Link
                href={config.boton_link || "/productos"}
                className="bg-white text-gray-900 rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
              >
                {config.boton_texto}
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
            {cats.map((cat) => {
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
                        loading="lazy"
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
}: {
  config: Record<string, any>;
  productos: Producto[];
  presMap: Record<string, any[]>;
  loading: boolean;
  agregarAlCarrito: (p: Producto, qty: number) => void;
  diasNuevo: number;
  masVendidos?: any[];
  nuevosIngresos?: any[];
}) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const titulo = config.titulo_seccion || "Productos";
  const maxItems = config.max_items || 8;

  const tabDefecto = (config.tab_defecto as "destacados" | "mas_vendidos" | "nuevos") ?? "destacados";
  const intervalo = (config.carrusel_intervalo as number) ?? 0;
  const [activeTab, setActiveTab] = useState<"destacados" | "mas_vendidos" | "nuevos">(tabDefecto);

  // Rotación automática entre tabs
  useEffect(() => {
    if (!intervalo || intervalo <= 0) return;
    const timer = setInterval(() => {
      setActiveTab((current) => {
        const activeTabs = tabs.map((t) => t.key);
        const currentIndex = activeTabs.indexOf(current);
        const nextIndex = (currentIndex + 1) % activeTabs.length;
        return activeTabs[nextIndex] as "destacados" | "mas_vendidos" | "nuevos";
      });
    }, intervalo * 1000);
    return () => clearInterval(timer);
  }, [intervalo, tabs.length]);
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

  const destacados = filterCats(productos);
  const vendidos = filterCats(masVendidos);
  const nuevos = filterCats(nuevosIngresos);

  const activeProds: any[] =
    activeTab === "destacados" ? destacados :
    activeTab === "mas_vendidos" ? vendidos :
    nuevos;

  const tabs = [
    { key: "destacados" as const, label: "Destacados", icon: Star, count: destacados.length },
    { key: "mas_vendidos" as const, label: "Más vendidos", icon: TrendingUp, count: vendidos.length },
    { key: "nuevos" as const, label: "Nuevos ingresos", icon: Zap, count: nuevos.length },
  ].filter((t) => t.count > 0);

  const renderProductCard = (prod: any, isPriority = false) => {
    const qty = getQty(prod.id);
    const sinStock = prod.stock <= 0;
    const pres = presMap[prod.id];
    const presIdx = selectedPres[prod.id] ?? 0;
    const activePres = pres && pres.length > 1 ? pres[presIdx] : null;
    const price = activePres && activePres.precio > 0 ? activePres.precio : prod.precio;
    const presUnits = activePres ? activePres.cantidad : 1;
    const maxQty = Math.floor(prod.stock / Math.max(0.01, presUnits));

    return (
      <div key={prod.id} className="card-product animate-fade-in-up group relative overflow-hidden rounded-2xl border border-gray-100 bg-white flex flex-col">
        <Link href={`/productos/${productSlug(prod.nombre, prod.id)}`}>
          <div className="relative aspect-square bg-gray-50 overflow-hidden">
            {prod.imagen_url ? (
              <Image src={prod.imagen_url} alt={prod.nombre} fill sizes="(max-width: 640px) 256px, (max-width: 1024px) 25vw, 20vw" {...(isPriority ? { priority: true } : { loading: "lazy" })} className="card-product-img object-contain p-4" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Package className="w-12 h-12 text-gray-300" /></div>
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
                <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Nuevo</span>
              )}
              {activeTab === "mas_vendidos" && !sinStock && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                  <TrendingUp className="w-2.5 h-2.5" /> Top
                </span>
              )}
            </div>
          </div>
          <div className="p-4">
            {prod.categorias && (
              <span className="inline-block text-[11px] font-medium text-primary bg-primary/5 rounded-full px-2.5 py-0.5">{prod.categorias.nombre}</span>
            )}
            <p className="text-sm font-medium text-gray-800 line-clamp-2 mt-1.5 min-h-[2.5rem]">{prod.nombre}</p>
            {pres && pres.length > 1 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {[...pres].sort((a: any, b: any) => a.cantidad - b.cantidad).map((pr: any, idx: number) => (
                  <button key={pr.id} onClick={(e) => { e.preventDefault(); setSelectedPres((p) => ({ ...p, [prod.id]: idx })); }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition ${presIdx === idx ? "bg-primary text-white border-primary" : "bg-white text-gray-500 border-gray-200"}`}
                  >{pr.nombre || (pr.cantidad === 1 ? "Unidad" : `Caja x${pr.cantidad}`)}</button>
                ))}
              </div>
            )}
            <p className="text-xl font-bold text-gray-900 mt-2">{formatCurrency(price)}</p>
          </div>
        </Link>
        <div className="px-4 pb-4 mt-auto">
          {sinStock ? (
            <button disabled className="w-full bg-gray-100 text-gray-400 text-sm py-2.5 rounded-xl font-medium cursor-not-allowed">Sin stock</button>
          ) : maxQty > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <button onClick={() => setQty(prod.id, qty - 1)} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"><Minus className="w-3 h-3" /></button>
                  <span className="w-7 text-center text-sm font-medium tabular-nums">{qty}</span>
                  <button onClick={() => setQty(prod.id, Math.min(qty + 1, maxQty))} disabled={qty >= maxQty} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                </div>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(price * qty)}</span>
              </div>
              <button onClick={() => { agregarAlCarrito(prod as Producto, qty); setQty(prod.id, 1); }}
                className="btn-add-cart w-full bg-gray-900 hover:bg-primary text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors duration-200">
                <ShoppingCart className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-orange-500 font-medium py-2">Quedan {prod.stock}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="py-8 md:py-10 bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">{titulo}</h2>
          {!loading && tabs.length > 1 && (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 self-start sm:self-auto">
              {tabs.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === key ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{label.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-12 h-0.5 bg-primary rounded-full mb-6 -mt-3" />

        {loading ? (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-44">
                <SkeletonCard />
              </div>
            ))}
          </div>
        ) : activeProds.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No hay productos disponibles en esta sección</div>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {activeProds.slice(0, 16).map((prod, idx) => (
              <div key={prod.id} className="flex-shrink-0 w-44">
                {renderProductCard(prod, idx < 2)}
              </div>
            ))}
          </div>
        )}

        {!loading && activeProds.length > 0 && (
          <div className="flex justify-end mt-3">
            <Link href="/productos" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              Ver todos <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function AumentosRecientesBlock({ productos: initialData = [] }: { productos?: any[] }) {
  const { filtrarCategorias } = useCategoriasPermitidas();

  const filtered = initialData.filter((p: any) => {
    const cat = p.categorias;
    if (!cat) return true;
    return filtrarCategorias([cat]).length > 0;
  }).slice(0, 8);

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
                      sizes="(max-width: 640px) 256px, (max-width: 1024px) 25vw, 20vw"
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
                    sizes="(max-width: 640px) 256px, (max-width: 1024px) 25vw, 20vw"
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
                    sizes="(max-width: 640px) 256px, (max-width: 1024px) 25vw, 20vw"
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
        sizes="100vw"
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
              // Try featured products first
              const { data: featured } = await supabase
                .from("productos")
                .select(baseSelect)
                .eq("activo", true)
                .eq("visibilidad", "visible")
                .eq("destacado", true)
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
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
      <AumentosRecientesBlock productos={initialAumentos} />
      {afterAumentosBloques.map((bloque) => renderBlock(bloque))}
      {remaining.map((bloque) => renderBlock(bloque))}
    </div>
  );
}
