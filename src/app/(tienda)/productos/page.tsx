"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { showToast } from "@/components/tienda/toast";
import { supabase } from "@/lib/supabase";
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
} from "lucide-react";

const PER_PAGE = 12;

const formatPrice = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

interface Categoria {
  id: string;
  nombre: string;
  count?: number;
  restringida?: boolean;
}

interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
  count?: number;
}

interface Marca {
  id: string;
  nombre: string;
  count?: number;
}

interface Producto {
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

function ProductosContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { filtrarCategorias, permitidas, loaded: permisosLoaded } = useCategoriasPermitidas();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [marcaSearch, setMarcaSearch] = useState("");
  const [allSubcategorias, setAllSubcategorias] = useState<Subcategoria[]>([]);
  const [categoriasCollapsed, setCategoriasCollapsed] = useState(!searchParams.get("categoria"));
  const [marcasCollapsed, setMarcasCollapsed] = useState(!searchParams.get("marca"));
  const [presentacionesMap, setPresentacionesMap] = useState<Record<string, { nombre: string; cantidad: number; precio: number }[]>>({});
  const [activeDiscounts, setActiveDiscounts] = useState<any[]>([]);
  const [selectedPres, setSelectedPres] = useState<Record<string, number>>({}); // productId -> presentacion index
  const [cartUnits, setCartUnits] = useState<Record<string, number>>({}); // productId -> total units in cart
  const [diasOcultarSinStock, setDiasOcultarSinStock] = useState(7);

