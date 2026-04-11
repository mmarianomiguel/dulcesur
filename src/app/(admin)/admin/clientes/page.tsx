"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import Link from "next/link";
import { todayARG, nowTimeARG, formatCurrency } from "@/lib/formatters";
import { logAudit } from "@/lib/audit";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { Cliente, ZonaEntrega } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { showAdminToast } from "@/components/admin-toast";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Mail,
  Building2,
  Users,
  Loader2,
  Key,
  KeyRound,
  History,
  FileText,
  X,
  ExternalLink,
  ChevronDown,
  DollarSign,
  Eye,
  Download,
  MapPin,
  Upload,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { CobroAllocationDialog, CobroResult } from "@/components/cobro-allocation-dialog";

const PROVINCIAS = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes",
  "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones",
  "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe",
  "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];


const emptyForm = {
  codigo_cliente: "",
  nombre: "",
  tipo_documento: "",
  numero_documento: "",
  cuit: "",
  situacion_iva: "Consumidor final",
  tipo_factura: "",
  razon_social: "",
  domicilio: "",
  domicilio_fiscal: "",
  telefono: "",
  email: "",
  provincia: "",
  localidad: "",
  codigo_postal: "",
  observacion: "",
  limite_credito: 0,
  barrio: "",
  vendedor_id: "",
  zona_entrega: "",
  categorias_permitidas: [] as string[],
  maps_url: "",
};

