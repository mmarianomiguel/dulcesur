"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Package, TrendingDown, ChevronLeft, ChevronRight,
  Minus, Plus, X, Clock, Tag, SlidersHorizontal,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { productSlug, slugify } from "@/lib/utils";
import { showToast } from "@/components/tienda/toast";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";

const PER_PAGE = 24;

interface Descuento {
  id: string;
  nombre: string;
  porcentaje: number;
  aplica_a: string;
  presentacion: string;
  cantidad_minima: number | null;
  fecha_fin: string | null;
  productos_ids: string[] | null;
  categorias_ids: string[] | null;
  subcategorias_ids: string[] | null;
  marcas_ids: string[] | null;
  clientes_ids: string[] | null;
  excluir_combos: boolean;
  productos_excluidos_ids: string[] | null;
  tipo_descuento: string | null;
  precio_fijo: number | null;
}

interface ProductoConDescuento {
  id: string;
  nombre: string;
  precio: number;
  precio_oferta?: number | null;
  precio_oferta_hasta?: string | null;
  imagen_url: string | null;
  stock: number;
  es_combo?: boolean;
  categoria_id: string;
  subcategoria_id?: string | null;
  marca_id?: string | null;
  categorias?: { id: string; nombre: string; restringida?: boolean } | null;
  precioFinal: number;
  descuentoPct: number;
  ahorro: number;
  descuentoId: string;
  descuentoNombre: string;
  esExclusivo: boolean;
  esPorCantidad: boolean;
  cantidadMinima?: number | null;
  fechaFin?: string | null;
  esComboProd: boolean;
  presentaciones?: { nombre: string; cantidad: number; precio: number }[];
  presIndexConDescuento?: number;
}

