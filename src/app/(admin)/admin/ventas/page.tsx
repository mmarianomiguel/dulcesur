"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { todayARG, nowTimeARG, formatCurrency } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/components/admin-toast";
import { logAudit } from "@/lib/audit";
import type { Cliente, Producto, Usuario } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  X,
  Loader2,
  User,
  Trash2,
  Minus,
  DollarSign,
  ArrowLeftRight,
  Shuffle,
  BookOpen,
  Banknote,
  Delete,
  Keyboard,
  MapPin,
  Check,
  Truck,
  Store,
  Settings,
  AlertTriangle,
  UserPlus,
  FileText,
  Printer,
  Download,
  Eye,
  ScanBarcode,
  AlertCircle,
  Package,
  CalendarDays,
} from "lucide-react";

import { ReceiptPrintView, defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptSale } from "@/components/receipt-print-view";
import { useCurrentUser } from "@/hooks/use-current-user";

// ---------- types ----------
interface Presentacion {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  costo: number;
  codigo: string; // maps to DB column "sku"
}

interface ClienteDireccion {
  id: string;
  cliente_auth_id: string;
  nombre: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  codigo_postal: string;
  telefono: string;
  predeterminada: boolean;
}

interface CuentaBancaria {
  id: string;
  nombre: string;
  tipo_cuenta?: string;
  cbu_cvu?: string;
  alias?: string;
  origen?: string;
  logo_url?: string | null;
  titular?: string | null;
}

interface ComboItemRef {
  producto_id: string;
  cantidad: number;
  nombre: string;
  stock: number;
  costo: number;
}

interface LineItem {
  id: string;
  producto_id: string;
  code: string;
  description: string;
  qty: number;
  unit: string;
  price: number;
  discount: number;
  subtotal: number;
  presentacion: string;
  unidades_por_presentacion: number;
  costo_unitario: number;
  stock: number;
  es_combo?: boolean;
  comboItems?: ComboItemRef[];
}

