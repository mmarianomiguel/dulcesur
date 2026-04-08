"use client";

import { showAdminToast } from "@/components/admin-toast";
import { PagoProveedorAllocationDialog } from "@/components/pago-proveedor-allocation-dialog";
import { useState, useCallback, useRef, useEffect } from "react";
import { norm } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Edit,
  Trash2,
  Phone,
  Mail,
  Truck,
  Search,
  DollarSign,
  History,
  FileText,
  AlertCircle,
  Download,
} from "lucide-react";


import { formatCurrency, formatDateARG, todayARG } from "@/lib/formatters";
import type { Proveedor, Compra, CuentaCorrienteProveedor } from "@/types/database";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDialog } from "@/hooks/use-dialog";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { BaseService } from "@/services";
import { supabase } from "@/lib/supabase";

const proveedorService = new BaseService<Proveedor>("proveedores");

const emptyForm = {
  nombre: "", razon_social: "", cuit: "", condicion_iva: "Responsable Inscripto",
  codigo_proveedor: "", telefono: "", telefono2: "", email: "", web: "",
  domicilio: "", localidad: "", provincia: "Buenos Aires",
  rubro: "", contacto_nombre: "", contacto_cargo: "",
  dias_entrega: "", plazo_pago: "", observacion: "",
};