  // Sync cart units
  useEffect(() => {
    function syncCart() {
      const stored = localStorage.getItem("carrito");
      let carrito: { id: string; cantidad: number }[]; try { carrito = stored ? JSON.parse(stored) : []; } catch { carrito = []; }
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

  // Price inputs local state for "Aplicar" button
  const [localPrecioMin, setLocalPrecioMin] = useState("");
  const [localPrecioMax, setLocalPrecioMax] = useState("");

  // Read filters from URL
  const categoriaId = searchParams.get("categoria");
  const subcategoriaId = searchParams.get("subcategoria");
  const marcaParam = searchParams.get("marca");
  const searchQuery = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "recientes";
  const page = Number(searchParams.get("page") || "1");
  const precioMin = searchParams.get("precio_min") || "";
  const precioMax = searchParams.get("precio_max") || "";
  const disponibilidad = searchParams.get("disponibilidad") || "";
  const tipoFilter = searchParams.get("tipo") || "";

  // Sync local price inputs with URL
  useEffect(() => {
    setLocalPrecioMin(precioMin);
    setLocalPrecioMax(precioMax);
  }, [precioMin, precioMax]);

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

  // Fetch categorias with counts
  useEffect(() => {
    async function load() {
      const { data: cats } = await supabase
        .from("categorias")
        .select("id, nombre, restringida");
      if (!cats) return;

      const { data: prods } = await supabase
        .from("productos")
        .select("categoria_id")
        .eq("activo", true)
        .eq("visibilidad", "visible");

      const countMap: Record<string, number> = {};
      prods?.forEach((p: { categoria_id: string }) => {
        countMap[p.categoria_id] = (countMap[p.categoria_id] || 0) + 1;
      });

      setCategorias(
        cats.map((c: { id: string; nombre: string }) => ({
          ...c,
          count: countMap[c.id] || 0,
        }))
      );
    }
    load();
  }, []);

  // Fetch config for dias_ocultar_sin_stock
  useEffect(() => {
    supabase.from("tienda_config").select("dias_ocultar_sin_stock").limit(1).single().then(({ data }) => {
      if (data?.dias_ocultar_sin_stock != null) setDiasOcultarSinStock(data.dias_ocultar_sin_stock);
    });
  }, []);

  // Fetch ALL subcategorias with counts
  useEffect(() => {
    async function loadSubs() {
      const { data: subs } = await supabase
        .from("subcategorias")
        .select("id, nombre, categoria_id");
      if (!subs) return;

      const { data: prods } = await supabase
        .from("productos")
        .select("subcategoria_id");

      const countMap: Record<string, number> = {};
      prods?.forEach((p: { subcategoria_id: string | null }) => {
        if (p.subcategoria_id) {
          countMap[p.subcategoria_id] = (countMap[p.subcategoria_id] || 0) + 1;
        }
      });

      const subsWithCounts = subs.map((s: { id: string; nombre: string; categoria_id: string }) => ({
        ...s,
        count: countMap[s.id] || 0,
      }));
      setAllSubcategorias(subsWithCounts);
      // Keep old subcategorias for backward compat with filtered subcats
      if (categoriaId) {
        setSubcategorias(subsWithCounts.filter((s: Subcategoria) => s.categoria_id === categoriaId));
      }
    }
    loadSubs();
  }, [categoriaId]);

  // Load active discounts
  useEffect(() => {
    async function loadDiscounts() {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("descuentos")
        .select("*")
        .eq("activo", true)
        .lte("fecha_inicio", today);
      setActiveDiscounts((data || []).filter((d: any) => !d.fecha_fin || d.fecha_fin >= today));
    }
    loadDiscounts();
  }, []);

  function getProductDiscount(producto: Producto, presLabel?: string | null, qty?: number): number {
    let best = 0;
    // If no presLabel provided, treat as "Unidad" (default presentation)
    const effectivePres = presLabel ?? "Unidad";
    const isBox = effectivePres !== "Unidad" && !effectivePres.startsWith("Unidad");
    const isUnit = !isBox;
    for (const d of activeDiscounts) {
      // Skip volume discounts if qty not met
      if (d.cantidad_minima && d.cantidad_minima > 0) {
        if (qty == null || qty < d.cantidad_minima) continue;
      }
      // Check presentation filter
      if (d.presentacion === "unidad" && isBox) continue;
      if (d.presentacion === "caja" && isUnit) continue;
      if (d.aplica_a === "todos") {
        best = Math.max(best, Number(d.porcentaje));
      } else if (d.aplica_a === "categorias") {
        const ids: string[] = d.categorias_ids || [];
        if (ids.includes(producto.categoria_id) || (producto.subcategoria_id && ids.includes(producto.subcategoria_id))) {
          best = Math.max(best, Number(d.porcentaje));
        }
      } else if (d.aplica_a === "subcategorias") {
        const subIds: string[] = d.subcategorias_ids || [];
        if (producto.subcategoria_id && subIds.includes(producto.subcategoria_id)) {
          best = Math.max(best, Number(d.porcentaje));
        }
      } else if (d.aplica_a === "productos") {
        const ids: string[] = d.productos_ids || [];
        if (ids.includes(producto.id)) {
          best = Math.max(best, Number(d.porcentaje));
        }
      }
    }
    return best;
  }

  // Auto-expand selected category
  useEffect(() => {
    if (categoriaId) {
      setExpandedCats((prev) => {
        const next = new Set(prev);
        next.add(categoriaId);
        return next;
      });
    }
  }, [categoriaId]);

  // Fetch marcas with counts
  useEffect(() => {
    async function loadMarcas() {
      const { data: marcasList } = await supabase
        .from("marcas")
        .select("id, nombre");
      if (!marcasList) return;

      const { data: prods } = await supabase
        .from("productos")
        .select("marca_id")
        .eq("activo", true)
        .eq("visibilidad", "visible");

      const countMap: Record<string, number> = {};
      prods?.forEach((p: { marca_id: string | null }) => {
        if (p.marca_id) {
          countMap[p.marca_id] = (countMap[p.marca_id] || 0) + 1;
        }
      });

      setMarcas(
        marcasList.map((m: { id: string; nombre: string }) => ({
          ...m,
          count: countMap[m.id] || 0,
        }))
      );
    }
    loadMarcas();
  }, []);

  // Fetch products
  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from("productos")
        .select("*, categorias(nombre), marcas(nombre)", { count: "exact" });

      query = query.eq("activo", true).eq("visibilidad", "visible");

      // Exclude restricted categories the client can't access
      const restrictedIds = categorias
        .filter((c) => c.restringida && !(permitidas || []).includes(c.id))
        .map((c) => c.id);
      if (restrictedIds.length > 0 && !categoriaId) {
        for (const rid of restrictedIds) {
          query = query.neq("categoria_id", rid);
        }
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
      if (disponibilidad !== "sin_stock" && diasOcultarSinStock > 0) {
        const cutoff = new Date(Date.now() - diasOcultarSinStock * 24 * 60 * 60 * 1000).toISOString();
        query = query.or(`stock.gt.0,updated_at.gt.${cutoff}`);
      }
      if (disponibilidad === "en_stock") query = query.gt("stock", 0);
      if (disponibilidad === "sin_stock") query = query.eq("stock", 0);
      if (tipoFilter === "combos") query = query.eq("es_combo", true);
      if (tipoFilter === "precio_actualizado") {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
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
      const prods = (data as Producto[]) || [];

      // Compute effective stock for combo products from their components
      const comboProds = prods.filter((p) => p.es_combo);
      if (comboProds.length > 0) {
        const comboIds = comboProds.map((p) => p.id);
        const { data: comboItems } = await supabase
          .from("combo_items")
          .select("combo_id, cantidad, productos!combo_items_producto_id_fkey(stock)")
          .in("combo_id", comboIds);
        const comboStockMap: Record<string, number> = {};
        for (const ci of (comboItems || []) as any[]) {
          const compStock = ci.productos?.stock ?? 0;
          const maxFromComp = Math.floor(compStock / (ci.cantidad || 1));
          comboStockMap[ci.combo_id] = ci.combo_id in comboStockMap
            ? Math.min(comboStockMap[ci.combo_id], maxFromComp)
            : maxFromComp;
        }
        for (const p of prods) {
          if (p.es_combo && p.id in comboStockMap) {
            p.stock = comboStockMap[p.id];
          }
        }
      }

      setProductos(prods);
      setTotal(count || 0);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId, subcategoriaId, marcaParam, searchQuery, sort, page, precioMin, precioMax, disponibilidad, tipoFilter, permitidas, categorias, diasOcultarSinStock]);

  // Fetch presentaciones for displayed products
  useEffect(() => {
    async function loadPresentaciones() {
      if (productos.length === 0) { setPresentacionesMap({}); return; }
      const ids = productos.map((p) => p.id);
      const { data } = await supabase
        .from("presentaciones")
        .select("producto_id, nombre, cantidad, precio")
        .in("producto_id", ids)
        .order("cantidad");
      const map: Record<string, { nombre: string; cantidad: number; precio: number }[]> = {};
      (data || []).forEach((pr: { producto_id: string; nombre: string; cantidad: number; precio: number }) => {
        if (!map[pr.producto_id]) map[pr.producto_id] = [];
        map[pr.producto_id].push({ nombre: pr.nombre, cantidad: pr.cantidad, precio: pr.precio });
      });
      setPresentacionesMap(map);
      // Default Mt/Medio Cartón products to "Unidad" presentation
      const defaults: Record<string, number> = {};
      for (const [prodId, pres] of Object.entries(map)) {
        const hasMedio = pres.some((p) => p.cantidad <= 0.5 || p.nombre.toLowerCase().includes("medio"));
        if (hasMedio) {
          const unitIdx = pres.findIndex((p) => p.cantidad === 1);
          if (unitIdx >= 0) defaults[prodId] = unitIdx;
        }
      }
      if (Object.keys(defaults).length > 0) {
        setSelectedPres((prev) => ({ ...defaults, ...prev }));
      }
    }
    loadPresentaciones();
  }, [productos]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const activeCategoryName = categorias.find(
    (c) => c.id === categoriaId
  )?.nombre;

  const [quantities, setQuantities] = useState<Record<string, number>>({});

  function getQty(id: string) {
    return quantities[id] ?? 1;
  }

  function setQty(id: string, val: number) {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, val) }));
  }

