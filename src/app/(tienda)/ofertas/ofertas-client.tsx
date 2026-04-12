"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { productSlug } from "@/lib/utils";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";

interface Producto {
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
  precioFinal?: number;
  descuentoPct?: number;
  ahorro?: number;
}

export default function OfertasClient() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const { filtrarCategorias } = useCategoriasPermitidas();

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().split("T")[0];

      // Cliente autenticado (para filtrar descuentos exclusivos)
      let clienteId: string | null = null;
      try {
        const raw = localStorage.getItem("cliente_auth");
        if (raw) { const p = JSON.parse(raw); if (p?.id) clienteId = p.id; }
      } catch {}

      // Cargar productos y descuentos en paralelo
      const [{ data: prods }, { data: descuentos }] = await Promise.all([
        supabase
          .from("productos")
          .select("id, nombre, precio, precio_oferta, precio_oferta_hasta, imagen_url, stock, es_combo, categoria_id, subcategoria_id, marca_id, categorias(id, nombre, restringida)")
          .eq("activo", true)
          .eq("visibilidad", "visible"),
        supabase
          .from("descuentos")
          .select("*")
          .eq("activo", true)
          .lte("fecha_inicio", today)
          .or(`fecha_fin.is.null,fecha_fin.gte.${today}`),
      ]);

      const allProds = ((prods || []) as any[]).map((p) => ({
        ...p,
        categorias: Array.isArray(p.categorias) ? p.categorias[0] ?? null : p.categorias,
      })) as Producto[];
      const allDesc = (descuentos || []) as any[];
      const resultado: Producto[] = [];

      for (const prod of allProds) {
        let mejorPct = 0;
        let precioFinal = prod.precio;

        // A) precio_oferta vigente
        if (
          prod.precio_oferta &&
          prod.precio_oferta > 0 &&
          prod.precio_oferta < prod.precio &&
          (!prod.precio_oferta_hasta || prod.precio_oferta_hasta >= today)
        ) {
          const pct = Math.round(((prod.precio - prod.precio_oferta) / prod.precio) * 100);
          if (pct > mejorPct) {
            mejorPct = pct;
            precioFinal = prod.precio_oferta;
          }
        }

        // B) Descuentos de la tabla descuentos
        for (const d of allDesc) {
          // Excluir descuentos exclusivos por cliente
          if (d.clientes_ids?.length > 0) {
            if (!clienteId || !d.clientes_ids.includes(clienteId)) continue;
          }
          // Excluir descuentos por cantidad mínima (son por volumen, no ofertas)
          if (d.cantidad_minima && d.cantidad_minima > 0) continue;
          // Excluir combos si corresponde
          if (d.excluir_combos && prod.es_combo) continue;
          // Excluir productos específicamente excluidos
          if (d.productos_excluidos_ids?.includes(prod.id)) continue;

          // Ver si aplica a este producto
          let aplica = false;
          if (d.aplica_a === "todos") {
            aplica = true;
          } else if (d.aplica_a === "productos") {
            aplica = (d.productos_ids || []).includes(prod.id);
          } else if (d.aplica_a === "categorias") {
            aplica = (d.categorias_ids || []).includes(prod.categoria_id) ||
              (!!prod.subcategoria_id && (d.categorias_ids || []).includes(prod.subcategoria_id));
          } else if (d.aplica_a === "subcategorias") {
            aplica = !!prod.subcategoria_id && (d.subcategorias_ids || []).includes(prod.subcategoria_id);
          } else if (d.aplica_a === "marcas") {
            aplica = !!prod.marca_id && (d.marcas_ids || []).includes(prod.marca_id);
          }

          if (!aplica) continue;

          let pct = Number(d.porcentaje);
          if (d.tipo_descuento === "precio_fijo" && d.precio_fijo != null && prod.precio > 0) {
            pct = Math.round(Math.max(0, Math.min(100,
              ((prod.precio - d.precio_fijo) / prod.precio) * 100
            )) * 100) / 100;
          }

          if (pct > mejorPct) {
            mejorPct = pct;
            precioFinal = Math.round(prod.precio * (1 - pct / 100));
          }
        }

        if (mejorPct > 0) {
          resultado.push({
            ...prod,
            precioFinal,
            descuentoPct: Math.round(mejorPct),
            ahorro: prod.precio - precioFinal,
          });
        }
      }

      // Ordenar por mayor descuento
      resultado.sort((a, b) => (b.descuentoPct || 0) - (a.descuentoPct || 0));
      setProductos(resultado);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
            <div className="aspect-square bg-gray-100" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
              <div className="h-4 w-1/2 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const filtered = productos.filter((p) => {
    const cat = p.categorias;
    if (!cat) return true;
    return filtrarCategorias([cat]).length > 0;
  });

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16">
        <TrendingDown className="mx-auto h-16 w-16 text-gray-200 mb-4" />
        <p className="text-gray-500">No hay ofertas disponibles por el momento.</p>
        <Link
          href="/productos"
          className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition mt-4"
        >
          Ver todos los productos
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {filtered.map((p) => (
        <Link
          key={p.id}
          href={`/productos/${productSlug(p.nombre, p.id)}`}
          className="group rounded-2xl border border-gray-100 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
        >
          <div className="relative aspect-square bg-gray-50 overflow-hidden">
            {p.imagen_url ? (
              <Image
                src={p.imagen_url}
                alt={p.nombre}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                loading="lazy"
                className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-10 h-10 text-gray-200" />
              </div>
            )}
            <span className="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              -{p.descuentoPct}%
            </span>
            {p.stock === 0 && !p.es_combo && (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded-full shadow">
                  Sin stock
                </span>
              </div>
            )}
          </div>
          <div className="p-3 flex flex-col gap-1 flex-1">
            {p.categorias?.nombre && (
              <span className="text-[10px] text-primary font-medium">{p.categorias.nombre}</span>
            )}
            <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{p.nombre}</p>
            <div className="mt-auto pt-1">
              <p className="text-base font-bold text-gray-900">{formatCurrency(p.precioFinal!)}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-[11px] text-gray-400 line-through">{formatCurrency(p.precio)}</span>
                <span className="text-[11px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                  Ahorrás {formatCurrency(p.ahorro!)}
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
