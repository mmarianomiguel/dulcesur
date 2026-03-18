"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
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
} from "lucide-react";

// ---------- types ----------
interface Presentacion {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
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
  tipo: string;
  cbu_cvu: string;
  alias: string;
}

interface ComboItemRef {
  producto_id: string;
  cantidad: number;
  nombre: string;
  stock: number;
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
  stock: number;
  es_combo?: boolean;
  comboItems?: ComboItemRef[];
}

// ---------- helpers ----------
function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------- Receipt config ----------
interface ReceiptConfig {
  logoUrl: string;
  empresaNombre: string;
  empresaWeb: string;
  empresaDomicilio: string;
  empresaTelefono: string;
  empresaCuit: string;
  empresaIva: string;
  empresaInicioAct: string;
  empresaIngrBrutos: string;
  footerTexto: string;
  fontSize: number;  // base font size in px
  logoHeight: number; // logo height in px
  mostrarLogo: boolean;
  mostrarVendedor: boolean;
  mostrarDescuento: boolean;
}

const defaultReceiptConfig: ReceiptConfig = {
  logoUrl: "https://www.dulcesur.com/assets/logotipo.png",
  empresaNombre: "DULCE SUR",
  empresaWeb: "www.dulcesur.com",
  empresaDomicilio: "Francisco Canaro 4012",
  empresaTelefono: "116299-1571",
  empresaCuit: "20443387898",
  empresaIva: "Monotributista Social",
  empresaInicioAct: "15/2/2021",
  empresaIngrBrutos: "20443387898",
  footerTexto: "Gracias por su compra",
  fontSize: 12,
  logoHeight: 60,
  mostrarLogo: true,
  mostrarVendedor: true,
  mostrarDescuento: true,
};

