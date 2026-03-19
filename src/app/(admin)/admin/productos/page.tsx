"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Producto, Categoria } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Package,
  Loader2,
  X,
  FileSpreadsheet,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Box,
  ShoppingBag,
  ArrowRight,
  RefreshCw,
  Clock,
  Filter,
  Settings,
  Layers,
  ChevronDown,
  Copy,
} from "lucide-react";
import * as XLSX from "xlsx";
import { ImageUpload } from "@/components/image-upload";
import { showAdminToast } from "@/components/admin-toast";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
}

interface Marca {
  id: string;
  nombre: string;
}

interface ProveedorOption {
  id: string;
  nombre: string;
  activo: boolean;
}

interface Presentacion {
  id?: string;
  producto_id?: string;
  nombre: string;
  cantidad: number;
  sku: string;
  costo: number;
  precio: number;
  precio_oferta: number | null;
  _deleted?: boolean;
}

interface MovimientoItem {
  id: string;
  tipo: string;
  cantidad_antes: number;
  cantidad_despues: number;
  cantidad: number;
  referencia: string | null;
  descripcion: string | null;
  usuario: string | null;
  created_at: string;
  orden_id: string | null;
}

type ProductoWithRelations = Producto & {
  categorias: { nombre: string } | null;
  marcas: { nombre: string } | null;
  subcategoria_id?: string | null;
  marca_id?: string | null;
  stock_maximo?: number;
  descripcion_detallada?: string | null;
  imagen_url?: string | null;
  visibilidad?: string;
};

