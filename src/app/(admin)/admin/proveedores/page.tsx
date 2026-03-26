"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useState, useCallback, useRef, useEffect } from "react";
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
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";

import { formatCurrency, formatDateARG, todayARG } from "@/lib/formatters";
import type { Proveedor, Compra, PagoProveedor, CuentaCorrienteProveedor } from "@/types/database";
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

const emptyPagoForm = { monto: "", forma_pago: "Efectivo", compra_ids: [] as string[], observacion: "", registrar_caja: true, cuenta_bancaria_id: "" };

export default function ProveedoresPage() {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [pagoForm, setPagoForm] = useState(emptyPagoForm);
  const importRef = useRef<HTMLInputElement>(null);
  const [comprasPendientes, setComprasPendientes] = useState<(Compra & { proveedores?: { nombre: string } })[]>([]);
  const [ccMovimientos, setCcMovimientos] = useState<CuentaCorrienteProveedor[]>([]);
  const [provCuentas, setProvCuentas] = useState<{ id: string; nombre: string; alias: string; cbu_cvu: string; tipo_cuenta: string; titular: string }[]>([]);
  const [saving, setSaving] = useState(false);

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

  const handleDelete = async (id: string) => {
    const p = providers.find((pr) => pr.id === id);
    if (!confirm(`¿Eliminar a "${p?.nombre || "este proveedor"}"?`)) return;
    await proveedorService.update(id, { activo: false } as Partial<Proveedor>);
    refetch();
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
        if (c.forma_pago === "Cuenta Corriente" || c.estado_pago === "Pendiente") {
          movements.push({
            id: c.id, proveedor_id: provId, fecha: c.fecha, tipo: "compra",
            descripcion: `Compra ${c.numero}`, monto: c.total, saldo_resultante: 0,
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
    const hoy = todayARG();
    const hace90 = new Date(Date.now() - 90 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    setCcDesde(hace90);
    setCcHasta(hoy);
    await fetchCuentaCorriente(p.id, hace90, hoy);
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
  const openPago = async (p: Proveedor) => {
    setPagoForm({ ...emptyPagoForm, compra_ids: [] });
    pagoDialog.onOpen(p);
    // Fetch pending compras
    const { data } = await supabase
      .from("compras")
      .select("*")
      .eq("proveedor_id", p.id)
      .eq("estado_pago", "Pendiente")
      .order("fecha", { ascending: false });
    setComprasPendientes((data || []) as any[]);
    // Fetch bank accounts linked to this proveedor + all propia accounts
    const { data: cuentas } = await supabase
      .from("cuentas_bancarias")
      .select("id, nombre, alias, cbu_cvu, tipo_cuenta, titular")
      .or(`proveedor_id.eq.${p.id},origen.eq.propia`)
      .eq("activo", true);
    setProvCuentas((cuentas || []) as any[]);
  };

  const toggleCompraSelection = (compraId: string) => {
    setPagoForm((prev) => {
      const ids = prev.compra_ids.includes(compraId)
        ? prev.compra_ids.filter((id) => id !== compraId)
        : [...prev.compra_ids, compraId];
      // Auto-calculate total of selected boletas
      const total = comprasPendientes
        .filter((c) => ids.includes(c.id))
        .reduce((a, c) => a + c.total, 0);
      return { ...prev, compra_ids: ids, monto: total > 0 ? String(total) : prev.monto };
    });
  };

  const handlePago = async () => {
    if (saving) return; // Guard against double-click
    if (!pagoDialog.data) return;
    const monto = parseFloat(pagoForm.monto);
    if (!monto || monto <= 0) return;
    if (monto > pagoDialog.data.saldo && pagoDialog.data.saldo > 0) {
      if (!confirm(`El monto ($${monto.toLocaleString()}) supera la deuda ($${pagoDialog.data.saldo.toLocaleString()}). ¿Continuar?`)) return;
    }

    setSaving(true);
    try {
      const provId = pagoDialog.data.id;
      const provNombre = pagoDialog.data.nombre;

      // 1. Insert pago
      const cuentaId = pagoForm.cuenta_bancaria_id || null;
      const cuentaInfo = cuentaId ? provCuentas.find((c) => c.id === cuentaId) : null;
      const { error: pagoError } = await supabase.from("pagos_proveedores").insert({
        proveedor_id: provId,
        fecha: todayARG(),
        monto,
        forma_pago: pagoForm.forma_pago,
        compra_id: pagoForm.compra_ids.length === 1 ? pagoForm.compra_ids[0] : null,
        observacion: pagoForm.observacion || null,
        cuenta_bancaria_id: cuentaId,
      });
      if (pagoError) throw new Error(pagoError.message);

      // 2. Update proveedor saldo
      const newSaldo = pagoDialog.data.saldo - monto;
      await proveedorService.update(provId, { saldo: newSaldo } as Partial<Proveedor>);

      // 3. Mark selected compras as paid
      if (pagoForm.compra_ids.length > 0) {
        for (const compraId of pagoForm.compra_ids) {
          await supabase
            .from("compras")
            .update({ estado_pago: "Pagada" })
            .eq("id", compraId);
        }
      }

      // 4. Register CC movement
      const cuentaDesc = cuentaInfo ? ` → ${cuentaInfo.alias || cuentaInfo.nombre}` : "";
      await supabase.from("cuenta_corriente_proveedor").insert({
        proveedor_id: provId,
        fecha: todayARG(),
        tipo: "pago",
        descripcion: `Pago ${pagoForm.forma_pago}${cuentaDesc}${pagoForm.compra_ids.length > 0 ? ` (${pagoForm.compra_ids.length} boleta/s)` : ""}`,
        monto,
        saldo_resultante: newSaldo,
        referencia_tipo: "pago",
      });

      // 5. Register caja movement (egreso) if selected
      if (pagoForm.registrar_caja && pagoForm.forma_pago !== "Cuenta Corriente") {
        await supabase.from("caja_movimientos").insert({
          fecha: todayARG(),
          hora: new Date().toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires" }),
          tipo: "egreso",
          descripcion: `Pago a proveedor: ${provNombre}`,
          metodo_pago: pagoForm.forma_pago,
          monto,
          referencia_tipo: "pago_proveedor",
        });
      }

      pagoDialog.onClose();
      refetch();
    } finally {
      setSaving(false);
    }
  };

  // ─── Derived ───
  const filtered = providers.filter(
    (p) => p.nombre.toLowerCase().includes(search.toLowerCase()) || (p.cuit || "").includes(search)
  );
  const totalDebt = providers.reduce((a, p) => a + p.saldo, 0);
  const conDeuda = providers.filter((p) => p.saldo > 0).length;

  const f = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });

  const handleImportProveedores = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
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

        // Match by CUIT or name
        let existingId: string | null = null;
        if (payload.cuit) {
          const { data: byCuit } = await supabase.from("proveedores").select("id").eq("cuit", payload.cuit).eq("activo", true).maybeSingle();
          if (byCuit) existingId = byCuit.id;
        }
        if (!existingId) {
          const { data: byName } = await supabase.from("proveedores").select("id").eq("nombre", nombre).eq("activo", true).maybeSingle();
          if (byName) existingId = byName.id;
        }

        if (existingId) {
          await supabase.from("proveedores").update(payload).eq("id", existingId);
          updated++;
        } else {
          await supabase.from("proveedores").insert(payload);
          imported++;
        }
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
            <Button variant="outline" size="sm" onClick={() => {
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
            <div className="overflow-x-auto">
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Cuenta corriente" onClick={() => openCuentaCorriente(p)}><History className="w-3.5 h-3.5" /></Button>
                          {p.saldo > 0 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Boletas pendientes" onClick={() => openBoletas(p)}><FileText className="w-3.5 h-3.5" /></Button>
                          )}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Nombre comercial *</Label><Input value={form.nombre} onChange={(e) => f("nombre", e.target.value)} placeholder="Ej: Arcor" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Razón social</Label><Input value={form.razon_social} onChange={(e) => f("razon_social", e.target.value)} placeholder="Ej: Arcor S.A.I.C." /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Rubro</Label><Input value={form.rubro} onChange={(e) => f("rubro", e.target.value)} placeholder="Ej: Golosinas, Bebidas" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Página web</Label><Input value={form.web} onChange={(e) => f("web", e.target.value)} placeholder="www.ejemplo.com" /></div>
              </div>
            </div>

            {/* Contacto */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contacto</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Teléfono principal</Label><Input value={form.telefono} onChange={(e) => f("telefono", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Teléfono alternativo</Label><Input value={form.telefono2} onChange={(e) => f("telefono2", e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">E-mail</Label><Input value={form.email} onChange={(e) => f("email", e.target.value)} type="email" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Nombre de contacto</Label><Input value={form.contacto_nombre} onChange={(e) => f("contacto_nombre", e.target.value)} placeholder="Ej: Juan Pérez" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Cargo</Label><Input value={form.contacto_cargo} onChange={(e) => f("contacto_cargo", e.target.value)} placeholder="Ej: Vendedor" /></div>
              </div>
            </div>

            {/* Dirección */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dirección</h3>
              <div className="space-y-1.5"><Label className="text-xs">Domicilio</Label><Input value={form.domicilio} onChange={(e) => f("domicilio", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Localidad</Label><Input value={form.localidad} onChange={(e) => f("localidad", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Provincia</Label><Input value={form.provincia} onChange={(e) => f("provincia", e.target.value)} /></div>
              </div>
            </div>

            {/* Condiciones comerciales */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Condiciones comerciales</h3>
              <div className="grid grid-cols-2 gap-3">
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
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                    const alias = prompt("Alias de transferencia:");
                    if (!alias) return;
                    const titular = prompt("Titular (opcional):") || "";
                    await supabase.from("cuentas_bancarias").insert({
                      nombre: `${editDialog.data!.nombre} - ${alias}`,
                      alias,
                      titular: titular || editDialog.data!.nombre,
                      origen: "proveedor",
                      proveedor_id: editDialog.data!.id,
                      activo: true,
                    });
                    // Refresh cuentas
                    const { data: cuentas } = await supabase.from("cuentas_bancarias").select("id, nombre, alias, cbu_cvu, tipo_cuenta, titular").eq("proveedor_id", editDialog.data!.id).eq("activo", true);
                    setProvCuentas((cuentas || []) as any[]);
                    showAdminToast("Cuenta agregada", "success");
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
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={async () => {
                          if (!confirm("¿Eliminar esta cuenta?")) return;
                          await supabase.from("cuentas_bancarias").update({ activo: false }).eq("id", c.id);
                          setProvCuentas((prev) => prev.filter((x) => x.id !== c.id));
                          showAdminToast("Cuenta eliminada", "success");
                        }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
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

      {/* Cuenta Corriente Dialog */}
      <Dialog open={ccDialog.open} onOpenChange={ccDialog.setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Cuenta Corriente - {ccDialog.data?.nombre}</DialogTitle></DialogHeader>
          {ccDialog.data && (() => {
            const fmtSaldo = (v: number) => v > 0 ? formatCurrency(v) : v < 0 ? `${formatCurrency(Math.abs(v))} a favor` : "$0";
            const saldoColor = (v: number) => v > 0 ? "text-orange-600" : v < 0 ? "text-emerald-600" : "";
            const cleanDesc = (d: string) => d
              .replace(/\s*-\s*([\w\s]+)$/i, "")
              .replace(/Compra\s+(\d{5})-(\d{8})/i, (_, _a, b) => `Compra #${parseInt(b)}`)
              .replace(/Pago\s+(Efectivo|Transferencia)/i, (_, m) => `Pago ${m}`);
            const saldoAct = Math.round(ccTotals.saldo);
            const exportExcel = () => {
              if (!ccDialog.data || ccMovimientos.length === 0) return;
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
            const totalDebe = ccMovimientos.filter((m) => m.tipo === "compra").reduce((s, m) => s + m.monto, 0);
            const totalHaber = ccMovimientos.filter((m) => m.tipo === "pago").reduce((s, m) => s + m.monto, 0);

            return (
              <div className="space-y-3 mt-2">
                <div className="flex items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Desde</Label>
                    <Input type="date" value={ccDesde} onChange={(e) => setCcDesde(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Hasta</Label>
                    <Input type="date" value={ccHasta} onChange={(e) => setCcHasta(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <Button size="sm" className="h-8" onClick={() => ccDialog.data && fetchCuentaCorriente(ccDialog.data.id, ccDesde, ccHasta)}>
                    <Search className="w-3.5 h-3.5 mr-1" />Filtrar
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border p-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Débitos</p>
                    <p className="text-base font-bold">{formatCurrency(Math.round(totalDebe))}</p>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Créditos</p>
                    <p className="text-base font-bold text-emerald-600">{formatCurrency(Math.round(totalHaber))}</p>
                  </div>
                  <div className={`rounded-lg border p-2.5 ${saldoAct > 0 ? "bg-orange-50 border-orange-200" : saldoAct < 0 ? "bg-emerald-50 border-emerald-200" : ""}`}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo actual</p>
                    <p className={`text-base font-bold ${saldoColor(saldoAct)}`}>{fmtSaldo(saldoAct)}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  {ccMovimientos.length > 0 && (
                    <Button size="sm" variant="outline" onClick={exportExcel}>
                      <Download className="w-3.5 h-3.5 mr-1" />Excel
                    </Button>
                  )}
                  {saldoAct > 0 && (
                    <Button size="sm" onClick={() => { ccDialog.onClose(); openPago(ccDialog.data!); }}>
                      <DollarSign className="w-3.5 h-3.5 mr-1" />Registrar pago
                    </Button>
                  )}
                </div>

                {ccMovimientos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos en cuenta corriente</p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b">
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
                            <tr key={mov.id} className={`border-b last:border-0 hover:bg-muted/30 ${isNewDate && i > 0 ? "border-t border-t-foreground/10" : ""}`}>
                              <td className="py-2 px-3 text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                                {isNewDate ? new Date(mov.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""}
                              </td>
                              <td className="py-2 px-3">
                                <Badge variant={mov.tipo === "compra" ? "destructive" : mov.tipo === "pago" ? "default" : "secondary"} className="text-[10px] font-normal px-1.5 py-0">
                                  {mov.tipo === "compra" ? "FC" : mov.tipo === "pago" ? "RE" : "AJ"}
                                </Badge>
                              </td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">{cleanDesc(mov.descripcion)}</td>
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
                        <tr className="bg-muted/50 border-t font-bold text-xs">
                          <td className="py-2.5 px-3 uppercase tracking-wider" colSpan={3}>Totales</td>
                          <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(Math.round(totalDebe))}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600">{formatCurrency(Math.round(totalHaber))}</td>
                          <td className={`py-2.5 px-3 text-right tabular-nums ${saldoColor(saldoAct)}`}>{fmtSaldo(saldoAct)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button variant="outline" size="sm" onClick={ccDialog.onClose}>Cerrar</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Boletas Pendientes Dialog */}
      <Dialog open={boletasDialog.open} onOpenChange={boletasDialog.setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Boletas Pendientes</DialogTitle></DialogHeader>
          {boletasDialog.data && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="font-medium">{boletasDialog.data.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  Deuda total: <span className="font-semibold text-orange-500">{formatCurrency(boletasDialog.data.saldo)}</span>
                </p>
              </div>

              {comprasPendientes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No hay boletas pendientes de pago</p>
              ) : (
                <div className="overflow-y-auto max-h-80 space-y-2">
                  {comprasPendientes.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium text-sm">{c.numero}</p>
                        <p className="text-xs text-muted-foreground">{formatDateARG(c.fecha)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-orange-500">{formatCurrency(c.total)}</p>
                        <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-3 text-sm">
                    <span className="text-muted-foreground">Total pendiente:</span>
                    <span className="font-bold">{formatCurrency(comprasPendientes.reduce((a, c) => a + c.total, 0))}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={boletasDialog.onClose}>Cerrar</Button>
                {comprasPendientes.length > 0 && (
                  <Button onClick={() => { boletasDialog.onClose(); if (boletasDialog.data) openPago(boletasDialog.data); }}>
                    <DollarSign className="w-4 h-4 mr-2" />Registrar Pago
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pago Dialog */}
      <Dialog open={pagoDialog.open} onOpenChange={pagoDialog.setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          {pagoDialog.data && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="font-medium">{pagoDialog.data.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  Deuda actual: <span className="font-semibold text-orange-500">{formatCurrency(pagoDialog.data.saldo)}</span>
                </p>
              </div>

              {/* Select boletas to pay */}
              {comprasPendientes.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Seleccionar boletas a pagar</Label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {comprasPendientes.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={pagoForm.compra_ids.includes(c.id)}
                          onChange={() => toggleCompraSelection(c.id)}
                          className="rounded"
                        />
                        <div className="flex-1 flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium">{c.numero}</span>
                            <span className="text-xs text-muted-foreground ml-2">{formatDateARG(c.fecha)}</span>
                          </div>
                          <span className="text-sm font-semibold">{formatCurrency(c.total)}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={pagoForm.monto}
                  onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Forma de pago</Label>
                <Select value={pagoForm.forma_pago} onValueChange={(v) => setPagoForm({ ...pagoForm, forma_pago: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar forma de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {pagoForm.forma_pago === "Transferencia" && provCuentas.length > 0 && (
                <div className="space-y-2">
                  <Label>Cuenta destino</Label>
                  <Select value={pagoForm.cuenta_bancaria_id} onValueChange={(v) => setPagoForm({ ...pagoForm, cuenta_bancaria_id: v ?? "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cuenta">
                        {(() => {
                          const sel = provCuentas.find((c) => c.id === pagoForm.cuenta_bancaria_id);
                          return sel ? `${sel.nombre}${sel.alias ? ` (${sel.alias})` : ""}${sel.titular ? ` — ${sel.titular}` : ""}` : "Seleccionar cuenta";
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {provCuentas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}{c.alias ? ` (${c.alias})` : ""}{c.titular ? ` — ${c.titular}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(pagoForm.forma_pago === "Efectivo" || pagoForm.forma_pago === "Transferencia") && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={pagoForm.registrar_caja} onChange={(e) => setPagoForm({ ...pagoForm, registrar_caja: e.target.checked })} className="rounded" />
                  <span className="text-sm">Registrar en caja diaria</span>
                </label>
              )}

              <div className="space-y-2">
                <Label>Observaciones</Label>
                <Textarea
                  placeholder="Opcional..."
                  value={pagoForm.observacion}
                  onChange={(e) => setPagoForm({ ...pagoForm, observacion: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={pagoDialog.onClose}>Cancelar</Button>
                <Button onClick={handlePago} disabled={saving || !pagoForm.monto || parseFloat(pagoForm.monto) <= 0}>
                  {saving ? "Registrando..." : "Registrar Pago"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
    </div>
  );
}
