"use client";

import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Miembro {
  id: number;
  nombre: string;
  pin: string;
  activo: boolean;
}

interface Producto {
  id: number;
  nombre: string;
  codigo: string;
  stock: number;
  costo: number;
  imagen_url: string | null;
}

interface Consumo {
  id: number;
  producto_nombre: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  fecha: string;
  hora: string;
  producto_id: number;
  productos?: { imagen_url: string | null } | null;
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------
function Toast({
  message,
  visible,
  type = "success",
}: {
  message: string;
  visible: boolean;
  type?: "success" | "error";
}) {
  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-4 pointer-events-none"
      }`}
    >
      <div
        className={`px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium flex items-center gap-2 ${
          type === "success" ? "bg-green-600" : "bg-red-500"
        }`}
      >
        {type === "success" ? (
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        )}
        {message}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder icon for products without image
// ---------------------------------------------------------------------------
function PlaceholderIcon({ size = 64 }: { size?: number }) {
  return (
    <div
      className="bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        className="w-8 h-8 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AutoconsumoPage() {
  const params = useParams();
  const pin = params.pin as string;

  // State
  const [loading, setLoading] = useState(true);
  const [miembro, setMiembro] = useState<Miembro | null>(null);
  const [invalidPin, setInvalidPin] = useState(false);

  const [search, setSearch] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [confirming, setConfirming] = useState(false);

  const [historial, setHistorial] = useState<Consumo[]>([]);

  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success" as "success" | "error",
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------- Show toast helper -------
  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ visible: true, message, type });
      setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
    },
    []
  );

  // ------- Validate PIN -------
  useEffect(() => {
    async function validate() {
      setLoading(true);
      const { data, error } = await supabase
        .from("miembros_familia")
        .select("*")
        .eq("pin", pin)
        .eq("activo", true)
        .maybeSingle();

      if (error || !data) {
        setInvalidPin(true);
      } else {
        setMiembro(data as Miembro);
      }
      setLoading(false);
    }
    validate();
  }, [pin]);

  // ------- Load history -------
  const loadHistorial = useCallback(async () => {
    if (!miembro) return;
    const { data } = await supabase
      .from("autoconsumo")
      .select("*, productos(imagen_url)")
      .eq("miembro_id", miembro.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (data) setHistorial(data as Consumo[]);
  }, [miembro]);

  useEffect(() => {
    loadHistorial();
  }, [loadHistorial]);

  // ------- Debounced search -------
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!search.trim()) {
      setProductos([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      const term = search.trim();
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, codigo, stock, costo, imagen_url")
        .or(`nombre.ilike.%${term}%,codigo.ilike.%${term}%`)
        .gt("stock", 0)
        .order("nombre")
        .limit(20);

      setProductos((data as Producto[]) || []);
      setSearching(false);
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search]);

  // ------- Select product -------
  const handleSelect = (id: number) => {
    if (selectedId === id) {
      setSelectedId(null);
      setCantidad(1);
    } else {
      setSelectedId(id);
      setCantidad(1);
    }
  };

  // ------- Confirm withdrawal -------
  const handleConfirm = async () => {
    if (!miembro || !selectedId) return;
    const producto = productos.find((p) => p.id === selectedId);
    if (!producto) return;

    if (cantidad < 1) {
      showToast("Cantidad debe ser al menos 1", "error");
      return;
    }

    // Re-check stock
    const { data: fresh } = await supabase
      .from("productos")
      .select("stock")
      .eq("id", producto.id)
      .single();

    if (!fresh || fresh.stock < cantidad) {
      showToast("Stock insuficiente", "error");
      return;
    }

    setConfirming(true);

    const now = new Date();
    const fecha = now.toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const hora = now.toLocaleTimeString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
    });
    const costoTotal = producto.costo * cantidad;
    const stockAntes = fresh.stock;
    const stockDespues = stockAntes - cantidad;

    // Insert autoconsumo
    const { error: errAutoconsumo } = await supabase
      .from("autoconsumo")
      .insert({
        miembro_id: miembro.id,
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        cantidad,
        costo_unitario: producto.costo,
        costo_total: costoTotal,
        fecha,
        hora,
      });

    if (errAutoconsumo) {
      showToast("Error al registrar retiro", "error");
      setConfirming(false);
      return;
    }

    // Decrement stock
    const { error: errStock } = await supabase
      .from("productos")
      .update({ stock: stockDespues })
      .eq("id", producto.id);

    if (errStock) {
      showToast("Error al actualizar stock", "error");
      setConfirming(false);
      return;
    }

    // Insert stock_movimientos
    await supabase.from("stock_movimientos").insert({
      producto_id: producto.id,
      tipo: "salida",
      cantidad_antes: stockAntes,
      cantidad_despues: stockDespues,
      cantidad,
      referencia: `autoconsumo-${miembro.id}`,
      descripcion: `Autoconsumo: ${miembro.nombre} retiró ${cantidad}x ${producto.nombre}`,
      usuario: miembro.nombre,
    });

    // Update local state
    setProductos((prev) =>
      prev.map((p) =>
        p.id === producto.id ? { ...p, stock: stockDespues } : p
      )
    );
    setSelectedId(null);
    setCantidad(1);
    setConfirming(false);

    showToast("Retiro registrado correctamente");
    loadHistorial();
  };

  // ------- Loading state -------
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  // ------- Invalid PIN -------
  if (invalidPin || !miembro) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">
            Link inválido
          </h1>
          <p className="text-gray-500 text-sm">
            Este enlace no es válido o fue desactivado. Contactá al
            administrador.
          </p>
        </div>
      </div>
    );
  }

  // ------- Main page -------
  return (
    <div className="min-h-screen bg-gray-50">
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <span className="font-semibold text-gray-800">DulceSur</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-600">
              {miembro.nombre}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-8">
        {/* Search */}
        <div className="sticky top-[57px] z-30 bg-gray-50 pt-4 pb-2">
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Buscar producto o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white border border-gray-200 text-base text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setSelectedId(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <svg
                  className="w-4 h-4 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Search results */}
        {search.trim() && (
          <div className="mt-2 space-y-2">
            {searching && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!searching && productos.length === 0 && (
              <div className="text-center py-10">
                <svg
                  className="w-12 h-12 mx-auto text-gray-200 mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <p className="text-gray-400 text-sm">
                  No se encontraron productos
                </p>
              </div>
            )}

            {!searching &&
              productos.map((producto) => {
                const isSelected = selectedId === producto.id;
                return (
                  <div
                    key={producto.id}
                    className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                      isSelected
                        ? "border-green-500 shadow-md shadow-green-100"
                        : "border-gray-100 shadow-sm"
                    }`}
                  >
                    {/* Product card */}
                    <button
                      onClick={() => handleSelect(producto.id)}
                      className="w-full flex items-center gap-3 p-3 text-left min-h-[72px]"
                    >
                      {producto.imagen_url ? (
                        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50">
                          <Image
                            src={producto.imagen_url}
                            alt={producto.nombre}
                            width={64}
                            height={64}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <PlaceholderIcon size={64} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm leading-tight truncate">
                          {producto.nombre}
                        </p>
                        {producto.codigo && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Cód: {producto.codigo}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500">
                            Stock:{" "}
                            <span className="font-medium text-gray-700">
                              {producto.stock}
                            </span>
                          </span>
                          <span className="text-xs font-semibold text-green-700">
                            ${producto.costo.toLocaleString("es-AR")}
                          </span>
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-300 flex-shrink-0 transition-transform ${
                          isSelected ? "rotate-180 text-green-500" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>

                    {/* Expanded: quantity selector + confirm */}
                    {isSelected && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Cantidad
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() =>
                                setCantidad((c) => Math.max(1, c - 1))
                              }
                              className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center active:bg-gray-200 transition"
                            >
                              <svg
                                className="w-5 h-5 text-gray-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M20 12H4"
                                />
                              </svg>
                            </button>
                            <span className="w-12 text-center text-lg font-semibold text-gray-800">
                              {cantidad}
                            </span>
                            <button
                              onClick={() =>
                                setCantidad((c) =>
                                  Math.min(producto.stock, c + 1)
                                )
                              }
                              className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center active:bg-gray-200 transition"
                            >
                              <svg
                                className="w-5 h-5 text-gray-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2 mb-3 px-1">
                          <span className="text-xs text-gray-400">
                            Total retiro
                          </span>
                          <span className="text-sm font-semibold text-gray-700">
                            $
                            {(producto.costo * cantidad).toLocaleString(
                              "es-AR"
                            )}
                          </span>
                        </div>

                        <button
                          onClick={handleConfirm}
                          disabled={confirming}
                          className="w-full py-3.5 rounded-xl bg-green-600 text-white font-semibold text-sm active:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                        >
                          {confirming ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Registrando...
                            </>
                          ) : (
                            <>
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              Confirmar retiro
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Recent history */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">
            Últimos retiros
          </h2>

          {historial.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <svg
                className="w-10 h-10 mx-auto text-gray-200 mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="text-gray-400 text-sm">
                Aún no hay retiros registrados
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
              {historial.map((item) => {
                const imgUrl = item.productos?.imagen_url ?? null;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    {imgUrl ? (
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-50">
                        <Image
                          src={imgUrl}
                          alt={item.producto_nombre}
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <PlaceholderIcon size={40} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {item.producto_nombre}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.fecha} &middot; {item.hora}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-700">
                        x{item.cantidad}
                      </p>
                      <p className="text-xs text-gray-400">
                        ${item.costo_total.toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