// ---------- helpers ----------

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------- component ----------
export default function VentasPage() {
  const currentUser = useCurrentUser();
  // --- data ---
  const [products, setProducts] = useState<Producto[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [sellers, setSellers] = useState<Usuario[]>([]);
  const [comboItemsMap, setComboItemsMap] = useState<Record<string, ComboItemRef[]>>({});
  const [activeDiscounts, setActiveDiscounts] = useState<any[]>([]);
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null);

  // --- sale state ---
  const [items, setItems] = useState<LineItem[]>([]);
  const [clientId, setClientId] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [tipoComprobante, setTipoComprobante] = useState("Remito X");
  const [vendedorId, setVendedorId] = useState("");
  const [listasPrecio, setListasPrecio] = useState<{ id: string; nombre: string; porcentaje_ajuste: number }[]>([]);
  const [listaPrecioId, setListaPrecioId] = useState("");
  const [descuento, setDescuento] = useState(0);
  const [recargo, setRecargo] = useState(0);
  const [fechaVenta, setFechaVenta] = useState(todayARG());
  const [despacho, setDespacho] = useState("Retira en local");
  const [saving, setSaving] = useState(false);
  const [cobrarSaldo, setCobrarSaldo] = useState(false);

  // transferencia surcharge
  const [porcentajeTransferencia, setPorcentajeTransferencia] = useState(2);
  const [configTransfOpen, setConfigTransfOpen] = useState(false);
  const [tempPorcentaje, setTempPorcentaje] = useState(2);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [cuentaSelectorOpen, setCuentaSelectorOpen] = useState(false);
  const [vendedorSelectorOpen, setVendedorSelectorOpen] = useState(false);

  // mixto
  const [mixtoEfectivo, setMixtoEfectivo] = useState(0);
  const [mixtoTransferencia, setMixtoTransferencia] = useState(0);
  const [mixtoCuentaCorriente, setMixtoCuentaCorriente] = useState(0);
  const [mixtoDialogOpen, setMixtoDialogOpen] = useState(false);
  const [mixtoToggleEfectivo, setMixtoToggleEfectivo] = useState(true);
  const [mixtoToggleTransferencia, setMixtoToggleTransferencia] = useState(true);
  const [mixtoToggleCuentaCorriente, setMixtoToggleCuentaCorriente] = useState(false);
  const mixtoAutoFillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // modals
  const [searchOpen, setSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientHighlight, setClientHighlight] = useState(0);
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "delivery">("pickup");
  const [cobrarEnEntrega, setCobrarEnEntrega] = useState(false);
  const [clientAddresses, setClientAddresses] = useState<ClienteDireccion[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState({ direccion: "", ciudad: "", provincia: "", codigo_postal: "", telefono: "" });
  const [savingAddress, setSavingAddress] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const [successModal, setSuccessModal] = useState<{
    open: boolean;
    numero: string;
    total: number;
    subtotal: number;
    descuento: number;
    recargo: number;
    transferSurcharge: number;
    tipoComprobante: string;
    formaPago: string;
    moneda: string;
    cliente: string;
    clienteDireccion?: string | null;
    clienteTelefono?: string | null;
    clienteCondicionIva?: string | null;
    vendedor: string;
    items: LineItem[];
    fecha: string;
    saldoAnterior: number;
    saldoNuevo: number;
    cashReceived?: number;
    cashChange?: number;
    pdfUrl: string | null;
  }>({ open: false, numero: "", total: 0, subtotal: 0, descuento: 0, recargo: 0, transferSurcharge: 0, tipoComprobante: "", formaPago: "", moneda: "ARS", cliente: "", clienteDireccion: null, clienteTelefono: null, clienteCondicionIva: null, vendedor: "", items: [], fecha: "", saldoAnterior: 0, saldoNuevo: 0, pdfUrl: null });
  const [errorModal, setErrorModal] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [stockExceedDialog, setStockExceedDialog] = useState<{ open: boolean; issues: { item: LineItem; stockDisponible: number; unidadesFacturadas: number }[]; adjustSet: Set<string> }>({ open: false, issues: [], adjustSet: new Set() });
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(defaultReceiptConfig);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [lastPrintData, setLastPrintData] = useState<typeof successModal | null>(null);
  const [reprintOpen, setReprintOpen] = useState(false);
  const reprintRef = useRef<HTMLDivElement>(null);

  // out of stock confirmation
  const [stockWarning, setStockWarning] = useState<{ open: boolean; product: Producto | null; presentacion?: Presentacion }>({ open: false, product: null });
  const skipFinalStockCheckRef = useRef(false);

  // create client from POS
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({ nombre: "", email: "", telefono: "", cuit: "", direccion: "", tipo_documento: "", numero_documento: "", situacion_iva: "Consumidor final", razon_social: "", domicilio_fiscal: "", provincia: "", localidad: "", codigo_postal: "", barrio: "", observacion: "", vendedor_id: "", zona_entrega: "", limite_credito: 0, maps_url: "" });
  const [zonasEntrega, setZonasEntrega] = useState<{ id: string; nombre: string; dias?: string[] }[]>([]);
  const [creatingClient, setCreatingClient] = useState(false);

  // presentaciones
  const [presentacionesMap, setPresentacionesMap] = useState<Record<string, Presentacion[]>>({});

  // section refs for keyboard navigation
  const codigoClienteRef = useRef<HTMLInputElement>(null);
  const clientSectionRef = useRef<HTMLButtonElement>(null);
  const cartSectionRef = useRef<HTMLDivElement>(null);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const sectionRefs = [clientSectionRef, cartSectionRef, paymentSectionRef];
  const [focusedSection, setFocusedSection] = useState(0);

  // selected cart item for arrow key navigation
  const [selectedItemIdx, setSelectedItemIdx] = useState(-1);
  const cartListRef = useRef<HTMLDivElement>(null);
  const qtyBuffer = useRef("");
  const qtyBufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qtyLastKeyTime = useRef(0);

  // barcode scanner
  const barcodeBuffer = useRef("");
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanCooldown = useRef(0); // timestamp until which all digit keys are captured by scanner
  const [scanNotFound, setScanNotFound] = useState<string | null>(null);
  const scanNotFoundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanNotFoundRef = useRef((code: string) => {
    setScanNotFound(code);
    if (scanNotFoundTimer.current) clearTimeout(scanNotFoundTimer.current);
    scanNotFoundTimer.current = setTimeout(() => setScanNotFound(null), 2000);
  });
  const [scanFound, setScanFound] = useState<string | null>(null);
  const scanFoundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanFoundRef = useRef((name: string) => {
    setScanFound(name);
    if (scanFoundTimer.current) clearTimeout(scanFoundTimer.current);
    scanFoundTimer.current = setTimeout(() => setScanFound(null), 1500);
  });
  const [scannerEnabled, setScannerEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pos_scanner_enabled");
      return stored !== null ? stored === "true" : true;
    }
    return true;
  });
  const toggleScanner = () => {
    setScannerEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("pos_scanner_enabled", String(next));
      return next;
    });
  };

  // ---------- data fetch ----------
  // Light refresh: only products + presentaciones (for tab focus)
  const refreshProducts = useCallback(async () => {
    const [{ data: prods }, { data: presData1 }, { data: presData2 }] = await Promise.all([
      supabase.from("productos").select("id, codigo, nombre, precio, costo, stock, unidad_medida, categoria_id, subcategoria_id, marca_id, es_combo").eq("activo", true).order("nombre").limit(10000),
      supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, precio, costo, sku").order("id").range(0, 999),
      supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, precio, costo, sku").order("id").range(1000, 2999),
    ]);
    const presData = [...(presData1 || []), ...(presData2 || [])];
    setProducts((prods || []) as unknown as Producto[]);
    const map: Record<string, Presentacion[]> = {};
    for (const raw of presData) {
      const pr = { ...raw, codigo: raw.sku || "", costo: raw.costo || 0 } as Presentacion;
      if (!map[pr.producto_id]) map[pr.producto_id] = [];
      map[pr.producto_id].push(pr);
    }
    setPresentacionesMap(map);
  }, []);

  const fetchData = useCallback(async () => {
    // Single batch: all data in one Promise.all
    const [{ data: prods }, { data: cls }, { data: sls }, { data: listas }, { data: zonasData },
           { data: allComboItems }, { data: descuentosData }, { data: presData1 }, { data: presData2 },
           { data: empData }, { data: tcData }] = await Promise.all([
      supabase.from("productos").select("id, codigo, nombre, precio, costo, stock, unidad_medida, categoria_id, subcategoria_id, marca_id, es_combo").eq("activo", true).order("nombre").limit(10000),
      supabase.from("clientes").select("id, codigo_cliente, nombre, email, telefono, saldo, situacion_iva, tipo_factura, tipo_documento, numero_documento, cuit, razon_social, domicilio, domicilio_comercial, domicilio_fiscal, localidad, provincia, codigo_postal, barrio, vendedor_id, observacion, zona_entrega, limite_credito").eq("activo", true).order("nombre"),
      supabase.from("usuarios").select("id, nombre, email, rol, activo").eq("activo", true).eq("rol", "vendedor"),
      supabase.from("listas_precios").select("id, nombre, porcentaje_ajuste, es_default").eq("activa", true).order("nombre"),
      supabase.from("zonas_entrega").select("id, nombre, dias").order("nombre"),
      supabase.from("combo_items").select("combo_id, cantidad, productos!combo_items_producto_id_fkey(id, nombre, stock, costo)"),
      supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", todayARG()),
      supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, precio, costo, sku").order("id").range(0, 999),
      supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, precio, costo, sku").order("id").range(1000, 2999),
      supabase.from("empresa").select("nombre, domicilio, telefono, cuit, situacion_iva, receipt_config").limit(1).single(),
      supabase.from("tienda_config").select("logo_url, url_tienda").limit(1).single(),
    ]);
    const presData = [...(presData1 || []), ...(presData2 || [])];

    setProducts((prods || []) as unknown as Producto[]);
    setClients((cls || []) as unknown as Cliente[]);
    setSellers((sls || []) as unknown as Usuario[]);
    setListasPrecio((listas || []) as any[]);
    setZonasEntrega(zonasData || []);
    const defaultList = (listas || []).find((l: any) => l.es_default);
    if (defaultList) setListaPrecioId((defaultList as any).id);
    if (sls && sls.length > 0) setVendedorId(sls[0].id);

    if (allComboItems) {
      const cmap: Record<string, ComboItemRef[]> = {};
      for (const ci of allComboItems as any[]) {
        const p = ci.productos;
        if (!p) continue;
        if (!cmap[ci.combo_id]) cmap[ci.combo_id] = [];
        cmap[ci.combo_id].push({ producto_id: p.id, cantidad: ci.cantidad, nombre: p.nombre, stock: p.stock, costo: p.costo || 0 });
      }
      setComboItemsMap(cmap);
    }

    setActiveDiscounts((descuentosData || []).filter((d: any) => !d.fecha_fin || d.fecha_fin >= todayARG()));

    const map: Record<string, Presentacion[]> = {};
    for (const raw of (presData || [])) {
      const pr = { ...raw, codigo: raw.sku || "", costo: raw.costo || 0 } as Presentacion;
      if (!map[pr.producto_id]) map[pr.producto_id] = [];
      map[pr.producto_id].push(pr);
    }
    setPresentacionesMap(map);

    // Receipt config: localStorage first, then DB
    try {
      const stored = localStorage.getItem("receipt_config");
      if (stored) {
        setReceiptConfig((prev) => ({ ...prev, ...JSON.parse(stored) }));
      } else if (empData && (empData as any).receipt_config) {
        const dbCfg = { ...defaultReceiptConfig, ...(empData as any).receipt_config };
        setReceiptConfig(dbCfg);
        localStorage.setItem("receipt_config", JSON.stringify(dbCfg));
      }
    } catch (err) { console.error("Error in POS:", err); }

    if (empData) {
      setReceiptConfig((prev) => ({
        ...prev,
        empresaNombre: prev.empresaNombre || (empData as any).nombre || "",
        empresaDomicilio: prev.empresaDomicilio || (empData as any).domicilio || "",
        empresaTelefono: prev.empresaTelefono || (empData as any).telefono || "",
        empresaCuit: prev.empresaCuit || (empData as any).cuit || "",
        empresaIva: prev.empresaIva || (empData as any).situacion_iva || "",
      }));
    }
    if (tcData) {
      setReceiptConfig((prev) => ({
        ...prev,
        logoUrl: prev.logoUrl || "https://res.cloudinary.com/dss3lnovd/image/upload/v1774505786/dulcesur/logo-dulcesur-negro.jpg",
        empresaWeb: prev.empresaWeb || (tcData as any).url_tienda || "",
      }));
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Check if caja is open
    supabase.from("turnos_caja").select("id").eq("estado", "abierto").limit(1).then(({ data }) => {
      setCajaAbierta(data && data.length > 0);
    });
    // Light refresh on tab focus: only products + presentaciones
    const onFocus = () => refreshProducts();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData, refreshProducts]);

  // Load bank accounts from localStorage
  useEffect(() => {
    (async () => {
      // Load bank accounts from DB (own + provider accounts)
      const { data } = await supabase.from("cuentas_bancarias").select("id, nombre, tipo_cuenta, cbu_cvu, alias, origen, logo_url, titular").eq("activo", true).order("nombre");
      if (data && data.length > 0) {
        setCuentasBancarias(data as CuentaBancaria[]);
      } else {
        try {
          const stored = localStorage.getItem("cuentas_bancarias");
          if (stored) setCuentasBancarias(JSON.parse(stored));
        } catch {}
      }
    })();
  }, []);

  // Auto-print receipt when sale is finalized
  useEffect(() => {
    if (successModal.open && receiptRef.current) {
      const timer = setTimeout(() => {
        handlePrintReceipt();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [successModal.open]);

  // ---------- derived (memoized) ----------
  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);

  const filteredProducts = useMemo(() => {
    const term = productSearch.toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.nombre.toLowerCase().includes(term) ||
        p.codigo.toLowerCase().includes(term) ||
        (presentacionesMap[p.id] || []).some((pr) =>
          (pr.codigo || "").toLowerCase().includes(term)
        )
    );
  }, [products, productSearch, presentacionesMap]);

  const filteredClients = useMemo(() => {
    const term = clientSearch.toLowerCase();
    if (!term) return clients;
    return clients.filter(
      (c) =>
        c.nombre.toLowerCase().includes(term) ||
        (c.email || "").toLowerCase().includes(term) ||
        (c.telefono || "").includes(clientSearch) ||
        ((c as any).codigo_cliente || "").includes(clientSearch) ||
        (/^\d+$/.test(clientSearch) && (c as any).codigo_cliente && parseInt((c as any).codigo_cliente, 10) === parseInt(clientSearch, 10))
    );
  }, [clients, clientSearch]);

  const subtotal = useMemo(() => items.reduce((acc, i) => acc + i.subtotal, 0), [items]);
  const descuentoAmount = subtotal * (descuento / 100);
  const recargoAmount = subtotal * (recargo / 100);
  const baseTotal = subtotal - descuentoAmount + recargoAmount;

  // Calculate transfer surcharge
  const transferSurcharge = formaPago === "Transferencia"
    ? baseTotal * (porcentajeTransferencia / 100)
    : formaPago === "Mixto"
      ? mixtoTransferencia * (porcentajeTransferencia / 100)
      : 0;

  const total = baseTotal + transferSurcharge;

  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const saldoPendienteCliente = cobrarSaldo && selectedClient && selectedClient.saldo > 0 ? selectedClient.saldo : 0;
  const totalACobrar = total + saldoPendienteCliente;

  // Mixto base: includes saldo pendiente when cobrarSaldo is checked
  const mixtoBase = baseTotal + saldoPendienteCliente;
  const mixtoSum = Math.round((mixtoEfectivo + mixtoTransferencia + mixtoCuentaCorriente) * 100) / 100;
  // Compare against mixtoBase (sale + saldo pendiente, without surcharge)
  const mixtoRemaining = formaPago === "Mixto" ? Math.round((mixtoBase - mixtoSum) * 100) / 100 : 0;
  const mixtoValid = formaPago !== "Mixto" || (Math.abs(mixtoRemaining) < 0.01 && mixtoSum > 0);
  const cashChange = cashReceivedNum - totalACobrar;

  // ---------- presentaciones ----------
  const fetchPresentaciones = async (productoId: string) => {
    if (presentacionesMap[productoId]) return presentacionesMap[productoId];
    const { data } = await supabase.from("presentaciones").select("*").eq("producto_id", productoId);
    const pres = (data || []).map((raw: any) => ({ ...raw, codigo: raw.sku || "", costo: raw.costo || 0 })) as Presentacion[];
    setPresentacionesMap((prev) => ({ ...prev, [productoId]: pres }));
    return pres;
  };

  // ---------- discount helper ----------
  const getProductDiscount = (product: Producto, presName: string, qty?: number): number => {
    let bestDiscount = 0;
    const isCombo = !!(product as any).es_combo;
    for (const d of activeDiscounts) {
      // Skip if discount excludes combos and product is combo
      if (d.excluir_combos && isCombo) continue;
      // Skip if product is in exclusion list
      if (d.productos_excluidos_ids?.length > 0 && d.productos_excluidos_ids.includes(product.id)) continue;
      // Skip if discount is client-specific and current client doesn't match
      if (d.clientes_ids?.length > 0 && (!clientId || !d.clientes_ids.includes(clientId))) continue;
      // Check minimum quantity for volume discounts - skip if qty not met or not provided
      if (d.cantidad_minima && d.cantidad_minima > 0) {
        if (qty == null || qty < d.cantidad_minima) continue;
      }
      // Check presentation filter
      if (d.presentacion === "unidad" && presName !== "Unidad") continue;
      if (d.presentacion === "caja" && presName === "Unidad") continue;

      // Determine the effective discount percentage
      let effectivePercent = Number(d.porcentaje);
      if (d.tipo_descuento === "precio_fijo" && d.precio_fijo != null && product.precio > 0) {
        // Convert fixed price to equivalent percentage
        effectivePercent = Math.max(0, Math.min(100, ((product.precio - d.precio_fijo) / product.precio) * 100));
      }

      // Check scope
      if (d.aplica_a === "todos") {
        bestDiscount = Math.max(bestDiscount, effectivePercent);
      } else if (d.aplica_a === "categorias") {
        const catIds: string[] = d.categorias_ids || [];
        if (catIds.includes((product as any).categoria_id) || catIds.includes((product as any).subcategoria_id)) {
          bestDiscount = Math.max(bestDiscount, effectivePercent);
        }
      } else if (d.aplica_a === "subcategorias") {
        const subIds: string[] = d.subcategorias_ids || [];
        if ((product as any).subcategoria_id && subIds.includes((product as any).subcategoria_id)) {
          bestDiscount = Math.max(bestDiscount, effectivePercent);
        }
      } else if (d.aplica_a === "productos") {
        const prodIds: string[] = d.productos_ids || [];
        if (prodIds.includes(product.id)) {
          bestDiscount = Math.max(bestDiscount, effectivePercent);
        }
      } else if (d.aplica_a === "marcas") {
        const mIds: string[] = d.marcas_ids || [];
        if ((product as any).marca_id && mIds.includes((product as any).marca_id)) {
          bestDiscount = Math.max(bestDiscount, effectivePercent);
        }
      }
    }
    return bestDiscount;
  };

  // ---------- cart operations ----------
  const tryAddItem = (product: Producto, presentacion?: Presentacion) => {
    // Check stock — combos use component stock
    if ((product as any).es_combo) {
      const components = comboItemsMap[product.id] || [];
      if (components.length > 0) {
        const comboStock = Math.min(...components.map((c) => Math.floor(c.stock / c.cantidad)));
        if (comboStock <= 0) {
          setStockWarning({ open: true, product, presentacion });
          return;
        }
      }
      // If no components loaded yet, allow adding (validated at finalize)
    } else if (product.stock <= 0) {
      setStockWarning({ open: true, product, presentacion });
      return;
    }
    addItem(product, presentacion);
  };

  const addItem = (product: Producto, presentacion?: Presentacion) => {
    const presName = presentacion ? presentacion.nombre : "Unidad";
    const presPrice = presentacion ? presentacion.precio : product.precio;
    const presUnits = presentacion ? presentacion.cantidad : 1;
    const isCombo = !!(product as any).es_combo;
    const components = isCombo ? (comboItemsMap[product.id] || []) : undefined;
    const comboStock = isCombo && components && components.length > 0
      ? Math.min(...components.map((c) => Math.floor(c.stock / c.cantidad)))
      : product.stock;
    // Compute cost at sale time (frozen in venta_items)
    let costoUnit: number;
    if (isCombo && components && components.length > 0) {
      costoUnit = components.reduce((a, c) => a + c.costo * c.cantidad, 0);
    } else if (presentacion && presentacion.costo > 0) {
      costoUnit = presentacion.costo;
    } else {
      costoUnit = product.costo * presUnits;
    }

    setItems((prev) => {
      if (prev.length >= 500) {
        setErrorModal({ open: true, message: "Máximo 500 líneas por venta. Finalizá esta y creá otra." });
        return prev;
      }
      const existingIdx = prev.findIndex((i) => i.producto_id === product.id && i.presentacion === presName);
      if (existingIdx >= 0) {
        // Increment qty of existing item
        const updated = prev.map((item, idx) => {
          if (idx !== existingIdx) return item;
          const newQty = item.qty + 1;
          return { ...item, qty: newQty, subtotal: item.price * newQty * (1 - item.discount / 100) };
        });
        setSelectedItemIdx(existingIdx);
        return updated;
      }
      const autoDiscount = getProductDiscount(product, presName);
      const discountedSubtotal = presPrice * (1 - autoDiscount / 100);
      const newItems = [
        ...prev,
        {
          id: crypto.randomUUID(),
          producto_id: product.id,
          code: presentacion?.codigo || product.codigo,
          description: (() => {
            const baseName = product.nombre.replace(/\s*[-–]\s*Unidad$/i, "").replace(/\s*\(Caja\s*x[\d.]+\)\s*/gi, "").replace(/\s*\(Medio\s*Cart[oó]n\)\s*/gi, "").trim();
            if (presName === "Unidad") return baseName;
            if (baseName.toLowerCase().includes(presName.toLowerCase().replace(/[()]/g, ""))) return baseName;
            return baseName;
          })(),
          qty: 1,
          unit: product.unidad_medida,
          price: presPrice,
          discount: autoDiscount,
          subtotal: discountedSubtotal,
          presentacion: presName,
          unidades_por_presentacion: presUnits,
          costo_unitario: costoUnit,
          stock: comboStock,
          es_combo: isCombo,
          comboItems: components,
        },
      ];
      setSelectedItemIdx(newItems.length - 1);
      return newItems;
    });
    setSearchOpen(false);
    setProductSearch("");
  };

  const updateItemDiscount = (id: string, discount: number) => {
    setItems((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const d = Math.max(0, Math.min(100, discount));
      return { ...i, discount: d, subtotal: i.price * i.qty * (1 - d / 100) };
    }));
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const newItems = prev.filter((i) => i.id !== id);
      if (selectedItemIdx >= newItems.length) setSelectedItemIdx(Math.max(0, newItems.length - 1));
      return newItems;
    });
  };

  const [stockToast, setStockToast] = useState<string | null>(null);
  const stockToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateQty = (id: string, qty: number, checkSwitch = false) => {
    // Warn if qty exceeds stock (before setItems to avoid side effects in callback)
    const target = items.find((i) => i.id === id);
    if (target && qty > 0 && target.stock >= 0) {
      const unitsNeeded = target.presentacion !== "Unidad" && target.unidades_por_presentacion > 1
        ? qty * target.unidades_por_presentacion : qty;
      if (unitsNeeded > target.stock && qty > (target.qty || 0)) {
        setStockToast(`Stock insuficiente de ${target.description}: ${target.stock} disponible`);
        if (stockToastTimer.current) clearTimeout(stockToastTimer.current);
        stockToastTimer.current = setTimeout(() => setStockToast(null), 3000);
      }
    }

    setItems((prev) => {
      const target = prev.find((i) => i.id === id);

      // Never allow negative
      if (qty < 0) return prev;

      // Guard: block near-zero unless it's a valid downgrade transition
      if (qty < 0.5) {
        const isBoxDowngrade = target && target.presentacion !== "Unidad" && target.unidades_por_presentacion > 1;
        const hasMedioPres = target && target.presentacion === "Unidad" && target.producto_id &&
          (presentacionesMap[target.producto_id] || []).some((p) =>
            Number(p.cantidad) <= 0.5 || (p.nombre && p.nombre.toLowerCase().includes("medio"))
          );
        if (!isBoxDowngrade && !hasMedioPres) return prev;
      }

      return prev.map((i) => {
        if (i.id !== id) return i;

        // Downgrade: unit qty goes below 1 → check for medio cartón
        if (qty < 1 && i.presentacion === "Unidad" && i.producto_id) {
          const pres = presentacionesMap[i.producto_id] || [];
          const medioPres = pres.find((p) => Number(p.cantidad) <= 0.5 || (p.nombre && p.nombre.toLowerCase().includes("medio")));
          if (medioPres) {
            const prod = products.find((p) => p.id === i.producto_id);
            const newDiscount = prod ? getProductDiscount(prod, medioPres.nombre || "Medio Carton") : i.discount;
            const medioUnits = Number(medioPres.cantidad) || 0.5;
            const newCosto = medioPres.costo > 0 ? medioPres.costo : (prod?.costo ?? 0) * medioUnits;
            return {
              ...i,
              qty: 1,
              price: medioPres.precio,
              code: medioPres.codigo || prod?.codigo || i.code,
              description: prod ? `${prod.nombre} (${medioPres.nombre || "Medio Cartón"})` : i.description,
              presentacion: medioPres.nombre || "Medio Carton",
              unidades_por_presentacion: medioUnits,
              discount: newDiscount,
              subtotal: medioPres.precio * (1 - newDiscount / 100),
              costo_unitario: newCosto,
            };
          }
        }

        // Downgrade: box qty goes below 1 → convert to units
        if (qty < 1 && i.presentacion !== "Unidad" && i.unidades_por_presentacion > 1) {
          const pres = presentacionesMap[i.producto_id] || [];
          const unitPres = pres.find((p) => Number(p.cantidad) === 1);
          const prod = products.find((p) => p.id === i.producto_id);
          // Use unit presentation price/code if available, otherwise fall back to base product
          const unitPrice = unitPres?.precio ?? prod?.precio ?? i.price;
          const unitCode = unitPres?.codigo || prod?.codigo || i.code;
          if (unitPres || prod) {
            const newQty = i.unidades_por_presentacion - 1;
            const newDiscount = prod ? getProductDiscount(prod, "Unidad") : i.discount;
            const newCosto = unitPres?.costo && unitPres.costo > 0 ? unitPres.costo : (prod?.costo ?? 0);
            return {
              ...i,
              qty: newQty,
              price: unitPrice,
              code: unitCode,
              description: prod?.nombre || i.description.replace(/\s*\(.*\)$/, ""),
              presentacion: "Unidad",
              unidades_por_presentacion: 1,
              discount: newDiscount,
              subtotal: unitPrice * newQty * (1 - newDiscount / 100),
              costo_unitario: newCosto,
            };
          }
          // No unit presentation or product found: don't go below 1
          return i;
        }

        // Upgrade: medio cartón qty reaches 2 → convert back to unit
        if (qty === 2 && i.presentacion !== "Unidad" &&
            (i.unidades_por_presentacion < 1 || (i.presentacion && i.presentacion.toLowerCase().includes("medio")))) {
          const pres = presentacionesMap[i.producto_id] || [];
          const unitPres = pres.find((p) => Number(p.cantidad) === 1);
          const prod = products.find((p) => p.id === i.producto_id);
          const unitPrice = unitPres?.precio ?? prod?.precio ?? i.price;
          const unitCode = unitPres?.codigo || prod?.codigo || i.code;
          if (unitPres || prod) {
            const newDiscount = prod ? getProductDiscount(prod, "Unidad") : i.discount;
            const newCosto = unitPres?.costo && unitPres.costo > 0 ? unitPres.costo : (prod?.costo ?? 0);
            return {
              ...i,
              qty: 1,
              price: unitPrice,
              code: unitCode,
              description: prod?.nombre || i.description.replace(/\s*\(.*\)$/, ""),
              presentacion: "Unidad",
              unidades_por_presentacion: 1,
              discount: newDiscount,
              subtotal: unitPrice * (1 - newDiscount / 100),
              costo_unitario: newCosto,
            };
          }
        }

        // Check auto-switch: units → box (always check, not just when checkSwitch is true)
        if (i.producto_id && i.presentacion === "Unidad") {
          const pres = presentacionesMap[i.producto_id] || [];
          const match = pres.find((p) => Number(p.cantidad) === qty && p.nombre !== "Unidad" && Number(p.cantidad) > 1);
          if (match) {
            const prod = products.find((p) => p.id === i.producto_id);
            const newDiscount = prod ? getProductDiscount(prod, match.nombre) : i.discount;
            const newCosto = match.costo > 0 ? match.costo : (prod?.costo ?? 0) * Number(match.cantidad);
            return {
              ...i,
              qty: 1,
              price: match.precio,
              code: match.codigo || i.code,
              description: prod ? `${prod.nombre} (${match.nombre})` : i.description,
              presentacion: match.nombre,
              unidades_por_presentacion: Number(match.cantidad),
              discount: newDiscount,
              subtotal: match.precio * (1 - newDiscount / 100),
              costo_unitario: newCosto,
            };
          }
        }
        // Recalculate discount for volume-based discounts
        const prod = products.find((p) => p.id === i.producto_id);
        const newDiscount = prod ? getProductDiscount(prod, i.presentacion, qty) : i.discount;
        return { ...i, qty, discount: newDiscount, subtotal: i.price * qty * (1 - newDiscount / 100) };
      });
    });
  };

  // ---------- reset mixto on change ----------
  useEffect(() => {
    if (formaPago === "Mixto") {
      setMixtoEfectivo(0);
      setMixtoTransferencia(0);
      setMixtoCuentaCorriente(0);
      setMixtoToggleEfectivo(true);
      setMixtoToggleTransferencia(true);
      setMixtoToggleCuentaCorriente(false);
      setMixtoDialogOpen(true);
    }
  }, [formaPago]);

  // ---------- mixto auto-fill logic ----------
  const mixtoActiveMethods = [
    mixtoToggleEfectivo && "efectivo",
    mixtoToggleTransferencia && "transferencia",
    mixtoToggleCuentaCorriente && "corriente",
  ].filter(Boolean) as string[];

  const mixtoAutoFill = useCallback(
    (changedField: string, changedValue: number) => {
      const active = [
        mixtoToggleEfectivo && "efectivo",
        mixtoToggleTransferencia && "transferencia",
        mixtoToggleCuentaCorriente && "corriente",
      ].filter(Boolean) as string[];

      if (active.length < 2) return;

      const values: Record<string, number> = {
        efectivo: mixtoEfectivo,
        transferencia: mixtoTransferencia,
        corriente: mixtoCuentaCorriente,
      };
      values[changedField] = changedValue;

      // Recalculate total with surcharge based on current transfer value
      // Include saldo pendiente when cobrarSaldo is checked
      const saldoExtra = cobrarSaldo && selectedClient && selectedClient.saldo > 0 ? selectedClient.saldo : 0;
      const currentTransfer = values["transferencia"] || 0;
      const surcharge = currentTransfer * (porcentajeTransferencia / 100);
      const effectiveTotal = baseTotal + saldoExtra + surcharge;

      // Find the last active field that is NOT the changed field
      const others = active.filter((f) => f !== changedField);
      if (others.length === 0) return;

      if (others.length === 1) {
        const otherKey = others[0];
        const remaining = effectiveTotal - changedValue;
        if (otherKey === "efectivo") setMixtoEfectivo(Math.max(0, Math.round(remaining * 100) / 100));
        if (otherKey === "transferencia") setMixtoTransferencia(Math.max(0, Math.round(remaining * 100) / 100));
        if (otherKey === "corriente") setMixtoCuentaCorriente(Math.max(0, Math.round(remaining * 100) / 100));
      } else {
        const lastOther = others[others.length - 1];
        const sumOthers = others.slice(0, -1).reduce((s, k) => s + values[k], 0);
        const remaining = effectiveTotal - changedValue - sumOthers;
        if (lastOther === "efectivo") setMixtoEfectivo(Math.max(0, Math.round(remaining * 100) / 100));
        if (lastOther === "transferencia") setMixtoTransferencia(Math.max(0, Math.round(remaining * 100) / 100));
        if (lastOther === "corriente") setMixtoCuentaCorriente(Math.max(0, Math.round(remaining * 100) / 100));
      }
    },
    [baseTotal, porcentajeTransferencia, mixtoEfectivo, mixtoTransferencia, mixtoCuentaCorriente, mixtoToggleEfectivo, mixtoToggleTransferencia, mixtoToggleCuentaCorriente, cobrarSaldo, selectedClient]
  );

  const handleMixtoInputChange = (field: string, value: number, setter: (v: number) => void) => {
    setter(value);
    if (mixtoAutoFillTimer.current) clearTimeout(mixtoAutoFillTimer.current);
    mixtoAutoFillTimer.current = setTimeout(() => {
      mixtoAutoFill(field, value);
    }, 600);
  };

  const handleMixtoInputBlur = (field: string, value: number) => {
    if (mixtoAutoFillTimer.current) clearTimeout(mixtoAutoFillTimer.current);
    mixtoAutoFill(field, value);
  };

  const confirmMixto = () => {
    setMixtoDialogOpen(false);
  };

  // ---------- auto-scroll cart to selected item ----------
  useEffect(() => {
    if (selectedItemIdx < 0 || !cartListRef.current) return;
    const el = cartListRef.current.querySelector(`[data-cart-idx="${selectedItemIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedItemIdx]);

  // Also scroll to bottom when items are added
  useEffect(() => {
    if (items.length > 0 && cartListRef.current) {
      const last = cartListRef.current.querySelector(`[data-cart-idx="${items.length - 1}"]`);
      if (last) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [items.length]);

  // ---------- barcode scanner ----------
  // Use a ref to always access latest addItem without re-registering the listener
  const scannerAddRef = useRef<(product: Producto, presentacion?: Presentacion) => void>(addItem);
  useEffect(() => { scannerAddRef.current = addItem; });

  // Ref to apply leftover barcode digits as qty (when scanner buffer clears without Enter)
  const applyQtyFromScanRef = useRef((digits: string) => {
    const qty = parseInt(digits, 10);
    if (qty > 0 && selectedItemIdx >= 0 && selectedItemIdx < items.length) {
      updateQty(items[selectedItemIdx].id, qty);
    }
  });
  useEffect(() => {
    applyQtyFromScanRef.current = (digits: string) => {
      const qty = parseInt(digits, 10);
      if (qty > 0 && selectedItemIdx >= 0 && selectedItemIdx < items.length) {
        updateQty(items[selectedItemIdx].id, qty);
      }
    };
  });

  useEffect(() => {
    if (!scannerEnabled) return;
    let lastKeyTime = 0;

    const findAndAdd = (code: string): "found" | "not_found" => {
      for (const [prodId, presList] of Object.entries(presentacionesMap)) {
        const match = presList.find((pr) => pr.codigo === code);
        if (match) {
          const prod = products.find((p) => p.id === prodId);
          if (prod) {
            scannerAddRef.current(prod, match);
            scanFoundRef.current(`${prod.nombre} (${match.nombre})`);
            return "found";
          }
        }
      }
      const product = products.find((p) => p.codigo === code);
      if (product) {
        const presList = presentacionesMap[product.id] || [];
        const unidadPres = presList.find((pr) => pr.nombre === "Unidad") || presList.find((pr) => Number(pr.cantidad) === 1);
        scannerAddRef.current(product, unidadPres);
        scanFoundRef.current(product.nombre);
        return "found";
      }
      return "not_found";
    };

    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const dialogOpen = document.querySelector("[data-search-dialog]");
      if (dialogOpen) { barcodeBuffer.current = ""; return; }

      const inCooldown = now < scanCooldown.current;

      // During cooldown after a scan: capture ALL keys (they're the next barcode)
      if (inCooldown && e.key.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        barcodeBuffer.current += e.key;
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ""; }, 400);
        return;
      }
      if (inCooldown && e.key === "Enter" && barcodeBuffer.current.length >= 3) {
        const code = barcodeBuffer.current;
        barcodeBuffer.current = "";
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        e.preventDefault();
        e.stopPropagation();
        findAndAdd(code) === "not_found" && scanNotFoundRef.current(code);
        scanCooldown.current = now + 800;
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      // If user is focused on an input, let them type freely — scanner detection only via buffer
      // We still buffer chars to detect scanner, but DON'T preventDefault
      if (inInput && !inCooldown) {
        if (e.key === "Enter" && barcodeBuffer.current.length >= 6) {
          // Long buffer + Enter while in input = scanner typed into the input
          const code = barcodeBuffer.current;
          barcodeBuffer.current = "";
          if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
          e.preventDefault();
          e.stopPropagation();
          // Clear the scanner text from the input
          const inp = e.target as HTMLInputElement;
          if (inp.value) inp.value = "";
          findAndAdd(code) === "not_found" && scanNotFoundRef.current(code);
          scanCooldown.current = now + 800;
          inp.blur();
          return;
        }
        if (e.key.length === 1) {
          const timeSinceLast = now - lastKeyTime;
          lastKeyTime = now;
          const isFast = barcodeBuffer.current.length > 0 && timeSinceLast < 50;
          if (barcodeBuffer.current.length === 0 || isFast) {
            barcodeBuffer.current += e.key;
          } else {
            barcodeBuffer.current = "";
          }
          if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
          barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ""; }, 300);
        }
        return; // Let the event reach the input normally
      }

      // NOT in an input: capture everything for scanner
      if (e.key === "Enter" && barcodeBuffer.current.length >= 3) {
        const code = barcodeBuffer.current;
        barcodeBuffer.current = "";
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        e.preventDefault();
        e.stopPropagation();
        findAndAdd(code) === "not_found" && scanNotFoundRef.current(code);
        scanCooldown.current = now + 800;
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        const timeSinceLast = now - lastKeyTime;
        lastKeyTime = now;
        const isFast = barcodeBuffer.current.length > 0 && timeSinceLast < 100;
        if (barcodeBuffer.current.length === 0 || isFast) {
          barcodeBuffer.current += e.key;
        } else {
          barcodeBuffer.current = e.key;
        }
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => {
          const buf = barcodeBuffer.current;
          barcodeBuffer.current = "";
          // Long buffer = barcode without Enter
          if (buf.length >= 6 && /^\d+$/.test(buf)) {
            findAndAdd(buf) === "not_found" && scanNotFoundRef.current(buf);
            scanCooldown.current = Date.now() + 800;
          }
        }, 400);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => { window.removeEventListener("keydown", handler, true); if (barcodeTimer.current) clearTimeout(barcodeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, scannerEnabled, presentacionesMap]);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // Arrow keys for cart navigation (even when not in input)
      if (!inInput && items.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedItemIdx((idx) => Math.min(idx + 1, items.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedItemIdx((idx) => Math.max(idx - 1, 0));
          return;
        }
        if (e.key === "ArrowRight" && selectedItemIdx >= 0) {
          e.preventDefault();
          updateQty(items[selectedItemIdx].id, items[selectedItemIdx].qty + 1);
          return;
        }
        if (e.key === "ArrowLeft" && selectedItemIdx >= 0) {
          e.preventDefault();
          updateQty(items[selectedItemIdx].id, items[selectedItemIdx].qty - 1);
          return;
        }
        if (e.key === "Delete" && selectedItemIdx >= 0) {
          e.preventDefault();
          removeItem(items[selectedItemIdx].id);
          return;
        }
        // Type numbers to set quantity of selected item
        if (selectedItemIdx >= 0 && e.key >= "0" && e.key <= "9") {
          e.preventDefault();
          qtyBuffer.current += e.key;
          if (qtyBufferTimer.current) clearTimeout(qtyBufferTimer.current);
          qtyBufferTimer.current = setTimeout(() => {
            const qty = parseInt(qtyBuffer.current, 10);
            if (qty > 0 && selectedItemIdx >= 0 && selectedItemIdx < items.length) {
              updateQty(items[selectedItemIdx].id, qty);
            }
            qtyBuffer.current = "";
          }, 250);
          return;
        }
        // Backspace to clear quantity buffer or delete item
        if (e.key === "Backspace" && selectedItemIdx >= 0) {
          if (qtyBuffer.current.length > 0) {
            qtyBuffer.current = qtyBuffer.current.slice(0, -1);
          }
          return;
        }
      }

      // F10 or Shift+?
      if (e.key === "F10" || (e.shiftKey && e.key === "?")) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setShortcutsOpen(false);
        return;
      }
      if (e.key === "F1") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        setClientDialogOpen(true);
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        clientSectionRef.current?.focus();
        setFocusedSection(0);
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        cartSectionRef.current?.focus();
        setFocusedSection(1);
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        paymentSectionRef.current?.focus();
        setFocusedSection(2);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        const next = (focusedSection + 1) % sectionRefs.length;
        sectionRefs[next].current?.focus();
        setFocusedSection(next);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        const prev = (focusedSection - 1 + sectionRefs.length) % sectionRefs.length;
        sectionRefs[prev].current?.focus();
        setFocusedSection(prev);
        return;
      }
      if (e.key === "F12") {
        e.preventDefault();
        if (items.length > 0) initiateFinalize();
        return;
      }
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        resetSale();
        return;
      }
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.ctrlKey && e.key === "u") {
        e.preventDefault();
        setClientDialogOpen(true);
        return;
      }
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        setClientDialogOpen(true);
        return;
      }
      if (e.altKey && e.key === "f") {
        e.preventDefault();
        setTipoComprobante("Factura B");
        return;
      }
      if (e.altKey && e.key === "r") {
        e.preventDefault();
        setTipoComprobante("Remito X");
        return;
      }
      if (e.altKey && e.key === "1") {
        e.preventDefault();
        setFormaPago("Efectivo");
        return;
      }
      if (e.altKey && e.key === "2") {
        e.preventDefault();
        setFormaPago("Transferencia");
        return;
      }
      if (e.altKey && e.key === "3") {
        e.preventDefault();
        if (formaPago !== "Mixto") {
          setFormaPago("Mixto");
        } else {
          setMixtoDialogOpen(true);
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, focusedSection, selectedItemIdx]);

  // ---------- reset ----------
  const resetSale = () => {
    setItems([]);
    setClientId("");
    if (codigoClienteRef.current) codigoClienteRef.current.value = "";
    setFormaPago("Efectivo");
    setDescuento(0);
    setRecargo(0);
    setFechaVenta(todayARG());
    setMixtoEfectivo(0);
    setMixtoTransferencia(0);
    setMixtoCuentaCorriente(0);
    setMixtoToggleEfectivo(true);
    setMixtoToggleTransferencia(true);
    setMixtoToggleCuentaCorriente(false);
    setDespacho("Retira en local");
    setDeliveryMethod("pickup");
    setCobrarEnEntrega(false);
    setSelectedAddressId("");
    setClientAddresses([]);
    setSelectedItemIdx(-1);
    setCuentaBancariaId("");
    setCobrarSaldo(false);
  };

  // ---------- finalize flow ----------
  const initiateFinalize = () => {
    // Check stock for all items
    const issues: { item: LineItem; stockDisponible: number; unidadesFacturadas: number }[] = [];
    for (const item of items) {
      if (item.es_combo) {
        if (item.comboItems && item.comboItems.length > 0) {
          // For combos: check each component individually
          for (const ci of item.comboItems) {
            const compProd = products.find((p) => p.id === ci.producto_id);
            const compStock = compProd ? compProd.stock : ci.stock;
            const needed = item.qty * ci.cantidad;
            if (needed > compStock) {
              const comboStockAvail = Math.floor(compStock / ci.cantidad);
              issues.push({ item, stockDisponible: comboStockAvail, unidadesFacturadas: item.qty });
              break;
            }
          }
        }
        // If no comboItems loaded, warn but allow sale (components unknown)
        if (!item.comboItems || item.comboItems.length === 0) {
          // Try to load combo items on the fly
          const cData = comboItemsMap[item.producto_id];
          if (cData && cData.length > 0) {
            for (const ci of cData) {
              const needed = item.qty * ci.cantidad;
              if (needed > ci.stock) {
                issues.push({ item, stockDisponible: Math.floor(ci.stock / ci.cantidad), unidadesFacturadas: item.qty });
                break;
              }
            }
          }
        }
        continue;
      }
      const prod = products.find((p) => p.id === item.producto_id);
      if (!prod) continue;
      const unitsToDeduct = item.qty * (item.unidades_por_presentacion || 1);
      if (unitsToDeduct > prod.stock) {
        const stockEnPres = item.unidades_por_presentacion > 1
          ? Math.floor((prod.stock / item.unidades_por_presentacion) * 10) / 10
          : prod.stock;
        issues.push({ item, stockDisponible: stockEnPres, unidadesFacturadas: item.qty });
      }
    }
    if (issues.length > 0) {
      setStockExceedDialog({ open: true, issues, adjustSet: new Set(issues.map((i) => i.item.id)) });
      return;
    }
    if (cobrarEnEntrega) {
      // Skip cash dialog — payment will be collected by delivery person
      handleCerrarComprobante();
    } else if (formaPago === "Efectivo") {
      setCashReceived("");
      setCashDialogOpen(true);
    } else {
      handleCerrarComprobante();
    }
  };

  const handleStockAdjust = () => {
    const toAdjust = stockExceedDialog.adjustSet;
    if (toAdjust.size === 0) {
      // No selection = facturar igual
      handleStockContinue();
      return;
    }
    setItems((prev) => prev.map((item) => {
      if (!toAdjust.has(item.id)) return item;
      const prod = products.find((p) => p.id === item.producto_id);
      if (!prod) return item;
      const presUnit = item.unidades_por_presentacion || 1;
      const maxQty = Math.floor(prod.stock / presUnit);
      if (maxQty > 0) {
        // Can fit at least 1 of this presentation
        return { ...item, qty: maxQty, subtotal: item.price * maxQty * (1 - item.discount / 100) };
      }
      // Can't fit even 1 of this presentation - convert to units if box
      if (presUnit > 1 && prod.stock > 0) {
        const unitPres = presentacionesMap[item.producto_id]?.find((p) => Number(p.cantidad) === 1);
        const unitPrice = unitPres?.precio ?? (item.price / presUnit);
        const prodData = products.find((p) => p.id === item.producto_id);
        const baseName = prodData?.nombre || item.description.replace(/\s*\(.*\)$/, "");
        return {
          ...item,
          qty: prod.stock,
          price: unitPrice,
          presentacion: "Unidad",
          unidades_por_presentacion: 1,
          description: baseName,
          subtotal: unitPrice * prod.stock * (1 - item.discount / 100),
        };
      }
      // No stock at all
      return { ...item, qty: 0 };
    }).filter((item) => item.qty > 0));
    setStockExceedDialog({ open: false, issues: [], adjustSet: new Set() });

    // Reset mixto amounts since total changed — user needs to re-enter payment
    if (formaPago === "Mixto") {
      setMixtoEfectivo(0);
      setMixtoTransferencia(0);
      setMixtoCuentaCorriente(0);
      // Brief delay to let items state update, then show mixto dialog
      setTimeout(() => setMixtoDialogOpen(true), 200);
    } else if (formaPago === "Efectivo") {
      setTimeout(() => {
        setCashReceived("");
        setCashDialogOpen(true);
      }, 200);
    } else {
      // Transferencia / CC — just proceed
      setTimeout(() => handleCerrarComprobante(), 200);
    }
  };

  const handleStockContinue = () => {
    skipFinalStockCheckRef.current = true;
    setStockExceedDialog({ open: false, issues: [], adjustSet: new Set() });
    if (formaPago === "Efectivo") {
      setCashReceived("");
      setCashDialogOpen(true);
    } else {
      handleCerrarComprobante();
    }
  };

  // ---------- fetch client addresses ----------
  const fetchClientAddresses = async (cId: string) => {
    const addresses: ClienteDireccion[] = [];

    // 1. Check if there's a clientes_auth linked to this client, and get their direcciones
    const { data: authData } = await supabase
      .from("clientes_auth")
      .select("id")
      .eq("cliente_id", cId)
      .limit(1)
      .single();
    if (authData) {
      const { data } = await supabase
        .from("cliente_direcciones")
        .select("*")
        .eq("cliente_auth_id", authData.id);
      if (data) addresses.push(...(data as ClienteDireccion[]));
    }

    // 2. Use domicilio from clientes table as fallback if no addresses found
    if (addresses.length === 0) {
      const cliente = clients.find((c) => c.id === cId);
      if (cliente?.domicilio) {
        addresses.push({
          id: "domicilio-principal",
          cliente_auth_id: "",
          nombre: "Domicilio principal",
          direccion: `${cliente.domicilio}${cliente.localidad ? `, ${cliente.localidad}` : ""}${cliente.provincia ? `, ${cliente.provincia}` : ""}`,
          ciudad: cliente.localidad || "",
          provincia: cliente.provincia || "",
          codigo_postal: cliente.codigo_postal || "",
          telefono: cliente.telefono || "",
          predeterminada: true,
        });
      }
    }

    setClientAddresses(addresses);
    const def = addresses.find((a) => a.predeterminada);
    if (def) setSelectedAddressId(def.id);
  };

  // ---------- create client ----------
  const handleCreateClient = async () => {
    if (!newClientData.nombre.trim() || creatingClient) return;
    setCreatingClient(true);
    try {
      const { data } = await supabase
        .from("clientes")
        .insert({
          codigo_cliente: (newClientData as any).codigo_cliente || null,
          nombre: newClientData.nombre.trim(),
          email: newClientData.email.trim() || null,
          telefono: newClientData.telefono.trim() || null,
          cuit: newClientData.cuit.trim() || null,
          domicilio: newClientData.direccion.trim() || null,
          tipo_documento: newClientData.tipo_documento || null,
          numero_documento: newClientData.numero_documento || null,
          situacion_iva: newClientData.situacion_iva,
          razon_social: newClientData.razon_social || null,
          domicilio_fiscal: newClientData.domicilio_fiscal || null,
          provincia: newClientData.provincia || null,
          localidad: newClientData.localidad || null,
          codigo_postal: newClientData.codigo_postal || null,
          barrio: newClientData.barrio || null,
          observacion: newClientData.observacion || null,
          vendedor_id: newClientData.vendedor_id || null,
          zona_entrega: newClientData.zona_entrega || null,
          limite_credito: newClientData.limite_credito || 0,
          maps_url: newClientData.maps_url || null,
          activo: true,
          saldo: 0,
        })
        .select()
        .single();
      if (data) {
        setClients((prev) => [...prev, data as Cliente]);
        setClientId(data.id);
        setCreateClientOpen(false);
        setClientDialogOpen(false);

        // Auto-create tienda online access if email + DNI
        if (newClientData.email && newClientData.numero_documento) {
          try {
            const res = await fetch("/api/auth/tienda", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "create-from-admin",
                nombre: newClientData.nombre.trim(),
                email: newClientData.email.trim(),
                password: newClientData.numero_documento,
                cliente_id: data.id,
                telefono: newClientData.telefono.trim() || "",
              }),
            });
            if (res.ok) {
              scanFoundRef.current("Acceso a tienda creado (contraseña: DNI)");
            }
          } catch { /* silently ignore */ }
        }

        setNewClientData({ nombre: "", email: "", telefono: "", cuit: "", direccion: "", tipo_documento: "", numero_documento: "", situacion_iva: "Consumidor final", razon_social: "", domicilio_fiscal: "", provincia: "", localidad: "", codigo_postal: "", barrio: "", observacion: "", vendedor_id: sellers[0]?.id || "", zona_entrega: "", limite_credito: 0, maps_url: "" });
      }
    } finally {
      setCreatingClient(false);
    }
  };

  // ---------- sale finalization (all business logic preserved) ----------
  const handleCerrarComprobante = async () => {
    if (saving) return; // Guard against double-click
    if (items.length === 0) return;
    if (total <= 0) {
      setErrorModal({ open: true, message: "El total debe ser mayor a $0. Revisá descuentos y recargos." });
      return;
    }
    if ((formaPago === "Cuenta Corriente" && !clientId) || (formaPago === "Mixto" && mixtoCuentaCorriente > 0 && !clientId)) {
      setErrorModal({ open: true, message: "Debes seleccionar un cliente para usar Cuenta Corriente." });
      return;
    }
    if (formaPago === "Pendiente" && !clientId) {
      setErrorModal({ open: true, message: "Debes seleccionar un cliente para envíos pendientes de cobro." });
      return;
    }
    if (!mixtoValid) {
      setErrorModal({ open: true, message: "Los montos del pago mixto no suman el total." });
      return;
    }
    // Bank account validation for Transferencia payments
    if (cuentasBancarias.length > 0 && !cuentaBancariaId) {
      if (formaPago === "Transferencia") {
        setErrorModal({ open: true, message: "Seleccioná una cuenta bancaria para la transferencia." });
        return;
      }
      if (formaPago === "Mixto" && mixtoTransferencia > 0) {
        setErrorModal({ open: true, message: "Seleccioná una cuenta bancaria para la parte de transferencia." });
        return;
      }
    }
    // Credit limit check - always refresh from DB to avoid stale state
    if (selectedClient) {
      const ccAmount = formaPago === "Cuenta Corriente" ? total : formaPago === "Mixto" ? mixtoCuentaCorriente : 0;
      if (ccAmount > 0) {
        const { data: freshClient } = await supabase.from("clientes").select("saldo, limite_credito").eq("id", selectedClient.id).single();
        const limit = freshClient?.limite_credito ?? (selectedClient as any).limite_credito ?? 0;
        if (limit > 0) {
          const currentSaldo = freshClient?.saldo ?? selectedClient.saldo ?? 0;
          const newDebt = currentSaldo + ccAmount;
          if (newDebt > limit) {
            setConfirmDialog({
              open: true,
              title: "Límite de crédito",
              message: `El cliente superará su límite de crédito (${formatCurrency(limit)}). Deuda resultante: ${formatCurrency(newDebt)}. ¿Continuar?`,
              onConfirm: () => executeComprobante(),
            });
            return;
          }
        }
      }
    }
    executeComprobante();
  };

  const executeComprobante = async () => {
    setSaving(true);
    setCashDialogOpen(false);

    // Check turno (caja) is open before creating non-pending sales
    if (formaPago !== "Pendiente") {
      const { data: turnoData } = await supabase.from("turnos_caja").select("id").eq("estado", "abierto").limit(1);
      if (!turnoData || turnoData.length === 0) {
        setErrorModal({ open: true, message: "Debe abrir un turno de caja antes de registrar ventas" });
        setSaving(false);
        return;
      }
    }

    // Capture real client saldo from DB BEFORE any modification (for receipt)
    let saldoRealAntesDeTodo = 0;
    if (clientId) {
      const { data: preData } = await supabase.from("clientes").select("saldo").eq("id", clientId).single();
      saldoRealAntesDeTodo = preData?.saldo ?? selectedClient?.saldo ?? 0;
    }

    try {
      const { data: numData, error: numError } = await supabase.rpc("next_numero", { p_tipo: "venta" });
      if (numError) { setErrorModal({ open: true, message: `Error al generar número: ${numError.message}` }); setSaving(false); return; }
      const numero = numData || "00001-00000000";

      const ventaPayload = {
        numero,
        tipo_comprobante: tipoComprobante,
        fecha: fechaVenta,
        cliente_id: clientId || null,
        vendedor_id: vendedorId || null,
        forma_pago: formaPago,
        subtotal,
        descuento_porcentaje: descuento,
        recargo_porcentaje: recargo,
        total,
        estado: formaPago === "Pendiente" || cobrarEnEntrega ? "pendiente" : "cerrada",
        entregado: formaPago === "Pendiente" || cobrarEnEntrega ? false : undefined,
        observacion: despacho,
        metodo_entrega: formaPago === "Pendiente" ? "envio" : (deliveryMethod === "delivery" ? "envio" : "retiro"),
        lista_precio_id: listaPrecioId || null,
        // monto_pagado: track how much was paid at POS (for pending invoice tracking)
        // cobrarEnEntrega: 0 — cobro confirmed later from venta detail
        monto_pagado: cobrarEnEntrega
          ? 0
          : formaPago === "Efectivo" || formaPago === "Transferencia"
            ? total  // fully paid at POS
            : formaPago === "Mixto"
              ? Math.min(total, Math.round((mixtoEfectivo + mixtoTransferencia) * 100) / 100)  // non-CC portion paid at POS, capped at venta total
              : 0,  // CC or Pendiente — nothing paid yet
        ...((formaPago === "Transferencia" || formaPago === "Mixto") && cuentaBancariaId ? {
          cuenta_transferencia_id: cuentaBancariaId,
          cuenta_transferencia_alias: cuentasBancarias.find((c) => c.id === cuentaBancariaId)?.alias || cuentasBancarias.find((c) => c.id === cuentaBancariaId)?.nombre || null,
        } : {}),
      };
      let { data: venta, error: ventaError } = await supabase.from("ventas").insert(ventaPayload).select().single();

      if (ventaError) {
        // Retry with new number if duplicate key
        if (ventaError.message?.includes("duplicate key") || ventaError.message?.includes("ventas_numero_unique")) {
          const { data: retryNum } = await supabase.rpc("next_numero", { p_tipo: "venta" });
          if (retryNum) {
            const { data: retryVenta, error: retryErr } = await supabase.from("ventas").insert({ ...ventaPayload, numero: retryNum }).select().single();
            if (!retryErr && retryVenta) { venta = retryVenta; } else { setErrorModal({ open: true, message: `Error al crear venta: ${retryErr?.message || ventaError.message}` }); setSaving(false); return; }
          }
        } else {
          setErrorModal({ open: true, message: `Error al crear venta: ${ventaError.message}` }); setSaving(false); return;
        }
      }
      if (venta) {
        const ventaItems = items.map((i) => ({
          venta_id: venta.id,
          producto_id: i.producto_id,
          codigo: i.code,
          descripcion: i.description,
          cantidad: i.qty,
          unidad_medida: i.unit,
          precio_unitario: i.price,
          descuento: i.discount,
          subtotal: i.subtotal,
          presentacion: i.presentacion || "Unidad",
          unidades_por_presentacion: i.unidades_por_presentacion || 1,
          costo_unitario: i.costo_unitario || 0,
        }));
        const { error: itemsError } = await supabase.from("venta_items").insert(ventaItems);
        if (itemsError) { setErrorModal({ open: true, message: `Error al guardar items: ${itemsError.message}` }); setSaving(false); return; }

        // Update stock atomically (prevents race conditions with concurrent sales)
        const stockItems: { producto_id: string; cantidad: number; descripcion: string }[] = [];
        for (const item of items) {
          if (item.es_combo && item.comboItems && item.comboItems.length > 0) {
            for (const ci of item.comboItems) {
              stockItems.push({
                producto_id: ci.producto_id,
                cantidad: item.qty * ci.cantidad,
                descripcion: `Venta combo ${item.description} - ${ci.nombre}`,
              });
            }
          } else {
            stockItems.push({
              producto_id: item.producto_id,
              cantidad: item.qty * (item.unidades_por_presentacion || 1),
              descripcion: `Venta - ${item.description}`,
            });
          }
        }

        // Fresh stock check right before deduction (prevents overselling between UI check and here)
        // Skip if user already confirmed "Facturar igual" in the stock exceed dialog
        if (!skipFinalStockCheckRef.current) {
          const prodIds = [...new Set(stockItems.map((si) => si.producto_id))];
          if (prodIds.length > 0) {
            const { data: freshProds } = await supabase.from("productos").select("id, stock").in("id", prodIds);
            const freshMap: Record<string, number> = {};
            for (const fp of freshProds || []) freshMap[fp.id] = fp.stock;
            const stockIssues: string[] = [];
            for (const si of stockItems) {
              const available = freshMap[si.producto_id] ?? 0;
              if (si.cantidad > available) stockIssues.push(`${si.descripcion}: necesita ${si.cantidad}, hay ${available}`);
            }
            if (stockIssues.length > 0) {
              setErrorModal({ open: true, message: `Stock insuficiente:\n${stockIssues.join("\n")}` });
              // Delete the venta and items that were already inserted
              await supabase.from("venta_items").delete().eq("venta_id", venta.id);
              await supabase.from("ventas").delete().eq("id", venta.id);
              setSaving(false);
              return;
            }
          }
        }
        skipFinalStockCheckRef.current = false;

        // Atomic stock decrement via RPC (handles race conditions + logging)
        const { data: stockResult, error: stockRpcError } = await supabase.rpc("decrementar_stock_venta", {
          p_items: stockItems,
          p_referencia: `Venta #${numero}`,
          p_usuario: currentUser?.nombre || "Admin Sistema",
          p_orden_id: venta.id,
        });

        if (stockRpcError) {
          // Fallback: RPC may not exist yet — decrement stock via atomic_update_stock
          const stockErrors: string[] = [];
          for (const item of stockItems) {
            const { data: stockResult, error: stockErr } = await supabase.rpc("atomic_update_stock", {
              p_producto_id: item.producto_id,
              p_change: -item.cantidad,
            });
            if (stockErr) {
              stockErrors.push(`${item.descripcion}`);
            } else {
              await supabase.from("stock_movimientos").insert({
                producto_id: item.producto_id, tipo: "Venta", cantidad: -item.cantidad,
                cantidad_antes: stockResult?.stock_antes ?? 0, cantidad_despues: stockResult?.stock_despues ?? 0,
                referencia: `Venta #${numero}`, descripcion: item.descripcion,
                usuario: currentUser?.nombre || "Admin Sistema", orden_id: venta.id,
              });
            }
          }
          if (stockErrors.length > 0) {
            console.error("Stock decrement errors:", stockErrors);
            showAdminToast(`Error al actualizar stock de ${stockErrors.length} producto(s)`, "error");
          }
        }

        const hoy = fechaVenta;
        const hora = nowTimeARG();

        // Pendiente de cobro: skip all payment processing
        if (formaPago === "Pendiente") {
          // No caja, no CC — payment happens at delivery
        } else if (formaPago === "Cuenta Corriente") {
          if (clientId) {
            // Atomic saldo update via RPC (positive = increase debt)
            const { data: newSaldo } = await supabase.rpc("atomic_update_client_saldo", {
              p_client_id: clientId,
              p_change: total,
            });
            const saldoActual = (newSaldo ?? 0) - total; // reconstruct pre-update saldo
            const saldoAFavorAplicado = saldoActual < 0 ? Math.min(Math.abs(saldoActual), total) : 0;
            await supabase.from("cuenta_corriente").insert({
              cliente_id: clientId,
              fecha: hoy,
              comprobante: `Venta #${numero}`,
              descripcion: saldoAFavorAplicado > 0
                ? `Venta - Cta Cte (saldo a favor aplicado: ${formatCurrency(saldoAFavorAplicado)})`
                : `Venta - Cuenta Corriente`,
              debe: total,
              haber: saldoAFavorAplicado,
              saldo: newSaldo,
              forma_pago: "Cuenta Corriente",
              venta_id: venta.id,
            });
          }
        } else if (formaPago === "Mixto") {
          const mixtoEntries: { metodo: string; monto: number }[] = [];
          if (mixtoEfectivo > 0) mixtoEntries.push({ metodo: "Efectivo", monto: mixtoEfectivo });
          if (mixtoTransferencia > 0) {
            // Include transfer surcharge in the caja entry (it's what the client actually transfers)
            mixtoEntries.push({ metodo: "Transferencia", monto: mixtoTransferencia + transferSurcharge });
          }
          if (mixtoCuentaCorriente > 0) mixtoEntries.push({ metodo: "Cuenta Corriente", monto: mixtoCuentaCorriente });

          // Handle CC entry separately with atomic saldo update
          const ccEntry = mixtoEntries.find((e) => e.metodo === "Cuenta Corriente");
          const cobrarSaldoInMixto = cobrarSaldo && clientId && saldoRealAntesDeTodo > 0;

          if (cobrarSaldoInMixto && clientId) {
            // ─── Combined flow: cobro saldo FIRST, then sale ───
            // Order matters for the libro diario: old debt cobro appears before new sale.
            const oldDebtCollected = saldoRealAntesDeTodo; // pay off ALL old debt first
            const totalPaid = mixtoEfectivo + mixtoTransferencia;
            const paidForSale = totalPaid - oldDebtCollected; // what's left for this sale
            const saleCCPortion = Math.max(0, Math.round((baseTotal - paidForSale) * 100) / 100); // unpaid portion of new sale

            // 1. COBRO SALDO VIEJO — FIFO per-venta CC haber entries
            if (oldDebtCollected > 0) {
              const { data: pendingVentasMixto } = await supabase
                .from("ventas")
                .select("id, numero, total, monto_pagado")
                .eq("cliente_id", clientId)
                .in("forma_pago", ["Cuenta Corriente", "Mixto", "Pendiente"])
                .neq("estado", "anulada")
                .neq("id", venta.id)
                .order("fecha", { ascending: true })
                .order("created_at", { ascending: true });

              // Reduce client saldo by old debt amount
              const { data: saldoAfterCobro } = await supabase.rpc("atomic_update_client_saldo", {
                p_client_id: clientId,
                p_change: -oldDebtCollected,
              });
              let runningSaldo = (saldoAfterCobro ?? 0) + oldDebtCollected; // reconstruct pre-cobro

              let remMixto = oldDebtCollected;
              for (const pv of pendingVentasMixto || []) {
                if (remMixto <= 0) break;
                const pvPend = pv.total - (pv.monto_pagado || 0);
                if (pvPend <= 0) continue;
                const apl = Math.min(remMixto, pvPend);
                remMixto = Math.round((remMixto - apl) * 100) / 100;
                runningSaldo -= apl;
                // CC haber entry linked to old venta
                await supabase.from("cuenta_corriente").insert({
                  cliente_id: clientId, fecha: hoy,
                  comprobante: `Cobro saldo #${pv.numero}`,
                  descripcion: `Cobro deuda anterior`,
                  debe: 0, haber: apl, saldo: Math.max(0, runningSaldo),
                  forma_pago: "Efectivo", venta_id: pv.id,
                });
                await supabase.from("ventas").update({ monto_pagado: (pv.monto_pagado || 0) + apl }).eq("id", pv.id);
              }
            }

            // 2. NEW SALE CC PORTION — if the sale wasn't fully covered
            if (saleCCPortion > 0) {
              const { data: saldoAfterCC } = await supabase.rpc("atomic_update_client_saldo", {
                p_client_id: clientId,
                p_change: saleCCPortion,
              });
              await supabase.from("cuenta_corriente").insert({
                cliente_id: clientId, fecha: hoy,
                comprobante: `Venta #${numero}`,
                descripcion: `Saldo pendiente de venta`,
                debe: saleCCPortion, haber: 0, saldo: saldoAfterCC,
                forma_pago: "Cuenta Corriente", venta_id: venta.id,
              });
              setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, saldo: saldoAfterCC } : c));
            } else {
              // Re-read saldo for local state
              const { data: postCli } = await supabase.from("clientes").select("saldo").eq("id", clientId).single();
              setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, saldo: postCli?.saldo ?? 0 } : c));
            }
          } else if (ccEntry && clientId) {
            // ─── Standard flow: no cobrar saldo, just CC portion of the sale ───
            // Atomic saldo update via RPC (positive = increase debt)
            const { data: newSaldoMixto } = await supabase.rpc("atomic_update_client_saldo", {
              p_client_id: clientId,
              p_change: ccEntry.monto,
            });
            const saldoActualMixto = (newSaldoMixto ?? 0) - ccEntry.monto; // reconstruct pre-update saldo
            const favorAplicadoMixto = saldoActualMixto < 0 ? Math.min(Math.abs(saldoActualMixto), ccEntry.monto) : 0;
            await supabase.from("cuenta_corriente").insert({
              cliente_id: clientId,
              fecha: hoy,
              comprobante: `Venta #${numero}`,
              descripcion: favorAplicadoMixto > 0
                ? `Venta - Cta Cte parcial (saldo a favor aplicado: ${formatCurrency(favorAplicadoMixto)})`
                : `Venta - Cuenta Corriente (parcial)`,
              debe: ccEntry.monto,
              haber: favorAplicadoMixto,
              saldo: newSaldoMixto,
              forma_pago: "Cuenta Corriente",
              venta_id: venta.id,
            });
          }
          // Handle non-CC entries (Efectivo, Transferencia) → caja
          // Skip caja for envío when cobrarEnEntrega — cobro confirmed from venta detail
          if (!cobrarEnEntrega) {
            // When cobrarSaldo is active, split caja entries: venta portion vs saldo cobro portion
            const totalNonCC = mixtoEntries.filter(e => e.metodo !== "Cuenta Corriente").reduce((s, e) => s + e.monto, 0);
            const ventaPortion = cobrarSaldoInMixto ? Math.min(totalNonCC, baseTotal) : totalNonCC;
            const saldoPortion = cobrarSaldoInMixto ? Math.max(0, totalNonCC - baseTotal) : 0;
            let portionRemaining = ventaPortion;

            for (const entry of mixtoEntries) {
              if (entry.metodo === "Cuenta Corriente") continue;
              const mixCuenta = entry.metodo === "Transferencia" && cuentaBancariaId
                ? cuentasBancarias.find((c) => c.id === cuentaBancariaId)
                : null;
              // Cap this entry to the venta portion
              const ventaAmt = Math.min(entry.monto, portionRemaining);
              const saldoAmt = entry.monto - ventaAmt;
              portionRemaining -= ventaAmt;

              if (ventaAmt > 0) {
                await supabase.from("caja_movimientos").insert({
                  fecha: hoy, hora, tipo: "ingreso",
                  descripcion: `Venta #${numero} (${entry.metodo})${mixCuenta ? ` → ${mixCuenta.nombre}` : ""}`,
                  metodo_pago: entry.metodo, monto: ventaAmt,
                  referencia_id: venta.id, referencia_tipo: "venta",
                  ...(mixCuenta ? { cuenta_bancaria: mixCuenta.nombre } : {}),
                });
              }
              if (saldoAmt > 0) {
                await supabase.from("caja_movimientos").insert({
                  fecha: hoy, hora, tipo: "ingreso",
                  descripcion: `Cobro saldo anterior — ${selectedClient?.nombre || ""} (Venta #${numero})`,
                  metodo_pago: entry.metodo, monto: saldoAmt,
                  referencia_tipo: "cobro_saldo",
                  ...(mixCuenta ? { cuenta_bancaria: mixCuenta.nombre } : {}),
                });
              }
            }
          }
        } else if (!cobrarEnEntrega) {
          // Single payment — skip caja when cobrarEnEntrega
          const selectedCuenta = formaPago === "Transferencia" && cuentaBancariaId
            ? cuentasBancarias.find((c) => c.id === cuentaBancariaId)
            : null;
          await supabase.from("caja_movimientos").insert({
            fecha: hoy,
            hora,
            tipo: "ingreso",
            descripcion: `Venta #${numero}${selectedCuenta ? ` → ${selectedCuenta.nombre}` : ""}`,
            metodo_pago: formaPago,
            monto: total,
            referencia_id: venta.id,
            referencia_tipo: "venta",
            ...(selectedCuenta ? { cuenta_bancaria: selectedCuenta.nombre } : {}),
          });
        }

        // Collect pending balance if toggled
        // For Mixto: already handled above in the combined flow — skip here
        // Collect ONLY the pre-existing debt (not what was just added by this sale's CC)
        if (formaPago !== "Pendiente" && formaPago !== "Mixto" && !cobrarEnEntrega && cobrarSaldo && clientId && selectedClient && saldoRealAntesDeTodo > 0) {
          const saldoActualDB = saldoRealAntesDeTodo;
          if (saldoActualDB > 0) {
            const saldoPendiente = saldoActualDB;
            // Note: Mixto cobro saldo is already handled above in the combined flow (formaPago === "Mixto" is excluded by the outer condition)
            await supabase.from("caja_movimientos").insert({
              fecha: hoy,
              hora,
              tipo: "ingreso",
              descripcion: `Cobro saldo pendiente - ${selectedClient.nombre} (Venta #${numero})`,
              metodo_pago: formaPago,
              monto: saldoPendiente,
              referencia_id: null,
              referencia_tipo: "cobro_saldo",
            });
            // Atomic saldo update via RPC (negative = reduce debt from cobro)
            const { data: newSaldoAfterCobro } = await supabase.rpc("atomic_update_client_saldo", {
              p_client_id: clientId,
              p_change: -saldoPendiente,
            });
            await supabase.from("cuenta_corriente").insert({
              cliente_id: clientId,
              fecha: hoy,
              comprobante: `Cobro saldo - Venta #${numero}`,
              descripcion: `Cobro saldo anterior (${formaPago})`,
              debe: 0,
              haber: saldoPendiente,
              saldo: newSaldoAfterCobro,
              forma_pago: formaPago,
              venta_id: venta.id,
            });
            // FIFO update monto_pagado on CC/Mixto ventas so they reflect as paid
            const { data: pendingVentas } = await supabase
              .from("ventas")
              .select("id, total, monto_pagado")
              .eq("cliente_id", clientId)
              .in("forma_pago", ["Cuenta Corriente", "Mixto", "Pendiente"])
              .neq("estado", "anulada")
              .order("fecha", { ascending: true })
              .order("created_at", { ascending: true });
            let remainingCobro = saldoPendiente;
            for (const pv of pendingVentas || []) {
              if (remainingCobro <= 0) break;
              const pvPendiente = pv.total - (pv.monto_pagado || 0);
              if (pvPendiente <= 0) continue;
              const aplicar = Math.min(remainingCobro, pvPendiente);
              remainingCobro = Math.round((remainingCobro - aplicar) * 100) / 100;
              await supabase.from("ventas").update({ monto_pagado: (pv.monto_pagado || 0) + aplicar }).eq("id", pv.id);
            }
            if (clientId) setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, saldo: newSaldoAfterCobro } : c));
          }
        }

        // Calculate CC amounts for receipt
        const ccEnEstaVenta = formaPago === "Cuenta Corriente" ? total
          : formaPago === "Mixto" && mixtoCuentaCorriente > 0 ? mixtoCuentaCorriente
          : 0;
        const saldoAnterior = saldoRealAntesDeTodo;
        const totalAdeudado = saldoAnterior + ccEnEstaVenta;
        // cobrarSaldo only collects the PRE-EXISTING debt, not what was just added
        const montoCobroSaldo = cobrarSaldo && clientId && saldoRealAntesDeTodo > 0
          ? saldoRealAntesDeTodo
          : 0;
        // Re-read final saldo from DB
        let saldoFinal = saldoRealAntesDeTodo;
        if (clientId) {
          const { data: postData } = await supabase.from("clientes").select("saldo").eq("id", clientId).single();
          saldoFinal = postData?.saldo ?? saldoFinal;
        }
        const saldoNuevo = saldoFinal;
        const saleData = {
          numero,
          total,
          subtotal,
          descuento: descuentoAmount,
          recargo: recargoAmount,
          transferSurcharge,
          tipoComprobante,
          formaPago,
          moneda: "ARS",
          cliente: selectedClient?.nombre || "Consumidor Final",
          clienteDireccion: selectedClient?.domicilio || null,
          clienteTelefono: selectedClient?.telefono || null,
          clienteCondicionIva: selectedClient?.situacion_iva || null,
          metodoEntrega: deliveryMethod === "delivery" ? "envio" : "retiro",
          vendedor: sellers.find((s) => s.id === vendedorId)?.nombre || "",
          items: [...items],
          fecha: (() => { const [y, m, d] = fechaVenta.split("-"); return `${d}/${m}/${y}`; })(),
          saldoAnterior,
          saldoNuevo,
          cobroSaldoMonto: montoCobroSaldo > 0 ? montoCobroSaldo : undefined,
          cashReceived: formaPago === "Efectivo" ? cashReceivedNum : undefined,
          cashChange: formaPago === "Efectivo" ? (cashReceivedNum - totalACobrar) : undefined,
          pagoEfectivo: formaPago === "Mixto" ? mixtoEfectivo : formaPago === "Efectivo" ? total : undefined,
          pagoTransferencia: formaPago === "Mixto" ? (mixtoTransferencia + transferSurcharge) : formaPago === "Transferencia" ? total : undefined,
          pagoCuentaCorriente: formaPago === "Mixto" ? mixtoCuentaCorriente : formaPago === "Cuenta Corriente" ? total : undefined,
        };

        logAudit({
          userName: currentUser?.nombre || "Admin Sistema",
          action: "CREATE",
          module: "ventas",
          entityId: venta.id,
          after: { numero, total, forma_pago: formaPago, items: items.length },
        });

        resetSale();
        fetchData();
        const modalData = { open: true, ...saleData, pdfUrl: null };
        setSuccessModal(modalData);
        setLastPrintData(modalData);
      }
    } catch (err: any) {
      setErrorModal({ open: true, message: `Error inesperado: ${err?.message || String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  // ---------- PDF receipt generation ----------
  const handlePrintReceipt = () => {
    if (!receiptRef.current) return;
    const html = receiptRef.current.innerHTML;
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Comprobante ${successModal.numero}</title><style>@media print{@page{size:A4;margin:0}body{margin:0}}</style></head><body>${html}</body></html>`);
    win.document.close();
    win.onload = () => { win.print(); win.close(); };
  };

  const handleDownloadReceipt = () => {
    if (!receiptRef.current) return;
    const html = receiptRef.current.innerHTML;
    const blob = new Blob([`<!DOCTYPE html><html><head><title>Comprobante ${successModal.numero}</title><style>@page{size:A4;margin:0}body{margin:0}</style></head><body>${html}</body></html>`], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `comprobante-${successModal.numero}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---------- cash numpad ----------
  const cashAppend = (digit: string) => {
    setCashReceived((prev) => prev + digit);
  };
  const cashBackspace = () => {
    setCashReceived((prev) => prev.slice(0, -1));
  };
  const cashAddBill = (amount: number) => {
    setCashReceived((prev) => String((parseFloat(prev) || 0) + amount));
  };

  // ---------- cash dialog keyboard support ----------
  useEffect(() => {
    if (!cashDialogOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); cashAppend(e.key); }
      else if (e.key === "." || e.key === ",") { e.preventDefault(); cashAppend("."); }
      else if (e.key === "Backspace") { e.preventDefault(); cashBackspace(); }
      else if (e.key === "Delete") { e.preventDefault(); setCashReceived(""); }
      else if (e.key === "Enter") { e.preventDefault(); const btn = document.querySelector("[data-cash-cobrar]") as HTMLButtonElement; if (btn && !btn.disabled) btn.click(); }
      else if (e.key === "Escape") { setCashDialogOpen(false); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [cashDialogOpen]);

  // ---------- client selector keyboard nav ----------
  const handleClientKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setClientHighlight((h) => Math.min(h + 1, filteredClients.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setClientHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredClients[clientHighlight]) {
        setClientId(filteredClients[clientHighlight].id);
        setClientDialogOpen(false);
        setClientSearch("");
        if (codigoClienteRef.current) codigoClienteRef.current.value = (filteredClients[clientHighlight] as any).codigo_cliente || "";
      }
    }
  };

  // ---------- RENDER ----------
  return (
    <div className="h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* Caja warning */}
      {cajaAbierta === false && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            La caja no está abierta. Las ventas no se registrarán en la caja diaria.
          </span>
          <a href="/admin/caja" className="font-semibold underline hover:text-amber-900">Abrir caja</a>
        </div>
      )}
      {/* Main two-column layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:gap-3 p-2 lg:p-3 overflow-hidden">
        {/* LEFT COLUMN */}
        <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0 overflow-hidden">
          {/* Top bar: Client + Delivery + Date */}
          <div className="rounded-xl border bg-card overflow-hidden">
            {/* Row 1: Code + Client */}
            <div className="flex items-center border-b">
              <input
                ref={codigoClienteRef}
                type="text"
                inputMode="numeric"
                placeholder="#"
                maxLength={4}
                className="w-14 h-9 border-r bg-muted/30 px-2 text-center font-mono text-sm focus:outline-none focus:bg-primary/5"
                onChange={(e) => {
                  const code = e.target.value.replace(/\D/g, "").slice(0, 4);
                  e.target.value = code;
                  if (code.length >= 1) {
                    const numericCode = parseInt(code, 10);
                    const match = clients.find((c) => {
                      const cc = (c as any).codigo_cliente;
                      return cc && parseInt(cc, 10) === numericCode;
                    });
                    if (match) {
                      setClientId(match.id);
                      e.target.value = (match as any).codigo_cliente || code;
                      e.target.blur();
                    }
                  }
                }}
              />
              <button
                ref={clientSectionRef}
                onClick={() => {
                  setClientSearch("");
                  setClientHighlight(0);
                  setClientDialogOpen(true);
                }}
                className="flex items-center gap-2 flex-1 px-3 h-9 text-left hover:bg-accent transition-colors"
              >
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={selectedClient ? "text-sm font-medium truncate" : "text-sm text-muted-foreground"}>
                  {selectedClient ? selectedClient.nombre : "Consumidor Final"}
                </span>
              </button>
              {selectedClient && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (items.length > 0 && (formaPago === "Cuenta Corriente" || (formaPago === "Mixto" && mixtoCuentaCorriente > 0))) {
                      setConfirmDialog({
                        open: true,
                        title: "Cambiar cliente",
                        message: "Hay items en el carrito con Cuenta Corriente. ¿Cambiar cliente?",
                        onConfirm: () => {
                          setClientId("");
                          setClientAddresses([]);
                          setSelectedAddressId("");
                          setDeliveryMethod("pickup");
                          setCobrarEnEntrega(false);
                          if (codigoClienteRef.current) codigoClienteRef.current.value = "";
                        },
                      });
                      return;
                    }
                    setClientId("");
                    setClientAddresses([]);
                    setSelectedAddressId("");
                    setDeliveryMethod("pickup");
                    setCobrarEnEntrega(false);
                    if (codigoClienteRef.current) codigoClienteRef.current.value = "";
                  }}
                  className="px-2.5 h-9 flex items-center hover:bg-muted cursor-pointer border-l"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </span>
              )}
            </div>
            {/* Row 2: Delivery + Date */}
            <div className="flex items-center h-8">
              <button
                onClick={() => {
                  if (clientId) fetchClientAddresses(clientId);
                  setDeliveryDialogOpen(true);
                }}
                className="flex items-center gap-1.5 flex-1 px-3 h-full text-left hover:bg-accent transition-colors"
              >
                {deliveryMethod === "pickup" ? (
                  <Store className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                ) : (
                  <Truck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                )}
                <span className="text-xs font-medium">
                  {deliveryMethod === "pickup" ? "Retiro en Tienda" : "Envío a domicilio"}
                </span>
                {deliveryMethod === "delivery" && selectedAddressId && (
                  <span className="text-[10px] text-muted-foreground truncate hidden lg:inline">
                    — {clientAddresses.find((a) => a.id === selectedAddressId)?.direccion || ""}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-1.5 px-2.5 h-full border-l shrink-0">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  value={fechaVenta}
                  onChange={(e) => setFechaVenta(e.target.value)}
                  className="h-5 text-xs border-0 p-0 w-[110px] bg-transparent shadow-none focus-visible:ring-0"
                />
                {fechaVenta !== todayARG() && (
                  <button onClick={() => setFechaVenta(todayARG())} className="text-[10px] text-primary hover:underline font-medium">Hoy</button>
                )}
              </div>
            </div>
          </div>

          {/* Cart area */}
          <Card ref={cartSectionRef} tabIndex={-1} className="flex-1 flex flex-col overflow-hidden min-h-[200px]">
            <div className="flex items-center justify-between px-3 lg:px-5 py-2 lg:py-3 border-b">
              <h2 className="font-semibold text-base">
                Carrito ({items.length})
              </h2>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <p className="text-xs text-muted-foreground hidden md:block">
                    <kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">↑↓</kbd> navegar
                    {" "}
                    <kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">←→</kbd> cantidad
                  </p>
                )}
                <Button size="sm" onClick={() => setSearchOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Agregar
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto" ref={cartListRef}>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Banknote className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">No hay productos en el carrito</p>
                  <p className="text-xs mt-1">
                    Presiona <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">F1</kbd> o haz clic en Agregar
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {items.map((item, idx) => (
                    <div key={item.id} data-cart-idx={idx}>
                      <div
                        className={`flex items-center gap-2 lg:gap-3 px-3 lg:px-5 py-2 lg:py-3 cursor-pointer transition-colors ${
                          idx === selectedItemIdx ? "bg-emerald-50 border-l-4 border-l-emerald-500" : "hover:bg-muted/50"
                        }`}
                        onClick={() => setSelectedItemIdx(idx)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs lg:text-sm font-medium truncate">{item.description}</p>
                            {item.discount > 0 && (
                              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-100 text-orange-700">
                                -{item.discount}%
                              </span>
                            )}
                            {item.es_combo && (
                              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                COMBO
                              </span>
                            )}
                            {!item.es_combo && item.unidades_por_presentacion > 1 && (
                              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-100 text-indigo-700">
                                Caja
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] lg:text-xs text-muted-foreground font-mono">
                            {(() => {
                              if (item.presentacion === "Unidad" && item.qty > 1) {
                                const pres = presentacionesMap[item.producto_id] || [];
                                const match = pres.find((p) => Number(p.cantidad) === item.qty && p.nombre !== "Unidad" && p.codigo);
                                if (match) return match.codigo;
                              }
                              return item.code;
                            })()}
                          </p>
                          {item.presentacion !== "Unidad" && (
                            <Badge variant="secondary" className="mt-1 text-[10px]">
                              {item.presentacion} ({item.unidades_por_presentacion} un.)
                            </Badge>
                          )}
                          {item.presentacion === "Unidad" && (() => {
                            const pres = presentacionesMap[item.producto_id] || [];
                            const boxPres = pres.find((p) => Number(p.cantidad) > 1);
                            if (!boxPres) return null;
                            const boxQty = Number(boxPres.cantidad);
                            if (item.qty >= boxQty && item.qty % boxQty === 0) {
                              const numCajas = item.qty / boxQty;
                              return (
                                <Badge variant="secondary" className="mt-1 text-[10px] bg-indigo-50 text-indigo-600 border-indigo-200">
                                  = {numCajas} {boxPres.nombre} ({boxQty} un.)
                                  {boxPres.codigo && <span className="ml-1 text-muted-foreground">• {boxPres.codigo}</span>}
                                </Badge>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="flex items-center gap-0.5 lg:gap-1">
                          {(() => {
                            const isMedio = (item.unidades_por_presentacion || 1) < 1;
                            const step = item.presentacion === "Unidad" && item.unit === "Mt" ? 0.5 : 1;
                            const displayQty = isMedio ? item.qty * (item.unidades_por_presentacion || 0.5) : item.qty;
                            const displayStep = isMedio ? (item.unidades_por_presentacion || 0.5) : step;
                            return (
                              <>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-6 w-6 lg:h-7 lg:w-7"
                                  onClick={(e) => { e.stopPropagation(); updateQty(item.id, item.qty - 1, item.presentacion === "Unidad"); }}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <Input
                                  type="number"
                                  value={displayQty}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    if (isMedio) {
                                      updateQty(item.id, Math.round(v / (item.unidades_por_presentacion || 0.5)));
                                    } else {
                                      updateQty(item.id, v);
                                    }
                                  }}
                                  onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && item.presentacion === "Unidad") updateQty(item.id, v, true); }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-10 lg:w-14 h-6 lg:h-7 text-center text-xs lg:text-sm"
                                  min={displayStep}
                                  step={displayStep}
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-6 w-6 lg:h-7 lg:w-7"
                                  onClick={(e) => { e.stopPropagation(); updateQty(item.id, item.qty + 1, item.presentacion === "Unidad"); }}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-right w-20 lg:w-28 shrink-0">
                          <p className="text-xs lg:text-sm font-semibold">{formatCurrency(item.subtotal)}</p>
                          <p className="text-[10px] lg:text-xs text-muted-foreground">
                            {item.discount > 0 ? (
                              <><span className="line-through text-gray-400">{formatCurrency(item.price)}</span> <span className="text-emerald-600">{formatCurrency(item.price * (1 - item.discount / 100))}</span> c/u</>
                            ) : (
                              <>{formatCurrency(item.price)} c/u</>
                            )}
                          </p>
                          {item.es_combo && item.comboItems && item.comboItems.length > 0 && (() => {
                            const totalUnits = item.comboItems.reduce((sum, ci) => sum + ci.cantidad, 0);
                            const effectivePrice = item.price * (1 - (item.discount || 0) / 100);
                            return totalUnits > 0 ? (
                              <p className="text-[9px] lg:text-[10px] text-emerald-600">{formatCurrency(effectivePrice / totalUnits)} x unidad</p>
                            ) : null;
                          })()}
                          {!item.es_combo && item.unidades_por_presentacion > 1 && (
                            <p className="text-[9px] lg:text-[10px] text-emerald-600">{formatCurrency(item.price * (1 - (item.discount || 0) / 100) / item.unidades_por_presentacion)} x unidad</p>
                          )}
                          {/* Descuento inline */}
                          <div className="flex items-center justify-end gap-0.5 mt-1" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] text-muted-foreground">Dto.</span>
                            <Input
                              type="number"
                              value={item.discount || ""}
                              onChange={(e) => updateItemDiscount(item.id, Number(e.target.value))}
                              className={`w-10 h-5 text-[10px] text-center p-0 ${item.discount > 0 ? "border-orange-400 text-orange-600 font-semibold" : ""}`}
                              min={0}
                              max={100}
                              placeholder="0"
                            />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 lg:h-7 lg:w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                        >
                          <Trash2 className="w-3 lg:w-3.5 h-3 lg:h-3.5" />
                        </Button>
                      </div>
                      {(() => {
                        const stockEnPres = item.unidades_por_presentacion > 1
                          ? Math.floor((item.stock / item.unidades_por_presentacion) * 10) / 10
                          : item.stock;
                        return item.qty > stockEnPres ? (
                          <div className="flex items-center gap-1 px-3 lg:px-5 pb-1 text-amber-600">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="text-[10px] lg:text-xs">Stock disponible: {stockEnPres}{item.unidades_por_presentacion > 1 ? ` ${item.presentacion}` : " Un."}</span>
                          </div>
                        ) : null;
                      })()}
                      {item.es_combo && item.comboItems && item.comboItems.length > 0 && (
                        <div className="px-3 lg:px-5 pb-2 flex flex-col gap-0.5">
                          {item.comboItems.map((ci) => (
                            <div key={ci.producto_id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <span className="text-emerald-500">•</span>
                              <span>{ci.nombre}</span>
                              <span className="ml-auto">×{ci.cantidad}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div ref={paymentSectionRef} tabIndex={-1} className="flex flex-col gap-2 lg:w-[280px] xl:w-[320px] shrink-0 overflow-y-auto">
          {/* Vendedor selector */}
          {sellers.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Vendedor</p>
              {(() => {
                const sel = sellers.find((s) => s.id === vendedorId);
                return sel ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200">
                    <div className="w-6 h-6 rounded-full bg-violet-200 flex items-center justify-center text-[10px] font-bold text-violet-700 flex-shrink-0">
                      {sel.nombre?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-violet-800 flex-1">{sel.nombre}</span>
                    <button onClick={() => setVendedorId("")} className="p-0.5 rounded-full hover:bg-violet-200 text-violet-500"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setVendedorSelectorOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50/50 transition"
                  >
                    <User className="w-3.5 h-3.5" />
                    Seleccionar vendedor
                  </button>
                );
              })()}
            </div>
          )}

          {/* Payment method grid */}
          {(
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { key: "Efectivo", label: "Efect.", icon: DollarSign },
              { key: "Transferencia", label: "Transf.", icon: ArrowLeftRight },
              { key: "Mixto", label: "Mixto", icon: Shuffle },
              { key: "Cuenta Corriente", label: "Cta Cte", icon: BookOpen },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFormaPago(key)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 p-1.5 lg:p-2 transition-all text-[10px] lg:text-xs font-medium ${
                  formaPago === key
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
                    : "border-border bg-card hover:bg-accent text-muted-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
          )}

          {/* Transfer surcharge info */}
          {formaPago === "Transferencia" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                <span className="text-blue-800">
                  Recargo transferencia: <strong>+{porcentajeTransferencia}%</strong> ({formatCurrency(transferSurcharge)})
                </span>
                <button
                  onClick={() => { setTempPorcentaje(porcentajeTransferencia); setConfigTransfOpen(true); }}
                  className="p-1 rounded hover:bg-blue-200 text-blue-600"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
              {cuentasBancarias.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Cuenta destino</p>
                  {(() => {
                    const sel = cuentasBancarias.find((cb) => cb.id === cuentaBancariaId);
                    return sel ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                        {sel.logo_url && <img src={sel.logo_url} alt="" className="w-6 h-6 rounded object-contain" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-emerald-800">{sel.alias || sel.nombre}</p>
                          <p className="text-[10px] text-emerald-600">{sel.nombre}{sel.titular ? ` · ${sel.titular}` : ""}</p>
                        </div>
                        <button onClick={() => setCuentaBancariaId("")} className="p-1 rounded-full hover:bg-emerald-200 text-emerald-600 transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setCuentaSelectorOpen(true)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition"
                      >
                        <Banknote className="w-4 h-4" />
                        Seleccionar cuenta
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Mixto summary */}
          {formaPago === "Mixto" && (
            <Card>
              <CardContent className="pt-3 pb-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Pago Mixto</p>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setMixtoDialogOpen(true)}>
                    Editar
                  </Button>
                </div>
                {mixtoEfectivo > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Efectivo</span>
                    <span>{formatCurrency(mixtoEfectivo)}</span>
                  </div>
                )}
                {mixtoTransferencia > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Transferencia</span>
                    <span>{formatCurrency(mixtoTransferencia)}</span>
                  </div>
                )}
                {mixtoCuentaCorriente > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Cta. Corriente</span>
                    <span>{formatCurrency(mixtoCuentaCorriente)}</span>
                  </div>
                )}
                {mixtoTransferencia > 0 && (
                  <div className="flex justify-between text-[10px] lg:text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    <span>Rec. transf. ({porcentajeTransferencia}%)</span>
                    <span>+{formatCurrency(mixtoTransferencia * (porcentajeTransferencia / 100))}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs pt-1 border-t">
                  <span className="text-muted-foreground">Restante</span>
                  <span className={Math.abs(mixtoRemaining) < 0.01 ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
                    {formatCurrency(mixtoRemaining)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mixto Dialog */}
          <Dialog open={mixtoDialogOpen} onOpenChange={setMixtoDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Configurar Pago Mixto</DialogTitle>
                <p className="text-sm text-muted-foreground">Selecciona los métodos de pago a combinar</p>
              </DialogHeader>

              <div className="space-y-4">
                {/* Total */}
                <div className="rounded-lg border px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Total a pagar</span>
                    <span className="text-lg font-bold text-emerald-600">{formatCurrency(mixtoBase)}</span>
                  </div>
                  {saldoPendienteCliente > 0 && (
                    <div className="flex items-center justify-between text-[10px] text-orange-600 mt-1">
                      <span>Incluye saldo pendiente</span>
                      <span>+{formatCurrency(saldoPendienteCliente)}</span>
                    </div>
                  )}
                </div>
                {mixtoToggleTransferencia && mixtoTransferencia > 0 && porcentajeTransferencia > 0 && (
                  <div className="flex items-center justify-between text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg -mt-2">
                    <span>Recargo transf. ({porcentajeTransferencia}%)</span>
                    <span>+{formatCurrency(Math.round(mixtoTransferencia * (porcentajeTransferencia / 100)))}</span>
                  </div>
                )}

                {/* Toggle methods */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Métodos a combinar</p>
                  <div className="flex gap-2">
                    {[
                      { key: "efectivo", label: "Efectivo", icon: DollarSign, active: mixtoToggleEfectivo, toggle: setMixtoToggleEfectivo, disabled: false },
                      { key: "transferencia", label: "Transferencia", icon: ArrowLeftRight, active: mixtoToggleTransferencia, toggle: setMixtoToggleTransferencia, disabled: false },
                      { key: "corriente", label: "Cta. Cte.", icon: BookOpen, active: mixtoToggleCuentaCorriente, toggle: setMixtoToggleCuentaCorriente, disabled: !clientId },
                    ].map(({ key, label, icon: Icon, active, toggle, disabled }) => (
                      <button
                        key={key}
                        disabled={disabled}
                        onClick={() => {
                          const next = !active;
                          toggle(next);
                          if (!next) {
                            if (key === "efectivo") setMixtoEfectivo(0);
                            if (key === "transferencia") setMixtoTransferencia(0);
                            if (key === "corriente") setMixtoCuentaCorriente(0);
                          }
                        }}
                        className={`flex-1 flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 transition-all text-xs font-medium ${
                          disabled
                            ? "border-border bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
                            : active
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
                              : "border-border bg-card hover:bg-accent text-muted-foreground"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                  {!clientId && (
                    <p className="text-[10px] text-amber-600">* Selecciona un cliente para usar Cuenta Corriente</p>
                  )}
                </div>

                {/* Bank account selector for transferencia */}
                {mixtoToggleTransferencia && cuentasBancarias.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Cuenta destino</p>
                    {(() => {
                      const sel = cuentasBancarias.find((cb) => cb.id === cuentaBancariaId);
                      return sel ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                          {sel.logo_url && <img src={sel.logo_url} alt="" className="w-5 h-5 rounded object-contain" />}
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-emerald-800">{sel.alias || sel.nombre}</span>
                            {sel.titular && <span className="text-[9px] text-emerald-600 ml-1">· {sel.titular}</span>}
                          </div>
                          <button onClick={() => setCuentaBancariaId("")} className="p-0.5 rounded-full hover:bg-emerald-200 text-emerald-600"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button onClick={() => setCuentaSelectorOpen(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition">
                          Seleccionar cuenta
                        </button>
                      );
                    })()}
                  </div>
                )}

                {/* Assigned indicator */}
                {mixtoActiveMethods.length >= 2 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className={Math.abs(mixtoRemaining) < 1 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                      Asignado: {formatCurrency(mixtoSum)} / {formatCurrency(mixtoBase)}
                    </span>
                    {mixtoRemaining > 0.01 && (
                      <span className="text-amber-600 font-medium">Falta: {formatCurrency(mixtoRemaining)}</span>
                    )}
                  </div>
                )}
                {mixtoActiveMethods.length >= 2 && mixtoToggleTransferencia && mixtoTransferencia > 0 && porcentajeTransferencia > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    El cliente debe transferir {formatCurrency(Math.round(mixtoTransferencia + mixtoTransferencia * (porcentajeTransferencia / 100)))} (incluye recargo {porcentajeTransferencia}%)
                  </p>
                )}

                {/* Amount inputs */}
                {mixtoActiveMethods.length >= 2 && (
                  <div className="flex gap-3">
                    {[
                      { key: "efectivo", label: "Efectivo", active: mixtoToggleEfectivo },
                      { key: "corriente", label: "Cta. Cte.", active: mixtoToggleCuentaCorriente },
                    ]
                      .filter(({ active }) => active)
                      .map(({ key, label }) => {
                        const value = key === "efectivo" ? mixtoEfectivo : mixtoCuentaCorriente;
                        const setter = key === "efectivo" ? setMixtoEfectivo : setMixtoCuentaCorriente;
                        return (
                          <div key={key} className="flex-1 space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground">{label}</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                min={0}
                                value={value ? new Intl.NumberFormat("es-AR").format(value) : ""}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                                  const val = Math.min(parseFloat(raw) || 0, mixtoBase);
                                  setter(val);
                                  // Auto-calculate the other field as remainder
                                  if (mixtoToggleTransferencia) {
                                    const otherNonTransf = key === "efectivo"
                                      ? mixtoCuentaCorriente
                                      : mixtoEfectivo;
                                    setMixtoTransferencia(Math.max(0, mixtoBase - val - otherNonTransf));
                                  } else {
                                    // No transfer: auto-fill the other field
                                    const otherSetter = key === "efectivo" ? setMixtoCuentaCorriente : setMixtoEfectivo;
                                    otherSetter(Math.max(0, mixtoBase - val));
                                  }
                                }}
                                className="pl-6 h-9 text-right text-sm"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        );
                      })}
                    {/* Transfer is read-only, auto-calculated */}
                    {mixtoToggleTransferencia && (
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">Transferencia</label>
                        {(() => {
                          const transfBase = mixtoTransferencia;
                          const recargo = porcentajeTransferencia > 0
                            ? Math.round(transfBase * (porcentajeTransferencia / 100))
                            : 0;
                          return (
                            <div className="h-9 rounded-md border bg-muted/50 px-2 flex items-center justify-end text-sm font-medium">
                              {formatCurrency(transfBase + recargo)}
                            </div>
                          );
                        })()}
                        {porcentajeTransferencia > 0 && mixtoTransferencia > 0 && (
                          <p className="text-[9px] text-emerald-600">inc. {porcentajeTransferencia}% recargo</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setMixtoDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={confirmMixto}
                    disabled={Math.abs(mixtoRemaining) >= 0.01}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Confirmar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Descuento / Recargo */}
          <Card>
            <CardContent className="pt-2.5 pb-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Descuento</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={descuento}
                    onChange={(e) => setDescuento(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-14 h-6 text-right text-xs"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Recargo</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={recargo}
                    onChange={(e) => setRecargo(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-14 h-6 text-right text-xs"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card>
            <CardContent className="pt-2.5 pb-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-xs lg:text-sm">
                  <span className="text-muted-foreground">Desc. ({descuento}%)</span>
                  <span className="text-destructive">-{formatCurrency(descuentoAmount)}</span>
                </div>
              )}
              {recargo > 0 && (
                <div className="flex justify-between text-xs lg:text-sm">
                  <span className="text-muted-foreground">Recargo ({recargo}%)</span>
                  <span>+{formatCurrency(recargoAmount)}</span>
                </div>
              )}
              {transferSurcharge > 0 && (
                <div className="flex justify-between text-xs lg:text-sm">
                  <span className="text-muted-foreground">Rec. Transf. ({porcentajeTransferencia}%)</span>
                  <span className="text-blue-600">+{formatCurrency(transferSurcharge)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm lg:text-base font-bold">TOTAL</span>
                <span className="text-xl lg:text-2xl font-bold text-emerald-600">{formatCurrency(total)}</span>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {items.length} producto{items.length !== 1 ? "s" : ""}
              </p>
              {/* Saldo pendiente option */}
              {selectedClient && selectedClient.saldo > 0 && (
                <>
                  <Separator />
                  <label className="flex items-center gap-2 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={cobrarSaldo}
                      onChange={(e) => setCobrarSaldo(e.target.checked)}
                      className="w-4 h-4 rounded border-orange-300 text-orange-600 accent-orange-600"
                    />
                    <span className="text-xs font-medium text-orange-700">
                      Cobrar saldo pendiente ({formatCurrency(selectedClient.saldo)})
                    </span>
                  </label>
                  {cobrarSaldo && (
                    <div className="space-y-0.5 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total pedido</span>
                        <span>{formatCurrency(total)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Saldo pendiente</span>
                        <span className="text-orange-600">+{formatCurrency(selectedClient.saldo)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total a cobrar</span>
                        <span className="text-emerald-600">{formatCurrency(total + selectedClient.saldo)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Cobrar en entrega toggle — only for delivery orders */}
          {deliveryMethod === "delivery" && (
            <button
              type="button"
              onClick={() => setCobrarEnEntrega(v => !v)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                cobrarEnEntrega
                  ? "border-sky-400 bg-sky-50 text-sky-800"
                  : "border-emerald-400 bg-emerald-50 text-emerald-800"
              }`}
            >
              <span className={`w-8 h-5 rounded-full flex items-center transition-all ${cobrarEnEntrega ? "bg-sky-400" : "bg-emerald-500"}`}>
                <span className={`w-4 h-4 rounded-full bg-white shadow transition-all mx-0.5 ${cobrarEnEntrega ? "" : "translate-x-3"}`} />
              </span>
              {cobrarEnEntrega ? "Cobrar al momento de entrega" : "Cobrar ahora"}
            </button>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5 mt-auto">
            <Button
              className="w-full h-10 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={initiateFinalize}
              disabled={items.length === 0 || saving || !mixtoValid || total <= 0 || ((formaPago === "Cuenta Corriente" || (formaPago === "Mixto" && mixtoCuentaCorriente > 0)) && !clientId)}
            >
              {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
              FINALIZAR VENTA
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={resetSale}
              disabled={items.length === 0}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>

      {/* Shortcuts hint bar */}
      <div className="border-t px-3 lg:px-4 py-1 lg:py-1.5 flex items-center gap-2 lg:gap-4 text-[10px] lg:text-xs text-muted-foreground bg-muted/30 overflow-x-auto shrink-0">
        <button onClick={() => setShortcutsOpen(true)} className="flex items-center gap-1 lg:gap-1.5 hover:text-foreground transition-colors shrink-0">
          <Keyboard className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span><kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">F10</kbd> Atajos</span>
        </button>
        <span className="shrink-0"><kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">F1</kbd> Agregar</span>
        <span className="shrink-0"><kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">F2</kbd> Cliente</span>
        <span className="shrink-0"><kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">F12</kbd> Finalizar</span>
        <span className="shrink-0 hidden md:inline"><kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">↑↓</kbd> Navegar</span>
        <span className="shrink-0 hidden md:inline"><kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">←→</kbd> Cantidad</span>
        {lastPrintData && lastPrintData.numero && (
          <button onClick={() => setReprintOpen(true)} className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
            <Printer className="w-3 h-3" />
            <span className="text-[10px] font-medium">Reimprimir #{lastPrintData.numero.split("-").pop()}</span>
          </button>
        )}
        <button
          onClick={toggleScanner}
          className={`ml-auto flex items-center gap-1 lg:gap-1.5 shrink-0 px-2 py-0.5 rounded-full transition-colors ${
            scannerEnabled
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <ScanBarcode className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span className="hidden sm:inline">Escáner {scannerEnabled ? "ON" : "OFF"}</span>
        </button>
      </div>

      {/* ==================== DIALOGS ==================== */}

      {/* Product search dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg" data-search-dialog>
          <DialogHeader>
            <DialogTitle>Buscar producto</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o codigo..."
              value={productSearch}
              onChange={(e) => { setProductSearch(e.target.value); setSearchHighlight(0); }}
              onKeyDown={(e) => {
                const list = filteredProducts.slice(0, 50);
                if (e.key === "ArrowDown") { e.preventDefault(); setSearchHighlight((h) => Math.min(h + 1, list.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSearchHighlight((h) => Math.max(h - 1, 0)); }
                else if (e.key === "Enter" && list.length > 0) {
                  e.preventDefault();
                  const p = list[searchHighlight];
                  if (p) {
                    const pres = presentacionesMap[p.id] || [];
                    if (pres.length === 0) fetchPresentaciones(p.id);
                    const matchedPres = productSearch.length >= 2
                      ? pres.find((pr) => (pr.codigo || "").toLowerCase() === productSearch.toLowerCase())
                      : undefined;
                    tryAddItem(p, matchedPres);
                  }
                }
              }}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredProducts.slice(0, 50).map((p, idx) => {
              const pres = presentacionesMap[p.id] || [];
              const matchedPres = productSearch.length >= 2
                ? pres.find((pr) => (pr.codigo || "").toLowerCase() === productSearch.toLowerCase())
                : undefined;
              const highlighted = idx === searchHighlight;
              const boxVariants = pres.filter((pr) => pr.nombre !== "Unidad" && pr.cantidad !== 1);
              const isComboP = !!(p as any).es_combo;
              const comboComponents = isComboP ? (comboItemsMap[p.id] || []) : [];
              const effectiveStock = isComboP && comboComponents.length > 0
                ? Math.min(...comboComponents.map((c) => Math.floor(c.stock / c.cantidad)))
                : isComboP ? null : p.stock;
              const unitDisc = getProductDiscount(p, "Unidad");
              return (
                <div
                  key={p.id}
                  ref={highlighted ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  className={`rounded-xl border p-3 transition-colors ${highlighted ? "ring-2 ring-primary border-primary bg-muted/50" : "hover:border-primary/30 hover:bg-primary/5"}`}
                  onMouseEnter={() => { fetchPresentaciones(p.id); setSearchHighlight(idx); }}
                >
                  <button
                    onClick={() => { if (pres.length === 0) fetchPresentaciones(p.id); tryAddItem(p); }}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {(p as any).imagen_url ? (
                        <img src={(p as any).imagen_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-5 h-5 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{p.nombre}</span>
                        {isComboP && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700 shrink-0">COMBO</span>}
                        {unitDisc > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-100 text-orange-700 shrink-0">-{unitDisc}%</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{p.codigo}</span>
                        <span>·</span>
                        <span>Stock: <strong className={(effectiveStock ?? 1) <= 0 ? "text-red-500" : ""}>{effectiveStock === null ? "..." : effectiveStock}</strong></span>
                        <span>·</span>
                        <span className="font-semibold text-foreground">{formatCurrency(matchedPres ? matchedPres.precio : p.precio)}</span>
                      </div>
                    </div>
                  </button>
                  {boxVariants.length > 0 && (
                    <div className="flex gap-2 mt-2.5 pl-14">
                      <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => tryAddItem(p)}>
                        + Unidad
                      </Button>
                      {boxVariants.map((pr) => (
                        <Button
                          key={pr.id}
                          size="sm"
                          className={`h-8 text-xs flex-1 ${matchedPres?.id === pr.id ? "ring-2 ring-primary" : ""}`}
                          onClick={() => tryAddItem(p, pr)}
                        >
                          + {pr.nombre || `Caja x${pr.cantidad}`} ({pr.cantidad} un.)
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No se encontraron productos</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Client selector dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Seleccionar Cliente</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email o telefono..."
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                setClientHighlight(0);
              }}
              onKeyDown={handleClientKeyDown}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Consumidor Final default option */}
          <div
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer border-2 ${
              !clientId ? "border-emerald-500 bg-emerald-50" : "border-transparent hover:bg-muted"
            }`}
            onClick={() => {
              setClientId("");
              setClientDialogOpen(false);
              setClientSearch("");
            }}
          >
            <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
              CF
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Consumidor Final</p>
              <p className="text-xs text-muted-foreground">Sin datos de cliente</p>
            </div>
            {!clientId && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
          </div>

          <Separator />

          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {filteredClients.slice(0, 60).map((c, idx) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                  idx === clientHighlight ? "bg-accent" : "hover:bg-muted"
                }`}
                onClick={() => {
                  setClientId(c.id);
                  setClientDialogOpen(false);
                  setClientSearch("");
                  if (codigoClienteRef.current) codigoClienteRef.current.value = (c as any).codigo_cliente || "";
                }}
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {(c as any).codigo_cliente || initials(c.nombre)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[(c as any).codigo_cliente ? `#${(c as any).codigo_cliente}` : null, c.email, c.telefono].filter(Boolean).join(" - ")}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 text-xs">
                  Seleccionar
                </Button>
              </div>
            ))}
            {filteredClients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No se encontraron clientes</p>
            )}
            {filteredClients.length > 60 && (
              <p className="text-xs text-muted-foreground text-center py-2">Mostrando 60 de {filteredClients.length}. Buscá para filtrar.</p>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              <kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">Enter</kbd> para seleccionar -{" "}
              <kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">Esc</kbd> para cerrar
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setNewClientData({ nombre: "", email: "", telefono: "", cuit: "", direccion: "", tipo_documento: "", numero_documento: "", situacion_iva: "Consumidor final", razon_social: "", domicilio_fiscal: "", provincia: "", localidad: "", codigo_postal: "", barrio: "", observacion: "", vendedor_id: sellers[0]?.id || "", zona_entrega: "", limite_credito: 0, maps_url: "" });
                setCreateClientOpen(true);
              }}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Nuevo Cliente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create client dialog — identical to Clientes page */}
      <Dialog open={createClientOpen} onOpenChange={setCreateClientOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Código + Nombre */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Código de cliente</label>
                <Input value={(newClientData as any).codigo_cliente || ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setNewClientData((d) => ({ ...d, codigo_cliente: v } as any)); }} maxLength={4} className="font-mono" />
                <p className="text-[11px] text-muted-foreground">4 dígitos, único por cliente</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Apellido y Nombre</label>
                <Input value={newClientData.nombre} onChange={(e) => setNewClientData((d) => ({ ...d, nombre: e.target.value }))} autoFocus />
              </div>
            </div>
            {/* Tipo Doc + Nro Doc */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de Documento</label>
                <Select value={newClientData.tipo_documento} onValueChange={(v) => setNewClientData((d) => ({ ...d, tipo_documento: v ?? "" }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNI">DNI</SelectItem>
                    <SelectItem value="CUIT">CUIT</SelectItem>
                    <SelectItem value="CUIL">CUIL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Número de Documento</label>
                <Input value={newClientData.numero_documento} onChange={(e) => setNewClientData((d) => ({ ...d, numero_documento: e.target.value }))} />
              </div>
            </div>
            {/* Domicilio + Maps */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Domicilio</label>
              <Input value={newClientData.direccion} onChange={(e) => setNewClientData((d) => ({ ...d, direccion: e.target.value }))} />
              <Input value={newClientData.maps_url} onChange={(e) => setNewClientData((d) => ({ ...d, maps_url: e.target.value }))} placeholder="Link de Google Maps personalizado (opcional)" className="text-xs h-8" />
            </div>
            {/* Teléfono + Email */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Teléfono</label>
                <Input value={newClientData.telefono} onChange={(e) => setNewClientData((d) => ({ ...d, telefono: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">E-mail</label>
                <Input type="email" value={newClientData.email} onChange={(e) => setNewClientData((d) => ({ ...d, email: e.target.value }))} />
              </div>
            </div>
            {/* Provincia + Localidad */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Provincia</label>
                <Select value={newClientData.provincia} onValueChange={(v) => setNewClientData((d) => ({ ...d, provincia: v ?? "" }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {["Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Localidad</label>
                <Input value={newClientData.localidad} onChange={(e) => setNewClientData((d) => ({ ...d, localidad: e.target.value }))} />
              </div>
            </div>
            {/* Barrio + CP */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Barrio / Zona</label>
                <Input value={newClientData.barrio} onChange={(e) => setNewClientData((d) => ({ ...d, barrio: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Código Postal</label>
                <Input value={newClientData.codigo_postal} onChange={(e) => setNewClientData((d) => ({ ...d, codigo_postal: e.target.value }))} />
              </div>
            </div>
            {/* Zona de entrega */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Zona de entrega</label>
              <Select value={newClientData.zona_entrega || "none"} onValueChange={(v) => setNewClientData((d) => ({ ...d, zona_entrega: v === "none" ? "" : (v ?? "") }))}>
                <SelectTrigger>
                  {newClientData.zona_entrega
                    ? (zonasEntrega.find((z) => z.id === newClientData.zona_entrega)?.nombre ?? "Sin zona asignada")
                    : "Sin zona asignada"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin zona asignada</SelectItem>
                  {zonasEntrega.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.nombre}{z.dias && z.dias.length > 0 ? ` — ${z.dias.join(", ")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Vendedor */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Vendedor</label>
              <Select value={newClientData.vendedor_id || "none"} onValueChange={(v) => setNewClientData((d) => ({ ...d, vendedor_id: v === "none" ? "" : (v ?? "") }))}>
                <SelectTrigger>
                  {newClientData.vendedor_id
                    ? (sellers.find((s) => s.id === newClientData.vendedor_id)?.nombre ?? "Sin vendedor")
                    : "Sin vendedor"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vendedor</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Límite crédito + Observación */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Límite de crédito</label>
                <Input type="number" min={0} value={newClientData.limite_credito || ""} onChange={(e) => setNewClientData((d) => ({ ...d, limite_credito: Math.max(0, Number(e.target.value)) }))} placeholder="0 = sin límite" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Observación</label>
                <Input value={newClientData.observacion} onChange={(e) => setNewClientData((d) => ({ ...d, observacion: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateClientOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreateClient}
              disabled={!newClientData.nombre.trim() || creatingClient}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {creatingClient ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Crear Cliente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock warning dialog */}
      <Dialog open={stockWarning.open} onOpenChange={(open) => !open && setStockWarning({ open: false, product: null })}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">Sin Stock</p>
              <p className="text-sm text-muted-foreground mt-2">
                <strong>{stockWarning.product?.nombre}</strong> no tiene stock disponible (Stock: {stockWarning.product?.stock ?? 0}).
              </p>
              <p className="text-sm text-muted-foreground mt-1">¿Deseas facturarlo de todas formas?</p>
            </div>
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStockWarning({ open: false, product: null })}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => {
                  if (stockWarning.product) {
                    addItem(stockWarning.product, stockWarning.presentacion);
                  }
                  setStockWarning({ open: false, product: null });
                }}
              >
                Sí, facturar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer surcharge config dialog */}
      {/* Vendedor Selector Modal */}
      <Dialog open={vendedorSelectorOpen} onOpenChange={setVendedorSelectorOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <User className="w-5 h-5" />
              Seleccionar vendedor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {sellers.map((s) => (
              <button
                key={s.id}
                onClick={() => { setVendedorId(s.id); setVendedorSelectorOpen(false); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-violet-400 hover:bg-violet-50/50 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-700 flex-shrink-0">
                  {s.nombre?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-violet-700">{s.nombre}</p>
                  {s.email && <p className="text-[11px] text-gray-400">{s.email}</p>}
                  {s.rol && <p className="text-[10px] text-gray-400 capitalize">{s.rol}</p>}
                </div>
                <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-violet-500 flex items-center justify-center flex-shrink-0">
                  {vendedorId === s.id && <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bank Account Selector Modal */}
      <Dialog open={cuentaSelectorOpen} onOpenChange={setCuentaSelectorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Banknote className="w-5 h-5" />
              Seleccionar cuenta destino
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {cuentasBancarias.map((cb) => (
              <button
                key={cb.id}
                onClick={() => { setCuentaBancariaId(cb.id); setCuentaSelectorOpen(false); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 border flex items-center justify-center overflow-hidden flex-shrink-0">
                  {cb.logo_url ? (
                    <img src={cb.logo_url} alt="" className="w-full h-full object-contain p-1" />
                  ) : (
                    <Banknote className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-700 truncate">{cb.nombre}</p>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    {cb.alias && <span className="font-mono">{cb.alias}</span>}
                    {cb.tipo_cuenta && <span>· {cb.tipo_cuenta}</span>}
                    {cb.origen === "proveedor" && <span className="text-amber-600 font-medium">· Proveedor</span>}
                  </div>
                  {cb.titular && <p className="text-[10px] text-gray-400 mt-0.5 truncate">Titular: {cb.titular}</p>}
                </div>
                <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-emerald-500 flex items-center justify-center flex-shrink-0">
                  {cuentaBancariaId === cb.id && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                </div>
              </button>
            ))}
            {cuentasBancarias.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">No hay cuentas configuradas. Agregá una en Configuración.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={configTransfOpen} onOpenChange={setConfigTransfOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Recargo Transferencia
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Porcentaje adicional que se suma al monto pagado por transferencia.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={tempPorcentaje}
                onChange={(e) => setTempPorcentaje(Number(e.target.value))}
                className="text-center"
                min={0}
                max={100}
                step={0.5}
                autoFocus
              />
              <span className="text-lg font-semibold">%</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfigTransfOpen(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setPorcentajeTransferencia(tempPorcentaje);
                setConfigTransfOpen(false);
              }}
            >
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash payment dialog */}
      <Dialog open={cashDialogOpen} onOpenChange={setCashDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm p-0 overflow-hidden max-h-[95vh] overflow-y-auto">
          <div className="bg-emerald-600 text-white px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3">
            <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
            <h3 className="text-base sm:text-lg font-semibold">Pago en Efectivo</h3>
          </div>
          <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
            {/* Totales en fila */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{saldoPendienteCliente > 0 ? "Total a cobrar" : "Total"}</p>
                <p className="text-sm sm:text-lg font-bold">{formatCurrency(totalACobrar)}</p>
                {saldoPendienteCliente > 0 && (
                  <p className="text-[9px] text-orange-600">inc. saldo {formatCurrency(saldoPendienteCliente)}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Recibido</p>
                <p className="text-sm sm:text-lg font-bold text-emerald-600">
                  {formatCurrency(cashReceivedNum)}
                </p>
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {cashReceivedNum >= totalACobrar ? "Vuelto" : "Falta"}
                </p>
                <p className={`text-sm sm:text-lg font-bold ${cashReceivedNum >= totalACobrar ? "text-emerald-600" : "text-destructive"}`}>
                  {cashReceivedNum === 0 ? "—" : cashReceivedNum >= totalACobrar ? formatCurrency(cashChange) : formatCurrency(totalACobrar - cashReceivedNum)}
                </p>
              </div>
            </div>

            {/* Quick bill buttons */}
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-1.5">Agregar billetes</p>
              <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                {[100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((v) => (
                  <button
                    key={v}
                    onClick={() => cashAddBill(v)}
                    className="rounded-lg border py-1.5 sm:py-2 text-[11px] sm:text-xs font-medium hover:bg-accent active:bg-accent/80 transition-colors"
                  >
                    +{v >= 1000 ? `${v / 1000}K` : v}
                  </button>
                ))}
              </div>
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((d) => (
                <button
                  key={d}
                  onClick={() => cashAppend(d)}
                  className="rounded-lg border py-2.5 sm:py-3 text-base sm:text-lg font-semibold hover:bg-accent active:bg-accent/80 transition-colors"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={cashBackspace}
                className="rounded-lg border py-2.5 sm:py-3 flex items-center justify-center hover:bg-accent active:bg-accent/80 transition-colors"
              >
                <Delete className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Monto exacto / Limpiar */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs sm:text-sm"
                onClick={() => setCashReceived(String(totalACobrar))}
              >
                Monto Exacto
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs sm:text-sm"
                onClick={() => setCashReceived("")}
              >
                Limpiar
              </Button>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <Button variant="outline" size="sm" className="text-xs sm:text-sm" onClick={() => setCashDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm"
                onClick={handleCerrarComprobante}
                disabled={cashReceivedNum < totalACobrar || saving}
                data-cash-cobrar
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Cobrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delivery method dialog */}
      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-600" />
              Método de Entrega
            </DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <p className="text-sm text-muted-foreground -mt-2">Cliente: {selectedClient.nombre}</p>
          )}
          <div className="space-y-4">
            {/* Pickup */}
            <button
              onClick={() => {
                setDeliveryMethod("pickup");
                setCobrarEnEntrega(false);
                setDespacho("Retira en local");
              }}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                deliveryMethod === "pickup"
                  ? "border-sky-400 bg-sky-50"
                  : "border-border hover:bg-accent"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                deliveryMethod === "pickup" ? "bg-sky-100" : "bg-muted"
              }`}>
                <Store className={`w-5 h-5 ${deliveryMethod === "pickup" ? "text-sky-700" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Retiro en Tienda</p>
                <p className="text-xs text-muted-foreground">El cliente retira en el local</p>
              </div>
              {deliveryMethod === "pickup" && (
                <div className="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </button>

            {/* Delivery divider */}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" /> Delivery
              </span>
              <Separator className="flex-1" />
            </div>

            {/* Addresses */}
            {clientAddresses.length > 0 ? (
              <div className="space-y-2">
                {clientAddresses.map((addr) => (
                  <button
                    key={addr.id}
                    onClick={() => {
                      setDeliveryMethod("delivery");
                      setCobrarEnEntrega(true);
                      setDespacho("Envio a domicilio");
                      setSelectedAddressId(addr.id);
                    }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      deliveryMethod === "delivery" && selectedAddressId === addr.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      deliveryMethod === "delivery" && selectedAddressId === addr.id ? "bg-emerald-100" : "bg-muted"
                    }`}>
                      <MapPin className={`w-5 h-5 ${
                        deliveryMethod === "delivery" && selectedAddressId === addr.id ? "text-emerald-600" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{addr.direccion}</p>
                      <p className="text-xs text-muted-foreground">
                        {[addr.ciudad, addr.provincia, addr.codigo_postal].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    {deliveryMethod === "delivery" && selectedAddressId === addr.id && (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : clientId ? (
              <p className="text-xs text-muted-foreground text-center py-2">Este cliente no tiene direcciones cargadas</p>
            ) : (
              <p className="text-xs text-amber-600 text-center py-2">Seleccioná un cliente para ver direcciones de envío</p>
            )}

            {/* Add new address */}
            {clientAddresses.length > 0 ? (
              <button
                onClick={() => {
                  setShowNewAddressForm(true);
                  setNewAddress({ direccion: "", ciudad: "", provincia: "", codigo_postal: "", telefono: "" });
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar otra dirección</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowNewAddressForm(true);
                  setNewAddress({ direccion: "", ciudad: "", provincia: "", codigo_postal: "", telefono: "" });
                }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-border hover:bg-accent transition-all text-left"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Agregar Nueva Dirección</span>
              </button>
            )}

            {/* New address inline form */}
            {showNewAddressForm && (
              <div className="space-y-3 p-4 rounded-xl border bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nueva dirección</p>
                <Input
                  placeholder="Dirección"
                  value={newAddress.direccion}
                  onChange={(e) => setNewAddress({ ...newAddress, direccion: e.target.value })}
                  className="h-9 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Ciudad"
                    value={newAddress.ciudad}
                    onChange={(e) => setNewAddress({ ...newAddress, ciudad: e.target.value })}
                    className="h-9 text-sm"
                  />
                  <Input
                    placeholder="Provincia"
                    value={newAddress.provincia}
                    onChange={(e) => setNewAddress({ ...newAddress, provincia: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Código Postal"
                    value={newAddress.codigo_postal}
                    onChange={(e) => setNewAddress({ ...newAddress, codigo_postal: e.target.value })}
                    className="h-9 text-sm"
                  />
                  <Input
                    placeholder="Teléfono"
                    value={newAddress.telefono}
                    onChange={(e) => setNewAddress({ ...newAddress, telefono: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewAddressForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={!newAddress.direccion || !clientId || savingAddress}
                    onClick={async () => {
                      setSavingAddress(true);
                      try {
                        // Look up clientes_auth id for this client
                        const { data: authData } = await supabase
                          .from("clientes_auth")
                          .select("id")
                          .eq("cliente_id", clientId)
                          .limit(1)
                          .single();
                        if (!authData) {
                          // No clientes_auth linked - create address record directly on the client
                          // Update client's domicilio field instead
                          const { error: updateErr } = await supabase
                            .from("clientes")
                            .update({
                              domicilio: newAddress.direccion,
                              localidad: newAddress.ciudad,
                              provincia: newAddress.provincia,
                              codigo_postal: newAddress.codigo_postal,
                            })
                            .eq("id", clientId);
                          if (updateErr) throw updateErr;
                          await fetchClientAddresses(clientId);
                          setSelectedAddressId("domicilio-principal");
                          setDeliveryMethod("delivery");
                          setCobrarEnEntrega(true);
                          setDespacho("Envio a domicilio");
                          setShowNewAddressForm(false);
                          setSavingAddress(false);
                          return;
                        }
                        const { data, error } = await supabase
                          .from("cliente_direcciones")
                          .insert({
                            cliente_auth_id: authData.id,
                            nombre: newAddress.direccion,
                            direccion: newAddress.direccion,
                            ciudad: newAddress.ciudad,
                            provincia: newAddress.provincia,
                            codigo_postal: newAddress.codigo_postal,
                            telefono: newAddress.telefono,
                            predeterminada: clientAddresses.length === 0,
                          })
                          .select()
                          .single();
                        if (error) throw error;
                        await fetchClientAddresses(clientId);
                        if (data) {
                          setSelectedAddressId(data.id);
                          setDeliveryMethod("delivery");
                          setCobrarEnEntrega(true);
                          setDespacho("Envio a domicilio");
                        }
                        setShowNewAddressForm(false);
                      } catch (err) {
                        console.error("Error saving address:", err);
                        showAdminToast("Error al guardar la dirección", "error");
                      } finally {
                        setSavingAddress(false);
                      }
                    }}
                  >
                    {savingAddress ? "Guardando..." : "Guardar dirección"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keyboard shortcuts overlay */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              Atajos de Teclado
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6 text-sm">
            {/* Navegacion */}
            <div>
              <h4 className="font-semibold mb-2 text-primary uppercase text-xs tracking-wider">Navegacion</h4>
              <div className="space-y-1.5">
                {[
                  ["F10 / Shift+?", "Mostrar atajos"],
                  ["Ctrl+Tab", "Siguiente seccion"],
                  ["Ctrl+Shift+Tab", "Seccion anterior"],
                  ["F3", "Cliente"],
                  ["F4", "Carrito"],
                  ["F5", "Pago"],
                  ["Ctrl+B", "Buscar cliente"],
                  ["↑ / ↓", "Navegar productos"],
                  ["← / →", "Disminuir / Aumentar cantidad"],
                  ["Delete", "Eliminar producto seleccionado"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex justify-between">
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{key}</kbd>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Acciones */}
            <div>
              <h4 className="font-semibold mb-2 text-purple-600 uppercase text-xs tracking-wider">Acciones</h4>
              <div className="space-y-1.5">
                {[
                  ["F1", "Agregar producto"],
                  ["F2", "Seleccionar cliente"],
                  ["F12", "Finalizar venta"],
                  ["Ctrl+N", "Nueva venta / Limpiar"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex justify-between">
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{key}</kbd>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Modales */}
            <div>
              <h4 className="font-semibold mb-2 text-gray-500 uppercase text-xs tracking-wider">Modales</h4>
              <div className="space-y-1.5">
                {[
                  ["Ctrl+P", "Agregar producto (alt)"],
                  ["Ctrl+U", "Seleccionar cliente (alt)"],
                  ["Esc", "Cerrar modal"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex justify-between">
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{key}</kbd>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Documento */}
            <div>
              <h4 className="font-semibold mb-2 text-red-600 uppercase text-xs tracking-wider">Documento</h4>
              <div className="space-y-1.5">
                {[
                  ["Alt+F", "Factura"],
                  ["Alt+R", "Remito"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex justify-between">
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{key}</kbd>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagos */}
            <div className="col-span-2">
              <h4 className="font-semibold mb-2 text-emerald-600 uppercase text-xs tracking-wider">Pagos</h4>
              <div className="flex gap-6">
                {[
                  ["Alt+1", "Efectivo"],
                  ["Alt+2", "Transferencia"],
                  ["Alt+3", "Pago mixto"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center gap-2">
                    <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{key}</kbd>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground">
            Presiona <kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">F10</kbd> o <kbd className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">?</kbd> en cualquier momento para ver esta ayuda
          </p>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
            <span className="font-semibold">Lector de Codigo de Barras:</span> Conecta un lector USB y escanea productos directamente. Se agregan automaticamente al carrito.
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal with PDF Preview */}
      <Dialog open={successModal.open} onOpenChange={(open) => {
        if (!open) setSuccessModal((prev) => ({ ...prev, open: false, pdfUrl: null }));
      }}>
        <DialogContent className="max-w-3xl max-h-[92vh] p-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-emerald-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold">Venta registrada</p>
                <p className="text-sm text-emerald-100">N° {successModal.numero}</p>
              </div>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(successModal.total)}</p>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-auto bg-gray-100 p-4 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Vista previa del comprobante</span>
            </div>
            <div ref={receiptRef} className="bg-white shadow-lg mx-auto" style={{ width: "210mm", transformOrigin: "top center", transform: "scale(0.52)" }}>
              <ReceiptPrintView sale={successModal} config={receiptConfig} />
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t flex items-center gap-2 shrink-0 bg-background">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handlePrintReceipt}>
              <Printer className="w-4 h-4 mr-2" />Imprimir
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleDownloadReceipt}>
              <Download className="w-4 h-4 mr-2" />Descargar
            </Button>
            <Button variant="ghost" onClick={() => setSuccessModal((prev) => ({ ...prev, open: false, pdfUrl: null }))}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Error Modal */}
      <Dialog open={errorModal.open} onOpenChange={(open) => !open && setErrorModal({ open: false, message: "" })}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <X className="w-7 h-7 text-red-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">Error</p>
              <p className="text-sm text-muted-foreground mt-2">{errorModal.message}</p>
            </div>
            <Button className="w-full mt-2" variant="outline" onClick={() => setErrorModal({ open: false, message: "" })}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock exceed dialog */}
      <Dialog open={stockExceedDialog.open} onOpenChange={(open) => !open && setStockExceedDialog({ open: false, issues: [], adjustSet: new Set() })}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-base font-semibold">Stock insuficiente</p>
                <p className="text-sm text-muted-foreground">Los siguientes productos superan el stock disponible:</p>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {stockExceedDialog.issues.map((issue, idx) => {
                const checked = stockExceedDialog.adjustSet.has(issue.item.id);
                const prod = products.find((p) => p.id === issue.item.producto_id);
                const stockUnits = prod?.stock ?? 0;
                const presUnit = issue.item.unidades_por_presentacion || 1;
                const maxInPres = Math.floor(stockUnits / presUnit);
                return (
                <div
                  key={idx}
                  onClick={() => {
                    setStockExceedDialog((prev) => {
                      const next = new Set(prev.adjustSet);
                      if (next.has(issue.item.id)) next.delete(issue.item.id); else next.add(issue.item.id);
                      return { ...prev, adjustSet: next };
                    });
                  }}
                  className={`rounded-lg border p-3 cursor-pointer transition-all ${
                    checked ? "bg-amber-50/50 border-amber-400" : "bg-gray-50 border-gray-200 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      checked ? "bg-amber-500 border-amber-500" : "border-gray-300 bg-white"
                    }`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{issue.item.description}</p>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>Facturando: <strong className="text-red-600">{issue.unidadesFacturadas} {issue.item.presentacion !== "Unidad" ? (issue.unidadesFacturadas === 1 ? issue.item.presentacion : issue.item.presentacion) : "Un."}</strong></span>
                        <span>Disponible: <strong className="text-amber-600">{issue.stockDisponible} {issue.item.presentacion !== "Unidad" ? (issue.stockDisponible === 1 ? issue.item.presentacion : issue.item.presentacion) : "Un."}</strong></span>
                      </div>
                      {checked && maxInPres > 0 && (
                        <p className="text-[11px] text-emerald-600 mt-1">Se ajustará a {maxInPres} {issue.item.presentacion !== "Unidad" ? (maxInPres === 1 ? issue.item.presentacion : issue.item.presentacion) : "Un."}</p>
                      )}
                      {checked && maxInPres <= 0 && stockUnits > 0 && presUnit > 1 && (
                        <p className="text-[11px] text-emerald-600 mt-1">Se pasará a {stockUnits} unidades sueltas</p>
                      )}
                      {checked && maxInPres <= 0 && stockUnits <= 0 && (
                        <p className="text-[11px] text-red-500 mt-1">Se eliminará del carrito (sin stock)</p>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground">Los productos no seleccionados se facturarán con la cantidad actual.</p>

            <div className="flex flex-col gap-2 pt-1">
              {stockExceedDialog.adjustSet.size > 0 && (
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleStockAdjust}
                >
                  {stockExceedDialog.adjustSet.size === stockExceedDialog.issues.length
                    ? "Ajustar todos a disponible"
                    : `Ajustar seleccionados (${stockExceedDialog.adjustSet.size})`}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={handleStockContinue}
              >
                Facturar igual (ignorar stock)
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setStockExceedDialog({ open: false, issues: [], adjustSet: new Set() })}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Barcode found toast */}
      {scanFound && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 bg-emerald-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            <Check className="w-4 h-4 shrink-0" />
            {scanFound}
          </div>
        </div>
      )}

      {/* Barcode not found toast */}
      {scanNotFound && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 bg-amber-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Código no encontrado: <span className="font-mono">{scanNotFound}</span>
          </div>
        </div>
      )}

      {/* Stock warning toast */}
      {stockToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 bg-amber-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {stockToast}
          </div>
        </div>
      )}

      {/* Reprint Last Receipt Dialog */}
      <Dialog open={reprintOpen} onOpenChange={setReprintOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Reimprimir — {lastPrintData?.tipoComprobante} N° {lastPrintData?.numero}
            </DialogTitle>
          </DialogHeader>
          {lastPrintData && (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden bg-white" style={{ maxHeight: "55vh", overflow: "auto" }}>
                <div ref={reprintRef} style={{ transform: "scale(0.52)", transformOrigin: "top left", width: "192%", pointerEvents: "none" }}>
                  <ReceiptPrintView
                    sale={{
                      numero: lastPrintData.numero,
                      total: lastPrintData.total,
                      subtotal: lastPrintData.subtotal,
                      descuento: lastPrintData.descuento,
                      recargo: lastPrintData.recargo,
                      transferSurcharge: lastPrintData.transferSurcharge,
                      tipoComprobante: lastPrintData.tipoComprobante,
                      formaPago: lastPrintData.formaPago,
                      moneda: lastPrintData.moneda,
                      cliente: lastPrintData.cliente,
                      clienteDireccion: lastPrintData.clienteDireccion,
                      clienteTelefono: lastPrintData.clienteTelefono,
                      clienteCondicionIva: lastPrintData.clienteCondicionIva,
                      vendedor: lastPrintData.vendedor,
                      items: lastPrintData.items.map((i) => ({
                        id: i.id,
                        producto_id: i.producto_id,
                        code: i.code,
                        description: i.description,
                        qty: i.qty,
                        unit: i.unit,
                        price: i.price,
                        discount: i.discount,
                        subtotal: i.subtotal,
                        presentacion: i.presentacion,
                        unidades_por_presentacion: i.unidades_por_presentacion,
                        stock: i.stock,
                        es_combo: i.es_combo,
                        comboItems: i.comboItems,
                      })),
                      fecha: lastPrintData.fecha,
                      saldoAnterior: lastPrintData.saldoAnterior,
                      saldoNuevo: lastPrintData.saldoNuevo,
                    }}
                    config={receiptConfig}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReprintOpen(false)}>Cerrar</Button>
                <Button onClick={() => {
                  if (!reprintRef.current) return;
                  const html = reprintRef.current.innerHTML;
                  const win = window.open("", "_blank", "width=800,height=600");
                  if (!win) return;
                  win.document.write(`<!DOCTYPE html><html><head><title>Comprobante ${lastPrintData.numero}</title><style>@page{size:A4;margin:0}body{margin:0;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${html}</body></html>`);
                  win.document.close();
                  win.onload = () => { win.print(); win.close(); };
                }}>
                  <Printer className="w-4 h-4 mr-2" />Imprimir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirmDialog.title}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmDialog.message}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Cancelar</Button>
            <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })); }}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