export default function ProductosPage() {
  const [products, setProducts] = useState<ProductoWithRelations[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductoWithRelations | null>(null);
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [marcaFilter, setMarcaFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [stockFilter, setStockFilter] = useState("all");
  const [comboFilter, setComboFilter] = useState("all");
  const [sortBy, setSortBy] = useState("nombre_asc");
  const [page, setPage] = useState(1);
  // Combobox states
  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [subcatSearch, setSubcatSearch] = useState("");
  const [subcatOpen, setSubcatOpen] = useState(false);
  const [marcaSearch, setMarcaSearch] = useState("");
  const [marcaOpen, setMarcaOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const subcatRef = useRef<HTMLDivElement>(null);
  const marcaRef = useRef<HTMLDivElement>(null);
  const [pageSize] = useState(50);
  const importRef = useRef<HTMLInputElement>(null);

  // History dialog state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<ProductoWithRelations | null>(null);
  const [historyItems, setHistoryItems] = useState<MovimientoItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Order detail dialog state
  const [ordenDetailOpen, setOrdenDetailOpen] = useState(false);
  const [ordenDetailLoading, setOrdenDetailLoading] = useState(false);
  const [ordenDetail, setOrdenDetail] = useState<{
    id: string;
    numero: string;
    fecha: string;
    total: number;
    forma_pago: string;
    tipo_comprobante: string;
    estado: string;
    observacion: string | null;
    cliente: { nombre: string; cuit: string | null } | null;
    items: { id: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; unidad_medida: string | null; unidades_por_presentacion?: number }[];
  } | null>(null);

  const openOrdenDetail = useCallback(async (ordenId: string) => {
    setOrdenDetailOpen(true);
    setOrdenDetailLoading(true);
    setOrdenDetail(null);
    try {
      // Try ventas first
      const { data: venta } = await supabase
        .from("ventas")
        .select("id, numero, fecha, total, forma_pago, tipo_comprobante, estado, observacion, clientes(nombre, cuit)")
        .eq("id", ordenId)
        .single();
      if (venta) {
        const { data: items } = await supabase
          .from("venta_items")
          .select("id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida, unidades_por_presentacion")
          .eq("venta_id", ordenId)
          .order("created_at");
        setOrdenDetail({
          id: venta.id,
          numero: venta.numero,
          fecha: venta.fecha,
          total: venta.total,
          forma_pago: venta.forma_pago,
          tipo_comprobante: venta.tipo_comprobante,
          estado: venta.estado,
          observacion: venta.observacion,
          cliente: Array.isArray(venta.clientes) ? venta.clientes[0] ?? null : venta.clientes as { nombre: string; cuit: string | null } | null,
          items: items || [],
        });
      } else {
        // Try compras
        const { data: compra } = await supabase
          .from("compras")
          .select("id, numero, fecha, total, estado, observacion, proveedores(nombre)")
          .eq("id", ordenId)
          .single();
        if (compra) {
          const { data: items } = await supabase
            .from("compra_items")
            .select("id, descripcion, cantidad, precio_unitario, subtotal")
            .eq("compra_id", ordenId)
            .order("created_at");
          const provNombre = Array.isArray(compra.proveedores)
            ? compra.proveedores[0]?.nombre ?? null
            : (compra.proveedores as { nombre: string } | null)?.nombre ?? null;
          setOrdenDetail({
            id: compra.id,
            numero: compra.numero,
            fecha: compra.fecha,
            total: compra.total,
            forma_pago: "—",
            tipo_comprobante: "Compra",
            estado: compra.estado,
            observacion: compra.observacion,
            cliente: provNombre ? { nombre: provNombre, cuit: null } : null,
            items: (items || []).map((i: any) => ({ ...i, unidad_medida: "UN" })),
          });
        }
      }
    } catch (e) {
      console.error("Error fetching order detail", e);
    } finally {
      setOrdenDetailLoading(false);
    }
  }, []);

  // Form state
  const [form, setForm] = useState({
    codigo: "",
    nombre: "",
    categoria_id: "",
    subcategoria_id: "",
    marca_id: "",
    stock: 0,
    stock_minimo: 0,
    stock_maximo: 0,
    precio: 0,
    costo: 0,
    unidad_medida: "UN",
    descripcion_detallada: "",
    visibilidad: "visible",
    imagen_url: "",
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  // Searchable dropdown states for clasificacion
  const [formCatSearch, setFormCatSearch] = useState("");
  const [formCatOpen, setFormCatOpen] = useState(false);
  const [formSubSearch, setFormSubSearch] = useState("");
  const [formSubOpen, setFormSubOpen] = useState(false);
  const [formMarcaSearch, setFormMarcaSearch] = useState("");
  const [formMarcaOpen, setFormMarcaOpen] = useState(false);

  const [selectedProveedores, setSelectedProveedores] = useState<string[]>([]);
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([]);

  // Combo state
  const [isCombo, setIsCombo] = useState(false);
  const [comboItems, setComboItems] = useState<{ producto_id: string; cantidad: number; descuento: number; producto?: { id: string; codigo: string; nombre: string; precio: number; costo: number; stock: number } }[]>([]);
  const [allNonCombos, setAllNonCombos] = useState<{ id: string; codigo: string; nombre: string; precio: number; costo: number; stock: number }[]>([]);
  const [comboSearchOpen, setComboSearchOpen] = useState(false);

  // Auto-fill costo from combo components
  useEffect(() => {
    if (!isCombo || comboItems.length === 0) return;
    const costoTotal = comboItems.reduce((a, i) => a + (i.producto?.costo || 0) * i.cantidad, 0);
    setForm((prev) => ({ ...prev, costo: costoTotal }));
  }, [comboItems, isCombo]);
  const [comboProductSearch, setComboProductSearch] = useState("");
  const [selectedComboRow, setSelectedComboRow] = useState<string | null>(null);
  const [presCodigoMap, setPresCodigoMap] = useState<Record<string, { codigo: string }[]>>({});
  const [presDisplayMap, setPresDisplayMap] = useState<Record<string, { nombre: string; cantidad: number }[]>>({});
  const [comboStockMap, setComboStockMap] = useState<Record<string, number>>({});

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: allPres }, { data: allCI }] = await Promise.all([
      supabase.from("productos").select("id, codigo, nombre, precio, costo, stock, stock_minimo, stock_maximo, categoria_id, subcategoria_id, marca_id, imagen_url, es_combo, activo, unidad_medida, descripcion_detallada, visibilidad, updated_at, categorias(nombre), marcas(nombre)").order("nombre"),
      supabase.from("presentaciones").select("producto_id, sku, nombre, cantidad"),
      supabase.from("combo_items").select("combo_id, cantidad, productos!combo_items_producto_id_fkey(stock)"),
    ]);
    const allProds = (data as unknown as ProductoWithRelations[]) || [];
    setProducts(allProds);
    setAllNonCombos(allProds.filter((p: any) => !p.es_combo).map((p: any) => ({
      id: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio, costo: p.costo, stock: p.stock,
    })));
    if (allPres) {
      const map: Record<string, { codigo: string }[]> = {};
      const displayMap: Record<string, { nombre: string; cantidad: number }[]> = {};
      for (const pr of allPres) {
        if (!map[pr.producto_id]) map[pr.producto_id] = [];
        map[pr.producto_id].push({ codigo: pr.sku || "" });
        // Track non-unit presentations for display (boxes and medio carton)
        if (pr.cantidad !== 1) {
          if (!displayMap[pr.producto_id]) displayMap[pr.producto_id] = [];
          displayMap[pr.producto_id].push({ nombre: pr.nombre || (pr.cantidad < 1 ? "Medio Cartón" : `x${pr.cantidad}`), cantidad: pr.cantidad });
        }
      }
      setPresCodigoMap(map);
      setPresDisplayMap(displayMap);
    }
    // Build combo stock map: min(floor(componentStock / qty)) per combo
    if (allCI) {
      const byCombo: Record<string, { stock: number; cantidad: number }[]> = {};
      for (const ci of allCI as any[]) {
        const s = ci.productos?.stock ?? 0;
        if (!byCombo[ci.combo_id]) byCombo[ci.combo_id] = [];
        byCombo[ci.combo_id].push({ stock: s, cantidad: ci.cantidad });
      }
      const stockMap: Record<string, number> = {};
      for (const [comboId, items] of Object.entries(byCombo)) {
        stockMap[comboId] = items.length === 0 ? 0 : Math.min(...items.map((i) => Math.floor(i.stock / i.cantidad)));
      }
      setComboStockMap(stockMap);
    }
    setLoading(false);
  }, []);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from("categorias").select("id, nombre").order("nombre");
    setCategories((data || []) as unknown as Categoria[]);
  }, []);

  const fetchSubcategories = useCallback(async () => {
    const { data } = await supabase.from("subcategorias").select("id, nombre, categoria_id").order("nombre");
    setSubcategories(data || []);
  }, []);

  const fetchMarcas = useCallback(async () => {
    const { data } = await supabase.from("marcas").select("id, nombre").order("nombre");
    setMarcas(data || []);
  }, []);

  const fetchProveedores = useCallback(async () => {
    const { data } = await supabase
      .from("proveedores")
      .select("id, nombre, activo")
      .eq("activo", true)
      .order("nombre");
    setProveedores(data || []);
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchSubcategories();
    fetchMarcas();
    fetchProveedores();
  }, [fetchProducts, fetchCategories, fetchSubcategories, fetchMarcas, fetchProveedores]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
      if (subcatRef.current && !subcatRef.current.contains(e.target as Node)) setSubcatOpen(false);
      if (marcaRef.current && !marcaRef.current.contains(e.target as Node)) setMarcaOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const resetForm = () => {
    setForm({
      codigo: "",
      nombre: "",
      categoria_id: "",
      subcategoria_id: "",
      marca_id: "",
      stock: 0,
      stock_minimo: 0,
      stock_maximo: 0,
      precio: 0,
      costo: 0,
      unidad_medida: "UN",
      descripcion_detallada: "",
      visibilidad: "visible",
      imagen_url: "",
    });
    setSelectedProveedores([]);
    setPresentaciones([]);
    setEditingProduct(null);
    setShowDescription(false);
    setIsCombo(false);
    setComboItems([]);
    setSelectedComboRow(null);
  };

  const openNew = () => {
    resetForm();
    setPresentaciones([
      { nombre: "Unidad", cantidad: 1, sku: form.codigo || "", costo: 0, precio: 0, precio_oferta: null },
    ]);
    setDialogOpen(true);
  };

  const openEdit = async (p: ProductoWithRelations) => {
    setEditingProduct(p);
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      categoria_id: p.categoria_id || "",
      subcategoria_id: p.subcategoria_id || "",
      marca_id: p.marca_id || "",
      stock: p.stock,
      stock_minimo: p.stock_minimo ?? 0,
      stock_maximo: p.stock_maximo ?? 0,
      precio: p.precio,
      costo: p.costo,
      unidad_medida: p.unidad_medida,
      descripcion_detallada: p.descripcion_detallada || "",
      visibilidad: p.visibilidad || "visible",
      imagen_url: p.imagen_url || "",
    });
    setShowDescription(!!(p.descripcion_detallada));

    // Load proveedores for this product
    const { data: provData } = await supabase
      .from("producto_proveedores")
      .select("proveedor_id")
      .eq("producto_id", p.id);
    setSelectedProveedores((provData || []).map((pp) => pp.proveedor_id));

    // Load presentaciones for this product
    const { data: presData } = await supabase
      .from("presentaciones")
      .select("id, producto_id, nombre, cantidad, sku, costo, precio, precio_oferta")
      .eq("producto_id", p.id)
      .order("cantidad");
    const loadedPres = (presData || []) as Presentacion[];
    // If no unit presentation exists, auto-add one with the product's costo and precio
    if (!loadedPres.some((pr) => pr.cantidad === 1)) {
      loadedPres.unshift({
        nombre: "Unidad",
        cantidad: 1,
        sku: "",
        costo: p.costo,
        precio: p.precio,
        precio_oferta: null,
      });
    }
    setPresentaciones(loadedPres);

    // Load combo items if applicable
    if ((p as any).es_combo) {
      setIsCombo(true);
      setComboItems([]);
      const { data: ciData } = await supabase
        .from("combo_items")
        .select("*, productos!combo_items_producto_id_fkey(id, codigo, nombre, precio, costo, stock)")
        .eq("combo_id", p.id);
      setComboItems((ciData || []).map((d: any) => ({
        producto_id: d.producto_id,
        cantidad: d.cantidad,
        descuento: d.descuento ?? 0,
        producto: d.productos,
      })));
    } else {
      setIsCombo(false);
      setComboItems([]);
    }

    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let codigo = form.codigo.trim();
      if (!codigo && isCombo) codigo = `COMBO-${Date.now()}`;

      const payload: Record<string, unknown> = {
        codigo,
        nombre: form.nombre,
        categoria_id: form.categoria_id || null,
        subcategoria_id: form.subcategoria_id || null,
        marca_id: form.marca_id || null,
        stock: form.stock,
        stock_minimo: form.stock_minimo,
        stock_maximo: form.stock_maximo,
        precio: form.precio,
        costo: form.costo,
        unidad_medida: form.unidad_medida,
        descripcion_detallada: form.descripcion_detallada || null,
        visibilidad: form.visibilidad,
        imagen_url: form.imagen_url || null,
        fecha_actualizacion: new Date().toISOString(),
        es_combo: isCombo,
        activo: true,
      };

      let productId: string;

      if (editingProduct) {
        // Try to save previous price if price changed
        if (editingProduct.precio !== form.precio) {
          (payload as any).precio_anterior = editingProduct.precio;
        }
        let { error } = await supabase.from("productos").update(payload).eq("id", editingProduct.id);
        // If precio_anterior column doesn't exist yet, retry without it
        if (error && error.message?.includes("precio_anterior")) {
          delete (payload as any).precio_anterior;
          ({ error } = await supabase.from("productos").update(payload).eq("id", editingProduct.id));
        }
        if (error) {
          if (error.code === "23505") throw new Error(`El código "${codigo}" ya está en uso.`);
          throw new Error(error.message);
        }
        productId = editingProduct.id;
      } else {
        const { data, error } = await supabase.from("productos").insert(payload).select("id").single();
        if (error || !data) {
          if (error?.code === "23505") throw new Error(`El código "${codigo}" ya está en uso.`);
          throw new Error(error?.message || "Error al crear producto");
        }
        productId = data.id;
      }

      if (isCombo) {
        // Sync combo items
        await supabase.from("combo_items").delete().eq("combo_id", productId);
        if (comboItems.length > 0) {
          await supabase.from("combo_items").insert(
            comboItems.map((i) => ({ combo_id: productId, producto_id: i.producto_id, cantidad: i.cantidad }))
          );
        }
      } else {
        // Sync proveedores
        await supabase.from("producto_proveedores").delete().eq("producto_id", productId);
        if (selectedProveedores.length > 0) {
          await supabase.from("producto_proveedores").insert(
            selectedProveedores.map((proveedor_id) => ({
              producto_id: productId,
              proveedor_id,
            }))
          );
        }
      }

      // Sync presentaciones (only for non-combos)
      if (!isCombo) {
      const toKeep = presentaciones.filter((p) => !p._deleted);
      const toDelete = presentaciones.filter((p) => p._deleted && p.id);

      // Delete removed presentaciones
      for (const p of toDelete) {
        await supabase.from("presentaciones").delete().eq("id", p.id!);
      }

      // Upsert remaining
      for (const p of toKeep) {
        const presPayload = {
          producto_id: productId,
          nombre: p.nombre,
          cantidad: p.cantidad,
          sku: p.sku,
          costo: p.costo,
          precio: p.precio,
          precio_oferta: p.precio_oferta,
        };
        if (p.id) {
          await supabase.from("presentaciones").update(presPayload).eq("id", p.id);
        } else {
          await supabase.from("presentaciones").insert(presPayload);
        }
      }
      } // end if (!isCombo)

      setDialogOpen(false);
      resetForm();
      fetchProducts();
      showAdminToast("Producto guardado correctamente", "success");
    } catch (err: any) {
      showAdminToast(err.message || "Error al guardar producto", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    if (!window.confirm(`¿Estás seguro de eliminar "${product.nombre}" permanentemente? Esta acción no se puede deshacer.`)) return;

    try {
      await supabase.from("combo_items").delete().eq("combo_id", id);
      await supabase.from("presentaciones").delete().eq("producto_id", id);
      await supabase.from("producto_proveedores").delete().eq("producto_id", id);
      const { error } = await supabase.from("productos").delete().eq("id", id);
      if (error) throw error;
      showAdminToast("Producto eliminado permanentemente", "success");
      fetchProducts();
    } catch (err: any) {
      showAdminToast(err.message || "Error al eliminar producto", "error");
    }
  };

  const handleDuplicate = async (p: ProductoWithRelations) => {
    // Open edit dialog pre-filled with duplicated data
    setEditingProduct(null); // null = new product mode
    const newCode = `${p.codigo}-COPIA`;
    setForm({
      codigo: newCode,
      nombre: `${p.nombre} (Copia)`,
      categoria_id: p.categoria_id || "",
      subcategoria_id: p.subcategoria_id || "",
      marca_id: p.marca_id || "",
      stock: 0,
      stock_minimo: p.stock_minimo ?? 0,
      stock_maximo: p.stock_maximo ?? 0,
      precio: p.precio,
      costo: p.costo,
      unidad_medida: p.unidad_medida,
      descripcion_detallada: p.descripcion_detallada || "",
      visibilidad: p.visibilidad || "visible",
      imagen_url: p.imagen_url || "",
    });
    setShowDescription(!!(p.descripcion_detallada));

    // Load proveedores
    const { data: provData } = await supabase
      .from("producto_proveedores")
      .select("proveedor_id")
      .eq("producto_id", p.id);
    setSelectedProveedores((provData || []).map((pp) => pp.proveedor_id));

    // Load presentaciones (without IDs so they get inserted as new)
    const { data: presData } = await supabase
      .from("presentaciones")
      .select("nombre, cantidad, sku, costo, precio, precio_oferta")
      .eq("producto_id", p.id)
      .order("cantidad");
    const loadedPres = (presData || []).map((pr: any) => ({
      nombre: pr.nombre,
      cantidad: pr.cantidad,
      sku: pr.cantidad === 1 ? newCode : "",
      costo: pr.costo,
      precio: pr.precio,
      precio_oferta: pr.precio_oferta,
    })) as Presentacion[];
    if (!loadedPres.some((pr) => pr.cantidad === 1)) {
      loadedPres.unshift({
        nombre: "Unidad",
        cantidad: 1,
        sku: newCode,
        costo: p.costo,
        precio: p.precio,
        precio_oferta: null,
      });
    }
    setPresentaciones(loadedPres);

    // Load combo items if applicable
    if ((p as any).es_combo) {
      setIsCombo(true);
      const { data: ciData } = await supabase
        .from("combo_items")
        .select("*, productos!combo_items_producto_id_fkey(id, codigo, nombre, precio, costo, stock)")
        .eq("combo_id", p.id);
      setComboItems((ciData || []).map((d: any) => ({
        producto_id: d.producto_id,
        cantidad: d.cantidad,
        descuento: d.descuento ?? 0,
        producto: d.productos,
      })));
    } else {
      setIsCombo(false);
      setComboItems([]);
    }

    setDialogOpen(true);
  };

  // History
  const openHistory = async (p: ProductoWithRelations) => {
    setHistoryProduct(p);
    setHistoryLoading(true);
    setHistoryOpen(true);
    setHistoryItems([]);

    // Fetch movements for this product
    const { data } = await supabase
      .from("stock_movimientos")
      .select("id, tipo, cantidad_antes, cantidad_despues, cantidad, referencia, descripcion, usuario, created_at, orden_id")
      .eq("producto_id", p.id)
      .order("created_at", { ascending: false });

    let allMovs = (data as any[]) || [];

    // For combo products: also fetch movements from component products
    if ((p as any).es_combo) {
      const { data: comboItems } = await supabase
        .from("combo_items")
        .select("producto_id, productos!combo_items_producto_id_fkey(nombre)")
        .eq("combo_id", p.id);
      if (comboItems && comboItems.length > 0) {
        const componentNameMap: Record<string, string> = {};
        comboItems.forEach((ci: any) => {
          componentNameMap[ci.producto_id] = ci.productos?.nombre || "Componente";
        });
        const componentIds = comboItems.map((ci: any) => ci.producto_id);

        // Get all orden_ids from combo's own movements to correlate
        const comboOrdenIds = allMovs.filter((m: any) => m.orden_id).map((m: any) => m.orden_id);

        // Fetch component movements: by description match OR by shared orden_id
        const queries = [
          supabase
            .from("stock_movimientos")
            .select("id, tipo, cantidad_antes, cantidad_despues, cantidad, referencia, descripcion, usuario, created_at, orden_id, producto_id")
            .in("producto_id", componentIds)
            .order("created_at", { ascending: false }),
        ];

        const [{ data: allComponentMovs }] = await Promise.all(queries);

        if (allComponentMovs) {
          // Filter: movements that reference this combo (by name or shared orden_id)
          const comboNameLower = p.nombre.toLowerCase();
          const ordenIdSet = new Set(comboOrdenIds);
          const relevantMovs = allComponentMovs.filter((m: any) => {
            if (m.descripcion && m.descripcion.toLowerCase().includes(comboNameLower)) return true;
            if (m.orden_id && ordenIdSet.has(m.orden_id)) return true;
            return false;
          });

          // Tag component movements with product name
          const taggedMovs = relevantMovs.map((m: any) => ({
            ...m,
            descripcion: `[${componentNameMap[m.producto_id] || "Componente"}] ${m.descripcion || ""}`,
          }));

          // Deduplicate by id
          const existingIds = new Set(allMovs.map((m: any) => m.id));
          const newMovs = taggedMovs.filter((m: any) => !existingIds.has(m.id));
          allMovs = [...allMovs, ...newMovs];
          allMovs.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
        }
      }
    }

    const items: MovimientoItem[] = allMovs.map((item: any) => ({
      id: item.id,
      tipo: item.tipo || "ajuste",
      cantidad_antes: item.cantidad_antes ?? 0,
      cantidad_despues: item.cantidad_despues ?? 0,
      cantidad: item.cantidad ?? 0,
      referencia: item.referencia || null,
      descripcion: item.descripcion || null,
      usuario: item.usuario || null,
      created_at: item.created_at || "",
      orden_id: item.orden_id || null,
    }));

    setHistoryItems(items);
    setHistoryLoading(false);
  };

  // Export Excel
  const handleExport = async () => {
    // Load proveedores for all products
    const [{ data: allProdProv }, { data: allPresData }] = await Promise.all([
      supabase.from("producto_proveedores").select("producto_id, proveedores(nombre)"),
      supabase.from("presentaciones").select("producto_id, nombre, cantidad, sku, costo, precio"),
    ]);
    const provMap: Record<string, string> = {};
    (allProdProv || []).forEach((pp: any) => {
      const name = pp.proveedores?.nombre || "";
      if (name) provMap[pp.producto_id] = provMap[pp.producto_id] ? `${provMap[pp.producto_id]}, ${name}` : name;
    });

    // Build box presentation map (presentations with cantidad > 1)
    const boxPresMap: Record<string, { nombre: string; cantidad: number; sku: string; costo: number; precio: number }> = {};
    (allPresData || []).forEach((pr: any) => {
      if (pr.cantidad > 1) {
        // Keep the one with highest cantidad (i.e., the "caja")
        if (!boxPresMap[pr.producto_id] || pr.cantidad > boxPresMap[pr.producto_id].cantidad) {
          boxPresMap[pr.producto_id] = {
            nombre: pr.nombre || `Caja x${pr.cantidad}`,
            cantidad: pr.cantidad,
            sku: pr.sku || "",
            costo: pr.costo || 0,
            precio: pr.precio || 0,
          };
        }
      }
    });

    // Load subcategorias for name resolution
    const subcatMap: Record<string, string> = {};
    subcategories.forEach((s) => { subcatMap[s.id] = s.nombre; });

    const rows = products.map((p) => {
      const ganancia = p.costo > 0 ? (((p.precio - p.costo) / p.costo) * 100) : 0;
      const box = boxPresMap[p.id];
      const boxMargin = box && box.costo > 0 ? (((box.precio - box.costo) / box.costo) * 100) : 0;
      return {
        "Codigo de Barras": p.codigo,
        "Nombre del Articulo": p.nombre,
        "Stock": p.stock,
        "Categoria": p.categorias?.nombre || "",
        "Subcategoria": p.subcategoria_id ? (subcatMap[p.subcategoria_id] || "") : "",
        "Marca": p.marcas?.nombre || "",
        "Proveedor": provMap[p.id] || "",
        "Precio de Costo": p.costo,
        "Precio de Venta": p.precio,
        "Ganancia %": Math.round(ganancia * 10) / 10,
        "Unidad Medida": p.unidad_medida,
        "Stock Minimo": p.stock_minimo || 0,
        "Stock Maximo": p.stock_maximo || 0,
        "Presentacion Caja": box?.nombre || "",
        "Cantidad Caja": box?.cantidad || "",
        "Codigo Caja": box?.sku || "",
        "Costo Caja": box?.costo || "",
        "Precio Caja": box?.precio || "",
        "Margen Caja %": box ? Math.round(boxMargin * 10) / 10 : "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 16 }, // Codigo
      { wch: 40 }, // Nombre
      { wch: 8 },  // Stock
      { wch: 16 }, // Categoria
      { wch: 16 }, // Subcategoria
      { wch: 16 }, // Marca
      { wch: 22 }, // Proveedor
      { wch: 14 }, // Costo
      { wch: 14 }, // PVP
      { wch: 12 }, // Ganancia
      { wch: 12 }, // Unidad
      { wch: 12 }, // Stock Min
      { wch: 12 }, // Stock Max
      { wch: 16 }, // Presentacion Caja
      { wch: 14 }, // Cantidad Caja
      { wch: 16 }, // Codigo Caja
      { wch: 14 }, // Costo Caja
      { wch: 14 }, // Precio Caja
      { wch: 14 }, // Margen Caja
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `Productos_Cuenca_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Import Excel
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    skipped: number;
    failed: { row: number; nombre: string; error: string }[];
  } | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportProgress("Leyendo archivo...");
    setImportResult(null);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) { setImporting(false); return; }

      // Normalize header keys (handle variations)
      const normalize = (key: string) => key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const getVal = (row: Record<string, any>, ...keys: string[]) => {
        for (const k of Object.keys(row)) {
          const nk = normalize(k);
          for (const target of keys) {
            if (nk.includes(normalize(target))) return String(row[k]).trim();
          }
        }
        return "";
      };
      const getNum = (row: Record<string, any>, ...keys: string[]) => {
        const v = getVal(row, ...keys);
        return parseFloat(v.replace(",", ".")) || 0;
      };

      // Cache for resolving names to IDs (create if not exists)
      const catCache: Record<string, string> = {};
      categories.forEach((c) => { catCache[c.nombre.toLowerCase()] = c.id; });

      const subcatCache: Record<string, string> = {};
      subcategories.forEach((s) => { subcatCache[`${s.categoria_id}_${s.nombre.toLowerCase()}`] = s.id; });

      const marcaCache: Record<string, string> = {};
      marcas.forEach((m) => { marcaCache[m.nombre.toLowerCase()] = m.id; });

      const provCache: Record<string, string> = {};
      proveedores.forEach((p) => { provCache[p.nombre.toLowerCase()] = p.id; });

      const getOrCreateCategoria = async (nombre: string): Promise<string | null> => {
        if (!nombre) return null;
        const key = nombre.toLowerCase();
        if (catCache[key]) return catCache[key];
        const { data } = await supabase.from("categorias").insert({ nombre }).select("id").single();
        if (data) { catCache[key] = data.id; return data.id; }
        return null;
      };

      const getOrCreateSubcategoria = async (nombre: string, catId: string): Promise<string | null> => {
        if (!nombre || !catId) return null;
        const key = `${catId}_${nombre.toLowerCase()}`;
        if (subcatCache[key]) return subcatCache[key];
        const { data } = await supabase.from("subcategorias").insert({ nombre, categoria_id: catId }).select("id").single();
        if (data) { subcatCache[key] = data.id; return data.id; }
        return null;
      };

      const getOrCreateMarca = async (nombre: string): Promise<string | null> => {
        if (!nombre) return null;
        const key = nombre.toLowerCase();
        if (marcaCache[key]) return marcaCache[key];
        const { data } = await supabase.from("marcas").insert({ nombre }).select("id").single();
        if (data) { marcaCache[key] = data.id; return data.id; }
        return null;
      };

      const getOrCreateProveedor = async (nombre: string): Promise<string | null> => {
        if (!nombre) return null;
        const key = nombre.toLowerCase();
        if (provCache[key]) return provCache[key];
        const { data } = await supabase.from("proveedores").insert({ nombre, activo: true }).select("id").single();
        if (data) { provCache[key] = data.id; return data.id; }
        return null;
      };

      let imported = 0;
      let skipped = 0;
      const failed: { row: number; nombre: string; error: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because row 1 is header, data starts at 2
        setImportProgress(`Procesando ${i + 1} de ${rows.length}...`);

        try {
          const codigo = getVal(row, "codigo de barras", "codigo", "barras");
          const nombre = getVal(row, "nombre del articulo", "nombre", "articulo", "descripcion");
          if (!codigo && !nombre) {
            skipped++;
            continue;
          }

          // Check if product already exists by codigo - SKIP if found
          if (codigo) {
            const { data: existing } = await supabase
              .from("productos")
              .select("id")
              .eq("codigo", codigo)
              .maybeSingle();
            if (existing) {
              skipped++;
              continue;
            }
          }

          const stock = getNum(row, "stock");
          const costo = getNum(row, "precio de costo", "costo");
          const ganancia = getNum(row, "ganancia");
          const precio = ganancia > 0 && costo > 0 ? Math.round(costo * (1 + ganancia / 100)) : costo;
          const unidadMedida = getVal(row, "unidad medida", "unidad") || "UN";
          const categoriaNombre = getVal(row, "categoria");
          const subcategoriaNombre = getVal(row, "subcategoria");
          const marcaNombre = getVal(row, "marca");
          const proveedorNombre = getVal(row, "proveedor");

          // Resolve IDs
          const categoriaId = await getOrCreateCategoria(categoriaNombre);
          const subcategoriaId = categoriaId ? await getOrCreateSubcategoria(subcategoriaNombre, categoriaId) : null;
          const marcaId = await getOrCreateMarca(marcaNombre);
          const proveedorId = await getOrCreateProveedor(proveedorNombre);

          const payload: Record<string, unknown> = {
            codigo: codigo || `AUTO-${Date.now()}-${i}`,
            nombre: nombre || codigo,
            stock,
            costo,
            precio,
            unidad_medida: unidadMedida,
            categoria_id: categoriaId,
            subcategoria_id: subcategoriaId,
            marca_id: marcaId,
            activo: true,
            fecha_actualizacion: new Date().toISOString(),
          };

          const { data: inserted, error: insertErr } = await supabase
            .from("productos")
            .insert(payload)
            .select("id")
            .single();

          if (insertErr) throw new Error(insertErr.message);

          // Link proveedor
          if (proveedorId && inserted) {
            await supabase.from("producto_proveedores").upsert(
              { producto_id: inserted.id, proveedor_id: proveedorId },
              { onConflict: "producto_id,proveedor_id" }
            );
          }

          imported++;
        } catch (err: any) {
          failed.push({
            row: rowNum,
            nombre: getVal(row, "nombre del articulo", "nombre", "articulo", "descripcion") || getVal(row, "codigo"),
            error: err?.message || "Error desconocido",
          });
        }
      }

      setImportResult({ total: rows.length, imported, skipped, failed });
      await fetchProducts();
      await fetchCategories();
      await fetchSubcategories();
      await fetchMarcas();
      await fetchProveedores();
    } catch (err) {
      console.error("Import error:", err);
      setImportResult({ total: 0, imported: 0, skipped: 0, failed: [{ row: 0, nombre: "Error general", error: String(err) }] });
    } finally {
      setImporting(false);
      setImportProgress("");
      if (importRef.current) importRef.current.value = "";
    }
  };

  // Presentacion helpers
  const [showBoxForm, setShowBoxForm] = useState(false);
  const [boxQuantity, setBoxQuantity] = useState(12);

  const getUnitPresentacion = () => presentaciones.find((p) => !p._deleted && p.cantidad === 1);

  const addPresentacion = () => {
    setPresentaciones([
      ...presentaciones,
      { nombre: "", cantidad: 1, sku: "", costo: 0, precio: 0, precio_oferta: null },
    ]);
  };

  const addBoxPresentacion = (qty: number) => {
    const baseCosto = form.costo || 0;
    const basePrecio = form.precio || 0;
    const unit = getUnitPresentacion();
    const boxCosto = baseCosto * qty;
    const boxPrecio = basePrecio * qty;
    const boxOferta = unit && unit.precio_oferta ? unit.precio_oferta * qty : null;
    const boxSku = form.codigo ? `${form.codigo}-C${qty}` : "";
    setPresentaciones([
      ...presentaciones,
      {
        nombre: `Caja x${qty}`,
        cantidad: qty,
        sku: boxSku,
        costo: boxCosto,
        precio: boxPrecio,
        precio_oferta: boxOferta,
      },
    ]);
    setShowBoxForm(false);
    setBoxQuantity(12);
  };

  const addMedioCartonPresentacion = () => {
    const baseCosto = form.costo || 0;
    const basePrecio = form.precio || 0;
    const unit = getUnitPresentacion();
    const halfCosto = Math.round(baseCosto * 0.5);
    const halfPrecio = Math.round(basePrecio * 0.5);
    const halfOferta = unit && unit.precio_oferta ? Math.round(unit.precio_oferta * 0.5) : null;
    const halfSku = form.codigo ? `${form.codigo}-C` : "";
    setPresentaciones([
      ...presentaciones,
      {
        nombre: "Medio Carton",
        cantidad: 0.5,
        sku: halfSku,
        costo: halfCosto,
        precio: halfPrecio,
        precio_oferta: halfOferta,
      },
    ]);
  };

  const updatePresentacion = (index: number, field: string, value: string | number | null) => {
    setPresentaciones((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const recalcBoxPrices = () => {
    const baseCosto = form.costo || 0;
    const basePrecio = form.precio || 0;
    const unit = getUnitPresentacion();
    setPresentaciones((prev) =>
      prev.map((p) => {
        if (p._deleted || p.cantidad === 1) return p;
        return {
          ...p,
          costo: baseCosto * p.cantidad,
          precio: basePrecio * p.cantidad,
          precio_oferta: unit?.precio_oferta ? unit.precio_oferta * p.cantidad : p.precio_oferta,
        };
      })
    );
  };

  const removePresentacion = (index: number) => {
    setPresentaciones((prev) =>
      prev.map((p, i) => (i === index ? { ...p, _deleted: true } : p))
    );
  };

  const toggleProveedor = (id: string) => {
    setSelectedProveedores((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const filteredSubcategories = useMemo(
    () => subcategories.filter((s) => s.categoria_id === form.categoria_id),
    [subcategories, form.categoria_id]
  );

  const filteredSubcategoriesForFilter = useMemo(
    () => subcategories.filter((s) => category === "all" || s.categoria_id === category),
    [subcategories, category]
  );

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const arr = products.filter((p) => {
      const matchesSearch =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        (presCodigoMap[p.id] || []).some((pr) => (pr.codigo || "").toLowerCase().includes(q));
      const matchesCategory = category === "all" || p.categoria_id === category;
      const matchesSubcategory = subcategoryFilter === "all" || p.subcategoria_id === subcategoryFilter;
      const matchesMarca = marcaFilter === "all" || p.marca_id === marcaFilter;
      const effectiveStock = (p as any).es_combo ? (comboStockMap[p.id] ?? 0) : p.stock;
      const matchesStock = stockFilter === "all" || (stockFilter === "si" ? effectiveStock > 0 : effectiveStock === 0);
      const matchesCombo = comboFilter === "all" || (comboFilter === "si" ? !!(p as any).es_combo : !(p as any).es_combo);
      return matchesSearch && matchesCategory && matchesSubcategory && matchesMarca && matchesStock && matchesCombo;
    });
    arr.sort((a, b) => {
      if (sortBy === "nombre_asc") return a.nombre.localeCompare(b.nombre);
      if (sortBy === "nombre_desc") return b.nombre.localeCompare(a.nombre);
      if (sortBy === "updated_desc") return new Date((b as any).updated_at || 0).getTime() - new Date((a as any).updated_at || 0).getTime();
      if (sortBy === "updated_asc") return new Date((a as any).updated_at || 0).getTime() - new Date((b as any).updated_at || 0).getTime();
      return 0;
    });
    return arr;
  }, [products, debouncedSearch, presCodigoMap, category, subcategoryFilter, marcaFilter, comboStockMap, stockFilter, comboFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(page, totalPages);
  const paginatedProducts = useMemo(
    () => filtered.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize),
    [filtered, safeCurrentPage, pageSize]
  );

  const { outOfStock, lowStock, comboCount } = useMemo(() => {
    let oos = 0, low = 0, combos = 0;
    for (const p of products) {
      const isComboP = !!(p as any).es_combo;
      if (isComboP) combos++;
      const effectiveStock = isComboP ? (comboStockMap[p.id] ?? 0) : p.stock;
      if (effectiveStock === 0) oos++;
      else if (effectiveStock <= (p.stock_minimo || 5)) low++;
    }
    return { outOfStock: oos, lowStock: low, comboCount: combos };
  }, [products, comboStockMap]);


  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
          <p className="text-muted-foreground text-sm">
            {filtered.length === products.length
              ? `${products.length} articulos en la lista de precios`
              : `${filtered.length} de ${products.length} articulos`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {importing ? importProgress : "Importar Excel"}
          </Button>
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo articulo
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total articulos</p>
              <p className="text-xl font-bold">{products.filter((p: any) => p.activo).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Con stock</p>
              <p className="text-xl font-bold">{products.length - outOfStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sin stock</p>
              <p className="text-xl font-bold">{outOfStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Stock bajo</p>
              <p className="text-xl font-bold">{lowStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => { setComboFilter(comboFilter === "si" ? "all" : "si"); setPage(1); }}
        >
          <CardContent className="pt-6 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${comboFilter === "si" ? "bg-pink-500/20" : "bg-pink-500/10"}`}>
              <Layers className={`w-5 h-5 ${comboFilter === "si" ? "text-pink-600" : "text-pink-500"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Combos</p>
              <p className="text-xl font-bold">{comboCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="overflow-visible">
        <CardContent className="pt-6 space-y-4 overflow-visible">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por codigo o descripcion..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex-shrink-0 self-end flex gap-2">
              <Button
                variant={comboFilter === "si" ? "default" : "outline"}
                className="gap-2"
                onClick={() => { setComboFilter(comboFilter === "si" ? "all" : "si"); setPage(1); }}
              >
                <Layers className="w-4 h-4" />
                Combos
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
                Filtros
              </Button>
            </div>
          </div>

          {showFilters && (
            <>
              <Separator />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div ref={catRef}>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Categoría</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar categoría..."
                      value={category !== "all" ? (categories.find((c) => c.id === category)?.nombre ?? catSearch) : catSearch}
                      onChange={(e) => { setCatSearch(e.target.value); setCategory("all"); setSubcategoryFilter("all"); setCatOpen(true); setPage(1); }}
                      onFocus={() => setCatOpen(true)}
                      className="pl-9"
                    />
                    {category !== "all" && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setCategory("all"); setCatSearch(""); setSubcategoryFilter("all"); setPage(1); }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {catOpen && category === "all" && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setCategory("all"); setCatSearch(""); setCatOpen(false); setPage(1); }}>Todas</button>
                        {categories.filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase())).map((c) => (
                          <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setCategory(c.id); setCatSearch(""); setCatOpen(false); setSubcategoryFilter("all"); setPage(1); }}>
                            {c.nombre}
                          </button>
                        ))}
                        {categories.filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div ref={subcatRef}>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Subcategoría</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar subcategoría..."
                      value={subcategoryFilter !== "all" ? (filteredSubcategoriesForFilter.find((s) => s.id === subcategoryFilter)?.nombre ?? subcatSearch) : subcatSearch}
                      onChange={(e) => { setSubcatSearch(e.target.value); setSubcategoryFilter("all"); setSubcatOpen(true); setPage(1); }}
                      onFocus={() => setSubcatOpen(true)}
                      className="pl-9"
                    />
                    {subcategoryFilter !== "all" && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSubcategoryFilter("all"); setSubcatSearch(""); setPage(1); }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {subcatOpen && subcategoryFilter === "all" && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setSubcategoryFilter("all"); setSubcatSearch(""); setSubcatOpen(false); setPage(1); }}>Todas</button>
                        {filteredSubcategoriesForFilter.filter((s) => s.nombre.toLowerCase().includes(subcatSearch.toLowerCase())).map((s) => (
                          <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setSubcategoryFilter(s.id); setSubcatSearch(""); setSubcatOpen(false); setPage(1); }}>
                            {s.nombre}
                          </button>
                        ))}
                        {filteredSubcategoriesForFilter.filter((s) => s.nombre.toLowerCase().includes(subcatSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div ref={marcaRef}>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Marca</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar marca..."
                      value={marcaFilter !== "all" ? (marcas.find((m) => m.id === marcaFilter)?.nombre ?? marcaSearch) : marcaSearch}
                      onChange={(e) => { setMarcaSearch(e.target.value); setMarcaFilter("all"); setMarcaOpen(true); setPage(1); }}
                      onFocus={() => setMarcaOpen(true)}
                      className="pl-9"
                    />
                    {marcaFilter !== "all" && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setMarcaFilter("all"); setMarcaSearch(""); setPage(1); }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {marcaOpen && marcaFilter === "all" && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setMarcaFilter("all"); setMarcaSearch(""); setMarcaOpen(false); setPage(1); }}>Todas</button>
                        {marcas.filter((m) => m.nombre.toLowerCase().includes(marcaSearch.toLowerCase())).map((m) => (
                          <button key={m.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setMarcaFilter(m.id); setMarcaSearch(""); setMarcaOpen(false); setPage(1); }}>
                            {m.nombre}
                          </button>
                        ))}
                        {marcas.filter((m) => m.nombre.toLowerCase().includes(marcaSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Hay Stock</Label>
                  <Select value={stockFilter} onValueChange={(v) => { setStockFilter(v ?? "all"); setPage(1); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {stockFilter === "all" ? "Todos" : stockFilter === "si" ? "Con stock" : "Sin stock"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="si">Con stock</SelectItem>
                      <SelectItem value="no">Sin stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Ordenar por</Label>
                  <Select value={sortBy} onValueChange={(v) => { setSortBy(v ?? "nombre_asc"); setPage(1); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {sortBy === "nombre_asc" ? "Nombre A→Z" : sortBy === "nombre_desc" ? "Nombre Z→A" : sortBy === "updated_desc" ? "Última actualización (más reciente)" : "Última actualización (más antigua)"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nombre_asc">Nombre A→Z</SelectItem>
                      <SelectItem value="nombre_desc">Nombre Z→A</SelectItem>
                      <SelectItem value="updated_desc">Última actualización (más reciente)</SelectItem>
                      <SelectItem value="updated_asc">Última actualización (más antigua)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-3 px-2 font-medium w-10"></th>
                    <th className="text-left py-3 px-4 font-medium">Codigo</th>
                    <th className="text-left py-3 px-4 font-medium">Articulo</th>
                    <th className="text-left py-3 px-4 font-medium">Categoria</th>
                    <th className="text-left py-3 px-4 font-medium">Marca</th>
                    <th className="text-center py-3 px-4 font-medium">Stock</th>
                    <th className="text-center py-3 px-4 font-medium">Min / Max</th>
                    <th className="text-right py-3 px-4 font-medium">PVP</th>
                    <th className="text-left py-3 px-4 font-medium">Ult. actualizacion</th>
                    <th className="text-right py-3 px-4 font-medium w-32">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-2">
                        {product.imagen_url ? (
                          <img src={product.imagen_url} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {product.codigo}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={!(product as any).activo ? "opacity-50" : ""}>{product.nombre}</span>
                          {!(product as any).activo && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-600 bg-red-50">Inactivo</Badge>
                          )}
                          {(product as any).es_combo && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border border-emerald-300">COMBO</Badge>
                          )}
                          {presDisplayMap[product.id]?.slice().sort((a, b) => a.cantidad - b.cantidad).map((pres, i) => {
                            const isMedio = pres.cantidad < 1;
                            return (
                            <Badge key={i} variant="outline" className={`text-[10px] px-1.5 py-0 ${isMedio ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-blue-50 text-blue-600 border-blue-200"}`}>
                              {isMedio ? "Medio Cartón" : pres.nombre}{!isMedio && !pres.nombre.toLowerCase().includes(`x${pres.cantidad}`) ? ` (x${pres.cantidad})` : ""}
                            </Badge>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {product.categorias?.nombre || "\u2014"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {product.marcas?.nombre || "\u2014"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const displayStock = (product as any).es_combo
                            ? (comboStockMap[product.id] ?? 0)
                            : product.stock;
                          return displayStock === 0 ? (
                            <Badge variant="destructive" className="text-xs font-normal">Sin stock</Badge>
                          ) : displayStock <= (product.stock_minimo || 5) ? (
                            <span className="text-orange-500 font-medium">{displayStock}</span>
                          ) : (
                            <span className="font-medium">{displayStock}</span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-center text-xs text-muted-foreground">
                        {product.stock_minimo ?? 0} / {product.stock_maximo ?? 0}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {formatCurrency(product.precio)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {(() => {
                          const d = (product as any).updated_at;
                          if (!d) return "\u2014";
                          const date = new Date(d);
                          return isNaN(date.getTime()) ? "\u2014" : date.toLocaleDateString("es-AR");
                        })()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(product)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => openHistory(product)}
                            title="Historial"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => handleDuplicate(product)}
                            title="Duplicar"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(product.id)}
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {Math.min((safeCurrentPage - 1) * pageSize + 1, filtered.length)}-{Math.min(safeCurrentPage * pageSize, filtered.length)} de {filtered.length} articulos
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safeCurrentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {safeCurrentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog - Single scrollable dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <DialogHeader className="p-0 space-y-0">
                  <DialogTitle className="text-lg font-semibold">
                    {editingProduct ? "Editar articulo" : "Nuevo articulo"}
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editingProduct ? `Codigo: ${form.codigo || "---"}` : "Complete los datos del producto"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={form.visibilidad}
                onValueChange={(v) => setForm({ ...form, visibilidad: v || "visible" })}
              >
                <SelectTrigger className={`w-32 h-8 text-xs font-medium ${form.visibilidad === "visible" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-orange-300 bg-orange-50 text-orange-700"}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visible">Visible</SelectItem>
                  <SelectItem value="oculto">Oculto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Combo toggle */}
            {!editingProduct && (
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">¿Es un combo?</p>
                  <p className="text-xs text-muted-foreground">Agrupá varios productos en un único artículo combo</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCombo((prev) => !prev)}
                  className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${isCombo ? "bg-emerald-500" : "bg-input"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isCombo ? "translate-x-5" : ""}`} />
                </button>
              </div>
            )}
            {editingProduct && (editingProduct as any).es_combo && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <Layers className="w-4 h-4" />
                <span>Este producto es un <strong>combo</strong></span>
              </div>
            )}

            {/* Section 1: Product Info */}
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2 text-muted-foreground">
                <ImageIcon className="w-4 h-4" />
                Producto
              </h3>
              <div className="flex gap-4">
                <div className="w-32 shrink-0">
                  <ImageUpload
                    value={form.imagen_url || undefined}
                    onChange={(url) => setForm((prev) => ({ ...prev, imagen_url: url }))}
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-[150px_1fr_120px] gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Codigo</Label>
                      <Input
                        value={form.codigo}
                        onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                        className="h-9"
                        placeholder="SKU-001"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Nombre del producto</Label>
                      <Input
                        value={form.nombre}
                        onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                        className="h-9"
                        placeholder="Nombre del producto"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Unidad de medida</Label>
                      <Select
                        value={form.unidad_medida}
                        onValueChange={(v) => setForm({ ...form, unidad_medida: v || "UN" })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UN">Unidad</SelectItem>
                          <SelectItem value="KG">Kilogramo</SelectItem>
                          <SelectItem value="LT">Litro</SelectItem>
                          <SelectItem value="MT">Metro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Descripcion (opcional)</Label>
                    <Textarea
                      rows={2}
                      value={form.descripcion_detallada}
                      onChange={(e) => setForm({ ...form, descripcion_detallada: e.target.value })}
                      placeholder="Descripcion opcional del producto..."
                      className="resize-none text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Classification - horizontal row */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">Clasificacion</h3>
              <div className="grid grid-cols-3 gap-3">
                {/* Categoria searchable */}
                {(() => {
                  const [catSearch, setCatSearch] = [formCatSearch, setFormCatSearch];
                  const [catOpen, setCatOpen] = [formCatOpen, setFormCatOpen];
                  const filtered = categories.filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase()));
                  const selected = categories.find((c) => c.id === form.categoria_id);
                  return (
                  <div className="space-y-1.5 relative" ref={null}>
                    <Label className="text-xs text-muted-foreground">Categoria</Label>
                    <button type="button" onClick={() => setCatOpen(!catOpen)} className="flex items-center justify-between w-full h-9 px-3 border rounded-md text-sm bg-background hover:bg-muted/50 transition">
                      <span className={selected ? "" : "text-muted-foreground"}>{selected?.nombre || "Seleccionar"}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {catOpen && (<>
                      <div className="fixed inset-0 z-[199]" onClick={() => { setCatOpen(false); setCatSearch(""); }} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-[200] max-h-52 overflow-hidden">
                        <div className="p-2 border-b"><input autoFocus placeholder="Buscar..." value={catSearch} onChange={(e) => setCatSearch(e.target.value)} className="w-full text-sm px-2 py-1.5 border rounded-md outline-none focus:ring-1 focus:ring-primary" /></div>
                        <div className="max-h-40 overflow-y-auto p-1">
                          {filtered.map((c) => (
                            <button key={c.id} type="button" onClick={() => { setForm({ ...form, categoria_id: c.id, subcategoria_id: "" }); setCatOpen(false); setCatSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition ${form.categoria_id === c.id ? "bg-primary/10 font-medium" : ""}`}>{c.nombre}</button>
                          ))}
                          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>}
                        </div>
                      </div>
                    </>)}
                  </div>
                  );
                })()}
                {/* Subcategoria searchable */}
                {(() => {
                  const [subSearch, setSubSearch] = [formSubSearch, setFormSubSearch];
                  const [subOpen, setSubOpen] = [formSubOpen, setFormSubOpen];
                  const filtered = filteredSubcategories.filter((s) => s.nombre.toLowerCase().includes(subSearch.toLowerCase()));
                  const selected = subcategories.find((s) => s.id === form.subcategoria_id);
                  return (
                  <div className="space-y-1.5 relative">
                    <Label className="text-xs text-muted-foreground">Subcategoria</Label>
                    <button type="button" onClick={() => form.categoria_id && setSubOpen(!subOpen)} className={`flex items-center justify-between w-full h-9 px-3 border rounded-md text-sm bg-background transition ${form.categoria_id ? "hover:bg-muted/50" : "opacity-50 cursor-not-allowed"}`}>
                      <span className={selected ? "" : "text-muted-foreground"}>{selected?.nombre || "Seleccionar"}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {subOpen && (<>
                      <div className="fixed inset-0 z-[199]" onClick={() => { setSubOpen(false); setSubSearch(""); }} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-[200] max-h-52 overflow-hidden">
                        <div className="p-2 border-b"><input autoFocus placeholder="Buscar..." value={subSearch} onChange={(e) => setSubSearch(e.target.value)} className="w-full text-sm px-2 py-1.5 border rounded-md outline-none focus:ring-1 focus:ring-primary" /></div>
                        <div className="max-h-40 overflow-y-auto p-1">
                          {filtered.map((s) => (
                            <button key={s.id} type="button" onClick={() => { setForm({ ...form, subcategoria_id: s.id }); setSubOpen(false); setSubSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition ${form.subcategoria_id === s.id ? "bg-primary/10 font-medium" : ""}`}>{s.nombre}</button>
                          ))}
                          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>}
                        </div>
                      </div>
                    </>)}
                  </div>
                  );
                })()}
                {/* Marca searchable */}
                {(() => {
                  const [marcaSearch, setMarcaSearch] = [formMarcaSearch, setFormMarcaSearch];
                  const [marcaOpen, setMarcaOpen] = [formMarcaOpen, setFormMarcaOpen];
                  const filtered = marcas.filter((m) => m.nombre.toLowerCase().includes(marcaSearch.toLowerCase()));
                  const selected = marcas.find((m) => m.id === form.marca_id);
                  return (
                  <div className="space-y-1.5 relative">
                    <Label className="text-xs text-muted-foreground">Marca</Label>
                    <button type="button" onClick={() => setMarcaOpen(!marcaOpen)} className="flex items-center justify-between w-full h-9 px-3 border rounded-md text-sm bg-background hover:bg-muted/50 transition">
                      <span className={selected ? "" : "text-muted-foreground"}>{selected?.nombre || "Seleccionar"}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {marcaOpen && (<>
                      <div className="fixed inset-0 z-[199]" onClick={() => { setMarcaOpen(false); setMarcaSearch(""); }} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-[200] max-h-52 overflow-hidden">
                        <div className="p-2 border-b"><input autoFocus placeholder="Buscar..." value={marcaSearch} onChange={(e) => setMarcaSearch(e.target.value)} className="w-full text-sm px-2 py-1.5 border rounded-md outline-none focus:ring-1 focus:ring-primary" /></div>
                        <div className="max-h-40 overflow-y-auto p-1">
                          {filtered.map((m) => (
                            <button key={m.id} type="button" onClick={() => { setForm({ ...form, marca_id: m.id }); setMarcaOpen(false); setMarcaSearch(""); }}
                              className={`w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-muted transition ${form.marca_id === m.id ? "bg-primary/10 font-medium" : ""}`}>{m.nombre}</button>
                          ))}
                          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sin resultados</p>}
                        </div>
                      </div>
                    </>)}
                  </div>
                  );
                })()}
              </div>
            </div>

            {/* Section 3: Pricing & Stock - one row */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">Precios e Inventario</h3>
              <div className="grid grid-cols-7 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Costo</Label>
                  <Input
                    type="number"
                    value={form.costo}
                    onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Precio</Label>
                  <Input
                    type="number"
                    value={form.precio}
                    onChange={(e) => setForm({ ...form, precio: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  {(() => {
                    const margen = form.costo > 0 ? ((form.precio - form.costo) / form.costo) * 100 : 0;
                    const ganancia = form.precio - form.costo;
                    const isPositive = ganancia >= 0;
                    return (
                      <div className={`flex flex-col items-center justify-center h-9 rounded-md text-xs ${isPositive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                        <span className="font-semibold leading-none">
                          {form.costo > 0 ? `${margen.toFixed(1)}%` : "---"}
                        </span>
                        <span className="text-[10px] opacity-70 leading-none mt-0.5">
                          {formatCurrency(ganancia)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Stock</Label>
                  <Input
                    type="number"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Min</Label>
                  <Input
                    type="number"
                    value={form.stock_minimo}
                    onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Max</Label>
                  <Input
                    type="number"
                    value={form.stock_maximo}
                    onChange={(e) => setForm({ ...form, stock_maximo: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div>
                  {form.stock > 0 && form.stock <= form.stock_minimo && (
                    <div className="flex items-center gap-1 text-[10px] text-orange-600 bg-orange-50 rounded-md px-2 py-1.5 h-9">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Stock bajo
                    </div>
                  )}
                </div>
              </div>

              {/* Box summary */}
              {presentaciones.filter((p) => !p._deleted && p.cantidad > 1).map((box, i) => {
                const boxMargen = box.costo > 0 ? ((box.precio - box.costo) / box.costo) * 100 : 0;
                const boxGanancia = box.precio - box.costo;
                const stockCajas = box.cantidad > 0 ? Math.floor(form.stock / box.cantidad) : 0;
                const restoUnidades = box.cantidad > 0 ? form.stock % box.cantidad : form.stock;
                return (
                  <div key={i} className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-emerald-700 mb-2">{box.nombre}</p>
                    <div className="grid grid-cols-5 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Costo caja</span>
                        <p className="font-semibold">{formatCurrency(box.costo)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Precio caja</span>
                        <p className="font-semibold">{formatCurrency(box.precio)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Margen</span>
                        <p className={`font-semibold ${boxGanancia >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {box.costo > 0 ? `${boxMargen.toFixed(1)}%` : "—"} ({formatCurrency(boxGanancia)})
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stock en cajas</span>
                        <p className="font-semibold">{stockCajas} {stockCajas === 1 ? "caja" : "cajas"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sueltas</span>
                        <p className="font-semibold">{restoUnidades} un.</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Section 4: Combo Items (only when isCombo) */}
            {isCombo && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Productos del combo
                  </h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setComboSearchOpen(true)}>
                    <Plus className="w-3 h-3" />Agregar
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-xs w-28">Cód</th>
                        <th className="text-left px-3 py-2 font-medium text-xs">Descripción</th>
                        <th className="text-center px-3 py-2 font-medium text-xs w-20">Cant</th>
                        <th className="text-right px-3 py-2 font-medium text-xs w-28">Precio</th>
                        <th className="text-right px-3 py-2 font-medium text-xs w-28">Subtotal</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {comboItems.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">Agregá productos al combo</td></tr>
                      ) : comboItems.map((item) => (
                        <tr
                          key={item.producto_id}
                          onClick={() => setSelectedComboRow(item.producto_id === selectedComboRow ? null : item.producto_id)}
                          className={`border-t cursor-pointer transition-colors ${selectedComboRow === item.producto_id ? "bg-blue-50" : "hover:bg-muted/50"}`}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.producto?.codigo}</td>
                          <td className="px-3 py-2">{item.producto?.nombre}</td>
                          <td className="px-3 py-2 text-center">
                            <Input
                              type="number" min={1} value={item.cantidad}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (val < 1) { setComboItems(comboItems.filter((i) => i.producto_id !== item.producto_id)); setSelectedComboRow(null); return; }
                                setComboItems(comboItems.map((i) => i.producto_id === item.producto_id ? { ...i, cantidad: val } : i));
                              }}
                              className="h-7 w-16 text-center mx-auto"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.producto?.precio || 0)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency((item.producto?.precio || 0) * item.cantidad)}</td>
                          <td className="px-2 py-2">
                            <button onClick={(e) => { e.stopPropagation(); setComboItems(comboItems.filter((i) => i.producto_id !== item.producto_id)); setSelectedComboRow(null); }} className="text-muted-foreground hover:text-destructive">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {comboItems.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-4">
                    <span>Stock disponible: <strong>{Math.min(...comboItems.map((i) => Math.floor((i.producto?.stock || 0) / i.cantidad)))}</strong></span>
                    <span>Costo total: <strong>{formatCurrency(comboItems.reduce((a, i) => a + (i.producto?.costo || 0) * i.cantidad, 0))}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* Section 4: Presentaciones - compact table */}
            {!isCombo && <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">Presentaciones</h3>
                {presentaciones.some((p) => !p._deleted && p.cantidad !== 1) && (
                  <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7" onClick={recalcBoxPrices}>
                    <RefreshCw className="w-3 h-3" />
                    Recalcular cajas
                  </Button>
                )}
              </div>

              {/* Compact table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium text-xs w-10"></th>
                      <th className="text-left py-2 px-3 font-medium text-xs">Nombre</th>
                      <th className="text-left py-2 px-3 font-medium text-xs w-32">Código</th>
                      <th className="text-center py-2 px-3 font-medium text-xs w-20">Cant.</th>
                      <th className="text-right py-2 px-3 font-medium text-xs w-24">Costo</th>
                      <th className="text-right py-2 px-3 font-medium text-xs w-24">Precio</th>
                      <th className="text-right py-2 px-3 font-medium text-xs w-24">Oferta</th>
                      <th className="text-center py-2 px-3 font-medium text-xs w-20">Margen</th>
                      <th className="text-right py-2 px-3 font-medium text-xs w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {presentaciones
                      .map((pres, idx) => ({ pres, idx }))
                      .filter(({ pres }) => !pres._deleted)
                      .sort((a, b) => {
                        // Unit (1) first, then Medio Carton (0.5), then boxes
                        if (a.pres.cantidad === 1 && b.pres.cantidad !== 1) return -1;
                        if (a.pres.cantidad !== 1 && b.pres.cantidad === 1) return 1;
                        if (a.pres.cantidad < 1 && b.pres.cantidad >= 1) return -1;
                        if (a.pres.cantidad >= 1 && b.pres.cantidad < 1) return 1;
                        return a.pres.cantidad - b.pres.cantidad;
                      })
                      .map(({ pres, idx }) => {
                        const isUnit = pres.cantidad === 1;
                        const unit = getUnitPresentacion();
                        return (
                          <tr key={idx} className={`border-b last:border-0 ${isUnit ? "bg-blue-50" : "bg-emerald-50"}`}>
                            <td className="py-2 px-3">
                              {isUnit ? (
                                <ShoppingBag className="w-4 h-4 text-blue-500" />
                              ) : (
                                <Box className="w-4 h-4 text-emerald-500" />
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                value={pres.nombre}
                                onChange={(e) => updatePresentacion(idx, "nombre", e.target.value)}
                                className="h-7 text-sm"
                                placeholder={isUnit ? "Unidad" : "Caja x12"}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                value={pres.sku}
                                onChange={(e) => updatePresentacion(idx, "sku", e.target.value)}
                                className="h-7 text-sm font-mono text-xs"
                                placeholder={isUnit ? form.codigo || "Código" : form.codigo ? `${form.codigo}-C${pres.cantidad}` : "Código caja"}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                type="number"
                                value={pres.cantidad}
                                onChange={(e) => {
                                  const newQty = Number(e.target.value);
                                  updatePresentacion(idx, "cantidad", newQty);
                                  if (!isUnit && unit && newQty > 0) {
                                    // Only auto-rename if name follows "Caja xN" pattern or is empty
                                    const currentName = pres.nombre;
                                    const isAutoName = !currentName || /^Caja\s*x\d*$/i.test(currentName);
                                    if (isAutoName) {
                                      if (newQty < 1) {
                                        updatePresentacion(idx, "nombre", "Medio Carton");
                                      } else {
                                        updatePresentacion(idx, "nombre", `Caja x${newQty}`);
                                      }
                                    }
                                    updatePresentacion(idx, "costo", unit.costo * newQty);
                                    updatePresentacion(idx, "precio", unit.precio * newQty);
                                  }
                                }}
                                className="h-7 text-sm text-center"
                                disabled={isUnit}
                                step={form.unidad_medida === "Mt" ? 0.5 : 1}
                                min={form.unidad_medida === "Mt" ? 0.5 : 1}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                type="number"
                                value={pres.costo}
                                onChange={(e) => updatePresentacion(idx, "costo", Number(e.target.value))}
                                className="h-7 text-sm text-right"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                type="number"
                                value={pres.precio}
                                onChange={(e) => updatePresentacion(idx, "precio", Number(e.target.value))}
                                className="h-7 text-sm text-right"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <Input
                                type="number"
                                value={pres.precio_oferta ?? ""}
                                onChange={(e) =>
                                  updatePresentacion(idx, "precio_oferta", e.target.value ? Number(e.target.value) : null)
                                }
                                className="h-7 text-sm text-right"
                                placeholder="—"
                              />
                            </td>
                            <td className="py-2 px-3 text-center">
                              {(() => {
                                const margen = pres.costo > 0 ? ((pres.precio - pres.costo) / pres.costo) * 100 : 0;
                                const ganancia = pres.precio - pres.costo;
                                const pos = ganancia >= 0;
                                return (
                                  <div className={`flex flex-col items-center text-[10px] ${pos ? "text-emerald-700" : "text-red-600"}`}>
                                    <span className="font-semibold">{pres.costo > 0 ? `${margen.toFixed(1)}%` : "—"}</span>
                                    <span className="opacity-70">{formatCurrency(ganancia)}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {!isUnit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={() => removePresentacion(idx)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Quick add buttons */}
              <div className="flex flex-wrap items-center gap-2 mt-2 bg-muted/20 rounded-lg p-2">
                <span className="text-xs text-muted-foreground mr-1">Agregar:</span>
                {showBoxForm ? (
                  <div className="flex items-center gap-2 p-1.5 border rounded-lg bg-background">
                    <Label className="text-xs whitespace-nowrap">Unidades:</Label>
                    <Input
                      type="number"
                      value={boxQuantity}
                      onChange={(e) => setBoxQuantity(Number(e.target.value))}
                      className="h-7 w-16 text-sm"
                      min={2}
                      autoFocus
                    />
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => addBoxPresentacion(boxQuantity)}>
                      <Plus className="w-3 h-3" />
                      Crear
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => setShowBoxForm(false)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => setShowBoxForm(true)}
                  >
                    <Box className="w-3 h-3" />
                    Caja
                  </Button>
                )}
                {form.unidad_medida === "Mt" && !presentaciones.some((p) => !p._deleted && p.nombre === "Medio Carton") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-7 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={addMedioCartonPresentacion}
                  >
                    <Box className="w-3 h-3" />
                    Medio Cartón
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-muted-foreground" onClick={addPresentacion}>
                  <Plus className="w-3 h-3" />
                  Personalizada
                </Button>
              </div>
            </div>
            }

            {/* Section 5: Proveedores - compact */}
            {!isCombo && <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">Proveedores</h3>
              {selectedProveedores.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedProveedores.map((id) => {
                    const prov = proveedores.find((p) => p.id === id);
                    return prov ? (
                      <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        {prov.nombre}
                        <button type="button" onClick={() => toggleProveedor(id)} className="hover:text-destructive ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              <div className="border rounded-lg p-2 max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {proveedores.length === 0 && (
                    <p className="text-sm text-muted-foreground p-1">No hay proveedores cargados</p>
                  )}
                  {proveedores.map((prov) => {
                    const isSelected = selectedProveedores.includes(prov.id);
                    return (
                      <button
                        key={prov.id}
                        type="button"
                        onClick={() => toggleProveedor(prov.id)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border"
                        }`}
                      >
                        {prov.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            }

          </div>

          {/* Sticky footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              {editingProduct ? "Los cambios se guardaran al confirmar" : "Complete los campos obligatorios"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingProduct ? "Guardar cambios" : "Crear articulo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/30">
            <DialogHeader className="p-0 space-y-0">
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-muted-foreground" />
                Historial de Movimientos
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">
              Producto: {historyProduct?.nombre || "---"}
            </p>
          </div>

          <div className="px-6 py-3 border-b flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {historyItems.length} movimiento(s)
            </p>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setHistoryOpen(false)}>
              <X className="w-3.5 h-3.5" /> Cerrar
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {historyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : historyItems.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No hay movimientos registrados
              </div>
            ) : (
              historyItems.map((item) => {
                const tipoLower = item.tipo.toLowerCase();
                const isDevolucion = tipoLower.includes("devolucion") || tipoLower.includes("devolución");
                const isVenta = tipoLower.includes("venta");
                const diff = item.cantidad_despues - item.cantidad_antes;
                const isPositive = diff >= 0;

                const badgeConfig = isDevolucion
                  ? { label: "Devolucion", className: "bg-blue-100 text-blue-700 border-blue-200", icon: <RefreshCw className="w-3 h-3" /> }
                  : isVenta
                  ? { label: "Venta", className: "bg-red-100 text-red-700 border-red-200", icon: <ShoppingBag className="w-3 h-3" /> }
                  : { label: "Ajuste", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <Settings className="w-3 h-3" /> };

                return (
                  <div key={item.id} className="border rounded-lg p-4 flex items-start justify-between gap-4 bg-white">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs gap-1 ${badgeConfig.className}`}>
                          {badgeConfig.icon}
                          {badgeConfig.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Antes: <span className="font-medium text-foreground">{item.cantidad_antes}</span>
                        {"  "}
                        Despues: <span className="font-medium text-foreground">{item.cantidad_despues}</span>
                      </p>
                      {item.descripcion && (
                        <p className="text-sm text-muted-foreground">{item.descripcion}</p>
                      )}
                      {item.referencia && (
                        <p className="text-sm text-muted-foreground">{item.referencia}</p>
                      )}
                      {item.orden_id && (
                        <button
                          type="button"
                          onClick={() => openOrdenDetail(item.orden_id!)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Ver orden
                        </button>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className={`text-sm font-semibold ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                        {isPositive ? "+" : ""}{diff} uds
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "\u2014"}
                      </p>
                      {item.usuario && (
                        <p className="text-xs text-muted-foreground">Por: {item.usuario}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={ordenDetailOpen} onOpenChange={setOrdenDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/30">
            <DialogHeader className="p-0 space-y-0">
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                Detalle de Orden
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {ordenDetailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !ordenDetail ? (
              <p className="text-center text-sm text-muted-foreground py-8">No se encontro la orden</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Numero</p>
                    <p className="font-medium">{ordenDetail.numero}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fecha</p>
                    <p className="font-medium">{new Date(ordenDetail.fecha).toLocaleDateString("es-AR")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cliente</p>
                    <p className="font-medium">{ordenDetail.cliente?.nombre || "Consumidor Final"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Comprobante</p>
                    <p className="font-medium">{ordenDetail.tipo_comprobante}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Forma de pago</p>
                    <p className="font-medium">{ordenDetail.forma_pago}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Estado</p>
                    <Badge variant="outline" className="text-xs">{ordenDetail.estado}</Badge>
                  </div>
                </div>
                {ordenDetail.observacion && (
                  <p className="text-sm text-muted-foreground italic">{ordenDetail.observacion}</p>
                )}
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Items ({ordenDetail.items.length})</p>
                  <div className="space-y-1.5">
                    {ordenDetail.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{it.descripcion}</p>
                          <p className="text-xs text-muted-foreground">
                            {(it.unidades_por_presentacion ?? 1) > 0 && (it.unidades_por_presentacion ?? 1) < 1 ? it.cantidad * (it.unidades_por_presentacion ?? 1) : it.cantidad} {it.unidad_medida || "u."} x {formatCurrency(it.precio_unitario)}
                          </p>
                        </div>
                        <p className="font-medium shrink-0 ml-3">{formatCurrency(it.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between items-center text-base font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(ordenDetail.total)}</span>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Results Modal */}
      <Dialog open={importResult !== null} onOpenChange={() => setImportResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Resultado de importacion
            </DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{importResult.imported}</p>
                  <p className="text-xs text-emerald-600 font-medium">Importados</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{importResult.skipped}</p>
                  <p className="text-xs text-amber-600 font-medium">Omitidos</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{importResult.failed.length}</p>
                  <p className="text-xs text-red-600 font-medium">Con error</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Se procesaron <strong>{importResult.total}</strong> filas del archivo.
                {importResult.skipped > 0 && " Los productos con codigo existente fueron omitidos."}
              </p>

              {/* Failed rows detail */}
              {importResult.failed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-red-600">Filas con error:</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-red-200">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-red-700">Fila</th>
                          <th className="text-left py-2 px-3 font-medium text-red-700">Producto</th>
                          <th className="text-left py-2 px-3 font-medium text-red-700">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.failed.map((f, i) => (
                          <tr key={i} className="border-t border-red-100">
                            <td className="py-1.5 px-3 font-mono text-red-600">{f.row}</td>
                            <td className="py-1.5 px-3 truncate max-w-[150px]">{f.nombre || "\u2014"}</td>
                            <td className="py-1.5 px-3 text-red-500 truncate max-w-[200px]">{f.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setImportResult(null)}>Cerrar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Combo product search dialog */}
      <Dialog open={comboSearchOpen} onOpenChange={setComboSearchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Agregar producto al combo</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o código..."
              value={comboProductSearch}
              onChange={(e) => setComboProductSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto divide-y border rounded-lg">
            {allNonCombos.filter((p) =>
              p.nombre.toLowerCase().includes(comboProductSearch.toLowerCase()) ||
              p.codigo.toLowerCase().includes(comboProductSearch.toLowerCase())
            ).map((p) => (
              <button
                key={p.id}
                className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors"
                onClick={() => {
                  const existing = comboItems.find((i) => i.producto_id === p.id);
                  if (existing) {
                    setComboItems(comboItems.map((i) => i.producto_id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
                  } else {
                    setComboItems([...comboItems, { producto_id: p.id, cantidad: 1, descuento: 0, producto: p }]);
                  }
                  setComboSearchOpen(false);
                  setComboProductSearch("");
                }}
              >
                <p className="text-sm font-medium">{p.nombre}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.codigo} · Stock: {p.stock}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