function ReceiptPrintView({
  sale,
  config,
}: {
  sale: {
    numero: string; total: number; subtotal: number; descuento: number; recargo: number;
    transferSurcharge: number; tipoComprobante: string; formaPago: string;
    cliente: string; vendedor: string; items: LineItem[]; fecha: string;
    saldoAnterior: number; saldoNuevo: number;
  };
  config: ReceiptConfig;
}) {
  const fs = config.fontSize;
  const fmtCur = (v: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

  return (
    <div
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm 10mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: `${fs}px`,
        color: "#000",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", borderBottom: "2px solid #000", paddingBottom: "6px", marginBottom: "4px" }}>
        {/* Left: Logo & company */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            {config.mostrarLogo && config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt="Logo" style={{ height: `${config.logoHeight}px` }} />
            )}
            {!config.mostrarLogo && (
              <div style={{ fontSize: `${fs + 8}px`, fontWeight: "bold" }}>{config.empresaNombre}</div>
            )}
          </div>
          <div style={{ fontSize: `${fs - 2}px`, lineHeight: "1.5" }}>
            {config.empresaWeb && <div style={{ fontWeight: "bold" }}>{config.empresaWeb}</div>}
            <div>{config.empresaDomicilio} | Tel: {config.empresaTelefono}</div>
          </div>
        </div>

        {/* Center: X */}
        <div style={{ width: "55px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", borderLeft: "2px solid #000", borderRight: "2px solid #000", padding: "0 8px" }}>
          <div style={{ fontSize: "30px", fontWeight: "bold", lineHeight: 1 }}>X</div>
          <div style={{ fontSize: "8px", textAlign: "center", lineHeight: "1.2", marginTop: "2px" }}>Documento no válido como factura</div>
        </div>

        {/* Right: Number & fiscal data */}
        <div style={{ flex: 1, paddingLeft: "10px" }}>
          <div style={{ fontSize: `${fs + 4}px`, fontWeight: "bold", marginBottom: "4px" }}>
            {sale.tipoComprobante}
          </div>
          <div style={{ fontSize: `${fs + 2}px`, fontWeight: "bold", marginBottom: "4px" }}>
            N° {sale.numero}
          </div>
          <div style={{ fontSize: `${fs - 2}px`, lineHeight: "1.6" }}>
            <div>Fecha: {sale.fecha}</div>
            <div>CUIT: {config.empresaCuit}</div>
            <div>Ing.Brutos: {config.empresaIngrBrutos}</div>
            <div>Cond.IVA: {config.empresaIva}</div>
            <div>Inicio de Actividad: {config.empresaInicioAct}</div>
          </div>
        </div>
      </div>

      {/* ── Client info ── */}
      <div style={{ border: "1px solid #ccc", padding: "4px 6px", marginBottom: "4px", fontSize: `${fs - 1}px`, lineHeight: "1.7" }}>
        <div style={{ display: "flex", gap: "20px" }}>
          <div style={{ flex: 1 }}><span>Cliente: {sale.cliente}</span></div>
          <div><span>Forma de pago: {sale.formaPago}</span></div>
        </div>
        {config.mostrarVendedor && sale.vendedor && (
          <div><span>Vendedor: {sale.vendedor}</span></div>
        )}
      </div>

      {/* ── Items table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: `${fs - 1}px`, flex: 1 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #000", borderTop: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Cant.</th>
            <th style={{ textAlign: "left", padding: "4px 4px", fontWeight: "bold" }}>Producto</th>
            <th style={{ textAlign: "center", padding: "4px 4px", fontWeight: "bold" }}>U/Med</th>
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Precio Un.</th>
            {config.mostrarDescuento && (
              <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Desc.%</th>
            )}
            <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: "bold" }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, i) => {
            const totalComboUnits = item.es_combo && item.comboItems && item.comboItems.length > 0
              ? item.comboItems.reduce((s, ci) => s + ci.cantidad, 0)
              : 0;
            const precioUnitario = item.es_combo && totalComboUnits > 0
              ? item.price / totalComboUnits
              : item.unit === "Mt" && item.unidades_por_presentacion < 1
                ? item.price / item.unidades_por_presentacion
                : item.price;
            const cleanDescription = item.description
              .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
              .replace(/\s*\(Unidad\)$/, "");
            return (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "3px 4px", textAlign: "left" }}>{item.unit === "Mt" && item.unidades_por_presentacion < 1 ? item.qty * item.unidades_por_presentacion : item.qty}</td>
                <td style={{ padding: "3px 4px", textAlign: "left" }}>
                  {item.es_combo && (
                    <span style={{ fontSize: `${fs - 4}px`, fontWeight: "bold", background: "#000", color: "#fff", padding: "0px 2px", borderRadius: "2px", marginRight: "3px", letterSpacing: "0.5px" }}>COMBO</span>
                  )}
                  {cleanDescription}
                  {item.es_combo && item.comboItems && item.comboItems.length > 0 && (
                    <div style={{ fontSize: `${fs - 4}px`, color: "#777", marginTop: "0px", lineHeight: "1.1" }}>
                      {item.comboItems.map((ci) => `${ci.nombre} x${ci.cantidad}`).join(" · ")}
                    </div>
                  )}
                </td>
                <td style={{ padding: "3px 4px", textAlign: "center" }}>
                  {item.es_combo && totalComboUnits > 0 ? `x${totalComboUnits} un` : item.unit || "Un"}
                </td>
                <td style={{ padding: "3px 4px", textAlign: "right" }}>{fmtCur(precioUnitario)}</td>
                {config.mostrarDescuento && (
                  <td style={{ padding: "3px 4px", textAlign: "right" }}>{item.discount || 0}</td>
                )}
                <td style={{ padding: "3px 4px", textAlign: "right" }}>{fmtCur(item.subtotal)}</td>
              </tr>
            );
          })}
          {/* Empty rows to fill space */}
          {sale.items.length < 20 &&
            Array.from({ length: 20 - sale.items.length }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td style={{ padding: "3px 4px" }}>&nbsp;</td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                <td style={{ padding: "3px 4px" }}></td>
                {config.mostrarDescuento && <td style={{ padding: "3px 4px" }}></td>}
                <td style={{ padding: "3px 4px" }}></td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* ── Footer totals ── */}
      <div style={{ borderTop: "2px solid #000", marginTop: "auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 4px", fontSize: `${fs}px`, gap: "30px" }}>
          <div>
            <span>Subtotal: </span>
            <span style={{ fontWeight: "bold" }}>{fmtCur(sale.subtotal)}</span>
          </div>
          {sale.descuento > 0 && (
            <div>
              <span>Descuento: </span>
              <span style={{ fontWeight: "bold" }}>-{fmtCur(sale.descuento)}</span>
            </div>
          )}
          {sale.recargo > 0 && (
            <div>
              <span>Recargo: </span>
              <span style={{ fontWeight: "bold" }}>+{fmtCur(sale.recargo)}</span>
            </div>
          )}
          {sale.transferSurcharge > 0 && (
            <div>
              <span>Rec. Transferencia: </span>
              <span style={{ fontWeight: "bold" }}>+{fmtCur(sale.transferSurcharge)}</span>
            </div>
          )}
        </div>
        <div style={{ borderTop: "2px solid #000", display: "flex", justifyContent: "flex-end", padding: "8px 4px" }}>
          <div style={{ fontSize: `${fs + 6}px`, fontWeight: "bold" }}>
            TOTAL: {fmtCur(sale.total)}
          </div>
        </div>
        {/* Saldo info for Cuenta Corriente */}
        {(sale.formaPago === "Cuenta Corriente" || (sale.formaPago === "Mixto" && sale.saldoNuevo !== sale.saldoAnterior)) && (
          <div style={{ borderTop: "1px solid #ccc", padding: "6px 4px", fontSize: `${fs - 1}px` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span>Saldo anterior:</span>
              <span>{sale.saldoAnterior < 0 ? `${fmtCur(Math.abs(sale.saldoAnterior))} (a favor)` : fmtCur(sale.saldoAnterior)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              <span>Saldo actual:</span>
              <span style={{ color: sale.saldoNuevo < 0 ? "#059669" : sale.saldoNuevo > 0 ? "#ea580c" : "#000" }}>
                {sale.saldoNuevo < 0 ? `${fmtCur(Math.abs(sale.saldoNuevo))} (a favor)` : fmtCur(sale.saldoNuevo)}
              </span>
            </div>
          </div>
        )}
        <div style={{ textAlign: "center", padding: "8px 0", fontSize: `${fs - 2}px`, borderTop: "1px solid #ccc" }}>
          <div>{config.footerTexto}</div>
          <div style={{ marginTop: "2px" }}>{sale.items.length} artículo{sale.items.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- component ----------
export default function VentasPage() {
  // --- data ---
  const [products, setProducts] = useState<Producto[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [sellers, setSellers] = useState<Usuario[]>([]);
  const [comboItemsMap, setComboItemsMap] = useState<Record<string, ComboItemRef[]>>({});

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
  const [despacho, setDespacho] = useState("Retira en local");
  const [saving, setSaving] = useState(false);

  // transferencia surcharge
  const [porcentajeTransferencia, setPorcentajeTransferencia] = useState(2);
  const [configTransfOpen, setConfigTransfOpen] = useState(false);
  const [tempPorcentaje, setTempPorcentaje] = useState(2);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");

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
  const [clientAddresses, setClientAddresses] = useState<ClienteDireccion[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState({ direccion: "", ciudad: "", provincia: "", codigo_postal: "", telefono: "" });
  const [savingAddress, setSavingAddress] = useState(false);

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
    cliente: string;
    vendedor: string;
    items: LineItem[];
    fecha: string;
    saldoAnterior: number;
    saldoNuevo: number;
    pdfUrl: string | null;
  }>({ open: false, numero: "", total: 0, subtotal: 0, descuento: 0, recargo: 0, transferSurcharge: 0, tipoComprobante: "", formaPago: "", cliente: "", vendedor: "", items: [], fecha: "", saldoAnterior: 0, saldoNuevo: 0, pdfUrl: null });
  const [errorModal, setErrorModal] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [stockExceedDialog, setStockExceedDialog] = useState<{ open: boolean; issues: { item: LineItem; stockDisponible: number; unidadesFacturadas: number }[]; adjustSet: Set<string> }>({ open: false, issues: [], adjustSet: new Set() });
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(defaultReceiptConfig);
  const receiptRef = useRef<HTMLDivElement>(null);

  // out of stock confirmation
  const [stockWarning, setStockWarning] = useState<{ open: boolean; product: Producto | null; presentacion?: Presentacion }>({ open: false, product: null });

  // create client from POS
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({ nombre: "", email: "", telefono: "", cuit: "", direccion: "" });
  const [creatingClient, setCreatingClient] = useState(false);

  // presentaciones
  const [presentacionesMap, setPresentacionesMap] = useState<Record<string, Presentacion[]>>({});

  // section refs for keyboard navigation
  const clientSectionRef = useRef<HTMLButtonElement>(null);
  const cartSectionRef = useRef<HTMLDivElement>(null);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const sectionRefs = [clientSectionRef, cartSectionRef, paymentSectionRef];
  const [focusedSection, setFocusedSection] = useState(0);

  // selected cart item for arrow key navigation
  const [selectedItemIdx, setSelectedItemIdx] = useState(-1);
  const cartListRef = useRef<HTMLDivElement>(null);

  // barcode scanner
  const barcodeBuffer = useRef("");
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const fetchData = useCallback(async () => {
    const [{ data: prods }, { data: cls }, { data: sls }, { data: listas }] = await Promise.all([
      supabase.from("productos").select("*").eq("activo", true).order("nombre"),
      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
      supabase.from("usuarios").select("*").eq("activo", true),
      supabase.from("listas_precios").select("id, nombre, porcentaje_ajuste, es_default").eq("activa", true).order("nombre"),
    ]);
    setProducts(prods || []);
    setClients(cls || []);
    setSellers(sls || []);
    setListasPrecio((listas || []) as any[]);
    const defaultList = (listas || []).find((l: any) => l.es_default);
    if (defaultList) setListaPrecioId((defaultList as any).id);
    if (sls && sls.length > 0) setVendedorId(sls[0].id);

    // Pre-load combo items
    const { data: allComboItems } = await supabase
      .from("combo_items")
      .select("combo_id, cantidad, productos!combo_items_producto_id_fkey(id, nombre, stock)");
    if (allComboItems) {
      const cmap: Record<string, ComboItemRef[]> = {};
      for (const ci of allComboItems as any[]) {
        const p = ci.productos;
        if (!p) continue;
        if (!cmap[ci.combo_id]) cmap[ci.combo_id] = [];
        cmap[ci.combo_id].push({ producto_id: p.id, cantidad: ci.cantidad, nombre: p.nombre, stock: p.stock });
      }
      setComboItemsMap(cmap);
    }

    // Pre-load all presentaciones for search by code
    const { data: allPres } = await supabase.from("presentaciones").select("*");
    if (allPres) {
      const map: Record<string, Presentacion[]> = {};
      for (const raw of allPres) {
        const pr = { ...raw, codigo: raw.sku || "" } as Presentacion;
        if (!map[pr.producto_id]) map[pr.producto_id] = [];
        map[pr.producto_id].push(pr);
      }
      setPresentacionesMap(map);
    }

    // Load receipt config from localStorage + empresa data
    try {
      const stored = localStorage.getItem("receipt_config");
      if (stored) {
        setReceiptConfig((prev) => ({ ...prev, ...JSON.parse(stored) }));
      }
    } catch {}
    const { data: emp } = await supabase.from("empresa").select("*").limit(1).single();
    if (emp) {
      setReceiptConfig((prev) => ({
        ...prev,
        empresaNombre: emp.nombre || prev.empresaNombre,
        empresaDomicilio: emp.domicilio || prev.empresaDomicilio,
        empresaTelefono: emp.telefono || prev.empresaTelefono,
        empresaCuit: emp.cuit || prev.empresaCuit,
        empresaIva: emp.situacion_iva || prev.empresaIva,
      }));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load bank accounts from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cuentas_bancarias");
      if (stored) setCuentasBancarias(JSON.parse(stored));
    } catch {}
  }, []);

  // ---------- derived ----------
  const selectedClient = clients.find((c) => c.id === clientId);

  const filteredProducts = products.filter(
    (p) =>
      p.nombre.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.codigo.toLowerCase().includes(productSearch.toLowerCase()) ||
      (presentacionesMap[p.id] || []).some((pr) =>
        (pr.codigo || "").toLowerCase().includes(productSearch.toLowerCase())
      )
  );

  const filteredClients = clients.filter(
    (c) =>
      c.nombre.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.telefono || "").includes(clientSearch)
  );

  const subtotal = items.reduce((acc, i) => acc + i.subtotal, 0);
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

  const mixtoSum = mixtoEfectivo + mixtoTransferencia + mixtoCuentaCorriente;
  const mixtoTotalWithSurcharge = mixtoSum + (mixtoTransferencia * (porcentajeTransferencia / 100));
  const mixtoRemaining = formaPago === "Mixto" ? baseTotal - mixtoSum : 0;
  const mixtoValid = formaPago !== "Mixto" || Math.abs(mixtoRemaining) < 0.01;

  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const cashChange = cashReceivedNum - total;

  // ---------- presentaciones ----------
  const fetchPresentaciones = async (productoId: string) => {
    if (presentacionesMap[productoId]) return presentacionesMap[productoId];
    const { data } = await supabase.from("presentaciones").select("*").eq("producto_id", productoId);
    const pres = (data || []).map((raw: any) => ({ ...raw, codigo: raw.sku || "" })) as Presentacion[];
    setPresentacionesMap((prev) => ({ ...prev, [productoId]: pres }));
    return pres;
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

    const existingIdx = items.findIndex((i) => i.producto_id === product.id && i.presentacion === presName);
    if (existingIdx >= 0) {
      updateQty(items[existingIdx].id, items[existingIdx].qty + 1, presName === "Unidad");
      setSelectedItemIdx(existingIdx);
    } else {
      const newItems = [
        ...items,
        {
          id: crypto.randomUUID(),
          producto_id: product.id,
          code: presentacion?.codigo || product.codigo,
          description: presName === "Unidad" ? product.nombre.replace(/\s*[-–]\s*Unidad$/i, "") : `${product.nombre.replace(/\s*[-–]\s*Unidad$/i, "")} (${presName})`,
          qty: 1,
          unit: product.unidad_medida,
          price: presPrice,
          discount: 0,
          subtotal: presPrice,
          presentacion: presName,
          unidades_por_presentacion: presUnits,
          stock: comboStock,
          es_combo: isCombo,
          comboItems: components,
        },
      ];
      setItems(newItems);
      setSelectedItemIdx(newItems.length - 1);
    }
    setSearchOpen(false);
    setProductSearch("");
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const newItems = prev.filter((i) => i.id !== id);
      if (selectedItemIdx >= newItems.length) setSelectedItemIdx(Math.max(0, newItems.length - 1));
      return newItems;
    });
  };

  const updateQty = (id: string, qty: number, checkSwitch = false) => {
    // Allow qty 0 to trigger box→unit downgrade
    setItems((prev) => {
      // Check if this is a box downgrade scenario
      const target = prev.find((i) => i.id === id);
      if (qty < 0.5 && !(target && target.presentacion !== "Unidad" && target.unidades_por_presentacion > 1 && qty < 1)) return prev;
      return prev.map((i) => {
        if (i.id !== id) return i;

        // Downgrade: box qty goes below 1 → convert to units
        if (qty < 1 && i.presentacion !== "Unidad" && i.unidades_por_presentacion > 1) {
          const pres = presentacionesMap[i.producto_id] || [];
          const unitPres = pres.find((p) => Number(p.cantidad) === 1);
          if (unitPres) {
            const prod = products.find((p) => p.id === i.producto_id);
            const newQty = i.unidades_por_presentacion - 1;
            return {
              ...i,
              qty: newQty,
              price: unitPres.precio,
              code: unitPres.codigo || i.code,
              description: prod?.nombre || i.description.replace(/\s*\(.*\)$/, ""),
              presentacion: "Unidad",
              unidades_por_presentacion: 1,
              subtotal: unitPres.precio * newQty * (1 - i.discount / 100),
            };
          }
        }

        // Check auto-switch: units → box
        if (checkSwitch && i.producto_id && i.presentacion === "Unidad") {
          const pres = presentacionesMap[i.producto_id] || [];
          const match = pres.find((p) => Number(p.cantidad) === qty && p.nombre !== "Unidad");
          if (match) {
            const prod = products.find((p) => p.id === i.producto_id);
            return {
              ...i,
              qty: 1,
              price: match.precio,
              code: match.codigo || i.code,
              description: prod ? `${prod.nombre} (${match.nombre})` : i.description,
              presentacion: match.nombre,
              unidades_por_presentacion: Number(match.cantidad),
              subtotal: match.precio * (1 - i.discount / 100),
            };
          }
        }
        return { ...i, qty, subtotal: i.price * qty * (1 - i.discount / 100) };
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

      // Find the last active field that is NOT the changed field
      const others = active.filter((f) => f !== changedField);
      if (others.length === 0) return;

      if (others.length === 1) {
        // Two methods: auto-fill the other
        const otherKey = others[0];
        const remaining = baseTotal - changedValue;
        if (otherKey === "efectivo") setMixtoEfectivo(Math.max(0, remaining));
        if (otherKey === "transferencia") setMixtoTransferencia(Math.max(0, remaining));
        if (otherKey === "corriente") setMixtoCuentaCorriente(Math.max(0, remaining));
      } else {
        // Three methods: auto-fill the last one
        const lastOther = others[others.length - 1];
        const sumOthers = others.slice(0, -1).reduce((s, k) => s + values[k], 0);
        const remaining = baseTotal - changedValue - sumOthers;
        if (lastOther === "efectivo") setMixtoEfectivo(Math.max(0, remaining));
        if (lastOther === "transferencia") setMixtoTransferencia(Math.max(0, remaining));
        if (lastOther === "corriente") setMixtoCuentaCorriente(Math.max(0, remaining));
      }
    },
    [baseTotal, mixtoEfectivo, mixtoTransferencia, mixtoCuentaCorriente, mixtoToggleEfectivo, mixtoToggleTransferencia, mixtoToggleCuentaCorriente]
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

  useEffect(() => {
    if (!scannerEnabled) return;
    let lastKeyTime = 0;

    const findAndAdd = (code: string) => {
      // Search by code in products
      const product = products.find((p) => p.codigo === code);
      if (product) {
        scannerAddRef.current(product);
        return true;
      }
      // Try presentaciones by codigo
      for (const [prodId, presList] of Object.entries(presentacionesMap)) {
        const match = presList.find((pr) => pr.codigo === code);
        if (match) {
          const prod = products.find((p) => p.id === prodId);
          if (prod) { scannerAddRef.current(prod, match); return true; }
        }
      }
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Enter" && barcodeBuffer.current.length >= 3) {
        const code = barcodeBuffer.current;
        barcodeBuffer.current = "";
        const found = findAndAdd(code);
        if (found && inInput) {
          e.preventDefault();
          // Clear whatever the scanner typed into the input
          const el = e.target as HTMLInputElement;
          if (el.value) el.value = "";
        }
        return;
      }

      // Only buffer printable chars typed rapidly (scanner speed)
      if (e.key.length === 1) {
        const timeSinceLast = now - lastKeyTime;
        lastKeyTime = now;
        // Scanner types fast (< 50ms between keys). Manual typing is slower.
        if (barcodeBuffer.current.length === 0 || timeSinceLast < 50) {
          barcodeBuffer.current += e.key;
        } else {
          barcodeBuffer.current = e.key;
        }
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = "";
        }, 100);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
    setFormaPago("Efectivo");
    setDescuento(0);
    setRecargo(0);
    setMixtoEfectivo(0);
    setMixtoTransferencia(0);
    setMixtoCuentaCorriente(0);
    setMixtoToggleEfectivo(true);
    setMixtoToggleTransferencia(true);
    setMixtoToggleCuentaCorriente(false);
    setDespacho("Retira en local");
    setDeliveryMethod("pickup");
    setSelectedAddressId("");
    setClientAddresses([]);
    setSelectedItemIdx(-1);
    setCuentaBancariaId("");
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
        // If no comboItems loaded, skip stock check for this combo (allow sale)
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
    if (formaPago === "Efectivo") {
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
    if (!newClientData.nombre.trim()) return;
    setCreatingClient(true);
    try {
      const { data } = await supabase
        .from("clientes")
        .insert({
          nombre: newClientData.nombre.trim(),
          email: newClientData.email.trim() || null,
          telefono: newClientData.telefono.trim() || null,
          cuit: newClientData.cuit.trim() || null,
          direccion: newClientData.direccion.trim() || null,
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
        setNewClientData({ nombre: "", email: "", telefono: "", cuit: "", direccion: "" });
      }
    } finally {
      setCreatingClient(false);
    }
  };

  // ---------- sale finalization (all business logic preserved) ----------
  const handleCerrarComprobante = async () => {
    if (items.length === 0) return;
    if (!mixtoValid) {
      setErrorModal({ open: true, message: "Los montos del pago mixto no suman el total." });
      return;
    }
    setSaving(true);
    setCashDialogOpen(false);

    try {
      const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "venta" });
      const numero = numData || "00001-00000000";

      const { data: venta } = await supabase
        .from("ventas")
        .insert({
          numero,
          tipo_comprobante: tipoComprobante,
          fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
          cliente_id: clientId || null,
          vendedor_id: vendedorId || null,
          forma_pago: formaPago,
          subtotal,
          descuento_porcentaje: descuento,
          recargo_porcentaje: recargo,
          total,
          estado: "cerrada",
          observacion: despacho,
          lista_precio_id: listaPrecioId || null,
        })
        .select()
        .single();

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
        }));
        await supabase.from("venta_items").insert(ventaItems);

        // Update stock + log movements
        for (const item of items) {
          if (item.es_combo && item.comboItems && item.comboItems.length > 0) {
            // Deduct each component individually
            for (const ci of item.comboItems) {
              const compProd = products.find((p) => p.id === ci.producto_id);
              if (!compProd) continue;
              const unitsToDeduct = item.qty * ci.cantidad;
              const newStock = compProd.stock - unitsToDeduct;
              await supabase.from("productos").update({ stock: newStock }).eq("id", ci.producto_id);
              await supabase.from("stock_movimientos").insert({
                producto_id: ci.producto_id,
                tipo: "venta",
                cantidad_antes: compProd.stock,
                cantidad_despues: newStock,
                cantidad: unitsToDeduct,
                referencia: `Venta #${numero}`,
                descripcion: `Venta combo ${item.description} - ${ci.nombre}`,
                usuario: "Admin Sistema",
                orden_id: venta.id,
              });
              // Update local products cache so subsequent items see updated stock
              compProd.stock = newStock;
            }
            continue;
          }
          const prod = products.find((p) => p.id === item.producto_id);
          if (prod) {
            const unitsToDeduct = item.qty * (item.unidades_por_presentacion || 1);
            const newStock = prod.stock - unitsToDeduct;
            await supabase
              .from("productos")
              .update({ stock: newStock })
              .eq("id", item.producto_id);
            await supabase.from("stock_movimientos").insert({
              producto_id: item.producto_id,
              tipo: "venta",
              cantidad_antes: prod.stock,
              cantidad_despues: newStock,
              cantidad: unitsToDeduct,
              referencia: `Venta #${numero}`,
              descripcion: `Venta - ${item.description}`,
              usuario: "Admin Sistema",
              orden_id: venta.id,
            });
          }
        }

        const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        const hora = new Date().toTimeString().split(" ")[0];

        if (formaPago === "Cuenta Corriente") {
          if (clientId) {
            const saldoActual = selectedClient?.saldo || 0;
            const newSaldo = saldoActual + total;
            const saldoAFavorAplicado = saldoActual < 0 ? Math.min(Math.abs(saldoActual), total) : 0;
            const deudaReal = total - saldoAFavorAplicado;
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
            await supabase.from("clientes").update({ saldo: newSaldo }).eq("id", clientId);
          }
        } else if (formaPago === "Mixto") {
          const mixtoEntries: { metodo: string; monto: number }[] = [];
          if (mixtoEfectivo > 0) mixtoEntries.push({ metodo: "Efectivo", monto: mixtoEfectivo });
          if (mixtoTransferencia > 0) {
            const montoConRecargo = mixtoTransferencia + (mixtoTransferencia * (porcentajeTransferencia / 100));
            mixtoEntries.push({ metodo: "Transferencia", monto: montoConRecargo });
          }
          if (mixtoCuentaCorriente > 0) mixtoEntries.push({ metodo: "Cuenta Corriente", monto: mixtoCuentaCorriente });

          for (const entry of mixtoEntries) {
            if (entry.metodo === "Cuenta Corriente") {
              if (clientId) {
                const saldoActualMixto = selectedClient?.saldo || 0;
                const newSaldoMixto = saldoActualMixto + entry.monto;
                const favorAplicadoMixto = saldoActualMixto < 0 ? Math.min(Math.abs(saldoActualMixto), entry.monto) : 0;
                await supabase.from("cuenta_corriente").insert({
                  cliente_id: clientId,
                  fecha: hoy,
                  comprobante: `Venta #${numero}`,
                  descripcion: favorAplicadoMixto > 0
                    ? `Venta - Cta Cte parcial (saldo a favor aplicado: ${formatCurrency(favorAplicadoMixto)})`
                    : `Venta - Cuenta Corriente (parcial)`,
                  debe: entry.monto,
                  haber: favorAplicadoMixto,
                  saldo: newSaldoMixto,
                  forma_pago: "Cuenta Corriente",
                  venta_id: venta.id,
                });
                await supabase.from("clientes").update({ saldo: newSaldoMixto }).eq("id", clientId);
              }
            } else {
              const mixCuenta = entry.metodo === "Transferencia" && cuentaBancariaId
                ? cuentasBancarias.find((c) => c.id === cuentaBancariaId)
                : null;
              await supabase.from("caja_movimientos").insert({
                fecha: hoy,
                hora,
                tipo: "ingreso",
                descripcion: `Venta #${numero} (${entry.metodo})${mixCuenta ? ` → ${mixCuenta.nombre}` : ""}`,
                metodo_pago: entry.metodo,
                monto: entry.monto,
                referencia_id: venta.id,
                referencia_tipo: "venta",
                ...(mixCuenta ? { cuenta_bancaria: mixCuenta.nombre } : {}),
              });
            }
          }
        } else {
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

        // Capture sale data before reset
        const saldoAnterior = selectedClient?.saldo || 0;
        const saldoNuevo = formaPago === "Cuenta Corriente"
          ? saldoAnterior + total
          : formaPago === "Mixto" && mixtoCuentaCorriente > 0
          ? saldoAnterior + mixtoCuentaCorriente
          : saldoAnterior;
        const saleData = {
          numero,
          total,
          subtotal,
          descuento: descuentoAmount,
          recargo: recargoAmount,
          transferSurcharge,
          tipoComprobante,
          formaPago,
          cliente: selectedClient?.nombre || "Consumidor Final",
          vendedor: sellers.find((s) => s.id === vendedorId)?.nombre || "",
          items: [...items],
          fecha: new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }),
          saldoAnterior,
          saldoNuevo,
        };

        resetSale();
        fetchData();
        setSuccessModal({ open: true, ...saleData, pdfUrl: null });
      }
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
      }
    }
  };

  // ---------- RENDER ----------
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* Main two-column layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:gap-3 p-2 lg:p-3 overflow-hidden">
        {/* LEFT COLUMN */}
        <div className="flex-1 flex flex-col gap-2 lg:gap-3 min-w-0 overflow-hidden">
          {/* Client selector */}
          <button
            ref={clientSectionRef}
            onClick={() => {
              setClientSearch("");
              setClientHighlight(0);
              setClientDialogOpen(true);
            }}
            className="flex items-center gap-2 lg:gap-3 w-full rounded-xl border bg-card px-3 lg:px-4 py-2 lg:py-3 text-left hover:bg-accent transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className={selectedClient ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
              {selectedClient ? `${selectedClient.nombre}` : "Consumidor Final"}
            </span>
            {selectedClient && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setClientId("");
                }}
                className="ml-auto p-1 rounded hover:bg-muted cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </span>
            )}
          </button>

          {/* Dispatch method toggle */}
          <button
            onClick={() => {
              if (clientId) fetchClientAddresses(clientId);
              setDeliveryDialogOpen(true);
            }}
            className="flex items-center gap-2 w-full rounded-xl border bg-card px-3 py-2 text-left hover:bg-accent transition-colors"
          >
            {deliveryMethod === "pickup" ? (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Store className="w-4 h-4 text-blue-600" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Truck className="w-4 h-4 text-emerald-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">
                {deliveryMethod === "pickup" ? "Retiro en Tienda" : "Envío a domicilio"}
              </p>
              {deliveryMethod === "delivery" && selectedAddressId && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {clientAddresses.find((a) => a.id === selectedAddressId)?.direccion || ""}
                </p>
              )}
            </div>
            <span className="text-[11px] text-primary font-medium">Cambiar</span>
          </button>

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
                          <p className="text-xs lg:text-sm font-medium truncate">{item.description}</p>
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
                            const match = pres.find((p) => Number(p.cantidad) === item.qty && p.nombre !== "Unidad");
                            return match ? (
                              <Badge variant="outline" className="mt-1 text-[10px] border-amber-300 text-amber-600 bg-amber-50">
                                = 1 {match.nombre}
                              </Badge>
                            ) : null;
                          })()}
                        </div>
                        <div className="flex items-center gap-0.5 lg:gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 lg:h-7 lg:w-7"
                            onClick={(e) => { e.stopPropagation(); const step = item.presentacion === "Unidad" && item.unit === "Mt" ? 0.5 : 1; updateQty(item.id, item.qty - step, item.presentacion === "Unidad"); }}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="number"
                            value={item.qty}
                            onChange={(e) => updateQty(item.id, Number(e.target.value))}
                            onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && item.presentacion === "Unidad") updateQty(item.id, v, true); }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-10 lg:w-14 h-6 lg:h-7 text-center text-xs lg:text-sm"
                            min={item.presentacion === "Unidad" && item.unit === "Mt" ? 0.5 : 1}
                            step={item.presentacion === "Unidad" && item.unit === "Mt" ? 0.5 : 1}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 lg:h-7 lg:w-7"
                            onClick={(e) => { e.stopPropagation(); const step = item.presentacion === "Unidad" && item.unit === "Mt" ? 0.5 : 1; updateQty(item.id, item.qty + step, item.presentacion === "Unidad"); }}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-right w-16 lg:w-24 shrink-0">
                          <p className="text-xs lg:text-sm font-semibold">{formatCurrency(item.subtotal)}</p>
                          <p className="text-[10px] lg:text-xs text-muted-foreground">{formatCurrency(item.price)} c/u</p>
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
                            <span className="text-[10px] lg:text-xs">Stock disponible: {stockEnPres}{item.unidades_por_presentacion > 1 ? ` ${stockEnPres === 1 ? item.presentacion : item.presentacion.replace(/^Caja/, "Cajas")}` : " Un."}</span>
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
          {/* Price list selector */}
          {listasPrecio.length > 0 && (
            <Select value={listaPrecioId} onValueChange={(v) => setListaPrecioId(v ?? "")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Lista de precios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Precio base</SelectItem>
                {listasPrecio.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nombre} {l.porcentaje_ajuste !== 0 ? `(${l.porcentaje_ajuste > 0 ? "+" : ""}${l.porcentaje_ajuste}%)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Payment method grid */}
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
                <Select value={cuentaBancariaId} onValueChange={(v) => setCuentaBancariaId(v ?? "")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar cuenta destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentasBancarias.map((cb) => (
                      <SelectItem key={cb.id} value={cb.id}>
                        {cb.nombre} {cb.alias ? `(${cb.alias})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <div className="rounded-lg border px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Total a pagar</span>
                  <span className="text-lg font-bold text-emerald-600">{formatCurrency(baseTotal)}</span>
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
                      const selected = cuentasBancarias.find((cb) => cb.id === cuentaBancariaId);
                      return (
                        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                          <div className="text-xs">
                            <span className="font-medium">{selected ? selected.nombre : "Sin seleccionar"}</span>
                            {selected?.alias && <span className="text-muted-foreground ml-1">({selected.alias})</span>}
                          </div>
                          <Select value={cuentaBancariaId} onValueChange={(v) => setCuentaBancariaId(v ?? "")}>
                            <SelectTrigger className="h-7 w-auto text-xs border-0 bg-transparent px-2">
                              <span className="text-emerald-600 font-medium">Cambiar</span>
                            </SelectTrigger>
                            <SelectContent>
                              {cuentasBancarias.map((cb) => (
                                <SelectItem key={cb.id} value={cb.id}>
                                  {cb.nombre} {cb.alias ? `(${cb.alias})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Assigned indicator */}
                {mixtoActiveMethods.length >= 2 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className={mixtoSum >= baseTotal ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                      Asignado: {formatCurrency(mixtoSum)} / {formatCurrency(baseTotal)}
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
                                  const val = parseFloat(raw) || 0;
                                  setter(val);
                                  // Auto-calculate transfer as remainder
                                  if (mixtoToggleTransferencia) {
                                    const otherNonTransf = key === "efectivo"
                                      ? mixtoCuentaCorriente
                                      : mixtoEfectivo;
                                    setMixtoTransferencia(Math.max(0, baseTotal - val - otherNonTransf));
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
                    onChange={(e) => setDescuento(Number(e.target.value))}
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
                    onChange={(e) => setRecargo(Number(e.target.value))}
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
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5 mt-auto">
            <Button
              className="w-full h-10 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={initiateFinalize}
              disabled={items.length === 0 || saving || !mixtoValid}
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
        <DialogContent className="max-w-lg">
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
                const list = filteredProducts.slice(0, 20);
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
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filteredProducts.slice(0, 20).map((p, idx) => {
              const pres = presentacionesMap[p.id] || [];
              // Check if search matches a specific presentation code
              const matchedPres = productSearch.length >= 2
                ? pres.find((pr) => (pr.codigo || "").toLowerCase() === productSearch.toLowerCase())
                : undefined;
              const highlighted = idx === searchHighlight;
              return (
                <div key={p.id} className={`border rounded-lg overflow-hidden ${highlighted ? "ring-2 ring-primary border-primary" : ""}`}
                  ref={highlighted ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                >
                  <button
                    onClick={() => {
                      if (pres.length === 0) fetchPresentaciones(p.id);
                      if (matchedPres) {
                        tryAddItem(p, matchedPres);
                      } else {
                        tryAddItem(p);
                      }
                    }}
                    onMouseEnter={() => { fetchPresentaciones(p.id); setSearchHighlight(idx); }}
                    className={`w-full flex items-center justify-between p-3 transition-colors text-left ${highlighted ? "bg-muted" : "hover:bg-muted"}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {p.codigo}
                        {matchedPres && <span className="ml-2 text-primary font-semibold">→ {matchedPres.nombre}: {matchedPres.codigo}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(matchedPres ? matchedPres.precio : p.precio)}</p>
                      {(() => {
                        const isComboP = !!(p as any).es_combo;
                        const comboComponents = isComboP ? (comboItemsMap[p.id] || []) : [];
                        const effectiveStock = isComboP && comboComponents.length > 0
                          ? Math.min(...comboComponents.map((c) => Math.floor(c.stock / c.cantidad)))
                          : isComboP ? null : p.stock;
                        const displayStock = effectiveStock === null ? null :
                          matchedPres && Number(matchedPres.cantidad) > 1 && !isComboP
                            ? `${Math.floor((effectiveStock / Number(matchedPres.cantidad)) * 10) / 10} ${matchedPres.nombre.toLowerCase()}`
                            : effectiveStock;
                        return (
                          <p className={`text-xs font-mono ${(effectiveStock ?? 1) <= 0 ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                            {effectiveStock === null ? "Stock: cargando..." : `Stock: ${displayStock}`}
                          </p>
                        );
                      })()}
                    </div>
                  </button>
                  {pres.length > 0 && (
                    <div className="border-t bg-muted/30 px-3 py-1.5 flex gap-2 flex-wrap">
                      <button
                        onClick={() => tryAddItem(p)}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                          !matchedPres ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        Unidad - {formatCurrency(p.precio)}
                      </button>
                      {pres.filter((pr) => pr.nombre !== "Unidad" && pr.cantidad !== 1).map((pr) => (
                        <button
                          key={pr.id}
                          onClick={() => tryAddItem(p, pr)}
                          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                            matchedPres?.id === pr.id
                              ? "bg-primary text-primary-foreground ring-2 ring-primary"
                              : "bg-primary/10 text-primary hover:bg-primary/20"
                          }`}
                        >
                          {pr.nombre} ({pr.cantidad} un.) - {formatCurrency(pr.precio)}
                          {pr.codigo && <span className="ml-1 opacity-70">· {pr.codigo}</span>}
                        </button>
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
            {filteredClients.map((c, idx) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                  idx === clientHighlight ? "bg-accent" : "hover:bg-muted"
                }`}
                onClick={() => {
                  setClientId(c.id);
                  setClientDialogOpen(false);
                  setClientSearch("");
                }}
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {initials(c.nombre)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[c.email, c.telefono].filter(Boolean).join(" - ")}
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
                setNewClientData({ nombre: "", email: "", telefono: "", cuit: "", direccion: "" });
                setCreateClientOpen(true);
              }}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Nuevo Cliente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create client dialog */}
      <Dialog open={createClientOpen} onOpenChange={setCreateClientOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Nuevo Cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <Input
                value={newClientData.nombre}
                onChange={(e) => setNewClientData((d) => ({ ...d, nombre: e.target.value }))}
                placeholder="Nombre completo o razón social"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input
                  value={newClientData.email}
                  onChange={(e) => setNewClientData((d) => ({ ...d, email: e.target.value }))}
                  placeholder="email@ejemplo.com"
                  type="email"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
                <Input
                  value={newClientData.telefono}
                  onChange={(e) => setNewClientData((d) => ({ ...d, telefono: e.target.value }))}
                  placeholder="11-1234-5678"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">CUIT</label>
                <Input
                  value={newClientData.cuit}
                  onChange={(e) => setNewClientData((d) => ({ ...d, cuit: e.target.value }))}
                  placeholder="20-12345678-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                <Input
                  value={newClientData.direccion}
                  onChange={(e) => setNewClientData((d) => ({ ...d, direccion: e.target.value }))}
                  placeholder="Calle 123"
                />
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
                <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
                <p className="text-sm sm:text-lg font-bold">{formatCurrency(total)}</p>
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Recibido</p>
                <p className="text-sm sm:text-lg font-bold text-emerald-600">
                  {formatCurrency(cashReceivedNum)}
                </p>
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {cashReceivedNum >= total ? "Vuelto" : "Falta"}
                </p>
                <p className={`text-sm sm:text-lg font-bold ${cashReceivedNum >= total ? "text-emerald-600" : "text-destructive"}`}>
                  {cashReceivedNum === 0 ? "—" : cashReceivedNum >= total ? formatCurrency(cashChange) : formatCurrency(total - cashReceivedNum)}
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
                onClick={() => setCashReceived(String(total))}
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
                disabled={cashReceivedNum < total || saving}
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
                setDespacho("Retira en local");
              }}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                deliveryMethod === "pickup"
                  ? "border-blue-500 bg-blue-50"
                  : "border-border hover:bg-accent"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                deliveryMethod === "pickup" ? "bg-blue-100" : "bg-muted"
              }`}>
                <Store className={`w-5 h-5 ${deliveryMethod === "pickup" ? "text-blue-600" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Retiro en Tienda</p>
                <p className="text-xs text-muted-foreground">El cliente retira en el local</p>
              </div>
              {deliveryMethod === "pickup" && (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
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
                        const { data, error } = await supabase
                          .from("cliente_direcciones")
                          .insert({
                            cliente_auth_id: clientId,
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
                          setDespacho("Envio a domicilio");
                        }
                        setShowNewAddressForm(false);
                      } catch (err) {
                        console.error("Error saving address:", err);
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
              <h4 className="font-semibold mb-2 text-blue-600 uppercase text-xs tracking-wider">Navegacion</h4>
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
                        <span>Facturando: <strong className="text-red-600">{issue.unidadesFacturadas} {issue.item.presentacion !== "Unidad" ? (issue.unidadesFacturadas === 1 ? issue.item.presentacion : issue.item.presentacion.replace(/^Caja/, "Cajas")) : "Un."}</strong></span>
                        <span>Disponible: <strong className="text-amber-600">{issue.stockDisponible} {issue.item.presentacion !== "Unidad" ? (issue.stockDisponible === 1 ? issue.item.presentacion : issue.item.presentacion.replace(/^Caja/, "Cajas")) : "Un."}</strong></span>
                      </div>
                      {checked && maxInPres > 0 && (
                        <p className="text-[11px] text-emerald-600 mt-1">Se ajustará a {maxInPres} {issue.item.presentacion !== "Unidad" ? (maxInPres === 1 ? issue.item.presentacion : issue.item.presentacion.replace(/^Caja/, "Cajas")) : "Un."}</p>
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
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleStockAdjust}
                disabled={stockExceedDialog.adjustSet.size === 0 && stockExceedDialog.issues.length > 1}
              >
                {stockExceedDialog.adjustSet.size === stockExceedDialog.issues.length
                  ? "Ajustar todos a disponible"
                  : stockExceedDialog.adjustSet.size > 0
                  ? `Ajustar seleccionados (${stockExceedDialog.adjustSet.size})`
                  : "Facturar igual"}
              </Button>
              {stockExceedDialog.adjustSet.size > 0 && stockExceedDialog.adjustSet.size < stockExceedDialog.issues.length && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleStockContinue}
                >
                  Facturar todo igual
                </Button>
              )}
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
    </div>
  );
}
