"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { showAdminToast } from "@/components/admin-toast";
import { formatCurrency, todayARG } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Loader2,
  Sparkles,
  Trash2,
  Save,
  Send,
  Package,
  ArrowLeft,
  X,
  Copy,
  MessageCircle,
  ImageIcon,
} from "lucide-react";

import type { SuggestedItem, Proveedor, Categoria, Subcategoria } from "./types";
import { pedidoDisplayNum } from "./types";

/* ───────── props ───────── */

interface NuevoPedidoProps {
  proveedores: Proveedor[];
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  currentUser: { nombre: string } | null;
  initialItems?: SuggestedItem[];
  initialProveedorId?: string;
  onBack: () => void;
  onSaved: (estado: "Borrador" | "Enviado") => void;
}

/* ───────── component ───────── */

export default function NuevoPedido({
  proveedores,
  categorias,
  subcategorias,
  currentUser,
  initialItems,
  initialProveedorId,
  onBack,
  onSaved,
}: NuevoPedidoProps) {
  /* ── state ── */
  const [selectedProveedorId, setSelectedProveedorId] = useState(initialProveedorId || "");
  const [items, setItems] = useState<SuggestedItem[]>(initialItems || []);
  const [selectedCategoriaId, setSelectedCategoriaId] = useState("all");
  const [selectedSubcategoriaId, setSelectedSubcategoriaId] = useState("all");
  const [pedirHasta, setPedirHasta] = useState<"minimo" | "maximo">("maximo");
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [suggesting, setSuggesting] = useState(false);

  // Searchable dropdown states
  const [provSearch, setProvSearch] = useState("");
  const [provOpen, setProvOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [subcatSearch, setSubcatSearch] = useState("");
  const [subcatOpen, setSubcatOpen] = useState(false);
  const provRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const subcatRef = useRef<HTMLDivElement>(null);

  // Manual product add dialog
  const [pedidoProductSearchOpen, setPedidoProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<
    { id: string; codigo: string; nombre: string; stock: number; stock_minimo: number; stock_maximo: number; costo: number; imagen_url: string | null; precio_proveedor: number | null; unidades_por_caja: number }[]
  >([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  /* ── click outside handler ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (provRef.current && !provRef.current.contains(e.target as Node)) setProvOpen(false);
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
      if (subcatRef.current && !subcatRef.current.contains(e.target as Node)) setSubcatOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── suggest faltantes ── */

  const handleSugerirFaltantes = async () => {
    if (!selectedProveedorId) return;
    setSuggesting(true);

    let query = supabase
      .from("productos")
      .select("id, codigo, nombre, stock, stock_minimo, stock_maximo, costo, categoria_id, subcategoria_id, producto_proveedores!inner(proveedor_id, precio_proveedor, cantidad_minima_pedido), presentaciones(nombre, cantidad)")
      .eq("activo", true)
      .eq("producto_proveedores.proveedor_id", selectedProveedorId);

    if (selectedCategoriaId !== "all") {
      query = query.eq("categoria_id", selectedCategoriaId);
    }
    if (selectedSubcategoriaId !== "all") {
      query = query.eq("subcategoria_id", selectedSubcategoriaId);
    }

    const { data } = await query;

    if (data) {
      const suggested: SuggestedItem[] = (data as any[])
        .filter((p) => {
          const stock = p.stock ?? 0;
          const minimo = p.stock_minimo ?? 0;
          const maximo = p.stock_maximo ?? 0;
          if (pedirHasta === "maximo") {
            return (maximo > 0 && stock < maximo) || (minimo > 0 && stock < minimo) || stock < 0;
          }
          return stock < minimo || stock < 0;
        })
        .map((p) => {
          const pp = (p.producto_proveedores || [])[0];
          const stock = p.stock ?? 0;
          const maximo = p.stock_maximo ?? 0;
          const minimo = p.stock_minimo ?? 0;
          let faltante: number;
          if (pedirHasta === "maximo" && maximo > 0) {
            faltante = Math.max(pp?.cantidad_minima_pedido || 1, maximo - stock);
          } else if (minimo > 0) {
            faltante = Math.max(pp?.cantidad_minima_pedido || 1, minimo - stock);
          } else if (stock < 0) {
            faltante = Math.abs(stock);
          } else {
            faltante = pp?.cantidad_minima_pedido || 1;
          }
          // Round up to full boxes if product has a Caja presentation
          const cajaPres = (p.presentaciones || []).find((pr: any) => pr.nombre?.toLowerCase().startsWith("caja") && pr.cantidad > 1);
          const unidadesPorCaja = cajaPres ? cajaPres.cantidad : 0;
          if (unidadesPorCaja > 0) {
            faltante = Math.ceil(faltante / unidadesPorCaja) * unidadesPorCaja;
          }
          const cajas = unidadesPorCaja > 0 ? Math.round(faltante / unidadesPorCaja) : 0;
          const precio = pp?.precio_proveedor || p.costo || 0;
          return {
            producto_id: p.id,
            codigo: p.codigo || "",
            nombre: p.nombre,
            stock: p.stock || 0,
            stock_minimo: p.stock_minimo || 0,
            stock_maximo: p.stock_maximo || 0,
            faltante,
            unidades_por_caja: unidadesPorCaja,
            cajas,
            precio_unitario: precio,
            subtotal: faltante * precio,
          };
        });

      const existingIds = new Set(items.map((i) => i.producto_id));
      const merged = [...items, ...suggested.filter((s) => !existingIds.has(s.producto_id))];
      setItems(merged);
    }
    setSuggesting(false);
  };

  /* ── manual product search ── */

  const searchProducts = useCallback(
    async (term: string) => {
      if (term.length < 2) {
        setProductResults([]);
        return;
      }
      setSearchingProducts(true);

      let query = supabase
        .from("productos")
        .select("id, codigo, nombre, stock, stock_minimo, stock_maximo, costo, imagen_url, producto_proveedores(proveedor_id, precio_proveedor), presentaciones(nombre, cantidad)")
        .eq("activo", true)
        .limit(20);

      if (selectedProveedorId) {
        query = supabase
          .from("productos")
          .select("id, codigo, nombre, stock, stock_minimo, stock_maximo, costo, imagen_url, producto_proveedores!inner(proveedor_id, precio_proveedor), presentaciones(nombre, cantidad)")
          .eq("activo", true)
          .eq("producto_proveedores.proveedor_id", selectedProveedorId)
          .limit(20);
      }

      const { data } = await query;

      if (data) {
        const normalized = norm(term);
        const filtered = (data as any[]).filter(
          (p) =>
            norm(p.nombre).includes(normalized) ||
            norm(p.codigo || "").includes(normalized)
        );
        setProductResults(
          filtered.map((p) => {
            const pp = (p.producto_proveedores || []).find(
              (pp: any) => pp.proveedor_id === selectedProveedorId
            );
            const cajaPres = (p.presentaciones || []).find(
              (pr: any) => pr.nombre?.toLowerCase().startsWith("caja") && pr.cantidad > 1
            );
            return {
              id: p.id,
              codigo: p.codigo || "",
              nombre: p.nombre,
              stock: p.stock ?? 0,
              stock_minimo: p.stock_minimo ?? 0,
              stock_maximo: p.stock_maximo ?? 0,
              costo: p.costo || 0,
              imagen_url: p.imagen_url,
              precio_proveedor: pp?.precio_proveedor || null,
              unidades_por_caja: cajaPres ? cajaPres.cantidad : 0,
            };
          })
        );
      }
      setSearchingProducts(false);
    },
    [selectedProveedorId]
  );

  // Debounced search
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleProductSearchChange = (term: string) => {
    setProductSearch(term);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchProducts(term), 300);
  };

  const addProductFromSearch = (product: (typeof productResults)[number]) => {
    // Don't add duplicates
    if (items.some((i) => i.producto_id === product.id)) {
      showAdminToast("El producto ya esta en el pedido", "info");
      return;
    }

    const precio = product.precio_proveedor || product.costo || 0;
    const faltante = 1;
    const cajas = product.unidades_por_caja > 0 ? Math.round(faltante / product.unidades_por_caja * 10) / 10 : 0;

    const newItem: SuggestedItem = {
      producto_id: product.id,
      codigo: product.codigo,
      nombre: product.nombre,
      stock: product.stock,
      stock_minimo: product.stock_minimo,
      stock_maximo: product.stock_maximo,
      faltante,
      unidades_por_caja: product.unidades_por_caja,
      cajas,
      precio_unitario: precio,
      subtotal: faltante * precio,
    };

    setItems((prev) => [...prev, newItem]);
    showAdminToast(`${product.nombre} agregado`, "success");
  };

  /* ── item editing ── */

  const updateItemField = (index: number, field: "faltante" | "precio_unitario", value: number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].subtotal = updated[index].faltante * updated[index].precio_unitario;
      if (field === "faltante" && updated[index].unidades_por_caja > 0) {
        updated[index].cajas = Math.round(value / updated[index].unidades_por_caja * 10) / 10;
      }
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalEstimado = items.reduce((a, i) => a + i.subtotal, 0);

  /* ── helper: create compra pendiente from pedido ── */

  const crearCompraPendiente = async (
    pedidoId: string,
    proveedorId: string,
    itemsData: { producto_id: string; codigo: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[],
    totalEstimadoVal: number,
  ) => {
    const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "compra" });
    const numero = numData || "C-0000";
    const fecha = todayARG();
    const pedDisplay = pedidoDisplayNum(pedidoId);

    const { data: compra, error: compraError } = await supabase
      .from("compras")
      .insert({
        numero,
        fecha,
        proveedor_id: proveedorId,
        total: totalEstimadoVal,
        estado: "Pendiente",
        forma_pago: "Efectivo",
        estado_pago: "Pendiente",
        observacion: `Generado desde pedido ${pedDisplay}`,
      })
      .select("id")
      .single();

    if (compraError || !compra) {
      console.error("Error creando compra pendiente:", compraError?.message);
      return;
    }

    const compraItems = itemsData.map((item) => ({
      compra_id: compra.id,
      producto_id: item.producto_id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
    }));
    await supabase.from("compra_items").insert(compraItems);
  };

  /* ── save pedido ── */

  const savePedido = async (estado: "Borrador" | "Enviado") => {
    if (!selectedProveedorId || items.length === 0) return;
    setSaving(true);
    setSaveError("");

    try {
      const { data: pedido, error } = await supabase
        .from("pedidos_proveedor")
        .insert({
          proveedor_id: selectedProveedorId,
          fecha: todayARG(),
          estado,
          costo_total_estimado: totalEstimado,
          observacion: observacion || null,
        })
        .select("id")
        .single();

      if (error || !pedido) {
        setSaveError(error?.message || "Error al guardar el pedido.");
        setSaving(false);
        return;
      }

      const rows = items.map((item) => ({
        pedido_id: pedido.id,
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.nombre,
        cantidad: item.faltante,
        faltante: item.faltante,
        cantidad_recibida: 0,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));

      await supabase.from("pedido_proveedor_items").insert(rows);

      // Si se confirma (Enviado), crear compra pendiente
      if (estado === "Enviado") {
        const compraItemsData = items.map((item) => ({
          producto_id: item.producto_id,
          codigo: item.codigo,
          descripcion: item.nombre,
          cantidad: item.faltante,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
        }));
        await crearCompraPendiente(pedido.id, selectedProveedorId, compraItemsData, totalEstimado);
      }

      showAdminToast(
        estado === "Borrador"
          ? `Borrador ${pedidoDisplayNum(pedido.id)} guardado`
          : `Pedido ${pedidoDisplayNum(pedido.id)} guardado y registrado como compra pendiente`,
        "success"
      );

      onSaved(estado);
    } catch (err: any) {
      setSaveError(err?.message || "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  /* ── build WhatsApp / copy text ── */

  const buildPedidoText = () => {
    const provNombre = proveedores.find((p) => p.id === selectedProveedorId)?.nombre || "Proveedor";
    const lines = items.map((i) => `\u2022 ${i.faltante} - ${i.nombre}`);
    return `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
  };

  /* ═══════════════════ RENDER ═══════════════════ */

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Nuevo Pedido a Proveedor</h1>
          <p className="text-muted-foreground text-sm">Selecciona proveedor y genera la lista de productos faltantes</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="overflow-visible">
        <CardContent className="pt-6 overflow-visible">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            {/* Proveedor searchable dropdown */}
            <div ref={provRef}>
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Proveedor</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar proveedor..."
                  value={selectedProveedorId ? (proveedores.find((p) => p.id === selectedProveedorId)?.nombre ?? provSearch) : provSearch}
                  onChange={(e) => { setProvSearch(e.target.value); setSelectedProveedorId(""); setProvOpen(true); }}
                  onFocus={() => setProvOpen(true)}
                  className="pl-9"
                />
                {selectedProveedorId && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedProveedorId(""); setProvSearch(""); }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
                {provOpen && !selectedProveedorId && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                    {proveedores.filter((p) => norm(p.nombre).includes(norm(provSearch))).map((p) => (
                      <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setSelectedProveedorId(p.id); setProvSearch(""); setProvOpen(false); }}>
                        {p.nombre}
                      </button>
                    ))}
                    {proveedores.filter((p) => norm(p.nombre).includes(norm(provSearch))).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Categoria searchable dropdown */}
            <div ref={catRef}>
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Categoria (opcional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar categoria..."
                  value={selectedCategoriaId !== "all" ? (categorias.find((c) => c.id === selectedCategoriaId)?.nombre ?? catSearch) : catSearch}
                  onChange={(e) => { setCatSearch(e.target.value); setSelectedCategoriaId("all"); setSelectedSubcategoriaId("all"); setCatOpen(true); }}
                  onFocus={() => setCatOpen(true)}
                  className="pl-9"
                />
                {selectedCategoriaId !== "all" && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedCategoriaId("all"); setSelectedSubcategoriaId("all"); setCatSearch(""); }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
                {catOpen && selectedCategoriaId === "all" && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                    <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setSelectedCategoriaId("all"); setCatSearch(""); setCatOpen(false); }}>Todas</button>
                    {categorias.filter((c) => norm(c.nombre).includes(norm(catSearch))).map((c) => (
                      <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setSelectedCategoriaId(c.id); setSelectedSubcategoriaId("all"); setCatSearch(""); setCatOpen(false); }}>
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Subcategoria searchable dropdown */}
            <div ref={subcatRef}>
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Subcategoria (opcional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar subcategoria..."
                  value={selectedSubcategoriaId !== "all" ? (subcategorias.find((s) => s.id === selectedSubcategoriaId)?.nombre ?? subcatSearch) : subcatSearch}
                  onChange={(e) => { setSubcatSearch(e.target.value); setSelectedSubcategoriaId("all"); setSubcatOpen(true); }}
                  onFocus={() => setSubcatOpen(true)}
                  className="pl-9"
                />
                {selectedSubcategoriaId !== "all" && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedSubcategoriaId("all"); setSubcatSearch(""); }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
                {subcatOpen && selectedSubcategoriaId === "all" && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                    <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setSelectedSubcategoriaId("all"); setSubcatSearch(""); setSubcatOpen(false); }}>Todas</button>
                    {subcategorias
                      .filter((s) => selectedCategoriaId === "all" || s.categoria_id === selectedCategoriaId)
                      .filter((s) => norm(s.nombre).includes(norm(subcatSearch)))
                      .map((s) => (
                        <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                          onClick={() => { setSelectedSubcategoriaId(s.id); setSubcatSearch(""); setSubcatOpen(false); }}>
                          {s.nombre}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions column */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-lg border overflow-hidden text-sm">
                <button className={`px-3 py-2 ${pedirHasta === "maximo" ? "bg-primary text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setPedirHasta("maximo")}>Hasta max</button>
                <button className={`px-3 py-2 ${pedirHasta === "minimo" ? "bg-primary text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setPedirHasta("minimo")}>Hasta min</button>
              </div>
              <Button onClick={handleSugerirFaltantes} disabled={!selectedProveedorId || suggesting}>
                {suggesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Sugerir
              </Button>
              <Button variant="outline" onClick={() => setPedidoProductSearchOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar producto
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items table */}
      <Card>
        <CardContent className="pt-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No hay productos en el pedido</p>
              <p className="text-xs mt-1">Selecciona un proveedor y presiona &quot;Sugerir faltantes&quot; o &quot;Agregar producto&quot;</p>
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden divide-y">
                {items.map((item, idx) => (
                  <div key={item.producto_id} className="py-3 px-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.nombre}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.codigo}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0" onClick={() => removeItem(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Stock</span>
                        <span>{item.stock}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Min / Max</span>
                        <span>{item.stock_minimo} / {item.stock_maximo}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Cajas</span>
                        {item.unidades_por_caja > 0 ? (
                          <span className="font-medium">{item.cajas} <span className="text-muted-foreground">({item.unidades_por_caja} un.)</span></span>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-muted-foreground mb-1 block">Cantidad</label>
                        <Input type="number" min={1} value={item.faltante}
                          onChange={(e) => updateItemField(idx, "faltante", Math.max(1, Number(e.target.value)))}
                          className="h-8 text-center" />
                      </div>
                      <div>
                        <label className="text-muted-foreground mb-1 block">Precio Unit.</label>
                        <Input type="number" min={0} value={item.precio_unitario}
                          onChange={(e) => updateItemField(idx, "precio_unitario", Math.max(0, Number(e.target.value)))}
                          className="h-8 text-right" />
                      </div>
                    </div>
                    <div className="flex items-center justify-end text-xs">
                      <span className="text-muted-foreground mr-2">Subtotal:</span>
                      <span className="font-semibold">{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 px-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      navigator.clipboard.writeText(buildPedidoText());
                      showAdminToast("Pedido copiado al portapapeles", "success");
                    }}>
                      <Copy className="w-4 h-4 mr-1.5" />Copiar
                    </Button>
                    <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => {
                      window.open(`https://wa.me/?text=${encodeURIComponent(buildPedidoText())}`, "_blank");
                    }}>
                      <MessageCircle className="w-4 h-4 mr-1.5" />WhatsApp
                    </Button>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground mr-2">Total:</span>
                    <span className="text-sm font-bold">{formatCurrency(totalEstimado)}</span>
                  </div>
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-4 font-medium">Codigo</th>
                      <th className="text-left py-3 px-4 font-medium">Producto</th>
                      <th className="text-center py-3 px-4 font-medium">Stock</th>
                      <th className="text-center py-3 px-4 font-medium">Min</th>
                      <th className="text-center py-3 px-4 font-medium">Max</th>
                      <th className="text-center py-3 px-4 font-medium">Cantidad</th>
                      <th className="text-center py-3 px-4 font-medium">Cajas</th>
                      <th className="text-right py-3 px-4 font-medium">Precio Unit.</th>
                      <th className="text-right py-3 px-4 font-medium">Subtotal</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.producto_id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-2 px-4 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                        <td className="py-2 px-4 font-medium">{item.nombre}</td>
                        <td className="py-2 px-4 text-center text-muted-foreground">{item.stock}</td>
                        <td className="py-2 px-4 text-center text-muted-foreground">{item.stock_minimo}</td>
                        <td className="py-2 px-4 text-center text-muted-foreground">{item.stock_maximo}</td>
                        <td className="py-2 px-4 text-center">
                          <Input type="number" min={1} value={item.faltante}
                            onChange={(e) => updateItemField(idx, "faltante", Math.max(1, Number(e.target.value)))}
                            className="w-20 mx-auto text-center h-8" />
                        </td>
                        <td className="py-2 px-4 text-center text-muted-foreground">
                          {item.unidades_por_caja > 0 ? (
                            <span className="font-medium">{item.cajas} <span className="text-xs text-muted-foreground">({item.unidades_por_caja} un.)</span></span>
                          ) : (
                            <span className="text-xs text-muted-foreground">&mdash;</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-right">
                          <Input type="number" min={0} value={item.precio_unitario}
                            onChange={(e) => updateItemField(idx, "precio_unitario", Math.max(0, Number(e.target.value)))}
                            className="w-28 ml-auto text-right h-8" />
                        </td>
                        <td className="py-2 px-4 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                        <td className="py-2 px-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => removeItem(idx)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center border-t pt-3 mt-1 px-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      navigator.clipboard.writeText(buildPedidoText());
                      showAdminToast("Pedido copiado al portapapeles", "success");
                    }}>
                      <Copy className="w-4 h-4 mr-1.5" />Copiar
                    </Button>
                    <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => {
                      window.open(`https://wa.me/?text=${encodeURIComponent(buildPedidoText())}`, "_blank");
                    }}>
                      <MessageCircle className="w-4 h-4 mr-1.5" />WhatsApp
                    </Button>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground mr-4">Total estimado:</span>
                    <span className="text-sm font-bold">{formatCurrency(totalEstimado)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Observaciones + Save buttons */}
      {items.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Observaciones</Label>
              <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Notas adicionales para el pedido..." />
            </div>
            {saveError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{saveError}</div>
            )}
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => { setSaveError(""); onBack(); }}>Cancelar</Button>
              <Button variant="secondary" onClick={() => savePedido("Borrador")} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar Borrador
              </Button>
              <Button onClick={() => savePedido("Enviado")} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Confirmar Pedido
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Manual product add dialog ── */}
      <Dialog open={pedidoProductSearchOpen} onOpenChange={setPedidoProductSearchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar producto al pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o codigo..."
                value={productSearch}
                onChange={(e) => handleProductSearchChange(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {searchingProducts && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!searchingProducts && productSearch.length >= 2 && productResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Package className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No se encontraron productos</p>
              </div>
            )}

            {!searchingProducts && productResults.length > 0 && (
              <div className="max-h-[350px] overflow-y-auto divide-y">
                {productResults.map((product) => {
                  const alreadyAdded = items.some((i) => i.producto_id === product.id);
                  return (
                    <button
                      key={product.id}
                      className={`w-full text-left px-3 py-3 hover:bg-muted transition-colors flex items-center gap-3 ${alreadyAdded ? "opacity-50" : ""}`}
                      onClick={() => addProductFromSearch(product)}
                      disabled={alreadyAdded}
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {product.imagen_url ? (
                          <img src={product.imagen_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.nombre}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{product.codigo}</span>
                          <span>&middot;</span>
                          <span>Stock: {product.stock}</span>
                          {product.precio_proveedor && (
                            <>
                              <span>&middot;</span>
                              <span>{formatCurrency(product.precio_proveedor)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {alreadyAdded ? (
                        <Badge variant="secondary" className="shrink-0 text-xs">Agregado</Badge>
                      ) : (
                        <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