export default function ProveedoresPage() {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const importRef = useRef<HTMLInputElement>(null);
  const [comprasPendientes, setComprasPendientes] = useState<(Compra & { proveedores?: { nombre: string } })[]>([]);
  const [ccMovimientos, setCcMovimientos] = useState<CuentaCorrienteProveedor[]>([]);
  // Historial unified dialog
  const [histTab, setHistTab] = useState<"resumen" | "compras">("resumen");
  const [histCompras, setHistCompras] = useState<any[]>([]);
  const [histComprasLoading, setHistComprasLoading] = useState(false);
  const [histExpanded, setHistExpanded] = useState<string | null>(null);
  const [histComprasTotals, setHistComprasTotals] = useState({ total: 0, pagado: 0, pendiente: 0 });
  const [provCuentas, setProvCuentas] = useState<{ id: string; nombre: string; alias: string; cbu_cvu: string; tipo_cuenta: string; titular: string }[]>([]);
  const [historialCompras, setHistorialCompras] = useState<{ id: string; numero: string; fecha: string; total: number; estado: string; forma_pago: string }[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });
  const [aliasDialog, setAliasDialog] = useState<{ open: boolean; alias: string; titular: string }>({ open: false, alias: "", titular: "" });

  const fetchProviders = useCallback(
    () => proveedorService.getAll({ filters: { activo: true }, orderBy: "nombre" }),
    []
  );

  const { data: providers, loading, refetch } = useAsyncData({
    fetcher: fetchProviders,
    initialData: [],
  });

  // Product count per provider
  const [prodCountMap, setProdCountMap] = useState<Record<string, number>>({});
  const [prodListDialog, setProdListDialog] = useState<{ open: boolean; nombre: string; productos: { nombre: string; codigo: string; precio: number; stock: number }[] }>({ open: false, nombre: "", productos: [] });
  useEffect(() => {
    supabase.from("producto_proveedores").select("proveedor_id").then(({ data }) => {
      const map: Record<string, number> = {};
      (data || []).forEach((pp: any) => { map[pp.proveedor_id] = (map[pp.proveedor_id] || 0) + 1; });
      setProdCountMap(map);
    });
  }, [providers]);

  const editDialog = useDialog<Proveedor>();
  const pagoDialog = useDialog<Proveedor>();
  const ccDialog = useDialog<Proveedor>();
  const boletasDialog = useDialog<Proveedor>();

  // ─── Edit/Create ───
  const openNew = () => {
    setForm(emptyForm);
    editDialog.onOpen();
  };

  const openEdit = async (p: Proveedor) => {
    setForm({
      nombre: p.nombre,
      razon_social: (p as any).razon_social || "",
      cuit: p.cuit || "",
      condicion_iva: (p as any).condicion_iva || "Responsable Inscripto",
      codigo_proveedor: (p as any).codigo_proveedor || "",
      telefono: p.telefono || "",
      telefono2: (p as any).telefono2 || "",
      email: p.email || "",
      web: (p as any).web || "",
      domicilio: p.domicilio || "",
      localidad: (p as any).localidad || "",
      provincia: (p as any).provincia || "Buenos Aires",
      rubro: p.rubro || "",
      contacto_nombre: (p as any).contacto_nombre || "",
      contacto_cargo: (p as any).contacto_cargo || "",
      dias_entrega: (p as any).dias_entrega || "",
      plazo_pago: (p as any).plazo_pago || "",
      observacion: p.observacion || "",
    });
    editDialog.onOpen(p);
    // Load bank accounts for this provider
    const { data: cuentas } = await supabase.from("cuentas_bancarias").select("id, nombre, alias, cbu_cvu, tipo_cuenta, titular").eq("proveedor_id", p.id).eq("activo", true);
    setProvCuentas((cuentas || []) as any[]);
    // Load purchase history
    setHistorialLoading(true);
    setHistorialCompras([]);
    supabase
      .from("compras")
      .select("id, numero, fecha, total, estado, forma_pago")
      .eq("proveedor_id", p.id)
      .order("fecha", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setHistorialCompras((data || []) as any[]);
        setHistorialLoading(false);
      });
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { showAdminToast("El nombre es obligatorio", "error"); return; }
    const payload: Record<string, any> = {
      nombre: form.nombre.trim(),
      razon_social: form.razon_social || null,
      cuit: form.cuit || null,
      condicion_iva: form.condicion_iva || null,
      codigo_proveedor: form.codigo_proveedor || null,
      telefono: form.telefono || null,
      telefono2: form.telefono2 || null,
      email: form.email || null,
      web: form.web || null,
      domicilio: form.domicilio || null,
      localidad: form.localidad || null,
      provincia: form.provincia || null,
      rubro: form.rubro || null,
      contacto_nombre: form.contacto_nombre || null,
      contacto_cargo: form.contacto_cargo || null,
      dias_entrega: form.dias_entrega || null,
      plazo_pago: form.plazo_pago || null,
      observacion: form.observacion || null,
    };
    if (editDialog.data) {
      await proveedorService.update(editDialog.data.id, payload as Partial<Proveedor>);
    } else {
      await proveedorService.create(payload as Partial<Proveedor>);
    }
    editDialog.onClose();
    refetch();
  };

  const handleDelete = (id: string) => {
    const p = providers.find((pr) => pr.id === id);
    setConfirmDialog({
      open: true,
      title: "Eliminar proveedor",
      message: `¿Eliminar a "${p?.nombre || "este proveedor"}"?`,
      onConfirm: async () => {
        await proveedorService.update(id, { activo: false } as Partial<Proveedor>);
        refetch();
      },
    });
  };

  // ─── Cuenta Corriente ───
  const [ccDesde, setCcDesde] = useState("");
  const [ccHasta, setCcHasta] = useState("");
  const [ccTotals, setCcTotals] = useState({ debe: 0, haber: 0, saldo: 0 });

  const fetchCuentaCorriente = async (provId: string, desde?: string, hasta?: string) => {
    setCcMovimientos([]);

    // Primary: fetch from cuenta_corriente_proveedor
    let query = supabase
      .from("cuenta_corriente_proveedor")
      .select("*")
      .eq("proveedor_id", provId)
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true });

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);

    const { data: ccData } = await query;

    if (ccData && ccData.length > 0) {
      setCcMovimientos(ccData as CuentaCorrienteProveedor[]);
      const totalDebe = ccData.filter((r: any) => r.tipo === "compra").reduce((s: number, r: any) => s + (r.monto || 0), 0);
      const totalHaber = ccData.filter((r: any) => r.tipo === "pago").reduce((s: number, r: any) => s + (r.monto || 0), 0);
      const { data: freshProv } = await supabase.from("proveedores").select("saldo").eq("id", provId).single();
      setCcTotals({ debe: totalDebe, haber: totalHaber, saldo: freshProv?.saldo ?? 0 });
    } else {
      // Fallback: build history from compras (CC) + pagos
      let comprasQuery = supabase
        .from("compras")
        .select("id, numero, fecha, total, forma_pago, estado_pago, created_at")
        .eq("proveedor_id", provId)
        .order("fecha", { ascending: true });
      let pagosQuery = supabase
        .from("pagos_proveedores")
        .select("id, fecha, monto, forma_pago, observacion, created_at")
        .eq("proveedor_id", provId)
        .order("fecha", { ascending: true });

      if (desde) { comprasQuery = comprasQuery.gte("fecha", desde); pagosQuery = pagosQuery.gte("fecha", desde); }
      if (hasta) { comprasQuery = comprasQuery.lte("fecha", hasta); pagosQuery = pagosQuery.lte("fecha", hasta); }

      const [{ data: compras }, { data: pagos }] = await Promise.all([comprasQuery, pagosQuery]);

      const movements: CuentaCorrienteProveedor[] = [];

      for (const c of (compras || []) as any[]) {
        if (c.estado === "Anulada") continue;
        movements.push({
          id: c.id, proveedor_id: provId, fecha: c.fecha, tipo: "compra",
          descripcion: `Compra ${c.numero} (${c.forma_pago || "—"})`, monto: c.total, saldo_resultante: 0,
          referencia_id: c.id, referencia_tipo: "compra", created_at: c.created_at,
        });
        // If paid immediately (Efectivo/Transferencia), also add a "pago" entry
        if (c.forma_pago !== "Cuenta Corriente" && c.estado_pago === "Pagada") {
          movements.push({
            id: c.id + "-pago", proveedor_id: provId, fecha: c.fecha, tipo: "pago" as const,
            descripcion: `Pago compra ${c.numero} (${c.forma_pago})`, monto: c.total, saldo_resultante: 0,
            referencia_id: c.id, referencia_tipo: "compra", created_at: c.created_at,
          });
        }
      }

      for (const pg of (pagos || []) as any[]) {
        movements.push({
          id: pg.id, proveedor_id: provId, fecha: pg.fecha, tipo: "pago",
          descripcion: `Pago ${pg.forma_pago}${pg.observacion ? " - " + pg.observacion : ""}`,
          monto: pg.monto, saldo_resultante: 0,
          referencia_id: pg.id, referencia_tipo: "pago", created_at: pg.created_at,
        });
      }

      // Sort chronologically and calculate running balance
      movements.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let runBal = 0;
      for (const m of movements) {
        if (m.tipo === "compra") runBal += m.monto;
        else if (m.tipo === "pago") runBal -= m.monto;
        m.saldo_resultante = runBal;
      }
      setCcMovimientos(movements);

      const totalDebe = movements.filter((m) => m.tipo === "compra").reduce((s, m) => s + m.monto, 0);
      const totalHaber = movements.filter((m) => m.tipo === "pago").reduce((s, m) => s + m.monto, 0);
      const { data: freshProv } = await supabase.from("proveedores").select("saldo").eq("id", provId).single();
      setCcTotals({ debe: totalDebe, haber: totalHaber, saldo: freshProv?.saldo ?? 0 });
    }
  };

  const openCuentaCorriente = async (p: Proveedor) => {
    ccDialog.onOpen(p);
    setHistTab("resumen");
    setCcDesde("");
    setCcHasta("");
    setHistExpanded(null);
    // Fetch CC and compras in parallel
    const fetchAll = async () => {
      setHistComprasLoading(true);
      const [, comprasRes] = await Promise.all([
        fetchCuentaCorriente(p.id),
        supabase.from("compras")
          .select("id, numero, fecha, total, estado, forma_pago, estado_pago, monto_pagado, compra_items(descripcion, cantidad, precio_unitario, subtotal)")
          .eq("proveedor_id", p.id)
          .neq("estado", "Anulada")
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      const compras = (comprasRes.data || []) as any[];
      setHistCompras(compras);
      const totalCompras = compras.reduce((s: number, c: any) => s + (c.total || 0), 0);
      // Use monto_pagado if set, otherwise infer from estado_pago (older records may not have monto_pagado)
      const totalPagado = compras.reduce((s: number, c: any) => {
        if (c.monto_pagado > 0) return s + c.monto_pagado;
        if (c.estado_pago === "Pagada") return s + (c.total || 0);
        return s;
      }, 0);
      setHistComprasTotals({ total: totalCompras, pagado: totalPagado, pendiente: Math.max(0, totalCompras - totalPagado) });
      setHistComprasLoading(false);
    };
    fetchAll();
  };

  // ─── Boletas Pendientes ───
  const openBoletas = async (p: Proveedor) => {
    boletasDialog.onOpen(p);
    const { data } = await supabase
      .from("compras")
      .select("*")
      .eq("proveedor_id", p.id)
      .eq("estado_pago", "Pendiente")
      .order("fecha", { ascending: false });
    setComprasPendientes((data || []) as any[]);
  };

  // ─── Pago ───
  const openPago = (p: Proveedor) => {
    pagoDialog.onOpen(p);
  };

  // ─── Derived ───
  const filtered = providers.filter(
    (p) => norm(p.nombre).includes(norm(search)) || (p.cuit || "").includes(search)
  );
  const totalDebt = providers.reduce((a, p) => a + p.saldo, 0);
  const conDeuda = providers.filter((p) => p.saldo > 0).length;

  const f = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });

  const handleImportProveedores = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) { showAdminToast("El archivo está vacío", "error"); return; }

      const normalize = (key: string) => key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const getVal = (row: Record<string, any>, ...keys: string[]) => {
        for (const k of Object.keys(row)) {
          const nk = normalize(k);
          for (const target of keys) { if (nk === normalize(target) || nk.includes(normalize(target))) return String(row[k] || "").trim(); }
        }
        return "";
      };

      let imported = 0, updated = 0, failed = 0;

      // Pre-parse all rows into payloads
      const parsedRows: { nombre: string; cuit: string; payload: Record<string, any> }[] = [];
      for (const row of rows) {
        const nombre = getVal(row, "nombre", "proveedor");
        if (!nombre) { failed++; continue; }

        const payload: Record<string, any> = {
          nombre,
          razon_social: getVal(row, "razon social") || null,
          cuit: getVal(row, "cuit") || null,
          condicion_iva: getVal(row, "condicion iva", "iva") || null,
          codigo_proveedor: getVal(row, "codigo", "cod") || null,
          rubro: getVal(row, "rubro") || null,
          telefono: getVal(row, "telefono", "tel") || null,
          telefono2: getVal(row, "telefono 2", "tel2") || null,
          email: getVal(row, "email", "correo", "mail") || null,
          web: getVal(row, "web", "sitio", "pagina") || null,
          domicilio: getVal(row, "domicilio", "direccion") || null,
          localidad: getVal(row, "localidad", "ciudad") || null,
          provincia: getVal(row, "provincia") || null,
          contacto_nombre: getVal(row, "contacto") || null,
          contacto_cargo: getVal(row, "cargo contacto", "cargo") || null,
          dias_entrega: getVal(row, "dias entrega") || null,
          plazo_pago: getVal(row, "plazo pago", "plazo") || null,
          observacion: getVal(row, "observacion", "notas") || null,
          activo: true,
        };

        parsedRows.push({ nombre, cuit: payload.cuit || "", payload });
      }

      // Batch fetch existing proveedores by CUIT
      const allCuits = parsedRows.map((r) => r.cuit).filter(Boolean);
      const cuitMap = new Map<string, string>();
      if (allCuits.length > 0) {
        const { data: byCuits } = await supabase.from("proveedores").select("id, cuit").eq("activo", true).in("cuit", allCuits);
        if (byCuits) byCuits.forEach((p) => { if (p.cuit) cuitMap.set(p.cuit, p.id); });
      }

      // Batch fetch existing proveedores by nombre (for rows without CUIT match)
      const nombresWithoutCuit = parsedRows
        .filter((r) => !r.cuit || !cuitMap.has(r.cuit))
        .map((r) => r.nombre);
      const nameMap = new Map<string, string>();
      if (nombresWithoutCuit.length > 0) {
        const { data: byNames } = await supabase.from("proveedores").select("id, nombre").eq("activo", true).in("nombre", nombresWithoutCuit);
        if (byNames) byNames.forEach((p) => nameMap.set(p.nombre, p.id));
      }

      // Process rows using lookup maps
      const newRecords: Record<string, any>[] = [];
      for (const { nombre, cuit, payload } of parsedRows) {
        let existingId: string | null = null;
        if (cuit && cuitMap.has(cuit)) existingId = cuitMap.get(cuit)!;
        if (!existingId && nameMap.has(nombre)) existingId = nameMap.get(nombre)!;

        if (existingId) {
          await supabase.from("proveedores").update(payload).eq("id", existingId);
          updated++;
        } else {
          newRecords.push(payload);
        }
      }

      // Batch insert new proveedores
      if (newRecords.length > 0) {
        const { error: insertError } = await supabase.from("proveedores").insert(newRecords);
        if (insertError) throw insertError;
        imported = newRecords.length;
      }

      showAdminToast(`Importación: ${imported} nuevos, ${updated} actualizados${failed > 0 ? `, ${failed} omitidos` : ""}`, "success");
      refetch();
    } catch (err: any) {
      showAdminToast("Error al importar: " + (err.message || "Error"), "error");
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <PageHeader
        title="Proveedores"
        description={`${providers.length} proveedores registrados`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              const XLSX = await import("xlsx");
              const ws = XLSX.utils.json_to_sheet(providers.map((p: any) => ({
                "Nombre": p.nombre,
                "Razón Social": p.razon_social || "",
                "CUIT": p.cuit || "",
                "Condición IVA": p.condicion_iva || "",
                "Código": p.codigo_proveedor || "",
                "Rubro": p.rubro || "",
                "Teléfono": p.telefono || "",
                "Teléfono 2": p.telefono2 || "",
                "Email": p.email || "",
                "Web": p.web || "",
                "Domicilio": p.domicilio || "",
                "Localidad": p.localidad || "",
                "Provincia": p.provincia || "",
                "Contacto": p.contacto_nombre || "",
                "Cargo Contacto": p.contacto_cargo || "",
                "Días Entrega": p.dias_entrega || "",
                "Plazo Pago": p.plazo_pago || "",
                "Saldo": p.saldo || 0,
                "Observación": p.observacion || "",
              })));
              ws["!cols"] = [
                { wch: 28 }, { wch: 30 }, { wch: 14 }, { wch: 22 }, { wch: 10 },
                { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 20 },
                { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 16 },
                { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 30 },
              ];
              const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
              XLSX.writeFile(wb, `Proveedores_${todayARG()}.xlsx`);
              showAdminToast(`${providers.length} proveedores exportados`, "success");
            }}><Download className="w-4 h-4 mr-1" />Exportar</Button>
            <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
              <FileText className="w-4 h-4 mr-1" />Importar
            </Button>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportProveedores} />
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nuevo proveedor</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard title="Total proveedores" value={providers.length} icon={Truck} iconColor="text-primary" iconBg="bg-primary/10" />
        <StatCard title="Deuda total" value={formatCurrency(totalDebt)} icon={DollarSign} iconColor="text-orange-500" iconBg="bg-orange-500/10" />
        <StatCard title="Con deuda" value={conDeuda} icon={AlertCircle} iconColor="text-red-500" iconBg="bg-red-500/10" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nombre o CUIT..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <EmptyState title="No se encontraron proveedores" icon={Truck} />
          ) : (
            <>
              {/* Mobile card view */}
              <div className="sm:hidden divide-y">
                {filtered.map((p) => (
                  <div key={p.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{p.nombre}</div>
                        {(p as any).razon_social && <div className="text-xs text-muted-foreground">{(p as any).razon_social}</div>}
                        {p.cuit && <div className="text-xs text-muted-foreground font-mono">{p.cuit}</div>}
                      </div>
                      <div>
                        {p.saldo > 0 ? <span className="font-semibold text-orange-500 text-sm">{formatCurrency(p.saldo)}</span> : <span className="text-muted-foreground text-sm">$0</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.rubro && <Badge variant="secondary" className="text-xs font-normal">{p.rubro}</Badge>}
                      {(prodCountMap[p.id] || 0) > 0 && (
                        <button
                          onClick={async () => {
                            const { data } = await supabase.from("producto_proveedores").select("productos(nombre, codigo, precio, stock)").eq("proveedor_id", p.id);
                            const prods = (data || []).map((pp: any) => pp.productos).filter(Boolean);
                            setProdListDialog({ open: true, nombre: p.nombre, productos: prods });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition"
                        >
                          {prodCountMap[p.id]} prod.
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
                      {p.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefono}</span>}
                      {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                    </div>
                    <div className="flex justify-end gap-1 pt-1 border-t">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Historial" onClick={() => openCuentaCorriente(p)}><History className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Registrar pago" onClick={() => openPago(p)}><DollarSign className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Edit className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-4 font-medium">Proveedor</th>
                      <th className="text-left py-3 px-4 font-medium">CUIT</th>
                      <th className="text-left py-3 px-4 font-medium">Rubro</th>
                      <th className="text-left py-3 px-4 font-medium">Contacto</th>
                      <th className="text-center py-3 px-4 font-medium">Productos</th>
                      <th className="text-right py-3 px-4 font-medium">Saldo</th>
                      <th className="text-right py-3 px-4 font-medium w-52">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium">{p.nombre}</div>
                          {(p as any).razon_social && <div className="text-xs text-muted-foreground">{(p as any).razon_social}</div>}
                          {(p as any).codigo_proveedor && <div className="text-[10px] text-muted-foreground">Cód: {(p as any).codigo_proveedor}</div>}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.cuit || "—"}</td>
                        <td className="py-3 px-4">
                          {p.rubro && <Badge variant="secondary" className="text-xs font-normal">{p.rubro}</Badge>}
                          {(p as any).plazo_pago && <div className="text-[10px] text-muted-foreground mt-0.5">{(p as any).plazo_pago}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
                            {p.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefono}</span>}
                            {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                            {(p as any).contacto_nombre && <span className="text-[10px]">Contacto: {(p as any).contacto_nombre}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {(prodCountMap[p.id] || 0) > 0 ? (
                            <button
                              onClick={async () => {
                                const { data } = await supabase.from("producto_proveedores").select("productos(nombre, codigo, precio, stock)").eq("proveedor_id", p.id);
                                const prods = (data || []).map((pp: any) => pp.productos).filter(Boolean);
                                setProdListDialog({ open: true, nombre: p.nombre, productos: prods });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition"
                            >
                              {prodCountMap[p.id]} prod.
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-xs">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {p.saldo > 0 ? <span className="font-semibold text-orange-500">{formatCurrency(p.saldo)}</span> : <span className="text-muted-foreground">$0</span>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Historial" onClick={() => openCuentaCorriente(p)}><History className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Registrar pago" onClick={() => openPago(p)}><DollarSign className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog.open} onOpenChange={editDialog.setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editDialog.data ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle></DialogHeader>
          <div className="space-y-5 mt-2">
            {/* Datos principales */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Datos principales</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Nombre comercial *</Label><Input value={form.nombre} onChange={(e) => f("nombre", e.target.value)} placeholder="Ej: Arcor" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Razón social</Label><Input value={form.razon_social} onChange={(e) => f("razon_social", e.target.value)} placeholder="Ej: Arcor S.A.I.C." /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">CUIT</Label><Input value={form.cuit} onChange={(e) => f("cuit", e.target.value)} placeholder="XX-XXXXXXXX-X" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Cond. IVA</Label>
                  <Select value={form.condicion_iva} onValueChange={(v) => f("condicion_iva", v || "")}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                      <SelectItem value="Monotributista">Monotributista</SelectItem>
                      <SelectItem value="Exento">Exento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Código proveedor</Label><Input value={form.codigo_proveedor} onChange={(e) => f("codigo_proveedor", e.target.value)} placeholder="Código interno" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Rubro</Label><Input value={form.rubro} onChange={(e) => f("rubro", e.target.value)} placeholder="Ej: Golosinas, Bebidas" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Página web</Label><Input value={form.web} onChange={(e) => f("web", e.target.value)} placeholder="www.ejemplo.com" /></div>
              </div>
            </div>

            {/* Contacto */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contacto</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Teléfono principal</Label><Input value={form.telefono} onChange={(e) => f("telefono", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Teléfono alternativo</Label><Input value={form.telefono2} onChange={(e) => f("telefono2", e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">E-mail</Label><Input value={form.email} onChange={(e) => f("email", e.target.value)} type="email" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Nombre de contacto</Label><Input value={form.contacto_nombre} onChange={(e) => f("contacto_nombre", e.target.value)} placeholder="Ej: Juan Pérez" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Cargo</Label><Input value={form.contacto_cargo} onChange={(e) => f("contacto_cargo", e.target.value)} placeholder="Ej: Vendedor" /></div>
              </div>
            </div>

            {/* Dirección */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dirección</h3>
              <div className="space-y-1.5"><Label className="text-xs">Domicilio</Label><Input value={form.domicilio} onChange={(e) => f("domicilio", e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Localidad</Label><Input value={form.localidad} onChange={(e) => f("localidad", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Provincia</Label><Input value={form.provincia} onChange={(e) => f("provincia", e.target.value)} /></div>
              </div>
            </div>

            {/* Condiciones comerciales */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Condiciones comerciales</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Días de entrega</Label><Input value={form.dias_entrega} onChange={(e) => f("dias_entrega", e.target.value)} placeholder="Ej: Lunes y Jueves" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Plazo de pago</Label><Input value={form.plazo_pago} onChange={(e) => f("plazo_pago", e.target.value)} placeholder="Ej: 30 días, Contado" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Observaciones</Label><Textarea value={form.observacion} onChange={(e) => f("observacion", e.target.value)} rows={2} placeholder="Notas adicionales..." /></div>
            </div>

            {/* Cuentas bancarias del proveedor */}
            {editDialog.data && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Cuentas bancarias / Alias</Label>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                    setAliasDialog({ open: true, alias: "", titular: "" });
                  }}>
                    <Plus className="w-3 h-3 mr-1" /> Agregar
                  </Button>
                </div>
                {provCuentas.filter((c) => c.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin cuentas registradas. Agregá el alias para transferencias.</p>
                ) : (
                  <div className="space-y-1.5">
                    {provCuentas.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{c.alias || c.nombre}</span>
                            {c.tipo_cuenta && <Badge variant="outline" className="text-[10px] h-4">{c.tipo_cuenta}</Badge>}
                          </div>
                          {c.cbu_cvu && <div className="text-[11px] text-muted-foreground font-mono">CBU/CVU: {c.cbu_cvu}</div>}
                          {c.titular && <div className="text-[11px] text-muted-foreground">Titular: {c.titular}</div>}
                          {c.nombre && c.alias && <div className="text-[10px] text-muted-foreground">{c.nombre}</div>}
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => {
                          setConfirmDialog({
                            open: true,
                            title: "Eliminar cuenta",
                            message: "¿Eliminar esta cuenta?",
                            onConfirm: async () => {
                              await supabase.from("cuentas_bancarias").update({ activo: false }).eq("id", c.id);
                              setProvCuentas((prev) => prev.filter((x) => x.id !== c.id));
                              showAdminToast("Cuenta eliminada", "success");
                            },
                          });
                        }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Historial de compras */}
            {editDialog.data && (
              <div className="space-y-2 border-t pt-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />Historial de compras
                </h3>
                {historialLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
                ) : historialCompras.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin compras registradas</p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="text-left py-1.5 px-2.5 font-semibold text-[10px] uppercase tracking-wider">Fecha</th>
                          <th className="text-left py-1.5 px-2.5 font-semibold text-[10px] uppercase tracking-wider">Número</th>
                          <th className="text-right py-1.5 px-2.5 font-semibold text-[10px] uppercase tracking-wider">Total</th>
                          <th className="text-center py-1.5 px-2.5 font-semibold text-[10px] uppercase tracking-wider">Estado</th>
                          <th className="text-left py-1.5 px-2.5 font-semibold text-[10px] uppercase tracking-wider">Forma de pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historialCompras.map((c) => (
                          <tr
                            key={c.id}
                            className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => window.open(`/admin/compras?id=${c.id}`, "_blank")}
                          >
                            <td className="py-1.5 px-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDateARG(c.fecha)}</td>
                            <td className="py-1.5 px-2.5 text-xs font-medium">{c.numero}</td>
                            <td className="py-1.5 px-2.5 text-xs text-right font-semibold tabular-nums">{formatCurrency(c.total)}</td>
                            <td className="py-1.5 px-2.5 text-center">
                              <Badge variant={c.estado === "Completada" ? "default" : c.estado === "Pendiente" ? "secondary" : "outline"} className="text-[10px] font-normal px-1.5 py-0">
                                {c.estado}
                              </Badge>
                            </td>
                            <td className="py-1.5 px-2.5 text-xs text-muted-foreground">{c.forma_pago || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={editDialog.onClose}>Cancelar</Button>
              <Button onClick={handleSave}>{editDialog.data ? "Guardar cambios" : "Crear proveedor"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Historial Proveedor — Unified Dialog (Resumen + Compras) */}
      <Dialog open={ccDialog.open} onOpenChange={ccDialog.setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial — {ccDialog.data?.nombre}</DialogTitle>
            {ccDialog.data?.cuit && <p className="text-xs text-gray-500">CUIT: {ccDialog.data.cuit}</p>}
          </DialogHeader>
          {ccDialog.data && (() => {
            const fmtSaldo = (v: number) => v > 0 ? formatCurrency(v) : v < 0 ? `${formatCurrency(Math.abs(v))} a favor` : "$0";
            const saldoColor = (v: number) => v > 0 ? "text-orange-600" : v < 0 ? "text-emerald-600" : "";
            const cleanDesc = (d: string) => d
              .replace(/\s*-\s*([\w\s]+)$/i, "")
              .replace(/Compra\s+(\d{5})-(\d{8})/i, (_, _a, b) => `Compra #${parseInt(b)}`)
              .replace(/Pago\s+(Efectivo|Transferencia)/i, (_, m) => `Pago ${m}`);
            const saldoAct = Math.round(ccTotals.saldo);
            const totalDebe = ccMovimientos.filter((m) => m.tipo === "compra").reduce((s, m) => s + m.monto, 0);
            const totalHaber = ccMovimientos.filter((m) => m.tipo === "pago").reduce((s, m) => s + m.monto, 0);

            const exportExcel = async () => {
              if (!ccDialog.data || ccMovimientos.length === 0) return;
              const XLSX = await import("xlsx");
              const rows = ccMovimientos.map((m) => ({
                Fecha: formatDateARG(m.fecha),
                Tipo: m.tipo === "compra" ? "Compra" : m.tipo === "pago" ? "Pago" : "Ajuste",
                Descripcion: cleanDesc(m.descripcion),
                Debe: m.tipo === "compra" ? Math.round(m.monto) : "",
                Haber: m.tipo === "pago" ? Math.round(m.monto) : "",
                Saldo: Math.round(m.saldo_resultante),
              }));
              const ws = XLSX.utils.json_to_sheet(rows);
              ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Cuenta Corriente");
              XLSX.writeFile(wb, `CC_${ccDialog.data!.nombre.replace(/\s/g, "_")}_${todayARG()}.xlsx`);
            };

            return (
              <div className="space-y-3 mt-1">
                {/* Tabs */}
                <div className="flex gap-1 border-b">
                  {([["resumen", "Resumen"], ["compras", "Compras"]] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setHistTab(key)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        histTab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}>{label}</button>
                  ))}
                </div>

                {/* ─── Tab: Resumen (CC Libro Diario) ─── */}
                {histTab === "resumen" && (
                  <div className="space-y-3">
                    {/* Date filters */}
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Desde</Label>
                        <Input type="date" value={ccDesde} onChange={(e) => setCcDesde(e.target.value)} className="h-8 text-sm w-36" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Hasta</Label>
                        <Input type="date" value={ccHasta} onChange={(e) => setCcHasta(e.target.value)} className="h-8 text-sm w-36" />
                      </div>
                      <Button size="sm" className="h-8" onClick={() => ccDialog.data && fetchCuentaCorriente(ccDialog.data.id, ccDesde, ccHasta)}>
                        <Search className="w-3.5 h-3.5 mr-1" />Filtrar
                      </Button>
                      <div className="ml-auto flex gap-2">
                        {ccMovimientos.length > 0 && (
                          <Button size="sm" variant="outline" className="h-8" onClick={exportExcel}>
                            <Download className="w-3.5 h-3.5 mr-1" />Excel
                          </Button>
                        )}
                        {saldoAct > 0 && (
                          <Button size="sm" className="h-8" onClick={() => { ccDialog.onClose(); openPago(ccDialog.data!); }}>
                            <DollarSign className="w-3.5 h-3.5 mr-1" />Registrar pago
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* KPI cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Compras</p>
                        <p className="text-base font-bold">{formatCurrency(Math.round(totalDebe))}</p>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pagos</p>
                        <p className="text-base font-bold text-emerald-600">{formatCurrency(Math.round(totalHaber))}</p>
                      </div>
                      <div className={`rounded-lg border p-2.5 ${saldoAct > 0 ? "bg-orange-50 border-orange-200" : saldoAct < 0 ? "bg-emerald-50 border-emerald-200" : ""}`}>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Saldo</p>
                        <p className={`text-base font-bold ${saldoColor(saldoAct)}`}>{fmtSaldo(saldoAct)}</p>
                      </div>
                    </div>

                    {/* CC Table */}
                    {ccMovimientos.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Sin movimientos en el período</p>
                    ) : (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm min-w-[500px]">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider w-20">Fecha</th>
                              <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider w-16">Tipo</th>
                              <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider">Concepto</th>
                              <th className="text-right py-2 px-3 font-semibold text-[10px] uppercase tracking-wider w-24">Debe</th>
                              <th className="text-right py-2 px-3 font-semibold text-[10px] uppercase tracking-wider w-24">Haber</th>
                              <th className="text-right py-2 px-3 font-semibold text-[10px] uppercase tracking-wider w-28">Saldo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ccMovimientos.map((mov, i) => {
                              const prevDate = i > 0 ? ccMovimientos[i - 1].fecha : null;
                              const isNewDate = mov.fecha !== prevDate;
                              const sr = Math.round(mov.saldo_resultante);
                              return (
                                <tr key={mov.id} className={`border-b last:border-0 hover:bg-gray-50/50 ${isNewDate && i > 0 ? "border-t border-t-gray-200" : ""}`}>
                                  <td className="py-2 px-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                                    {isNewDate ? new Date(mov.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""}
                                  </td>
                                  <td className="py-2 px-3">
                                    <Badge variant={mov.tipo === "compra" ? "destructive" : mov.tipo === "pago" ? "default" : "secondary"} className="text-[10px] font-normal px-1.5 py-0">
                                      {mov.tipo === "compra" ? "FC" : mov.tipo === "pago" ? "RE" : "AJ"}
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-3 text-xs text-gray-500">{cleanDesc(mov.descripcion)}</td>
                                  <td className="py-2 px-3 text-right tabular-nums text-xs font-medium">
                                    {mov.tipo === "compra" ? formatCurrency(Math.round(mov.monto)) : ""}
                                  </td>
                                  <td className="py-2 px-3 text-right tabular-nums text-xs font-medium text-emerald-600">
                                    {mov.tipo === "pago" ? formatCurrency(Math.round(mov.monto)) : ""}
                                  </td>
                                  <td className={`py-2 px-3 text-right tabular-nums text-xs font-bold ${saldoColor(sr)}`}>{fmtSaldo(sr)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 border-t font-bold text-xs">
                              <td className="py-2.5 px-3 uppercase tracking-wider" colSpan={3}>Totales</td>
                              <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(Math.round(totalDebe))}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600">{formatCurrency(Math.round(totalHaber))}</td>
                              <td className={`py-2.5 px-3 text-right tabular-nums ${saldoColor(saldoAct)}`}>{fmtSaldo(saldoAct)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Tab: Compras ─── */}
                {histTab === "compras" && (
                  <div className="space-y-3">
                    {/* KPI cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total compras</p>
                        <p className="text-base font-bold">{formatCurrency(Math.round(histComprasTotals.total))}</p>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pagado</p>
                        <p className="text-base font-bold text-emerald-600">{formatCurrency(Math.round(histComprasTotals.pagado))}</p>
                      </div>
                      <div className={`rounded-lg border p-2.5 ${histComprasTotals.pendiente > 0 ? "bg-orange-50 border-orange-200" : ""}`}>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pendiente</p>
                        <p className={`text-base font-bold ${histComprasTotals.pendiente > 0 ? "text-orange-600" : ""}`}>{formatCurrency(Math.round(histComprasTotals.pendiente))}</p>
                      </div>
                    </div>

                    {histComprasLoading ? (
                      <div className="flex justify-center py-8"><LoadingSpinner /></div>
                    ) : histCompras.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Sin compras registradas</p>
                    ) : (
                      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                        {histCompras.map((c: any) => {
                          const isExpanded = histExpanded === c.id;
                          const items = c.compra_items || [];
                          const isPendiente = c.estado_pago === "Pendiente";
                          return (
                            <div key={c.id} className="border rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setHistExpanded(isExpanded ? null : c.id)}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 transition"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-xs text-gray-500">{c.numero}</span>
                                  <span className="text-xs text-gray-400">
                                    {new Date(c.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                  </span>
                                  <Badge variant={isPendiente ? "secondary" : "default"} className="text-[10px] px-1.5 py-0">
                                    {isPendiente ? "Pendiente" : "Pagada"}
                                  </Badge>
                                  <span className="text-[10px] text-gray-400">{c.forma_pago}</span>
                                </div>
                                <span className="font-semibold">{formatCurrency(c.total)}</span>
                              </button>
                              {isExpanded && items.length > 0 && (
                                <div className="border-t bg-gray-50/50 px-3 py-2 space-y-1">
                                  {items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-xs">
                                      <span className="text-gray-600">{item.cantidad}x {item.descripcion}</span>
                                      <span className="text-gray-700 font-medium">{formatCurrency(item.subtotal)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <PagoProveedorAllocationDialog
        open={pagoDialog.open}
        onOpenChange={(open) => pagoDialog.setOpen(open)}
        proveedor={pagoDialog.data}
        onSuccess={() => {
          refetch();
        }}
      />
      {/* Products list dialog */}
      <Dialog open={prodListDialog.open} onOpenChange={(v) => !v && setProdListDialog({ open: false, nombre: "", productos: [] })}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Productos de {prodListDialog.nombre}</DialogTitle>
          </DialogHeader>
          {prodListDialog.productos.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Sin productos vinculados</p>
          ) : (
            <div className="space-y-1">
              {prodListDialog.productos.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.nombre}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{p.codigo}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    <span className="text-muted-foreground">Stock: <strong className={p.stock <= 0 ? "text-red-500" : ""}>{p.stock}</strong></span>
                    <span className="font-semibold">{formatCurrency(p.precio)}</span>
                  </div>
                </div>
              ))}
              <div className="border-t pt-2 text-right text-xs text-muted-foreground">
                {prodListDialog.productos.length} productos
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Alias Dialog */}
      <Dialog open={aliasDialog.open} onOpenChange={(o) => setAliasDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Agregar cuenta bancaria / Alias</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Alias de transferencia</Label>
              <Input value={aliasDialog.alias} onChange={(e) => setAliasDialog(prev => ({ ...prev, alias: e.target.value }))} placeholder="Ej: dulcesur.pagos" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Titular (opcional)</Label>
              <Input value={aliasDialog.titular} onChange={(e) => setAliasDialog(prev => ({ ...prev, titular: e.target.value }))} placeholder="Nombre del titular" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setAliasDialog({ open: false, alias: "", titular: "" })}>Cancelar</Button>
            <Button disabled={!aliasDialog.alias.trim()} onClick={async () => {
              const alias = aliasDialog.alias.trim();
              const titular = aliasDialog.titular.trim();
              await supabase.from("cuentas_bancarias").insert({
                nombre: `${editDialog.data!.nombre} - ${alias}`,
                alias,
                titular: titular || editDialog.data!.nombre,
                origen: "proveedor",
                proveedor_id: editDialog.data!.id,
                activo: true,
              });
              const { data: cuentas } = await supabase.from("cuentas_bancarias").select("id, nombre, alias, cbu_cvu, tipo_cuenta, titular").eq("proveedor_id", editDialog.data!.id).eq("activo", true);
              setProvCuentas((cuentas || []) as any[]);
              setAliasDialog({ open: false, alias: "", titular: "" });
              showAdminToast("Cuenta agregada", "success");
            }}>Agregar</Button>
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
