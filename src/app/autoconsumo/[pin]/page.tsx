"use client";

import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildStockUpdate } from "@/lib/stock-utils";

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
  anulado?: boolean;
}

type HistoryPeriod = "today" | "week" | "month";

// ---------------------------------------------------------------------------
// Date helpers (Argentina timezone)
// ---------------------------------------------------------------------------
const todayARG = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });

function mondayOfWeekARG(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  return monday.toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function monthStartARG(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
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
        className={`px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2.5 ${
          type === "success"
            ? "bg-gradient-to-r from-rose-600 to-rose-500"
            : "bg-gradient-to-r from-red-600 to-red-500"
        }`}
        style={{ boxShadow: type === "success" ? "0 8px 24px rgba(225,29,72,0.35)" : "0 8px 24px rgba(220,38,38,0.35)" }}
      >
        {type === "success" ? (
          <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
      className="bg-rose-50 rounded-2xl flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        className="text-rose-200"
        style={{ width: size * 0.45, height: size * 0.45 }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success overlay component
// ---------------------------------------------------------------------------
function SuccessOverlay({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, 1800);
      return () => clearTimeout(t);
    }
  }, [visible, onDone]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-3 animate-in zoom-in-95 duration-300 mx-6" style={{ boxShadow: "0 24px 60px rgba(225,29,72,0.18)" }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)", boxShadow: "0 6px 20px rgba(225,29,72,0.4)" }}>
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
                style={{
                  strokeDasharray: 24,
                  strokeDashoffset: 24,
                  animation: "drawCheck 0.4s 0.2s ease forwards",
                }}
              />
            </svg>
          </div>
        </div>
        <p className="text-lg font-bold text-gray-800">¡Retiro registrado!</p>
        <p className="text-sm text-gray-400">El stock fue actualizado correctamente</p>
      </div>
      <style>{`@keyframes drawCheck { to { stroke-dashoffset: 0; } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AutoconsumoPage() {
  const params = useParams();
  const pin = params.pin as string;

  const [loading, setLoading] = useState(true);
  const [miembro, setMiembro] = useState<Miembro | null>(null);
  const [invalidPin, setInvalidPin] = useState(false);

  const [search, setSearch] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [historial, setHistorial] = useState<Consumo[]>([]);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("today");
  const [refreshing, setRefreshing] = useState(false);

  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success" as "success" | "error",
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ visible: true, message, type });
      setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
    },
    []
  );

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

  const getDateRange = useCallback(
    (period: HistoryPeriod): { from: string; to: string } => {
      const today = todayARG();
      if (period === "today") return { from: today, to: today };
      if (period === "week") return { from: mondayOfWeekARG(), to: today };
      return { from: monthStartARG(), to: today };
    },
    []
  );

  const loadHistorial = useCallback(
    async (period?: HistoryPeriod) => {
      if (!miembro) return;
      const range = getDateRange(period ?? historyPeriod);
      const { data } = await supabase
        .from("autoconsumo")
        .select("*, productos(imagen_url)")
        .eq("miembro_id", miembro.id)
        .gte("fecha", range.from)
        .lte("fecha", range.to)
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) setHistorial(data as Consumo[]);
    },
    [miembro, historyPeriod, getDateRange]
  );

  useEffect(() => {
    loadHistorial();
  }, [loadHistorial]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHistorial();
    setRefreshing(false);
  };

  const handlePeriodChange = (period: HistoryPeriod) => {
    setHistoryPeriod(period);
    loadHistorial(period);
  };

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

  const handleSelect = (id: number) => {
    if (selectedId === id) {
      setSelectedId(null);
      setCantidad(1);
    } else {
      setSelectedId(id);
      setCantidad(1);
    }
  };

  const handleConfirm = async () => {
    if (!miembro || !selectedId) return;
    const producto = productos.find((p) => p.id === selectedId);
    if (!producto) return;

    if (cantidad < 1) {
      showToast("Cantidad debe ser al menos 1", "error");
      return;
    }

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
    const fecha = now.toLocaleDateString("en-CA", {
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

    const { error: errStock } = await supabase
      .from("productos")
      .update(buildStockUpdate(stockDespues, stockAntes))
      .eq("id", producto.id);

    if (errStock) {
      showToast("Error al actualizar stock", "error");
      setConfirming(false);
      return;
    }

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

    setProductos((prev) =>
      prev.map((p) =>
        p.id === producto.id ? { ...p, stock: stockDespues } : p
      )
    );
    setSelectedId(null);
    setCantidad(1);
    setConfirming(false);
    setShowSuccess(true);
    loadHistorial();
  };

  const historyTotal = historial
    .filter((c) => !c.anulado)
    .reduce((sum, c) => sum + c.costo_total, 0);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(160deg, #fff1f2 0%, #fff7f5 60%, #fff 100%)" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, #e11d48 0%, #f43f5e 30%, transparent 30%)",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p className="text-rose-400 text-sm font-medium">Cargando...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Invalid PIN
  // ---------------------------------------------------------------------------
  if (invalidPin || !miembro) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "linear-gradient(160deg, #fff1f2 0%, #fff7f5 60%, #fff 100%)" }}>
        <div className="text-center max-w-xs">
          <div className="w-20 h-20 mx-auto mb-5 rounded-3xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)" }}>
            <svg className="w-9 h-9 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <Image
            src="https://res.cloudinary.com/dss3lnovd/image/upload/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png"
            alt="DulceSur"
            width={120}
            height={40}
            className="mx-auto mb-5 object-contain"
          />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Link inválido</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Este enlace no es válido o fue desactivado. Contactá al administrador.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main page
  // ---------------------------------------------------------------------------
  const iniciales = miembro.nombre
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen" style={{ background: "#faf9f9" }}>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} />
      <SuccessOverlay visible={showSuccess} onDone={() => setShowSuccess(false)} />

      {/* ─── Header ─── */}
      <header className="bg-white sticky top-0 z-40" style={{ boxShadow: "0 1px 0 #f3e0e3, 0 4px 16px rgba(225,29,72,0.04)" }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <Image
            src="https://res.cloudinary.com/dss3lnovd/image/upload/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png"
            alt="DulceSur"
            width={110}
            height={36}
            className="object-contain"
            priority
          />

          {/* Member badge */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
              style={{ background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)", boxShadow: "0 2px 8px rgba(225,29,72,0.3)" }}
            >
              {iniciales}
            </div>
            <span className="text-sm font-semibold text-gray-700">{miembro.nombre}</span>
          </div>
        </div>

        {/* Thin brand accent bar */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)" }} />
      </header>

      <main className="max-w-lg mx-auto px-4 pb-12">

        {/* ─── Welcome card ─── */}
        <div
          className="mt-5 rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)",
            boxShadow: "0 8px 32px rgba(225,29,72,0.25)",
          }}
        >
          {/* Decorative circles */}
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full opacity-10 bg-white" />
          <div className="absolute -bottom-8 -right-2 w-24 h-24 rounded-full opacity-[0.07] bg-white" />

          <p className="text-rose-100 text-xs font-medium mb-0.5 relative z-10">Autoconsumo familiar</p>
          <p className="text-white text-lg font-bold relative z-10">
            Hola, {miembro.nombre.split(" ")[0]} 👋
          </p>
          <p className="text-rose-100 text-sm mt-1 relative z-10 leading-relaxed">
            Buscá el producto y registrá tu retiro de stock.
          </p>
        </div>

        {/* ─── Search ─── */}
        <div className="sticky top-[57px] z-30 bg-[#faf9f9] pt-4 pb-2">
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-300"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar producto o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-12 py-4 rounded-2xl bg-white border text-base text-gray-800 placeholder-gray-400 focus:outline-none transition min-h-[56px] font-medium"
              style={{
                borderColor: search ? "#f43f5e" : "#f3e0e3",
                boxShadow: search
                  ? "0 0 0 3px rgba(244,63,94,0.12), 0 2px 8px rgba(225,29,72,0.08)"
                  : "0 2px 8px rgba(0,0,0,0.04)",
              }}
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setSelectedId(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center active:bg-rose-50 transition min-w-[32px] min-h-[32px]"
                style={{ background: "#fff1f2" }}
              >
                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ─── Search results ─── */}
        {search.trim() && (
          <div className="mt-2 space-y-2.5">
            {searching && (
              <div className="flex justify-center py-10">
                <div
                  className="w-8 h-8 rounded-full"
                  style={{
                    background: "conic-gradient(from 0deg, #e11d48 0%, #f43f5e 30%, transparent 30%)",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {!searching && productos.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center" style={{ background: "#fff1f2" }}>
                  <svg className="w-8 h-8 text-rose-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Sin resultados para &ldquo;{search}&rdquo;</p>
              </div>
            )}

            {!searching &&
              productos.map((producto) => {
                const isSelected = selectedId === producto.id;
                return (
                  <div
                    key={producto.id}
                    className="bg-white rounded-2xl overflow-hidden transition-all duration-200"
                    style={{
                      border: isSelected ? "2px solid #f43f5e" : "2px solid #f9ecee",
                      boxShadow: isSelected
                        ? "0 8px 32px rgba(225,29,72,0.14)"
                        : "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    {/* Product row */}
                    <button
                      onClick={() => handleSelect(producto.id)}
                      className="w-full flex items-center gap-4 p-4 text-left min-h-[80px]"
                    >
                      {producto.imagen_url ? (
                        <div className="w-[68px] h-[68px] rounded-xl overflow-hidden flex-shrink-0 bg-rose-50 border border-rose-50">
                          <Image
                            src={producto.imagen_url}
                            alt={producto.nombre}
                            width={68}
                            height={68}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <PlaceholderIcon size={68} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-[15px] leading-tight truncate">
                          {producto.nombre}
                        </p>
                        {producto.codigo && (
                          <p className="text-xs text-gray-400 mt-0.5 font-medium">
                            Cód: {producto.codigo}
                          </p>
                        )}
                        <div className="flex items-center gap-2.5 mt-1.5">
                          <span className="text-xs bg-gray-50 text-gray-500 rounded-lg px-2 py-0.5 font-medium border border-gray-100">
                            Stock: {producto.stock}
                          </span>
                          <span className="text-sm font-bold" style={{ color: "#e11d48" }}>
                            ${producto.costo.toLocaleString("es-AR")}
                          </span>
                        </div>
                      </div>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200"
                        style={{
                          background: isSelected ? "#fff1f2" : "#f8f8f8",
                          transform: isSelected ? "rotate(180deg)" : "none",
                        }}
                      >
                        <svg
                          className="w-4 h-4"
                          style={{ color: isSelected ? "#e11d48" : "#d1d5db" }}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded: quantity + confirm */}
                    {isSelected && (
                      <div className="px-4 pb-4 pt-3" style={{ borderTop: "1.5px solid #fff1f2", background: "#fffafa" }}>
                        {/* Quantity selector */}
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-semibold text-gray-600">Cantidad a retirar</span>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                              className="w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 transition-all min-w-[44px] min-h-[44px] font-bold"
                              style={{ background: "#fff1f2", color: "#e11d48", border: "1.5px solid #fecdd3" }}
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                              </svg>
                            </button>
                            <span className="w-10 text-center text-2xl font-black text-gray-800">{cantidad}</span>
                            <button
                              onClick={() => setCantidad((c) => Math.min(producto.stock, c + 1))}
                              className="w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 transition-all min-w-[44px] min-h-[44px]"
                              style={{ background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)", color: "white", boxShadow: "0 3px 10px rgba(225,29,72,0.3)" }}
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Subtotal row */}
                        <div
                          className="flex items-center justify-between mb-4 px-3 py-2.5 rounded-xl"
                          style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}
                        >
                          <span className="text-xs font-semibold" style={{ color: "#f43f5e" }}>Total del retiro</span>
                          <span className="text-lg font-black" style={{ color: "#e11d48" }}>
                            ${(producto.costo * cantidad).toLocaleString("es-AR")}
                          </span>
                        </div>

                        {/* Confirm button */}
                        <button
                          onClick={handleConfirm}
                          disabled={confirming}
                          className="w-full py-4 rounded-2xl text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[56px] active:scale-[0.98]"
                          style={{
                            background: confirming
                              ? "#f43f5e"
                              : "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
                            boxShadow: "0 6px 20px rgba(225,29,72,0.35)",
                          }}
                        >
                          {confirming ? (
                            <>
                              <div
                                className="w-5 h-5 rounded-full border-2 border-white/30"
                                style={{
                                  borderTopColor: "white",
                                  animation: "spin 0.8s linear infinite",
                                }}
                              />
                              Registrando...
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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

        {/* ─── History section ─── */}
        <div className="mt-8">
          {/* Section header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Mis retiros</h2>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-9 h-9 rounded-xl flex items-center justify-center active:bg-rose-50 transition min-w-[36px] min-h-[36px]"
            >
              <svg
                className="w-4 h-4"
                style={{
                  color: "#f43f5e",
                  animation: refreshing ? "spin 0.8s linear infinite" : "none",
                }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Period filter */}
          <div className="flex rounded-2xl p-1 mb-4" style={{ background: "#f9ecee" }}>
            {(
              [
                { key: "today" as HistoryPeriod, label: "Hoy" },
                { key: "week" as HistoryPeriod, label: "Esta semana" },
                { key: "month" as HistoryPeriod, label: "Este mes" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handlePeriodChange(key)}
                className="flex-1 py-2.5 text-sm rounded-xl transition-all min-h-[44px] font-semibold"
                style={
                  historyPeriod === key
                    ? {
                        background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
                        color: "white",
                        boxShadow: "0 3px 12px rgba(225,29,72,0.3)",
                      }
                    : { color: "#f43f5e" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* Period summary */}
          {historial.length > 0 && (
            <div
              className="rounded-2xl p-4 mb-4 flex items-center justify-between"
              style={{
                background: "linear-gradient(135deg, #fff1f2 0%, #fff5f5 100%)",
                border: "1.5px solid #fecdd3",
              }}
            >
              <div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: "#f43f5e" }}>Total del periodo</p>
                <p className="text-xl font-black" style={{ color: "#e11d48" }}>
                  ${historyTotal.toLocaleString("es-AR")}
                </p>
              </div>
              <div
                className="w-px self-stretch"
                style={{ background: "#fecdd3" }}
              />
              <div className="text-right">
                <p className="text-xs font-semibold mb-0.5" style={{ color: "#f43f5e" }}>Retiros</p>
                <p className="text-xl font-black" style={{ color: "#e11d48" }}>
                  {historial.filter((c) => !c.anulado).length}
                </p>
              </div>
            </div>
          )}

          {/* History list */}
          {historial.length === 0 ? (
            <div
              className="rounded-2xl p-10 text-center"
              style={{ background: "white", border: "1.5px solid #f9ecee" }}
            >
              <div
                className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                style={{ background: "#fff1f2" }}
              >
                <svg className="w-7 h-7 text-rose-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm font-medium">Sin retiros en este periodo</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historial.map((item) => {
                const imgUrl = item.productos?.imagen_url ?? null;
                const fechaShort = item.fecha
                  ? `${item.fecha.slice(8, 10)}/${item.fecha.slice(5, 7)}`
                  : "";
                const horaShort = item.hora?.slice(0, 5) || "";
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3.5 py-3.5 rounded-2xl transition-colors"
                    style={
                      item.anulado
                        ? { background: "#fef2f2", border: "1.5px solid #fecdd3", opacity: 0.6 }
                        : { background: "white", border: "1.5px solid #f9ecee" }
                    }
                  >
                    {imgUrl ? (
                      <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 border border-rose-50">
                        <Image
                          src={imgUrl}
                          alt={item.producto_nombre}
                          width={44}
                          height={44}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <PlaceholderIcon size={44} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-bold truncate"
                        style={{ color: item.anulado ? "#9ca3af" : "#1f2937", textDecoration: item.anulado ? "line-through" : "none" }}
                      >
                        {item.producto_nombre}
                        {item.anulado && (
                          <span className="ml-1.5 text-[10px] font-bold text-red-400 no-underline">ANULADO</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 font-medium">
                        {fechaShort}
                        {horaShort && ` · ${horaShort}`}
                        {" · "}
                        <span className="text-gray-500">×{item.cantidad}</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black" style={{ color: "#e11d48" }}>
                        ${item.costo_total.toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <Image
            src="https://res.cloudinary.com/dss3lnovd/image/upload/v1774728837/dulcesur/Logotipo_DulceSur_2_rfwpdf.png"
            alt="DulceSur"
            width={80}
            height={26}
            className="mx-auto object-contain opacity-25"
          />
        </div>
      </main>
    </div>
  );
}