export default function ClientesPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [activeTab, setActiveTab] = useState<"listado" | "cobranzas" | "zonas">("listado");
  const [clients, setClients] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Read ?buscar= from URL on mount
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("buscar");
    if (q) setSearch(q);
  }, []);
  const [filterDomicilio, setFilterDomicilio] = useState("");
  const [filterZona, setFilterZona] = useState("");
  const [sortOrder, setSortOrder] = useState<"recent" | "az" | "za" | "saldo">("az");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Cliente | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [vendedores, setVendedores] = useState<{id:string;nombre:string}[]>([]);
  const [vendedorFilter, setVendedorFilter] = useState("");
  const [vendedorSearch, setVendedorSearch] = useState("");
  const [vendedorOpen, setVendedorOpen] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);
  const [zonas, setZonas] = useState<ZonaEntrega[]>([]);
  const [categoriasRestringidas, setCategoriasRestringidas] = useState<{id:string;nombre:string}[]>([]);

  // Zonas management
  const [zonaDialogOpen, setZonaDialogOpen] = useState(false);
  const [editingZona, setEditingZona] = useState<ZonaEntrega | null>(null);
  const [zonaForm, setZonaForm] = useState<{ nombre: string; dias: string[] }>({ nombre: "", dias: [] });
  const [zonaSaving, setZonaSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // Movements
  const [movClient, setMovClient] = useState<Cliente | null>(null);
  const [movOpen, setMovOpen] = useState(false);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [movCCRows, setMovCCRows] = useState<any[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movDesde, setMovDesde] = useState("");
  const [movHasta, setMovHasta] = useState("");
  const [movTotals, setMovTotals] = useState({ ventas: 0, nc: 0, totalComprado: 0 });
  const [movCCTotals, setMovCCTotals] = useState({ debe: 0, haber: 0, saldo: 0, saldoInicial: 0 });
  const [movExpanded, setMovExpanded] = useState<string | null>(null);
  const [movTab, setMovTab] = useState<"resumen" | "compras" | "cobros">("resumen");
  const [cobrosCliente, setCobrosCliente] = useState<any[]>([]);
  const [movCCFilter, setMovCCFilter] = useState("all");
  // Payment from movimientos
  const [payMovOpen, setPayMovOpen] = useState(false);
  const [payMovVenta, setPayMovVenta] = useState<any>(null);
  const [payMovMonto, setPayMovMonto] = useState(0);
  const [payMovMetodo, setPayMovMetodo] = useState<"Efectivo" | "Transferencia">("Efectivo");
  const [payMovCuentaBancariaId, setPayMovCuentaBancariaId] = useState("");
  const [payMovSaving, setPayMovSaving] = useState(false);
  const vendedorRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");

  // Cobranzas state
  const [cobranzasSearch, setCobranzasSearch] = useState("");
  const [cobroOpen, setCobroOpen] = useState(false);
  const [cobroReceipt, setCobroReceipt] = useState<{
    open: boolean; cliente: string; clienteCuit: string; clienteDomicilio: string; clienteTelefono: string;
    monto: number; formaPago: string; fecha: string; saldoAnterior: number; saldoNuevo: number;
    empresaNombre: string; empresaCuit: string; empresaDomicilio: string; empresaTelefono: string;
    cuentaBancaria: string; cuentaAlias: string; observacion: string; numero: string;
    comprobantes: { comprobante: string; debe: number; haber: number }[];
  } | null>(null);
  const [cobroClient, setCobroClient] = useState<Cliente | null>(null);
  const [cuentasBancarias, setCuentasBancarias] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [empresa, setEmpresa] = useState<any>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: vends }] = await Promise.all([
      supabase.from("clientes").select("*").eq("activo", true).order("nombre").limit(5000),
      supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    ]);
    setClients((data || []) as unknown as Cliente[]);
    setVendedores(vends || []);
    setLoading(false);
  }, []);

  const fetchZonas = useCallback(async () => {
    const { data } = await supabase.from("zonas_entrega").select("*").order("nombre");
    setZonas((data || []) as ZonaEntrega[]);
  }, []);

  const openNewZona = () => { setEditingZona(null); setZonaForm({ nombre: "", dias: [] }); setZonaDialogOpen(true); };
  const openEditZona = (z: ZonaEntrega) => { setEditingZona(z); setZonaForm({ nombre: z.nombre, dias: [...z.dias] }); setZonaDialogOpen(true); };
  const toggleZonaDia = (dia: string) => {
    setZonaForm((prev) => ({
      ...prev,
      dias: prev.dias.includes(dia) ? prev.dias.filter((d) => d !== dia) : [...prev.dias, dia],
    }));
  };
  const handleSaveZona = async () => {
    if (!zonaForm.nombre.trim()) return;
    if (!zonaForm.dias || zonaForm.dias.length === 0) { showAdminToast("Seleccioná al menos un día de entrega", "error"); return; }
    setZonaSaving(true);
    if (editingZona) {
      await supabase.from("zonas_entrega").update({ nombre: zonaForm.nombre, dias: zonaForm.dias }).eq("id", editingZona.id);
    } else {
      await supabase.from("zonas_entrega").insert({ nombre: zonaForm.nombre, dias: zonaForm.dias });
    }
    setZonaSaving(false);
    setZonaDialogOpen(false);
    fetchZonas();
  };
  const handleDeleteZona = async (id: string) => {
    const { count } = await supabase.from("clientes").select("id", { count: "exact", head: true }).eq("zona_entrega_id", id);
    if (count && count > 0) {
      showAdminToast(`No se puede eliminar: ${count} cliente(s) usan esta zona. Reasignalos primero.`, "error");
      return;
    }
    setConfirmDialog({
      open: true,
      title: "Eliminar zona",
      message: "¿Eliminar esta zona de entrega?",
      onConfirm: async () => {
        await supabase.from("zonas_entrega").delete().eq("id", id);
        fetchZonas();
      },
    });
  };

  useEffect(() => {
    Promise.all([
      fetchClients(),
      fetchZonas(),
      supabase.from("categorias").select("id, nombre").eq("restringida", true),
      supabase.from("cuentas_bancarias").select("id, nombre, alias, tipo_cuenta").eq("activo", true).order("nombre"),
      supabase.from("empresa").select("nombre, cuit, domicilio, telefono").limit(1).single(),
    ]).then(([, , { data: cats }, { data: ctas }, { data: emp }]) => {
      if (cats) setCategoriasRestringidas(cats);
      setCuentasBancarias(ctas || []);
      setEmpresa(emp);
    });
  }, [fetchClients, fetchZonas]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (vendedorRef.current && !vendedorRef.current.contains(e.target as Node)) {
        setVendedorOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const resetForm = () => { setForm(emptyForm); setEditingClient(null); setResetPw(""); setResetMsg(""); setAuthEmail(null); setAuthId(null); };

  const openNew = () => {
    resetForm();
    const defaultZona = zonas.find((z) => z.nombre.toLowerCase().includes("zona 1") || z.nombre === "1") || zonas[0];
    const defaultVendedor = vendedores.find((v) => v.nombre === "Mariano Miguel")?.id || vendedores[0]?.id || "";
    setForm((prev) => ({ ...prev, vendedor_id: defaultVendedor, zona_entrega: defaultZona?.id || "" }));
    setDialogOpen(true);
  };

  const openEdit = async (c: Cliente) => {
    setEditingClient(c);
    setForm({
      codigo_cliente: (c as any).codigo_cliente || "",
      nombre: c.nombre,
      tipo_documento: c.tipo_documento || "",
      numero_documento: c.numero_documento || "",
      cuit: c.cuit || "",
      situacion_iva: c.situacion_iva,
      tipo_factura: c.tipo_factura || "",
      razon_social: c.razon_social || "",
      domicilio: c.domicilio || "",
      domicilio_fiscal: c.domicilio_fiscal || "",
      telefono: c.telefono || "",
      email: c.email || "",
      provincia: c.provincia || "",
      localidad: c.localidad || "",
      codigo_postal: c.codigo_postal || "",
      observacion: c.observacion || "",
      limite_credito: (c as any).limite_credito || 0,
      barrio: (c as any).barrio || "",
      vendedor_id: (c as any).vendedor_id || "",
      zona_entrega: c.zona_entrega || "",
      categorias_permitidas: (c as any).categorias_permitidas || [],
      maps_url: (c as any).maps_url || "",
    });
    setResetPw("");
    setResetMsg("");
    // Fetch auth record
    const { data: authRec } = await supabase.from("clientes_auth").select("id, email").eq("cliente_id", c.id).maybeSingle();
    if (authRec) {
      setAuthEmail(authRec.email);
      setAuthId(authRec.id);
    } else {
      setAuthEmail(null);
      setAuthId(null);
    }
    setDialogOpen(true);
  };

  const [savingClient, setSavingClient] = useState(false);

  const handleSave = async () => {
    if (savingClient) return;
    if (!form.nombre.trim()) { showAdminToast("El nombre del cliente es obligatorio.", "error"); return; }
    setSavingClient(true);
    const selectedZona = zonas.find((z) => z.id === form.zona_entrega);
    const payload = {
      codigo_cliente: form.codigo_cliente || null,
      nombre: form.nombre,
      tipo_documento: form.tipo_documento || null,
      numero_documento: form.numero_documento || null,
      cuit: form.cuit || null,
      situacion_iva: form.situacion_iva,
      tipo_factura: form.tipo_factura || null,
      razon_social: form.razon_social || null,
      domicilio: form.domicilio || null,
      domicilio_fiscal: form.domicilio_fiscal || null,
      telefono: form.telefono || null,
      email: form.email || null,
      provincia: form.provincia || null,
      localidad: form.localidad || null,
      codigo_postal: form.codigo_postal || null,
      observacion: form.observacion || null,
      limite_credito: form.limite_credito || 0,
      barrio: form.barrio || null,
      vendedor_id: form.vendedor_id || null,
      zona_entrega: form.zona_entrega || null,
      dias_entrega: selectedZona ? selectedZona.dias : null,
      categorias_permitidas: form.categorias_permitidas || [],
      maps_url: form.maps_url || null,
    };
    if (editingClient) {
      await supabase.from("clientes").update(payload).eq("id", editingClient.id);
      logAudit({ userName: currentUser?.nombre || "Admin", action: "UPDATE", module: "clientes", entityId: editingClient.id, after: { nombre: payload.nombre } });

      // Auto-create tienda access if client now has email + DNI but no auth yet
      if (!authId && form.email && form.numero_documento) {
        try {
          const res = await fetch("/api/auth/tienda", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create-from-admin",
              nombre: form.nombre,
              email: form.email,
              password: form.numero_documento,
              cliente_id: editingClient.id,
              telefono: form.telefono || "",
            }),
          });
          if (res.ok) showAdminToast("Acceso a tienda online creado automáticamente (contraseña: DNI)", "success");
        } catch { /* silently ignore */ }
      }
    } else {
      const { data: newC } = await supabase.from("clientes").insert(payload).select("id").single();
      logAudit({ userName: currentUser?.nombre || "Admin", action: "CREATE", module: "clientes", entityId: newC?.id, after: { nombre: payload.nombre } });

      // Auto-create tienda online access if email + DNI
      if (newC?.id && form.email && form.numero_documento) {
        try {
          const res = await fetch("/api/auth/tienda", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create-from-admin",
              nombre: form.nombre,
              email: form.email,
              password: form.numero_documento,
              cliente_id: newC.id,
              telefono: form.telefono || "",
            }),
          });
          if (res.ok) {
            showAdminToast("Acceso a tienda online creado (contraseña: DNI)", "success");
          }
        } catch { /* silently ignore */ }
      }
    }
    setDialogOpen(false);
    resetForm();
    fetchClients();
    setSavingClient(false);
  };

  const handleResetPassword = async () => {
    if (!authId || !resetPw) return;
    setResetMsg("");
    try {
      const res = await fetch("/api/auth/tienda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-password", clienteAuthId: authId, newPassword: resetPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetMsg(data.error || "Error al restablecer la contraseña.");
      } else {
        setResetMsg("Contraseña restablecida correctamente.");
        setResetPw("");
      }
    } catch {
      setResetMsg("Error al restablecer la contraseña.");
    }
  };

  const handleDelete = (id: string) => {
    const c = clients.find((cl) => cl.id === id);
    setConfirmDialog({
      open: true,
      title: "Eliminar cliente",
      message: `¿Eliminar a "${c?.nombre || "este cliente"}"?`,
      onConfirm: async () => {
        await supabase.from("clientes").update({ activo: false }).eq("id", id);
        logAudit({ userName: currentUser?.nombre || "Admin", action: "DELETE", module: "clientes", entityId: id, before: { nombre: c?.nombre } });
        fetchClients();
      },
    });
  };

  const openMovimientos = async (client: Cliente) => {
    setMovClient(client);
    setMovOpen(true);
    setMovDesde("");
    setMovHasta("");
    setMovCCFilter("all");
    await fetchMovimientos(client.id, "", "");
  };

  const fetchMovimientos = async (clienteId: string, desde: string, hasta: string) => {
    setMovLoading(true);

    // Build queries
    let ventasQuery = supabase
      .from("ventas")
      .select("id, numero, tipo_comprobante, fecha, created_at, forma_pago, total, subtotal, estado, monto_pagado, remito_origen_id, recargo_porcentaje, venta_items(descripcion, cantidad, presentacion, unidades_por_presentacion, precio_unitario, subtotal, producto_id)")
      .eq("cliente_id", clienteId)
      .neq("estado", "anulada")
      .order("created_at", { ascending: false });
    if (desde) ventasQuery = ventasQuery.gte("fecha", desde);
    if (hasta) ventasQuery = ventasQuery.lte("fecha", hasta);

    const [{ data: ventas }, { data: freshCli }] = await Promise.all([
      ventasQuery,
      supabase.from("clientes").select("saldo").eq("id", clienteId).single(),
    ]);

    // === Tab Compras ===
    const compras: any[] = [];
    for (const v of ventas || []) {
      const isNC = v.tipo_comprobante?.includes("Nota de Crédito");
      compras.push({
        id: v.id,
        fecha: v.fecha,
        created_at: v.created_at || v.fecha,
        tipo: isNC ? "Nota de Crédito" : "Venta",
        descripcion: `${v.tipo_comprobante} ${v.numero}`,
        items: (v as any).venta_items || [],
        forma_pago: v.forma_pago,
        monto: isNC ? -v.total : v.total,
        badge: isNC ? "destructive" : "default",
      });
    }
    setMovimientos(compras);

    const totalVentas = (ventas || []).filter((v: any) => !v.tipo_comprobante?.includes("Nota de Crédito")).reduce((s: number, v: any) => s + v.total, 0);
    const totalNC = (ventas || []).filter((v: any) => v.tipo_comprobante?.includes("Nota de Crédito")).reduce((s: number, v: any) => s + v.total, 0);
    setMovTotals({ ventas: totalVentas, nc: totalNC, totalComprado: totalVentas - totalNC });

    // === Tab Resumen (Libro Diario) ===
    // Fuente de verdad: ventas.total (debe) y ventas.monto_pagado (haber).
    // caja_movimientos solo para detalle de pagos individuales.

    // Fetch caja_movimientos for ALL ventas (payment detail)
    const allVentaIds = (ventas || []).map((v: any) => v.id);
    let cajaByVenta = new Map<string, { metodo_pago: string; monto: number }[]>();
    if (allVentaIds.length > 0) {
      // Batch in groups of 100 to avoid URL length limits
      for (let i = 0; i < allVentaIds.length; i += 100) {
        const batch = allVentaIds.slice(i, i + 100);
        const { data: cajaData } = await supabase
          .from("caja_movimientos")
          .select("referencia_id, metodo_pago, monto")
          .in("referencia_id", batch)
          .eq("referencia_tipo", "venta")
          .eq("tipo", "ingreso");
        for (const cm of cajaData || []) {
          if (!cm.referencia_id) continue;
          const arr = cajaByVenta.get(cm.referencia_id) || [];
          arr.push({ metodo_pago: cm.metodo_pago, monto: cm.monto });
          cajaByVenta.set(cm.referencia_id, arr);
        }
      }
    }

    // Build libro diario entries
    const entries: { id: string; fecha: string; created_at: string; comprobante: string; debe: number; haber: number; forma_pago: string; descripcion: string; venta_id?: string }[] = [];

    const shortCompType = (tipo: string) => {
      if (tipo?.includes("Nota de Crédito")) return tipo.replace(/Nota de Crédito\s*/i, "NC ");
      if (tipo?.includes("Nota de Débito")) return tipo.replace(/Nota de Débito\s*/i, "ND ");
      return tipo?.replace(/Factura\s*/i, "FC ").replace(/Remito\s*/i, "RM ") || "";
    };

    // ═══ LIBRO DIARIO — Algoritmo simple y correcto ═══
    //
    // DEBE = venta.total (SIEMPRE, sin excepciones — incluye recargos)
    // HABER = NC totals + pagos reales (caja_movimientos + CC cobros)
    // SALDO = DEBE - HABER

    // Pre-compute: NC ventas by parent
    const ncVentasByParent = new Map<string, typeof ventas>();
    for (const v of ventas || []) {
      if (v.tipo_comprobante?.includes("Nota de Crédito") && v.remito_origen_id) {
        const arr = ncVentasByParent.get(v.remito_origen_id) || [];
        arr.push(v);
        ncVentasByParent.set(v.remito_origen_id, arr);
      }
    }

    // Track NC venta IDs that are handled inline (grouped with parent)
    const handledNCIds = new Set<string>();

    for (const v of ventas || []) {
      const isNC = v.tipo_comprobante?.includes("Nota de Crédito");
      const isND = v.tipo_comprobante?.includes("Nota de Débito");

      // Skip NCs linked to a parent — they're shown inline with parent
      if (isNC && v.remito_origen_id && handledNCIds.has(v.id)) continue;
      if (isNC) {
        if (!v.remito_origen_id) {
          // Standalone NC
          const comp = `${shortCompType(v.tipo_comprobante)} ${v.numero}`.replace(/\s+/g, " ").trim();
          entries.push({
            id: `v-${v.id}-nc`, fecha: v.fecha, created_at: v.created_at || v.fecha,
            comprobante: comp, debe: 0, haber: v.total, forma_pago: v.forma_pago || "",
            descripcion: "", venta_id: v.id,
          });
        }
        continue;
      }

      const comp = `${shortCompType(v.tipo_comprobante)} ${v.numero}`.replace(/\s+/g, " ").trim();
      const fp = v.forma_pago || "";
      const cajaEntries = cajaByVenta.get(v.id);
      const cajaTotal = cajaEntries ? cajaEntries.reduce((s, e) => s + e.monto, 0) : 0;
      const montoPagado = v.monto_pagado || 0;
      const debeFormaPago = (fp === "Cuenta Corriente" || fp === "Pendiente") ? fp : "";
      const baseTs = v.created_at || v.fecha;

      // ── 1. PEDIDO → debe = venta.total (siempre) ──
      entries.push({
        id: `v-${v.id}-debe`, fecha: v.fecha, created_at: baseTs,
        comprobante: comp, debe: v.total, haber: 0, forma_pago: debeFormaPago, descripcion: "", venta_id: v.id,
      });

      // ── 2. NOTAS DE CRÉDITO → haber (grouped after pedido) ──
      const linkedNCs = ncVentasByParent.get(v.id) || [];
      for (const nc of linkedNCs) {
        const ncComp = `${shortCompType(nc.tipo_comprobante)} ${nc.numero}`.replace(/\s+/g, " ").trim();
        entries.push({
          id: `v-${nc.id}-nc`, fecha: v.fecha,
          created_at: baseTs + "T00:00:00.2",
          comprobante: ncComp, debe: 0, haber: nc.total, forma_pago: nc.forma_pago || "",
          descripcion: "", venta_id: nc.id,
        });
        handledNCIds.add(nc.id);
      }

      // ── 3. PAGOS → haber ──
      // Cap: min(monto_pagado, total - NC) para que el running saldo no quede negativo
      // cuando la venta fue pagada completa y después se hizo NC.
      const ncTotalForThis = linkedNCs.reduce((s, nc) => s + nc.total, 0);
      const maxPayable = Math.max(0, v.total - ncTotalForThis);
      const cappedPaid = Math.min(montoPagado, maxPayable);
      if (!isND && cappedPaid > 0) {
        if (cajaEntries && cajaEntries.length > 0) {
          let remaining = cappedPaid;
          for (let ci = 0; ci < cajaEntries.length; ci++) {
            if (remaining <= 0) break;
            const ce = cajaEntries[ci];
            const show = Math.min(ce.monto, remaining);
            entries.push({
              id: `v-${v.id}-pago-${ci}`, fecha: v.fecha,
              created_at: baseTs + `T00:00:00.${4 + ci}`,
              comprobante: comp, debe: 0, haber: show, forma_pago: ce.metodo_pago,
              descripcion: "", venta_id: v.id,
            });
            remaining = Math.round((remaining - show) * 100) / 100;
          }
          // Si queda remaining (cobro allocation no en caja)
          if (remaining > 0.5) {
            entries.push({
              id: `v-${v.id}-cobro`, fecha: v.fecha,
              created_at: baseTs + "T00:00:00.9",
              comprobante: comp, debe: 0, haber: remaining, forma_pago: "Cobro",
              descripcion: "Cobro aplicado", venta_id: v.id,
            });
          }
        } else {
          // Sin caja entries: mostrar pago capeado
          entries.push({
            id: `v-${v.id}-pago`, fecha: v.fecha,
            created_at: baseTs + "T00:00:00.4",
            comprobante: comp, debe: 0, haber: cappedPaid, forma_pago: fp || "Pago",
            descripcion: "", venta_id: v.id,
          });
        }
      }
    }

    // Sort chronologically
    entries.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      return (a.created_at || "").localeCompare(b.created_at || "");
    });

    // Calculate running saldo (debe increases, haber decreases)
    let runSaldo = 0;
    const ccRows = entries.map((e) => {
      runSaldo = Math.round((runSaldo + e.debe - e.haber) * 100) / 100;
      return { ...e, saldo: runSaldo };
    });
    setMovCCRows(ccRows);

    // Totales: calcular desde ventas directamente
    // PENDIENTE = SUM(total) - SUM(NC) = neto facturado
    // COBRADO = SUM(MIN(monto_pagado, total - NC_vinculada)) = pagado sin exceder lo adeudado
    // SALDO = PENDIENTE - COBRADO
    //
    // El cap evita que ventas pagadas completas + NC generen "saldo a favor" fantasma.
    const ncTotalByParent = new Map<string, number>();
    for (const v of ventas || []) {
      if (v.tipo_comprobante?.includes("Nota de Crédito") && v.remito_origen_id) {
        ncTotalByParent.set(v.remito_origen_id, (ncTotalByParent.get(v.remito_origen_id) || 0) + v.total);
      }
    }
    const ventasPendiente = (ventas || [])
      .filter((v: any) => !v.tipo_comprobante?.includes("Nota de Crédito") && !v.tipo_comprobante?.includes("Nota de Débito"))
      .reduce((s: number, v: any) => s + v.total, 0);
    const ncTotalResumen = (ventas || [])
      .filter((v: any) => v.tipo_comprobante?.includes("Nota de Crédito"))
      .reduce((s: number, v: any) => s + v.total, 0);
    const ventasCobrado = (ventas || [])
      .filter((v: any) => !v.tipo_comprobante?.includes("Nota de Crédito") && !v.tipo_comprobante?.includes("Nota de Débito"))
      .reduce((s: number, v: any) => {
        const ncForThis = ncTotalByParent.get(v.id) || 0;
        const maxCobrable = Math.max(0, v.total - ncForThis);
        return s + Math.min(v.monto_pagado || 0, maxCobrable);
      }, 0);
    const totalPendiente = Math.round((ventasPendiente - ncTotalResumen) * 100) / 100;
    const totalCobrado = Math.round(ventasCobrado * 100) / 100;
    const saldoCalculado = Math.round((totalPendiente - totalCobrado) * 100) / 100;
    setMovCCTotals({ debe: totalPendiente, haber: totalCobrado, saldo: saldoCalculado, saldoInicial: 0 });

    // === Tab Cobros ===
    let cobrosQuery = supabase
      .from("cobros")
      .select("id, numero, fecha, hora, monto, forma_pago, observacion, cuenta_bancaria_id, cobro_items(venta_id, monto_aplicado, ventas(numero, total))")
      .eq("cliente_id", clienteId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });
    if (desde) cobrosQuery = cobrosQuery.gte("fecha", desde);
    if (hasta) cobrosQuery = cobrosQuery.lte("fecha", hasta);
    const { data: cobrosData } = await cobrosQuery;
    setCobrosCliente(cobrosData || []);

    setMovLoading(false);
  };

  const recalcularSaldo = async () => {
    if (!movClient?.id) return;
    const clienteId = movClient.id;

    const { data: freshCli } = await supabase.from("clientes").select("saldo").eq("id", clienteId).single();
    const saldoActual = freshCli?.saldo ?? 0;

    // ═══ Recalcular saldo — algoritmo simple y correcto ═══
    // PENDIENTE = SUM(venta.total) - SUM(NC.total) = neto facturado
    // COBRADO = SUM(monto_pagado) = total pagado
    // SALDO = PENDIENTE - COBRADO

    const { data: allVentas } = await supabase.from("ventas")
      .select("id, numero, total, monto_pagado, tipo_comprobante, forma_pago, remito_origen_id")
      .eq("cliente_id", clienteId).neq("estado", "anulada");
    if (!allVentas) { showAdminToast("Error al recalcular", "error"); return; }

    // Build NC totals per parent venta
    const ncByParentRecalc = new Map<string, number>();
    for (const v of allVentas) {
      if (v.tipo_comprobante?.includes("Nota de Crédito") && v.remito_origen_id) {
        ncByParentRecalc.set(v.remito_origen_id, (ncByParentRecalc.get(v.remito_origen_id) || 0) + v.total);
      }
    }

    let totalDebe = 0;
    let totalHaber = 0;

    for (const v of allVentas) {
      const isNC = v.tipo_comprobante?.includes("Nota de Crédito");
      const isND = v.tipo_comprobante?.includes("Nota de Débito");

      if (isNC) {
        // NC reduce el pendiente (neto facturado)
        totalDebe -= v.total;
        continue;
      }

      // DEBE = venta.total
      totalDebe += v.total;

      // HABER = MIN(monto_pagado, total - NC_vinculada)
      // Cap para que ventas pagadas completas + NC no generen saldo a favor fantasma
      if (!isND) {
        const ncForThis = ncByParentRecalc.get(v.id) || 0;
        const maxCobrable = Math.max(0, v.total - ncForThis);
        totalHaber += Math.min(v.monto_pagado || 0, maxCobrable);
      }
    }

    const saldoFinal = Math.round((totalDebe - totalHaber) * 100) / 100;
    console.log("[Recalcular] Debe:", totalDebe, "Haber:", totalHaber, "Saldo:", saldoFinal);

    await supabase.from("clientes").update({ saldo: saldoFinal }).eq("id", clienteId);

    const { data: lastRow } = await supabase.from("cuenta_corriente").select("id")
      .eq("cliente_id", clienteId)
      .order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(1);
    if (lastRow && lastRow.length > 0) {
      await supabase.from("cuenta_corriente").update({ saldo: saldoFinal }).eq("id", lastRow[0].id);
    }

    showAdminToast(
      `Pendiente: ${formatCurrency(totalDebe)} | Cobrado: ${formatCurrency(totalHaber)} → Saldo: ${formatCurrency(saldoFinal)}`,
      saldoActual !== saldoFinal ? "success" : "info"
    );

    fetchClients();
    fetchMovimientos(movClient.id, movDesde, movHasta);
  };

  const openPayMov = (m: any) => {
    setPayMovVenta(m);
    setPayMovMonto(m.saldo_pendiente || 0);
    setPayMovMetodo("Efectivo");
    setPayMovCuentaBancariaId("");
    setPayMovOpen(true);
  };

  const handlePayMov = async () => {
    if (payMovSaving) return; // Guard against double-click
    if (!payMovVenta || payMovMonto <= 0 || !movClient?.id) return;
    setPayMovSaving(true);
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const hora = nowTimeARG();
    const saldoPend = payMovVenta.saldo_pendiente || 0;
    const montoReal = Math.min(payMovMonto, saldoPend);
    const restante = saldoPend - montoReal;

    const payMovCuentaSel = payMovCuentaBancariaId ? cuentasBancarias.find((c) => c.id === payMovCuentaBancariaId) : null;
    await supabase.from("caja_movimientos").insert({
      fecha: hoy, hora, tipo: "ingreso",
      descripcion: `Cobro deuda ${payMovVenta.descripcion} — ${clients.find((c) => c.id === movClient?.id)?.nombre || ""}${payMovMetodo === "Transferencia" && payMovCuentaSel ? ` → ${payMovCuentaSel.nombre}` : ""}`,
      metodo_pago: payMovMetodo,
      monto: montoReal,
      referencia_id: payMovVenta.id,
      referencia_tipo: "venta",
      ...(payMovMetodo === "Transferencia" && payMovCuentaSel ? { cuenta_bancaria: payMovCuentaSel.nombre } : {}),
    });

    // Atomic saldo update via RPC
    const { data: newSaldo, error: saldoErr } = await supabase.rpc("atomic_update_client_saldo", {
      p_client_id: movClient?.id,
      p_change: -montoReal,
    });
    if (saldoErr) {
      showAdminToast("Error al actualizar saldo: " + saldoErr.message, "error");
      setPayMovSaving(false);
      return;
    }

    const { error: ccError } = await supabase.from("cuenta_corriente").insert({
      cliente_id: movClient?.id,
      fecha: hoy,
      comprobante: `Cobro deuda - ${payMovVenta.descripcion}`,
      descripcion: `Pago de deuda (${payMovMetodo}) — desde Clientes`,
      debe: 0,
      haber: montoReal,
      saldo: newSaldo,
      forma_pago: payMovMetodo,
      venta_id: payMovVenta.id,
    });

    if (ccError) {
      // Rollback: revert saldo change since CC entry failed
      await supabase.rpc("atomic_update_client_saldo", { p_client_id: movClient?.id, p_change: montoReal });
      showAdminToast("Error al registrar en cuenta corriente. Saldo revertido.", "error");
      setPayMovSaving(false);
      return;
    }

    setPayMovSaving(false);
    setPayMovOpen(false);
    if (movClient?.id) fetchMovimientos(movClient.id, movDesde, movHasta);
    fetchClients();
  };

  // Cobranzas functions
  const clientsConDeuda = useMemo(() => clients.filter((c) => c.saldo > 0).sort((a, b) => b.saldo - a.saldo), [clients]);
  const totalPendiente = useMemo(() => clientsConDeuda.reduce((a, c) => a + c.saldo, 0), [clientsConDeuda]);

  const filteredCobranzas = useMemo(() => {
    if (!cobranzasSearch) return clientsConDeuda;
    const s = norm(cobranzasSearch);
    return clientsConDeuda.filter((c) => norm(c.nombre).includes(s));
  }, [clientsConDeuda, cobranzasSearch]);

  const openCobro = (client: Cliente) => {
    setCobroClient(client);
    setCobroOpen(true);
  };

  const exportCSV = () => {
    const header = "ID,Cliente,Saldo\n";
    const rows = clientsConDeuda.map((c) => `"${c.id}","${c.nombre}",${c.saldo}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cobranzas.csv";
    a.click();
  };

  const handleExportClients = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((c) => {
      const zona = zonas.find((z) => z.id === c.zona_entrega);
      const vendedor = vendedores.find((v) => v.id === (c as any).vendedor_id);
      return {
        "Código": (c as any).codigo_cliente || "",
        "Nombre": c.nombre,
        "DNI": c.numero_documento || "",
        "CUIT": c.cuit || "",
        "Situacion IVA": c.situacion_iva,
        "Tipo Factura": c.tipo_factura || "",
        "Razon Social": c.razon_social || "",
        "Domicilio": c.domicilio || "",
        "Domicilio Fiscal": c.domicilio_fiscal || "",
        "Telefono": c.telefono || "",
        "Email": c.email || "",
        "Provincia": c.provincia || "",
        "Localidad": c.localidad || "",
        "Codigo Postal": c.codigo_postal || "",
        "Barrio": (c as any).barrio || "",
        "Zona Entrega": zona?.nombre || "",
        "Vendedor": vendedor?.nombre || "",
        "Saldo": c.saldo,
        "Observacion": c.observacion || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 10 }, // Código
      { wch: 30 }, // Nombre
      { wch: 12 }, // DNI
      { wch: 14 }, // CUIT
      { wch: 22 }, // Sit IVA
      { wch: 12 }, // Tipo Factura
      { wch: 30 }, // Razon Social
      { wch: 30 }, // Domicilio
      { wch: 30 }, // Dom Fiscal
      { wch: 16 }, // Telefono
      { wch: 28 }, // Email
      { wch: 16 }, // Provincia
      { wch: 16 }, // Localidad
      { wch: 10 }, // CP
      { wch: 16 }, // Barrio
      { wch: 16 }, // Zona
      { wch: 20 }, // Vendedor
      { wch: 12 }, // Saldo
      { wch: 30 }, // Observacion
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, `Clientes_${todayARG()}.xlsx`);
    showAdminToast(`${rows.length} clientes exportados`, "success");
  };

  const handleImportClients = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportProgress("Leyendo archivo...");

    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws);

      if (rows.length === 0) {
        showAdminToast("El archivo está vacío", "error");
        setImporting(false);
        return;
      }

      const normalize = (key: string) => key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const getVal = (row: Record<string, any>, ...keys: string[]) => {
        for (const k of Object.keys(row)) {
          const nk = normalize(k);
          for (const target of keys) {
            if (nk === normalize(target) || nk.includes(normalize(target))) return String(row[k] || "").trim();
          }
        }
        return "";
      };

      // Build zona lookup
      const zonaMap: Record<string, string> = {};
      zonas.forEach((z) => { zonaMap[z.nombre.toLowerCase()] = z.id; });

      // Build vendedor lookup
      const vendMap: Record<string, string> = {};
      vendedores.forEach((v) => { vendMap[v.nombre.toLowerCase()] = v.id; });

      let imported = 0, updated = 0, failed = 0;

      // Pre-parse all rows into payloads
      const parsedRows: { row: any; nombre: string; cuit: string; payload: Record<string, any> }[] = [];
      for (const row of rows) {
        const nombre = getVal(row, "nombre", "cliente", "razon social");
        if (!nombre) { failed++; continue; }

        const codigo = getVal(row, "codigo", "cod");
        const dni = getVal(row, "dni", "numero documento", "documento");
        const cuit = getVal(row, "cuit");
        const sitIva = getVal(row, "situacion iva", "iva") || "Consumidor final";
        const tipoFactura = getVal(row, "tipo factura");
        const razonSocial = getVal(row, "razon social");
        const domicilio = getVal(row, "domicilio", "direccion");
        const domicilioFiscal = getVal(row, "domicilio fiscal");
        const telefono = getVal(row, "telefono", "tel", "celular");
        const email = getVal(row, "email", "correo", "mail");
        const provincia = getVal(row, "provincia");
        const localidad = getVal(row, "localidad", "ciudad");
        const codigoPostal = getVal(row, "codigo postal", "cp");
        const barrio = getVal(row, "barrio");
        const zonaName = getVal(row, "zona entrega", "zona");
        const vendedorName = getVal(row, "vendedor");
        const observacion = getVal(row, "observacion", "notas");

        const payload: Record<string, any> = {
          nombre,
          situacion_iva: sitIva,
          codigo_cliente: codigo || null,
          numero_documento: dni || null,
          cuit: cuit || null,
          tipo_factura: tipoFactura || null,
          razon_social: razonSocial || null,
          domicilio: domicilio || null,
          domicilio_fiscal: domicilioFiscal || null,
          telefono: telefono || null,
          email: email || null,
          provincia: provincia || null,
          localidad: localidad || null,
          codigo_postal: codigoPostal || null,
          barrio: barrio || null,
          observacion: observacion || null,
          activo: true,
        };

        if (zonaName && zonaMap[zonaName.toLowerCase()]) {
          payload.zona_entrega = zonaMap[zonaName.toLowerCase()];
          const z = zonas.find((zz) => zz.id === payload.zona_entrega);
          if (z) payload.dias_entrega = z.dias;
        }
        if (vendedorName && vendMap[vendedorName.toLowerCase()]) {
          payload.vendedor_id = vendMap[vendedorName.toLowerCase()];
        }

        parsedRows.push({ row, nombre, cuit, payload });
      }

      setImportProgress("Buscando clientes existentes...");

      // Batch fetch existing clients by CUIT
      const allCuits = parsedRows.map((r) => r.cuit).filter(Boolean);
      const cuitMap = new Map<string, string>();
      if (allCuits.length > 0) {
        const { data: byCuits } = await supabase.from("clientes").select("id, cuit").eq("activo", true).in("cuit", allCuits);
        if (byCuits) byCuits.forEach((c) => { if (c.cuit) cuitMap.set(c.cuit, c.id); });
      }

      // Batch fetch existing clients by nombre (for rows without CUIT match)
      const nombresWithoutCuit = parsedRows
        .filter((r) => !r.cuit || !cuitMap.has(r.cuit))
        .map((r) => r.nombre);
      const nameMap = new Map<string, string>();
      if (nombresWithoutCuit.length > 0) {
        const { data: byNames } = await supabase.from("clientes").select("id, nombre").eq("activo", true).in("nombre", nombresWithoutCuit);
        if (byNames) byNames.forEach((c) => nameMap.set(c.nombre, c.id));
      }

      // Process rows using lookup maps
      const newRecords: Record<string, any>[] = [];
      for (let i = 0; i < parsedRows.length; i++) {
        setImportProgress(`Procesando ${i + 1} de ${parsedRows.length}...`);
        const { nombre, cuit, payload } = parsedRows[i];

        let existingId: string | null = null;
        if (cuit && cuitMap.has(cuit)) existingId = cuitMap.get(cuit)!;
        if (!existingId && nameMap.has(nombre)) existingId = nameMap.get(nombre)!;

        if (existingId) {
          await supabase.from("clientes").update(payload).eq("id", existingId);
          updated++;
        } else {
          newRecords.push(payload);
        }
      }

      // Batch insert new clients
      if (newRecords.length > 0) {
        setImportProgress(`Insertando ${newRecords.length} clientes nuevos...`);
        const { error: insertError } = await supabase.from("clientes").insert(newRecords);
        if (insertError) throw insertError;
        imported = newRecords.length;
      }

      showAdminToast(`Importación completa: ${imported} nuevos, ${updated} actualizados${failed > 0 ? `, ${failed} omitidos` : ""}`, "success");
      fetchClients();
    } catch (err: any) {
      showAdminToast("Error al importar: " + (err.message || "Error desconocido"), "error");
    }
    setImporting(false);
    setImportProgress("");
  };

  const filtered = useMemo(() => {
    const searchNorm = norm(search);
    const domicilioNorm = norm(filterDomicilio);
    const result = clients.filter(
      (c) =>
        (norm(c.nombre).includes(searchNorm) || (c.cuit || "").includes(search) || ((c as any).codigo_cliente || "").includes(search)) &&
        (!vendedorFilter || (c as any).vendedor_id === vendedorFilter) &&
        (!filterDomicilio || norm(c.domicilio || "").includes(domicilioNorm)) &&
        (!filterZona || c.zona_entrega === filterZona)
    );
    switch (sortOrder) {
      case "recent": return result.sort((a, b) => new Date((b as any).created_at || 0).getTime() - new Date((a as any).created_at || 0).getTime());
      case "az": return result.sort((a, b) => a.nombre.localeCompare(b.nombre));
      case "za": return result.sort((a, b) => b.nombre.localeCompare(a.nombre));
      case "saldo": return result.sort((a, b) => b.saldo - a.saldo);
      default: return result;
    }
  }, [clients, search, vendedorFilter, filterDomicilio, filterZona, sortOrder]);

  const withBalance = useMemo(() => clients.filter((c) => c.saldo > 0).length, [clients]);
  const withFavor = useMemo(() => clients.filter((c) => c.saldo < 0).length, [clients]);
  const recentClients = useMemo(() => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return clients.filter((c) => c.created_at && c.created_at > cutoff);
  }, [clients]);
  const topDeudores = useMemo(() =>
    clients.filter((c) => c.saldo > 0).sort((a, b) => b.saldo - a.saldo).slice(0, 8),
  [clients]);
  const topFavor = useMemo(() =>
    clients.filter((c) => c.saldo < 0).sort((a, b) => a.saldo - b.saldo).slice(0, 8),
  [clients]);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const toggleCard = (key: string) => setExpandedCard((prev) => prev === key ? null : key);

  const f = (key: keyof typeof form, value: string | string[]) => setForm({ ...form, [key]: value });

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Clientes</h1>
            <p className="text-sm text-muted-foreground">{clients.length} clientes registrados</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeTab === "cobranzas" && (
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Exportar</span>
            </Button>
          )}
          {activeTab === "listado" && (
            <>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportClients} />
              <Button variant="outline" size="sm" onClick={handleExportClients}>
                <FileSpreadsheet className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Exportar Excel</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" /> : <Upload className="w-4 h-4 sm:mr-2" />}
                <span className="hidden sm:inline">{importing ? importProgress : "Importar Excel"}</span>
              </Button>
            </>
          )}
          <Link href="/admin/clientes/mapa">
            <Button variant="outline" size="sm" className="gap-1.5"><MapPin className="w-4 h-4" /><span className="hidden sm:inline">Ver mapa</span></Button>
          </Link>
          <Button onClick={openNew}><Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Nuevo cliente</span></Button>
        </div>
      </div>

      {/* Main Tabs: Listado / Cobranzas */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab("listado")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "listado" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Users className="w-4 h-4 inline mr-2" />Listado
        </button>
        <button
          onClick={() => setActiveTab("cobranzas")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "cobranzas" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <DollarSign className="w-4 h-4 inline mr-2" />Cobranzas
        </button>
        <button
          onClick={() => setActiveTab("zonas")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === "zonas" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <MapPin className="w-4 h-4 inline mr-2" />Zonas de entrega
        </button>
      </div>

      {activeTab === "listado" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Total Clientes */}
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
                <div><p className="text-xs text-muted-foreground">Total clientes</p><p className="text-xl font-bold">{clients.length}</p></div>
              </CardContent>
            </Card>

            {/* Nuevos últimas 24hs */}
            <Card
              className={`transition-all ${recentClients.length > 0 ? "cursor-pointer hover:shadow-md" : ""}`}
              onClick={() => recentClients.length > 0 && toggleCard("recientes")}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><Plus className="w-5 h-5 text-blue-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Nuevos (24hs)</p>
                    <p className="text-xl font-bold">{recentClients.length}</p>
                  </div>
                  {recentClients.length > 0 && <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedCard === "recientes" ? "rotate-180" : ""}`} />}
                </div>
                {expandedCard === "recientes" && recentClients.length > 0 && (
                  <div className="mt-3 pt-2 border-t space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {recentClients.map((c) => (
                      <div key={c.id} className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground truncate mr-2">{c.nombre}</span>
                        <span className="font-medium shrink-0 text-blue-600">{new Date(c.created_at!).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Saldo pendiente */}
            <Card
              className={`transition-all ${withBalance > 0 ? "cursor-pointer hover:shadow-md" : ""}`}
              onClick={() => withBalance > 0 && toggleCard("deudores")}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><Users className="w-5 h-5 text-orange-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                    <p className="text-xl font-bold">{withBalance}</p>
                  </div>
                  {withBalance > 0 && <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedCard === "deudores" ? "rotate-180" : ""}`} />}
                </div>
                {expandedCard === "deudores" && topDeudores.length > 0 && (
                  <div className="mt-3 pt-2 border-t space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {topDeudores.map((c) => (
                      <div key={c.id} className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground truncate mr-2">{c.nombre}</span>
                        <span className="font-medium shrink-0 text-orange-600">{formatCurrency(c.saldo)}</span>
                      </div>
                    ))}
                    {withBalance > 8 && <p className="text-[10px] text-muted-foreground text-center pt-1">y {withBalance - 8} más...</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Saldo a favor */}
            <Card
              className={`transition-all ${withFavor > 0 ? "cursor-pointer hover:shadow-md" : ""}`}
              onClick={() => withFavor > 0 && toggleCard("favor")}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Users className="w-5 h-5 text-emerald-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Saldo a favor</p>
                    <p className="text-xl font-bold">{withFavor}</p>
                  </div>
                  {withFavor > 0 && <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedCard === "favor" ? "rotate-180" : ""}`} />}
                </div>
                {expandedCard === "favor" && topFavor.length > 0 && (
                  <div className="mt-3 pt-2 border-t space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {topFavor.map((c) => (
                      <div key={c.id} className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground truncate mr-2">{c.nombre}</span>
                        <span className="font-medium shrink-0 text-emerald-600">{formatCurrency(Math.abs(c.saldo))}</span>
                      </div>
                    ))}
                    {withFavor > 8 && <p className="text-[10px] text-muted-foreground text-center pt-1">y {withFavor - 8} más...</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-visible">
            <CardContent className="pt-6 overflow-visible">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground font-semibold tracking-wide">NOMBRE / CUIT</span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar por nombre o CUIT..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground font-semibold tracking-wide">DOMICILIO</span>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Filtrar por domicilio..." value={filterDomicilio} onChange={(e) => setFilterDomicilio(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground font-semibold tracking-wide">ZONA DE ENTREGA</span>
                  <Select value={filterZona || "all"} onValueChange={(v) => setFilterZona(v === "all" ? "" : (v || ""))}>
                    <SelectTrigger>
                      {filterZona ? (zonas.find(z => z.id === filterZona)?.nombre || "Todas las zonas") : "Todas las zonas"}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las zonas</SelectItem>
                      {zonas.map((z) => (
                        <SelectItem key={z.id} value={z.id}>{z.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {vendedores.length > 0 && (
                  <div className="space-y-1.5" ref={vendedorRef}>
                    <span className="text-xs text-muted-foreground font-semibold tracking-wide">VENDEDOR</span>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Filtrar por vendedor..."
                        value={vendedorFilter ? (vendedores.find((v) => v.id === vendedorFilter)?.nombre ?? vendedorSearch) : vendedorSearch}
                        onChange={(e) => { setVendedorSearch(e.target.value); setVendedorFilter(""); setVendedorOpen(true); }}
                        onFocus={() => setVendedorOpen(true)}
                        className="pl-9"
                      />
                      {vendedorFilter && (
                        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setVendedorFilter(""); setVendedorSearch(""); }}>
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {vendedorOpen && !vendedorFilter && (
                        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                          <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setVendedorFilter(""); setVendedorSearch(""); setVendedorOpen(false); }}>
                            Todos los vendedores
                          </button>
                          {vendedores.filter((v) => norm(v.nombre).includes(norm(vendedorSearch))).map((v) => (
                            <button key={v.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                              onClick={() => { setVendedorFilter(v.id); setVendedorSearch(""); setVendedorOpen(false); }}>
                              {v.nombre}
                            </button>
                          ))}
                          {vendedores.filter((v) => norm(v.nombre).includes(norm(vendedorSearch))).length === 0 && (
                            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground font-semibold tracking-wide">ORDENAR POR</span>
                  <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="az">A → Z</SelectItem>
                      <SelectItem value="za">Z → A</SelectItem>
                      <SelectItem value="recent">Más recientes</SelectItem>
                      <SelectItem value="saldo">Mayor deuda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-0">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                {/* ── Mobile card list ── */}
                <div className="sm:hidden divide-y">
                  {filtered.map((client) => {
                    const zona = zonas.find((z) => z.id === client.zona_entrega);
                    return (
                      <div key={client.id} className="py-3 px-4 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                        <div className="flex-1 min-w-0" onClick={() => openMovimientos(client)}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{client.nombre}</span>
                            {(client as any).origen === "tienda" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-pink-300 text-pink-600 bg-pink-50">Tienda</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {zona && <span className="text-xs text-blue-600">{zona.nombre}</span>}
                            {client.telefono && <span className="text-xs text-muted-foreground">{client.telefono}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right min-w-[70px]">
                          {client.saldo > 0 ? (
                            <span className="font-semibold text-orange-500 text-sm">{formatCurrency(client.saldo)}</span>
                          ) : client.saldo < 0 ? (
                            <span className="font-semibold text-emerald-600 text-xs">+{formatCurrency(Math.abs(client.saldo))}</span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openMovimientos(client)} title="Movimientos"><History className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEdit(client)} title="Editar"><Edit className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">Sin resultados</div>}
                </div>
                {/* ── Desktop table ── */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-3 px-4 font-medium w-16">Cód.</th>
                        <th className="text-left py-3 px-4 font-medium">Cliente</th>
                        <th className="text-left py-3 px-4 font-medium">CUIT</th>
                        <th className="text-left py-3 px-4 font-medium">Situación IVA</th>
                        <th className="text-left py-3 px-4 font-medium">Zona</th>
                        <th className="text-left py-3 px-4 font-medium">Contacto</th>
                        <th className="text-right py-3 px-4 font-medium">Saldo</th>
                        <th className="text-right py-3 px-4 font-medium w-24">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((client) => {
                        const zona = zonas.find((z) => z.id === client.zona_entrega);
                        return (
                          <tr key={client.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                            <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{(client as any).codigo_cliente || "—"}</td>
                            <td className="py-3 px-4 font-medium">
                              <div className="flex items-center gap-2">
                                {client.nombre}
                                {(client as unknown as Record<string, unknown>).origen === "tienda" && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-pink-300 text-pink-600 bg-pink-50">Tienda</Badge>
                                )}
                              </div>
                              {client.domicilio && (
                                <a
                                  href={(client as any).maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([client.domicilio, client.localidad, client.provincia].filter(Boolean).join(", "))}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline mt-0.5 inline-flex items-center gap-1"
                                >
                                  <MapPin className="w-3 h-3" />
                                  {client.domicilio}
                                </a>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{client.cuit || "—"}</td>
                            <td className="py-3 px-4">
                              <Badge variant={client.situacion_iva === "Responsable Inscripto" ? "default" : "secondary"} className="text-xs font-normal">
                                {client.situacion_iva}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              {zona ? (
                                <div>
                                  <Badge variant="outline" className="text-xs font-normal border-blue-300 text-blue-700 bg-blue-50">
                                    <MapPin className="w-3 h-3 mr-1" />{zona.nombre}
                                  </Badge>
                                  {zona.dias && zona.dias.length > 0 && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{zona.dias.join(", ")}</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3 text-muted-foreground text-xs">
                                {client.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.telefono}</span>}
                                {client.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{client.email}</span>}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div>
                                {client.saldo > 0 ? (
                                  <span className="font-semibold text-orange-500">{formatCurrency(client.saldo)}</span>
                                ) : client.saldo < 0 ? (
                                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                                    A favor: {formatCurrency(Math.abs(client.saldo))}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                                {(client as any).limite_credito > 0 && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">Lím: {formatCurrency((client as any).limite_credito)}</p>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openMovimientos(client)} title="Movimientos"><History className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(client)} title="Editar"><Edit className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(client.id)} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "cobranzas" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
                <div><p className="text-xs text-muted-foreground">Clientes con deuda</p><p className="text-xl font-bold">{clientsConDeuda.length}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-orange-500" /></div>
                <div><p className="text-xs text-muted-foreground">Total pendiente</p><p className="text-xl font-bold text-orange-500">{formatCurrency(totalPendiente)}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-500" /></div>
                <div><p className="text-xs text-muted-foreground">Mayor deudor</p><p className="text-xl font-bold">{clientsConDeuda[0]?.nombre || "—"}</p></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
                  <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Filtrar cliente..." value={cobranzasSearch} onChange={(e) => setCobranzasSearch(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={async () => {
                  const { data: allClients } = await supabase.from("clientes").select("id, nombre, saldo").eq("activo", true);
                  const issues: string[] = [];
                  for (const c of allClients || []) {
                    const { data: ccRows } = await supabase.from("cuenta_corriente").select("debe, haber").eq("cliente_id", c.id);
                    const ccSaldo = (ccRows || []).reduce((a: number, r: any) => a + (r.debe || 0) - (r.haber || 0), 0);
                    const diff = Math.abs(Math.round(c.saldo) - Math.round(ccSaldo));
                    if (diff > 1) issues.push(`${c.nombre}: saldo ${formatCurrency(c.saldo)} vs CC ${formatCurrency(ccSaldo)} (dif: ${formatCurrency(diff)})`);
                  }
                  if (issues.length === 0) {
                    showAdminToast("Todos los saldos coinciden con la cuenta corriente.", "success");
                  } else {
                    showAdminToast(`Inconsistencias encontradas (${issues.length}): ${issues.slice(0, 10).join(" | ")}${issues.length > 10 ? ` ...y ${issues.length - 10} más` : ""}`, "error");
                  }
                }}>
                  Conciliar CC
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-0">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : filteredCobranzas.length === 0 ? (
                <p className="text-center text-muted-foreground py-12 text-sm">No hay clientes con saldo pendiente</p>
              ) : (
                <>
                {/* ── Mobile cobranzas cards ── */}
                <div className="sm:hidden divide-y">
                  {filteredCobranzas.map((c) => (
                    <div key={c.id} className="py-3 px-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{c.nombre}</p>
                        {c.cuit && <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.cuit}</p>}
                      </div>
                      <span className="font-bold text-orange-500 text-sm shrink-0">{formatCurrency(c.saldo)}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openMovimientos(c)} title="Resumen"><Eye className="w-4 h-4" /></Button>
                        <Button size="icon" className="h-9 w-9" onClick={() => { setCobroClient(c); setCobroOpen(true); }} title="Cobrar"><DollarSign className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end border-t pt-3 px-4">
                    <span className="text-sm text-muted-foreground mr-4">Saldo total:</span>
                    <span className="text-sm font-bold text-orange-500">{formatCurrency(totalPendiente)}</span>
                  </div>
                </div>
                {/* ── Desktop cobranzas table ── */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-3 px-4 font-medium">Cliente</th>
                        <th className="text-left py-3 px-4 font-medium">CUIT</th>
                        <th className="text-right py-3 px-4 font-medium">Saldo deudor</th>
                        <th className="text-right py-3 px-4 font-medium w-48">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCobranzas.map((c) => (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="py-3 px-4 font-medium">{c.nombre}</td>
                          <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{c.cuit || "—"}</td>
                          <td className="py-3 px-4 text-right font-semibold text-orange-500">{formatCurrency(c.saldo)}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openMovimientos(c)}>
                                <Eye className="w-3.5 h-3.5 mr-1" />Resumen
                              </Button>
                              <Button size="sm" onClick={() => { setCobroClient(c); setCobroOpen(true); }}>
                                <DollarSign className="w-3.5 h-3.5 mr-1" />Cobrar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end border-t pt-3 px-4">
                    <span className="text-sm text-muted-foreground mr-4">Saldo total:</span>
                    <span className="text-sm font-bold text-orange-500">{formatCurrency(totalPendiente)}</span>
                  </div>
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "zonas" && (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold">Zonas de entrega</h2>
                  <p className="text-sm text-muted-foreground">{zonas.length} zonas configuradas</p>
                </div>
                <Button onClick={openNewZona}><Plus className="w-4 h-4 mr-2" />Nueva zona</Button>
              </div>
              {zonas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay zonas de entrega configuradas</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {zonas.map((z) => (
                    <div key={z.id} className="flex items-center justify-between p-4 rounded-xl border hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-blue-600" />
                          <span className="font-medium">{z.nombre}</span>
                          <Badge variant="secondary" className="text-xs">{clients.filter((c) => c.zona_entrega === z.id).length} clientes</Badge>
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          {DIAS_SEMANA.map((dia) => (
                            <span
                              key={dia}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                z.dias.includes(dia)
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-400"
                              }`}
                            >
                              {dia.substring(0, 3)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditZona(z)}><Edit className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteZona(z.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Zona Dialog */}
      <Dialog open={zonaDialogOpen} onOpenChange={setZonaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingZona ? "Editar zona" : "Nueva zona de entrega"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nombre de la zona</Label>
              <Input value={zonaForm.nombre} onChange={(e) => setZonaForm({ ...zonaForm, nombre: e.target.value })} placeholder="Ej: Zona Norte" />
            </div>
            <div className="space-y-2">
              <Label>Días de entrega</Label>
              <div className="flex flex-wrap gap-2">
                {DIAS_SEMANA.map((dia) => (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleZonaDia(dia)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      zonaForm.dias.includes(dia)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {dia}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setZonaDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveZona} disabled={zonaSaving || !zonaForm.nombre.trim()}>
                {zonaSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingZona ? "Guardar cambios" : "Crear zona"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movements Dialog */}
      <Dialog open={movOpen} onOpenChange={setMovOpen}>
        <DialogContent className="max-w-[880px] w-[95vw] max-h-[90vh] overflow-y-auto p-0" showCloseButton={false}>
          {/* Header */}
          <div className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center">
                  <History className="w-4 h-4 text-background" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold">Resumen de Cuenta</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {movClient?.nombre}
                    {movClient?.cuit && <><span className="mx-1 text-muted-foreground/40">|</span>CUIT {movClient.cuit}</>}
                  </p>
                </div>
              </div>
              <button onClick={() => setMovOpen(false)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filters row */}
            <div className="flex flex-wrap items-end gap-2 mb-4">
              <div className="w-full sm:w-auto">
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">Filtrar</label>
                <select
                  value={movCCFilter}
                  onChange={(e) => setMovCCFilter(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 h-8 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-48"
                >
                  <option value="all">Ver todos los movimientos</option>
                  <option value="debe">Solo compras (debe)</option>
                  <option value="haber">Solo pagos (haber)</option>
                  <option value="pendiente">Solo con saldo pendiente</option>
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">Desde</label>
                <Input type="date" value={movDesde} onChange={(e) => setMovDesde(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">Hasta</label>
                <Input type="date" value={movHasta} onChange={(e) => setMovHasta(e.target.value)} className="h-8 text-xs" />
              </div>
              <Button size="sm" className="h-8" onClick={() => movClient && fetchMovimientos(movClient.id, movDesde, movHasta)}>
                Filtrar
              </Button>
            </div>

            {/* Tabs */}
            <Tabs value={movTab} onValueChange={(v) => setMovTab(v as "resumen" | "compras" | "cobros")} className="">
            <div className="flex gap-6 border-b">
              <button
                onClick={() => setMovTab("resumen")}
                className={`pb-2.5 text-[13px] px-0.5 border-b-2 transition-colors ${movTab === "resumen" ? "text-foreground border-foreground font-semibold" : "text-muted-foreground border-transparent hover:text-foreground/70"}`}
              >
                Resumen
              </button>
              <button
                onClick={() => setMovTab("compras")}
                className={`pb-2.5 text-[13px] px-0.5 border-b-2 transition-colors ${movTab === "compras" ? "text-foreground border-foreground font-semibold" : "text-muted-foreground border-transparent hover:text-foreground/70"}`}
              >
                Compras
              </button>
              <button
                onClick={() => setMovTab("cobros")}
                className={`pb-2.5 text-[13px] px-0.5 border-b-2 transition-colors ${movTab === "cobros" ? "text-foreground border-foreground font-semibold" : "text-muted-foreground border-transparent hover:text-foreground/70"}`}
              >
                Cobros {cobrosCliente.length > 0 && <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{cobrosCliente.length}</span>}
              </button>
            </div>

            {/* ══════ TAB COMPRAS ══════ */}
            <TabsContent value="compras" className="mt-0 px-6 pt-4 pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Ventas</p>
                  <p className="text-lg font-bold">{formatCurrency(movTotals.ventas)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Notas de Crédito</p>
                  <p className="text-lg font-bold text-red-500">{movTotals.nc > 0 ? `-${formatCurrency(movTotals.nc)}` : formatCurrency(0)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-primary/5">
                  <p className="text-xs text-muted-foreground">Total comprado</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(movTotals.totalComprado)}</p>
                </div>
              </div>

              {movLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : movimientos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin compras en el período seleccionado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-3 font-medium">Fecha</th>
                        <th className="text-left py-2 px-3 font-medium">Tipo</th>
                        <th className="text-left py-2 px-3 font-medium">Comprobante</th>
                        <th className="text-left py-2 px-3 font-medium">Forma pago</th>
                        <th className="text-right py-2 px-3 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((m, i) => {
                        const key = `compra-${m.id}-${i}`;
                        const isExp = movExpanded === key;
                        const hasItems = m.items && m.items.length > 0;
                        return (
                          <React.Fragment key={key}>
                            <tr
                              className={`border-b last:border-0 hover:bg-muted/50 ${hasItems ? "cursor-pointer" : ""}`}
                              onClick={() => hasItems && setMovExpanded(isExp ? null : key)}
                            >
                              <td className="py-2 px-3 text-muted-foreground">{new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                              <td className="py-2 px-3">
                                <Badge variant={m.badge as any} className="text-xs font-normal">{m.tipo}</Badge>
                              </td>
                              <td className="py-2 px-3 text-xs">
                                <div className="flex items-center gap-1">
                                  <span>{m.descripcion}</span>
                                  {hasItems && (
                                    <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isExp ? "rotate-180" : ""}`} />
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className="text-xs font-normal">{m.forma_pago || "—"}</Badge>
                              </td>
                              <td className={`py-2 px-3 text-right font-semibold ${m.monto < 0 ? "text-emerald-600" : ""}`}>
                                {m.monto < 0 ? `-${formatCurrency(Math.abs(m.monto))}` : formatCurrency(m.monto)}
                              </td>
                            </tr>
                            {isExp && hasItems && (
                              <tr>
                                <td colSpan={5} className="px-3 pb-3 pt-0">
                                  <div className="bg-muted/30 rounded-lg p-3 mt-1">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-muted-foreground">
                                          <th className="text-left py-1 font-medium">Producto</th>
                                          <th className="text-center py-1 font-medium">Cant.</th>
                                          <th className="text-right py-1 font-medium">Precio</th>
                                          <th className="text-right py-1 font-medium">Subtotal</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {m.items.map((it: any, idx: number) => {
                                          const isBox = it.presentacion && it.presentacion !== "Unidad" && (it.unidades_por_presentacion || 1) > 1;
                                          const unitPrice = isBox ? it.precio_unitario / (it.unidades_por_presentacion || 1) : it.precio_unitario;
                                          let displayName = (it.descripcion || "")
                                            .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
                                            .replace(/\s*\(Unidad\)$/, "")
                                            .replace(/(\([^)]+\))\s*\1/gi, "$1")
                                            .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
                                            .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
                                          return (
                                            <tr key={idx} className="border-t border-muted">
                                              <td className="py-1">{displayName}</td>
                                              <td className="py-1 text-center">{(it.unidades_por_presentacion || 1) > 0 && (it.unidades_por_presentacion || 1) < 1 ? it.cantidad * (it.unidades_por_presentacion || 1) : it.cantidad}{isBox ? ` ${it.presentacion}` : ""}</td>
                                              <td className="py-1 text-right">
                                                {formatCurrency(unitPrice)}
                                                {isBox && <span className="text-[10px] text-muted-foreground block">c/u</span>}
                                              </td>
                                              <td className="py-1 text-right font-medium">{formatCurrency(it.subtotal || it.precio_unitario * it.cantidad)}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="text-xs text-muted-foreground mt-2 text-right">{movimientos.length} compra(s)</div>
                </div>
              )}
            </TabsContent>

            {/* ══════ TAB RESUMEN (Libro Diario) ══════ */}
            <TabsContent value="resumen" className="mt-0 px-6 pt-4 pb-6">
              {(() => {
                // Helpers
                const fmtSaldo = (v: number) => v > 0 ? formatCurrency(v) : v < 0 ? `${formatCurrency(Math.abs(v))} a favor` : "$0";
                const saldoColor = (v: number) => v > 0 ? "text-orange-600" : v < 0 ? "text-emerald-600" : "";
                const isNCComp = (comp: string) => /^NC\s/i.test(comp);
                const exportCCExcel = async () => {
                  if (!movClient || movCCRows.length === 0) return;
                  const XLSX = await import("xlsx");
                  const rows = movCCRows.map((r) => ({
                    Fecha: new Date(r.fecha + "T12:00:00").toLocaleDateString("es-AR"),
                    Comprobante: r.comprobante,
                    Debe: r.debe > 0 ? Math.round(r.debe) : "",
                    Haber: r.haber > 0 ? Math.round(r.haber) : "",
                    Saldo: Math.round(r.saldo),
                    "Cond. Pago": r.forma_pago || "",
                    Obs: r.descripcion || "",
                  }));
                  const ws = XLSX.utils.json_to_sheet(rows);
                  ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Cuenta Corriente");
                  XLSX.writeFile(wb, `CC_${movClient.nombre.replace(/\s/g, "_")}_${todayARG()}.xlsx`);
                };

                const saldoAct = Math.round(movCCTotals.saldo);

                // Apply filter
                const filteredCCRows = movCCRows.filter((row) => {
                  if (movCCFilter === "debe") return row.debe > 0;
                  if (movCCFilter === "haber") return row.haber > 0;
                  if (movCCFilter === "pendiente") return row.saldo > 0;
                  return true;
                });

                return (
                  <>
                    {/* Table */}
                    {movLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : movCCRows.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Sin movimientos</p>
                      </div>
                    ) : (
                      <div className="border rounded-xl overflow-hidden">
                        <div className="max-h-[400px] overflow-y-auto">
                          <table className="w-full text-[13px]">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-muted/50 border-b">
                                <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[72px]">Fecha</th>
                                <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Comprobante</th>
                                <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[100px]">Debe</th>
                                <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[100px]">Haber</th>
                                <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[110px]">Saldo</th>
                                <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[110px]">Cond. Pago</th>
                                <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[60px]">Obs.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredCCRows.map((row, i) => {
                                const prevDate = i > 0 ? filteredCCRows[i - 1].fecha : null;
                                const isNewDate = row.fecha !== prevDate;
                                const sr = Math.round(row.saldo);
                                const compIsNC = isNCComp(row.comprobante);
                                const condPago = row.forma_pago || "";
                                const isTransfer = condPago === "Transferencia";
                                return (
                                  <tr key={row.id || i} className={`border-b last:border-0 hover:bg-muted/30 ${isNewDate && i > 0 ? "border-t border-t-foreground/10" : ""}`}>
                                    <td className="py-2 px-3 text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                                      {isNewDate ? new Date(row.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : ""}
                                    </td>
                                    <td className="py-2 px-3 text-xs font-mono whitespace-nowrap">
                                      {compIsNC ? (
                                        <span className="inline-flex items-center gap-1.5">
                                          {row.comprobante}
                                          <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-600">NC</span>
                                        </span>
                                      ) : row.comprobante}
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums text-xs font-medium">{row.debe > 0 ? formatCurrency(Math.round(row.debe)) : ""}</td>
                                    <td className="py-2 px-3 text-right tabular-nums text-xs font-medium text-emerald-600">{row.haber > 0 ? formatCurrency(Math.round(row.haber)) : ""}</td>
                                    <td className={`py-2 px-3 text-right tabular-nums text-xs font-bold ${saldoColor(sr)}`}>{fmtSaldo(sr)}</td>
                                    <td className="py-2 px-3 text-xs text-muted-foreground">
                                      {isTransfer ? (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400">Transferencia</span>
                                      ) : condPago === "Cuenta Corriente" ? "Cuenta Corriente" : condPago}
                                    </td>
                                    <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[60px]" title={row.descripcion || ""}>
                                      {row.descripcion || ""}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Totals footer — Pendiente / Cobrado / Saldo Deudor */}
                        <div className="bg-muted/50 border-t px-4 py-3">
                          <div className="flex items-center justify-end gap-3 sm:gap-6 flex-wrap">
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pendiente</p>
                              <p className="text-sm font-bold tabular-nums">{formatCurrency(Math.round(movCCTotals.debe))}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Cobrado</p>
                              <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatCurrency(Math.round(movCCTotals.haber))}</p>
                            </div>
                            <div className="text-right pl-4 border-l-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Saldo deudor</p>
                              <p className={`text-lg font-extrabold tabular-nums ${saldoColor(saldoAct)}`}>{fmtSaldo(saldoAct)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action buttons — below table like the mockup */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4">
                      <div className="flex gap-2 flex-wrap">
                        {movCCTotals.saldo > 0 && movClient && (
                          <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => { setCobroClient(movClient); setCobroOpen(true); }}>
                            <DollarSign className="w-4 h-4 mr-1.5" />Ingresar Pago
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-9" onClick={() => {
                          if (!movClient || movCCRows.length === 0) return;
                          const win = window.open("", "_blank", "width=800,height=1100");
                          if (!win) return;
                          const rows = filteredCCRows.map((r, i) => {
                            const prev = i > 0 ? filteredCCRows[i - 1].fecha : null;
                            const showDate = r.fecha !== prev;
                            return `<tr style="border-bottom:1px solid #f1f5f9;${showDate && i > 0 ? "border-top:1px solid #e2e8f0;" : ""}">
                              <td style="padding:6px 10px;font-size:12px;color:#94a3b8;font-variant-numeric:tabular-nums;">${showDate ? new Date(r.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : ""}</td>
                              <td style="padding:6px 10px;font-size:12px;font-family:monospace;">${r.comprobante}</td>
                              <td style="padding:6px 10px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;">${r.debe > 0 ? formatCurrency(Math.round(r.debe)) : ""}</td>
                              <td style="padding:6px 10px;text-align:right;font-size:12px;color:#059669;font-variant-numeric:tabular-nums;">${r.haber > 0 ? formatCurrency(Math.round(r.haber)) : ""}</td>
                              <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:bold;color:${Math.round(r.saldo) > 0 ? "#ea580c" : "#059669"};font-variant-numeric:tabular-nums;">${fmtSaldo(Math.round(r.saldo))}</td>
                              <td style="padding:6px 10px;font-size:12px;color:#64748b;">${r.forma_pago || ""}</td>
                              <td style="padding:6px 10px;font-size:12px;color:#94a3b8;">${r.descripcion || ""}</td>
                            </tr>`;
                          }).join("");
                          win.document.write(`<!DOCTYPE html><html><head><title>Resumen — ${movClient.nombre}</title><style>@page{size:A4 landscape;margin:15mm;}body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#0f172a;}table{width:100%;border-collapse:collapse;}</style></head><body>
                            <h2 style="font-size:16px;margin-bottom:4px;">Resumen de Cuenta</h2>
                            <p style="font-size:12px;color:#94a3b8;margin-bottom:16px;">${movClient.nombre}${movClient.cuit ? " | CUIT " + movClient.cuit : ""}${movDesde ? ` | ${movDesde} a ${movHasta}` : " | Todas las operaciones"}</p>
                            <table><thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                              <th style="text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Fecha</th>
                              <th style="text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Comprobante</th>
                              <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Debe</th>
                              <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Haber</th>
                              <th style="text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Saldo</th>
                              <th style="text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Cond. Pago</th>
                              <th style="text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Obs.</th>
                            </tr></thead><tbody>${rows}</tbody>
                            <tfoot><tr style="background:#f8fafc;border-top:2px solid #e2e8f0;">
                              <td colspan="4" style="padding:10px;font-size:11px;font-weight:bold;">Saldo deudor</td>
                              <td style="padding:10px;text-align:right;font-size:16px;font-weight:800;color:${saldoAct > 0 ? "#ea580c" : "#059669"};">${fmtSaldo(saldoAct)}</td>
                              <td colspan="2"></td>
                            </tr></tfoot></table></body></html>`);
                          win.document.close();
                          win.print();
                        }}>
                          <Printer className="w-3.5 h-3.5 mr-1.5" />Imprimir resumen
                        </Button>
                        {movCCRows.length > 0 && (
                          <Button size="sm" variant="outline" className="h-9" onClick={exportCCExcel}>
                            <Download className="w-3.5 h-3.5 mr-1.5" />Exportar
                          </Button>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" className="h-9 text-xs text-muted-foreground" onClick={recalcularSaldo} title="Recalcular saldo desde cuenta corriente">
                        <RefreshCw className="w-3 h-3 mr-1" />Recalcular
                      </Button>
                    </div>
                  </>
                );
              })()}
            </TabsContent>

            {/* ══════ TAB COBROS ══════ */}
            <TabsContent value="cobros" className="mt-0 px-6 pt-4 pb-6">
              {cobrosCliente.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">No hay cobros registrados en el período seleccionado</div>
              ) : (
                <div className="space-y-2">
                  {cobrosCliente.map((c) => {
                    const cuenta = c.cuenta_bancaria_id ? cuentasBancarias.find((cb: any) => cb.id === c.cuenta_bancaria_id) : null;
                    const items: any[] = (c as any).cobro_items || [];
                    const fechaFmt = new Date(c.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
                    const phone = movClient?.telefono || "";
                    const digits = phone.replace(/\D/g, "");
                    const wa = digits.startsWith("54") ? digits : `54${digits.startsWith("0") ? digits.slice(1) : digits}`;
                    const msg = encodeURIComponent(`Hola ${movClient?.nombre}! Te enviamos el recibo de cobro N° ${c.numero} del ${fechaFmt}.\nMonto cobrado: ${formatCurrency(c.monto)}\n\nGracias por tu pago!`);
                    return (
                      <div key={c.id} className="rounded-lg border p-3 text-sm flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-semibold text-xs">{c.numero}</span>
                            <span className="text-muted-foreground text-xs">{fechaFmt}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{c.forma_pago}</span>
                            {cuenta && <span className="text-xs text-muted-foreground">{cuenta.nombre}</span>}
                          </div>
                          <p className="font-bold text-base text-emerald-700">{formatCurrency(c.monto)}</p>
                          {items.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Aplicado a: {items.map((i: any) => i.ventas?.numero || "—").join(", ")}
                            </p>
                          )}
                          {c.observacion && <p className="text-xs text-muted-foreground italic mt-0.5">{c.observacion}</p>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {phone && (
                            <a href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer" title="Enviar por WhatsApp" className="inline-flex items-center justify-center h-8 px-2 rounded-md border border-green-500 text-green-600 hover:bg-green-50 text-sm transition-colors">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <Button size="sm" variant="outline" className="h-8 px-2" title="Ver / Reimprimir" onClick={() => {
                            setCobroReceipt({
                              open: true,
                              cliente: movClient?.nombre || "",
                              clienteCuit: movClient?.cuit || "",
                              clienteDomicilio: [movClient?.domicilio, movClient?.localidad, movClient?.provincia].filter(Boolean).join(", "),
                              clienteTelefono: movClient?.telefono || "",
                              monto: c.monto,
                              formaPago: c.forma_pago,
                              fecha: c.fecha,
                              saldoAnterior: c.monto + (movClient?.saldo || 0),
                              saldoNuevo: movClient?.saldo || 0,
                              empresaNombre: empresa?.nombre || "",
                              empresaCuit: empresa?.cuit || "",
                              empresaDomicilio: empresa?.domicilio || "",
                              empresaTelefono: empresa?.telefono || "",
                              cuentaBancaria: cuenta?.nombre || "",
                              cuentaAlias: cuenta?.alias || "",
                              observacion: c.observacion || "",
                              numero: c.numero,
                              comprobantes: items.map((i: any) => ({
                                comprobante: i.ventas?.numero || "—",
                                debe: i.ventas?.total || 0,
                                haber: i.monto_aplicado,
                              })),
                            });
                          }}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-xs text-muted-foreground text-right mt-1">
                    {cobrosCliente.length} cobro(s) · Total: {formatCurrency(cobrosCliente.reduce((s, c) => s + c.monto, 0))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Old resumen tab removed — now unified into the CC tab above */}
          </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment from Movimientos Dialog */}
      <Dialog open={payMovOpen} onOpenChange={setPayMovOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cobrar deuda</DialogTitle>
          </DialogHeader>
          {payMovVenta && (
            <div className="space-y-4">
              <div className="text-sm space-y-1 bg-muted/50 rounded-lg p-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Comprobante</span><span className="font-mono font-medium text-xs">{payMovVenta.descripcion}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{formatCurrency(payMovVenta.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pagado</span><span className="text-emerald-600">{formatCurrency(payMovVenta.pagado || 0)}</span></div>
                <div className="flex justify-between border-t pt-1"><span className="font-medium">Deuda</span><span className="text-orange-600 font-bold">{formatCurrency(payMovVenta.saldo_pendiente)}</span></div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Método de pago</Label>
                <div className="flex gap-2">
                  {(["Efectivo", "Transferencia"] as const).map((m) => (
                    <button key={m} onClick={() => setPayMovMetodo(m)} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${payMovMetodo === m ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>{m}</button>
                  ))}
                </div>
              </div>
              {payMovMetodo === "Transferencia" && cuentasBancarias.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Cuenta destino</Label>
                  <div className="grid gap-1.5">
                    {cuentasBancarias.map((cb) => (
                      <button
                        key={cb.id}
                        type="button"
                        onClick={() => setPayMovCuentaBancariaId(cb.id)}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-all text-left ${payMovCuentaBancariaId === cb.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/30"}`}
                      >
                        <Building2 className={`w-4 h-4 shrink-0 ${payMovCuentaBancariaId === cb.id ? "text-primary" : "text-muted-foreground"}`} />
                        <div>
                          <p className="font-medium">{cb.nombre}</p>
                          {cb.alias && <p className="text-xs text-muted-foreground">{cb.alias}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Monto a cobrar</Label>
                <MoneyInput value={payMovMonto} onValueChange={(v) => setPayMovMonto(Math.max(0, Math.min(payMovVenta.saldo_pendiente, v)))} />
              </div>
              {payMovMonto < payMovVenta.saldo_pendiente && payMovMonto > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Restará <strong>{formatCurrency(payMovVenta.saldo_pendiente - payMovMonto)}</strong> de deuda en este comprobante.
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayMovOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={handlePayMov} disabled={payMovSaving || payMovMonto <= 0 || (payMovMetodo === "Transferencia" && cuentasBancarias.length > 0 && !payMovCuentaBancariaId)}>
                  {payMovSaving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Confirmar — {formatCurrency(payMovMonto)}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cobro Receipt Dialog — A4 */}
      <Dialog open={!!cobroReceipt?.open} onOpenChange={(open) => { if (!open) setCobroReceipt(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recibo de Cobro</DialogTitle>
          </DialogHeader>
          {cobroReceipt && (
            <div className="space-y-3">
              <div id="cobro-receipt-print" className="border rounded-lg bg-white text-sm" style={{ fontFamily: "Arial, sans-serif" }}>
                {/* Header — Empresa */}
                <div className="border-b p-6 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xl font-bold tracking-tight">{cobroReceipt.empresaNombre}</p>
                      {cobroReceipt.empresaCuit && <p className="text-xs text-gray-500 mt-0.5">CUIT: {cobroReceipt.empresaCuit}</p>}
                      {cobroReceipt.empresaDomicilio && <p className="text-xs text-gray-500">{cobroReceipt.empresaDomicilio}</p>}
                      {cobroReceipt.empresaTelefono && <p className="text-xs text-gray-500">Tel: {cobroReceipt.empresaTelefono}</p>}
                    </div>
                    <div className="text-right">
                      <div className="inline-block border-2 border-gray-800 rounded-lg px-4 py-2">
                        <p className="text-xs font-bold text-gray-800 tracking-widest">RECIBO {cobroReceipt.numero}</p>
                        <p className="text-lg font-bold text-gray-800">X</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Fecha: {new Date(cobroReceipt.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                    </div>
                  </div>
                </div>

                {/* Client info */}
                <div className="border-b p-6 py-4 bg-gray-50">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Datos del cliente</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <div className="flex gap-2"><span className="text-gray-500 shrink-0">Nombre:</span><span className="font-medium">{cobroReceipt.cliente}</span></div>
                    {cobroReceipt.clienteCuit && <div className="flex gap-2"><span className="text-gray-500 shrink-0">CUIT:</span><span className="font-medium">{cobroReceipt.clienteCuit}</span></div>}
                    {cobroReceipt.clienteDomicilio && <div className="flex gap-2 col-span-2"><span className="text-gray-500 shrink-0">Domicilio:</span><span className="font-medium">{cobroReceipt.clienteDomicilio}</span></div>}
                  </div>
                </div>

                {/* Payment details */}
                <div className="p-6 py-4 border-b">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Detalle del cobro</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-3">
                      <p className="text-[10px] text-gray-400 uppercase">Forma de pago</p>
                      <p className="font-semibold text-sm mt-0.5">{cobroReceipt.formaPago}</p>
                      {cobroReceipt.formaPago === "Transferencia" && cobroReceipt.cuentaBancaria && (
                        <div className="mt-1.5 text-xs">
                          <p className="text-gray-500">Cuenta: {cobroReceipt.cuentaBancaria}</p>
                          {cobroReceipt.cuentaAlias && <p className="text-gray-500">Alias: <span className="font-mono font-medium text-gray-700">{cobroReceipt.cuentaAlias}</span></p>}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border p-3 bg-emerald-50 border-emerald-200">
                      <p className="text-[10px] text-emerald-600 uppercase">Monto recibido</p>
                      <p className="font-bold text-xl text-emerald-700 mt-0.5">{formatCurrency(cobroReceipt.monto)}</p>
                    </div>
                  </div>
                  {cobroReceipt.observacion && (
                    <div className="mt-3 text-xs"><span className="text-gray-500">Obs:</span> <span className="text-gray-700">{cobroReceipt.observacion}</span></div>
                  )}
                </div>

                {/* Comprobantes (deuda origen) */}
                {cobroReceipt.comprobantes.length > 0 && (
                  <div className="p-6 py-4 border-b">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Comprobantes asociados (deuda)</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1.5 font-medium text-gray-500">Comprobante</th>
                          <th className="text-right py-1.5 font-medium text-gray-500">Debe</th>
                          <th className="text-right py-1.5 font-medium text-gray-500">Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cobroReceipt.comprobantes.map((c, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-1.5 font-mono">{c.comprobante}</td>
                            <td className="py-1.5 text-right text-red-600">{formatCurrency(c.debe)}</td>
                            <td className="py-1.5 text-right text-emerald-600">{c.haber > 0 ? formatCurrency(c.haber) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Balance summary */}
                <div className="p-6 py-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Resumen de cuenta</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Saldo anterior</span><span className="font-medium">{formatCurrency(cobroReceipt.saldoAnterior)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Cobro aplicado</span><span className="font-medium text-emerald-600">-{formatCurrency(cobroReceipt.monto)}</span></div>
                    <div className="flex justify-between border-t-2 border-gray-800 pt-2 mt-2">
                      <span className="font-bold">Saldo actual</span>
                      <span className={`font-bold text-lg ${cobroReceipt.saldoNuevo <= 0 ? "text-emerald-600" : "text-gray-900"}`}>{formatCurrency(Math.max(0, cobroReceipt.saldoNuevo))}</span>
                    </div>
                    {cobroReceipt.saldoNuevo <= 0 && (
                      <p className="text-center text-xs text-emerald-600 font-medium mt-1">Cuenta al día</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" className="flex-1 min-w-[80px]" onClick={() => setCobroReceipt(null)}>Cerrar</Button>
                {cobroReceipt.clienteTelefono && (() => {
                  const digits = cobroReceipt.clienteTelefono.replace(/\D/g, "");
                  const wa = digits.startsWith("54") ? digits : `54${digits.startsWith("0") ? digits.slice(1) : digits}`;
                  const fechaFmt = new Date(cobroReceipt.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
                  const msg = encodeURIComponent(`Hola ${cobroReceipt.cliente}! Te enviamos el recibo de cobro N° ${cobroReceipt.numero} del ${fechaFmt}.\nMonto cobrado: ${formatCurrency(cobroReceipt.monto)}\nSaldo actual: ${formatCurrency(Math.max(0, cobroReceipt.saldoNuevo))}\n\nGracias por tu pago!`);
                  return (
                    <a href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[80px] inline-flex items-center justify-center rounded-md border border-green-500 text-green-600 hover:bg-green-50 px-3 py-2 text-sm font-medium transition-colors">
                      <MessageSquare className="w-4 h-4 mr-2" />WhatsApp
                    </a>
                  );
                })()}
                <Button variant="outline" className="flex-1 min-w-[80px]" onClick={async () => {
                  const r = cobroReceipt;
                  const { jsPDF } = await import("jspdf");
                  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                  const w = pdf.internal.pageSize.getWidth();
                  const m = 18;
                  let y = 20;
                  const fmtC = formatCurrency;
                  const fechaFmt = new Date(r.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
                  // Header
                  pdf.setFontSize(16); pdf.setFont("helvetica", "bold");
                  pdf.text(r.empresaNombre, m, y); y += 6;
                  pdf.setFontSize(9); pdf.setFont("helvetica", "normal");
                  if (r.empresaCuit) { pdf.text(`CUIT: ${r.empresaCuit}`, m, y); y += 4; }
                  if (r.empresaDomicilio) { pdf.text(r.empresaDomicilio, m, y); y += 4; }
                  if (r.empresaTelefono) { pdf.text(`Tel: ${r.empresaTelefono}`, m, y); }
                  // Receipt number box
                  pdf.setFontSize(10); pdf.setFont("helvetica", "bold");
                  pdf.rect(w - m - 52, 18, 52, 18);
                  pdf.text(`RECIBO ${r.numero}`, w - m - 26, 25, { align: "center" });
                  pdf.setFontSize(14); pdf.text("X", w - m - 26, 31, { align: "center" });
                  pdf.setFontSize(8); pdf.setFont("helvetica", "normal");
                  pdf.text(`Fecha: ${fechaFmt}`, w - m - 26, 40, { align: "center" });
                  y = 46;
                  pdf.setDrawColor(200, 200, 200); pdf.line(m, y, w - m, y); y += 6;
                  // Client
                  pdf.setFontSize(8); pdf.setTextColor(150); pdf.text("DATOS DEL CLIENTE", m, y); y += 5;
                  pdf.setTextColor(0); pdf.setFontSize(10); pdf.setFont("helvetica", "bold");
                  pdf.text(r.cliente, m, y); y += 5;
                  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
                  if (r.clienteCuit) { pdf.text(`CUIT: ${r.clienteCuit}`, m, y); y += 4; }
                  if (r.clienteDomicilio) { pdf.text(r.clienteDomicilio, m, y); y += 4; }
                  y += 2; pdf.line(m, y, w - m, y); y += 6;
                  // Payment detail
                  pdf.setFontSize(8); pdf.setTextColor(150); pdf.text("DETALLE DEL COBRO", m, y); y += 5;
                  pdf.setTextColor(0); pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
                  pdf.text("Forma de pago:", m, y); pdf.setFont("helvetica", "bold"); pdf.text(r.formaPago, m + 32, y); y += 5;
                  if (r.formaPago === "Transferencia" && r.cuentaBancaria) {
                    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
                    pdf.text(`Cuenta: ${r.cuentaBancaria}`, m, y); y += 4;
                    if (r.cuentaAlias) { pdf.text(`Alias: ${r.cuentaAlias}`, m, y); y += 4; }
                  }
                  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(5, 150, 105);
                  pdf.text(`Monto recibido: ${fmtC(r.monto)}`, m, y); y += 6;
                  pdf.setTextColor(0);
                  if (r.observacion) { pdf.setFont("helvetica", "italic"); pdf.setFontSize(9); pdf.text(`Obs: ${r.observacion}`, m, y); y += 5; }
                  y += 1; pdf.setFont("helvetica", "normal"); pdf.line(m, y, w - m, y); y += 6;
                  // Comprobantes
                  if (r.comprobantes.length > 0) {
                    pdf.setFontSize(8); pdf.setTextColor(150); pdf.text("COMPROBANTES ASOCIADOS", m, y); y += 5;
                    pdf.setTextColor(0); pdf.setFontSize(9);
                    pdf.text("Comprobante", m, y); pdf.text("Debe", w - m - 40, y, { align: "right" }); pdf.text("Haber", w - m, y, { align: "right" }); y += 3;
                    pdf.line(m, y, w - m, y); y += 4;
                    for (const c of r.comprobantes) {
                      pdf.setFont("helvetica", "normal"); pdf.text(c.comprobante, m, y);
                      pdf.setTextColor(220, 38, 38); pdf.text(fmtC(c.debe), w - m - 40, y, { align: "right" });
                      pdf.setTextColor(5, 150, 105); pdf.text(c.haber > 0 ? fmtC(c.haber) : "—", w - m, y, { align: "right" });
                      pdf.setTextColor(0); y += 5;
                    }
                    y += 1; pdf.line(m, y, w - m, y); y += 6;
                  }
                  // Balance
                  pdf.setFontSize(8); pdf.setTextColor(150); pdf.text("RESUMEN DE CUENTA", m, y); y += 5;
                  pdf.setTextColor(0); pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
                  pdf.text("Saldo anterior", m, y); pdf.text(fmtC(r.saldoAnterior), w - m, y, { align: "right" }); y += 5;
                  pdf.setTextColor(5, 150, 105); pdf.text("Cobro aplicado", m, y); pdf.text(`-${fmtC(r.monto)}`, w - m, y, { align: "right" }); y += 5;
                  pdf.setTextColor(0); pdf.setDrawColor(0); pdf.line(m, y, w - m, y); y += 5;
                  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
                  pdf.text("Saldo actual", m, y); pdf.text(fmtC(Math.max(0, r.saldoNuevo)), w - m, y, { align: "right" });
                  pdf.save(`Recibo-${r.numero}-${r.cliente.replace(/\s+/g, "_")}.pdf`);
                }}>
                  <Download className="w-4 h-4 mr-2" />PDF
                </Button>
                <Button className="flex-1 min-w-[80px]" onClick={() => {
                  const el = document.getElementById("cobro-receipt-print");
                  if (!el) return;
                  const win = window.open("", "_blank", "width=800,height=1100");
                  if (!win) return;
                  win.document.write(`<!DOCTYPE html><html><head><title>Recibo de Cobro — ${cobroReceipt.cliente}</title><style>
                    @page { size: A4; margin: 20mm; }
                    body { font-family: Arial, sans-serif; padding: 0; margin: 0; color: #1a1a1a; }
                    .border { border: 1px solid #e5e5e5; }
                    .border-b { border-bottom: 1px solid #e5e5e5; }
                    .border-t-2 { border-top: 2px solid #1a1a1a; }
                    .rounded-lg { border-radius: 8px; }
                    .bg-gray-50 { background: #f9fafb; }
                    .bg-emerald-50 { background: #ecfdf5; }
                    .border-emerald-200 { border-color: #a7f3d0; }
                    .text-emerald-600 { color: #059669; }
                    .text-emerald-700 { color: #047857; }
                    .text-red-600 { color: #dc2626; }
                    .text-gray-400 { color: #9ca3af; }
                    .text-gray-500 { color: #6b7280; }
                    .text-gray-700 { color: #374151; }
                    .font-mono { font-family: monospace; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 6px 8px; }
                    th { font-size: 11px; color: #6b7280; }
                    @media print { body { padding: 0; } }
                  </style></head><body>${el.innerHTML}</body></html>`);
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

      <CobroAllocationDialog
        open={cobroOpen}
        onOpenChange={setCobroOpen}
        cliente={cobroClient}
        onSuccess={(result: CobroResult) => {
          setCobroReceipt({
            open: true,
            cliente: cobroClient!.nombre,
            clienteCuit: cobroClient!.cuit || "",
            clienteDomicilio: [cobroClient!.domicilio, cobroClient!.localidad, cobroClient!.provincia].filter(Boolean).join(", "),
            clienteTelefono: cobroClient!.telefono || "",
            monto: result.monto,
            formaPago: result.forma_pago,
            fecha: result.fecha,
            saldoAnterior: cobroClient!.saldo,
            saldoNuevo: result.nuevo_saldo,
            empresaNombre: empresa?.nombre || "Empresa",
            empresaCuit: empresa?.cuit || "",
            empresaDomicilio: empresa?.domicilio || "",
            empresaTelefono: empresa?.telefono || "",
            cuentaBancaria: result.cuenta_bancaria_nombre,
            cuentaAlias: result.cuenta_bancaria_alias,
            observacion: result.observacion,
            numero: result.numero,
            comprobantes: result.allocations.map((a) => ({
              comprobante: a.numero,
              debe: a.pendiente,
              haber: a.monto_aplicado,
            })),
          });
          logAudit({
            action: "CREATE",
            module: "clientes",
            entityId: cobroClient!.id,
            userName: currentUser?.nombre || "Admin",
            after: { cobro: result.numero, monto: result.monto, formaPago: result.forma_pago },
          });
          fetchClients();
        }}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="persona" className="mt-2">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="persona" className="text-xs sm:text-sm px-1.5 sm:px-3 py-1.5">Persona</TabsTrigger>
              <TabsTrigger value="facturacion" className="text-xs sm:text-sm px-1.5 sm:px-3 py-1.5">Facturación</TabsTrigger>
              <TabsTrigger value="password" className="text-xs sm:text-sm px-1.5 sm:px-3 py-1.5">Contraseña</TabsTrigger>
            </TabsList>
            <TabsContent value="persona" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>Código de cliente</Label>
                  <Input value={form.codigo_cliente} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); f("codigo_cliente", v); }} maxLength={4} className="font-mono" />
                  <p className="text-[11px] text-muted-foreground">4 dígitos, único por cliente</p>
                </div>
                <div className="space-y-2">
                  <Label>Apellido y Nombre</Label>
                  <Input value={form.nombre} onChange={(e) => f("nombre", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Documento</Label>
                  <Select value={form.tipo_documento} onValueChange={(v) => f("tipo_documento", v || "")}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DNI">DNI</SelectItem>
                      <SelectItem value="CUIT">CUIT</SelectItem>
                      <SelectItem value="CUIL">CUIL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Número de Documento</Label>
                  <Input value={form.numero_documento} onChange={(e) => f("numero_documento", e.target.value)} />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Domicilio</Label>
                    {form.domicilio && (
                      <a
                        href={form.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([form.domicilio, form.localidad, form.provincia].filter(Boolean).join(", "))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        <MapPin className="w-3 h-3" />
                        <span className="hidden sm:inline">Ver en mapa</span><span className="sm:hidden">Mapa</span>
                      </a>
                    )}
                  </div>
                  <Input value={form.domicilio} onChange={(e) => f("domicilio", e.target.value)} />
                  <div className="flex items-center gap-2">
                    <Input
                      value={form.maps_url}
                      onChange={(e) => f("maps_url", e.target.value)}
                      placeholder="Link de Google Maps (opcional)"
                      className="text-xs h-8"
                    />
                    {form.maps_url && (
                      <button onClick={() => f("maps_url", "")} className="text-xs text-red-500 hover:text-red-700 shrink-0">Quitar</button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input value={form.telefono} onChange={(e) => f("telefono", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => f("email", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Provincia</Label>
                  <Select value={form.provincia} onValueChange={(v) => f("provincia", v || "")}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {PROVINCIAS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Localidad</Label>
                  <Input value={form.localidad} onChange={(e) => f("localidad", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Barrio / Zona</Label>
                  <Input value={form.barrio} onChange={(e) => f("barrio", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Código Postal</Label>
                  <Input value={form.codigo_postal} onChange={(e) => f("codigo_postal", e.target.value)} />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Zona de entrega</Label>
                  <Select value={form.zona_entrega || "none"} onValueChange={(v) => f("zona_entrega", v === "none" ? "" : (v || ""))}>
                    <SelectTrigger>
                      {form.zona_entrega
                        ? (zonas.find((z) => z.id === form.zona_entrega)?.nombre ?? "Sin zona asignada")
                        : "Sin zona asignada"}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin zona asignada</SelectItem>
                      {zonas.map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {z.nombre} — {z.dias.join(", ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.zona_entrega && (() => {
                    const selectedZona = zonas.find((z) => z.id === form.zona_entrega);
                    if (!selectedZona) return null;
                    return (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {DIAS_SEMANA.map((dia) => (
                          <Badge
                            key={dia}
                            variant={selectedZona.dias.includes(dia) ? "default" : "outline"}
                            className={`text-xs ${selectedZona.dias.includes(dia) ? "bg-primary" : "opacity-40"}`}
                          >
                            {dia.substring(0, 3)}
                          </Badge>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                {categoriasRestringidas.length > 0 && (
                <div className="sm:col-span-2 space-y-2">
                  <Label>Categorías restringidas permitidas</Label>
                  <div className="flex flex-wrap gap-2">
                    {categoriasRestringidas.map((cat) => {
                      const selected = form.categorias_permitidas?.includes(cat.id) ?? false;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            const current = form.categorias_permitidas || [];
                            const next = selected
                              ? current.filter((id: string) => id !== cat.id)
                              : [...current, cat.id];
                            f("categorias_permitidas", next);
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                            selected
                              ? "bg-violet-100 text-violet-700 ring-1 ring-violet-300"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {cat.nombre}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Estas categorías están ocultas por defecto. Seleccioná las que este cliente puede ver.
                  </p>
                </div>
                )}
                <div className="sm:col-span-2 space-y-2">
                  <Label>Vendedor</Label>
                  <Select value={form.vendedor_id || "none"} onValueChange={(v) => f("vendedor_id", v === "none" ? "" : (v || ""))}>
                    <SelectTrigger>
                      {form.vendedor_id
                        ? (vendedores.find((v) => v.id === form.vendedor_id)?.nombre ?? "Sin vendedor")
                        : "Sin vendedor"}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin vendedor</SelectItem>
                      {vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Límite de crédito</Label>
                  <MoneyInput value={form.limite_credito || 0} onValueChange={(v) => setForm((prev) => ({ ...prev, limite_credito: Math.max(0, v) }))} min={0} />
                </div>
                <div className="space-y-2">
                  <Label>Observación</Label>
                  <Textarea value={form.observacion} onChange={(e) => f("observacion", e.target.value)} rows={2} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="facturacion" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="sm:col-span-2 space-y-2">
                  <Label>Razón social</Label>
                  <Input value={form.razon_social} onChange={(e) => f("razon_social", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>CUIT</Label>
                  <Input value={form.cuit} onChange={(e) => f("cuit", e.target.value)} placeholder="XX-XXXXXXXX-X" />
                </div>
                <div className="space-y-2">
                  <Label>Situación IVA</Label>
                  <Select value={form.situacion_iva} onValueChange={(v) => f("situacion_iva", v || "Consumidor final")}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Consumidor final">Consumidor final</SelectItem>
                      <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                      <SelectItem value="Monotributista">Monotributista</SelectItem>
                      <SelectItem value="Exento">Exento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Domicilio Fiscal</Label>
                  <Input value={form.domicilio_fiscal} onChange={(e) => f("domicilio_fiscal", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo Factura</Label>
                  <Select value={form.tipo_factura} onValueChange={(v) => f("tipo_factura", v || "")}>
                    <SelectTrigger><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Factura A</SelectItem>
                      <SelectItem value="B">Factura B</SelectItem>
                      <SelectItem value="C">Factura C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="password" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
              <p className="text-sm text-muted-foreground">Solo disponible para clientes con cuenta en la tienda online</p>
              {editingClient && authEmail ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email de la cuenta</Label>
                    <Input value={authEmail} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Nueva contraseña</Label>
                    <div className="flex gap-2">
                      <Input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="Ingrese la nueva contraseña" className="flex-1" />
                      {form.numero_documento && (
                        <Button type="button" variant="outline" size="sm" onClick={() => { setResetPw(form.numero_documento); setResetMsg(""); }}>
                          Usar DNI
                        </Button>
                      )}
                    </div>
                  </div>
                  {resetMsg && (
                    <p className={`text-sm ${resetMsg.startsWith("Error") ? "text-destructive" : "text-emerald-600"}`}>{resetMsg}</p>
                  )}
                  <Button onClick={handleResetPassword} disabled={!resetPw}>
                    <KeyRound className="w-4 h-4 mr-2" />Restablecer contraseña
                  </Button>
                </div>
              ) : editingClient ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Este cliente no tiene una cuenta en la tienda online.</p>
                  {form.email && form.numero_documento ? (
                    <Button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/auth/tienda", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              action: "create-from-admin",
                              nombre: form.nombre,
                              email: form.email,
                              password: form.numero_documento,
                              cliente_id: editingClient.id,
                              telefono: form.telefono || "",
                            }),
                          });
                          if (res.ok) {
                            showAdminToast("Acceso a tienda online creado (contraseña: DNI)", "success");
                            // Refresh auth info
                            const { data: authRec } = await supabase.from("clientes_auth").select("id, email").eq("cliente_id", editingClient.id).maybeSingle();
                            if (authRec) { setAuthEmail(authRec.email); setAuthId(authRec.id); }
                          } else {
                            const data = await res.json();
                            showAdminToast(data.error || "Error al crear acceso", "error");
                          }
                        } catch { showAdminToast("Error al crear acceso a tienda", "error"); }
                      }}
                    >
                      <Users className="w-4 h-4 mr-2" />Crear acceso a tienda online
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Para crear acceso necesita tener <strong>email</strong> y <strong>número de documento</strong>. Completelos en la pestaña de datos y guarde primero.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Guarde el cliente primero para gestionar su contraseña.</p>
              )}
            </TabsContent>
          </Tabs>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={savingClient}>{savingClient ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}{editingClient ? "Guardar cambios" : "Crear cliente"}</Button>
          </div>
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