// Formatea fecha dd/mm
function formatFechaFin(fechaFin: string): string {
  const [y, m, d] = fechaFin.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

// Días hasta fecha_fin en timezone AR
function diasHasta(fechaFin: string): number {
  const [y, m, d] = fechaFin.split("-").map(Number);
  const fin = new Date(y, m - 1, d);
  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  hoy.setHours(0, 0, 0, 0);
  return Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

interface OfertasClientProps {
  initialProductos: any[];
  initialDescuentos: any[];
  initialPresentaciones: any[];
}

export default function OfertasClient({ initialProductos, initialDescuentos, initialPresentaciones }: OfertasClientProps) {
  const [allProductos, setAllProductos] = useState<ProductoConDescuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filtroDescuento, setFiltroDescuento] = useState<string>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [ordenar, setOrdenar] = useState<"descuento" | "ahorro" | "precio_asc" | "precio_desc">("descuento");
  const [descuentosDisponibles, setDescuentosDisponibles] = useState<{ id: string; nombre: string; count: number }[]>([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState<{ id: string; nombre: string; count: number }[]>([]);
  const [selectedPres, setSelectedPres] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartUnits, setCartUnits] = useState<Record<string, number>>({});
  const [filtroOpen, setFiltroOpen] = useState(false);
  const [countdown, setCountdown] = useState<{ h: string; m: string; s: string } | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { filtrarCategorias } = useCategoriasPermitidas();

  // Sync cart
  useEffect(() => {
    function syncCart() {
      try {
        const stored = localStorage.getItem("carrito");
        const carrito = stored ? JSON.parse(stored) : [];
        const map: Record<string, number> = {};
        (Array.isArray(carrito) ? carrito : []).forEach((item: any) => {
          const prodId = item.id.split("_")[0];
          map[prodId] = (map[prodId] || 0) + (item.cantidad || 0) * (item.unidades_por_presentacion || 1);
        });
        setCartUnits(map);
      } catch {}
    }
    syncCart();
    window.addEventListener("cart-updated", syncCart);
    return () => window.removeEventListener("cart-updated", syncCart);
  }, []);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().split("T")[0];
      let clienteId: string | null = null;
      try {
        const raw = localStorage.getItem("cliente_auth");
        if (raw) {
          const p = JSON.parse(raw);
          if (p?.id) {
            const { data: authRec } = await supabase
              .from("clientes_auth")
              .select("cliente_id")
              .eq("id", p.id)
              .single();
            if (authRec?.cliente_id) clienteId = authRec.cliente_id;
          }
        }
      } catch {}

      const allDesc = initialDescuentos as Descuento[];
      const allProds = initialProductos;
      const allPres = initialPresentaciones;

      const presMap: Record<string, { nombre: string; cantidad: number; precio: number }[]> = {};
      for (const pr of allPres) {
        if (!presMap[pr.producto_id]) presMap[pr.producto_id] = [];
        presMap[pr.producto_id].push({ nombre: pr.nombre, cantidad: pr.cantidad, precio: pr.precio });
      }

      const resultado: ProductoConDescuento[] = [];

      for (const prod of allProds) {
        let mejorPct = 0;
        let precioFinal = prod.precio;
        let descId = "";
        let descNombre = "";
        let esExclusivo = false;
        let cantMinima: number | null = null;
        let fechaFin: string | null = null;

        // A) precio_oferta vigente
        if (prod.precio_oferta && prod.precio_oferta > 0 && prod.precio_oferta < prod.precio && (!prod.precio_oferta_hasta || prod.precio_oferta_hasta >= today)) {
          const pct = Math.round(((prod.precio - prod.precio_oferta) / prod.precio) * 100);
          if (pct > mejorPct) {
            mejorPct = pct;
            precioFinal = prod.precio_oferta;
            descId = "precio_oferta";
            descNombre = "Precio especial";
            fechaFin = prod.precio_oferta_hasta ?? null;
          }
        }

        // B) Descuentos generales y exclusivos por cliente
        for (const d of allDesc) {
          if (d.presentacion === "caja" && (!d.clientes_ids || d.clientes_ids.length === 0)) continue;
          if (d.clientes_ids && d.clientes_ids.length > 0 && (!clienteId || !d.clientes_ids.includes(clienteId))) continue;
          if (d.excluir_combos && prod.es_combo) continue;
          if (d.productos_excluidos_ids?.includes(prod.id)) continue;

          let aplica = false;
          if (d.aplica_a === "todos") aplica = true;
          else if (d.aplica_a === "productos") aplica = (d.productos_ids || []).includes(prod.id);
          else if (d.aplica_a === "categorias") aplica = (d.categorias_ids || []).includes(prod.categoria_id) || (!!prod.subcategoria_id && (d.categorias_ids || []).includes(prod.subcategoria_id));
          else if (d.aplica_a === "subcategorias") aplica = !!prod.subcategoria_id && (d.subcategorias_ids || []).includes(prod.subcategoria_id);
          else if (d.aplica_a === "marcas") aplica = !!prod.marca_id && (d.marcas_ids || []).includes(prod.marca_id);
          if (!aplica) continue;

          // Precio fijo: usar directamente sin convertir a porcentaje
          if (d.tipo_descuento === "precio_fijo" && d.precio_fijo != null && d.precio_fijo > 0) {
            const precioFijo = d.precio_fijo;
            const savePct = prod.precio > 0
              ? Math.round(((prod.precio - precioFijo) / prod.precio) * 100)
              : 0;
            if (savePct > mejorPct) {
              mejorPct = savePct;
              precioFinal = precioFijo;
              descId = d.id;
              descNombre = d.nombre;
              esExclusivo = !!(d.clientes_ids && d.clientes_ids.length > 0);
              cantMinima = d.cantidad_minima ?? null;
              fechaFin = d.fecha_fin ?? null;
            }
            continue;
          }

          let pct = Number(d.porcentaje);

          if (d.presentacion === "caja") {
            const sortedPresB = [...(presMap[prod.id] || [])].sort((a, b) => a.cantidad - b.cantidad);
            const boxPresB = sortedPresB.find((p) => p.cantidad > 1);
            const boxIdxB = sortedPresB.findIndex((p) => p.cantidad > 1);
            if (!boxPresB) continue;
            const precioConDesc = Math.round(boxPresB.precio * (1 - pct / 100));
            const unitPresB = sortedPresB.find((p) => p.cantidad === 1);
            const precioUnitRef = (unitPresB?.precio || prod.precio) * boxPresB.cantidad;
            const savePct = precioUnitRef > 0 ? Math.round((1 - precioConDesc / precioUnitRef) * 100) : pct;
            if (savePct > mejorPct) {
              mejorPct = savePct; precioFinal = precioConDesc; descId = d.id; descNombre = d.nombre;
              esExclusivo = true; cantMinima = null; fechaFin = d.fecha_fin ?? null;
              Object.assign(prod, { _presIndexConDescuento: boxIdxB });
            }
            continue;
          }

          if (pct > mejorPct) {
            mejorPct = pct;
            precioFinal = Math.round(prod.precio * (1 - pct / 100));
            descId = d.id; descNombre = d.nombre;
            esExclusivo = !!(d.clientes_ids && d.clientes_ids.length > 0);
            cantMinima = d.cantidad_minima ?? null;
            fechaFin = d.fecha_fin ?? null;
          }
        }

        // C) Descuentos sobre presentación mayor sin cliente
        {
          const sortedPres = [...(presMap[prod.id] || [])].sort((a, b) => a.cantidad - b.cantidad);
          const unitPres = sortedPres.find((p) => p.cantidad === 1);
          const boxPres = sortedPres.find((p) => p.cantidad > 1);
          const boxIdx = sortedPres.findIndex((p) => p.cantidad > 1);

          // C1) Descuento implícito: precio caja < precio unitario × cantidad
          if (unitPres && boxPres && unitPres.precio > 0 && boxPres.precio > 0) {
            const expectedPrice = unitPres.precio * boxPres.cantidad;
            if (boxPres.precio < expectedPrice) {
              const savePct = Math.round((1 - boxPres.precio / expectedPrice) * 100);
              if (savePct >= 1 && savePct > mejorPct) {
                mejorPct = savePct; precioFinal = boxPres.precio;
                descId = "por_caja"; descNombre = "Precio especial por caja";
                fechaFin = null;
                Object.assign(prod, { _presIndexConDescuento: boxIdx });
              }
            }
          }

          // C2) Descuentos de tabla con presentacion="caja" sin cliente específico
          for (const d of allDesc) {
            if (d.presentacion !== "caja") continue;
            if (d.clientes_ids && d.clientes_ids.length > 0) continue;
            if (d.cantidad_minima && d.cantidad_minima > 0) continue;
            if (d.excluir_combos && prod.es_combo) continue;
            if ((d.productos_excluidos_ids || []).includes(prod.id)) continue;

            // El producto DEBE tener una presentación mayor para que aplique
            if (!boxPres) continue;

            let aplica = false;
            if (d.aplica_a === "todos") aplica = true;
            else if (d.aplica_a === "productos") aplica = (d.productos_ids || []).includes(prod.id);
            else if (d.aplica_a === "categorias") aplica = (d.categorias_ids || []).includes(prod.categoria_id) || (!!prod.subcategoria_id && (d.categorias_ids || []).includes(prod.subcategoria_id));
            else if (d.aplica_a === "subcategorias") aplica = !!prod.subcategoria_id && (d.subcategorias_ids || []).includes(prod.subcategoria_id);
            else if (d.aplica_a === "marcas") aplica = !!prod.marca_id && (d.marcas_ids || []).includes(prod.marca_id);
            if (!aplica) continue;

            const pct = Number(d.porcentaje);
            // Aplicar descuento sobre el precio de la presentación mayor
            const precioBase = boxPres.precio > 0 ? boxPres.precio : prod.precio * boxPres.cantidad;
            const precioConDesc = Math.round(precioBase * (1 - pct / 100));
            // Calcular ahorro real vs comprar unidades sueltas
            const precioUnitRef = (unitPres?.precio || prod.precio) * boxPres.cantidad;
            const savePct = precioUnitRef > 0
              ? Math.round((1 - precioConDesc / precioUnitRef) * 100)
              : pct;

            if (savePct > mejorPct) {
              mejorPct = savePct;
              precioFinal = precioConDesc;
              descId = d.id;
              descNombre = d.nombre;
              fechaFin = d.fecha_fin ?? null;
              Object.assign(prod, { _presIndexConDescuento: boxIdx });
            }
          }
        }

        if (mejorPct > 0 && prod.stock > 0) {
          const presOrdenadas = [...(presMap[prod.id] || [])].sort((a, b) => a.cantidad - b.cantidad);
          resultado.push({
            ...prod,
            precioFinal,
            descuentoPct: Math.round(mejorPct),
            ahorro: (() => {
              // Para descuentos por caja, el ahorro es vs comprar unidades sueltas
              if (descId === "por_caja" || (prod as any)._presIndexConDescuento > 0) {
                const presOrdenadas = [...(presMap[prod.id] || [])].sort((a, b) => a.cantidad - b.cantidad);
                const unitPres = presOrdenadas.find((p: any) => p.cantidad === 1);
                const boxPres = presOrdenadas.find((p: any) => p.cantidad > 1);
                if (unitPres && boxPres) {
                  return Math.round(unitPres.precio * boxPres.cantidad) - precioFinal;
                }
              }
              return prod.precio - precioFinal;
            })(),
            descuentoId: descId,
            descuentoNombre: descNombre,
            esExclusivo,
            esPorCantidad: !!(cantMinima && cantMinima > 0),
            cantidadMinima: cantMinima,
            fechaFin,
            esComboProd: !!prod.es_combo,
            presentaciones: presOrdenadas,
            presIndexConDescuento: (prod as any)._presIndexConDescuento ?? 0,
          });
        }
      }

      resultado.sort((a, b) => b.descuentoPct - a.descuentoPct);

      // Armar filtros de descuento
      const descMap: Record<string, { nombre: string; count: number }> = {};
      for (const p of resultado) {
        const key = p.descuentoId;
        const nombre = p.esComboProd
          ? "Combos"
          : p.esExclusivo
          ? "Exclusivo para vos"
          : p.descuentoId === "por_caja"
          ? "Precio especial por caja"
          : p.descuentoNombre;
        if (!descMap[key]) descMap[key] = { nombre, count: 0 };
        descMap[key].count++;
      }
      setDescuentosDisponibles(Object.entries(descMap).map(([id, { nombre, count }]) => ({ id, nombre, count })).sort((a, b) => b.count - a.count));

      // Armar filtros de categoría
      const catMap: Record<string, { nombre: string; count: number }> = {};
      for (const p of resultado) {
        const cat = p.categorias;
        if (!cat) continue;
        if (!catMap[cat.id]) catMap[cat.id] = { nombre: cat.nombre, count: 0 };
        catMap[cat.id].count++;
      }
      setCategoriasDisponibles(Object.entries(catMap).map(([id, { nombre, count }]) => ({ id, nombre, count })).sort((a, b) => b.count - a.count));

      setAllProductos(resultado);
      setLoading(false);

      // Inicializar selectedPres con el índice correcto
      const initialPres: Record<string, number> = {};
      for (const p of resultado) {
        if (p.presIndexConDescuento && p.presIndexConDescuento > 0) {
          initialPres[p.id] = p.presIndexConDescuento;
        }
      }
      if (Object.keys(initialPres).length > 0) setSelectedPres(initialPres);

      // Inicializar quantities con cantidadMinima para descuentos por volumen
      const initialQty: Record<string, number> = {};
      for (const p of resultado) {
        if (p.cantidadMinima && p.cantidadMinima > 0) {
          initialQty[p.id] = p.cantidadMinima;
        }
      }
      if (Object.keys(initialQty).length > 0) setQuantities(initialQty);
    })();
  }, [initialProductos, initialDescuentos, initialPresentaciones]);

  // Countdown para descuentos que vencen hoy
  const descuentoVenceHoy = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return allProductos.find((p) => p.fechaFin === today);
  }, [allProductos]);

  useEffect(() => {
    if (!descuentoVenceHoy) return;
    function tick() {
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = end.getTime() - now.getTime();
      if (diff <= 0) { setCountdown(null); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown({
        h: String(h).padStart(2, "0"),
        m: String(m).padStart(2, "0"),
        s: String(s).padStart(2, "0"),
      });
    }
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [descuentoVenceHoy]);

  // Banner de urgencia: descuentos que vencen en <= 7 días
  const bannerData = useMemo(() => {
    const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    hoy.setHours(0, 0, 0, 0);
    const porVencer: { nombre: string; dias: number; fechaFin: string }[] = [];
    const visto = new Set<string>();
    for (const p of allProductos) {
      if (!p.fechaFin || visto.has(p.descuentoId)) continue;
      const dias = diasHasta(p.fechaFin);
      if (dias >= 0 && dias <= 7) {
        porVencer.push({ nombre: p.descuentoNombre, dias, fechaFin: p.fechaFin });
        visto.add(p.descuentoId);
      }
    }
    if (porVencer.length === 0) return null;
    porVencer.sort((a, b) => a.dias - b.dias);
    return porVencer;
  }, [allProductos]);

  const filtered = useMemo(() => {
    let list = allProductos.filter((p) => {
      const cat = p.categorias;
      if (cat && filtrarCategorias([cat]).length === 0) return false;
      if (filtroDescuento !== "todos" && p.descuentoId !== filtroDescuento) return false;
      if (filtroCategoria !== "todas" && p.categoria_id !== filtroCategoria) return false;
      return true;
    });

    switch (ordenar) {
      case "ahorro": list.sort((a, b) => b.ahorro - a.ahorro); break;
      case "precio_asc": list.sort((a, b) => a.precioFinal - b.precioFinal); break;
      case "precio_desc": list.sort((a, b) => b.precioFinal - a.precioFinal); break;
      default: list.sort((a, b) => b.descuentoPct - a.descuentoPct);
    }
    return list;
  }, [allProductos, filtroDescuento, filtroCategoria, ordenar, filtrarCategorias]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = useMemo(() => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE), [filtered, page]);

  useEffect(() => { setPage(1); }, [filtroDescuento, filtroCategoria, ordenar]);

  function getQty(id: string) { return quantities[id] ?? 1; }
  function setQty(id: string, val: number) { setQuantities((prev) => ({ ...prev, [id]: Math.max(1, val) })); }

  function presLabel(p: { cantidad: number; nombre?: string }): string {
    return p.nombre || (p.cantidad === 1 ? "Unidad" : `Caja x${p.cantidad}`);
  }

  function addToCart(prod: ProductoConDescuento, qty: number) {
    const pres = prod.presentaciones || [];
    const activeIdx = selectedPres[prod.id] ?? 0;
    const activePres = pres.length > 1 ? pres[activeIdx] : null;
    const presUnits = activePres ? Number(activePres.cantidad) : 1;
    const label = activePres ? presLabel(activePres) : (prod.esComboProd ? "Combo" : "Unidad");
    const basePrice = activePres?.precio || prod.precioFinal;
    const cartKey = `${prod.id}_${label}`;
    const availableStock = Math.max(0, prod.stock - (cartUnits[prod.id] || 0));
    const maxForPres = Math.floor(availableStock / presUnits);
    if (maxForPres <= 0) { showToast("Ya tenés el máximo disponible", "error"); return; }
    const canAdd = Math.min(qty, maxForPres);
    const stored = localStorage.getItem("carrito");
    let carrito: any[];
    try { carrito = stored ? JSON.parse(stored) : []; if (!Array.isArray(carrito)) carrito = []; } catch { carrito = []; }
    const existing = carrito.find((i: any) => i.id === cartKey);
    if (existing) { existing.cantidad += canAdd; }
    else {
      carrito.push({
        id: cartKey,
        nombre: label !== "Unidad" ? `${prod.nombre} - ${label}` : prod.nombre,
        precio: basePrice,
        precio_original: basePrice < prod.precio ? prod.precio : undefined,
        descuento: basePrice < prod.precio ? Math.round((1 - basePrice / prod.precio) * 100) : undefined,
        imagen_url: prod.imagen_url,
        cantidad: canAdd,
        presentacion: label,
        unidades_por_presentacion: presUnits,
      });
    }
    localStorage.setItem("carrito", JSON.stringify(carrito));
    window.dispatchEvent(new Event("cart-updated"));
    showToast(prod.nombre, { subtitle: `${canAdd} agregado al carrito` });
    setQuantities((prev) => ({ ...prev, [prod.id]: 1 }));
  }

  const activeFiltersCount = (filtroDescuento !== "todos" ? 1 : 0) + (filtroCategoria !== "todas" ? 1 : 0);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
            <div className="aspect-square bg-gray-100" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
              <div className="h-4 w-1/2 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (allProductos.length === 0) {
    return (
      <div className="text-center py-16">
        <TrendingDown className="mx-auto h-16 w-16 text-gray-200 mb-4" />
        <p className="text-gray-500">No hay ofertas disponibles por el momento.</p>
        <Link href="/productos" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition mt-4">
          Ver todos los productos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ─── Banner de urgencia (discreto) ─── */}
      {bannerData && bannerData.length > 0 && (() => {
        const primero = bannerData[0];
        const esHoy = primero.dias === 0;
        const esMañana = primero.dias === 1;

        if (esHoy && countdown) {
          return (
            <div className="flex items-center gap-3 bg-gray-900 text-white rounded-2xl px-4 py-3">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold">¡Última oportunidad!</span>
                <span className="text-sm text-gray-300 ml-1.5">{primero.nombre} vence hoy</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 font-mono text-sm font-bold">
                <span className="bg-white/10 rounded-lg px-2 py-1">{countdown.h}</span>
                <span className="text-gray-400">:</span>
                <span className="bg-white/10 rounded-lg px-2 py-1">{countdown.m}</span>
                <span className="text-gray-400">:</span>
                <span className="bg-white/10 rounded-lg px-2 py-1">{countdown.s}</span>
              </div>
            </div>
          );
        }

        if (bannerData.length === 1) {
          return (
            <div className="flex items-center gap-2.5 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-2.5">
              <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span className="text-sm text-orange-800 flex-1 min-w-0 truncate">
                <span className="font-semibold">{primero.nombre}</span>
                {" · "}
                {esMañana ? "vence mañana" : `vence en ${primero.dias} días`}
              </span>
              <span className="text-xs text-orange-500 shrink-0">hasta {formatFechaFin(primero.fechaFin)}</span>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2.5 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-2.5 flex-wrap">
            <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            <span className="text-sm font-semibold text-orange-800">Próximos a vencer:</span>
            <div className="flex gap-1.5 flex-wrap">
              {bannerData.map((d, i) => (
                <span key={i} className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  d.dias === 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                }`}>
                  {d.nombre} · {d.dias === 0 ? "hoy" : d.dias === 1 ? "mañana" : `${d.dias}d`}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ─── Controles: filtros + ordenar ─── */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setFiltroOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
            activeFiltersCount > 0
              ? "bg-green-500 border-green-500 text-white"
              : "bg-white border-gray-200 text-gray-600 hover:border-green-300"
          }`}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Filtrar
          {activeFiltersCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-white/80 ml-0.5" />
          )}
        </button>

        <span className="text-xs text-gray-400">
          {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
          {activeFiltersCount > 0 && " · filtrado"}
        </span>
      </div>

      {/* Panel de filtros desde abajo */}
      {filtroOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setFiltroOpen(false)}
          />
          <div className="relative bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="px-4 pb-8 pt-2 space-y-5">

              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-900">Filtros</span>
                <button
                  onClick={() => {
                    setFiltroDescuento("todos");
                    setFiltroCategoria("todas");
                    setOrdenar("descuento");
                  }}
                  className="text-xs text-green-500 font-medium hover:text-green-600 transition-colors"
                >
                  Limpiar todo
                </button>
              </div>

              {/* Ordenar */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">Ordenar por</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "descuento", label: "Mayor descuento %" },
                    { value: "ahorro", label: "Mayor ahorro $" },
                    { value: "precio_asc", label: "Menor precio" },
                    { value: "precio_desc", label: "Mayor precio" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setOrdenar(opt.value as any)}
                      className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                        ordenar === opt.value
                          ? "bg-green-500 border-green-500 text-white"
                          : "bg-white border-gray-200 text-gray-600 hover:border-green-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro por descuento */}
              {descuentosDisponibles.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-2">Tipo de oferta</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFiltroDescuento("todos")}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                        filtroDescuento === "todos"
                          ? "bg-green-500 border-green-500 text-white"
                          : "bg-white border-gray-200 text-gray-600 hover:border-green-200"
                      }`}
                    >
                      Todas
                    </button>
                    {descuentosDisponibles.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setFiltroDescuento(filtroDescuento === d.id ? "todos" : d.id)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                          filtroDescuento === d.id
                            ? "bg-green-500 border-green-500 text-white"
                            : "bg-white border-gray-200 text-gray-600 hover:border-green-200"
                        }`}
                      >
                        {d.nombre}
                        <span className={`ml-1 text-[10px] ${filtroDescuento === d.id ? "opacity-70" : "text-gray-400"}`}>
                          {d.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtro por categoría */}
              {categoriasDisponibles.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-2">Categoría</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFiltroCategoria("todas")}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                        filtroCategoria === "todas"
                          ? "bg-green-500 border-green-500 text-white"
                          : "bg-white border-gray-200 text-gray-600 hover:border-green-200"
                      }`}
                    >
                      Todas
                    </button>
                    {categoriasDisponibles.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setFiltroCategoria(filtroCategoria === c.id ? "todas" : c.id)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                          filtroCategoria === c.id
                            ? "bg-green-500 border-green-500 text-white"
                            : "bg-white border-gray-200 text-gray-600 hover:border-green-200"
                        }`}
                      >
                        {c.nombre}
                        <span className={`ml-1 text-[10px] ${filtroCategoria === c.id ? "opacity-70" : "text-gray-400"}`}>
                          {c.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Botón aplicar */}
              <button
                onClick={() => setFiltroOpen(false)}
                className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                Ver {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Grid ─── */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No hay productos con ese filtro.</p>
          <button onClick={() => { setFiltroDescuento("todos"); setFiltroCategoria("todas"); }} className="text-primary text-sm font-medium mt-2 hover:underline">
            Ver todas las ofertas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginated.map((p) => {
            const qty = getQty(p.id);
            const pres = p.presentaciones || [];
            const hasPres = pres.length > 1;
            const activeIdx = selectedPres[p.id] ?? 0;
            const activePres = hasPres ? pres[activeIdx] : null;
            const presUnits = activePres ? Number(activePres.cantidad) : 1;
            const availableStock = Math.max(0, p.stock - (cartUnits[p.id] || 0));
            const maxForPres = Math.floor(availableStock / presUnits);
            const canBuy = maxForPres > 0;

            const isDescuentoPres = activeIdx === (p.presIndexConDescuento ?? 0);
            // Para descuentos por cantidad mínima: aplicar descuento si qty >= cantidadMinima
            const cantMinOk = !p.cantidadMinima || qty >= p.cantidadMinima;
            const displayPrice = isDescuentoPres && cantMinOk
              ? p.precioFinal
              : (activePres?.precio || p.precio);
            const displayOriginal = (() => {
              if (activePres && activePres.cantidad > 1) {
                // Para cajas, el precio de referencia es unidad × cantidad
                const unitPres = pres.find((pr) => pr.cantidad === 1);
                if (unitPres && unitPres.precio > 0) return Math.round(unitPres.precio * activePres.cantidad);
              }
              return activePres ? activePres.precio : p.precio;
            })();
            const displayAhorro = isDescuentoPres && cantMinOk && displayPrice < displayOriginal
              ? displayOriginal - displayPrice
              : 0;
            const displayPct = displayAhorro > 0
              ? Math.round((displayAhorro / displayOriginal) * 100)
              : (isDescuentoPres && cantMinOk ? p.descuentoPct : 0);

            // Precio por unidad para presentaciones mayores
            const precioXUnidad = activePres && activePres.cantidad > 1 && displayPrice > 0
              ? Math.round(displayPrice / activePres.cantidad)
              : null;

            return (
              <div key={p.id} className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100/80 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
                <Link href={`/productos/${productSlug(p.nombre, p.id)}`} className="relative block">
                  <div className="aspect-square bg-gray-50 overflow-hidden relative">
                    {p.imagen_url ? (
                      <Image src={p.imagen_url} alt={p.nombre} fill sizes="(max-width: 768px) 50vw, 25vw" loading="lazy" className="object-contain p-3 group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <span className="text-2xl font-bold text-gray-400">
                          {p.nombre.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* Badge */}
                    {displayPct > 0 && (
                      <span className={`absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.cantidadMinima && p.cantidadMinima > 0 ? "bg-orange-500" : "bg-green-500"
                      }`}>
                        -{displayPct}%
                      </span>
                    )}
                    {p.esExclusivo && (
                      <span className="absolute top-2 right-2 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">EXCLUSIVO</span>
                    )}
                    {!canBuy && !p.esComboProd && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded-full shadow">Sin stock</span>
                      </div>
                    )}
                    {canBuy && availableStock <= 5 && !p.esComboProd && (
                      <span className="absolute bottom-2 right-2 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                        {availableStock === 1 ? "¡Última!" : `¡Quedan ${availableStock}!`}
                      </span>
                    )}
                  </div>
                </Link>

                <div className="p-3 flex flex-col gap-1.5 flex-1">
                  {p.categorias?.nombre && <span className="text-[10px] text-primary font-medium">{p.categorias.nombre}</span>}
                  <Link href={`/productos/${productSlug(p.nombre, p.id)}`}>
                    <p className="text-[13px] font-medium text-gray-800 line-clamp-2 leading-snug hover:text-primary/90 transition-colors">{p.nombre}</p>
                  </Link>

                  {/* Selector de presentaciones */}
                  {hasPres && (
                    <div className="flex flex-wrap gap-1">
                      {[...pres].sort((a, b) => a.cantidad - b.cantidad).map((pr, idx) => {
                        const label = presLabel(pr);
                        const presStock = Math.floor(availableStock / Number(pr.cantidad));
                        const disabled = presStock <= 0;
                        const isActive = activeIdx === idx;
                        return (
                          <button key={idx} disabled={disabled}
                            onClick={() => { setSelectedPres((prev) => ({ ...prev, [p.id]: idx })); const newMax = Math.floor(availableStock / Number(pr.cantidad)); if (qty > newMax) setQty(p.id, Math.max(1, newMax)); }}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all border ${disabled ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed" : isActive ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Precio */}
                  <div className="mt-auto pt-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-gray-900">{formatCurrency(displayPrice)}</span>
                      {displayAhorro > 0 && <span className="text-xs text-gray-400 line-through">{formatCurrency(displayOriginal)}</span>}
                    </div>
                    {/* Precio por unidad */}
                    {precioXUnidad && (
                      <p className="text-[10px] text-gray-400 mt-0.5">= {formatCurrency(precioXUnidad)} c/u</p>
                    )}
                    {displayAhorro > 0 && (
                      <span className="text-[11px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                        Ahorrás {formatCurrency(displayAhorro)}
                      </span>
                    )}
                    {/* Aviso cantidad mínima */}
                    {p.cantidadMinima && p.cantidadMinima > 0 ? (
                      qty >= p.cantidadMinima ? (
                        <p className="text-[10px] text-green-600 font-semibold mt-0.5">
                          ✓ Descuento aplicado ({p.descuentoPct}% OFF)
                        </p>
                      ) : (
                        <p className="text-[10px] text-orange-600 font-semibold mt-0.5">
                          🏷 Agregá {p.cantidadMinima - qty} más para el {p.descuentoPct}% OFF
                        </p>
                      )
                    ) : p.descuentoNombre && p.descuentoNombre !== "Precio especial" && p.descuentoId !== "por_caja" ? (
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">{p.descuentoNombre}</p>
                    ) : null}
                    {/* Fecha de vencimiento */}
                    {p.fechaFin && (() => {
                      const dias = diasHasta(p.fechaFin);
                      if (dias < 0) return null;
                      const label = dias === 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : dias <= 7 ? `Vence en ${dias} días` : `Válido hasta ${formatFechaFin(p.fechaFin)}`;
                      return <p className={`text-[10px] font-semibold mt-0.5 ${dias <= 3 ? "text-red-500" : "text-gray-400"}`}>⏱ {label}</p>;
                    })()}
                  </div>

                  {/* Agregar al carrito */}
                  {canBuy ? (
                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                          <button onClick={() => setQty(p.id, qty - 1)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"><Minus className="w-3 h-3" /></button>
                          <span className="w-6 text-center text-xs font-semibold text-gray-800">{qty}</span>
                          <button onClick={() => setQty(p.id, Math.min(qty + 1, maxForPres))} disabled={qty >= maxForPres} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{formatCurrency(displayPrice * qty)}</span>
                      </div>
                      <button onClick={() => addToCart(p, qty)} className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-white text-sm py-2 rounded-xl font-semibold transition-all">
                        Agregar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-full bg-gray-50 text-gray-400 text-xs py-2 rounded-lg font-medium mt-1">Agotado</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Paginado ─── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={page === 1} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .reduce<(number | "...")[]>((acc, n, idx, arr) => { if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("..."); acc.push(n); return acc; }, [])
              .map((n, i) => n === "..." ? (
                <span key={`e${i}`} className="px-2 text-gray-400 text-sm">…</span>
              ) : (
                <button key={n} onClick={() => { setPage(n as number); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${page === n ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                  {n}
                </button>
              ))}
          </div>
          <button onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={page === totalPages} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
