"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/tienda/toast";
import {
  User,
  Mail,
  Phone,
  Truck,
  Store,
  MapPin,
  Calendar,
  Banknote,
  Building,
  ArrowLeftRight,
  Shield,
  CheckCircle,
  ShoppingBag,
  ChevronRight,
  Plus,
  Loader2,
  DollarSign,
} from "lucide-react";
import { APP_NAME } from "@/lib/constants";

interface CartItem {
  id: string;
  nombre: string;
  imagen?: string;
  imagen_url?: string;
  presentacion: string;
  precio: number;
  precio_original?: number;
  descuento?: number;
  cantidad: number;
  unidades_por_presentacion?: number;
}

interface Address {
  id: string;
  calle: string;
  numero: string;
  piso: string;
  departamento: string;
  localidad: string;
  provincia: string;
  codigo_postal: string;
  referencia: string;
  predeterminada?: boolean;
}

interface TiendaConfig {
  dias_entrega: string[];
  dias_max_programacion: number;
  umbral_envio_gratis: number;
  hora_corte: string;
  monto_minimo_pedido: number;
  monto_minimo_envio: number;
  recargo_transferencia: number;
  costo_envio: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

const formatThousands = (n: number): string =>
  n === 0 ? "" : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const parseThousands = (s: string): number => {
  const cleaned = s.replace(/\D/g, "");
  return cleaned === "" ? 0 : parseInt(cleaned, 10);
};

const DAY_ABBR = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_ABBR = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function getArgentinaNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
}

function getAvailableDates(
  diasEntrega: string[],
  maxDias: number,
  horaCorte: string
): { dayAbbr: string; dayNum: number; monthAbbr: string; value: string; isToday: boolean }[] {
  const dayMap: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miercoles: 3,
    miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6,
  };
  const allowedDays = diasEntrega.map((d) => dayMap[d.toLowerCase()] ?? -1);
  const now = getArgentinaNow();

  const [hh, mm] = (horaCorte || "12:00").split(":").map(Number);
  const cutoffMinutes = hh * 60 + mm;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startOffset = nowMinutes < cutoffMinutes ? 0 : 1;

  const todayStr = now.toISOString().split("T")[0];
  const dates: { dayAbbr: string; dayNum: number; monthAbbr: string; value: string; isToday: boolean }[] = [];
  for (let i = startOffset; i <= maxDias && dates.length < 10; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (allowedDays.includes(d.getDay())) {
      const value = d.toISOString().split("T")[0];
      dates.push({
        dayAbbr: DAY_ABBR[d.getDay()],
        dayNum: d.getDate(),
        monthAbbr: MONTH_ABBR[d.getMonth()],
        value,
        isToday: value === todayStr,
      });
    }
  }
  return dates;
}

