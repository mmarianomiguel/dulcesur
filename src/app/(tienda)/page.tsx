"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { showToast } from "@/components/tienda/toast";
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ──────────────── types ──────────────── */

interface Categoria {
  id: string;
  nombre: string;
}

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  activo: boolean;
  stock: number;
  categorias?: Categoria | null;
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

const formatPrice = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

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
    <div className="text-center mb-10">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
        {children}
      </h2>
      <div className="w-16 h-1 bg-pink-600 rounded-full mx-auto mt-2" />
    </div>
  );
}

/* ──────────────── block renderers ──────────────── */

function HeroBlock({ config }: { config: Record<string, any> }) {
  const colorInicio = config.color_inicio || "#be185d";
  const colorFin = config.color_fin || "#ec4899";

  return (
    <section
      className="relative overflow-hidden min-h-[420px] flex items-center"
      style={{
        background: `linear-gradient(to right, ${colorInicio}, ${colorFin})`,
      }}
    >
      {/* decorative circles */}
      <div className="absolute top-10 right-10 w-64 h-64 bg-white/10 rounded-full hidden md:block" />
      <div className="absolute top-40 right-56 w-40 h-40 bg-white/10 rounded-full hidden md:block" />
      <div className="absolute -bottom-10 right-20 w-32 h-32 bg-white/10 rounded-full hidden md:block" />
      <div className="absolute top-20 right-96 w-20 h-20 bg-white/10 rounded-full hidden md:block" />
      <div className="absolute bottom-16 right-72 w-12 h-12 bg-white/10 rounded-full hidden md:block" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-5">
            {config.titulo || "Bienvenido a nuestra tienda"}
          </h1>
          {config.subtitulo && (
            <p className="text-lg text-white/90 mb-8 max-w-lg">
              {config.subtitulo}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            {config.boton_texto && (
              <Link
                href={config.boton_link || "/productos"}
                className="bg-white text-pink-600 rounded-full px-8 py-3.5 font-semibold shadow-lg hover:shadow-xl transition-shadow"
              >
                {config.boton_texto}
              </Link>
            )}
            {config.boton_secundario_texto && (
              <Link
                href={config.boton_secundario_link || "/productos"}
                className="border-2 border-white text-white rounded-full px-8 py-3 font-semibold hover:bg-white/10 transition-colors"
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
    <section className="bg-white border-y border-gray-100 py-4">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {items.map((b, i) => {
            const Icon = resolveIcon(b.icono);
            return (
              <div key={i} className="flex items-center gap-2 md:gap-3 py-2">
                <div className="w-9 h-9 md:w-12 md:h-12 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
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

function CategoriasDestacadasBlock({
  config,
  categorias,
  loading,
}: {
  config: Record<string, any>;
  categorias: Categoria[];
  loading: boolean;
}) {
  const maxItems = config.max_items || 6;
  const titulo = config.titulo_seccion || "Categorías";
  const cats = categorias.slice(0, maxItems);

  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4">
        <SectionTitle>{titulo}</SectionTitle>

        {loading ? (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {Array.from({ length: maxItems }).map((_, i) => (
              <SkeletonCategory key={i} />
            ))}
          </div>
        ) : cats.length > 0 ? (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {cats.map((cat) => (
              <Link
                key={cat.id}
                href={`/productos?categoria=${cat.id}`}
                className="group cursor-pointer rounded-2xl border border-gray-100 bg-white p-6 text-center hover:shadow-lg hover:border-pink-200 transition-all duration-300"
              >
                <p className="font-semibold text-gray-800">{cat.nombre}</p>
                <p className="text-xs text-pink-600 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  Ver productos →
                </p>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProductosDestacadosBlock({
  config,
  productos,
  loading,
  agregarAlCarrito,
}: {
  config: Record<string, any>;
  productos: Producto[];
  loading: boolean;
  agregarAlCarrito: (p: Producto, qty: number) => void;
}) {
  const titulo = config.titulo_seccion || "Productos Destacados";
  const maxItems = config.max_items || 8;
  const prods = productos.slice(0, maxItems);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const getQty = (id: string) => quantities[id] ?? 1;
  const setQty = (id: string, val: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, val) }));

  return (
    <section className="py-16 bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4">
        <SectionTitle>{titulo}</SectionTitle>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {Array.from({ length: maxItems }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {prods.map((prod) => {
              const qty = getQty(prod.id);
              const sinStock = prod.stock <= 0;
              return (
                <div
                  key={prod.id}
                  className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-xl hover:border-gray-200 flex flex-col"
                >
                  <Link href={`/productos/${prod.id}`}>
                    {/* image */}
                    <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
                      {prod.imagen_url ? (
                        <Image
                          src={prod.imagen_url}
                          alt={prod.nombre}
                          fill
                          className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-12 h-12 text-gray-300" />
                        </div>
                      )}
                      {sinStock && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                          <span className="bg-gray-800 text-white text-xs font-semibold px-3 py-1 rounded-full">
                            Sin stock
                          </span>
                        </div>
                      )}
                    </div>

                    {/* content */}
                    <div className="p-4">
                      {prod.categorias && (
                        <span className="inline-block text-[11px] font-medium text-pink-600 bg-pink-50 rounded-full px-2.5 py-0.5">
                          {prod.categorias.nombre}
                        </span>
                      )}
                      <p className="text-sm font-medium text-gray-800 line-clamp-2 mt-1.5 min-h-[2.5rem]">
                        {prod.nombre}
                      </p>
                      <p className="text-xl font-bold text-gray-900 mt-2">
                        {formatPrice(prod.precio)}
                      </p>
                    </div>
                  </Link>

                  {/* add to cart */}
                  <div className="px-4 pb-4 mt-auto">
                    {sinStock ? (
                      <button
                        disabled
                        className="w-full bg-gray-100 text-gray-400 text-sm py-2.5 rounded-xl font-medium cursor-not-allowed"
                      >
                        Sin stock
                      </button>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                            <button
                              onClick={() => setQty(prod.id, qty - 1)}
                              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center text-sm font-medium tabular-nums">
                              {qty}
                            </span>
                            <button
                              onClick={() => setQty(prod.id, Math.min(qty + 1, prod.stock))}
                              disabled={qty >= prod.stock}
                              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-sm font-bold text-gray-900">{formatPrice(prod.precio * qty)}</span>
                        </div>
                        <button
                          onClick={() => { agregarAlCarrito(prod, qty); setQty(prod.id, 1); }}
                          className="w-full bg-pink-600 hover:bg-pink-700 text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          Agregar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* view all link */}
        {!loading && prods.length > 0 && (
          <div className="text-center mt-10">
            <Link
              href="/productos"
              className="inline-block border-2 border-pink-600 text-pink-600 hover:bg-pink-600 hover:text-white rounded-full px-8 py-3 font-semibold transition-all"
            >
              Ver todos los productos
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function BannerPromoBlock({ config }: { config: Record<string, any> }) {
  const colorFondo = config.color_fondo || "#db2777";

  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className="text-white p-8 md:p-12 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6"
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
              className="bg-white text-pink-600 rounded-full px-8 py-3.5 font-semibold shadow-lg hover:shadow-xl transition-shadow shrink-0"
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
  const titulo = config.titulo_seccion || "¿Por qué elegirnos?";
  const cards: { icono: string; titulo: string; descripcion: string }[] =
    config.cards || [];

  if (cards.length === 0) return null;

  return (
    <section className="bg-gray-50 py-10 md:py-16">
      <div className="max-w-7xl mx-auto px-4">
        <SectionTitle>{titulo}</SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
          {cards.map((item, i) => {
            const Icon = resolveIcon(item.icono);
            return (
              <div
                key={i}
                className="bg-white rounded-2xl p-5 md:p-8 flex md:flex-col items-center md:text-center gap-4 md:gap-0 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center shrink-0 md:mx-auto md:mb-5">
                  <Icon className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold text-gray-900 md:mb-2">
                    {item.titulo}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
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
          className="prose prose-pink max-w-none"
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

export default function TiendaPage() {
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      // 1. Fetch blocks
      const { data: bloquesData } = await supabase
        .from("pagina_inicio_bloques")
        .select("*")
        .eq("activo", true)
        .order("orden", { ascending: true });

      const blocks: Bloque[] = bloquesData || [];
      setBloques(blocks);

      // 2. Determine what data we need based on block types
      const tipos = blocks.map((b) => b.tipo);

      // Fetch categories if needed
      if (tipos.includes("categorias_destacadas")) {
        const catBlock = blocks.find((b) => b.tipo === "categorias_destacadas");
        const maxCats = catBlock?.config?.max_items || 6;

        const { data: destacadas } = await supabase
          .from("categorias_destacadas")
          .select("*, categorias(*)");

        if (destacadas && destacadas.length > 0) {
          setCategorias(
            destacadas
              .map((d: any) => d.categorias)
              .filter(Boolean)
              .slice(0, maxCats)
          );
        } else {
          const { data: cats } = await supabase
            .from("categorias")
            .select("*")
            .limit(maxCats);
          if (cats) setCategorias(cats);
        }
      }

      // Fetch products if needed
      if (tipos.includes("productos_destacados")) {
        const prodBlock = blocks.find(
          (b) => b.tipo === "productos_destacados"
        );
        const maxItems = prodBlock?.config?.max_items || 8;
        const orden = prodBlock?.config?.orden || "recientes";

        let query = supabase
          .from("productos")
          .select("*, categorias(*)")
          .eq("activo", true);

        if (orden === "precio_asc") {
          query = query.order("precio", { ascending: true });
        } else if (orden === "precio_desc") {
          query = query.order("precio", { ascending: false });
        } else {
          query = query.order("created_at", { ascending: false });
        }

        const { data: prods } = await query.limit(maxItems);
        if (prods) setProductos(prods);
      }

      setLoading(false);
    }

    fetchData();
  }, []);

  function agregarAlCarrito(producto: Producto, qty: number = 1) {
    const stored = localStorage.getItem("carrito");
    let carrito: CarritoItem[];
    try { carrito = stored ? JSON.parse(stored) : []; } catch { carrito = []; }

    const cartKey = `${producto.id}_Unidad`;
    const existing = carrito.find((item) => item.id === cartKey);
    if (existing) {
      existing.cantidad += qty;
    } else {
      carrito.push({
        id: cartKey,
        nombre: producto.nombre,
        precio: producto.precio,
        imagen_url: producto.imagen_url,
        cantidad: qty,
        presentacion: "Unidad",
      });
    }

    localStorage.setItem("carrito", JSON.stringify(carrito));
    window.dispatchEvent(new Event("cart-updated"));
    showToast(producto.nombre, { subtitle: "Agregado al carrito" });
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
            loading={loading}
            agregarAlCarrito={agregarAlCarrito}
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
      default:
        return null;
    }
  }

  /* ──── loading state (show skeletons before blocks load) ──── */
  if (loading && bloques.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        {/* hero skeleton */}
        <div className="bg-gray-100 min-h-[420px] animate-pulse" />
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

  return (
    <div className="min-h-screen bg-white">
      {bloques.map((bloque) => renderBlock(bloque))}
    </div>
  );
}