  function getActivePrice(producto: Producto) {
    const pres = presentacionesMap[producto.id];
    if (pres && pres.length > 1) {
      const idx = selectedPres[producto.id] ?? 0;
      const p = pres[idx];
      if (p) {
        // If presentacion price seems like unit price (same as base), multiply by cantidad
        if (p.precio > 0 && p.cantidad > 1 && p.precio === producto.precio) {
          return p.precio * p.cantidad;
        }
        return p.precio > 0 ? p.precio : producto.precio * Math.max(1, p.cantidad);
      }
      return producto.precio;
    }
    return producto.precio;
  }

  function presLabel(p: { cantidad: number; nombre?: string }): string {
    if (p.cantidad === 1) return "Unidad";
    if (p.cantidad <= 0.5 || (p.nombre && p.nombre.toLowerCase().includes("medio"))) return "Medio Cartón";
    return `Caja (x${p.cantidad})`;
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
    let carrito: any[]; try { carrito = stored ? JSON.parse(stored) : []; } catch { carrito = []; }
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

  function selectMarca(marcaId: string) {
    const isSame = marcaParam === marcaId;
    updateParams({ marca: isSame ? null : String(marcaId) });
  }

  /* ───── Active filter count ───── */
  const activeFilterCount =
    (categoriaId ? 1 : 0) +
    (subcategoriaId ? 1 : 0) +
    (marcaParam ? 1 : 0) +
    (precioMin ? 1 : 0) +
    (precioMax ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    (disponibilidad ? 1 : 0) +
    (tipoFilter ? 1 : 0);

  const activeSubcategoryName = allSubcategorias.find(
    (s) => s.id === subcategoriaId
  )?.nombre;

  function toggleExpand(catId: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  /* ───── Custom radio component ───── */
  const RadioCircle = ({ selected }: { selected: boolean }) => (
    <span
      className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
        selected ? "border-pink-600" : "border-gray-300"
      }`}
    >
      {selected && <span className="w-2.5 h-2.5 rounded-full bg-pink-600" />}
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
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-50 text-pink-600 rounded-full px-3 py-1.5">
                {activeCategoryName}
                <button
                  onClick={() => updateParams({ categoria: null, subcategoria: null })}
                  className="hover:bg-pink-100 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {subcategoriaId && activeSubcategoryName && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-50 text-pink-600 rounded-full px-3 py-1.5">
                {activeSubcategoryName}
                <button
                  onClick={() => updateParams({ subcategoria: null })}
                  className="hover:bg-pink-100 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {marcaParam && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-50 text-pink-600 rounded-full px-3 py-1.5">
                {marcas.find((m) => m.id === marcaParam)?.nombre || "Marca"}
                <button
                  onClick={() => updateParams({ marca: null })}
                  className="hover:bg-pink-100 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {(precioMin || precioMax) && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-50 text-pink-600 rounded-full px-3 py-1.5">
                Precio{precioMin ? ` desde ${formatPrice(Number(precioMin))}` : ""}{precioMax ? ` hasta ${formatPrice(Number(precioMax))}` : ""}
                <button
                  onClick={() => updateParams({ precio_min: null, precio_max: null })}
                  className="hover:bg-pink-100 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {tipoFilter && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-50 text-pink-600 rounded-full px-3 py-1.5">
                {tipoFilter === "combos" ? "Combos" : "Precio actualizado"}
                <button
                  onClick={() => updateParams({ tipo: null })}
                  className="hover:bg-pink-100 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {disponibilidad && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-50 text-pink-600 rounded-full px-3 py-1.5">
                {disponibilidad === "en_stock" ? "En stock" : "Sin stock"}
                <button
                  onClick={() => updateParams({ disponibilidad: null })}
                  className="hover:bg-pink-100 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-50 text-pink-600 rounded-full px-3 py-1.5">
                &quot;{searchQuery}&quot;
                <button
                  onClick={() => updateParams({ q: null })}
                  className="hover:bg-pink-100 rounded-full p-0.5 transition-colors"
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
              if (e.key === "Enter")
                updateParams({ q: (e.target as HTMLInputElement).value || null });
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="border-t border-gray-100" />

      {/* Categorias - Tree style */}
      <div>
        <button
          onClick={() => setCategoriasCollapsed(!categoriasCollapsed)}
          className="flex items-center justify-between w-full mb-3"
        >
          <div className="flex items-center gap-2">
            <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
              Categorias
            </h4>
            <span className="text-[10px] bg-gray-100 text-gray-400 rounded-full px-1.5 py-0.5 font-medium">
              {categorias.filter((c) => (c.count || 0) > 0).length}
            </span>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
              categoriasCollapsed ? "-rotate-90" : ""
            }`}
          />
        </button>

        {!categoriasCollapsed && (
          <div className="space-y-0.5">
            {/* "Todas" option */}
            <button
              onClick={() => updateParams({ categoria: null, subcategoria: null })}
              className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer w-full transition-colors"
            >
              <RadioCircle selected={!categoriaId} />
              <span className={`text-sm ${!categoriaId ? "font-semibold text-pink-600" : "text-gray-600"}`}>
                Todas
              </span>
              <span className="text-gray-400 text-sm ml-auto">
                ({categorias.reduce((sum, c) => sum + (c.count || 0), 0)})
              </span>
            </button>

            <div className="max-h-[300px] overflow-y-auto space-y-0.5">
            {filtrarCategorias(categorias).filter((c) => (c.count || 0) > 0).map((cat) => {
              const isSelected = categoriaId === cat.id;
              const isExpanded = expandedCats.has(cat.id);
              const catSubs = allSubcategorias.filter(
                (s) => s.categoria_id === cat.id
              );
              const hasSubcats = catSubs.length > 0;

              return (
                <div key={cat.id}>
                  <div className="flex items-center gap-1 w-full">
                    {/* Expand chevron */}
                    {hasSubcats ? (
                      <button
                        onClick={() => toggleExpand(cat.id)}
                        className="p-1 rounded hover:bg-gray-100 transition-colors shrink-0"
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                      </button>
                    ) : (
                      <span className="w-[26px] shrink-0" />
                    )}

                    {/* Category row */}
                    <button
                      onClick={() => {
                        updateParams({
                          categoria: String(cat.id),
                          subcategoria: null,
                        });
                        if (hasSubcats && !isExpanded) {
                          toggleExpand(cat.id);
                        }
                      }}
                      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer flex-1 min-w-0 transition-colors"
                    >
                      <RadioCircle selected={isSelected} />
                      <span
                        className={`text-sm truncate ${
                          isSelected ? "font-semibold text-pink-600" : "text-gray-600"
                        }`}
                      >
                        {cat.nombre}
                      </span>
                      <span className="text-gray-400 text-sm ml-auto shrink-0">
                        ({cat.count})
                      </span>
                    </button>
                  </div>

                  {/* Subcategories */}
                  {isExpanded && hasSubcats && (
                    <div className="ml-8 space-y-0.5">
                      {catSubs.map((sub) => {
                        const subSelected = subcategoriaId === sub.id;
                        return (
                          <button
                            key={sub.id}
                            onClick={() =>
                              updateParams({
                                categoria: String(cat.id),
                                subcategoria: String(sub.id),
                              })
                            }
                            className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer w-full transition-colors"
                          >
                            <RadioCircle selected={subSelected} />
                            <span
                              className={`text-sm truncate ${
                                subSelected
                                  ? "font-semibold text-pink-600"
                                  : "text-gray-500"
                              }`}
                            >
                              {sub.nombre}
                            </span>
                            <span className="text-gray-400 text-sm ml-auto shrink-0">
                              ({sub.count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            </div>

          </div>
        )}
      </div>

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
              const marcasConStock = marcas.filter((m) => (m.count || 0) > 0);
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
                  className="w-full px-3 py-1.5 rounded-lg bg-gray-50 border-0 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 placeholder:text-gray-400 mb-1"
                />
                {!marcaSearch && (
                <button
                  onClick={() => updateParams({ marca: null })}
                  className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer w-full transition-colors"
                >
                  <RadioCircle selected={!marcaParam} />
                  <span className={`text-sm ${!marcaParam ? "font-semibold text-pink-600" : "text-gray-600"}`}>
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
                      onClick={() => selectMarca(marca.id)}
                      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer w-full transition-colors"
                    >
                      <RadioCircle selected={isSelected} />
                      <span
                        className={`text-sm truncate ${
                          isSelected ? "font-semibold text-pink-600" : "text-gray-600"
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
                className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer w-full transition-colors"
              >
                <RadioCircle selected={isSelected} />
                <span className={`text-sm ${isSelected ? "font-semibold text-pink-600" : "text-gray-600"}`}>
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
                className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer w-full transition-colors"
              >
                <RadioCircle selected={isSelected} />
                <span className={`text-sm ${isSelected ? "font-semibold text-pink-600" : "text-gray-600"}`}>
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
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 placeholder:text-gray-400"
          />
          <span className="text-gray-300 text-sm shrink-0">a</span>
          <input
            type="number"
            placeholder="Max"
            value={localPrecioMax}
            onChange={(e) => setLocalPrecioMax(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 placeholder:text-gray-400"
          />
        </div>
        <button
          onClick={() =>
            updateParams({
              precio_min: localPrecioMin || null,
              precio_max: localPrecioMax || null,
            })
          }
          className="mt-2.5 w-full text-xs font-semibold text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-lg py-2 transition-colors"
        >
          Aplicar
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* ─── Breadcrumb ─── */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6">
        <Link href="/" className="hover:text-pink-600 transition-colors">
          Inicio
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/productos" className="hover:text-pink-600 transition-colors">
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
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 placeholder:text-gray-400"
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
              <span className="absolute -top-1.5 -right-1.5 bg-pink-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <select
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            className="text-sm bg-white border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent appearance-none cursor-pointer pr-8 font-medium text-gray-700"
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
                  ? "bg-pink-50 text-pink-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2.5 transition-colors ${
                view === "list"
                  ? "bg-pink-50 text-pink-600"
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
                  className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 rounded-xl transition-colors"
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
                className="text-sm font-semibold text-pink-600 bg-pink-50 hover:bg-pink-100 px-6 py-2.5 rounded-xl transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          ) : view === "grid" ? (
            /* ─── Grid view ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {productos.map((producto) => {
                const qty = getQty(producto.id);
                const pres = presentacionesMap[producto.id];
                const activePrice = pres && pres.length > 1 ? (pres[selectedPres[producto.id] ?? 0]?.precio ?? producto.precio) : producto.precio;
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
                  const label = boxPres.nombre?.toLowerCase().includes("medio") ? "Medio Cartón" : `Caja x${boxPres.cantidad}`;
                  return { pct: savePct, label, boxPrice: boxPres.precio, unitPrice: unitPres.precio, qty: boxPres.cantidad };
                })();
                return (
                  <div
                    key={producto.id}
                    className="group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100/80 flex flex-col"
                  >
                    {/* Image */}
                    <Link href={`/productos/${producto.id}`} className="relative block">
                      <div className="aspect-[4/3] bg-gradient-to-b from-gray-50 to-white overflow-hidden">
                        {producto.imagen_url ? (
                          <img
                            src={producto.imagen_url}
                            alt={producto.nombre}
                            className="w-full h-full object-contain p-5 group-hover:scale-105 transition-transform duration-500 ease-out"
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
                      {/* Badge - one per product, priority: discount > box > price change */}
                      {(() => {
                        if (disc > 0) return (
                          <span className="absolute top-2.5 left-2.5 bg-pink-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">
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
                          (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24) <= 3) {
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
                        if (producto.created_at && (Date.now() - new Date(producto.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000) return (
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
                          {producto.stock === 1 ? "¡Última unidad!" : `¡Últimas ${producto.stock}!`}
                        </span>
                      )}
                    </Link>

                    {/* Content */}
                    <div className="flex flex-col flex-1 p-3.5 pt-2.5">
                      <Link href={`/productos/${producto.id}`} className="flex-1">
                        <h3 className="text-[13px] font-medium text-gray-800 line-clamp-2 leading-snug mb-2 group-hover:text-pink-700 transition-colors">
                          {producto.nombre}
                        </h3>
                      </Link>

                      {/* Price */}
                      <div className="mb-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-gray-900">
                            {disc > 0 ? formatPrice(discountedPrice) : formatPrice(activePrice)}
                          </span>
                          {disc > 0 && (
                            <span className="text-xs text-gray-400 line-through">{formatPrice(activePrice)}</span>
                          )}
                        </div>
                        {(() => {
                          const pa = producto.precio_anterior;
                          const dateStr = producto.fecha_actualizacion || producto.updated_at;
                          if (!pa || pa <= 0 || pa === producto.precio || !dateStr) return null;
                          if ((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24) > 3) return null;
                          if (producto.precio > pa) {
                            return <p className="text-[10px] text-amber-600 font-medium">Precio actualizado</p>;
                          }
                          return <p className="text-[10px] text-green-600 font-medium">Precio rebajado</p>;
                        })()}
                        {volHint && disc === 0 && (
                          <p className="text-[10px] text-orange-600 font-medium mt-0.5">🏷️ {volHint.pct}% OFF x {volHint.minQty}+ {volHint.label}</p>
                        )}
                        {boxDiscountHint && !volHint && (
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
                            const label = pr.cantidad === 1 ? "Unidad" : (pr.cantidad <= 0.5 || (pr.nombre && pr.nombre.toLowerCase().includes("medio"))) ? "Medio Cartón" : `Caja x${pr.cantidad}`;
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
                        const maxForPres = availableStock > 0 ? Math.max(1, Math.floor(availableStock / presUnits)) : 0;
                        const canBuy = availableStock > 0;
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
                            <span className="text-sm font-bold text-gray-900">{formatPrice(discountedPrice * qty)}</span>
                          </div>
                          <button
                            onClick={() => addToCart(producto, qty)}
                            className="w-full bg-pink-600 hover:bg-pink-700 active:scale-[0.98] text-white text-sm py-2.5 rounded-xl font-semibold transition-all shadow-sm shadow-pink-600/20"
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
              {productos.map((producto) => {
                const qty = getQty(producto.id);
                const pres = presentacionesMap[producto.id];
                const activePrice = pres && pres.length > 1 ? (pres[selectedPres[producto.id] ?? 0]?.precio ?? producto.precio) : producto.precio;
                const availableStock = Math.max(0, producto.stock - (cartUnits[producto.id] || 0));
                const listPresLabel = pres && pres.length > 1 ? presLabel(pres[selectedPres[producto.id] ?? 0]) : null;
                return (
                  <div
                    key={producto.id}
                    className="group bg-white rounded-2xl border border-gray-100/80 overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300 flex gap-0"
                  >
                    <Link
                      href={`/productos/${producto.id}`}
                      className="relative shrink-0 w-36 h-36 bg-gradient-to-b from-gray-50 to-white overflow-hidden"
                    >
                      {producto.imagen_url ? (
                        <img
                          src={producto.imagen_url}
                          alt={producto.nombre}
                          className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500 ease-out"
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
                        if (d > 0) return <span className="absolute top-2 left-2 bg-pink-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md">{d}% OFF</span>;
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
                              <span className="text-[10px] bg-pink-100 text-pink-700 font-semibold px-1.5 py-0.5 rounded">
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
                        <Link href={`/productos/${producto.id}`}>
                          <h3 className="font-medium text-gray-800 line-clamp-2 text-sm leading-snug group-hover:text-pink-700 transition-colors">
                            {producto.nombre}
                          </h3>
                        </Link>
                        {(() => {
                          const d = getProductDiscount(producto, listPresLabel, qty);
                          const dp = d > 0 ? Math.round(activePrice * (1 - d / 100)) : activePrice;
                          return d > 0 ? (
                            <div className="flex items-baseline gap-2 mt-1.5">
                              <span className="text-lg font-bold text-gray-900">{formatPrice(dp)}</span>
                              <span className="text-xs text-gray-400 line-through">{formatPrice(activePrice)}</span>
                            </div>
                          ) : (
                            <p className="text-lg font-bold text-gray-900 mt-1.5">{formatPrice(activePrice)}</p>
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
                              const label = pr.cantidad === 1 ? "Unidad" : (pr.cantidad <= 0.5 || (pr.nombre && pr.nombre.toLowerCase().includes("medio"))) ? "Medio Cartón" : `Caja x${pr.cantidad}`;
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
                        const maxForPres = availableStock > 0 ? Math.max(1, Math.floor(availableStock / presUnits)) : 0;
                        const canBuy = availableStock > 0;
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
                            className="bg-pink-600 hover:bg-pink-700 active:scale-[0.98] text-white text-sm py-2.5 px-5 rounded-xl font-semibold transition-all shadow-sm shadow-pink-600/20"
                          >
                            Agregar {formatPrice((() => { const d2 = getProductDiscount(producto, listPresLabel, qty); return d2 > 0 ? Math.round(activePrice * (1 - d2 / 100)) : activePrice; })() * qty)}
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
                        ? "bg-pink-600 text-white shadow-md"
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

export default function ProductosPage() {
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
      <ProductosContent />
    </Suspense>
  );
}
