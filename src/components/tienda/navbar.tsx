"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import Image from "next/image";
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
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCart } from "./cart-drawer";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";

interface Categoria {
  id: string;
  nombre: string;
}

export default function TiendaNavbar() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileQuery, setMobileQuery] = useState("");
  const { openCart, itemCount, subtotal } = useCart();
  const router = useRouter();
  const { filtrarCategorias } = useCategoriasPermitidas();
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<{ id: string; nombre: string; precio: number; imagen_url: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [config, setConfig] = useState<{
    logo_url?: string; nombre?: string; telefono?: string;
    umbral_envio_gratis?: number; horario_atencion_inicio?: string;
    horario_atencion_fin?: string; dias_atencion?: string[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("categorias").select("id, nombre, restringida").limit(12),
      supabase.from("empresa").select("nombre, telefono").limit(1).single(),
      supabase.from("tienda_config").select("logo_url, umbral_envio_gratis, horario_atencion_inicio, horario_atencion_fin, dias_atencion").limit(1).single(),
    ]).then(([{ data: cats }, { data: emp }, { data: tc }]) => {
      if (cats) setCategorias(cats);
      if (emp || tc) setConfig({ ...emp, ...tc, logo_url: tc?.logo_url } as any);
    });
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
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url")
        .eq("activo", true)
        .eq("visibilidad", "visible")
        .ilike("nombre", `%${val.trim()}%`)
        .limit(5);
      setSuggestions(data || []);
      setShowSuggestions(true);
    }, 300);
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

  return (
    <>
      {/* ── Top bar ── */}
      <div className="bg-gray-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-center md:justify-between px-4 py-1.5 text-[10px] md:text-xs">
          <span className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Envío gratis en compras +${config?.umbral_envio_gratis ? new Intl.NumberFormat("es-AR").format(config.umbral_envio_gratis) : "50.000"}
          </span>
          <span className="hidden md:inline text-gray-400">
            Atención: {config?.dias_atencion ? `${config.dias_atencion[0]} a ${config.dias_atencion[config.dias_atencion.length - 1]}` : "Lunes a Sábados"} de {config?.horario_atencion_inicio?.slice(0, 5)?.replace(/^0/, "") || "8"} a {config?.horario_atencion_fin?.slice(0, 5)?.replace(/^0/, "") || "14"}hs
          </span>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/cuenta" className="hover:text-pink-400 transition">
              Mi cuenta
            </Link>
            {config?.telefono && (
              <a href={`tel:${config.telefono.replace(/[^+\d]/g, "")}`} className="flex items-center gap-1 hover:text-pink-400 transition" suppressHydrationWarning>
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
            <Image
              src={config?.logo_url || "https://www.dulcesur.com/assets/logotipo.png"}
              alt={config?.nombre || "Tienda"}
              width={130}
              height={44}
              className="h-10 w-auto"
              priority
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
                className="h-10 w-full rounded-full border border-gray-300 pl-4 pr-12 text-sm text-gray-700 placeholder-gray-400 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
              />
              <button
                type="submit"
                className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-r-full bg-pink-600 text-white transition hover:bg-pink-700"
                aria-label="Buscar"
              >
                <Search className="h-4 w-4" />
              </button>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50">
                  {suggestions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/productos/${s.id}`}
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
                    className="w-full px-4 py-2 text-xs text-pink-600 font-medium hover:bg-pink-50 transition border-t border-gray-100"
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
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-pink-600 lg:flex"
            >
              <User className="h-5 w-5" />
              Mi cuenta
            </Link>

            {/* Cart */}
            <button
              onClick={openCart}
              className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 hover:text-pink-600"
              aria-label="Carrito"
            >
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 && (
                <span key={itemCount} suppressHydrationWarning className="absolute -right-0.5 -top-0.5 flex h-5 w-5 animate-bounce items-center justify-center rounded-full bg-pink-600 text-[10px] font-bold text-white shadow-sm [animation-duration:0.6s] [animation-iteration-count:2]">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
              <span className="hidden text-sm font-medium lg:inline">
                Carrito
              </span>
              {subtotal > 0 && (
                <span suppressHydrationWarning className="text-[10px] lg:text-xs font-semibold text-pink-600 ml-0.5">
                  {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(subtotal)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Category bar (desktop) ── */}
        <nav className="hidden border-b border-gray-100 lg:block">
          <div
            ref={categoryBarRef}
            className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 scrollbar-none"
          >
            {filtrarCategorias(categorias).map((cat) => (
              <Link
                key={cat.id}
                href={`/productos?categoria=${cat.id}`}
                className="group relative flex-shrink-0 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:text-pink-600"
              >
                {cat.nombre}
                <span className="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-pink-600 transition-transform group-hover:scale-x-100" />
              </Link>
            ))}
            <Link
              href="/productos"
              className="flex flex-shrink-0 items-center gap-0.5 px-3 py-2.5 text-sm font-medium text-pink-600 transition hover:text-pink-700"
            >
              Ver todo
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
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
        className={`fixed left-0 top-0 z-[70] flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <Image
            src={config?.logo_url || "https://www.dulcesur.com/assets/logotipo.png"}
            alt={config?.nombre || "Tienda"}
            width={110}
            height={37}
            className="h-8 w-auto"
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
              className="h-10 w-full rounded-full border border-gray-300 pl-4 pr-10 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-pink-500"
            />
            <button
              type="submit"
              className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-r-full bg-pink-600 text-white"
              aria-label="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Categories */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Categorías
          </p>
          {filtrarCategorias(categorias).map((cat) => (
            <Link
              key={cat.id}
              href={`/productos?categoria=${cat.id}`}
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-pink-50 hover:text-pink-600"
            >
              {cat.nombre}
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
          ))}
          <Link
            href="/productos"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-1 px-3 py-2.5 text-sm font-semibold text-pink-600"
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