export default function CheckoutPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  // Contact
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);

  // Delivery
  const [metodoEntrega, setMetodoEntrega] = useState<"retiro" | "envio">("retiro");
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [addr, setAddr] = useState({
    calle: "", numero: "", piso: "", departamento: "",
    localidad: "", provincia: "", codigo_postal: "", referencia: "",
  });
  const [observacion, setObservacion] = useState("");

  // Date
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [availableDates, setAvailableDates] = useState<
    { dayAbbr: string; dayNum: number; monthAbbr: string; value: string; isToday: boolean }[]
  >([]);

  // Payment
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia" | "mixto">("efectivo");
  const [cuentasBancarias, setCuentasBancarias] = useState<{ id: string; nombre: string; tipo: string; cbu_cvu: string; alias: string; titular?: string }[]>([]);
  const [selectedCuentaId, setSelectedCuentaId] = useState<string>("");
  const [mixtoEfectivo, setMixtoEfectivo] = useState(0);
  const [mixtoTransferencia, setMixtoTransferencia] = useState(0);

  // Config
  const [config, setConfig] = useState<TiendaConfig | null>(null);

  // Saldo pendiente
  const [saldoPendiente, setSaldoPendiente] = useState(0);
  const [deudasDetalle, setDeudasDetalle] = useState<{ numero: string; monto: number }[]>([]);

  // Validation errors
  const [errors, setErrors] = useState<string[]>([]);
  const [stockFixes, setStockFixes] = useState<Record<string, { stock: number }> | null>(null);
  const [showItemsDetail, setShowItemsDetail] = useState(false);

  const adjustCart = () => {
    if (!stockFixes) return;
    const updated = items.map((item) => {
      const prodId = item.id.split("_")[0];
      const prod = stockFixes[prodId];
      if (!prod) return item;
      const presUnits = item.unidades_por_presentacion || (() => {
        const match = item.id.match(/[Cc]aja\s*\(?x?(\d+)\)?/);
        const isMedio = item.id.includes("Medio Cartón") || (item.presentacion && item.presentacion.toLowerCase().includes("medio"));
        return isMedio ? 0.5 : match ? Number(match[1]) : 1;
      })();
      const maxQty = Math.floor(prod.stock / presUnits);
      if (item.cantidad > maxQty) return { ...item, cantidad: maxQty };
      return item;
    }).filter((item) => item.cantidad > 0);
    setItems(updated);
    localStorage.setItem("carrito", JSON.stringify(updated));
    window.dispatchEvent(new Event("cart-updated"));
    setErrors([]);
    setStockFixes(null);
    showToast("Carrito ajustado al stock disponible", { subtitle: "Los productos sin stock fueron eliminados" });
  };

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from("tienda_config").select("*").single();
    if (data) {
      const cfg: TiendaConfig = {
        dias_entrega: data.dias_entrega ?? [],
        dias_max_programacion: data.dias_max_programacion ?? 14,
        umbral_envio_gratis: data.umbral_envio_gratis ?? 0,
        hora_corte: data.hora_corte ?? "12:30",
        monto_minimo_pedido: data.monto_minimo_pedido ?? 15000,
        monto_minimo_envio: data.monto_minimo_envio ?? data.umbral_envio_gratis ?? 50000,
        recargo_transferencia: data.recargo_transferencia ?? 0,
        costo_envio: data.costo_envio ?? 0,
      };
      setConfig(cfg);
      const dates = getAvailableDates(cfg.dias_entrega, cfg.dias_max_programacion, cfg.hora_corte);
      setAvailableDates(dates);
      if (dates.length > 0) {
        setFechaEntrega(dates[0].value);
      } else {
        // Default to tomorrow if no delivery days configured
        const tomorrow = new Date(getArgentinaNow());
        tomorrow.setDate(tomorrow.getDate() + 1);
        setFechaEntrega(tomorrow.toISOString().split("T")[0]);
      }
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("carrito");
    if (raw) {
      try { setItems(JSON.parse(raw)); } catch {}
    }

    const auth = localStorage.getItem("cliente_auth");
    if (auth) {
      try {
        const parsed = JSON.parse(auth);
        if (parsed.id) {
          setClienteId(parsed.id);
          if (parsed.nombre) {
            const parts = parsed.nombre.split(" ");
            setNombre(parts[0] || "");
            setApellido(parts.slice(1).join(" ") || "");
          }
          if (parsed.email) setEmail(parsed.email);
          if (parsed.telefono) setTelefono(parsed.telefono);

          supabase
            .from("cliente_direcciones")
            .select("*")
            .eq("cliente_auth_id", parsed.id)
            .then(({ data }) => {
              if (data && data.length > 0) {
                setSavedAddresses(data as Address[]);
                const defaultAddr = data.find((a: Address) => a.predeterminada);
                setSelectedAddressId(defaultAddr?.id || data[0].id);
              } else {
                setShowNewAddress(true);
              }
            });

          // Fetch client profile data from clientes table and pre-fill fields
          supabase
            .from("clientes_auth")
            .select("cliente_id")
            .eq("id", parsed.id)
            .single()
            .then(async ({ data: authRec }) => {
              if (!authRec?.cliente_id) return;
              const { data: cli } = await supabase.from("clientes").select("nombre, email, telefono, domicilio, localidad, provincia, codigo_postal, saldo, dias_entrega").eq("id", authRec.cliente_id).single();
              if (cli) {
                // Pre-fill contact fields from clientes table (more reliable than localStorage)
                if (cli.nombre) {
                  const parts = cli.nombre.split(" ");
                  setNombre(parts[0] || "");
                  setApellido(parts.slice(1).join(" ") || "");
                }
                if (cli.email) setEmail(cli.email);
                if (cli.telefono) setTelefono(cli.telefono);

                // Pre-fill address form from clientes table when no saved addresses
                supabase
                  .from("cliente_direcciones")
                  .select("id")
                  .eq("cliente_auth_id", parsed.id)
                  .then(({ data: dirData }) => {
                    if (!dirData || dirData.length === 0) {
                      // No saved addresses: pre-fill the "Nueva dirección" form
                      if (cli.domicilio || cli.localidad || cli.provincia || cli.codigo_postal) {
                        // Parse domicilio into calle + numero if possible (e.g. "Av. San Martin 1234")
                        let calle = cli.domicilio || "";
                        let numero = "";
                        if (calle) {
                          const match = calle.match(/^(.+?)\s+(\d+)\s*$/);
                          if (match) {
                            calle = match[1];
                            numero = match[2];
                          }
                        }
                        setAddr({
                          calle,
                          numero,
                          piso: "",
                          departamento: "",
                          localidad: cli.localidad || "",
                          provincia: cli.provincia || "",
                          codigo_postal: cli.codigo_postal || "",
                          referencia: "",
                        });
                      }
                    }
                  });
              }
              // Override delivery dates with client-specific days if available
              const clientDias = cli?.dias_entrega;
              if (clientDias && clientDias.length > 0) {
                // Fetch config directly to avoid stale state
                const { data: cfgData } = await supabase.from("tienda_config").select("dias_max_programacion, hora_corte").single();
                const maxDias = cfgData?.dias_max_programacion ?? 14;
                const horaCorte = cfgData?.hora_corte ?? "12:30";
                const clientDates = getAvailableDates(clientDias, maxDias, horaCorte);
                setAvailableDates(clientDates);
                if (clientDates.length > 0) setFechaEntrega(clientDates[0].value);
              }

              const saldo = cli?.saldo || 0;
              if (saldo > 0) {
                setSaldoPendiente(saldo);
                // Fetch deudas detail
                const { data: ccDeudas } = await supabase
                  .from("cuenta_corriente")
                  .select("comprobante, debe, haber, venta_id")
                  .eq("cliente_id", authRec.cliente_id);
                const ventaDeudas: Record<string, number> = {};
                for (const cc of ccDeudas || []) {
                  if (cc.venta_id) {
                    ventaDeudas[cc.venta_id] = (ventaDeudas[cc.venta_id] || 0) + (cc.debe || 0) - (cc.haber || 0);
                  }
                }
                const deudas = Object.entries(ventaDeudas)
                  .filter(([, m]) => m > 0)
                  .map(([, m]) => ({ numero: "", monto: m }));
                // Get venta numbers
                const ventaIdsWithDebt = Object.entries(ventaDeudas).filter(([, m]) => m > 0).map(([id]) => id);
                if (ventaIdsWithDebt.length > 0) {
                  const { data: ventas } = await supabase.from("ventas").select("id, numero, tipo_comprobante").in("id", ventaIdsWithDebt);
                  const detalles = (ventas || []).map((v: any) => ({
                    numero: `${v.tipo_comprobante} ${v.numero}`,
                    monto: ventaDeudas[v.id] || 0,
                  }));
                  setDeudasDetalle(detalles);
                } else {
                  setDeudasDetalle(deudas);
                }
              }
            });
        }
      } catch {}
    } else {
      setShowNewAddress(true);
    }

    loadConfig();
    try {
      const stored = localStorage.getItem("cuentas_bancarias");
      if (stored) {
        const parsed = JSON.parse(stored);
        setCuentasBancarias(parsed);
        if (parsed.length > 0) setSelectedCuentaId(parsed[0].id);
      }
    } catch {}
    setLoaded(true);
  }, [loadConfig]);

  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const totalSavings = items.reduce((s, i) => i.precio_original ? s + (i.precio_original - i.precio) * i.cantidad : s, 0);
  const costoEnvioBase = config?.costo_envio ?? 0;
  const envioGratis =
    metodoEntrega === "retiro" ||
    (config && config.umbral_envio_gratis > 0 && subtotal >= config.umbral_envio_gratis);
  const costoEnvio = envioGratis ? 0 : metodoEntrega === "envio" ? costoEnvioBase : 0;
  const recargoTransf = config && config.recargo_transferencia > 0
    ? metodoPago === "transferencia"
      ? Math.round(subtotal * (config.recargo_transferencia / 100))
      : metodoPago === "mixto" && mixtoTransferencia > 0
        ? Math.round(mixtoTransferencia * (config.recargo_transferencia / 100))
        : 0
    : 0;
  const total = subtotal + costoEnvio + recargoTransf;

  const getAddressText = (): string => {
    if (metodoEntrega !== "envio") return "";
    if (!showNewAddress && selectedAddressId) {
      const found = savedAddresses.find((a) => a.id === selectedAddressId);
      if (found) {
        return `${found.calle} ${found.numero}${found.piso ? `, Piso ${found.piso}` : ""}${found.departamento ? ` ${found.departamento}` : ""} - ${found.localidad}, ${found.provincia}${found.codigo_postal ? ` (${found.codigo_postal})` : ""}`;
      }
    }
    if (showNewAddress) {
      return `${addr.calle} ${addr.numero}${addr.piso ? `, Piso ${addr.piso}` : ""}${addr.departamento ? ` ${addr.departamento}` : ""} - ${addr.localidad}, ${addr.provincia}${addr.codigo_postal ? ` (${addr.codigo_postal})` : ""}`;
    }
    return "";
  };

  const handleConfirm = async () => {
    const errs: string[] = [];
    if (!nombre) errs.push("El nombre es obligatorio.");
    if (!email) errs.push("El email es obligatorio.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push("Ingresá un email válido.");
    if (metodoEntrega === "retiro" && config && config.monto_minimo_pedido > 0 && subtotal < config.monto_minimo_pedido) {
      errs.push(`El monto mínimo para retiro en local es ${formatCurrency(config.monto_minimo_pedido)}.`);
    }
    if (metodoEntrega === "envio" && config && subtotal < config.monto_minimo_envio) {
      errs.push(`El monto mínimo para envío a domicilio es ${formatCurrency(config.monto_minimo_envio)}.`);
    }
    if (metodoEntrega === "envio" && !selectedAddressId && !showNewAddress) {
      errs.push("Seleccioná una dirección de envío.");
    }
    if (metodoEntrega === "envio" && showNewAddress && (!addr.calle || !addr.numero || !addr.localidad)) {
      errs.push("Completá la dirección de envío.");
    }
    if (metodoEntrega === "envio" && !fechaEntrega) errs.push("Seleccioná una fecha de entrega.");
    if (metodoPago === "mixto" && Math.abs(Math.round(mixtoEfectivo + mixtoTransferencia) - Math.round(subtotal + costoEnvio)) > 1) {
      errs.push("La suma de efectivo y transferencia debe igualar el total.");
    }

    if (errs.length > 0) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setSubmitting(true);

    // ── Server-side price validation: re-fetch real prices from DB ──
    const productIds = [...new Set(items.map((i) => i.id.split("_")[0]))];
    const { data: stockData } = await supabase.from("productos").select("id, stock, nombre, es_combo").in("id", productIds);
    const stockMap: Record<string, { stock: number; nombre: string }> = {};
    for (const p of stockData || []) stockMap[p.id] = { stock: p.stock, nombre: p.nombre };

    // For combo products, compute stock from components
    const comboIds = (stockData || []).filter((p: any) => p.es_combo).map((p: any) => p.id);
    if (comboIds.length > 0) {
      const { data: comboItems } = await supabase
        .from("combo_items")
        .select("combo_id, cantidad, productos!combo_items_producto_id_fkey(stock)")
        .in("combo_id", comboIds);
      const comboStockMap: Record<string, number> = {};
      for (const ci of (comboItems || []) as any[]) {
        const compStock = ci.productos?.stock ?? 0;
        const maxFromComp = Math.floor(compStock / (ci.cantidad || 1));
        comboStockMap[ci.combo_id] = ci.combo_id in comboStockMap
          ? Math.min(comboStockMap[ci.combo_id], maxFromComp)
          : maxFromComp;
      }
      for (const id of comboIds) {
        if (id in comboStockMap && stockMap[id]) {
          stockMap[id].stock = comboStockMap[id];
        }
      }
    }

    const stockErrors: string[] = [];
    for (const item of items) {
      const prodId = item.id.split("_")[0];
      const prod = stockMap[prodId];
      if (!prod) continue;
      const presUnits = item.unidades_por_presentacion || (() => {
        const match = item.id.match(/[Cc]aja\s*\(?x?(\d+)\)?/);
        const isMedio = item.id.includes("Medio Cartón") || (item.presentacion && item.presentacion.toLowerCase().includes("medio"));
        return isMedio ? 0.5 : match ? Number(match[1]) : 1;
      })();
      const unitsNeeded = item.cantidad * presUnits;
      if (unitsNeeded > prod.stock) {
        const disponible = Math.floor(prod.stock / presUnits);
        stockErrors.push(disponible <= 0
          ? `"${item.nombre}" se agotó`
          : `"${item.nombre}" solo tiene ${disponible} disponible${disponible !== 1 ? "s" : ""}`
        );
      }
    }
    if (stockErrors.length > 0) {
      setStockFixes(stockMap);
      setErrors([`Stock insuficiente: ${stockErrors.join(". ")}.`]);
      showToast("Algunos productos no tienen stock suficiente", { type: "error", subtitle: "Podés ajustar el carrito automáticamente" });
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // ── Server-side price validation: override cart prices with DB prices ──
    const { data: dbProducts } = await supabase
      .from("productos")
      .select("id, precio, es_combo")
      .in("id", productIds);
    const { data: dbPresentaciones } = await supabase
      .from("presentaciones")
      .select("producto_id, nombre, cantidad, precio_venta")
      .in("producto_id", productIds);
    // Fetch active discounts
    const hoyCheck = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const { data: dbDescuentos } = await supabase
      .from("descuentos")
      .select("producto_id, porcentaje, presentacion")
      .eq("activo", true)
      .lte("fecha_inicio", hoyCheck);

    const activeDescs = (dbDescuentos || []).filter((d: any) => !d.fecha_fin || d.fecha_fin >= hoyCheck);
    const prodPriceMap: Record<string, number> = {};
    for (const p of dbProducts || []) prodPriceMap[p.id] = p.precio;
    const presPriceMap: Record<string, number> = {};
    for (const pr of dbPresentaciones || []) {
      presPriceMap[`${pr.producto_id}_${pr.nombre}`] = pr.precio_venta;
      // Also map by "Caja (xN)" format
      if (pr.cantidad > 1) presPriceMap[`${pr.producto_id}_Caja (x${pr.cantidad})`] = pr.precio_venta;
    }

    for (const item of items) {
      const prodId = item.id.split("_")[0];
      const pres = item.presentacion || "Unidad";
      // Get correct base price from DB
      let correctPrice = presPriceMap[`${prodId}_${pres}`] ?? prodPriceMap[prodId] ?? item.precio;
      // Apply active discount if exists
      const disc = activeDescs.find((d: any) =>
        d.producto_id === prodId && (!d.presentacion || d.presentacion === pres || d.presentacion === "todas")
      );
      if (disc) {
        correctPrice = Math.round(correctPrice * (1 - disc.porcentaje / 100));
      }
      item.precio = correctPrice;
    }
    // Recalculate totals from validated prices
    const vSubtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const vEnvioGratis = metodoEntrega === "retiro" || (config && config.umbral_envio_gratis > 0 && vSubtotal >= config.umbral_envio_gratis);
    const vCostoEnvio = vEnvioGratis ? 0 : metodoEntrega === "envio" ? costoEnvioBase : 0;
    const vRecargoTransf = config && config.recargo_transferencia > 0
      ? metodoPago === "transferencia" ? Math.round(vSubtotal * (config.recargo_transferencia / 100))
        : metodoPago === "mixto" && mixtoTransferencia > 0 ? Math.round(mixtoTransferencia * (config.recargo_transferencia / 100))
          : 0
      : 0;
    const vTotal = vSubtotal + vCostoEnvio + vRecargoTransf;

    try {
      const { data: numData, error: numError } = await supabase.rpc("next_numero", { p_tipo: "pedido" });
      if (!numData || numError) {
        setErrors([`No se pudo generar el número de pedido: ${numError?.message || "sin respuesta"}. Intentá de nuevo.`]);
        setSubmitting(false);
        return;
      }
      const numero = numData;

      const { data: pedido, error } = await supabase
        .from("pedidos_tienda")
        .insert({
          numero,
          cliente_auth_id: clienteId || null,
          nombre_cliente: `${nombre} ${apellido}`.trim(),
          email,
          telefono,
          estado: "pendiente",
          metodo_entrega: metodoEntrega === "retiro" ? "retiro_local" : "envio",
          direccion_id: !showNewAddress && selectedAddressId ? selectedAddressId : null,
          direccion_texto: getAddressText() || null,
          fecha_entrega: fechaEntrega,
          metodo_pago: metodoPago,
          subtotal: vSubtotal,
          costo_envio: vCostoEnvio,
          total: vTotal,
          observacion: observacion || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      const itemRows = items.map((item) => ({
        pedido_id: pedido.id,
        producto_id: item.id.split("_")[0],
        nombre: item.nombre,
        presentacion: item.presentacion || "Unidad",
        cantidad: item.cantidad,
        precio_unitario: item.precio,
        subtotal: item.precio * item.cantidad,
      }));

      const { error: itemsError } = await supabase
        .from("pedido_tienda_items")
        .insert(itemRows);

      if (itemsError) throw itemsError;

      // Also create a venta record so it appears in the admin sales listing
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      // Get linked cliente_id from clientes_auth
      let ventaClienteId = null;
      if (clienteId) {
        const { data: authRec } = await supabase
          .from("clientes_auth")
          .select("cliente_id")
          .eq("id", clienteId)
          .single();
        if (authRec?.cliente_id) ventaClienteId = authRec.cliente_id;
      }

      const { data: venta, error: ventaError } = await supabase.from("ventas").insert({
        numero,
        tipo_comprobante: "Pedido Web",
        fecha: hoy,
        cliente_id: ventaClienteId,
        forma_pago: metodoPago === "efectivo" ? "Efectivo" : metodoPago === "transferencia" ? "Transferencia" : "Mixto",
        moneda: "Peso",
        subtotal: vSubtotal,
        descuento_porcentaje: 0,
        recargo_porcentaje: vRecargoTransf > 0 ? (config?.recargo_transferencia || 0) : 0,
        total: vTotal,
        estado: "pendiente",
        observacion: observacion || null,
        entregado: false,
        origen: "tienda",
        metodo_entrega: metodoEntrega === "retiro" ? "retiro" : "envio",
      }).select("id").single();

      if (ventaError) throw ventaError;

      // Insert venta items
      if (venta) {
        const ventaItemRows = items.map((item) => {
          const isMedio = item.id.includes("Medio Cartón") || (item.presentacion && item.presentacion.toLowerCase().includes("medio"));
          const boxMatch = item.id.match(/Caja \(x(\d+)\)/);
          const presUnitsVal = isMedio ? 0.5 : boxMatch ? Number(boxMatch[1]) : 1;
          return {
            venta_id: venta.id,
            producto_id: item.id.split("_")[0],
            descripcion: `${item.nombre} (${item.presentacion || "Unidad"})`,
            cantidad: item.cantidad,
            precio_unitario: item.precio,
            subtotal: item.precio * item.cantidad,
            unidad_medida: "Un",
            presentacion: item.presentacion || "Unidad",
            unidades_por_presentacion: presUnitsVal,
          };
        });
        const { error: ventaItemsError } = await supabase.from("venta_items").insert(ventaItemRows);
        if (ventaItemsError) throw ventaItemsError;

        // Update stock atomically (prevents race conditions with concurrent sales)
        const stockItems = items.map((item) => {
          const prodId = item.id.split("_")[0];
          const presUnits = item.unidades_por_presentacion || (() => {
            const match = item.id.match(/[Cc]aja\s*\(?x?(\d+)\)?/);
            const isMedioCarton = item.id.includes("Medio Cartón") || (item.presentacion && item.presentacion.toLowerCase().includes("medio"));
            return isMedioCarton ? 0.5 : match ? Number(match[1]) : 1;
          })();
          return {
            producto_id: prodId,
            cantidad: item.cantidad * presUnits,
            descripcion: `Venta Web - ${item.nombre} (${item.presentacion || "Unidad"})`,
          };
        });

        const { data: stockResult, error: stockError } = await supabase.rpc("decrementar_stock_venta", {
          p_items: stockItems,
          p_referencia: `Pedido Web #${numero}`,
          p_usuario: "Tienda Online",
          p_orden_id: venta.id,
        });

        if (stockError) {
          // Fallback: if RPC doesn't exist, decrement stock directly
          for (const si of stockItems) {
            const { data: p } = await supabase.from("productos").select("stock").eq("id", si.producto_id).single();
            if (p) {
              const antes = p.stock;
              const despues = antes - si.cantidad;
              if (despues < 0) {
                // Insufficient stock - rollback
                await supabase.from("venta_items").delete().eq("venta_id", venta.id);
                await supabase.from("ventas").delete().eq("id", venta.id);
                await supabase.from("pedido_tienda_items").delete().eq("pedido_id", pedido.id);
                await supabase.from("pedidos_tienda").delete().eq("id", pedido.id);
                setErrors([`Stock insuficiente para ${si.descripcion}. Por favor revisá tu carrito.`]);
                setSubmitting(false);
                return;
              }
              await supabase.from("productos").update({ stock: despues }).eq("id", si.producto_id);
              await supabase.from("stock_movimientos").insert({
                producto_id: si.producto_id, tipo: "Venta", cantidad: -si.cantidad,
                cantidad_antes: antes, cantidad_despues: despues,
                referencia: `Pedido Web #${numero}`, descripcion: si.descripcion, usuario: "Tienda Online", orden_id: venta.id,
              });
            }
          }
        }

        if (stockResult && !stockResult.ok) {
          // Stock insufficient - rollback venta AND pedido
          await supabase.from("venta_items").delete().eq("venta_id", venta.id);
          await supabase.from("ventas").delete().eq("id", venta.id);
          await supabase.from("pedido_tienda_items").delete().eq("pedido_id", pedido.id);
          await supabase.from("pedidos_tienda").delete().eq("id", pedido.id);
          const faltantes = (stockResult.faltantes || [])
            .map((f: any) => `${f.descripcion}: disponible ${f.stock_disponible}`)
            .join(", ");
          setErrors([`Algunos productos no tienen stock suficiente: ${faltantes}. Por favor revisá tu carrito.`]);
          setSubmitting(false);
          return;
        }
      }

      localStorage.removeItem("carrito");
      window.dispatchEvent(new Event("cart-updated"));
      setOrderNumber(numero);
    } catch (err: any) {
      const msg = err?.message || err?.details || "Error desconocido";
      setErrors([`Hubo un error al procesar tu pedido: ${msg}`]);
      showToast("Error al procesar el pedido", { type: "error", subtitle: "Intentá de nuevo" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) return null;

  // Success state
  if (orderNumber) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="relative mx-auto w-24 h-24 mb-8">
            <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-20" />
            <div className="relative flex items-center justify-center w-24 h-24 bg-green-100 rounded-full">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            ¡Pedido confirmado!
          </h1>
          <p className="text-gray-500 mb-6">Gracias por tu compra en {APP_NAME}</p>

          <div className="inline-block bg-pink-50 border border-pink-200 rounded-xl px-6 py-3 mb-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">N.° de pedido</p>
            <p className="text-lg font-mono font-bold text-pink-600">{orderNumber}</p>
          </div>

          <p className="text-gray-500 text-sm mb-8">
            Te enviamos los detalles a{" "}
            <span className="font-semibold text-gray-700">{email}</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/cuenta/pedidos"
              className="flex-1 inline-flex items-center justify-center gap-2 border-2 border-pink-600 text-pink-600 px-6 py-3 rounded-xl font-semibold hover:bg-pink-50 transition"
            >
              Ver mis pedidos
            </Link>
            <Link
              href="/productos"
              className="flex-1 inline-flex items-center justify-center gap-2 bg-pink-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-pink-700 transition"
            >
              Seguir comprando
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Empty cart
  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <ShoppingBag className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tu carrito está vacío</h1>
          <p className="text-gray-500 mb-6">Agregá productos para continuar</p>
          <Link
            href="/productos"
            className="inline-flex items-center gap-2 bg-pink-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-pink-700 transition"
          >
            Ver productos
          </Link>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Progress steps */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[
          { n: 1, label: "Datos" },
          { n: 2, label: "Entrega" },
          { n: 3, label: "Pago" },
        ].map((step, i) => (
          <div key={step.n} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-pink-600 text-white flex items-center justify-center text-xs font-bold">{step.n}</div>
              <span className="text-sm font-medium text-gray-700 hidden sm:inline">{step.label}</span>
            </div>
            {i < 2 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-red-500 mt-0.5 shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-red-800 mb-1">Revisá los siguientes campos:</p>
            {errors.map((e, i) => (
              <p key={i} className="text-sm text-red-600">• {e}</p>
            ))}
          {stockFixes && (
            <button
              onClick={adjustCart}
              className="mt-3 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              Ajustar carrito automáticamente
            </button>
          )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-8">
        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-6">
          {/* Login REQUIRED if not logged in */}
          {!clienteId && (
            <div className="bg-white border-2 border-pink-200 rounded-2xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <User className="h-8 w-8 text-pink-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Iniciá sesión para comprar</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">Para completar tu pedido necesitás tener una cuenta. Así podemos guardar tus datos, direcciones y el historial de tus compras.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
                <a href="/cuenta" className="bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold px-8 py-3 rounded-xl transition-colors">
                  Iniciar sesión
                </a>
                <a href="/cuenta" className="border-2 border-pink-300 text-pink-700 text-sm font-semibold px-8 py-3 rounded-xl hover:bg-pink-50 transition-colors">
                  Crear cuenta nueva
                </a>
              </div>
            </div>
          )}

          {/* Only show form if logged in */}
          {clienteId && (<>
          {/* 1. Información de Contacto */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <div className="flex items-center gap-2.5 mb-4 sm:mb-6">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-pink-100 rounded-lg flex items-center justify-center">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-600" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Información de Contacto</h2>
              <span className="ml-auto text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">✓ Datos cargados</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nombre</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className={inputClass}
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className={labelClass}>Apellido</label>
                <input
                  type="text"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className={inputClass}
                  placeholder="Tu apellido"
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${inputClass} pl-10`}
                    placeholder="tu@email.com"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className={`${inputClass} pl-10`}
                    placeholder="+54 9 ..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Método de Entrega */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <div className="flex items-center gap-2.5 mb-4 sm:mb-6">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-pink-100 rounded-lg flex items-center justify-center">
                <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-600" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Método de entrega</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* Retiro en tienda */}
              <button
                onClick={() => setMetodoEntrega("retiro")}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 transition text-left ${
                  metodoEntrega === "retiro"
                    ? "border-pink-500 bg-pink-50"
                    : "border-gray-200 hover:border-pink-300"
                }`}
              >
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    metodoEntrega === "retiro" ? "border-pink-500" : "border-gray-300"
                  }`}
                >
                  {metodoEntrega === "retiro" && (
                    <div className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Store className="h-4 w-4 text-gray-500" />
                    <p className="font-semibold text-gray-900 text-sm">Retiro en Tienda</p>
                  </div>
                  <p className="text-xs text-gray-500">Retiralo en nuestro local</p>
                  <p className="text-xs font-semibold text-green-600 mt-1">Sin costo de envío</p>
                </div>
              </button>

              {/* Envío a domicilio */}
              <button
                onClick={() => setMetodoEntrega("envio")}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 transition text-left ${
                  metodoEntrega === "envio"
                    ? "border-pink-500 bg-pink-50"
                    : "border-gray-200 hover:border-pink-300"
                }`}
              >
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    metodoEntrega === "envio" ? "border-pink-500" : "border-gray-300"
                  }`}
                >
                  {metodoEntrega === "envio" && (
                    <div className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-4 w-4 text-gray-500" />
                    <p className="font-semibold text-gray-900 text-sm">Envío a domicilio</p>
                  </div>
                  <p className="text-xs text-gray-500">Recibilo en tu dirección</p>
                  <p className="text-xs font-semibold text-green-600 mt-1">Envío sin cargo</p>
                </div>
              </button>
            </div>

            {/* Envío address selection */}
            {metodoEntrega === "envio" && (
              <div className="space-y-3 border-t border-gray-100 pt-5">
                {/* Saved addresses */}
                {savedAddresses.length > 0 && (
                  <div className="space-y-2">
                    <label className={labelClass}>
                      <MapPin className="inline h-4 w-4 mr-1" />
                      Dirección de entrega
                    </label>
                    {savedAddresses.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setShowNewAddress(false);
                          setSelectedAddressId(a.id);
                        }}
                        className={`w-full text-left p-3 rounded-xl border-2 transition text-sm ${
                          !showNewAddress && selectedAddressId === a.id
                            ? "border-pink-500 bg-pink-50"
                            : "border-gray-200 hover:border-pink-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                !showNewAddress && selectedAddressId === a.id
                                  ? "border-pink-500"
                                  : "border-gray-300"
                              }`}
                            >
                              {!showNewAddress && selectedAddressId === a.id && (
                                <div className="w-2 h-2 rounded-full bg-pink-500" />
                              )}
                            </div>
                            <span className="text-gray-900">
                              {a.calle} {a.numero}
                              {a.piso ? `, Piso ${a.piso}` : ""}
                              {a.departamento ? ` ${a.departamento}` : ""} - {a.localidad}, {a.provincia}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {a.predeterminada && (
                              <span className="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full font-medium">
                                Predeterminada
                              </span>
                            )}
                            {!showNewAddress && selectedAddressId === a.id && (
                              <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">
                                Seleccionada
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Add new address button */}
                {!showNewAddress && (
                  <button
                    onClick={() => setShowNewAddress(true)}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 text-sm text-pink-600 font-medium hover:border-pink-400 hover:bg-pink-50 transition"
                  >
                    <Plus className="h-4 w-4" />
                    {savedAddresses.length === 0 ? "Agregar dirección de envío" : "Agregar otra dirección"}
                  </button>
                )}

                {/* New address form */}
                {showNewAddress && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-gray-700">Nueva dirección</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Calle</label>
                        <input
                          type="text"
                          value={addr.calle}
                          onChange={(e) => setAddr({ ...addr, calle: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className={labelClass}>Número</label>
                          <input
                            type="text"
                            value={addr.numero}
                            onChange={(e) => setAddr({ ...addr, numero: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Piso</label>
                          <input
                            type="text"
                            value={addr.piso}
                            onChange={(e) => setAddr({ ...addr, piso: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Depto</label>
                          <input
                            type="text"
                            value={addr.departamento}
                            onChange={(e) => setAddr({ ...addr, departamento: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Localidad</label>
                        <input
                          type="text"
                          value={addr.localidad}
                          onChange={(e) => setAddr({ ...addr, localidad: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Provincia</label>
                        <input
                          type="text"
                          value={addr.provincia}
                          onChange={(e) => setAddr({ ...addr, provincia: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Código postal</label>
                        <input
                          type="text"
                          value={addr.codigo_postal}
                          onChange={(e) => setAddr({ ...addr, codigo_postal: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Referencia</label>
                        <input
                          type="text"
                          value={addr.referencia}
                          onChange={(e) => setAddr({ ...addr, referencia: e.target.value })}
                          className={inputClass}
                          placeholder="Ej: timbre 2B"
                        />
                      </div>
                    </div>
                    {savedAddresses.length > 0 && (
                      <button
                        onClick={() => setShowNewAddress(false)}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Instrucciones de entrega */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-pink-100 rounded-lg flex items-center justify-center">
                <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-600" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Instrucciones de entrega</h2>
              <span className="text-xs text-gray-400">(opcional)</span>
            </div>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value.slice(0, 500))}
              rows={3}
              className={inputClass}
              placeholder="Indicaciones especiales para la entrega..."
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {observacion.length}/500 caracteres
            </p>
          </div>

          {/* 4. Fecha de entrega - solo para envío a domicilio */}
          {metodoEntrega === "envio" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
            <div className="flex items-center gap-2.5 mb-4 sm:mb-6">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-pink-100 rounded-lg flex items-center justify-center">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-600" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Fecha de entrega</h2>
            </div>

            {availableDates.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {availableDates.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setFechaEntrega(d.value)}
                    className={`flex-shrink-0 flex flex-col items-center px-4 py-3 rounded-xl border-2 transition min-w-[72px] relative ${
                      fechaEntrega === d.value
                        ? "border-pink-500 bg-pink-50"
                        : "border-gray-200 hover:border-pink-300"
                    }`}
                  >
                    {d.isToday && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-pink-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full leading-none">
                        hoy
                      </span>
                    )}
                    <span className={`text-xs font-medium ${fechaEntrega === d.value ? "text-pink-600" : "text-gray-500"}`}>
                      {d.dayAbbr}
                    </span>
                    <span className={`text-xl font-bold ${fechaEntrega === d.value ? "text-pink-600" : "text-gray-900"}`}>
                      {d.dayNum}
                    </span>
                    <span className={`text-xs ${fechaEntrega === d.value ? "text-pink-500" : "text-gray-400"}`}>
                      {d.monthAbbr}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No hay fechas de entrega disponibles.</p>
            )}
          </div>
          )}
          </>)}
        </div>

        {/* ===== RIGHT COLUMN - Resumen del Pedido ===== */}
        <div>
          {/* Saldo pendiente alert */}
          {saldoPendiente > 0 && (
            <div className="mb-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-orange-600" />
                <span className="font-bold text-orange-800 text-sm">Tenés un saldo pendiente de {formatCurrency(saldoPendiente)}</span>
              </div>
              {deudasDetalle.length > 0 && (
                <div className="mt-2 space-y-1">
                  {deudasDetalle.map((d, i) => (
                    <div key={i} className="flex justify-between text-xs text-orange-700">
                      <span>{d.numero || "Comprobante"}</span>
                      <span className="font-semibold">{formatCurrency(d.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-orange-600 mt-2">Recordá saldar tu deuda para mantener tu cuenta al día.</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sticky top-24">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-5">Resumen del Pedido</h2>

            {/* Items list - on mobile show first 3, expandable; on desktop show all */}
            {(() => {
              const PREVIEW_COUNT = 3;
              const visibleItems = showItemsDetail ? items : items.slice(0, PREVIEW_COUNT);
              const hiddenCount = items.length - PREVIEW_COUNT;
              return (
                <div className="space-y-3 mb-5">
                  {visibleItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {(item.imagen || item.imagen_url) ? (
                          <img
                            src={(item.imagen || item.imagen_url)!}
                            alt={item.nombre}
                            className="w-12 h-12 rounded-lg object-contain bg-gray-50"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                            <ShoppingBag className="h-5 w-5 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.nombre}</p>
                        <p className="text-xs text-gray-400">
                          {item.presentacion && `${item.presentacion} · `}x{(item.id.includes("Medio Cartón") || (item.presentacion && item.presentacion.toLowerCase().includes("medio"))) ? item.cantidad * 0.5 : item.cantidad}
                          {item.descuento ? <span className="ml-1.5 inline-flex items-center bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">-{item.descuento}%</span> : null}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {item.precio_original ? (
                          <>
                            <p className="text-[11px] text-gray-400 line-through">{formatCurrency(item.precio_original * item.cantidad)}</p>
                            <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.precio * item.cantidad)}</p>
                          </>
                        ) : (
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.precio * item.cantidad)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => setShowItemsDetail(!showItemsDetail)}
                      className="w-full text-center text-sm font-medium text-pink-600 hover:text-pink-700 py-2 transition-colors"
                    >
                      {showItemsDetail ? "Ver menos" : `Ver ${hiddenCount} producto${hiddenCount !== 1 ? "s" : ""} más`}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Método de Pago */}
            <div className="border-t border-gray-100 pt-5 mb-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Método de Pago</h3>
              <div className="space-y-2">
                {/* Efectivo */}
                <button
                  onClick={() => { setMetodoPago("efectivo"); setMixtoEfectivo(0); setMixtoTransferencia(0); }}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition text-left text-sm ${
                    metodoPago === "efectivo" ? "border-pink-500 bg-pink-50/50" : "border-gray-200 hover:border-pink-300"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${metodoPago === "efectivo" ? "border-pink-500" : "border-gray-300"}`}>
                    {metodoPago === "efectivo" && <div className="w-2.5 h-2.5 rounded-full bg-pink-500" />}
                  </div>
                  <Banknote className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-900">Efectivo</span>
                </button>

                {/* Transferencia */}
                <button
                  onClick={() => { setMetodoPago("transferencia"); setMixtoEfectivo(0); setMixtoTransferencia(0); }}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition text-left text-sm ${
                    metodoPago === "transferencia" ? "border-pink-500 bg-pink-50/50" : "border-gray-200 hover:border-pink-300"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${metodoPago === "transferencia" ? "border-pink-500" : "border-gray-300"}`}>
                    {metodoPago === "transferencia" && <div className="w-2.5 h-2.5 rounded-full bg-pink-500" />}
                  </div>
                  <Building className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-900">Transferencia</span>
                    {config && config.recargo_transferencia > 0 && (
                      <p className="text-[11px] text-gray-400">+{config.recargo_transferencia}% (+{formatCurrency(Math.round(subtotal * (config.recargo_transferencia / 100)))})</p>
                    )}
                  </div>
                </button>

                {/* Pago Mixto */}
                <button
                  onClick={() => setMetodoPago("mixto")}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition text-left text-sm ${
                    metodoPago === "mixto" ? "border-pink-500 bg-pink-50/50" : "border-gray-200 hover:border-pink-300"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${metodoPago === "mixto" ? "border-pink-500" : "border-gray-300"}`}>
                    {metodoPago === "mixto" && <div className="w-2.5 h-2.5 rounded-full bg-pink-500" />}
                  </div>
                  <ArrowLeftRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-900">Pago Mixto</span>
                </button>
              </div>

              {/* Bank account info for transferencia or mixto */}
              {(metodoPago === "transferencia" || metodoPago === "mixto") && cuentasBancarias.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] flex items-center justify-center font-bold">1</span>
                    Selecciona a qué cuenta transferirás:
                  </p>
                  {cuentasBancarias.map((cb) => (
                    <button
                      key={cb.id}
                      type="button"
                      onClick={() => setSelectedCuentaId(cb.id)}
                      className={`w-full text-left rounded-xl border-2 p-4 transition ${
                        selectedCuentaId === cb.id
                          ? "border-pink-500 bg-pink-50/50"
                          : "border-gray-200 hover:border-pink-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Building className={`w-4 h-4 ${selectedCuentaId === cb.id ? "text-pink-600" : "text-gray-400"}`} />
                        <span className="font-semibold text-sm text-gray-900">{cb.nombre}</span>
                        <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Billetera</span>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5 pl-6">
                        {cb.alias && <p>Alias: {cb.alias}</p>}
                        {cb.cbu_cvu && <p>CBU: {cb.cbu_cvu}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Mixto: amount inputs */}
              {metodoPago === "mixto" && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                    Ingresa el monto en efectivo:
                  </p>
                  <div className="rounded-xl border-2 border-orange-400 bg-orange-50/50 px-4 py-3">
                    <p className="text-xs text-gray-500">Total a pagar: <span className="font-bold text-base text-gray-900">{formatCurrency(subtotal + costoEnvio)}</span></p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 flex items-center gap-1 mb-1">
                        <Banknote className="w-3.5 h-3.5" /> Efectivo
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatThousands(mixtoEfectivo)}
                        onChange={(e) => {
                          const val = parseThousands(e.target.value);
                          setMixtoEfectivo(val);
                          setMixtoTransferencia(Math.max(0, (subtotal + costoEnvio) - val));
                        }}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 flex items-center gap-1 mb-1">
                        <Building className="w-3.5 h-3.5" /> Transferencia
                      </label>
                      {(() => {
                        const transfBase = Math.max(0, (subtotal + costoEnvio) - mixtoEfectivo);
                        const recargo = config && config.recargo_transferencia > 0
                          ? Math.round(transfBase * (config.recargo_transferencia / 100))
                          : 0;
                        return (
                          <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 font-medium">
                            {formatCurrency(transfBase + recargo)}
                            {recargo > 0 && (
                              <span className="text-[10px] text-green-600 ml-1">(inc. {config!.recargo_transferencia}% recargo)</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="text-xs space-y-1 px-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Efectivo:</span>
                      <span className="font-medium">{formatCurrency(mixtoEfectivo)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Transferencia:</span>
                      <span className="font-medium">{formatCurrency(mixtoTransferencia)}</span>
                    </div>
                    {recargoTransf > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Recargo transf. ({config!.recargo_transferencia}%)</span>
                        <span>+{formatCurrency(recargoTransf)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-900">
                      <span>Total a transferir:</span>
                      <span>{formatCurrency(mixtoTransferencia + recargoTransf)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="border-t border-gray-100 pt-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
              {totalSavings > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Ahorro por descuentos</span>
                  <span className="text-green-600 font-medium">-{formatCurrency(totalSavings)}</span>
                </div>
              )}
              {config && metodoEntrega === "envio" && config.monto_minimo_envio > 0 && subtotal < config.monto_minimo_envio && (
                <p className="text-xs text-pink-600">
                  Mínimo: {formatCurrency(config.monto_minimo_envio)} (faltan {formatCurrency(config.monto_minimo_envio - subtotal)})
                </p>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Envío</span>
                <span>
                  {envioGratis ? (
                    <span className="text-green-600 font-semibold">Gratis</span>
                  ) : (
                    <span className="text-gray-900">{formatCurrency(costoEnvio)}</span>
                  )}
                </span>
              </div>
              {recargoTransf > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Recargo</span>
                  <span className="text-green-600">+{formatCurrency(recargoTransf)}</span>
                </div>
              )}
              <div className="border-t border-dashed border-gray-200 pt-3 flex justify-between">
                <span className="text-xl font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-gray-900">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Minimum order warning */}
            {config && metodoEntrega === "retiro" && config.monto_minimo_pedido > 0 && subtotal < config.monto_minimo_pedido && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                <p className="font-medium">Monto mínimo no alcanzado</p>
                <p className="text-xs mt-0.5">Para retiro en local el mínimo es {formatCurrency(config.monto_minimo_pedido)}. Te faltan {formatCurrency(config.monto_minimo_pedido - subtotal)}.</p>
              </div>
            )}
            {config && metodoEntrega === "envio" && subtotal < config.monto_minimo_envio && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                <p className="font-medium">Monto mínimo no alcanzado</p>
                <p className="text-xs mt-0.5">Para envío a domicilio el mínimo es {formatCurrency(config.monto_minimo_envio)}. Te faltan {formatCurrency(config.monto_minimo_envio - subtotal)}.</p>
              </div>
            )}

            {/* Confirm button */}
            {clienteId ? (
              <button
                onClick={handleConfirm}
                disabled={submitting || (metodoEntrega === "retiro" && !!config && config.monto_minimo_pedido > 0 && subtotal < config.monto_minimo_pedido) || (metodoEntrega === "envio" && !!config && subtotal < config.monto_minimo_envio)}
                className="mt-5 w-full bg-pink-600 hover:bg-pink-700 text-white rounded-xl py-3 font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  "Crear Pedido"
                )}
              </button>
            ) : (
              <a href="/cuenta" className="mt-5 w-full bg-pink-600 hover:bg-pink-700 text-white rounded-xl py-3 font-semibold transition flex items-center justify-center gap-2 block text-center">
                Iniciar sesión para comprar
              </a>
            )}

            {/* Trust badge */}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <Shield className="h-3.5 w-3.5" />
              Pago seguro y encriptado
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
