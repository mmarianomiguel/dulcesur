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

// Inserta transformaciones Cloudinary en URLs crudas (thumbnails de búsqueda, etc.)
// Evita servir originales sin optimizar en <img> que no pasan por next/image.
function optimizeCloudinary(url: string | null | undefined, width = 80): string {
  if (!url || !url.includes("res.cloudinary.com") || url.includes("/upload/w_") || url.includes("/upload/q_") || url.includes("/upload/f_")) return url || "";
  return url.replace("/upload/", `/upload/w_${width},q_auto:eco,f_auto/`);
}

interface TiendaNavbarProps {
  initial?: {
    logoSrc?: string;
    nombre?: string;
    telefono?: string;
    umbral_envio_gratis?: number;
    horario_atencion_inicio?: string;
    horario_atencion_fin?: string;
    dias_atencion?: string[];
    categorias?: Categoria[];
    subcatsMap?: Record<string, { id: string; nombre: string }[]>;
    marcasMap?: Record<string, { id: string; nombre: string }[]>;
  };
}

export default function TiendaNavbar({ initial }: TiendaNavbarProps = {}) {
  const [categorias, setCategorias] = useState<Categoria[]>(initial?.categorias || []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileQuery, setMobileQuery] = useState("");
  const { openCart, itemCount, subtotal } = useCart();
  useCarritoSync();
  const router = useRouter();
  const { filtrarCategorias } = useCategoriasPermitidas();
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [subcatsMap, setSubcatsMap] = useState<Record<string, { id: string; nombre: string }[]>>(initial?.subcatsMap || {});
  const [marcasMap, setMarcasMap] = useState<Record<string, { id: string; nombre: string }[]>>(initial?.marcasMap || {});
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: string; nombre: string; precio: number; imagen_url: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [logoSrc, setLogoSrc] = useState<string>(initial?.logoSrc || FALLBACK_LOGO);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState<string | null>(null);
  const [clienteSaldo, setClienteSaldo] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mobilLogoSrc, setMobilLogoSrc] = useState<string>(initial?.logoSrc || FALLBACK_LOGO);

  const [config, setConfig] = useState<{
    logo_url?: string; nombre?: string; telefono?: string;
    umbral_envio_gratis?: number; horario_atencion_inicio?: string;
    horario_atencion_fin?: string; dias_atencion?: string[];
  } | null>(initial ? {
    logo_url: initial.logoSrc,
    nombre: initial.nombre,
    telefono: initial.telefono,
    umbral_envio_gratis: initial.umbral_envio_gratis,
    horario_atencion_inicio: initial.horario_atencion_inicio,
    horario_atencion_fin: initial.horario_atencion_fin,
    dias_atencion: initial.dias_atencion,
  } : null);

  useEffect(() => {
    const readCliente = () => {
      try {
        const stored = localStorage.getItem("cliente_auth");
        if (stored) { const p = JSON.parse(stored); if (p?.id) { setClienteId(p.id); setClienteNombre(p.nombre || null); return; } }
      } catch {}
      setClienteId(null); setClienteNombre(null); setClienteSaldo(null);
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
    // Categorias se cachean desde SSR (heavy). tienda_config + empresa se
    // refetchean siempre porque el layout tiene revalidate=300 y queremos que
    // cambios en umbral_envio_gratis / horarios / telefono se reflejen al toque.
    const skipCategorias = !!(initial && initial.categorias && initial.categorias.length > 0);
    Promise.all([
      skipCategorias ? Promise.resolve({ data: null }) : supabase.from("categorias").select("id, nombre, restringida").order("nombre"),
      supabase.from("empresa").select("nombre, telefono, white_label").limit(1).single(),
      supabase.from("tienda_config").select("logo_url, umbral_envio_gratis, horario_atencion_inicio, horario_atencion_fin, dias_atencion").limit(1).single(),
    ]).then(([{ data: cats }, { data: emp }, { data: tc }]) => {
      if (cats) setCategorias(cats);
      if (emp || tc) setConfig({ ...emp, ...tc, logo_url: tc?.logo_url } as any);
      // Use tienda_config logo, fall back to white-label logo
      const wlLogo = (emp as any)?.white_label?.logo_url;
      const rawLogoUrl = tc?.logo_url || wlLogo;
      if (rawLogoUrl) {
        // Optimizar logo de Cloudinary: reduce de ~17 KiB a ~1 KiB
        const optimizedLogo = rawLogoUrl.includes("cloudinary.com")
          ? rawLogoUrl.replace("/upload/", "/upload/w_200,h_80,c_fit,q_auto,f_auto/")
          : rawLogoUrl;
        setLogoSrc(optimizedLogo);
        setMobilLogoSrc(optimizedLogo);
      }
    });
  }, [initial]);

  // Subcategorias + marcas vienen pre-computadas desde SSR (layout.tsx).
  // Fallback client-side solo si no llegaron en `initial` (p. ej., navbar usado fuera de layout).
  useEffect(() => {
    if ((initial?.subcatsMap && Object.keys(initial.subcatsMap).length > 0) ||
        (initial?.marcasMap && Object.keys(initial.marcasMap).length > 0)) return;
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
    })();
  }, [initial]);

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
      // Tokenizar: cada palabra >=2 chars se aplica como ILIKE encadenado (AND).
      // Esto hace que "coca cola" matchee "Coca-Cola Light" y "Light Coca Cola".
      const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
      let query = supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url")
        .eq("activo", true)
        .eq("visibilidad", "visible");
      for (const t of tokens) query = query.ilike("nombre", `%${t}%`);
      const { data } = await query.limit(6);
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

  const handleAvatarClick = async () => {
    setDropdownOpen((prev) => !prev);
    if (!dropdownOpen && clienteId && clienteSaldo === null) {
      const { data } = await supabase.from("clientes").select("saldo").eq("id", clienteId).single();
      if (data) setClienteSaldo((data as any).saldo ?? 0);
    }
  };
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCatLeave = () => {
    closeTimer.current = setTimeout(() => setHoveredCat(null), 250);
  };

  const handleMenuEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const handleMenuLeave = () => {
    closeTimer.current = setTimeout(() => setHoveredCat(null), 250);
  };

  const clientePrimerNombre = clienteNombre ? clienteNombre.trim().split(" ")[0] : null;
  const clienteIniciales = clienteNombre
    ? clienteNombre.trim().split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
    : "?";

  return (
    <>
      {/* ── Accent line ── */}
      <div className="h-0.5 bg-gradient-to-r from-primary via-rose-400 to-primary" />

      {/* ── Top bar ── */}
      <div className="bg-gray-900 text-white min-h-[28px]">
        <div className="mx-auto flex max-w-7xl items-center justify-center md:justify-between px-4 py-1.5 text-[10px] md:text-xs">
          <span className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            {config?.umbral_envio_gratis && config.umbral_envio_gratis > 0 ? `Envío gratis en compras +$${new Intl.NumberFormat("es-AR").format(config.umbral_envio_gratis)}` : "Envío sin cargo"}
          </span>
          <span className="hidden md:inline text-gray-400">
            Atención: {config?.dias_atencion ? `${config.dias_atencion[0]} a ${config.dias_atencion[config.dias_atencion.length - 1]}` : "Lunes a Sábados"} de {config?.horario_atencion_inicio?.slice(0, 5)?.replace(/^0/, "") || "8"} a {config?.horario_atencion_fin?.slice(0, 5)?.replace(/^0/, "") || "14"}hs
          </span>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/ofertas" className="flex items-center gap-1 font-semibold text-pink-400 hover:text-pink-300 transition">
              🏷️ Ofertas
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
          <Link href="/" className="flex-shrink-0 block" style={{ width: 120, height: 40 }}>
            <img
              src={logoSrc}
              alt={config?.nombre || "Tienda"}
              className="h-10 w-auto max-w-[120px] object-contain"
              width={120}
              height={40}
              fetchPriority="high"
              style={{ aspectRatio: "3/1" }}
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
                        <img src={optimizeCloudinary(s.imagen_url, 80)} alt="" className="w-8 h-8 object-contain rounded" loading="lazy" />
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
            <Link href="/ofertas" className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-pink-600 bg-pink-50 border border-pink-200 transition hover:bg-pink-100 lg:flex">
              <TrendingDown className="h-4 w-4" />
              Ofertas
            </Link>
            <div ref={dropdownRef} className="relative hidden lg:block">
              {clienteNombre ? (
                <button onClick={handleAvatarClick} className="flex items-center gap-2 rounded-full border border-gray-200 py-1 pl-1 pr-3 text-sm text-gray-700 transition hover:border-pink-300 hover:bg-pink-50">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{clienteIniciales}</div>
                  <span className="font-medium">{clientePrimerNombre}</span>
                </button>
              ) : (
                <Link href="/cuenta" className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-pink-300 hover:text-primary">
                  <User className="h-4 w-4" />
                  Ingresar
                </Link>
              )}
              {dropdownOpen && clienteNombre && (
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-gray-100 bg-white py-1.5 shadow-lg">
                  <div className="border-b border-gray-100 px-4 py-2.5">
                    <p className="text-sm font-semibold text-gray-900">{clienteNombre}</p>
                    {clienteSaldo !== null && clienteSaldo > 0 && (
                      <p className="mt-0.5 text-xs font-medium text-red-500">⚠ Saldo pendiente {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(clienteSaldo)}</p>
                    )}
                  </div>
                  <Link href="/cuenta/pedidos" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"><Package className="h-4 w-4 text-gray-400" />Mis pedidos</Link>
                  <Link href="/cuenta" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"><User className="h-4 w-4 text-gray-400" />Mi cuenta</Link>
                  <div className="my-1 border-t border-gray-100" />
                  {!logoutConfirm ? (
                    <button
                      onClick={() => setLogoutConfirm(true)}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-400 hover:bg-red-50 hover:text-red-500 active:text-red-600 transition-colors duration-150 rounded-b-xl"
                    >
                      Cerrar sesión
                    </button>
                  ) : (
                    <div className="px-4 py-2.5 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-2">¿Seguro que querés salir?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            localStorage.removeItem("cliente_auth");
                            setClienteId(null);
                            setClienteNombre(null);
                            setClienteSaldo(null);
                            setDropdownOpen(false);
                            setLogoutConfirm(false);
                            window.location.href = "/";
                          }}
                          className="flex-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 active:scale-95 py-1.5 rounded-lg transition-all duration-150"
                        >
                          Sí, salir
                        </button>
                        <button
                          onClick={() => setLogoutConfirm(false)}
                          className="flex-1 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 py-1.5 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notifications */}
            {clienteId && <NotificationBell clienteId={Number(clienteId)} />}

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
                {(() => {
                  const muchasSubs = subs.length > 8;
                  return (
                    <div className={`max-w-7xl mx-auto px-4 py-5 grid gap-6 ${muchasSubs ? "grid-cols-5" : "grid-cols-4"}`}>

                      {/* Subcategorías: 2 cols si hay muchas, 1 col si pocas */}
                      <div className={muchasSubs ? "col-span-2" : "col-span-1"}>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                          {cat.nombre}
                        </p>
                        <Link
                          href={`/productos?categoria=${slugify(cat.nombre)}`}
                          onClick={() => setHoveredCat(null)}
                          className="block text-sm text-gray-800 font-semibold py-1.5 hover:text-primary transition-colors mb-1"
                        >
                          Todas las subcategorías
                        </Link>
                        <div className={muchasSubs ? "grid grid-cols-2 gap-x-4" : ""}>
                          {subs.map((sub) => (
                            <Link
                              key={sub.id}
                              href={`/productos?categoria=${slugify(cat.nombre)}&subcategoria=${slugify(sub.nombre)}`}
                              onClick={() => setHoveredCat(null)}
                              className="flex items-center justify-between py-1 text-sm text-gray-600 hover:text-primary transition-colors group"
                            >
                              <span className="truncate">{sub.nombre}</span>
                              <ChevronRight className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-primary ml-1" />
                            </Link>
                          ))}
                        </div>
                        {subs.length === 0 && (
                          <p className="text-xs text-gray-400 mt-1">Sin subcategorías</p>
                        )}
                      </div>

                      {/* Más buscado */}
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

                      {/* Marcas */}
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
                  );
                })()}
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

        {/* Client info */}
        {clienteNombre ? (
          <Link href="/cuenta" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 border-b px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-white flex-shrink-0">{clienteIniciales}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{clienteNombre}</p>
              {clienteSaldo !== null && clienteSaldo > 0
                ? <p className="text-xs font-medium text-red-500 mt-0.5">⚠ Saldo pendiente</p>
                : <p className="text-xs text-gray-400 mt-0.5">Ver mi cuenta</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
          </Link>
        ) : (
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 flex-shrink-0">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">Ingresá a tu cuenta</p>
              <p className="text-xs text-gray-400 mt-0.5">Pedidos, notificaciones y más</p>
            </div>
            <Link href="/cuenta" onClick={() => setMobileOpen(false)} className="flex-shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
              Ingresar
            </Link>
          </div>
        )}

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
          <Link href="/ofertas" onClick={() => setMobileOpen(false)} className="mx-2 mb-1 mt-2 flex items-center gap-2 rounded-lg bg-pink-50 px-3 py-2.5 text-sm font-semibold text-pink-600 border border-pink-200">
            <TrendingDown className="h-4 w-4" />
            Ver Ofertas
            <span className="ml-auto rounded-full bg-pink-100 border border-pink-200 px-2 py-0.5 text-[9px] font-bold text-pink-600">NUEVO</span>
          </Link>
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
        <div className="border-t px-4 py-3 flex items-center justify-between">
          <Link href="/info#faq" onClick={() => setMobileOpen(false)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <Phone className="h-4 w-4" />
            Ayuda
          </Link>
          {clienteNombre && (
            <button onClick={() => { localStorage.removeItem("cliente_auth"); setClienteId(null); setClienteNombre(null); setClienteSaldo(null); setMobileOpen(false); window.location.href = "/"; }} className="text-xs text-gray-400 hover:text-red-500 transition">
              Cerrar sesión
            </button>
          )}
        </div>
      </div>
    </>
  );
}
