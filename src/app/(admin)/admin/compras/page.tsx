"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/components/admin-toast";
import { todayARG, currentMonthPadded, formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, ClipboardList, AlertTriangle, Plus } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

import type {
  ActiveTab,
  CompraRow,
  CompraItem,
  PedidoRow,
  SuggestedItem,
  ReposicionItem,
  Categoria,
  Subcategoria,
} from "./types";
import { calcSubtotal, pedidoDisplayNum } from "./types";
import type { Proveedor } from "@/types/database";

import { ComprasList } from "./compras-list";
import { PedidosList } from "./pedidos-list";
import StockCritico from "./stock-critico";
import NuevaCompra from "./nueva-compra";
import NuevoPedido from "./nuevo-pedido";
import DetalleCompra from "./detalle-compra";
import DetallePedido from "./detalle-pedido";

/* ───────── helpers ───────── */

function todayString() {
  return todayARG();
}

/* ───────── component ───────── */

export default function ComprasPage() {
  const currentUser = useCurrentUser();

  /* ── tab state ── */
  const [activeTab, setActiveTab] = useState<ActiveTab>("compras");

  /* ── shared reference data ── */
  const [providers, setProviders] = useState<Proveedor[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);

  /* ── compras list state ── */
  const [purchases, setPurchases] = useState<CompraRow[]>([]);
  const [comprasLoading, setComprasLoading] = useState(true);
  const [comprasSearch, setComprasSearch] = useState("");
  const [quickPeriod, setQuickPeriod] = useState<"today" | "week" | "month" | "custom">("today");
  const [purchaseFilterMode, setPurchaseFilterMode] = useState<"day" | "month" | "range" | "all">("range");
  const [purchaseFilterDay, setPurchaseFilterDay] = useState(todayString());
  const [purchaseFilterMonth, setPurchaseFilterMonth] = useState(currentMonthPadded());
  const [purchaseFilterYear, setPurchaseFilterYear] = useState(String(new Date().getFullYear()));
  const [purchaseFilterFrom, setPurchaseFilterFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [purchaseFilterTo, setPurchaseFilterTo] = useState(todayString());

  /* ── pedidos list state ── */
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [pedidosLoading, setPedidosLoading] = useState(true);
  const [pedidosSearch, setPedidosSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [pedFilterMode, setPedFilterMode] = useState<"day" | "month" | "range" | "all">("range");
  const [pedFilterDay, setPedFilterDay] = useState(todayString());
  const [pedFilterMonth, setPedFilterMonth] = useState(currentMonthPadded());
  const [pedFilterYear, setPedFilterYear] = useState(String(new Date().getFullYear()));
  const [pedFilterFrom, setPedFilterFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [pedFilterTo, setPedFilterTo] = useState(todayString());
  const [pedirHasta, setPedirHasta] = useState<"minimo" | "maximo">("maximo");

  /* ── nueva compra pre-load state ── */
  const [compraItems, setCompraItems] = useState<CompraItem[]>([]);
  const [compraProveedorId, setCompraProveedorId] = useState("");
  const [compraObservacion, setCompraObservacion] = useState("");
  const [pendingCompraId, setPendingCompraId] = useState<string | null>(null);
  const [pedidoOrigenId, setPedidoOrigenId] = useState<string | null>(null);

  /* ── nuevo pedido pre-load state ── */
  const [pedidoItems, setPedidoItems] = useState<SuggestedItem[]>([]);
  const [pedidoProveedorId, setPedidoProveedorId] = useState("");

  /* ── detail state ── */
  const [detailCompra, setDetailCompra] = useState<CompraRow | null>(null);
  const [detailPedido, setDetailPedido] = useState<PedidoRow | null>(null);

  /* ══════════════════ FETCH DATA ══════════════════ */

  const fetchCompras = useCallback(async () => {
    setComprasLoading(true);
    let comprasQuery = supabase
      .from("compras")
      .select("id, numero, fecha, proveedor_id, total, subtotal, descuento_porcentaje, estado, forma_pago, estado_pago, monto_pagado, tipo_comprobante, numero_comprobante, observacion, proveedores(nombre)")
      .order("fecha", { ascending: false });

    if (quickPeriod === "today") {
      comprasQuery = comprasQuery.eq("fecha", todayString());
    } else if (quickPeriod === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const mondayStr = monday.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      comprasQuery = comprasQuery.gte("fecha", mondayStr).lte("fecha", todayString());
    } else if (quickPeriod === "month") {
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      comprasQuery = comprasQuery.gte("fecha", firstDay).lte("fecha", todayString());
    } else if (purchaseFilterMode === "day") {
      comprasQuery = comprasQuery.eq("fecha", purchaseFilterDay);
    } else if (purchaseFilterMode === "month") {
      const m = purchaseFilterMonth.padStart(2, "0");
      const start = `${purchaseFilterYear}-${m}-01`;
      const nextMonth = Number(purchaseFilterMonth) === 12 ? 1 : Number(purchaseFilterMonth) + 1;
      const nextYear = Number(purchaseFilterMonth) === 12 ? Number(purchaseFilterYear) + 1 : Number(purchaseFilterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      comprasQuery = comprasQuery.gte("fecha", start).lt("fecha", end);
    } else if (purchaseFilterMode === "range" && purchaseFilterFrom && purchaseFilterTo) {
      comprasQuery = comprasQuery.gte("fecha", purchaseFilterFrom).lte("fecha", purchaseFilterTo);
    }

    const [{ data: c }, { data: p }] = await Promise.all([
      comprasQuery,
      supabase.from("proveedores").select("id, nombre, saldo").eq("activo", true).order("nombre"),
    ]);
    setPurchases((c as unknown as CompraRow[]) || []);
    setProviders((p || []) as unknown as Proveedor[]);
    setComprasLoading(false);
  }, [quickPeriod, purchaseFilterMode, purchaseFilterDay, purchaseFilterMonth, purchaseFilterYear, purchaseFilterFrom, purchaseFilterTo]);

  const fetchPedidos = useCallback(async () => {
    setPedidosLoading(true);
    let pedQuery = supabase
      .from("pedidos_proveedor")
      .select("*, proveedores(nombre)")
      .order("fecha", { ascending: false });

    if (pedFilterMode === "day") {
      pedQuery = pedQuery.eq("fecha", pedFilterDay);
    } else if (pedFilterMode === "month") {
      const m = pedFilterMonth.padStart(2, "0");
      const start = `${pedFilterYear}-${m}-01`;
      const nextMonth = Number(pedFilterMonth) === 12 ? 1 : Number(pedFilterMonth) + 1;
      const nextYear = Number(pedFilterMonth) === 12 ? Number(pedFilterYear) + 1 : Number(pedFilterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      pedQuery = pedQuery.gte("fecha", start).lt("fecha", end);
    } else if (pedFilterMode === "range" && pedFilterFrom && pedFilterTo) {
      pedQuery = pedQuery.gte("fecha", pedFilterFrom).lte("fecha", pedFilterTo);
    }

    const [{ data: ped }, { data: cats }, { data: subcats }] = await Promise.all([
      pedQuery,
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("subcategorias").select("id, nombre, categoria_id").order("nombre"),
    ]);
    setPedidos((ped as PedidoRow[]) || []);
    setCategorias((cats as Categoria[]) || []);
    setSubcategorias((subcats as Subcategoria[]) || []);
    setPedidosLoading(false);
  }, [pedFilterMode, pedFilterDay, pedFilterMonth, pedFilterYear, pedFilterFrom, pedFilterTo]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchCompras(), fetchPedidos()]);
  }, [fetchCompras, fetchPedidos]);

  useEffect(() => {
    fetchCompras();
  }, [fetchCompras]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  /* ══════════════════ ACTION HANDLERS ══════════════════ */

  /* ── Open compra detail ── */
  const handleOpenCompraDetail = async (compra: CompraRow) => {
    if (compra.estado === "Pendiente") {
      // Open in edit mode — load items and go to nueva-compra tab
      handleIngresarPendiente(compra);
      return;
    }
    setDetailCompra(compra);
    setActiveTab("detalle-compra");
  };

  /* ── Ingresar compra pendiente ── */
  const handleIngresarPendiente = async (compra: CompraRow) => {
    const { data } = await supabase
      .from("compra_items")
      .select("id, compra_id, producto_id, codigo, descripcion, cantidad, precio_unitario, subtotal")
      .eq("compra_id", compra.id)
      .order("created_at");

    const compraItemRows = (data || []) as any[];
    const loadedItems: CompraItem[] = [];
    for (const ci of compraItemRows) {
      const { data: prod } = await supabase.from("productos").select("id, nombre, codigo, precio, costo, stock, imagen_url").eq("id", ci.producto_id).maybeSingle();
      loadedItems.push({
        producto_id: ci.producto_id,
        nombre: ci.descripcion,
        codigo: ci.codigo || prod?.codigo || "",
        cantidad: ci.cantidad,
        costo_unitario: ci.precio_unitario,
        costo_original: prod?.costo || ci.precio_unitario,
        precio_original: prod?.precio || 0,
        descuento: 0,
        subtotal: ci.subtotal,
        actualizarPrecio: false,
        imagen_url: prod?.imagen_url || null,
        stock_actual: prod?.stock || 0,
        cajas: 0,
        sueltas: ci.cantidad,
        unidades_por_caja: 0,
      });
    }

    setCompraItems(loadedItems);
    setCompraProveedorId(compra.proveedor_id || "");
    setCompraObservacion(compra.observacion || "");
    setPendingCompraId(compra.id);
    setPedidoOrigenId(null);
    setActiveTab("nueva-compra");
  };

  /* ── Registrar compra from pedido ── */
  const handleRegistrarCompraFromPedido = async (pedido: PedidoRow) => {
    const { data: pedidoItems } = await supabase
      .from("pedido_proveedor_items")
      .select("*")
      .eq("pedido_id", pedido.id);

    if (!pedidoItems || pedidoItems.length === 0) return;

    const productIds = pedidoItems.map((i: any) => i.producto_id);
    const { data: productos } = await supabase
      .from("productos")
      .select("id, codigo, nombre, stock, costo, precio, imagen_url")
      .in("id", productIds);

    const prodMap = new Map((productos || []).map((p: any) => [p.id, p]));

    const items: CompraItem[] = pedidoItems
      .map((item: any) => {
        const prod = prodMap.get(item.producto_id);
        if (!prod) return null;
        const cantidad = item.cantidad - (item.cantidad_recibida || 0);
        if (cantidad <= 0) return null;
        const costoUnit = item.precio_unitario || prod.costo;
        return {
          producto_id: prod.id,
          codigo: prod.codigo,
          nombre: prod.nombre,
          imagen_url: prod.imagen_url,
          stock_actual: prod.stock,
          cantidad,
          cajas: 0,
          sueltas: cantidad,
          unidades_por_caja: 0,
          costo_unitario: costoUnit,
          costo_original: prod.costo,
          precio_original: prod.precio,
          descuento: 0,
          subtotal: calcSubtotal(costoUnit, cantidad, 0),
          actualizarPrecio: true,
        } as CompraItem;
      })
      .filter(Boolean) as CompraItem[];

    setCompraItems(items);
    setCompraProveedorId(pedido.proveedor_id || "");
    setCompraObservacion("");
    setPendingCompraId(null);
    setPedidoOrigenId(pedido.id);
    setActiveTab("nueva-compra");
    showAdminToast(`Pedido ${pedidoDisplayNum(pedido.id)} importado con ${items.length} productos`, "success");
  };

  /* ── Open pedido detail ── */
  const handleOpenPedidoDetail = (pedido: PedidoRow) => {
    setDetailPedido(pedido);
    setActiveTab("detalle-pedido");
  };

  /* ── Delete pedido ── */
  const handleDeletePedido = async (pedido: PedidoRow) => {
    try {
      const pedDisplay = pedidoDisplayNum(pedido.id);
      const { data: pendingCompra } = await supabase
        .from("compras")
        .select("id")
        .eq("estado", "Pendiente")
        .ilike("observacion", `%${pedDisplay}%`)
        .maybeSingle();
      if (pendingCompra) {
        await supabase.from("compra_items").delete().eq("compra_id", pendingCompra.id);
        await supabase.from("compras").delete().eq("id", pendingCompra.id);
      }
      await supabase.from("pedido_proveedor_items").delete().eq("pedido_id", pedido.id);
      await supabase.from("pedidos_proveedor").delete().eq("id", pedido.id);
      setPedidos((prev) => prev.filter((p) => p.id !== pedido.id));
      showAdminToast(`Pedido ${pedDisplay} eliminado`, "success");
    } catch (err: any) {
      console.error("Error deleting pedido:", err);
    }
  };

  /* ── Hacer pedido from stock crítico ── */
  const handleHacerPedidoFromStock = (proveedorId: string, items: ReposicionItem[]) => {
    const suggestedItems: SuggestedItem[] = items.map((item) => ({
      producto_id: item.producto_id,
      codigo: item.codigo,
      nombre: item.nombre,
      stock: item.stock,
      stock_minimo: item.stock_minimo,
      stock_maximo: item.stock_maximo,
      faltante: item.faltante,
      unidades_por_caja: 0,
      cajas: 0,
      precio_unitario: item.precio_proveedor || item.costo,
      subtotal: item.faltante * (item.precio_proveedor || item.costo),
    }));

    setPedidoItems(suggestedItems);
    setPedidoProveedorId(proveedorId);
    setActiveTab("nuevo-pedido");
  };

  /* ── Generar todos from stock crítico ── */
  const handleGenerarTodosFromStock = () => {
    setActiveTab("pedidos");
    fetchPedidos();
  };

  /* ── Auto-generate pedidos (from pedidos list) ── */
  const handleGenerarPedidos = async () => {
    // Redirect to stock-critico tab where they can use "Generar todos"
    setActiveTab("stock-critico");
  };

  /* ── After saving new compra ── */
  const handleCompraSaved = () => {
    setCompraItems([]);
    setCompraProveedorId("");
    setCompraObservacion("");
    setPendingCompraId(null);
    setPedidoOrigenId(null);
    setActiveTab("compras");
    fetchCompras();
  };

  /* ── After saving new pedido ── */
  const handlePedidoSaved = (estado: "Borrador" | "Enviado") => {
    setPedidoItems([]);
    setPedidoProveedorId("");
    if (estado === "Enviado") {
      setActiveTab("compras");
      fetchAll();
      showAdminToast("Pedido confirmado. Compra pendiente creada.", "success");
    } else {
      setActiveTab("pedidos");
      fetchPedidos();
    }
  };

  /* ══════════════════ TAB BADGES ══════════════════ */

  const comprasCount = purchases.length;
  const pedidosCount = pedidos.length;

  /* ══════════════════ RENDER ══════════════════ */

  // Detail views
  if (activeTab === "detalle-compra" && detailCompra) {
    return (
      <DetalleCompra
        compra={detailCompra}
        providers={providers}
        currentUser={currentUser}
        onBack={() => {
          setDetailCompra(null);
          setActiveTab("compras");
          fetchCompras();
        }}
        onRefresh={() => fetchCompras()}
      />
    );
  }

  if (activeTab === "detalle-pedido" && detailPedido) {
    return (
      <DetallePedido
        pedido={detailPedido}
        proveedores={providers}
        currentUser={currentUser}
        onBack={() => {
          setDetailPedido(null);
          setActiveTab("pedidos");
          fetchPedidos();
        }}
        onRefresh={() => fetchPedidos()}
        onRegistrarCompra={handleRegistrarCompraFromPedido}
        onDeletePedido={(p) => {
          handleDeletePedido(p);
          setDetailPedido(null);
          setActiveTab("pedidos");
        }}
      />
    );
  }

  // Form views
  if (activeTab === "nueva-compra") {
    return (
      <NuevaCompra
        providers={providers}
        currentUser={currentUser}
        initialItems={compraItems.length > 0 ? compraItems : undefined}
        initialProveedorId={compraProveedorId || undefined}
        initialObservacion={compraObservacion || undefined}
        pendingCompraId={pendingCompraId}
        pedidoOrigenId={pedidoOrigenId}
        onBack={() => {
          setCompraItems([]);
          setCompraProveedorId("");
          setCompraObservacion("");
          setPendingCompraId(null);
          setPedidoOrigenId(null);
          setActiveTab("compras");
        }}
        onSaved={handleCompraSaved}
        onPedidoIngresado={async (pedidoId) => {
          await supabase
            .from("pedidos_proveedor")
            .update({ estado: "Ingresado" })
            .eq("id", pedidoId);
          fetchPedidos();
        }}
      />
    );
  }

  if (activeTab === "nuevo-pedido") {
    return (
      <NuevoPedido
        proveedores={providers}
        categorias={categorias}
        subcategorias={subcategorias}
        currentUser={currentUser}
        initialItems={pedidoItems.length > 0 ? pedidoItems : undefined}
        initialProveedorId={pedidoProveedorId || undefined}
        onBack={() => {
          setPedidoItems([]);
          setPedidoProveedorId("");
          setActiveTab("pedidos");
        }}
        onSaved={handlePedidoSaved}
      />
    );
  }

  // Tab views
  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Compras</h1>
            <p className="text-sm text-muted-foreground">
              Gestión de compras, pedidos y stock
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setCompraItems([]);
              setCompraProveedorId("");
              setPendingCompraId(null);
              setPedidoOrigenId(null);
              setActiveTab("nueva-compra");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva compra
          </button>
          <button
            onClick={() => {
              setPedidoItems([]);
              setPedidoProveedorId("");
              setActiveTab("nuevo-pedido");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border bg-background hover:bg-muted transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo pedido
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {([
          { key: "compras" as const, label: "Compras", count: comprasCount, icon: Package },
          { key: "pedidos" as const, label: "Pedidos", count: pedidosCount, icon: ClipboardList },
          { key: "stock-critico" as const, label: "Stock crítico", count: null, icon: AlertTriangle },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 min-w-[20px] justify-center">
                {tab.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "compras" && (
        <ComprasList
          purchases={purchases}
          providers={providers}
          loading={comprasLoading}
          search={comprasSearch}
          setSearch={setComprasSearch}
          quickPeriod={quickPeriod}
          setQuickPeriod={setQuickPeriod}
          purchaseFilterMode={purchaseFilterMode}
          setPurchaseFilterMode={setPurchaseFilterMode}
          purchaseFilterDay={purchaseFilterDay}
          setPurchaseFilterDay={setPurchaseFilterDay}
          purchaseFilterMonth={purchaseFilterMonth}
          setPurchaseFilterMonth={setPurchaseFilterMonth}
          purchaseFilterYear={purchaseFilterYear}
          setPurchaseFilterYear={setPurchaseFilterYear}
          purchaseFilterFrom={purchaseFilterFrom}
          setPurchaseFilterFrom={setPurchaseFilterFrom}
          purchaseFilterTo={purchaseFilterTo}
          setPurchaseFilterTo={setPurchaseFilterTo}
          onNewCompra={() => {
            setCompraItems([]);
            setCompraProveedorId("");
            setPendingCompraId(null);
            setPedidoOrigenId(null);
            setActiveTab("nueva-compra");
          }}
          onOpenDetail={handleOpenCompraDetail}
          onIngresarPendiente={handleIngresarPendiente}
        />
      )}

      {activeTab === "pedidos" && (
        <PedidosList
          pedidos={pedidos}
          proveedores={providers}
          loading={pedidosLoading}
          searchTerm={pedidosSearch}
          setSearchTerm={setPedidosSearch}
          filterEstado={filterEstado}
          setFilterEstado={setFilterEstado}
          pedFilterMode={pedFilterMode}
          setPedFilterMode={setPedFilterMode}
          pedFilterDay={pedFilterDay}
          setPedFilterDay={setPedFilterDay}
          pedFilterMonth={pedFilterMonth}
          setPedFilterMonth={setPedFilterMonth}
          pedFilterYear={pedFilterYear}
          setPedFilterYear={setPedFilterYear}
          pedFilterFrom={pedFilterFrom}
          setPedFilterFrom={setPedFilterFrom}
          pedFilterTo={pedFilterTo}
          setPedFilterTo={setPedFilterTo}
          onNewPedido={() => {
            setPedidoItems([]);
            setPedidoProveedorId("");
            setActiveTab("nuevo-pedido");
          }}
          onOpenDetail={handleOpenPedidoDetail}
          onRegistrarCompra={handleRegistrarCompraFromPedido}
          onDeletePedido={handleDeletePedido}
          onGenerarPedidos={handleGenerarPedidos}
          pedirHasta={pedirHasta}
          setPedirHasta={setPedirHasta}
        />
      )}

      {activeTab === "stock-critico" && (
        <StockCritico
          onHacerPedido={handleHacerPedidoFromStock}
          onGenerarTodos={handleGenerarTodosFromStock}
          setActiveTab={setActiveTab}
        />
      )}
    </div>
  );
}
