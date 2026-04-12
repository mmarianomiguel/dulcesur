"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  User,
  ShoppingCart,
  Menu,
  X,
  Truck,
  Phone,
  ChevronDown,
  ChevronRight,
  Package,
  TrendingDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { slugify, productSlug } from "@/lib/utils";
import { useCart } from "./cart-drawer";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";
import { useCarritoSync } from "@/hooks/use-carrito-sync";
import NotificationBell from "./notification-bell";

interface Categoria {
  id: string;
  nombre: string;
}

const FALLBACK_LOGO = "https://res.cloudinary.com/dss3lnovd/image/upload/w_200,q_auto,f_auto/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png";

export default function TiendaNavbar() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileQuery, setMobileQuery] = useState("");
  const { openCart, itemCount, subtotal } = useCart();
  useCarritoSync();
  const router = useRouter();
  const { filtrarCategorias } = useCategoriasPermitidas();
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [subcatsMap, setSubcatsMap] = useState<Record<string, { id: string; nombre: string }[]>>({});
  const [marcasMap, setMarcasMap] = useState<Record<string, { id: string; nombre: string }[]>>({});
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: string; nombre: string; precio: number; imagen_url: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [logoSrc, setLogoSrc] = useState<string>(FALLBACK_LOGO);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [mobilLogoSrc, setMobilLogoSrc] = useState<string>(FALLBACK_LOGO);

  const [config, setConfig] = useState<{
    logo_url?: string; nombre?: string; telefono?: string;
    umbral_envio_gratis?: number; horario_atencion_inicio?: string;
    horario_atencion_fin?: string; dias_atencion?: string[];
  } | null>(null);

  useEffect(() => {
    const readCliente = () => {
      try {
        const stored = localStorage.getItem("cliente_auth");
        if (stored) { const p = JSON.parse(stored); if (p?.id) { setClienteId(p.id); return; } }
      } catch {}
      setClienteId(null);
    };
    readCliente();
    // Re-check on storage changes (login/logout from other tabs) and on focus (same tab navigation)
    window.addEventListener("storage", readCliente);
    window.addEventListener("focus", readCliente);
    return () => {
      window.removeEventListener("storage", readCliente);
      window.removeEventListener("focus", readCliente);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("categorias").select("id, nombre, restringida").limit(12),
      supabase.from("empresa").select("nombre, telefono, white_label").limit(1).single(),
      supabase.from("tienda_config").select("logo_url, umbral_envio_gratis, horario_atencion_inicio, horario_atencion_fin, dias_atencion").limit(1).single(),
    ]).then(([{ data: cats }, { data: emp }, { data: tc }]) => {
      if (cats) setCategorias(cats);
      if (emp || tc) setConfig({ ...emp, ...tc, logo_url: tc?.logo_url } as any);
      // Use tienda_config logo, fall back to white-label logo
      const wlLogo = (emp as any)?.white_label?.logo_url;
      const logoUrl = tc?.logo_url || wlLogo;
      if (logoUrl) {
        setLogoSrc(logoUrl);
        setMobilLogoSrc(logoUrl);
      }
    });
  }, []);

  // Cargar subcategorías y marcas para el mega-menú
  useEffect(() => {
    (async () => {
      const { data: subs } = await supabase
        .from("subcategorias")
        .select("id, nombre, categoria_id");

      const subsMap: Record<string, { id: string; nombre: string }[]> = {};
      (subs || []).forEach((s: any) => {
        if (!subsMap[s.categoria_id]) subsMap[s.categoria_id] = [];
        subsMap[s.categoria_id].push({ id: s.id, nombre: s.nombre });
      });
      setSubcatsMap(subsMap);

      const { data: prodMarcas } = await supabase
        .from("productos")
        .select("categoria_id, marca_id, marcas(id, nombre)")
        .eq("activo", true)
        .eq("visibilidad", "visible")
        .limit(500)
        .not("marca_id", "is", null);

      const mMap: Record<string, Map<string, string>> = {};
      (prodMarcas || []).forEach((p: any) => {
        if (!p.categoria_id || !p.marcas) return;
        if (!mMap[p.categoria_id]) mMap[p.categoria_id] = new Map();
        mMap[p.categoria_id].set(p.marcas.id, p.marcas.nombre);
      });
      const mResult: Record<string, { id: string; nombre: string }[]> = {};
      for (const [catId, map] of Object.entries(mMap)) {
        mResult[catId] = Array.from(map.entries())
          .slice(0, 8)
          .map(([id, nombre]) => ({ id, nombre }));
      }
      setMarcasMap(mResult);
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Search suggestions
  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const q = val.trim();
      if (q.length < 2) return;
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url")
        .eq("activo", true)
        .eq("visibilidad", "visible")
        .ilike("nombre", `%${q}%`)
        .gt("stock", 0)
        .limit(6);
      setSuggestions(data || []);
      setShowSuggestions(true);
    }, 400);
  };

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/productos?q=${encodeURIComponent(q)}`);
      setQuery("");
    }
  };

  const handleMobileSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = mobileQuery.trim();
    if (q) {
      router.push(`/productos?q=${encodeURIComponent(q)}`);
      setMobileQuery("");
      setMobileOpen(false);
    }
  };

  const handleCatEnter = (catId: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHoveredCat(catId);
  };

  const handleCatLeave = () => {
    closeTimer.current = setTimeout(() => setHoveredCat(null), 250);
  };

  const handleMenuEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const handleMenuLeave = () => {
    closeTimer.current = setTimeout(() => setHoveredCat(null), 250);
  };

  return (
    <>
      {/* ── Accent line ── */}
      <div className="h-0.5 bg-gradient-to-r from-primary via-rose-400 to-primary" />

      {/* ── Top bar ── */}
      <div className="bg-gray-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-center md:justify-between px-4 py-1.5 text-[10px] md:text-xs">
          <span className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            {config?.umbral_envio_gratis && config.umbral_envio_gratis > 0 ? `Envío gratis en compras +$${new Intl.NumberFormat("es-AR").format(config.umbral_envio_gratis)}` : "Envío sin cargo"}
          </span>
          <span className="hidden md:inline text-gray-400">
            Atención: {config?.dias_atencion ? `${config.dias_atencion[0]} a ${config.dias_atencion[config.dias_atencion.length - 1]}` : "Lunes a Sábados"} de {config?.horario_atencion_inicio?.slice(0, 5)?.replace(/^0/, "") || "8"} a {config?.horario_atencion_fin?.slice(0, 5)?.replace(/^0/, "") || "14"}hs
          </span>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/cuenta" className="hover:text-primary transition">
              Mi cuenta
            </Link>
            <Link href="/historial" className="hover:text-primary transition">
              Mis pedidos
            </Link>
            <Link href="/ofertas" className="hover:text-primary transition">
              Ofertas
            </Link>
            {config?.telefono && (
              <a href={`tel:${config.telefono.replace(/[^+\d]/g, "")}`} className="flex items-center gap-1 hover:text-primary transition" suppressHydrationWarning>
                <Phone className="h-3 w-3" />
                <span suppressHydrationWarning>{config.telefono}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Main navbar ── */}
      <header className="sticky top-0 z-50 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <img
              src={logoSrc}
              alt={config?.nombre || "Tienda"}
              className="h-10 w-auto"
              width={120}
              height={40}
              fetchPriority="high"
              onError={() => {
                if (logoSrc !== FALLBACK_LOGO) setLogoSrc(FALLBACK_LOGO);
              }}
            />
          </Link>

          {/* Search bar (desktop) */}
          <form
            onSubmit={(e) => { handleSearch(e); setShowSuggestions(false); }}
            className="mx-4 hidden flex-1 lg:flex"
          >
            <div ref={searchRef} className="relative flex w-full max-w-2xl items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="¿Qué estás buscando?"
                aria-label="Buscar productos"
                className="h-10 w-full rounded-full border border-gray-300 pl-4 pr-12 text-sm text-gray-700 placeholder-gray-400 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-r-full bg-gray-900 text-white transition hover:bg-primary"
                aria-label="Buscar"
              >
                <Search className="h-4 w-4" />
              </button>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50">
                  {suggestions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/productos/${productSlug(s.nombre, s.id)}`}
                      onClick={() => { setShowSuggestions(false); setQuery(""); }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition"
                    >
                      {s.imagen_url ? (
                        <img src={s.imagen_url} alt="" className="w-8 h-8 object-contain rounded" />
                      ) : (
                        <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                          <Search className="w-3 h-3 text-gray-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{s.nombre}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 shrink-0">
                        {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(s.precio)}
                      </span>
                    </Link>
                  ))}
                  <button
                    type="submit"
                    className="w-full px-4 py-2 text-xs text-primary font-medium hover:bg-primary/5 transition border-t border-gray-100"
                  >
                    Ver todos los resultados →
                  </button>
                </div>
              )}
            </div>
          </form>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-1 lg:gap-3">
            {/* Account (desktop) */}
            <Link
              href="/cuenta"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-primary lg:flex"
            >
              <User className="h-5 w-5" />
              Mi cuenta
            </Link>
            <Link
              href="/historial"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-primary lg:flex"
            >
              <Package className="h-5 w-5" />
              Mis pedidos
            </Link>
            <Link
              href="/ofertas"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-primary lg:flex"
            >
              <TrendingDown className="h-5 w-5" />
              Ofertas
            </Link>

            {/* Notifications */}
            {clienteId && <NotificationBell clienteId={clienteId} />}

            {/* Cart */}
            <button
              onClick={openCart}
              className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 hover:text-primary"
              aria-label="Carrito"
            >
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 && (
                <span key={itemCount} suppressHydrationWarning className="absolute -right-0.5 -top-0.5 flex h-5 w-5 animate-bounce items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shadow-sm [animation-duration:0.6s] [animation-iteration-count:2]">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
              <span className="hidden text-sm font-medium lg:inline">
                Carrito
              </span>
              {subtotal > 0 && (
                <span suppressHydrationWarning className="text-[10px] lg:text-xs font-semibold text-primary ml-0.5">
                  {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(subtotal)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Category bar con mega-menú (desktop) ── */}
        <nav aria-label="Categorías" className="hidden border-b border-gray-100 lg:block relative z-40">
          <div className="mx-auto flex max-w-7xl items-center px-4">
            {filtrarCategorias(categorias).map((cat) => {
              const isHovered = hoveredCat === cat.id;
              return (
                <div
                  key={cat.id}
                  onMouseEnter={() => handleCatEnter(cat.id)}
                  onMouseLeave={handleCatLeave}
                  className="relative"
                >
                  <Link
                    href={`/productos?categoria=${slugify(cat.nombre)}`}
                    className={`flex items-center gap-1 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap ${
                      isHovered
                        ? "border-gray-900 text-gray-900 font-semibold"
                        : "border-transparent text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {cat.nombre}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 ${
                        isHovered ? "rotate-180" : ""
                      }`}
                    />
                  </Link>
                </div>
              );
            })}
            <Link
              href="/productos"
              className="flex flex-shrink-0 items-center gap-0.5 px-4 py-3 text-sm font-semibold text-primary transition hover:text-primary/80 ml-auto"
            >
              Ver todo
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Mega-menú desplegable */}
          {hoveredCat && (() => {
            const cat = filtrarCategorias(categorias).find((c) => c.id === hoveredCat);
            const subs = subcatsMap[hoveredCat] || [];
            const marcas = marcasMap[hoveredCat] || [];
            if (!cat) return null;

            return (
              <div
                onMouseEnter={handleMenuEnter}
                onMouseLeave={handleMenuLeave}
                className="absolute left-0 right-0 bg-white border-b border-gray-200 shadow-xl z-50"
              >
                <div className="max-w-7xl mx-auto px-4 py-5 grid grid-cols-4 gap-6">

                  {/* Col 1 — Subcategorías */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      {cat.nombre}
                    </p>
                    <Link
                      href={`/productos?categoria=${slugify(cat.nombre)}`}
                      onClick={() => setHoveredCat(null)}
                      className="block text-sm text-gray-800 font-semibold py-1.5 hover:text-primary transition-colors"
                    >
                      Todas las subcategorías
                    </Link>
                    {subs.map((sub) => (
                      <Link
                        key={sub.id}
                        href={`/productos?categoria=${slugify(cat.nombre)}&subcategoria=${slugify(sub.nombre)}`}
                        onClick={() => setHoveredCat(null)}
                        className="flex items-center justify-between py-1.5 text-sm text-gray-600 hover:text-primary transition-colors group"
                      >
                        <span>{sub.nombre}</span>
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                      </Link>
                    ))}
                    {subs.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">Sin subcategorías</p>
                    )}
                  </div>

                  {/* Col 2 — Más buscado */}
                  <div className="border-l border-gray-100 pl-6">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Más buscado
                    </p>
                    {subs.slice(0, 5).map((sub) => (
                      <Link
                        key={sub.id}
                        href={`/productos?categoria=${slugify(cat.nombre)}&subcategoria=${slugify(sub.nombre)}`}
                        onClick={() => setHoveredCat(null)}
                        className="flex items-center gap-2 py-1.5 text-sm text-gray-600 hover:text-primary transition-colors"
                      >
                        <span className="text-gray-300 text-xs">↗</span>
                        {sub.nombre}
                      </Link>
                    ))}
                    {subs.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">—</p>
                    )}
                  </div>

                  {/* Col 3-4 — Marcas destacadas */}
                  <div className="col-span-2 border-l border-gray-100 pl-6">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Marcas en {cat.nombre}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {marcas.map((marca) => (
                        <Link
                          key={marca.id}
                          href={`/productos?categoria=${slugify(cat.nombre)}&marca=${slugify(marca.nombre)}`}
                          onClick={() => setHoveredCat(null)}
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          {marca.nombre}
                        </Link>
                      ))}
                      {marcas.length === 0 && (
                        <p className="text-xs text-gray-400">Sin marcas registradas</p>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}
        </nav>
      </header>

      {/* ── Mobile drawer ── */}
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          mobileOpen
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />
      {/* Panel */}
      <div
        className={`fixed left-0 top-0 z-[70] flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <img
            src={mobilLogoSrc}
            alt={config?.nombre || "Tienda"}
            className="h-8 w-auto"
            width={96}
            height={32}
            fetchPriority="high"
            onError={() => {
              if (mobilLogoSrc !== FALLBACK_LOGO) setMobilLogoSrc(FALLBACK_LOGO);
            }}
          />
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile search */}
        <form onSubmit={handleMobileSearch} className="border-b px-4 py-3">
          <div className="relative flex items-center">
            <input
              type="text"
              value={mobileQuery}
              onChange={(e) => setMobileQuery(e.target.value)}
              placeholder="¿Qué estás buscando?"
              aria-label="Buscar productos"
              className="h-10 w-full rounded-full border border-gray-300 pl-4 pr-10 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-r-full bg-gray-900 text-white transition hover:bg-primary"
              aria-label="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Categories */}
        <nav aria-label="Categorías" className="flex-1 overflow-y-auto px-2 py-2">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Categorías
          </p>
          {filtrarCategorias(categorias).map((cat) => (
            <Link
              key={cat.id}
              href={`/productos?categoria=${slugify(cat.nombre)}`}
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-primary/5 hover:text-primary"
            >
              {cat.nombre}
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
          ))}
          <Link
            href="/productos"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-1 px-3 py-2.5 text-sm font-semibold text-primary"
          >
            Ver todo
            <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>

        {/* Bottom links */}
        <div className="border-t px-4 py-4">
          <Link
            href="/cuenta"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <User className="h-5 w-5" />
            Mi cuenta
          </Link>
          <Link
            href="/historial"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <Package className="h-5 w-5" />
            Mis pedidos
          </Link>
          <Link
            href="/ofertas"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <TrendingDown className="h-5 w-5" />
            Ofertas
          </Link>
          <Link
            href="/info#faq"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <Phone className="h-5 w-5" />
            Ayuda
          </Link>
        </div>
      </div>
    </>
  );
}
