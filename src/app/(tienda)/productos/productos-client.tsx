"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { showToast } from "@/components/tienda/toast";
import { supabase } from "@/lib/supabase";
import { formatCurrency, daysSinceAR } from "@/lib/formatters";
import { slugify, productSlug } from "@/lib/utils";
import { fuzzyMatch } from "@/lib/fuzzy";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";
import {
  Search,
  SlidersHorizontal,
  Grid,
  List,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShoppingCart,
  X,
  Minus,
  Plus,
  Candy,
  Store,
  BookOpen,
  Cigarette,
  MoreHorizontal,
  Pill,
  Milk,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const PER_PAGE = 12;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  kiosco: Candy,
  almacen: Store,
  libreria: BookOpen,
  cigarros: Cigarette,
  varios: MoreHorizontal,
  analgesicos: Pill,
  lacteos: Milk,
  bolsas: Tag,
};

function getCategoryIcon(nombre: string): LucideIcon {
  const key = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return CATEGORY_ICONS[key] || Package;
}


export interface Categoria {
  id: string;
  nombre: string;
  count?: number;
  restringida?: boolean;
}

export interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
  count?: number;
}

export interface Marca {
  id: string;
  nombre: string;
  count?: number;
}

export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  categoria_id: string;
  subcategoria_id: string | null;
  marca_id: string | null;
  stock: number;
  created_at: string;
  categorias: { nombre: string } | null;
  marcas: { nombre: string } | null;
  es_combo?: boolean;
  precio_anterior?: number | null;
  fecha_actualizacion?: string | null;
  updated_at?: string;
}

/* ───── Skeleton loader ───── */
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
          <div className="aspect-[4/3] bg-gray-100" />
          <div className="p-4 space-y-3">
            <div className="h-3 w-16 bg-gray-100 rounded-full" />
            <div className="space-y-1.5">
              <div className="h-3.5 bg-gray-100 rounded-full w-full" />
              <div className="h-3.5 bg-gray-100 rounded-full w-2/3" />
            </div>
            <div className="h-5 w-24 bg-gray-100 rounded-full" />
            <div className="h-10 bg-gray-100 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───── Pagination helpers ───── */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [];
  pages.push(1);
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export interface InitialProductosData {
  productos: Producto[];
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  marcas: Marca[];
  total: number;
  presentacionesMap: Record<string, { nombre: string; cantidad: number; precio: number }[]>;
  activeDiscounts: any[];
  diasOcultarSinStock: number;
}

