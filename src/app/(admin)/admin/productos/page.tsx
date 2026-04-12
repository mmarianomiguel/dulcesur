"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { todayARG, formatCurrency } from "@/lib/formatters";
import { norm } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { Producto, Categoria } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Check,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Store,
  Star,
  Tag,
  MoreHorizontal,
} from "lucide-react";

import { ImageUpload } from "@/components/image-upload";
import { showAdminToast } from "@/components/admin-toast";
import { APP_NAME } from "@/lib/constants";
import Link from "next/link";


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

// ── Helpers ──────────────────────────────────────────────────────────────
function formatRelativeDate(dateStr: string): string {
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (isNaN(days) || days < 0) return "—";
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  if (days < 60) return "hace 1 mes";
  return `hace ${Math.floor(days / 30)} meses`;
}

function getProductInitials(nombre: string): string {
  const words = nombre.trim().split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getInitialsColor(nombre: string): { background: string; color: string } {
  const colors = [
    { background: "#EEEDFE", color: "#3C3489" },
    { background: "#E6F1FB", color: "#0C447C" },
    { background: "#EAF3DE", color: "#27500A" },
    { background: "#FAEEDA", color: "#633806" },
    { background: "#E1F5EE", color: "#085041" },
  ];
  const code = nombre ? nombre.charCodeAt(0) : 0;
  const idx = Math.abs(code) % colors.length;
  return colors[idx];
}

function getPrecioEfectivo(product: ProductoWithRelations & { precio_oferta?: number | null; precio_oferta_hasta?: string | null }): { precio: number; enOferta: boolean; precioOriginal: number } {
  const hoy = new Date().toISOString().split("T")[0];
  const enOferta =
    !!product.precio_oferta &&
    product.precio_oferta > 0 &&
    (!product.precio_oferta_hasta || product.precio_oferta_hasta >= hoy);
  return {
    precio: enOferta ? product.precio_oferta! : product.precio,
    enOferta,
    precioOriginal: product.precio,
  };
}

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

  // Read URL params on mount
  const openNewRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("buscar");
    if (q) { setSearch(q); setDebouncedSearch(q); }
    if (params.get("crear") === "true") openNewRef.current = true;
  }, []);
  const [category, setCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductoWithRelations | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ id: string; precio_anterior: number; precio_nuevo: number; costo_anterior: number; costo_nuevo: number; usuario: string; created_at: string }[]>([]);
  const [productDiscounts, setProductDiscounts] = useState<any[]>([]);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [discountForm, setDiscountForm] = useState({ nombre: "", porcentaje: 5, tipo: "general", cantidad_minima: 0, fecha_inicio: "", fecha_fin: "" });
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductoWithRelations | null>(null);
  const [editTab, setEditTab] = useState<string>("info");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [marcaFilter, setMarcaFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [stockFilter, setStockFilter] = useState("all");
  const [tiendaFilter, setTiendaFilter] = useState("all");
  const [comboFilter, setComboFilter] = useState("all");
  const [soloDestacado, setSoloDestacado] = useState(false);
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

  // Mass selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionConfirm, setActionConfirm] = useState<{ open: boolean; title: string; message: string; variant: "destructive" | "default"; onConfirm: () => void }>({ open: false, title: "", message: "", variant: "default", onConfirm: () => {} });
  const [deleting, setDeleting] = useState(false);

  // History dialog state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<ProductoWithRelations | null>(null);
  const [historyItems, setHistoryItems] = useState<MovimientoItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Price history dialog state
  const [phDialogOpen, setPhDialogOpen] = useState(false);
  const [phProduct, setPhProduct] = useState<ProductoWithRelations | null>(null);
  const [phData, setPhData] = useState<{ id: string; precio_anterior: number; precio_nuevo: number; costo_anterior: number; costo_nuevo: number; usuario: string; created_at: string }[]>([]);
  const [phLoading, setPhLoading] = useState(false);

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
    items: { id: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; unidad_medida: string | null; unidades_por_presentacion?: number; descuento?: number }[];
    descuento_porcentaje?: number;
    recargo_porcentaje?: number;
    monto_efectivo?: number;
    monto_transferencia?: number;
    vendedor?: string;
  } | null>(null);

  const openOrdenDetail = useCallback(async (ordenId: string) => {
    setOrdenDetailOpen(true);
    setOrdenDetailLoading(true);
    setOrdenDetail(null);
    try {
      // Try ventas first
      const { data: venta } = await supabase
        .from("ventas")
        .select("id, numero, fecha, total, forma_pago, tipo_comprobante, estado, observacion, descuento_porcentaje, recargo_porcentaje, monto_efectivo, monto_transferencia, vendedor_id, clientes(nombre, cuit), usuarios(nombre)")
        .eq("id", ordenId)
        .maybeSingle();
      if (venta) {
        const { data: items } = await supabase
          .from("venta_items")
          .select("id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida, unidades_por_presentacion, descuento")
          .eq("venta_id", ordenId)
          .order("created_at");
        const vendedorNombre = Array.isArray(venta.usuarios) ? venta.usuarios[0]?.nombre : (venta.usuarios as any)?.nombre;
        setOrdenDetail({
          id: venta.id,
          numero: venta.numero,
          fecha: venta.fecha,
          total: venta.total,
          forma_pago: venta.forma_pago,
          tipo_comprobante: venta.tipo_comprobante,
          estado: venta.estado,
          observacion: venta.observacion,
          descuento_porcentaje: venta.descuento_porcentaje || 0,
          recargo_porcentaje: venta.recargo_porcentaje || 0,
          monto_efectivo: venta.monto_efectivo || 0,
          monto_transferencia: venta.monto_transferencia || 0,
          vendedor: vendedorNombre || "",
          cliente: Array.isArray(venta.clientes) ? venta.clientes[0] ?? null : venta.clientes as { nombre: string; cuit: string | null } | null,
          items: items || [],
        });
      } else {
        // Try compras
        const { data: compra } = await supabase
          .from("compras")
          .select("id, numero, fecha, total, estado, observacion, proveedores(nombre)")
          .eq("id", ordenId)
          .maybeSingle();
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
    destacado: false,
    precio_oferta: undefined as number | undefined,
    precio_oferta_hasta: undefined as string | undefined,
    tags: [] as string[],
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
  const [prodProvMap, setProdProvMap] = useState<Record<string, string>>({});
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

    // Fetch all products with pagination to bypass Supabase max rows limit (default 1000)
    const PAGE_SIZE = 1000;
    const fetchAllProducts = async () => {
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("productos").select("id, codigo, nombre, precio, costo, stock, stock_minimo, stock_maximo, categoria_id, subcategoria_id, marca_id, imagen_url, es_combo, activo, unidad_medida, visibilidad, destacado, fecha_actualizacion, precio_oferta, precio_oferta_hasta, tags, categorias(nombre), marcas(nombre)").eq("activo", true).order("nombre").range(from, from + PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return allRows;
    };
    const fetchAllPres = async () => {
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from("presentaciones").select("producto_id, sku, nombre, cantidad").range(from, from + PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return allRows;
    };

    const [allProdsRaw, allPres, { data: allCI }] = await Promise.all([
      fetchAllProducts(),
      fetchAllPres(),
      supabase.from("combo_items").select("combo_id, cantidad, productos!combo_items_producto_id_fkey(stock)").limit(5000),
    ]);
    const allProds = (allProdsRaw || []) as unknown as ProductoWithRelations[];
    setProducts(allProds);
    setAllNonCombos(allProds.filter((p: any) => !p.es_combo).map((p: any) => ({
      id: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio, costo: p.costo, stock: p.stock,
    })));
    if (allPres && allPres.length > 0) {
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
    if (allCI && allCI.length > 0) {
      const byCombo: Record<string, { stock: number; cantidad: number }[]> = {};
      for (const ci of allCI as any[]) {
        const s = ci.productos?.stock ?? 0;
        if (!byCombo[ci.combo_id]) byCombo[ci.combo_id] = [];
        byCombo[ci.combo_id].push({ stock: s, cantidad: ci.cantidad });
      }
      const stockMap: Record<string, number> = {};
      for (const [comboId, items] of Object.entries(byCombo)) {
        stockMap[comboId] = items.length === 0 ? 0 : Math.min(...items.map((i) => i.cantidad > 0 ? Math.floor(i.stock / i.cantidad) : 0));
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
    // Load provider map for product table
    supabase.from("producto_proveedores").select("producto_id, proveedores(nombre)").then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach((pp: any) => {
        const n = pp.proveedores?.nombre;
        if (n) map[pp.producto_id] = map[pp.producto_id] ? `${map[pp.producto_id]}, ${n}` : n;
      });
      setProdProvMap(map);
    });
  }, [fetchProducts, fetchCategories, fetchSubcategories, fetchMarcas, fetchProveedores]);

  // Auto-open create dialog if ?crear=true
  useEffect(() => {
    if (!loading && openNewRef.current) {
      openNewRef.current = false;
      openNew();
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loading]);

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
      destacado: false,
      precio_oferta: undefined,
      precio_oferta_hasta: undefined,
      tags: [],
    });
    setShowOfertaForm(false);
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
    setEditTab("info");
    setDialogOpen(true);
  };

  // ── Product Discount CRUD ──
  const refreshProductDiscounts = async (productId: string, catId?: string, subId?: string) => {
    try {
      const { data: allDesc } = await supabase.from("descuentos").select("*").eq("activo", true);
      const today = new Date().toISOString().split("T")[0];
      const applicable = (allDesc || []).filter((d: any) => {
        if (d.fecha_fin && d.fecha_fin < today) return false;
        if (d.aplica_a === "todos") return true;
        if (d.aplica_a === "productos" && (d.productos_ids || []).includes(productId)) return true;
        if (d.aplica_a === "categorias" && (d.categorias_ids || []).includes(catId)) return true;
        if (d.aplica_a === "subcategorias" && (d.subcategorias_ids || []).includes(subId)) return true;
        return false;
      });
      setProductDiscounts(applicable);
    } catch { setProductDiscounts([]); }
  };

  const saveProductDiscount = async () => {
    if (!editingProduct || !discountForm.nombre || discountForm.porcentaje <= 0) return;
    setSavingDiscount(true);
    const today = new Date().toISOString().split("T")[0];
    const payload: Record<string, any> = {
      nombre: discountForm.nombre,
      porcentaje: discountForm.porcentaje,
      aplica_a: "productos",
      productos_ids: [editingProduct.id],
      categorias_ids: [],
      subcategorias_ids: [],
      marcas_ids: [],
      presentacion: discountForm.tipo === "solo_caja" ? "caja" : discountForm.tipo === "solo_unidad" ? "unidad" : "todas",
      cantidad_minima: discountForm.tipo === "por_cantidad" && discountForm.cantidad_minima > 0 ? discountForm.cantidad_minima : null,
      fecha_inicio: discountForm.fecha_inicio || today,
      fecha_fin: discountForm.fecha_fin || null,
      activo: true,
      excluir_combos: false,
    };
    const { error } = await supabase.from("descuentos").insert(payload);
    if (error) { showAdminToast("Error al crear descuento: " + error.message, "error"); }
    else {
      showAdminToast("Descuento creado", "success");
      setShowDiscountForm(false);
      setDiscountForm({ nombre: "", porcentaje: 5, tipo: "general", cantidad_minima: 0, fecha_inicio: "", fecha_fin: "" });
      await refreshProductDiscounts(editingProduct.id, form.categoria_id, form.subcategoria_id);
    }
    setSavingDiscount(false);
  };

  const toggleProductDiscount = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase.from("descuentos").update({ activo: !currentActive, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      if (editingProduct) await refreshProductDiscounts(editingProduct.id, form.categoria_id, form.subcategoria_id);
    } catch (err: any) { showAdminToast("Error al actualizar descuento: " + (err?.message || ""), "error"); }
  };

  const deleteProductDiscount = (id: string) => {
    setActionConfirm({
      open: true, title: "Eliminar descuento", message: "¿Eliminar este descuento?", variant: "destructive",
      onConfirm: async () => {
    try {
        const { error } = await supabase.from("descuentos").delete().eq("id", id);
        if (error) throw error;
        if (editingProduct) await refreshProductDiscounts(editingProduct.id, form.categoria_id, form.subcategoria_id);
        showAdminToast("Descuento eliminado", "success");
      } catch (err: any) { showAdminToast("Error al eliminar descuento: " + (err?.message || ""), "error"); }
      },
    });
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
      destacado: !!(p as any).destacado,
      precio_oferta: (p as any).precio_oferta || undefined,
      precio_oferta_hasta: (p as any).precio_oferta_hasta || undefined,
      tags: (p as any).tags || [],
    });
    setShowOfertaForm(!!((p as any).precio_oferta && (p as any).precio_oferta > 0));
    setShowDescription(!!(p.descripcion_detallada));
    setIsCombo(!!(p as any).es_combo);
    setComboItems([]);
    setPriceHistory([]);
    setProductDiscounts([]);

    // Parallelize essential API calls (proveedores + presentaciones + combo items)
    const [provResult, presResult, comboResult] = await Promise.all([
      supabase.from("producto_proveedores").select("proveedor_id").eq("producto_id", p.id),
      supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, sku, costo, precio, precio_oferta").eq("producto_id", p.id).order("cantidad"),
      (p as any).es_combo
        ? supabase.from("combo_items").select("*, productos!combo_items_producto_id_fkey(id, codigo, nombre, precio, costo, stock)").eq("combo_id", p.id)
        : Promise.resolve({ data: null }),
    ]);

    setSelectedProveedores((provResult.data || []).map((pp) => pp.proveedor_id));

    const loadedPres = (presResult.data || []) as Presentacion[];
    if (!loadedPres.some((pr) => pr.cantidad === 1)) {
      loadedPres.unshift({ nombre: "Unidad", cantidad: 1, sku: "", costo: p.costo, precio: p.precio, precio_oferta: null });
    }
    setPresentaciones(loadedPres);

    if ((p as any).es_combo && comboResult.data) {
      setComboItems(comboResult.data.map((d: any) => ({
        producto_id: d.producto_id, cantidad: d.cantidad, descuento: d.descuento ?? 0, producto: d.productos,
      })));
    }

    setEditTab("info");
    setDialogOpen(true);

    // Lazy-load price history and discounts in background (non-blocking)
    supabase.from("precio_historial").select("*").eq("producto_id", p.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setPriceHistory((data || []) as any));
    supabase.from("descuentos").select("*").eq("activo", true)
      .then(({ data: allDesc }) => {
        const today = new Date().toISOString().split("T")[0];
        setProductDiscounts((allDesc || []).filter((d: any) => {
          if (d.fecha_fin && d.fecha_fin < today) return false;
          if (d.aplica_a === "todos") return true;
          if (d.aplica_a === "productos" && (d.productos_ids || []).includes(p.id)) return true;
          if (d.aplica_a === "categorias" && (d.categorias_ids || []).includes(p.categoria_id)) return true;
          if (d.aplica_a === "subcategorias" && (d.subcategorias_ids || []).includes(p.subcategoria_id)) return true;
          return false;
        }));
      });
  };

  const openPriceHistory = async (p: ProductoWithRelations) => {
    setPhProduct(p);
    setPhLoading(true);
    setPhDialogOpen(true);
    const { data } = await supabase
      .from("precio_historial")
      .select("*")
      .eq("producto_id", p.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setPhData((data || []) as any);
    setPhLoading(false);
  };

  const handleSave = async () => {
    // Validation
    const nombre = form.nombre.trim();
    if (!nombre) {
      showAdminToast("El nombre del producto es obligatorio", "error");
      return;
    }
    const codigo = form.codigo.trim() || (isCombo ? `COMBO-${Date.now()}` : "");
    if (!codigo) {
      showAdminToast("El código del producto es obligatorio", "error");
      return;
    }
    if (form.precio <= 0) {
      showAdminToast("El precio debe ser mayor a 0", "error");
      return;
    }
    if (isCombo && comboItems.length === 0) {
      showAdminToast("Un combo debe tener al menos un producto", "error");
      return;
    }

    setSaving(true);
    try {

      const payload: Record<string, unknown> = {
        codigo,
        nombre,
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
        destacado: form.destacado,
        imagen_url: form.imagen_url || null,
        es_combo: isCombo,
        activo: true,
        precio_oferta: form.precio_oferta && form.precio_oferta > 0 ? form.precio_oferta : null,
        precio_oferta_hasta: form.precio_oferta_hasta || null,
        tags: form.tags || [],
      };

      let productId: string;

      if (editingProduct) {
        // Only update fecha_actualizacion when price actually changed
        if (editingProduct.precio !== form.precio) {
          (payload as any).precio_anterior = editingProduct.precio;
          payload.fecha_actualizacion = new Date().toISOString();
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

        // Log price change to precio_historial
        if (editingProduct.precio !== form.precio || editingProduct.costo !== form.costo) {
          try {
            await supabase.from("precio_historial").insert({
              producto_id: editingProduct.id,
              precio_anterior: editingProduct.precio,
              precio_nuevo: form.precio,
              costo_anterior: editingProduct.costo,
              costo_nuevo: form.costo,
              usuario: "Admin",
              created_at: new Date().toISOString(),
            });
          } catch {} // Silent fail if table doesn't exist yet
        }

        // Sync Unidad presentation price/cost with product
        if (editingProduct.precio !== form.precio || editingProduct.costo !== form.costo) {
          await supabase.from("presentaciones")
            .update({ precio: form.precio, costo: form.costo })
            .eq("producto_id", editingProduct.id)
            .eq("nombre", "Unidad")
            .eq("cantidad", 1);
        }

        // Log stock movement if stock changed manually
        if (editingProduct.stock !== form.stock) {
          const diff = form.stock - editingProduct.stock;
          await supabase.from("stock_movimientos").insert({
            producto_id: editingProduct.id,
            tipo: "ajuste",
            cantidad_antes: editingProduct.stock,
            cantidad_despues: form.stock,
            cantidad: diff,
            referencia: `Edición manual de producto`,
            descripcion: `Stock ${diff > 0 ? "incrementado" : "reducido"} de ${editingProduct.stock} a ${form.stock} (${diff > 0 ? "+" : ""}${diff})`,
            usuario: "Admin",
          });
        }
      } else {
        payload.fecha_actualizacion = new Date().toISOString();
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
        // Skip presentations with invalid cantidad
        if (!p.cantidad || p.cantidad <= 0) continue;
        // Always sync Unidad SKU with the product code
        const sku = (p.cantidad === 1 && p.nombre === "Unidad") ? codigo : p.sku;
        const presPayload = {
          producto_id: productId,
          nombre: p.nombre,
          cantidad: p.cantidad,
          sku,
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

  const handleDelete = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (product) setDeleteTarget(product);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await supabase.from("productos").update({ activo: false, visibilidad: "oculto" }).eq("id", deleteTarget.id);
      showAdminToast("Producto eliminado correctamente", "success");
      fetchProducts();
    } catch (err: any) {
      showAdminToast(err.message || "Error al eliminar producto", "error");
    }
    setDeleteTarget(null);
  };

  const handleDuplicate = async (p: ProductoWithRelations) => {
    // Open edit dialog pre-filled with duplicated data
    setEditingProduct(null); // null = new product mode
    const newCode = `${p.codigo}-COPIA-${Date.now().toString(36).slice(-4).toUpperCase()}`;
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
      destacado: !!(p as any).destacado,
      precio_oferta: undefined,
      precio_oferta_hasta: undefined,
      tags: (p as any).tags || [],
    });
    setShowOfertaForm(false);
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

    setEditTab("info");
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
    const XLSX = await import("xlsx");
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
        "Código de Barras": p.codigo,
        "Nombre del Articulo": p.nombre,
        "Stock": p.stock,
        "Categoría": p.categorias?.nombre || "",
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
    XLSX.writeFile(wb, `Productos_${APP_NAME}_${todayARG()}.xlsx`);
  };

  // Import Excel
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    updated: number;
    skipped: number;
    updatedDetails: { nombre: string; changes: string[] }[];
    failed: { row: number; nombre: string; error: string }[];
  } | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportProgress("Leyendo archivo...");
    setImportResult(null);

    try {
      const XLSX = await import("xlsx");
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
      let updated = 0;
      let skipped = 0;
      const updatedDetails: { nombre: string; changes: string[] }[] = [];
      const failed: { row: number; nombre: string; error: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        setImportProgress(`Procesando ${i + 1} de ${rows.length}...`);

        try {
          const codigo = getVal(row, "codigo de barras", "codigo", "barras");
          const nombre = getVal(row, "nombre del articulo", "nombre", "articulo", "descripcion");
          if (!codigo && !nombre) {
            skipped++;
            continue;
          }

          const stock = getNum(row, "stock");
          const costo = getNum(row, "precio de costo", "costo");
          // Match "precio" but exclude columns containing "costo" to avoid collision
          let precio = getNum(row, "precio de venta", "precio venta", "pvp", "principal");
          if (precio === 0) {
            // Fallback: look for a column named just "precio" (not "precio de costo")
            for (const k of Object.keys(row)) {
              const nk = normalize(k);
              if (nk.includes("precio") && !nk.includes("costo") && !nk.includes("caja")) {
                precio = parseFloat(String(row[k]).replace(",", ".")) || 0;
                if (precio > 0) break;
              }
            }
          }
          const unidadMedida = getVal(row, "unidad medida", "unidad") || "UN";
          const categoriaNombre = getVal(row, "categoria");
          const subcategoriaNombre = getVal(row, "subcategoria");
          const marcaNombre = getVal(row, "marca");
          const proveedorNombre = getVal(row, "proveedor");

          // Box presentation fields
          const cajaNombre = getVal(row, "presentacion caja");
          const cajaCantidad = getNum(row, "cantidad caja");
          const cajaCodigo = getVal(row, "codigo caja");
          const cajaCosto = getNum(row, "costo caja");
          const cajaPrecio = getNum(row, "precio caja");

          // Resolve IDs
          const categoriaId = await getOrCreateCategoria(categoriaNombre);
          const subcategoriaId = categoriaId ? await getOrCreateSubcategoria(subcategoriaNombre, categoriaId) : null;
          const marcaId = await getOrCreateMarca(marcaNombre);
          const proveedorId = await getOrCreateProveedor(proveedorNombre);

          // Check if product already exists by codigo
          if (codigo) {
            const { data: existing } = await supabase
              .from("productos")
              .select("id, precio, costo, stock, nombre")
              .eq("codigo", codigo)
              .maybeSingle();

            if (existing) {
              // UPDATE existing product
              const changes: string[] = [];
              const updatePayload: Record<string, unknown> = {};

              if (precio > 0 && precio !== existing.precio) {
                updatePayload.precio = precio;
                updatePayload.precio_anterior = existing.precio;
                changes.push(`Precio: ${existing.precio} → ${precio}`);
              }
              if (costo > 0 && costo !== existing.costo) {
                updatePayload.costo = costo;
                changes.push(`Costo: ${existing.costo} → ${costo}`);
              }
              if (stock > 0 && stock !== existing.stock) {
                updatePayload.stock = stock;
                changes.push(`Stock: ${existing.stock} → ${stock}`);
              }
              if (categoriaId) updatePayload.categoria_id = categoriaId;
              if (subcategoriaId) updatePayload.subcategoria_id = subcategoriaId;
              if (marcaId) updatePayload.marca_id = marcaId;

              if (Object.keys(updatePayload).length > 0) {
                // Only update fecha_actualizacion when price/cost changed
                if (updatePayload.precio || updatePayload.costo) {
                  updatePayload.fecha_actualizacion = new Date().toISOString();
                }
                await supabase.from("productos").update(updatePayload).eq("id", existing.id);
                // Sync Unidad presentation
                if (updatePayload.precio || updatePayload.costo) {
                  const syncPayload: Record<string, unknown> = {};
                  if (updatePayload.precio) syncPayload.precio = updatePayload.precio;
                  if (updatePayload.costo) syncPayload.costo = updatePayload.costo;
                  await supabase.from("presentaciones").update(syncPayload).eq("producto_id", existing.id).eq("nombre", "Unidad").eq("cantidad", 1);
                }
              }

              // Upsert box presentation if provided
              if (cajaCantidad > 0 && cajaPrecio > 0) {
                const boxNombre = cajaNombre || `Caja x${cajaCantidad}`;
                const { data: existingPres } = await supabase
                  .from("presentaciones")
                  .select("id, precio, cantidad, costo")
                  .eq("producto_id", existing.id)
                  .gt("cantidad", 1)
                  .maybeSingle();

                if (existingPres) {
                  const presUpdate: Record<string, unknown> = {};
                  if (cajaPrecio !== existingPres.precio) {
                    presUpdate.precio = cajaPrecio;
                    changes.push(`Precio Caja: ${existingPres.precio} → ${cajaPrecio}`);
                  }
                  if (cajaCosto > 0 && cajaCosto !== existingPres.costo) {
                    presUpdate.costo = cajaCosto;
                    changes.push(`Costo Caja: ${existingPres.costo} → ${cajaCosto}`);
                  }
                  if (cajaCantidad !== existingPres.cantidad) {
                    presUpdate.cantidad = cajaCantidad;
                    presUpdate.nombre = boxNombre;
                    changes.push(`Cantidad Caja: ${existingPres.cantidad} → ${cajaCantidad}`);
                  }
                  if (Object.keys(presUpdate).length > 0) {
                    await supabase.from("presentaciones").update(presUpdate).eq("id", existingPres.id);
                  }
                } else {
                  // Create new box presentation
                  await supabase.from("presentaciones").insert({
                    producto_id: existing.id,
                    nombre: boxNombre,
                    cantidad: cajaCantidad,
                    sku: cajaCodigo || null,
                    costo: cajaCosto || 0,
                    precio: cajaPrecio,
                  });
                  changes.push(`Nueva presentación: ${boxNombre} a ${cajaPrecio}`);
                }
              }

              if (changes.length > 0) {
                updated++;
                updatedDetails.push({ nombre: existing.nombre, changes });
              } else {
                skipped++;
              }

              // Link proveedor
              if (proveedorId) {
                await supabase.from("producto_proveedores").upsert(
                  { producto_id: existing.id, proveedor_id: proveedorId },
                  { onConflict: "producto_id,proveedor_id" }
                );
              }
              continue;
            }
          }

          // NEW product - skip if no precio
          if (precio <= 0) {
            skipped++;
            continue;
          }
          const finalPrecio = precio;
          const payload: Record<string, unknown> = {
            codigo: codigo || `AUTO-${Date.now()}-${i}`,
            nombre: nombre || codigo,
            stock,
            costo,
            precio: finalPrecio,
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

          // Create box presentation for new product
          if (inserted && cajaCantidad > 0 && cajaPrecio > 0) {
            await supabase.from("presentaciones").insert({
              producto_id: inserted.id,
              nombre: cajaNombre || `Caja x${cajaCantidad}`,
              cantidad: cajaCantidad,
              sku: cajaCodigo || null,
              costo: cajaCosto || 0,
              precio: cajaPrecio,
            });
          }

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

      setImportResult({ total: rows.length, imported, updated, skipped, updatedDetails, failed });
      await fetchProducts();
      await fetchCategories();
      await fetchSubcategories();
      await fetchMarcas();
      await fetchProveedores();
    } catch (err) {
      console.error("Import error:", err);
      setImportResult({ total: 0, imported: 0, updated: 0, skipped: 0, updatedDetails: [], failed: [{ row: 0, nombre: "Error general", error: String(err) }] });
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
    setPresentaciones((prev) => {
      const updated = prev.map((p, i) => (i === index ? { ...p, [field]: value } : p));
      // If unit row's costo/precio changed, sync to main form + recalc boxes
      const target = updated[index];
      if (target && target.cantidad === 1 && (field === "costo" || field === "precio") && typeof value === "number") {
        setForm((f) => ({ ...f, [field]: value }));
        return updated.map((p) => {
          if (p._deleted || p.cantidad === 1) return p;
          return { ...p, [field]: value * p.cantidad };
        });
      }
      return updated;
    });
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
    const q = norm(debouncedSearch);
    const arr = products.filter((p) => {
      const matchesSearch =
        !q ||
        norm(p.nombre).includes(q) ||
        norm(p.codigo).includes(q) ||
        (presCodigoMap[p.id] || []).some((pr) => norm(pr.codigo || "").includes(q)) ||
        norm(prodProvMap[p.id] || "").includes(q) ||
        ((p as any).tags || []).some((tag: string) => norm(tag).includes(q));
      const matchesCategory = category === "all" || p.categoria_id === category;
      const matchesSubcategory = subcategoryFilter === "all" || p.subcategoria_id === subcategoryFilter;
      const matchesMarca = marcaFilter === "all" || p.marca_id === marcaFilter;
      const effectiveStock = (p as any).es_combo ? (comboStockMap[p.id] ?? 0) : p.stock;
      const matchesStock = stockFilter === "all" || (stockFilter === "si" ? effectiveStock > 0 : effectiveStock === 0);
      const matchesTienda = tiendaFilter === "all" || (tiendaFilter === "visible" ? p.visibilidad === "visible" : p.visibilidad === "oculto");
      const matchesCombo = comboFilter === "all" || (comboFilter === "si" ? !!(p as any).es_combo : !(p as any).es_combo);
      const matchesDestacado = !soloDestacado || !!(p as any).destacado;
      return matchesSearch && matchesCategory && matchesSubcategory && matchesMarca && matchesStock && matchesTienda && matchesCombo && matchesDestacado;
    });
    arr.sort((a, b) => {
      if (sortBy === "nombre_asc") return a.nombre.localeCompare(b.nombre);
      if (sortBy === "nombre_desc") return b.nombre.localeCompare(a.nombre);
      if (sortBy === "updated_desc") {
        const da = (a as any).fecha_actualizacion ? new Date((a as any).fecha_actualizacion).getTime() : 0;
        const db = (b as any).fecha_actualizacion ? new Date((b as any).fecha_actualizacion).getTime() : 0;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db - da;
      }
      if (sortBy === "updated_asc") {
        const da = (a as any).fecha_actualizacion ? new Date((a as any).fecha_actualizacion).getTime() : 0;
        const db = (b as any).fecha_actualizacion ? new Date((b as any).fecha_actualizacion).getTime() : 0;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      }
      if (sortBy === "precio_asc") return a.precio - b.precio;
      if (sortBy === "precio_desc") return b.precio - a.precio;
      if (sortBy === "stock_asc") return a.stock - b.stock;
      return 0;
    });
    return arr;
  }, [products, debouncedSearch, presCodigoMap, prodProvMap, category, subcategoryFilter, marcaFilter, comboStockMap, stockFilter, tiendaFilter, comboFilter, soloDestacado, sortBy]);

  // Helper: get effective price considering precio_oferta (1.3)
  function getPrecioEfectivo(producto: { precio: number; precio_oferta?: number | null; precio_oferta_hasta?: string | null }): {
    precio: number;
    enOferta: boolean;
    precioOriginal: number;
  } {
    const today = new Date().toISOString().slice(0, 10);
    const ofertaVigente = producto.precio_oferta &&
      producto.precio_oferta > 0 &&
      (producto.precio_oferta_hasta === null || producto.precio_oferta_hasta === undefined || producto.precio_oferta_hasta >= today);
    if (ofertaVigente) {
      return { precio: producto.precio_oferta!, enOferta: true, precioOriginal: producto.precio };
    }
    return { precio: producto.precio, enOferta: false, precioOriginal: producto.precio };
  }

  // Quick stock adjust handler (1.2)
  const handleQuickStockAdjust = async () => {
    if (!stockPopover) return;
    const { productId, currentStock } = stockPopover;
    const { tipo, cantidad, motivo } = stockAdjust;
    let stockNuevo: number;
    if (tipo === "ajuste") stockNuevo = cantidad;
    else if (tipo === "sumar") stockNuevo = currentStock + cantidad;
    else stockNuevo = Math.max(0, currentStock - cantidad);
    const diff = stockNuevo - currentStock;
    await supabase.from("productos").update({ stock: stockNuevo }).eq("id", productId);
    await supabase.from("stock_movimientos").insert({
      producto_id: productId, tipo: motivo,
      cantidad_antes: currentStock, cantidad_despues: stockNuevo, cantidad: diff,
      descripcion: `Ajuste rápido: ${motivo} (${diff > 0 ? "+" : ""}${diff})`, usuario: "Admin",
    });
    showAdminToast("Stock actualizado", "success");
    setStockPopover(null);
    setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, stock: stockNuevo } : p));
  };

  // Load rotation velocity (1.10)
  const loadVelDiaria = async () => {
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const desde30 = hace30.toISOString().slice(0, 10);
    const { data: ventaIds } = await supabase.from("ventas").select("id").gte("fecha", desde30).neq("estado", "anulada");
    if (!ventaIds || ventaIds.length === 0) return;
    const ids = ventaIds.map((v: any) => v.id);
    const map: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: vitems } = await supabase.from("venta_items").select("producto_id, cantidad").in("venta_id", chunk);
      if (vitems) for (const item of vitems as any[]) map[item.producto_id] = (map[item.producto_id] || 0) + Number(item.cantidad);
    }
    const velDiariaMap: Record<string, number> = {};
    for (const [id, total] of Object.entries(map)) velDiariaMap[id] = Math.round((total / 30) * 10) / 10;
    setVelMap(velDiariaMap);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => setSelected(new Set(filtered.map((p) => p.id)));
  const deselectAll = () => setSelected(new Set());
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const handleMassDelete = () => {
    if (selected.size === 0) return;
    setActionConfirm({
      open: true, title: "Eliminar productos", message: `¿Eliminar ${selected.size} producto${selected.size > 1 ? "s" : ""}? Se desactivarán del sistema.`, variant: "destructive",
      onConfirm: async () => {
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200);
        await supabase.from("productos").update({ activo: false, visibilidad: "oculto" }).in("id", batch);
      }
      showAdminToast(`${selected.size} producto${selected.size > 1 ? "s" : ""} eliminado${selected.size > 1 ? "s" : ""}`, "success");
      setSelected(new Set());
      fetchProducts();
    } catch (err: any) {
      showAdminToast(err.message || "Error al eliminar productos", "error");
        }
        setDeleting(false);
      },
    });
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(page, totalPages);
  const paginatedProducts = useMemo(
    () => filtered.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize),
    [filtered, safeCurrentPage, pageSize]
  );

  const { outOfStock, lowStock, comboCount, lowStockProducts } = useMemo(() => {
    let oos = 0, low = 0, combos = 0;
    const lowList: { id: string; nombre: string; codigo: string; stock: number; stock_minimo: number }[] = [];
    for (const p of products) {
      const isComboP = !!(p as any).es_combo;
      if (isComboP) combos++;
      const effectiveStock = isComboP ? (comboStockMap[p.id] ?? 0) : p.stock;
      if (effectiveStock === 0) oos++;
      else if (effectiveStock <= (p.stock_minimo || 5)) {
        low++;
        lowList.push({ id: p.id, nombre: p.nombre, codigo: (p as any).codigo || "", stock: effectiveStock, stock_minimo: p.stock_minimo || 5 });
      }
    }
    lowList.sort((a, b) => a.stock - b.stock);
    return { outOfStock: oos, lowStock: low, comboCount: combos, lowStockProducts: lowList };
  }, [products, comboStockMap]);

  const [lowStockOpen, setLowStockOpen] = useState(false);

  // Stock quick-adjust popover (1.2)
  const [stockPopover, setStockPopover] = useState<{
    productId: string;
    productName: string;
    currentStock: number;
  } | null>(null);
  const [stockAdjust, setStockAdjust] = useState<{
    tipo: "sumar" | "restar" | "ajuste";
    cantidad: number;
    motivo: "ajuste" | "merma" | "ingreso" | "venta_manual";
  }>({ tipo: "sumar", cantidad: 1, motivo: "ingreso" });

  // Rotation velocity (1.10)
  const [velMap, setVelMap] = useState<Record<string, number>>({});
  const [showVelCol, setShowVelCol] = useState(false);

  // Precio oferta form toggle (1.3)
  const [showOfertaForm, setShowOfertaForm] = useState(false);

  // Catalog health bar state
  const [showProblemsView, setShowProblemsView] = useState(false);
  const [problemsTab, setProblemsTab] = useState<
    "sin_categoria" | "sin_imagen" | "precio_costo" | "sin_proveedor"
  >("sin_categoria");

  const catalogProblems = useMemo(() => {
    const sinCategoria = products.filter((p) => !p.categoria_id).length;
    const sinImagen = products.filter((p) => !(p as any).imagen_url).length;
    const precioBajoCosto = products.filter(
      (p) => p.costo > 0 && p.precio <= p.costo
    ).length;
    const sinProveedor = products.filter((p) => !prodProvMap[p.id]).length;
    const total = sinCategoria + sinImagen + precioBajoCosto + sinProveedor;
    return { sinCategoria, sinImagen, precioBajoCosto, sinProveedor, total };
  }, [products, prodProvMap]);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Productos</h1>
            <p className="text-sm text-muted-foreground">
              {filtered.length === products.length
                ? `${products.length} articulos en la lista de precios`
                : `${filtered.length} de ${products.length} articulos`}
            </p>
          </div>
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
            Nuevo artículo
          </Button>
        </div>
      </div>

      {/* Catalog health bar */}
      {catalogProblems.total > 0 && (
        <button
          onClick={() => setShowProblemsView(true)}
          className="w-full flex items-center gap-3 px-4 py-2.5 bg-background border border-red-200 rounded-xl text-left hover:border-red-300 transition-colors mb-4"
        >
          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
          <span className="text-sm text-red-700 flex-1">
            <strong>Catálogo con problemas:</strong>
            {catalogProblems.sinCategoria > 0 &&
              ` ${catalogProblems.sinCategoria} sin categoría ·`}
            {catalogProblems.sinImagen > 0 &&
              ` ${catalogProblems.sinImagen} sin imagen ·`}
            {catalogProblems.precioBajoCosto > 0 &&
              ` ${catalogProblems.precioBajoCosto} con precio < costo ·`}
            {catalogProblems.sinProveedor > 0 &&
              ` ${catalogProblems.sinProveedor} sin proveedor`}
          </span>
          <span className="text-xs text-primary underline shrink-0">Ver todos →</span>
        </button>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total articulos</p>
              <p className="text-xl font-bold">{products.length}</p>
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
        <Card
          className={`cursor-pointer transition-colors ${
            outOfStock > 0
              ? "border-red-200 hover:border-red-300"
              : "hover:bg-muted/40"
          }`}
          onClick={() => { setStockFilter("no"); setPage(1); }}
        >
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
        <Card
          className="cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => lowStock > 0 && setLowStockOpen(true)}
        >
          <CardContent className="pt-6 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lowStock > 0 ? "bg-orange-500/20" : "bg-orange-500/10"}`}>
              <AlertTriangle className={`w-5 h-5 ${lowStock > 0 ? "text-orange-600" : "text-orange-500"}`} />
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
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por codigo o descripcion..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9 h-11 text-base sm:h-9 sm:text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={soloDestacado ? "default" : "outline"}
                className="gap-2"
                onClick={() => { setSoloDestacado(!soloDestacado); setPage(1); }}
                title={`${products.filter((p: any) => p.destacado).length} productos destacados (se muestran hasta 8 en la tienda)`}
              >
                <Star className="w-4 h-4" />
                Destacados
                <span className={`text-xs font-normal ${soloDestacado ? "text-white/80" : "text-muted-foreground"}`}>
                  {products.filter((p: any) => p.destacado).length}/8
                </span>
              </Button>
              <Button
                variant={comboFilter === "si" ? "default" : "outline"}
                className="gap-2"
                onClick={() => { setComboFilter(comboFilter === "si" ? "all" : "si"); setPage(1); }}
              >
                <Layers className="w-4 h-4" />
                Combos
              </Button>
              <Button
                variant={showVelCol ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => {
                  if (!showVelCol && Object.keys(velMap).length === 0) loadVelDiaria();
                  setShowVelCol(!showVelCol);
                }}
              >
                <TrendingUp className="w-4 h-4" />
                Rotación
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
                Filtros
              </Button>
              {(() => {
                const totalOcultos = products.filter((p) => p.visibilidad === "oculto").length;
                const ocultosConStock = products.filter((p) => p.visibilidad === "oculto" && ((p as any).es_combo ? (comboStockMap[p.id] ?? 0) > 0 : p.stock > 0)).length;
                const ocultosSinStock = products.filter((p) => p.visibilidad === "oculto" && ((p as any).es_combo ? (comboStockMap[p.id] ?? 0) <= 0 : p.stock <= 0)).length;
                const visiblesSinStock = products.filter((p) => {
                  const effectiveStock = (p as any).es_combo && comboStockMap[p.id] !== undefined ? comboStockMap[p.id] : p.stock;
                  return effectiveStock <= 0 && p.visibilidad !== "oculto";
                }).length;
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button variant="outline" className="gap-2">
                        <Store className="w-4 h-4" />
                        Tienda online
                        {totalOcultos > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{totalOcultos} ocultos</Badge>}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <div className="px-3 py-2 border-b">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visibilidad en tienda</p>
                        <div className="flex gap-4 mt-1.5 text-sm">
                          <span className="text-emerald-600 font-medium">{products.length - totalOcultos} visibles</span>
                          <span className="text-red-500 font-medium">{totalOcultos} ocultos</span>
                        </div>
                      </div>
                      {visiblesSinStock > 0 && (
                        <DropdownMenuItem className="gap-2 text-red-600 cursor-pointer" onClick={() => {
                          setActionConfirm({
                            open: true, title: "Ocultar productos sin stock", message: `¿Ocultar ${visiblesSinStock} productos visibles que no tienen stock?`, variant: "destructive",
                            onConfirm: async () => {
                              const sinStock = products.filter((p) => {
                                const es = (p as any).es_combo && comboStockMap[p.id] !== undefined ? comboStockMap[p.id] : p.stock;
                                return es <= 0 && p.visibilidad !== "oculto";
                              });
                              const ids = sinStock.map((p) => p.id);
                              for (let i = 0; i < ids.length; i += 50) await supabase.from("productos").update({ visibilidad: "oculto" }).in("id", ids.slice(i, i + 50));
                              setProducts((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, visibilidad: "oculto" } : p));
                              showAdminToast(`${sinStock.length} productos ocultos`, "success");
                            },
                          });
                        }}>
                          <EyeOff className="w-4 h-4" />
                          Ocultar sin stock ({visiblesSinStock})
                        </DropdownMenuItem>
                      )}
                      {ocultosConStock > 0 && (
                        <DropdownMenuItem className="gap-2 text-emerald-600 cursor-pointer" onClick={() => {
                          setActionConfirm({
                            open: true, title: "Mostrar productos con stock", message: `¿Hacer visibles ${ocultosConStock} productos ocultos que tienen stock?`, variant: "default",
                            onConfirm: async () => {
                              const items = products.filter((p) => p.visibilidad === "oculto" && ((p as any).es_combo ? (comboStockMap[p.id] ?? 0) > 0 : p.stock > 0));
                              const ids = items.map((p) => p.id);
                              for (let i = 0; i < ids.length; i += 50) await supabase.from("productos").update({ visibilidad: "visible" }).in("id", ids.slice(i, i + 50));
                              setProducts((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, visibilidad: "visible" } : p));
                              showAdminToast(`${items.length} productos visibles`, "success");
                            },
                          });
                        }}>
                          <Eye className="w-4 h-4" />
                          Mostrar ocultos con stock ({ocultosConStock})
                        </DropdownMenuItem>
                      )}
                      {ocultosSinStock > 0 && (
                        <DropdownMenuItem className="gap-2 text-muted-foreground cursor-pointer" onClick={() => {
                          setActionConfirm({
                            open: true, title: "Mostrar todos los ocultos", message: `¿Hacer visibles ${ocultosSinStock} productos ocultos sin stock?`, variant: "default",
                            onConfirm: async () => {
                              const items = products.filter((p) => p.visibilidad === "oculto" && ((p as any).es_combo ? (comboStockMap[p.id] ?? 0) <= 0 : p.stock <= 0));
                              const ids = items.map((p) => p.id);
                              for (let i = 0; i < ids.length; i += 50) await supabase.from("productos").update({ visibilidad: "visible" }).in("id", ids.slice(i, i + 50));
                              setProducts((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, visibilidad: "visible" } : p));
                              showAdminToast(`${items.length} productos visibles`, "success");
                            },
                          });
                        }}>
                          <Eye className="w-4 h-4" />
                          Mostrar ocultos sin stock ({ocultosSinStock})
                        </DropdownMenuItem>
                      )}
                      {totalOcultos > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-emerald-600 font-medium cursor-pointer" onClick={() => {
                            setActionConfirm({
                              open: true, title: "Mostrar TODOS", message: `¿Hacer visibles los ${totalOcultos} productos ocultos?`, variant: "default",
                              onConfirm: async () => {
                                const ids = products.filter((p) => p.visibilidad === "oculto").map((p) => p.id);
                                for (let i = 0; i < ids.length; i += 50) await supabase.from("productos").update({ visibilidad: "visible" }).in("id", ids.slice(i, i + 50));
                                setProducts((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, visibilidad: "visible" } : p));
                                showAdminToast(`${ids.length} productos visibles`, "success");
                              },
                            });
                          }}>
                            <Eye className="w-4 h-4" />
                            Mostrar todos ({totalOcultos})
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })()}
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
                        {categories.filter((c) => norm(c.nombre).includes(norm(catSearch))).map((c) => (
                          <div key={c.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors group">
                            <button className="flex-1 text-left text-sm"
                              onClick={() => { setCategory(c.id); setCatSearch(""); setCatOpen(false); setSubcategoryFilter("all"); setPage(1); }}>
                              {c.nombre}
                            </button>
                            <button
                              title={c.restringida ? "Categoría restringida — click para hacer pública" : "Categoría pública — click para restringir"}
                              className={`p-1 rounded transition opacity-0 group-hover:opacity-100 ${c.restringida ? "opacity-100 text-amber-500 hover:text-amber-700" : "text-gray-300 hover:text-amber-500"}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const newVal = !c.restringida;
                                await supabase.from("categorias").update({ restringida: newVal }).eq("id", c.id);
                                setCategories((prev) => prev.map((cat) => cat.id === c.id ? { ...cat, restringida: newVal } : cat));
                                showAdminToast(newVal ? `"${c.nombre}" restringida — solo clientes autorizados` : `"${c.nombre}" pública — visible para todos`, "success");
                              }}
                            >
                              {c.restringida ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ))}
                        {categories.filter((c) => norm(c.nombre).includes(norm(catSearch))).length === 0 && (
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
                        {filteredSubcategoriesForFilter.filter((s) => norm(s.nombre).includes(norm(subcatSearch))).map((s) => (
                          <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setSubcategoryFilter(s.id); setSubcatSearch(""); setSubcatOpen(false); setPage(1); }}>
                            {s.nombre}
                          </button>
                        ))}
                        {filteredSubcategoriesForFilter.filter((s) => norm(s.nombre).includes(norm(subcatSearch))).length === 0 && (
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
                        {marcas.filter((m) => norm(m.nombre).includes(norm(marcaSearch))).map((m) => (
                          <button key={m.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setMarcaFilter(m.id); setMarcaSearch(""); setMarcaOpen(false); setPage(1); }}>
                            {m.nombre}
                          </button>
                        ))}
                        {marcas.filter((m) => norm(m.nombre).includes(norm(marcaSearch))).length === 0 && (
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
                <div>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">En Tienda</Label>
                  <Select value={tiendaFilter} onValueChange={(v) => { setTiendaFilter(v ?? "all"); setPage(1); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {tiendaFilter === "all" ? "Todos" : tiendaFilter === "visible" ? "Visible" : "Oculto"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="visible">Visible</SelectItem>
                      <SelectItem value="oculto">Oculto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Ordenar por</Label>
                  <Select value={sortBy} onValueChange={(v) => { setSortBy(v ?? "nombre_asc"); setPage(1); }}>
                    <SelectTrigger className="w-full">
                      {{
                        nombre_asc: "Nombre A→Z",
                        nombre_desc: "Nombre Z→A",
                        updated_desc: "Últ. modificación (reciente)",
                        updated_asc: "Últ. modificación (antigua)",
                        precio_asc: "Precio (menor)",
                        precio_desc: "Precio (mayor)",
                        stock_asc: "Stock (menor)",
                      }[sortBy] || "Nombre A→Z"}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nombre_asc">Nombre A→Z</SelectItem>
                      <SelectItem value="nombre_desc">Nombre Z→A</SelectItem>
                      <SelectItem value="updated_desc">Últ. modificación (reciente)</SelectItem>
                      <SelectItem value="updated_asc">Últ. modificación (antigua)</SelectItem>
                      <SelectItem value="precio_asc">Precio (menor)</SelectItem>
                      <SelectItem value="precio_desc">Precio (mayor)</SelectItem>
                      <SelectItem value="stock_asc">Stock (menor)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Selection toolbar */}
      {!loading && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={allFilteredSelected ? deselectAll : selectAllFiltered}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {allFilteredSelected ? "Deseleccionar todos" : "Seleccionar todos"} ({filtered.length})
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-border">|</span>
                <button onClick={deselectAll} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Limpiar selección</button>
              </>
            )}
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-medium">
                {selected.size} seleccionado{selected.size > 1 ? "s" : ""}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const ids = Array.from(selected).join(",");
                  window.location.href = `/admin/productos/editar-precios?ids=${ids}`;
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar precios ({selected.size})
              </Button>
              <Button variant="destructive" size="sm" onClick={handleMassDelete} disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Eliminar ({selected.size})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
            {/* ── Mobile product cards ── */}
            <div className="sm:hidden divide-y">
              {paginatedProducts.map((product) => {
                const displayStock = (product as any).es_combo ? (comboStockMap[product.id] ?? 0) : product.stock;
                return (
                  <div key={product.id} className="py-3 px-4 flex items-center gap-3 hover:bg-muted/30 transition-colors" onClick={() => openEdit(product)}>
                    <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {product.imagen_url
                        ? <img src={product.imagen_url} alt="" className="w-full h-full object-cover" />
                        : <ImageIcon className="w-5 h-5 text-muted-foreground/40" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm leading-tight">{product.nombre}</span>
                        {(product as any).es_combo && <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border border-emerald-300">COMBO</Badge>}
                        {product.visibilidad === "oculto" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">Oculto</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{product.categorias?.nombre || "—"}</span>
                        {product.marcas?.nombre && <span className="text-xs text-muted-foreground">· {product.marcas.nombre}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-sm">{formatCurrency(product.precio)}</p>
                      {displayStock === 0 ? (
                        <span className="text-[11px] text-red-500 font-medium">Sin stock</span>
                      ) : displayStock <= (product.stock_minimo || 5) ? (
                        <span className="text-[11px] text-orange-500 font-medium">Stock: {displayStock}</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Stock: {displayStock}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {paginatedProducts.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">Sin resultados</div>}
            </div>
            {/* ── Desktop table ── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-3 px-2 font-medium w-8">
                      <button onClick={allFilteredSelected ? deselectAll : selectAllFiltered}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${allFilteredSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                          {allFilteredSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                      </button>
                    </th>
                    <th className="py-3 px-2 font-medium w-10"></th>
                    <th className="text-left py-3 px-4 font-medium">Código</th>
                    <th className="text-left py-3 px-4 font-medium">Artículo</th>
                    <th className="text-left py-3 px-4 font-medium">Categoría</th>
                    <th className="text-left py-3 px-4 font-medium">Marca</th>
                    <th className="text-center py-3 px-4 font-medium">Stock</th>
                    <th className="text-right py-3 px-4 font-medium">Precio</th>
                    {showVelCol && <th className="text-center py-3 px-4 font-medium">Vel/día</th>}
                    <th className="text-center py-3 px-2 font-medium w-8"></th>
                    <th className="text-right py-3 px-4 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product) => {
                    const isSelected = selected.has(product.id);
                    return (
                    <tr
                      key={product.id}
                      className={`border-b last:border-0 transition-colors ${isSelected ? "bg-accent" : "hover:bg-muted/50"}`}
                    >
                      <td className="py-3 px-2">
                        <button onClick={() => toggleSelect(product.id)}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                            {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                        </button>
                      </td>
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
                      <td className="py-3 px-4 font-medium max-w-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="truncate max-w-[250px]" title={product.nombre}>{product.nombre}</span>
                          {product.visibilidad === "oculto" && (
                            <button
                              title="Oculto en la tienda — click para mostrar"
                              onClick={(e) => {
                                e.stopPropagation();
                                supabase.from("productos").update({ visibilidad: "visible" }).eq("id", product.id).then(() => {
                                  setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, visibilidad: "visible" } : p));
                                  showAdminToast(`${product.nombre} visible en la tienda`, "success");
                                });
                              }}
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition"
                            >
                              <EyeOff className="w-3 h-3" /> Oculto
                            </button>
                          )}
                          {(product as any).es_combo && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border border-emerald-300">COMBO</Badge>
                          )}
                          {presDisplayMap[product.id]?.slice().sort((a, b) => a.cantidad - b.cantidad).map((pres, i) => {
                            const isMedio = pres.cantidad < 1;
                            return (
                            <Badge key={i} variant="outline" className={`text-[10px] px-1.5 py-0 ${isMedio ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-blue-50 text-blue-600 border-blue-200"}`}>
                              {isMedio ? "Medio Cartón" : (pres.nombre || `x${pres.cantidad}`)}{!isMedio && !(pres.nombre || "").toLowerCase().includes(`x${pres.cantidad}`) ? ` (x${pres.cantidad})` : ""}
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
                        {product.marcas?.nombre || "—"}
                        {prodProvMap[product.id] && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">{prodProvMap[product.id]}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const displayStock = (product as any).es_combo
                            ? (comboStockMap[product.id] ?? 0)
                            : product.stock;
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if ((product as any).es_combo) return; // No quick adjust for combos
                                setStockPopover({ productId: product.id, productName: product.nombre, currentStock: displayStock });
                                setStockAdjust({ tipo: "sumar", cantidad: 1, motivo: "ingreso" });
                              }}
                              className="hover:bg-muted/50 px-2 py-1 rounded-md transition-colors cursor-pointer"
                              title="Click para ajustar stock"
                            >
                              {displayStock === 0 ? (
                                <Badge variant="destructive" className="text-xs font-normal">Sin stock</Badge>
                              ) : displayStock <= (product.stock_minimo || 5) ? (
                                <span className="text-orange-500 font-medium">{displayStock}</span>
                              ) : (
                                <span className="font-medium">{displayStock}</span>
                              )}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {(() => {
                          const { precio, enOferta, precioOriginal } = getPrecioEfectivo(product as any);
                          return enOferta ? (
                            <div>
                              <div className="text-orange-600 font-semibold">{formatCurrency(precio)}</div>
                              <div className="text-xs text-muted-foreground line-through">{formatCurrency(precioOriginal)}</div>
                            </div>
                          ) : (
                            <span>{formatCurrency(precio)}</span>
                          );
                        })()}
                        {product.costo > 0 && product.precio <= product.costo && (
                          <span title="Precio menor al costo"><AlertTriangle className="w-3.5 h-3.5 text-red-500 inline ml-1" /></span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <button
                          title={!!(product as any).destacado ? "Quitar de destacados" : "Marcar como destacado"}
                          onClick={(e) => {
                            e.stopPropagation();
                            const newVal = !(product as any).destacado;
                            setProducts((prev) =>
                              prev.map((p) => p.id === product.id ? { ...p, destacado: newVal } as any : p)
                            );
                            supabase
                              .from("productos")
                              .update({ destacado: newVal })
                              .eq("id", product.id)
                              .then(({ error }) => {
                                if (error) {
                                  setProducts((prev) =>
                                    prev.map((p) => p.id === product.id ? { ...p, destacado: !newVal } as any : p)
                                  );
                                  showAdminToast("Error al actualizar destacado", "error");
                                }
                              });
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                        >
                          <Star
                            className={`w-4 h-4 transition-colors ${!!(product as any).destacado ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
                          />
                        </button>
                      </td>
                      {showVelCol && (
                        <td className="py-3 px-4 text-center">
                          {velMap[product.id] != null ? (
                            <span className={`text-sm ${velMap[product.id] === 0 ? "text-muted-foreground" : velMap[product.id] >= 5 ? "text-green-600 font-medium" : "text-muted-foreground"}`}>
                              {velMap[product.id] > 0 ? `${velMap[product.id]}/d` : "—"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openEdit(product)}>
                              <Edit className="w-3.5 h-3.5 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openHistory(product)}>
                              <Clock className="w-3.5 h-3.5 mr-2" /> Historial stock
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPriceHistory(product)}>
                              <TrendingUp className="w-3.5 h-3.5 mr-2" /> Historial precios
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(product)}>
                              <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(product.id)}>
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
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
        <DialogContent className="w-full sm:max-w-4xl max-h-[100dvh] sm:max-h-[92vh] h-[100dvh] sm:h-auto p-0 gap-0 flex flex-col overflow-hidden rounded-none sm:rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                <Package className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <DialogHeader className="p-0 space-y-0">
                  <DialogTitle className="text-base sm:text-lg font-semibold truncate">
                    {editingProduct ? "Editar artículo" : "Nuevo artículo"}
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {editingProduct ? `Cod: ${form.codigo || "---"} · ${form.nombre || ""}` : "Complete los datos del producto"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, destacado: !form.destacado })}
                className={`flex items-center gap-1 h-8 px-2 sm:px-2.5 rounded-md border text-xs font-medium transition-all ${form.destacado ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-400 hover:text-amber-500 hover:border-amber-200"}`}
                title={form.destacado ? "Quitar de destacados" : "Marcar como destacado"}
              >
                <Star className={`w-3.5 h-3.5 ${form.destacado ? "fill-amber-500" : ""}`} />
                <span className="hidden sm:inline">{form.destacado ? "Destacado" : "Destacar"}</span>
              </button>
              <Select
                value={form.visibilidad}
                onValueChange={(v) => setForm({ ...form, visibilidad: v || "visible" })}
              >
                <SelectTrigger className={`w-24 sm:w-32 h-8 text-xs font-medium ${form.visibilidad === "visible" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-orange-300 bg-orange-50 text-orange-700"}`}>
                  <SelectValue placeholder="Visibilidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visible">Visible</SelectItem>
                  <SelectItem value="oculto">Oculto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {editingProduct && (
            <div className="flex border-b bg-muted/20 px-2 sm:px-6 overflow-x-auto shrink-0 scrollbar-none">
              {[["info","Información"],["precios","Precios"],["descuentos","Descuentos"],["stock","Stock"],["historial","Historial"]].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setEditTab(key)}
                  className={`shrink-0 px-3 sm:px-4 py-3 text-xs font-medium transition-all border-b-2 -mb-px ${editTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
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

            {/* TAB: info */}
            <div className={editingProduct && editTab !== "info" ? "hidden" : ""}>
            {/* Section 1: Product Info */}
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2 text-muted-foreground">
                <ImageIcon className="w-4 h-4" />
                Producto
              </h3>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-24 sm:w-32 shrink-0 mx-auto sm:mx-0">
                  <ImageUpload
                    value={form.imagen_url || undefined}
                    onChange={(url) => setForm((prev) => ({ ...prev, imagen_url: url }))}
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr_120px] gap-3">
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
                          <SelectValue placeholder="Unidad de medida" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UN">Unidad</SelectItem>
                          <SelectItem value="KG">Kilogramo</SelectItem>
                          <SelectItem value="LT">Litro</SelectItem>
                          <SelectItem value="MT">Metro</SelectItem>
                        </SelectContent>
                      </Select>
                      {editingProduct && presentaciones.filter((p) => !p._deleted && p.cantidad > 1).length > 0 && (
                        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2 mt-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Tiene presentaciones de caja. Cambiar la unidad puede afectar cálculos.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Descripción (opcional)</Label>
                    <Textarea
                      rows={2}
                      value={form.descripcion_detallada}
                      onChange={(e) => setForm({ ...form, descripcion_detallada: e.target.value })}
                      placeholder="Descripción opcional del producto..."
                      className="resize-none text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Classification - horizontal row */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">Clasificación</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Categoria searchable */}
                {(() => {
                  const [catSearch, setCatSearch] = [formCatSearch, setFormCatSearch];
                  const [catOpen, setCatOpen] = [formCatOpen, setFormCatOpen];
                  const filtered = categories.filter((c) => norm(c.nombre).includes(norm(catSearch)));
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
                  const filtered = filteredSubcategories.filter((s) => norm(s.nombre).includes(norm(subSearch)));
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
                  const filtered = marcas.filter((m) => norm(m.nombre).includes(norm(marcaSearch)));
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
                          {filtered.length === 0 && marcaSearch.trim() && (
                            <button
                              type="button"
                              onClick={async () => {
                                const nombre = marcaSearch.trim();
                                const { data } = await supabase.from("marcas").insert({ nombre }).select("id").single();
                                if (data) {
                                  setMarcas((prev) => [...prev, { id: data.id, nombre }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
                                  setForm({ ...form, marca_id: data.id });
                                  showAdminToast(`Marca "${nombre}" creada`, "success");
                                }
                                setMarcaOpen(false);
                                setMarcaSearch("");
                              }}
                              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-emerald-50 text-emerald-700 font-medium flex items-center gap-2"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Crear &quot;{marcaSearch.trim()}&quot;
                            </button>
                          )}
                          {filtered.length === 0 && !marcaSearch.trim() && <p className="text-xs text-muted-foreground text-center py-2">Sin marcas</p>}
                        </div>
                      </div>
                    </>)}
                  </div>
                  );
                })()}
              </div>
            </div>
            </div>
            {/* END TAB: info (sections 1+2) */}

            {/* TAB: precios */}
            <div className={editingProduct && editTab !== "precios" ? "hidden" : ""}>
            {/* Section 3: Pricing & Stock - redesigned */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Precios e Inventario</h3>

              {/* Pricing row with visual cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative rounded-xl border-2 border-blue-100 bg-gradient-to-b from-blue-50/80 to-white p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-blue-600">C</span>
                    </div>
                    <Label className="text-xs font-semibold text-blue-700">Costo</Label>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <MoneyInput
                      min={0}
                      value={form.costo}
                      onValueChange={(v) => {
                        const newCosto = Math.max(0, v);
                        const oldCosto = form.costo || 0;
                        let newPrecio = form.precio;
                        if (oldCosto > 0) {
                          const margin = (form.precio - oldCosto) / oldCosto;
                          newPrecio = Math.round(newCosto * (1 + margin));
                        }
                        setForm({ ...form, costo: newCosto, precio: newPrecio });
                        const priceRatio = form.precio > 0 ? newPrecio / form.precio : 1;
                        setPresentaciones((prev) =>
                          prev.map((p) => {
                            if (p._deleted) return p;
                            if (p.cantidad === 1) return { ...p, costo: newCosto, precio: newPrecio };
                            return { ...p, costo: newCosto * p.cantidad, precio: Math.round(p.precio * priceRatio) };
                          })
                        );
                      }}
                      className="h-10 pl-7 text-lg font-semibold bg-white/80"
                    />
                  </div>
                </div>

                <div className="relative rounded-xl border-2 border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-emerald-600">$</span>
                    </div>
                    <Label className="text-xs font-semibold text-emerald-700">Precio venta</Label>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <MoneyInput
                      min={0}
                      value={form.precio}
                      onValueChange={(v) => {
                        const newPrecio = Math.max(0, v);
                        setForm({ ...form, precio: newPrecio });
                        setPresentaciones((prev) =>
                          prev.map((p) => {
                            if (p._deleted) return p;
                            if (p.cantidad === 1) return { ...p, precio: newPrecio };
                            return { ...p, precio: newPrecio * p.cantidad };
                          })
                        );
                      }}
                      className="h-10 pl-7 text-lg font-semibold bg-white/80"
                    />
                  </div>
                </div>

                <div className="relative rounded-xl border-2 border-violet-100 bg-gradient-to-b from-violet-50/80 to-white p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-violet-600">%</span>
                    </div>
                    <Label className="text-xs font-semibold text-violet-700">Margen</Label>
                  </div>
                  {form.costo > 0 ? (
                    <>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.1"
                          value={Math.round(((form.precio - form.costo) / form.costo) * 1000) / 10}
                          onChange={(e) => {
                            const newMargen = Number(e.target.value);
                            const newPrecio = Math.round(form.costo * (1 + newMargen / 100));
                            setForm({ ...form, precio: newPrecio });
                            setPresentaciones((prev) =>
                              prev.map((p) => {
                                if (p._deleted) return p;
                                if (p.cantidad === 1) return { ...p, precio: newPrecio };
                                return { ...p, precio: newPrecio * p.cantidad };
                              })
                            );
                          }}
                          className="h-10 pr-7 text-lg font-semibold text-center bg-white/80"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                      <p className={`text-[11px] text-center font-medium ${(form.precio - form.costo) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        Ganancia: {formatCurrency(form.precio - form.costo)}
                      </p>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-10 rounded-md text-sm bg-white/50 text-muted-foreground border">
                      Ingresá costo
                    </div>
                  )}
                </div>
              </div>

              {/* Margin alert (1.6) */}
              {form.costo > 0 && form.precio > 0 && form.precio <= form.costo && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>El precio de venta es menor o igual al costo. Estás vendiendo a pérdida.</span>
                </div>
              )}

              {/* Precio de oferta (1.3) */}
              <div className="border rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowOfertaForm(!showOfertaForm)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Tag className="w-4 h-4 text-orange-500" />
                    Precio de oferta
                    {form.precio_oferta && form.precio_oferta > 0 && (
                      <Badge className="text-[10px] bg-orange-100 text-orange-700 hover:bg-orange-100">
                        {formatCurrency(form.precio_oferta)}
                        {form.precio_oferta_hasta ? ` · hasta ${new Date(form.precio_oferta_hasta + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}` : " · permanente"}
                      </Badge>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showOfertaForm ? "rotate-180" : ""}`} />
                </button>
                {showOfertaForm && (
                  <div className="p-4 space-y-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      El precio de oferta reemplaza al precio normal en la tienda y en el POS durante el período indicado.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Precio de oferta</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                          <MoneyInput
                            value={form.precio_oferta || 0}
                            onValueChange={(v) => setForm({ ...form, precio_oferta: v > 0 ? v : undefined })}
                            className="pl-7 h-9"
                          />
                        </div>
                        {form.precio_oferta && form.precio_oferta > 0 && form.precio > 0 && (
                          <p className="text-[11px] text-orange-600 font-medium">
                            {Math.round((1 - form.precio_oferta / form.precio) * 100)}% de descuento
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Válido hasta (vacío = permanente)</Label>
                        <Input
                          type="date"
                          value={form.precio_oferta_hasta || ""}
                          onChange={(e) => setForm({ ...form, precio_oferta_hasta: e.target.value || undefined })}
                          className="h-9"
                        />
                      </div>
                    </div>
                    {form.precio_oferta && form.precio_oferta > 0 && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, precio_oferta: undefined, precio_oferta_hasta: undefined })}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors"
                      >
                        Quitar precio de oferta
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Recalc box prices suggestion (1.12) */}
              {presentaciones.some((p) => !p._deleted && p.cantidad > 1) &&
                editingProduct &&
                editingProduct.precio !== form.precio && (
                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  <span>El precio unitario cambió. ¿Actualizar los precios de caja proporcionalmente?</span>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0" onClick={recalcBoxPrices}>
                    Recalcular cajas
                  </Button>
                </div>
              )}

              {/* Price History - collapsible */}
              {editingProduct && priceHistory.length > 0 && (
                <details className="group border rounded-lg">
                  <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition rounded-lg">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Historial de precios</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{priceHistory.length}</Badge>
                    <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto transition group-open:rotate-180" />
                  </summary>
                  <div className="px-3 pb-2">
                    <div className="max-h-28 overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <thead><tr className="text-muted-foreground border-b">
                          <th className="text-left py-1 px-1">Fecha</th>
                          <th className="text-right py-1 px-1">Precio ant.</th>
                          <th className="text-right py-1 px-1">Precio nuevo</th>
                          <th className="text-right py-1 px-1">Costo ant.</th>
                          <th className="text-right py-1 px-1">Costo nuevo</th>
                        </tr></thead>
                        <tbody>
                          {priceHistory.map((h) => (
                            <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-1 px-1 text-muted-foreground">{new Date(h.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                              <td className="py-1 px-1 text-right">{formatCurrency(h.precio_anterior)}</td>
                              <td className="py-1 px-1 text-right font-medium">{formatCurrency(h.precio_nuevo)}</td>
                              <td className="py-1 px-1 text-right">{h.costo_anterior ? formatCurrency(h.costo_anterior) : "—"}</td>
                              <td className="py-1 px-1 text-right">{h.costo_nuevo ? formatCurrency(h.costo_nuevo) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              )}

            </div>
            {/* END Section 3 pricing part */}
            </div>
            {/* END TAB: precios (section 3 pricing) */}

            {/* TAB: descuentos */}
            {editingProduct && editTab === "descuentos" && (
              <div className="space-y-5">
                {/* Descuentos directos */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Descuentos directos ({productDiscounts.filter((d) => (d.productos_ids || []).includes(editingProduct.id)).length})
                    </h3>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => setShowDiscountForm(!showDiscountForm)}>
                      <Plus className="w-3 h-3" /> {showDiscountForm ? "Cancelar" : "Agregar"}
                    </Button>
                  </div>

                  {showDiscountForm && (
                    <div className="p-3 bg-orange-50/50 border rounded-lg mb-3 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="col-span-2">
                          <Label className="text-[10px] text-muted-foreground">Nombre</Label>
                          <Input placeholder="Ej: Promo x10 unidades" value={discountForm.nombre} onChange={(e) => setDiscountForm({ ...discountForm, nombre: e.target.value })} className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Descuento %</Label>
                          <Input type="number" min="1" max="100" value={discountForm.porcentaje} onChange={(e) => setDiscountForm({ ...discountForm, porcentaje: Math.max(1, Math.min(100, Number(e.target.value))) })} className="h-8 text-xs text-center" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                          <select value={discountForm.tipo} onChange={(e) => setDiscountForm({ ...discountForm, tipo: e.target.value })} className="w-full h-8 text-xs border rounded-md px-2 bg-background">
                            <option value="general">General</option>
                            <option value="por_cantidad">Por cantidad mín.</option>
                            <option value="solo_caja">Solo cajas</option>
                            <option value="solo_unidad">Solo unidad</option>
                          </select>
                        </div>
                      </div>
                      {discountForm.tipo === "por_cantidad" && (
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Cantidad mínima:</Label>
                          <Input type="number" min="2" value={discountForm.cantidad_minima} onChange={(e) => setDiscountForm({ ...discountForm, cantidad_minima: Math.max(2, Number(e.target.value)) })} className="h-7 text-xs w-20" />
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                        <div><Label className="text-[10px] text-muted-foreground">Desde</Label><Input type="date" value={discountForm.fecha_inicio} onChange={(e) => setDiscountForm({ ...discountForm, fecha_inicio: e.target.value })} className="h-8 text-xs" /></div>
                        <div><Label className="text-[10px] text-muted-foreground">Hasta (opcional)</Label><Input type="date" value={discountForm.fecha_fin} onChange={(e) => setDiscountForm({ ...discountForm, fecha_fin: e.target.value })} className="h-8 text-xs" /></div>
                        <Button type="button" size="sm" className="h-8 text-xs bg-orange-600 hover:bg-orange-700" onClick={saveProductDiscount} disabled={savingDiscount || !discountForm.nombre || discountForm.porcentaje <= 0}>
                          {savingDiscount ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                          Crear descuento
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {productDiscounts
                      .filter((d) => d.aplica_a === "productos" && (d.productos_ids || []).includes(editingProduct.id))
                      .map((d) => (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-l-[3px] border-l-primary hover:bg-muted/30 transition-colors">
                          <Badge className={`shrink-0 text-[10px] h-5 px-2 ${d.activo ? "bg-green-600 text-white" : "bg-gray-300 text-gray-600"}`}>{d.porcentaje}%</Badge>
                          <span className={`text-xs font-medium flex-1 truncate ${!d.activo ? "line-through text-muted-foreground" : ""}`}>{d.nombre}</span>
                          {d.presentacion === "caja" && <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">Cajas</Badge>}
                          {d.cantidad_minima && <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 text-orange-600 border-orange-300">≥{d.cantidad_minima}</Badge>}
                          <span className="text-[10px] text-muted-foreground shrink-0">{d.fecha_fin ? `Hasta ${new Date(d.fecha_fin).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}` : "Sin venc."}</span>
                          <button type="button" onClick={() => toggleProductDiscount(d.id, d.activo)} className={`w-8 h-4 rounded-full transition relative ${d.activo ? "bg-green-500" : "bg-gray-300"}`}>
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${d.activo ? "left-4" : "left-0.5"}`} />
                          </button>
                          <button type="button" onClick={() => deleteProductDiscount(d.id)} className="text-red-400 hover:text-red-600 transition p-0.5"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                    {productDiscounts.filter((d) => d.aplica_a === "productos" && (d.productos_ids || []).includes(editingProduct.id)).length === 0 && !showDiscountForm && (
                      <p className="text-xs text-muted-foreground text-center py-3">Sin descuentos directos</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Descuentos heredados (solo lectura) */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Descuentos heredados que también aplican
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Solo lectura</span>
                  </h3>
                  <div className="space-y-2">
                    {productDiscounts
                      .filter((d) => {
                        if (d.aplica_a === "productos" && (d.productos_ids || []).includes(editingProduct.id)) return false;
                        if (d.aplica_a === "todos") return true;
                        if (d.aplica_a === "categorias" && (d.categorias_ids || []).includes(form.categoria_id)) return true;
                        if (d.aplica_a === "subcategorias" && (d.subcategorias_ids || []).includes(form.subcategoria_id)) return true;
                        return false;
                      })
                      .map((d) => (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-l-[3px] border-l-border opacity-75">
                          <Badge className="shrink-0 text-[10px] h-5 px-2 bg-gray-200 text-gray-600">{d.porcentaje}%</Badge>
                          <span className="text-xs text-muted-foreground flex-1 truncate">{d.nombre}</span>
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                            {d.aplica_a === "todos" ? "Global" : d.aplica_a === "categorias" ? "Por categoría" : "Por subcategoría"}
                          </span>
                          <Link href="/admin/productos/descuentos" className="text-[10px] text-primary hover:underline shrink-0">Ver →</Link>
                        </div>
                      ))}
                    {productDiscounts.filter((d) => {
                      if (d.aplica_a === "productos" && (d.productos_ids || []).includes(editingProduct.id)) return false;
                      if (d.aplica_a === "todos") return true;
                      if (d.aplica_a === "categorias" && (d.categorias_ids || []).includes(form.categoria_id)) return true;
                      if (d.aplica_a === "subcategorias" && (d.subcategorias_ids || []).includes(form.subcategoria_id)) return true;
                      return false;
                    }).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No hay descuentos globales o por categoría aplicando a este producto</p>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    En una venta se aplica el descuento más favorable. Los descuentos heredados se gestionan en{" "}
                    <Link href="/admin/productos/descuentos" className="text-primary hover:underline">Descuentos globales</Link>.
                  </p>
                </div>
              </div>
            )}
            {/* END TAB: descuentos */}

            {/* TAB: precios (continued - box summary, combos, presentaciones) */}
            <div className={editingProduct && editTab !== "precios" ? "hidden" : ""}>
            {/* Box summary */}
            <div className="space-y-4">
              {presentaciones.filter((p) => !p._deleted && p.cantidad > 1).map((box, i) => {
                const boxMargen = box.costo > 0 ? ((box.precio - box.costo) / box.costo) * 100 : 0;
                const boxGanancia = box.precio - box.costo;
                const stockCajas = box.cantidad > 0 ? Math.floor(form.stock / box.cantidad) : 0;
                const restoUnidades = box.cantidad > 0 ? form.stock % box.cantidad : form.stock;
                return (
                  <div key={i} className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Box className="w-3.5 h-3.5 text-emerald-600" />
                      <p className="text-xs font-semibold text-emerald-700">{box.nombre}</p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-xs">
                      <div><span className="text-muted-foreground block">Costo</span><p className="font-semibold">{formatCurrency(box.costo)}</p></div>
                      <div><span className="text-muted-foreground block">Precio</span><p className="font-semibold">{formatCurrency(box.precio)}</p></div>
                      <div><span className="text-muted-foreground block">Margen</span><p className={`font-semibold ${boxGanancia >= 0 ? "text-emerald-700" : "text-red-600"}`}>{box.costo > 0 ? `${boxMargen.toFixed(1)}%` : "—"}</p></div>
                      <div><span className="text-muted-foreground block">Cajas</span><p className="font-semibold">{stockCajas}</p></div>
                      <div><span className="text-muted-foreground block">Sueltas</span><p className="font-semibold">{restoUnidades} un.</p></div>
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
                    <span>Stock disponible: <strong>{Math.min(...comboItems.map((i) => i.cantidad > 0 ? Math.floor((i.producto?.stock || 0) / i.cantidad) : 0))}</strong></span>
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

              {/* Presentaciones cards — Unidad is already shown in the Costo/Precio/Margen cards above */}
              <div className="space-y-3">
                {presentaciones
                  .map((pres, idx) => ({ pres, idx }))
                  .filter(({ pres }) => !pres._deleted && !(pres.nombre === "Unidad" && pres.cantidad === 1))
                  .sort((a, b) => {
                    if (a.pres.cantidad < 1 && b.pres.cantidad >= 1) return -1;
                    if (a.pres.cantidad >= 1 && b.pres.cantidad < 1) return 1;
                    return a.pres.cantidad - b.pres.cantidad;
                  })
                  .map(({ pres, idx }) => {
                    const isUnit = false; // Unidad is filtered out above
                    const unit = getUnitPresentacion();
                    const margen = pres.costo > 0 ? ((pres.precio - pres.costo) / pres.costo) * 100 : 0;
                    const ganancia = pres.precio - pres.costo;
                    const unitPriceInBox = !isUnit && pres.cantidad > 0 ? Math.round(pres.precio / pres.cantidad) : 0;
                    return (
                      <div key={idx} className="border-2 border-emerald-100 rounded-xl bg-gradient-to-b from-emerald-50/50 to-white p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Box className="w-4 h-4 text-emerald-500" />
                            <span className="font-semibold text-sm">{pres.nombre || `Caja x${pres.cantidad}`}</span>
                            {unitPriceInBox > 0 && (
                              <span className="text-[11px] text-muted-foreground">({formatCurrency(unitPriceInBox)} c/u)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`text-xs font-semibold px-2 py-0.5 rounded ${ganancia >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {pres.costo > 0 ? `${margen.toFixed(1)}% · ${formatCurrency(ganancia)}` : "—"}
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removePresentacion(idx)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        {/* 3 cards: Costo / Precio / Margen — same style as Unit */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="rounded-lg border border-blue-100 bg-white/80 p-2.5 space-y-1">
                            <div className="flex items-center gap-1">
                              <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-blue-600">C</span>
                              </div>
                              <label className="text-[10px] font-semibold text-blue-700">Costo (x{pres.cantidad})</label>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                              <MoneyInput min={0} value={pres.costo} onValueChange={(v) => updatePresentacion(idx, "costo", Math.max(0, v))} className="h-9 pl-5 text-sm font-semibold bg-white" />
                            </div>
                          </div>
                          <div className="rounded-lg border border-emerald-100 bg-white/80 p-2.5 space-y-1">
                            <div className="flex items-center gap-1">
                              <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-emerald-600">$</span>
                              </div>
                              <label className="text-[10px] font-semibold text-emerald-700">Precio (x{pres.cantidad})</label>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                              <MoneyInput min={0} value={pres.precio} onValueChange={(v) => updatePresentacion(idx, "precio", Math.max(0, v))} className="h-9 pl-5 text-sm font-semibold bg-white" />
                            </div>
                          </div>
                          <div className="rounded-lg border border-violet-100 bg-white/80 p-2.5 space-y-1">
                            <div className="flex items-center gap-1">
                              <div className="w-4 h-4 rounded-full bg-violet-100 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-violet-600">%</span>
                              </div>
                              <label className="text-[10px] font-semibold text-violet-700">Margen</label>
                            </div>
                            <div className="relative">
                              <Input type="number" min="0" step="0.1" value={pres.costo > 0 ? Number(margen.toFixed(1)) : ""} onChange={(e) => { const m = Number(e.target.value); if (pres.costo > 0 && m >= 0) updatePresentacion(idx, "precio", Math.round(pres.costo * (1 + m / 100))); }} className="h-9 pr-7 text-sm font-semibold bg-white" placeholder="—" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                            </div>
                            <p className="text-[10px] text-emerald-600 font-medium text-center">Ganancia: {formatCurrency(ganancia)}</p>
                          </div>
                        </div>
                        {/* Extra fields: Unidades, Oferta, Código, Nombre */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground font-medium">Unidades</label>
                            <Input type="number" value={pres.cantidad} onChange={(e) => { const newQty = Number(e.target.value); updatePresentacion(idx, "cantidad", newQty); if (unit && newQty > 0) { const cn = pres.nombre; const auto = !cn || /^Caja\s*x\d*$/i.test(cn); if (auto) updatePresentacion(idx, "nombre", newQty < 1 ? "Medio Carton" : `Caja x${newQty}`); updatePresentacion(idx, "costo", unit.costo * newQty); updatePresentacion(idx, "precio", unit.precio * newQty); } }} className="h-8 text-xs" step={form.unidad_medida === "Mt" ? 0.5 : 1} min={form.unidad_medida === "Mt" ? 0.5 : 1} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground font-medium">Oferta</label>
                            <MoneyInput value={pres.precio_oferta ?? 0} onValueChange={(v) => updatePresentacion(idx, "precio_oferta", v > 0 ? v : null)} className="h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground font-medium">Código</label>
                            <Input value={pres.sku} onChange={(e) => updatePresentacion(idx, "sku", e.target.value)} className="h-8 text-xs font-mono" placeholder={form.codigo ? `${form.codigo}-C${pres.cantidad}` : "Código"} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground font-medium">Nombre</label>
                            <Input value={pres.nombre} onChange={(e) => updatePresentacion(idx, "nombre", e.target.value)} className="h-8 text-xs" placeholder={`Caja x${pres.cantidad}`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
            </div>
            {/* END TAB: precios (box summary, combos, presentaciones) */}

            {/* TAB: info (proveedores) */}
            <div className={editingProduct && editTab !== "info" ? "hidden" : ""}>
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

            {/* Tags (1.11) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Etiquetas</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 border rounded-lg">
                {(form.tags || []).map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                    {tag}
                    <button type="button" onClick={() => setForm({ ...form, tags: form.tags.filter((_, j) => j !== i) })} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  placeholder="Agregar etiqueta..."
                  className="flex-1 min-w-[120px] text-xs outline-none bg-transparent placeholder:text-muted-foreground"
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === ",") && (e.target as HTMLInputElement).value.trim()) {
                      e.preventDefault();
                      const newTag = (e.target as HTMLInputElement).value.trim().toLowerCase();
                      if (!form.tags.includes(newTag)) setForm({ ...form, tags: [...(form.tags || []), newTag] });
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Enter o coma para agregar. Ej: sin-tacc, vegano, temporada, liquidación</p>
            </div>
            </div>
            {/* END TAB: info (proveedores + tags) */}

            {/* TAB: stock */}
            <div className={editingProduct && editTab !== "stock" ? "hidden" : ""}>
              {(() => {
                const effectiveStock = isCombo && comboItems.length > 0
                  ? Math.min(...comboItems.map((ci) => ci.cantidad > 0 ? Math.floor((ci.producto?.stock || 0) / ci.cantidad) : 0))
                  : form.stock;
                return (
              <div className="space-y-6">
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Stock actual</p>
                  <p className={`text-5xl font-bold ${effectiveStock <= form.stock_minimo && effectiveStock > 0 ? "text-orange-600" : effectiveStock <= 0 ? "text-red-600" : "text-foreground"}`}>
                    {effectiveStock}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{isCombo ? "combos disponibles" : form.unidad_medida === "KG" ? "kilogramos" : "unidades"}</p>
                  {isCombo && (
                    <p className="text-xs text-muted-foreground mt-2">Calculado según el stock de los componentes</p>
                  )}
                </div>

                {isCombo && comboItems.length > 0 && (
                  <div className="border rounded-xl p-4 space-y-2">
                    <p className="text-xs text-muted-foreground mb-2">Detalle por componente</p>
                    {comboItems.map((ci) => {
                      const available = ci.cantidad > 0 ? Math.floor((ci.producto?.stock || 0) / ci.cantidad) : 0;
                      return (
                        <div key={ci.producto_id} className="flex items-center justify-between text-sm">
                          <span>{ci.producto?.nombre || ci.producto_id}</span>
                          <span className="text-muted-foreground">
                            {ci.producto?.stock || 0} un. / {ci.cantidad} = <strong className={available <= 0 ? "text-red-500" : ""}>{available} combos</strong>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-xl p-4 space-y-2">
                    <Label className="text-xs text-muted-foreground">Stock mínimo</Label>
                    <Input type="number" min="0" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: Math.max(0, Number(e.target.value)) })} className="h-10 text-lg font-semibold text-center" />
                    <p className="text-[11px] text-muted-foreground text-center">Alerta cuando el stock baje de este valor</p>
                  </div>
                  <div className="border rounded-xl p-4 space-y-2">
                    <Label className="text-xs text-muted-foreground">Stock máximo</Label>
                    <Input type="number" min="0" value={form.stock_maximo} onChange={(e) => setForm({ ...form, stock_maximo: Math.max(0, Number(e.target.value)) })} className="h-10 text-lg font-semibold text-center" />
                    <p className="text-[11px] text-muted-foreground text-center">Capacidad máxima de almacenamiento</p>
                  </div>
                </div>

                {/* Stock status indicator */}
                <div className="border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-3">Estado del stock</p>
                  {effectiveStock <= 0 ? (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Sin stock</span>
                    </div>
                  ) : effectiveStock <= form.stock_minimo ? (
                    <div className="flex items-center gap-2 text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Stock bajo — por debajo del mínimo ({form.stock_minimo})</span>
                    </div>
                  ) : form.stock_maximo > 0 && effectiveStock >= form.stock_maximo ? (
                    <div className="flex items-center gap-2 text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                      <Package className="w-4 h-4" />
                      <span className="text-sm font-medium">Stock al máximo</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                      <Check className="w-4 h-4" />
                      <span className="text-sm font-medium">Stock normal</span>
                    </div>
                  )}
                  {/* Progress bar */}
                  {form.stock_maximo > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>0</span>
                        <span>{form.stock_maximo}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${effectiveStock <= form.stock_minimo ? "bg-orange-500" : effectiveStock >= form.stock_maximo ? "bg-blue-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(100, (effectiveStock / form.stock_maximo) * 100)}%` }}
                        />
                      </div>
                      {form.stock_minimo > 0 && (
                        <div className="relative h-0">
                          <div className="absolute top-[-14px] text-[9px] text-orange-500 font-medium" style={{ left: `${Math.min(100, (form.stock_minimo / form.stock_maximo) * 100)}%`, transform: "translateX(-50%)" }}>
                            ▼ {form.stock_minimo}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Box breakdown */}
                {!isCombo && presentaciones.filter((p) => !p._deleted && p.cantidad > 1).length > 0 && (
                  <div className="border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-3">Desglose por presentación</p>
                    <div className="space-y-2">
                      {presentaciones.filter((p) => !p._deleted && p.cantidad > 1).map((box, i) => {
                        const stockCajas = box.cantidad > 0 ? Math.floor(effectiveStock / box.cantidad) : 0;
                        const restoUnidades = box.cantidad > 0 ? effectiveStock % box.cantidad : effectiveStock;
                        return (
                          <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Box className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{box.nombre}</span>
                              <span className="text-xs text-muted-foreground">({box.cantidad} un.)</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="font-semibold">{stockCajas} cajas</span>
                              {restoUnidades > 0 && <span className="text-muted-foreground">+ {restoUnidades} sueltas</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
                );
              })()}
            </div>
            {/* END TAB: stock */}

            {/* TAB: historial */}
            <div className={editingProduct && editTab !== "historial" ? "hidden" : ""}>
              <div className="space-y-4">
                {priceHistory.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Historial de precios
                      </h3>
                      <Badge variant="secondary" className="text-xs">{priceHistory.length} cambios</Badge>
                    </div>
                    <div className="space-y-3">
                      {priceHistory.map((h, i) => {
                        const precioChange = h.precio_nuevo - h.precio_anterior;
                        const costoChange = h.costo_nuevo - h.costo_anterior;
                        return (
                          <div key={h.id} className="border rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${precioChange > 0 ? "bg-red-500" : precioChange < 0 ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                                <span className="text-xs text-muted-foreground">
                                  {new Date(h.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(h.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              {h.usuario && <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{h.usuario}</span>}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Precio</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground line-through">{formatCurrency(h.precio_anterior)}</span>
                                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm font-semibold">{formatCurrency(h.precio_nuevo)}</span>
                                  {precioChange !== 0 && (
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${precioChange > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                                      {precioChange > 0 ? "+" : ""}{((precioChange / (h.precio_anterior || 1)) * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Costo</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground line-through">{h.costo_anterior ? formatCurrency(h.costo_anterior) : "\u2014"}</span>
                                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm font-semibold">{h.costo_nuevo ? formatCurrency(h.costo_nuevo) : "\u2014"}</span>
                                  {costoChange !== 0 && h.costo_anterior > 0 && (
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${costoChange > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                                      {costoChange > 0 ? "+" : ""}{((costoChange / (h.costo_anterior || 1)) * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Clock className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Sin historial de precios</p>
                    <p className="text-xs mt-1">Los cambios de precio se registrarán aquí</p>
                  </div>
                )}
              </div>
            </div>
            {/* END TAB: historial */}

          </div>

          {/* Sticky footer */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t bg-muted/30 shrink-0">
            <p className="text-xs text-muted-foreground hidden sm:block">
              {editingProduct ? "Los cambios se guardaran al confirmar" : "Complete los campos obligatorios"}
            </p>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingProduct ? "Guardar cambios" : "Crear articulo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      {/* Price History Dialog */}
      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
          <div className="bg-red-50 px-6 pt-6 pb-4 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <DialogHeader className="p-0 space-y-1">
              <DialogTitle className="text-lg font-bold text-red-900">Confirmar eliminación</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-red-700 mt-2">¿Estás seguro de que querés eliminar este producto?</p>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm font-semibold">{deleteTarget?.nombre}</p>
              <p className="text-xs text-muted-foreground">Código: {deleteTarget?.codigo}</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">El producto se desactivará y dejará de ser visible.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={confirmDelete}>Sí, eliminar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={phDialogOpen} onOpenChange={setPhDialogOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-50 to-purple-50">
            <DialogHeader className="p-0 space-y-0">
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-violet-600" />
                Historial de Precios
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">{phProduct?.nombre || "---"}</p>
            {phData.length > 0 && (
              <div className="flex gap-4 mt-3">
                <div className="bg-white rounded-lg px-3 py-1.5 border">
                  <p className="text-[10px] text-muted-foreground">Precio actual</p>
                  <p className="text-sm font-bold">{formatCurrency(phData[0]?.precio_nuevo || 0)}</p>
                </div>
                <div className="bg-white rounded-lg px-3 py-1.5 border">
                  <p className="text-[10px] text-muted-foreground">Costo actual</p>
                  <p className="text-sm font-bold">{formatCurrency(phData[0]?.costo_nuevo || 0)}</p>
                </div>
                <div className="bg-white rounded-lg px-3 py-1.5 border">
                  <p className="text-[10px] text-muted-foreground">Margen actual</p>
                  <p className="text-sm font-bold">{phData[0]?.costo_nuevo > 0 ? `${(((phData[0]?.precio_nuevo - phData[0]?.costo_nuevo) / phData[0]?.costo_nuevo) * 100).toFixed(1)}%` : "—"}</p>
                </div>
                <div className="bg-white rounded-lg px-3 py-1.5 border">
                  <p className="text-[10px] text-muted-foreground">Cambios</p>
                  <p className="text-sm font-bold">{phData.length}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {phLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : phData.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No hay cambios de precio registrados
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[18px] top-4 bottom-4 w-px bg-gray-200" />

                <div className="space-y-0">
                  {phData.map((h, idx) => {
                    const priceDiff = h.precio_anterior > 0 ? ((h.precio_nuevo - h.precio_anterior) / h.precio_anterior) * 100 : 0;
                    const costDiff = h.costo_anterior > 0 ? ((h.costo_nuevo - h.costo_anterior) / h.costo_anterior) * 100 : 0;
                    const isUp = priceDiff > 0;
                    const fecha = new Date(h.created_at);
                    return (
                      <div key={h.id} className="relative flex gap-4 pb-5 last:pb-0">
                        {/* Timeline dot */}
                        <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isUp ? "bg-red-100" : priceDiff < 0 ? "bg-green-100" : "bg-gray-100"}`}>
                          {isUp ? <ArrowUp className="w-4 h-4 text-red-600" /> : priceDiff < 0 ? <ArrowDown className="w-4 h-4 text-green-600" /> : <span className="w-2 h-2 rounded-full bg-gray-400" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs text-muted-foreground">
                              {fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                              {" · "}
                              {fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{h.usuario || "Admin"}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {/* Precio */}
                            <div className={`rounded-lg p-2.5 border ${isUp ? "bg-red-50 border-red-200" : priceDiff < 0 ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase">Precio</span>
                                {priceDiff !== 0 && (
                                  <span className={`text-[11px] font-bold ${isUp ? "text-red-600" : "text-green-600"}`}>
                                    {isUp ? "+" : ""}{priceDiff.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground line-through">{formatCurrency(h.precio_anterior)}</span>
                                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-sm font-bold">{formatCurrency(h.precio_nuevo)}</span>
                              </div>
                            </div>

                            {/* Costo */}
                            <div className="rounded-lg p-2.5 border bg-blue-50/50 border-blue-200/50">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase">Costo</span>
                                {costDiff !== 0 && (
                                  <span className={`text-[11px] font-bold ${costDiff > 0 ? "text-orange-600" : "text-blue-600"}`}>
                                    {costDiff > 0 ? "+" : ""}{costDiff.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground line-through">{h.costo_anterior ? formatCurrency(h.costo_anterior) : "—"}</span>
                                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-sm font-bold">{h.costo_nuevo ? formatCurrency(h.costo_nuevo) : "—"}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
            ) : (() => {
              // Group movements by orden_id to collapse combo components
              const groups: { key: string; items: typeof historyItems }[] = [];
              const seen = new Set<string>();
              for (const item of historyItems) {
                const key = item.orden_id || item.id;
                if (item.orden_id && seen.has(item.orden_id)) {
                  const g = groups.find((g) => g.key === item.orden_id);
                  if (g) g.items.push(item);
                } else {
                  if (item.orden_id) seen.add(item.orden_id);
                  groups.push({ key, items: [item] });
                }
              }
              return groups.map((group) => {
                const first = group.items[0];
                const isGrouped = group.items.length > 1;
                const tipoLower = first.tipo.toLowerCase();
                const isAnulacion = tipoLower.includes("anulacion") || tipoLower.includes("anulación");
                const isDevolucion = tipoLower.includes("devolucion") || tipoLower.includes("devolución");
                const isVenta = tipoLower.includes("venta");
                const isCompra = tipoLower.includes("compra");
                const totalDiff = group.items.reduce((s, i) => s + (i.cantidad_despues - i.cantidad_antes), 0);
                const isPositive = totalDiff >= 0;

                const badgeConfig = isAnulacion
                  ? { label: "Anulación", className: "bg-orange-100 text-orange-700 border-orange-200", icon: <RefreshCw className="w-3 h-3" /> }
                  : isDevolucion
                  ? { label: "Devolución", className: "bg-blue-100 text-blue-700 border-blue-200", icon: <RefreshCw className="w-3 h-3" /> }
                  : isCompra
                  ? { label: "Compra", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <Package className="w-3 h-3" /> }
                  : isVenta
                  ? { label: "Venta", className: "bg-red-100 text-red-700 border-red-200", icon: <ShoppingBag className="w-3 h-3" /> }
                  : { label: "Ajuste", className: "bg-gray-100 text-gray-700 border-gray-200", icon: <Settings className="w-3 h-3" /> };

                return (
                  <div key={group.key} className="border rounded-lg p-3 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs gap-1 ${badgeConfig.className}`}>
                            {badgeConfig.icon}
                            {badgeConfig.label}
                          </Badge>
                          {first.referencia && <span className="text-xs text-muted-foreground">{first.referencia}</span>}
                        </div>
                        {isGrouped ? (
                          <div className="space-y-0.5 mt-1">
                            {group.items.map((item, i) => {
                              const d = item.cantidad_despues - item.cantidad_antes;
                              // Extract component name from description
                              const compName = item.descripcion?.match(/\[(.+?)\]/)?.[1] || item.descripcion || "";
                              return (
                                <p key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                                  <span className="truncate max-w-[250px]">{compName}</span>
                                  <span className={`font-mono font-medium ${d >= 0 ? "text-emerald-600" : "text-red-500"}`}>{d >= 0 ? "+" : ""}{d}</span>
                                  <span className="text-[10px] text-gray-400">({item.cantidad_antes}→{item.cantidad_despues})</span>
                                </p>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {first.cantidad_antes} → {first.cantidad_despues}
                            {first.descripcion && <span className="ml-2">{first.descripcion}</span>}
                          </p>
                        )}
                        {first.orden_id && (isVenta || isCompra || isAnulacion || isDevolucion) && (
                          <button type="button" onClick={() => openOrdenDetail(first.orden_id!)} className="text-xs text-blue-600 hover:underline">
                            Ver orden
                          </button>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className={`text-sm font-semibold ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                          {isPositive ? "+" : ""}{totalDiff} uds
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {first.created_at ? new Date(first.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </p>
                        {first.usuario && <p className="text-[11px] text-muted-foreground">{first.usuario}</p>}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
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
                {/* Header info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Numero</p>
                    <p className="font-medium">{ordenDetail.numero}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Fecha</p>
                    <p className="font-medium">{new Date(ordenDetail.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Cliente</p>
                    <p className="font-medium">{ordenDetail.cliente?.nombre || "Consumidor Final"}</p>
                    {ordenDetail.cliente?.cuit && <p className="text-[10px] text-muted-foreground">CUIT: {ordenDetail.cliente.cuit}</p>}
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Comprobante</p>
                    <p className="font-medium">{ordenDetail.tipo_comprobante}</p>
                  </div>
                </div>

                {/* Payment detail */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Forma de pago</span>
                    <span className="font-medium">{ordenDetail.forma_pago}</span>
                  </div>
                  {ordenDetail.forma_pago === "Mixto" && (ordenDetail.monto_efectivo || 0) > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground pl-2">Efectivo</span>
                      <span>{formatCurrency(ordenDetail.monto_efectivo || 0)}</span>
                    </div>
                  )}
                  {ordenDetail.forma_pago === "Mixto" && (ordenDetail.monto_transferencia || 0) > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground pl-2">Transferencia</span>
                      <span>{formatCurrency(ordenDetail.monto_transferencia || 0)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Estado</span>
                    <Badge variant="outline" className="text-xs">{ordenDetail.estado}</Badge>
                  </div>
                  {ordenDetail.vendedor && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Vendedor</span>
                      <span className="font-medium">{ordenDetail.vendedor}</span>
                    </div>
                  )}
                </div>

                {ordenDetail.observacion && (
                  <p className="text-sm text-muted-foreground italic">{ordenDetail.observacion}</p>
                )}

                <Separator />

                {/* Items */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Items ({ordenDetail.items.length})</p>
                  <div className="space-y-1.5">
                    {ordenDetail.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{it.descripcion}</p>
                          <p className="text-xs text-muted-foreground">
                            {(it.unidades_por_presentacion ?? 1) > 0 && (it.unidades_por_presentacion ?? 1) < 1 ? it.cantidad * (it.unidades_por_presentacion ?? 1) : it.cantidad} {it.unidad_medida || "u."} x {formatCurrency(it.precio_unitario)}
                            {(it.descuento || 0) > 0 && <span className="text-red-500 ml-1">(-{it.descuento}%)</span>}
                          </p>
                        </div>
                        <p className="font-medium shrink-0 ml-3">{formatCurrency(it.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-1 text-sm">
                  {(() => {
                    const itemsSum = ordenDetail.items.reduce((s, it) => s + it.subtotal, 0);
                    const descPct = ordenDetail.descuento_porcentaje || 0;
                    const recPct = ordenDetail.recargo_porcentaje || 0;
                    return (
                      <>
                        {(descPct > 0 || recPct > 0) && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Subtotal</span>
                            <span>{formatCurrency(itemsSum)}</span>
                          </div>
                        )}
                        {descPct > 0 && (
                          <div className="flex justify-between text-red-500">
                            <span>Descuento ({descPct}%)</span>
                            <span>-{formatCurrency(itemsSum * descPct / 100)}</span>
                          </div>
                        )}
                        {recPct > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Recargo ({recPct}%)</span>
                            <span>+{formatCurrency(itemsSum * recPct / 100)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="flex justify-between items-center text-base font-semibold pt-1">
                    <span>Total</span>
                    <span>{formatCurrency(ordenDetail.total)}</span>
                  </div>
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
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{importResult.imported}</p>
                  <p className="text-xs text-emerald-600 font-medium">Nuevos</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                  <p className="text-xs text-blue-600 font-medium">Actualizados</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{importResult.skipped}</p>
                  <p className="text-xs text-amber-600 font-medium">Sin cambios</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{importResult.failed.length}</p>
                  <p className="text-xs text-red-600 font-medium">Con error</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Se procesaron <strong>{importResult.total}</strong> filas del archivo.
                {importResult.skipped > 0 && " Los productos sin cambios fueron omitidos."}
              </p>

              {/* Updated products detail */}
              {importResult.updatedDetails.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-blue-600">Productos actualizados:</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-blue-200">
                    <table className="w-full text-xs">
                      <thead className="bg-blue-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-blue-700">Producto</th>
                          <th className="text-left py-2 px-3 font-medium text-blue-700">Cambios</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.updatedDetails.map((u, i) => (
                          <tr key={i} className="border-t border-blue-100">
                            <td className="py-1.5 px-3 font-medium truncate max-w-[180px]">{u.nombre}</td>
                            <td className="py-1.5 px-3 text-blue-600">{u.changes.join(" | ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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
              norm(p.nombre).includes(norm(comboProductSearch)) ||
              norm(p.codigo).includes(norm(comboProductSearch))
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
      {/* Generic action confirmation modal */}
      <Dialog open={actionConfirm.open} onOpenChange={(v) => !v && setActionConfirm({ ...actionConfirm, open: false })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionConfirm.variant === "destructive" ? (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              ) : (
                <Check className="w-5 h-5 text-emerald-500" />
              )}
              {actionConfirm.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{actionConfirm.message}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionConfirm({ ...actionConfirm, open: false })}>Cancelar</Button>
              <Button
                variant={actionConfirm.variant === "destructive" ? "destructive" : "default"}
                onClick={() => { setActionConfirm({ ...actionConfirm, open: false }); actionConfirm.onConfirm(); }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ─── Stock Quick Adjust Dialog (1.2) ─── */}
      <Dialog open={!!stockPopover} onOpenChange={(open) => !open && setStockPopover(null)}>
        <DialogContent className="max-w-xs p-0 gap-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <DialogTitle className="text-sm font-semibold">Ajustar stock</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{stockPopover?.productName}</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {(["sumar", "restar", "ajuste"] as const).map((tipo) => (
                <button key={tipo} onClick={() => setStockAdjust((prev) => ({ ...prev, tipo }))}
                  className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${stockAdjust.tipo === tipo ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}>
                  {tipo === "sumar" ? "+ Agregar" : tipo === "restar" ? "− Quitar" : "= Fijar"}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{stockAdjust.tipo === "ajuste" ? "Stock final" : "Cantidad"}</Label>
              <Input type="number" min={stockAdjust.tipo === "restar" ? 1 : 0} max={stockAdjust.tipo === "restar" ? stockPopover?.currentStock : undefined}
                value={stockAdjust.cantidad} onChange={(e) => setStockAdjust((prev) => ({ ...prev, cantidad: Math.max(0, Number(e.target.value)) }))}
                className="h-9 text-center text-lg font-semibold" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Motivo</Label>
              <select value={stockAdjust.motivo} onChange={(e) => setStockAdjust((prev) => ({ ...prev, motivo: e.target.value as any }))}
                className="w-full h-9 text-sm border rounded-md px-2 bg-background">
                <option value="ingreso">Ingreso de mercadería</option>
                <option value="ajuste">Ajuste de inventario</option>
                <option value="merma">Merma / pérdida</option>
                <option value="venta_manual">Venta manual</option>
              </select>
            </div>
            {stockPopover && (
              <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-center text-muted-foreground">
                {stockAdjust.tipo === "ajuste"
                  ? `${stockPopover.currentStock} → ${stockAdjust.cantidad}`
                  : stockAdjust.tipo === "sumar"
                  ? `${stockPopover.currentStock} + ${stockAdjust.cantidad} = ${stockPopover.currentStock + stockAdjust.cantidad}`
                  : `${stockPopover.currentStock} − ${stockAdjust.cantidad} = ${Math.max(0, stockPopover.currentStock - stockAdjust.cantidad)}`}
              </div>
            )}
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => setStockPopover(null)}>Cancelar</Button>
            <Button className="flex-1 h-8 text-xs" onClick={handleQuickStockAdjust}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Stock Bajo Dialog ─── */}
      <Dialog open={lowStockOpen} onOpenChange={setLowStockOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Stock bajo ({lowStockProducts.length} producto{lowStockProducts.length !== 1 ? "s" : ""})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {lowStockProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 cursor-pointer" onClick={() => { setLowStockOpen(false); const prod = products.find((pr) => pr.id === p.id); if (prod) openEdit(prod); }}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{p.nombre}</p>
                  {p.codigo && <p className="text-xs text-muted-foreground font-mono">{p.codigo}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <div className="text-right">
                    <p className={`text-sm font-bold ${p.stock <= 0 ? "text-red-600" : "text-orange-600"}`}>{p.stock} un.</p>
                    <p className="text-[10px] text-muted-foreground">mín. {p.stock_minimo}</p>
                  </div>
                  <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${p.stock <= 0 ? "bg-red-500" : p.stock <= p.stock_minimo * 0.5 ? "bg-orange-500" : "bg-amber-400"}`} style={{ width: `${Math.min(100, (p.stock / p.stock_minimo) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {lowStockProducts.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No hay productos con stock bajo</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