function cutoffARG(dias: number): string {
  const now = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
  now.setDate(now.getDate() - dias);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function ProductosContent({ initialData }: { initialData?: InitialProductosData }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { filtrarCategorias, permitidas, loaded: permisosLoaded } = useCategoriasPermitidas();

  const hasInitial = !!initialData;
  const [productos, setProductos] = useState<Producto[]>(initialData?.productos || []);
  const [categorias, setCategorias] = useState<Categoria[]>(initialData?.categorias || []);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>(initialData?.marcas || []);
  const [total, setTotal] = useState(initialData?.total || 0);
  const [loading, setLoading] = useState(!hasInitial);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [marcaSearch, setMarcaSearch] = useState("");
  const [allSubcategorias, setAllSubcategorias] = useState<Subcategoria[]>(initialData?.subcategorias || []);

  const [marcasCollapsed, setMarcasCollapsed] = useState(!searchParams.get("marca"));
  const [presentacionesMap, setPresentacionesMap] = useState<Record<string, { nombre: string; cantidad: number; precio: number }[]>>(initialData?.presentacionesMap || {});
  const [activeDiscounts, setActiveDiscounts] = useState<any[]>(initialData?.activeDiscounts || []);
  const [tiendaClienteId, setTiendaClienteId] = useState<string | null>(null);
  const [selectedPres, setSelectedPres] = useState<Record<string, number>>({}); // productId -> presentacion index
  const [cartUnits, setCartUnits] = useState<Record<string, number>>({}); // productId -> total units in cart
  const [diasOcultarSinStock, setDiasOcultarSinStock] = useState(initialData?.diasOcultarSinStock ?? 7);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // Resolve tienda cliente_id for client-specific discounts
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cliente_auth");
      if (raw) {
        const auth = JSON.parse(raw);
        if (auth?.id) {
          supabase.from("clientes_auth").select("cliente_id").eq("id", auth.id).single().then(({ data }) => {
            if (data?.cliente_id) setTiendaClienteId(data.cliente_id);
          });
        }
      }
    } catch { /* no auth */ }
  }, []);

  // Sync cart units
  useEffect(() => {
    function syncCart() {
      const stored = localStorage.getItem("carrito");
      let carrito: { id: string; cantidad: number }[]; try { const parsed = stored ? JSON.parse(stored) : []; carrito = Array.isArray(parsed) ? parsed : []; } catch { carrito = []; }
      const map: Record<string, number> = {};
      carrito.forEach((item) => {
        const parts = item.id.split("_");
        const prodId = parts[0];
        const match = item.id.match(/Caja \(x(\d+)\)/);
        const units = match ? Number(match[1]) : 1;
        map[prodId] = (map[prodId] || 0) + item.cantidad * units;
      });
      setCartUnits(map);
    }
    syncCart();
    window.addEventListener("cart-updated", syncCart);
    return () => window.removeEventListener("cart-updated", syncCart);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("search_history");
      if (raw) setSearchHistory(JSON.parse(raw));
    } catch {}
  }, []);

  // Price inputs local state for "Aplicar" button
  const [localPrecioMin, setLocalPrecioMin] = useState("");
  const [localPrecioMax, setLocalPrecioMax] = useState("");

  // Read filters from URL (now using slugified names instead of UUIDs)
  const categoriaSlug = searchParams.get("categoria");
  const subcategoriaSlug = searchParams.get("subcategoria");
  const marcaSlug = searchParams.get("marca");
  const searchQuery = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "az";
  const page = Number(searchParams.get("page") || "1");
  const precioMin = searchParams.get("precio_min") || "";
  const precioMax = searchParams.get("precio_max") || "";
  const disponibilidad = searchParams.get("disponibilidad") || "";
  const tipoFilter = searchParams.get("tipo") || "";

  // Resolve slugs to IDs (supports both slugified names and legacy UUIDs)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const categoriaId = categoriaSlug
    ? uuidRegex.test(categoriaSlug)
      ? categoriaSlug
      : categorias.find((c) => slugify(c.nombre) === categoriaSlug)?.id || null
    : null;
  const subcategoriaId = subcategoriaSlug
    ? uuidRegex.test(subcategoriaSlug)
      ? subcategoriaSlug
      : allSubcategorias.find((s) => slugify(s.nombre) === subcategoriaSlug)?.id || null
    : null;
  const marcaParam = marcaSlug
    ? uuidRegex.test(marcaSlug)
      ? marcaSlug
      : marcas.find((m) => slugify(m.nombre) === marcaSlug)?.id || null
    : null;


  // Sync local price inputs with URL
  useEffect(() => {
    setLocalPrecioMin(precioMin);
    setLocalPrecioMax(precioMax);
  }, [precioMin, precioMax]);

  function saveToHistory(q: string) {
    if (!q.trim()) return;
    setSearchHistory((prev) => {
      const next = [q, ...prev.filter((h) => h !== q)].slice(0, 5);
      localStorage.setItem("search_history", JSON.stringify(next));
      return next;
    });
  }

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      if (!("page" in updates)) {
        params.delete("page");
      }
      router.push(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  // Fetch all filter data + config in a single parallel request on mount
  useEffect(() => {
    async function loadFilters() {
      const today = new Date().toISOString().split("T")[0];

      // Paginated fetch to bypass Supabase max rows limit (default 1000)
      const fetchAllProds = async () => {
        const PAGE = 1000;
        const allRows: any[] = [];
        let from = 0;
        while (true) {
          const { data } = await supabase.from("productos").select("categoria_id, subcategoria_id, marca_id, stock, fecha_sin_stock").eq("activo", true).eq("visibilidad", "visible").range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return allRows;
      };

      const [catsRes, subsRes, marcasRes, discRes, configRes, allProds] = await Promise.all([
        supabase.from("categorias").select("id, nombre, restringida"),
        supabase.from("subcategorias").select("id, nombre, categoria_id"),
        supabase.from("marcas").select("id, nombre"),
        supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", today),
        supabase.from("tienda_config").select("dias_ocultar_sin_stock").limit(1).single(),
        fetchAllProds(),
      ]);

      const dias = configRes.data?.dias_ocultar_sin_stock ?? 7;
      setDiasOcultarSinStock(dias);
      const cutoff = dias > 0 ? cutoffARG(dias) : null;
      const visibleProds = cutoff
        ? allProds.filter((p: any) =>
            p.stock > 0 ||
            (p.fecha_sin_stock && p.fecha_sin_stock > cutoff)
          )
        : allProds;

      // Build count maps from the single products query
      const catCount: Record<string, number> = {};
      const subCount: Record<string, number> = {};
      const marcaCount: Record<string, number> = {};
      for (const p of visibleProds) {
        if (p.categoria_id) catCount[p.categoria_id] = (catCount[p.categoria_id] || 0) + 1;
        if (p.subcategoria_id) subCount[p.subcategoria_id] = (subCount[p.subcategoria_id] || 0) + 1;
        if (p.marca_id) marcaCount[p.marca_id] = (marcaCount[p.marca_id] || 0) + 1;
      }

      setCategorias((catsRes.data || []).map((c: any) => ({ ...c, count: catCount[c.id] || 0 })));
      const subsWithCounts = (subsRes.data || []).map((s: any) => ({ ...s, count: subCount[s.id] || 0 }));
      setAllSubcategorias(subsWithCounts);
      setMarcas((marcasRes.data || []).map((m: any) => ({ ...m, count: marcaCount[m.id] || 0 })));
      setActiveDiscounts((discRes.data || []).filter((d: any) => !d.fecha_fin || d.fecha_fin >= today));
    }
    loadFilters();
  }, []);

  // Filter subcategorias when selected category changes
  useEffect(() => {
    if (categoriaId) {
      setSubcategorias(allSubcategorias.filter((s) => s.categoria_id === categoriaId));
    }
  }, [categoriaId, allSubcategorias]);

  function getProductDiscount(producto: Producto, presLabel?: string | null, qty?: number): number {
    let best = 0;
    const effectivePres = presLabel ?? "Unidad";
    const isBox = effectivePres !== "Unidad" && !effectivePres.startsWith("Unidad");
    const isUnit = !isBox;
    for (const d of activeDiscounts) {
      if (d.productos_excluidos_ids?.length > 0 && d.productos_excluidos_ids.includes(producto.id)) continue;
      if (d.clientes_ids?.length > 0 && (!tiendaClienteId || !d.clientes_ids.includes(tiendaClienteId))) continue;
      if (d.excluir_combos && (producto as any).es_combo) continue;
      if (d.cantidad_minima && d.cantidad_minima > 0) {
        if (qty == null || qty < d.cantidad_minima) continue;
      }
      if (d.presentacion === "unidad" && isBox) continue;
      if (d.presentacion === "caja" && isUnit) continue;
      let effectivePercent = Number(d.porcentaje);
      if (d.tipo_descuento === "precio_fijo" && d.precio_fijo != null && producto.precio > 0) {
        effectivePercent = Math.max(0, Math.min(100, ((producto.precio - d.precio_fijo) / producto.precio) * 100));
      }
      if (d.aplica_a === "todos") {
        best = Math.max(best, effectivePercent);
      } else if (d.aplica_a === "categorias") {
        const ids: string[] = d.categorias_ids || [];
        if (ids.includes(producto.categoria_id) || (producto.subcategoria_id && ids.includes(producto.subcategoria_id))) {
          best = Math.max(best, effectivePercent);
        }
      } else if (d.aplica_a === "subcategorias") {
        const subIds: string[] = d.subcategorias_ids || [];
        if (producto.subcategoria_id && subIds.includes(producto.subcategoria_id)) {
          best = Math.max(best, effectivePercent);
        }
      } else if (d.aplica_a === "productos") {
        const ids: string[] = d.productos_ids || [];
        if (ids.includes(producto.id)) {
          best = Math.max(best, effectivePercent);
        }
      } else if (d.aplica_a === "marcas") {
        const mIds: string[] = d.marcas_ids || [];
        if ((producto as any).marca_id && mIds.includes((producto as any).marca_id)) {
          best = Math.max(best, effectivePercent);
        }
      }
    }
    return best;
  }

  // Fetch products
  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from("productos")
        .select("id, nombre, precio, precio_oferta, precio_oferta_hasta, imagen_url, categoria_id, subcategoria_id, marca_id, stock, created_at, updated_at, fecha_sin_stock, es_combo, precio_anterior, fecha_actualizacion, categorias(nombre), marcas(nombre)", { count: "exact" });

      query = query.eq("activo", true).eq("visibilidad", "visible");

      // Exclude restricted categories the client can't access
      const restrictedIds = categorias
        .filter((c) => c.restringida && !(permitidas || []).includes(c.id))
        .map((c) => c.id);
      if (restrictedIds.length > 0 && !categoriaId) {
        query = query.not("categoria_id", "in", `(${restrictedIds.join(",")})`);
      }
      // If navigating to a restricted category without permission, show nothing
      if (categoriaId && restrictedIds.includes(categoriaId)) {
        setProductos([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      if (categoriaId) query = query.eq("categoria_id", categoriaId);
      if (subcategoriaId)
        query = query.eq("subcategoria_id", subcategoriaId);
      if (marcaParam)
        query = query.eq("marca_id", marcaParam);
      if (searchQuery)
        query = query.ilike("nombre", `%${searchQuery}%`);
      if (precioMin) query = query.gte("precio", Number(precioMin));
      if (precioMax) query = query.lte("precio", Number(precioMax));
      // Hide out-of-stock products not updated in X days (unless filtering for sin_stock)
      // Combos have stock=0 in the table (calculated dynamically), so exclude them from this filter
      if (disponibilidad === "" && diasOcultarSinStock > 0) {
        const cutoff = cutoffARG(diasOcultarSinStock);
        // Mostrar si: tiene stock, o si se quedó sin stock hace menos de N días, o nunca se quedó sin stock, o es combo
        query = query.or(
          `stock.gt.0,fecha_sin_stock.gt.${cutoff},fecha_sin_stock.is.null,es_combo.eq.true`
        );
      }
      if (disponibilidad === "en_stock") query = query.gt("stock", 0);
      if (disponibilidad === "sin_stock") query = query.eq("stock", 0);
      if (tipoFilter === "combos") query = query.eq("es_combo", true);
      if (tipoFilter === "precio_actualizado") {
        const threeDaysAgo = cutoffARG(3);
        query = query.gt("precio_anterior", 0).gt("fecha_actualizacion", threeDaysAgo);
      }

      switch (sort) {
        case "precio_asc":
          query = query.order("precio", { ascending: true });
          break;
        case "precio_desc":
          query = query.order("precio", { ascending: false });
          break;
        case "az":
          query = query.order("nombre", { ascending: true });
          break;
        default:
          query = query.order("created_at", { ascending: false });
      }

      const from = (page - 1) * PER_PAGE;
      query = query.range(from, from + PER_PAGE - 1);

      const { data, count } = await query;
      const prods = (data as unknown as Producto[]) || [];
      let finalProds = prods;
      let finalCount = count || 0;
      if (searchQuery && finalCount === 0) {
        const { data: allData } = await supabase
          .from("productos")
          .select("id, nombre, precio, imagen_url, stock, activo, visibilidad, es_combo, precio_anterior, fecha_actualizacion, updated_at, created_at, categorias(id, nombre, restringida), marcas(id, nombre)")
          .eq("activo", true)
          .eq("visibilidad", "visible")
          .limit(500);
        const fuzzyFiltered = ((allData as any[]) || []).filter((p: any) => fuzzyMatch(p.nombre, searchQuery));
        finalProds = fuzzyFiltered as unknown as Producto[];
        finalCount = fuzzyFiltered.length;
      }
      const ids = finalProds.map((p) => p.id);
      const comboIds = finalProds.filter((p) => p.es_combo).map((p) => p.id);

      // Fetch combo stock + presentaciones in parallel (single render instead of two)
      const [comboResult, presResult] = await Promise.all([
        comboIds.length > 0
          ? supabase.from("combo_items").select("combo_id, cantidad, productos!combo_items_producto_id_fkey(stock)").in("combo_id", comboIds)
          : Promise.resolve({ data: null }),
        ids.length > 0
          ? supabase.from("presentaciones").select("producto_id, nombre, cantidad, precio").in("producto_id", ids).order("cantidad")
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Apply combo effective stock
      if (comboResult.data) {
        const comboStockMap: Record<string, number> = {};
        for (const ci of (comboResult.data || []) as any[]) {
          const compStock = ci.productos?.stock ?? 0;
          const maxFromComp = Math.floor(compStock / (ci.cantidad || 1));
          comboStockMap[ci.combo_id] = ci.combo_id in comboStockMap
            ? Math.min(comboStockMap[ci.combo_id], maxFromComp)
            : maxFromComp;
        }
        for (const p of finalProds) {
          if (p.es_combo && p.id in comboStockMap) p.stock = comboStockMap[p.id];
        }
      }

      // Build presentaciones map + defaults
      const presMap: Record<string, { nombre: string; cantidad: number; precio: number }[]> = {};
      (presResult.data || []).forEach((pr: { producto_id: string; nombre: string; cantidad: number; precio: number }) => {
        if (!presMap[pr.producto_id]) presMap[pr.producto_id] = [];
        presMap[pr.producto_id].push({ nombre: pr.nombre, cantidad: pr.cantidad, precio: pr.precio });
      });
      const defaults: Record<string, number> = {};
      for (const [prodId, pres] of Object.entries(presMap)) {
        const hasMedio = pres.some((p) => p.cantidad <= 0.5 || p.nombre.toLowerCase().includes("medio"));
        if (hasMedio) {
          const unitIdx = pres.findIndex((p) => p.cantidad === 1);
          if (unitIdx >= 0) defaults[prodId] = unitIdx;
        }
      }

      // Set all state at once — single render pass
      setProductos(finalProds);
      setTotal(finalCount);
      setPresentacionesMap(presMap);
      if (Object.keys(defaults).length > 0) setSelectedPres((prev) => ({ ...defaults, ...prev }));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId, subcategoriaId, marcaParam, searchQuery, sort, page, precioMin, precioMax, disponibilidad, tipoFilter, permitidas, categorias, diasOcultarSinStock]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const activeCategoryName = categorias.find(
    (c) => c.id === categoriaId
  )?.nombre;

  // Pre-compute base discounts for all displayed products (avoid recalculating in render loop)
  const productDiscountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of productos) {
      map[p.id] = getProductDiscount(p);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, activeDiscounts, tiendaClienteId]);

  const [quantities, setQuantities] = useState<Record<string, number>>({});

  function getQty(id: string) {
    return quantities[id] ?? 1;
  }

  function setQty(id: string, val: number) {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, val) }));
  }

  function getActivePrice(producto: Producto): number {
    // Check precio_oferta first
    const today = new Date().toISOString().slice(0, 10);
    const po = (producto as any).precio_oferta;
    const poHasta = (producto as any).precio_oferta_hasta;
    if (po && po > 0 && (!poHasta || poHasta >= today)) {
      return po;
    }

    const pres = presentacionesMap[producto.id];
    if (pres && pres.length > 1) {
      const idx = selectedPres[producto.id] ?? 0;
      const p = pres[idx];
      if (p) {
        if (p.precio > 0 && p.cantidad > 1 && p.precio === producto.precio) {
          return p.precio * p.cantidad;
        }
        return p.precio > 0 ? p.precio : producto.precio * Math.max(1, p.cantidad);
      }
      return producto.precio;
    }
    return producto.precio;
  }

  function isOnOffer(producto: Producto): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const po = (producto as any).precio_oferta;
    const poHasta = (producto as any).precio_oferta_hasta;
    return !!(po && po > 0 && (!poHasta || poHasta >= today));
  }

  function presLabel(p: { cantidad: number; nombre?: string }): string {
    return p.nombre || (p.cantidad === 1 ? "Unidad" : `Caja x${p.cantidad}`);
  }

  function getActivePresLabel(producto: Producto) {
    const pres = presentacionesMap[producto.id];
    if (pres && pres.length > 1) {
      const idx = selectedPres[producto.id] ?? 0;
      return presLabel(pres[idx]);
    }
    return null;
  }

  function addToCart(producto: Producto, qty?: number) {
    const amount = qty ?? getQty(producto.id);
    const basePrice = getActivePrice(producto);
    let presLabel = getActivePresLabel(producto);
    // For combo products, override presentacion
    if (producto.es_combo) {
      presLabel = "Combo";
    }
    const disc = getProductDiscount(producto, presLabel, amount);
    const price = disc > 0 ? Math.round(basePrice * (1 - disc / 100)) : basePrice;
    const cartKey = presLabel ? `${producto.id}_${presLabel}` : producto.id;
    const stored = localStorage.getItem("carrito");
    let carrito: any[]; try { const _p = stored ? JSON.parse(stored) : []; carrito = Array.isArray(_p) ? _p : []; } catch { carrito = []; }
    // Also check for legacy cart items without _Unidad suffix
    const existing = carrito.find((item: any) => item.id === cartKey || (presLabel === "Unidad" && item.id === producto.id));
    if (existing && existing.id !== cartKey) existing.id = cartKey;
    // Check stock limit considering what's already in cart
    const currentInCart = existing ? existing.cantidad : 0;
    const pres = presentacionesMap[producto.id];
    const activePresIdx = selectedPres[producto.id] ?? 0;
    const presUnits = pres && pres.length > 1 ? Number(pres[activePresIdx]?.cantidad ?? 1) : 1;
    const maxForPres = Math.floor(producto.stock / presUnits);
    if (currentInCart >= maxForPres) {
      showToast("Ya tenés el máximo disponible en el carrito", "error");
      return;
    }
    const canAdd = Math.min(amount, maxForPres - currentInCart);
    if (canAdd < amount) {
      showToast(`Se agregaron ${canAdd} (máximo disponible)`, { type: "info", subtitle: producto.nombre });
    }
    if (existing) {
      existing.cantidad += canAdd;
    } else {
      carrito.push({
        id: cartKey,
        nombre: presLabel && presLabel !== "Unidad" ? `${producto.nombre} - ${presLabel}` : producto.nombre,
        precio: price,
        precio_original: disc > 0 ? basePrice : undefined,
        descuento: disc > 0 ? disc : undefined,
        imagen_url: producto.imagen_url,
        cantidad: canAdd,
        presentacion: presLabel || "Unidad",
        unidades_por_presentacion: presUnits,
      });
    }
    localStorage.setItem("carrito", JSON.stringify(carrito));
    window.dispatchEvent(new Event("cart-updated"));
    const presInfo = presLabel && presLabel !== "Unidad" ? ` · ${presLabel}` : "";
    showToast(producto.nombre, { subtitle: `${canAdd} ${canAdd > 1 ? "unidades agregadas" : "agregado"} al carrito${presInfo}` });
    setQuantities((prev) => ({ ...prev, [producto.id]: 1 }));
  }

  function selectMarca(marca: Marca) {
    const isSame = marcaParam === marca.id;
    updateParams({ marca: isSame ? null : slugify(marca.nombre) });
  }

  /* ───── Active filter count ───── */
  const activeFilterCount =
    (categoriaSlug ? 1 : 0) +
    (subcategoriaSlug ? 1 : 0) +
    (marcaSlug ? 1 : 0) +
    (precioMin ? 1 : 0) +
    (precioMax ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    (disponibilidad ? 1 : 0) +
    (tipoFilter ? 1 : 0);

  const activeSubcategoryName = allSubcategorias.find(
    (s) => s.id === subcategoriaId
  )?.nombre;

  /* ───── Custom radio component ───── */
  const RadioCircle = ({ selected }: { selected: boolean }) => (
    <span
      className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
        selected ? "border-primary bg-primary" : "border-gray-300"
      }`}
    >
      {selected && <span className="w-2 h-2 rounded-full bg-white" />}
    </span>
  );

  /* ───── Sidebar content ───── */
  const sidebarContent = (
    <div className="space-y-6">
      {/* Active filters chips */}
      {activeFilterCount > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">
            Filtros activos:
          </h4>
          <div className="flex flex-wrap gap-2">
            {categoriaId && activeCategoryName && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary rounded-full px-3 py-1.5">
                {activeCategoryName}
                <button
                  onClick={() => updateParams({ categoria: null, subcategoria: null })}
                  className="hover:bg-primary/10 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {subcategoriaId && activeSubcategoryName && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary rounded-full px-3 py-1.5">
                {activeSubcategoryName}
                <button
                  onClick={() => updateParams({ subcategoria: null })}
                  className="hover:bg-primary/10 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {marcaParam && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary rounded-full px-3 py-1.5">
                {marcas.find((m) => m.id === marcaParam)?.nombre || "Marca"}
                <button
                  onClick={() => updateParams({ marca: null })}
                  className="hover:bg-primary/10 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {(precioMin || precioMax) && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary rounded-full px-3 py-1.5">
                Precio{precioMin ? ` desde ${formatCurrency(Number(precioMin))}` : ""}{precioMax ? ` hasta ${formatCurrency(Number(precioMax))}` : ""}
                <button
                  onClick={() => updateParams({ precio_min: null, precio_max: null })}
                  className="hover:bg-primary/10 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {tipoFilter && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary rounded-full px-3 py-1.5">
                {tipoFilter === "combos" ? "Combos" : "Precio actualizado"}
                <button
                  onClick={() => updateParams({ tipo: null })}
                  className="hover:bg-primary/10 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {disponibilidad && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary rounded-full px-3 py-1.5">
                {disponibilidad === "en_stock" ? "En stock" : "Sin stock"}
                <button
                  onClick={() => updateParams({ disponibilidad: null })}
                  className="hover:bg-primary/10 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/5 text-primary rounded-full px-3 py-1.5">
                &quot;{searchQuery}&quot;
                <button
                  onClick={() => updateParams({ q: null })}
                  className="hover:bg-primary/10 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Buscar</h4>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar productos..."
            defaultValue={searchQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value || null;
                if (val) saveToHistory(val);
                updateParams({ q: val });
              }
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400"
          />
        </div>
        {searchHistory.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {searchHistory.map((h) => (
              <button
                key={h}
                onClick={() => {
                  saveToHistory(h);
                  updateParams({ q: h });
                }}
                className="text-[11px] bg-gray-100 hover:bg-primary/10 hover:text-primary text-gray-600 rounded-full px-2.5 py-1 transition"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100" />

      <div className="border-t border-gray-100" />

      {/* Marcas */}
      {marcas.length > 0 && (
        <>
          <div>
            <button
              onClick={() => setMarcasCollapsed(!marcasCollapsed)}
              className="flex items-center justify-between w-full mb-3"
            >
              <div className="flex items-center gap-2">
                <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  Marcas
                </h4>
                <span className="text-[10px] bg-gray-100 text-gray-400 rounded-full px-1.5 py-0.5 font-medium">
                  {marcas.filter((m) => (m.count || 0) > 0).length}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                  marcasCollapsed ? "-rotate-90" : ""
                }`}
              />
            </button>

            {!marcasCollapsed && (() => {
              const marcasConStock = marcas.filter((m) => (m.count || 0) > 0).sort((a, b) => (b.count || 0) - (a.count || 0));
              const filteredMarcas = marcaSearch
                ? marcasConStock.filter((m) => m.nombre.toLowerCase().includes(marcaSearch.toLowerCase()))
                : marcasConStock;
              return (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Buscar marca..."
                  value={marcaSearch}
                  onChange={(e) => setMarcaSearch(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-gray-50 border-0 text-xs focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400 mb-1"
                />
                {!marcaSearch && (
                <button
                  onClick={() => updateParams({ marca: null })}
                  className={`flex items-center gap-3 py-2 rounded-lg cursor-pointer w-full transition-all border-l-[3px] ${!marcaParam ? "bg-primary/10 border-primary px-[5px]" : "hover:bg-gray-50 border-transparent px-2"}`}
                >
                  <RadioCircle selected={!marcaParam} />
                  <span className={`text-sm ${!marcaParam ? "font-semibold text-primary" : "text-gray-600"}`}>
                    Todas las marcas
                  </span>
                  <span className="text-gray-400 text-sm ml-auto">
                    ({marcasConStock.reduce((sum, m) => sum + (m.count || 0), 0)})
                  </span>
                </button>
                )}

                <div className="max-h-[280px] overflow-y-auto space-y-0.5">
                {filteredMarcas.map((marca) => {
                  const isSelected = marcaParam === marca.id;
                  return (
                    <button
                      key={marca.id}
                      onClick={() => selectMarca(marca)}
                      className={`flex items-center gap-3 py-2 rounded-lg cursor-pointer w-full transition-all border-l-[3px] ${isSelected ? "bg-primary/10 border-primary px-[5px]" : "hover:bg-gray-50 border-transparent px-2"}`}
                    >
                      <RadioCircle selected={isSelected} />
                      <span
                        className={`text-sm truncate ${
                          isSelected ? "font-semibold text-primary" : "text-gray-600"
                        }`}
                      >
                        {marca.nombre}
                      </span>
                      <span className="text-gray-400 text-sm ml-auto shrink-0">
                        ({marca.count})
                      </span>
                    </button>
                  );
                })}
                {filteredMarcas.length === 0 && (
                  <p className="text-xs text-gray-400 px-2 py-2">No se encontraron marcas</p>
                )}
                </div>
              </div>
              );
            })()}
          </div>
          <div className="border-t border-gray-100" />
        </>
      )}

      {/* Tipo */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Tipo</h4>
        <div className="space-y-0.5">
          {[
            { value: "", label: "Todos" },
            { value: "combos", label: "Combos" },
            { value: "precio_actualizado", label: "Precio actualizado" },
          ].map((opt) => {
            const isSelected = tipoFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => updateParams({ tipo: opt.value || null })}
                className={`flex items-center gap-3 py-2 rounded-lg cursor-pointer w-full transition-all border-l-[3px] ${isSelected ? "bg-primary/10 border-primary px-[5px]" : "hover:bg-gray-50 border-transparent px-2"}`}
              >
                <RadioCircle selected={isSelected} />
                <span className={`text-sm ${isSelected ? "font-semibold text-primary" : "text-gray-600"}`}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Disponibilidad */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Disponibilidad</h4>
        <div className="space-y-0.5">
          {[
            { value: "", label: "Todos" },
            { value: "en_stock", label: "En stock" },
            { value: "sin_stock", label: "Sin stock" },
          ].map((opt) => {
            const isSelected = disponibilidad === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => updateParams({ disponibilidad: opt.value || null })}
                className={`flex items-center gap-3 py-2 rounded-lg cursor-pointer w-full transition-all border-l-[3px] ${isSelected ? "bg-primary/10 border-primary px-[5px]" : "hover:bg-gray-50 border-transparent px-2"}`}
              >
                <RadioCircle selected={isSelected} />
                <span className={`text-sm ${isSelected ? "font-semibold text-primary" : "text-gray-600"}`}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Precio */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Precio</h4>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={localPrecioMin}
            onChange={(e) => setLocalPrecioMin(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400"
          />
          <span className="text-gray-300 text-sm shrink-0">a</span>
          <input
            type="number"
            placeholder="Max"
            value={localPrecioMax}
            onChange={(e) => setLocalPrecioMax(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400"
          />
        </div>
        <button
          onClick={() =>
            updateParams({
              precio_min: localPrecioMin || null,
              precio_max: localPrecioMax || null,
            })
          }
          className="mt-2.5 w-full text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 rounded-lg py-2 transition-colors"
        >
          Aplicar
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* ─── Barra de categorías mobile ─── */}
      <div className="md:hidden -mx-4 mb-4 sticky top-[64px] z-30 bg-white border-b border-gray-100 shadow-sm">

        {/* Fila 1: tabs de categorías */}
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {/* Tab "Todas" */}
          <button
            onClick={() => {
              updateParams({ categoria: null, subcategoria: null });
            }}
            className={`flex flex-col items-center gap-1 px-3 py-2.5 shrink-0 border-b-2 transition-colors ${
              !categoriaId ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400"
            }`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              !categoriaId ? "bg-gray-900" : "bg-gray-100"
            }`}>
              <Grid className={`w-3.5 h-3.5 ${!categoriaId ? "text-white" : "text-gray-500"}`} />
            </div>
            <span className="text-[10px] font-medium whitespace-nowrap">Todas</span>
          </button>

          {/* Tabs de categorías */}
          {filtrarCategorias(categorias)
            .filter((c) => (c.count || 0) > 0)
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .map((cat) => {
              const isActive = categoriaId === cat.id;
              const Icon = getCategoryIcon(cat.nombre);
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    updateParams({ categoria: slugify(cat.nombre), subcategoria: null });
                  }}
                  className={`flex flex-col items-center gap-1 px-3 py-2.5 shrink-0 border-b-2 transition-colors ${
                    isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isActive ? "bg-gray-900" : "bg-gray-100"
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-gray-500"}`} />
                  </div>
                  <span className="text-[10px] font-medium whitespace-nowrap">{cat.nombre}</span>
                </button>
              );
            })}
        </div>

        {/* Fila 2: subcategorías como chips horizontales scrolleables */}
        {categoriaId && (() => {
          const activeCat = categorias.find((c) => c.id === categoriaId);
          const catSubs = allSubcategorias
            .filter((s) => s.categoria_id === categoriaId && (s.count || 0) > 0)
            .sort((a, b) => (b.count || 0) - (a.count || 0));

          if (catSubs.length === 0) return null;

          return (
            <div
              className="flex items-center gap-1.5 overflow-x-auto border-t border-gray-100 bg-gray-50/80 px-3 py-2"
              style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as any}
            >
              {/* Chip "Todas" */}
              <button
                onClick={() => updateParams({ subcategoria: null })}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border-[1.5px] whitespace-nowrap ${
                  !subcategoriaId
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-600 border-gray-200 hover:border-primary/40"
                }`}
              >
                Todas · {activeCat?.count || 0}
              </button>

              {/* Chips de subcategorías */}
              {catSubs.map((sub) => {
                const isActive = subcategoriaId === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() =>
                      updateParams({
                        categoria: slugify(activeCat?.nombre || ""),
                        subcategoria: slugify(sub.nombre),
                      })
                    }
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border-[1.5px] whitespace-nowrap ${
                      isActive
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-gray-600 border-gray-200 hover:border-primary/40"
                    }`}
                  >
                    {sub.nombre} · {sub.count}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ─── Breadcrumb ─── */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
        <Link href="/" className="hover:text-primary transition-colors">
          Inicio
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/productos" className="hover:text-primary transition-colors">
          Productos
        </Link>
        {activeCategoryName && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-gray-700 font-medium">{activeCategoryName}</span>
          </>
        )}
      </nav>

      {/* ─── Title row ─── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {activeCategoryName || "Productos"}
          </h1>
          {!loading && (
            <p className="text-sm text-gray-500 mt-1">
              {total} {total === 1 ? "resultado" : "resultados"}
            </p>
          )}
        </div>

        {/* Mobile search bar */}
        <div className="md:hidden w-full relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar productos..."
            defaultValue={searchQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                updateParams({ q: (e.target as HTMLInputElement).value || null });
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Mobile filter button */}
          <button
            onClick={() => setMobileFilters(true)}
            className="md:hidden flex items-center gap-2 text-sm font-medium bg-white border border-gray-200 rounded-xl px-4 py-2.5 hover:border-gray-300 transition-colors relative"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <select
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            className="text-sm bg-white border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent appearance-none cursor-pointer pr-8 font-medium text-gray-700"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            <option value="recientes">Más recientes</option>
            <option value="precio_asc">Menor precio</option>
            <option value="precio_desc">Mayor precio</option>
            <option value="az">A-Z</option>
          </select>

          <div className="hidden sm:flex bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={`p-2.5 transition-colors ${
                view === "grid"
                  ? "bg-primary/5 text-primary"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2.5 transition-colors ${
                view === "list"
                  ? "bg-primary/5 text-primary"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main layout ─── */}
      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-24">
            {sidebarContent}
          </div>
        </aside>

        {/* Mobile filter drawer */}
        {mobileFilters && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setMobileFilters(false)}
            />
            <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-lg text-gray-900">Filtros</h2>
                <button
                  onClick={() => setMobileFilters(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {sidebarContent}
              </div>
              <div className="p-5 border-t border-gray-100">
                <button
                  onClick={() => setMobileFilters(false)}
                  className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  Aplicar Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Products */}
          {loading ? (
            <SkeletonGrid />
          ) : productos.length === 0 ? (
            /* ─── Empty state ─── */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-24 h-24 rounded-full bg-gray-50 flex items-center justify-center mb-6">
                <Package className="h-12 w-12 text-gray-200" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No encontramos productos
              </h3>
              <p className="text-gray-400 mb-6">
                Intenta con otros filtros o terminos de busqueda
              </p>
              <button
                onClick={() => router.push("/productos")}
                className="text-sm font-semibold text-primary bg-primary/5 hover:bg-primary/10 px-6 py-2.5 rounded-xl transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          ) : view === "grid" ? (
            /* ─── Grid view ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {productos.map((producto, idx) => {
                const qty = getQty(producto.id);
                const pres = presentacionesMap[producto.id];
                const activePrice = getActivePrice(producto);
                const onOffer = isOnOffer(producto);
                const availableStock = Math.max(0, producto.stock - (cartUnits[producto.id] || 0));
                const currentPresLabel = pres && pres.length > 1 ? presLabel(pres[selectedPres[producto.id] ?? 0]) : null;
                const disc = getProductDiscount(producto, currentPresLabel, qty);
                const discountedPrice = disc > 0 ? Math.round(activePrice * (1 - disc / 100)) : activePrice;
                // Volume discount hint
                const volHint = (() => {
                  const isCurrentBox = currentPresLabel && currentPresLabel !== "Unidad" && !currentPresLabel.startsWith("Unidad");
                  const isCurrentUnit = !isCurrentBox;
                  for (const d of activeDiscounts) {
                    if (!d.cantidad_minima || d.cantidad_minima <= 0 || qty >= d.cantidad_minima) continue;
                    // Skip if presentation doesn't match current selection
                    if (d.presentacion === "caja" && isCurrentUnit) continue;
                    if (d.presentacion === "unidad" && isCurrentBox) continue;
                    const applies = d.aplica_a === "todos" || (d.aplica_a === "productos" && (d.productos_ids || []).includes(producto.id)) || (d.aplica_a === "categorias" && ((d.categorias_ids || []).includes(producto.categoria_id)));
                    if (!applies) continue;
                    const label = d.presentacion === "caja" ? "cajas" : d.presentacion === "unidad" ? "unidades" : (isCurrentBox ? "cajas" : "unidades");
                    return { minQty: d.cantidad_minima, pct: d.porcentaje, label };
                  }
                  return null;
                })();
                // Auto box discount: if box price < unit price × quantity
                const boxDiscountHint = (() => {
                  if (!pres || pres.length <= 1) return null;
                  const unitPres = pres.find((p: any) => p.cantidad === 1);
                  const boxPres = pres.find((p: any) => p.cantidad > 1);
                  if (!unitPres || !boxPres || !unitPres.precio || !boxPres.precio) return null;
                  const expectedPrice = unitPres.precio * boxPres.cantidad;
                  if (boxPres.precio >= expectedPrice) return null;
                  const savePct = Math.round((1 - boxPres.precio / expectedPrice) * 100);
                  if (savePct < 1) return null;
                  const label = boxPres.nombre || `Caja x${boxPres.cantidad}`;
                  return { pct: savePct, label, boxPrice: boxPres.precio, unitPrice: unitPres.precio, qty: boxPres.cantidad };
                })();
                return (
                  <div
                    key={producto.id}
                    className="group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100/80 flex flex-col"
                  >
                    {/* Image */}
                    <Link href={`/productos/${productSlug(producto.nombre, producto.id)}`} className="relative block">
                      <div className="aspect-[4/3] bg-gradient-to-b from-gray-50 to-white overflow-hidden relative">
                        {producto.imagen_url ? (
                          <Image
                            src={producto.imagen_url}
                            alt={producto.nombre}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            className="object-contain p-5 group-hover:scale-105 transition-transform duration-500 ease-out"
                            {...(idx < 4 ? { priority: true } : { loading: "lazy" as const })}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100">
                            <div className="w-16 h-16 rounded-2xl bg-white/80 flex items-center justify-center shadow-sm">
                              <Package className="h-8 w-8 text-gray-300" />
                            </div>
                            <span className="text-[10px] text-gray-300 font-medium">Sin imagen</span>
                          </div>
                        )}
                      </div>
                      {/* Badge - one per product, priority: combo > discount > box > price change */}
                      {(() => {
                        if (producto.es_combo) return (
                          <span className="absolute top-2.5 left-2.5 bg-gradient-to-r from-primary to-rose-400 text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                            COMBO
                          </span>
                        );
                        if (onOffer && disc === 0) return (
                          <span className="absolute top-2.5 left-2.5 bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">
                            OFERTA
                          </span>
                        );
                        if (disc > 0) return (
                          <span className="absolute top-2.5 left-2.5 bg-primary text-white text-[10px] font-bold px-2.5 py-1 rounded-md">
                            {disc}% OFF
                          </span>
                        );
                        if (disc === 0) {
                          const boxPres = pres?.find((p) => p.cantidad > 1);
                          if (boxPres) {
                            const boxLabel = presLabel(boxPres);
                            const boxDisc = getProductDiscount(producto, boxLabel);
                            if (boxDisc > 0) return (
                              <span className="absolute top-2.5 left-2.5 bg-green-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">
                                {boxDisc}% OFF x caja
                              </span>
                            );
                          }
                        }
                        const pa = producto.precio_anterior;
                        const dateStr = producto.fecha_actualizacion || producto.updated_at;
                        if (pa && pa > 0 && pa !== producto.precio && dateStr &&
                          daysSinceAR(dateStr) <= 3) {
                          if (producto.precio > pa) return (
                            <span className="absolute top-2.5 left-2.5 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">
                              Precio actualizado
                            </span>
                          );
                          return (
                            <span className="absolute top-2.5 left-2.5 bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">
                              Precio rebajado
                            </span>
                          );
                        }
                        // Volume discount hint badge
                        if (volHint) return (
                          <span className="absolute top-2.5 left-2.5 bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">
                            {volHint.pct}% OFF x{volHint.minQty}+ {volHint.label}
                          </span>
                        );
                        // "New" badge
                        if (producto.created_at && daysSinceAR(producto.created_at) <= 7) return (
                          <span className="absolute top-2.5 left-2.5 bg-blue-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">
                            NUEVO
                          </span>
                        );
                        return null;
                      })()}
                      {producto.stock <= 0 ? (
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
                          <span className="bg-white/90 text-gray-500 text-xs font-medium px-3 py-1.5 rounded-lg shadow-sm">Agotado</span>
                        </div>
                      ) : producto.stock > 0 && producto.stock <= 5 && (
                        <span className="absolute bottom-2 right-2 bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-md">
                          {producto.stock < 1 ? `¡Quedan ${producto.stock}!` : producto.stock === 1 ? "¡Última unidad!" : `¡Últimas ${producto.stock}!`}
                        </span>
                      )}
                    </Link>

                    {/* Content */}
                    <div className="flex flex-col flex-1 p-3.5 pt-2.5">
                      <Link href={`/productos/${productSlug(producto.nombre, producto.id)}`} className="flex-1">
                        <h3 className="text-[13px] font-medium text-gray-800 line-clamp-2 leading-snug mb-2 group-hover:text-primary/90 transition-colors">
                          {producto.nombre}
                        </h3>
                      </Link>

                      {/* Price */}
                      <div className="mb-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-gray-900">
                            {disc > 0 ? formatCurrency(discountedPrice) : formatCurrency(activePrice)}
                          </span>
                          {(disc > 0 || onOffer) && (
                            <span className="text-xs text-gray-400 line-through">{formatCurrency(onOffer && disc === 0 ? producto.precio : activePrice)}</span>
                          )}
                        </div>
                        {onOffer && disc === 0 && (
                          <p className="text-[10px] text-orange-600 font-medium">Precio especial</p>
                        )}
                        {(() => {
                          const pa = producto.precio_anterior;
                          const dateStr = producto.fecha_actualizacion || producto.updated_at;
                          if (!pa || pa <= 0 || pa === producto.precio || !dateStr) return null;
                          if (daysSinceAR(dateStr) > 3) return null;
                          if (producto.precio > pa) {
                            return <p className="text-[10px] text-amber-600 font-medium">Precio actualizado</p>;
                          }
                          return <p className="text-[10px] text-green-600 font-medium">Precio rebajado</p>;
                        })()}
                        {volHint && disc === 0 && (
                          <p className="text-[10px] text-orange-600 font-medium mt-0.5">🏷️ {volHint.pct}% OFF x {volHint.minQty}+ {volHint.label}</p>
                        )}
                        {boxDiscountHint && (
                          <p className="text-[10px] text-emerald-600 font-medium mt-0.5">📦 {boxDiscountHint.pct}% OFF por {boxDiscountHint.label}</p>
                        )}
                      </div>

                      {/* Presentacion pills */}
                      {pres && pres.length > 1 && (() => {
                        const activeIdx = selectedPres[producto.id] ?? 0;
                        return (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {pres.map((pr, idx) => ({ pr, idx })).sort((a, b) => {
                            if (a.pr.cantidad === 1 && b.pr.cantidad !== 1) return -1;
                            if (a.pr.cantidad !== 1 && b.pr.cantidad === 1) return 1;
                            return a.pr.cantidad - b.pr.cantidad;
                          }).map(({ pr, idx }) => {
                            const isActive = activeIdx === idx;
                            const label = presLabel(pr);
                            const presDisabled = Math.max(0, Math.floor(availableStock / Math.max(0.01, Number(pr.cantidad)))) <= 0;
                            return (
                              <button
                                key={idx}
                                disabled={presDisabled}
                                onClick={() => {
                                  setSelectedPres((prev) => ({ ...prev, [producto.id]: idx }));
                                  const newMax = Math.max(0, Math.floor(availableStock / Math.max(0.01, Number(pr.cantidad))));
                                  if (qty > newMax) setQuantities((prev) => ({ ...prev, [producto.id]: Math.max(1, newMax) }));
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                                  presDisabled
                                    ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                    : isActive
                                    ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        );
                      })()}

                      {/* Add to cart */}
                      {(() => {
                        const activePres = pres && pres.length > 1 ? pres[selectedPres[producto.id] ?? 0] : null;
                        const presUnits = activePres ? Number(activePres.cantidad) : 1;
                        const maxForPres = availableStock > 0 ? Math.floor(availableStock / presUnits) : 0;
                        const canBuy = maxForPres > 0;
                        return canBuy ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                              <button
                                onClick={() => setQty(producto.id, qty - 1)}
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-7 text-center text-xs font-semibold tabular-nums text-gray-800">{qty}</span>
                              <button
                                onClick={() => setQty(producto.id, Math.min(qty + 1, maxForPres))}
                                disabled={qty >= maxForPres}
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors disabled:opacity-30"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{formatCurrency(discountedPrice * qty)}</span>
                          </div>
                          <button
                            onClick={() => addToCart(producto, qty)}
                            className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-white text-sm py-2.5 rounded-xl font-semibold transition-all shadow-sm shadow-primary/20"
                          >
                            Agregar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 w-full bg-gray-50/80 text-gray-400 text-xs py-2.5 rounded-lg font-medium">
                          Agotado
                        </div>
                      );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── List view ─── */
            <div className="space-y-3">
              {productos.map((producto, idx) => {
                const qty = getQty(producto.id);
                const pres = presentacionesMap[producto.id];
                const activePrice = getActivePrice(producto);
                const availableStock = Math.max(0, producto.stock - (cartUnits[producto.id] || 0));
                const listPresLabel = pres && pres.length > 1 ? presLabel(pres[selectedPres[producto.id] ?? 0]) : null;
                return (
                  <div
                    key={producto.id}
                    className="group bg-white rounded-2xl border border-gray-100/80 overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300 flex gap-0"
                  >
                    <Link
                      href={`/productos/${productSlug(producto.nombre, producto.id)}`}
                      className="relative shrink-0 w-36 h-36 bg-gradient-to-b from-gray-50 to-white overflow-hidden"
                    >
                      {producto.imagen_url ? (
                        <Image
                          src={producto.imagen_url}
                          alt={producto.nombre}
                          fill
                          sizes="144px"
                          className="object-contain p-4 group-hover:scale-105 transition-transform duration-500 ease-out"
                          {...(idx < 2 ? { priority: true } : { loading: "lazy" as const })}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-gray-50 to-gray-100">
                          <div className="w-12 h-12 rounded-xl bg-white/80 flex items-center justify-center shadow-sm">
                            <Package className="h-6 w-6 text-gray-300" />
                          </div>
                        </div>
                      )}
                      {(() => {
                        const d = getProductDiscount(producto, listPresLabel, qty);
                        if (d > 0) return <span className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2.5 py-1 rounded-md">{d}% OFF</span>;
                        const boxPres = pres?.find((p) => p.cantidad > 1);
                        if (!boxPres) return null;
                        const boxLabel = presLabel(boxPres);
                        const boxDisc = getProductDiscount(producto, boxLabel, qty);
                        if (boxDisc <= 0) return null;
                        return <span className="absolute top-2 left-2 bg-green-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">{boxDisc}% OFF x caja</span>;
                      })()}
                    </Link>
                    <div className="flex-1 py-3.5 pr-4 pl-1 flex items-center justify-between gap-4 min-w-0">
                      <div className="min-w-0 flex-1">
                        {(producto.categorias?.nombre || producto.marcas?.nombre || producto.es_combo) && (
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            {producto.es_combo && (
                              <span className="text-[10px] bg-gradient-to-r from-primary to-rose-400 text-white font-bold px-2 py-0.5 rounded-full">
                                COMBO
                              </span>
                            )}
                            {producto.categorias?.nombre && (
                              <span className="text-[10px] text-gray-400 font-medium truncate">
                                {producto.categorias.nombre}
                              </span>
                            )}
                            {producto.marcas?.nombre && (
                              <span className="text-[10px] bg-gray-100 text-gray-500 font-medium px-1.5 py-0.5 rounded">
                                {producto.marcas.nombre}
                              </span>
                            )}
                          </div>
                        )}
                        <Link href={`/productos/${productSlug(producto.nombre, producto.id)}`}>
                          <h3 className="font-medium text-gray-800 line-clamp-2 text-sm leading-snug group-hover:text-primary/90 transition-colors">
                            {producto.nombre}
                          </h3>
                        </Link>
                        {(() => {
                          const d = getProductDiscount(producto, listPresLabel, qty);
                          const dp = d > 0 ? Math.round(activePrice * (1 - d / 100)) : activePrice;
                          return d > 0 ? (
                            <div className="flex items-baseline gap-2 mt-1.5">
                              <span className="text-lg font-bold text-gray-900">{formatCurrency(dp)}</span>
                              <span className="text-xs text-gray-400 line-through">{formatCurrency(activePrice)}</span>
                            </div>
                          ) : (
                            <p className="text-lg font-bold text-gray-900 mt-1.5">{formatCurrency(activePrice)}</p>
                          );
                        })()}
                        {pres && pres.length > 1 && (
                          <div className="flex gap-1.5 mt-2">
                            {pres.map((pr, idx) => ({ pr, idx })).sort((a, b) => {
                              if (a.pr.cantidad === 1 && b.pr.cantidad !== 1) return -1;
                              if (a.pr.cantidad !== 1 && b.pr.cantidad === 1) return 1;
                              return a.pr.cantidad - b.pr.cantidad;
                            }).map(({ pr, idx }) => {
                              const isActive = (selectedPres[producto.id] ?? 0) === idx;
                              const label = presLabel(pr);
                              const presDisabled = Math.max(0, Math.floor(availableStock / Math.max(0.01, Number(pr.cantidad)))) <= 0;
                              return (
                                <button
                                  key={idx}
                                  disabled={presDisabled}
                                  onClick={() => {
                                    setSelectedPres((prev) => ({ ...prev, [producto.id]: idx }));
                                    const newMax = Math.max(0, Math.floor(availableStock / Math.max(0.01, Number(pr.cantidad))));
                                    if (qty > newMax) setQuantities((prev) => ({ ...prev, [producto.id]: Math.max(1, newMax) }));
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                                    presDisabled ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed" :
                                    isActive ? "bg-gray-900 text-white border-gray-900 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {(() => {
                        const activePres = pres && pres.length > 1 ? pres[selectedPres[producto.id] ?? 0] : null;
                        const presUnits = activePres ? Number(activePres.cantidad) : 1;
                        const maxForPres = availableStock > 0 ? Math.floor(availableStock / presUnits) : 0;
                        const canBuy = maxForPres > 0;
                        return canBuy ? (
                        <div className="shrink-0 flex items-center gap-2">
                          <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                            <button onClick={() => setQty(producto.id, qty - 1)} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-semibold tabular-nums text-gray-800">{qty}</span>
                            <button onClick={() => setQty(producto.id, Math.min(qty + 1, maxForPres))} disabled={qty >= maxForPres} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors disabled:opacity-30">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            onClick={() => addToCart(producto, qty)}
                            className="bg-primary hover:bg-primary/90 active:scale-[0.98] text-white text-sm py-2.5 px-5 rounded-xl font-semibold transition-all shadow-sm shadow-primary/20"
                          >
                            Agregar {formatCurrency((() => { const d2 = getProductDiscount(producto, listPresLabel, qty); return d2 > 0 ? Math.round(activePrice * (1 - d2 / 100)) : activePrice; })() * qty)}
                          </button>
                        </div>
                      ) : (
                        <div className="shrink-0 flex items-center gap-1.5 bg-gray-50/80 text-gray-400 text-xs py-2.5 px-5 rounded-lg font-medium">
                          Agotado
                        </div>
                      );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Pagination ─── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) })}
                className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {getPageNumbers(page, totalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="w-10 h-10 flex items-center justify-center text-gray-400 text-sm">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => updateParams({ page: String(p) })}
                    className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      page === p
                        ? "bg-primary text-white shadow-md"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
                className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ProductosPage({ initialData }: { initialData?: InitialProductosData }) {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse mb-6" />
          <div className="flex gap-8">
            <div className="hidden md:block w-72 shrink-0">
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 animate-pulse">
                <div className="h-10 bg-gray-100 rounded-xl" />
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 bg-gray-50 rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1">
              <SkeletonGrid />
            </div>
          </div>
        </div>
      }
    >
      <ProductosContent initialData={initialData} />
    </Suspense>
  );
}
