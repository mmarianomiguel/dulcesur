"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";

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

const emptyForm = { nombre: "", cuit: "", telefono: "", email: "", domicilio: "", rubro: "", observacion: "" };

const emptyPagoForm = { monto: "", forma_pago: "Efectivo", compra_ids: [] as string[], observacion: "", registrar_caja: true };

export default function ProveedoresPage() {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [pagoForm, setPagoForm] = useState(emptyPagoForm);
  const [comprasPendientes, setComprasPendientes] = useState<(Compra & { proveedores?: { nombre: string } })[]>([]);
  const [ccMovimientos, setCcMovimientos] = useState<CuentaCorrienteProveedor[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchProviders = useCallback(
    () => proveedorService.getAll({ filters: { activo: true }, orderBy: "nombre" }),
    []
  );

  const { data: providers, loading, refetch } = useAsyncData({
    fetcher: fetchProviders,
    initialData: [],
  });

  const editDialog = useDialog<Proveedor>();
  const pagoDialog = useDialog<Proveedor>();
  const ccDialog = useDialog<Proveedor>();
  const boletasDialog = useDialog<Proveedor>();

  // ─── Edit/Create ───
  const openNew = () => {
    setForm(emptyForm);
    editDialog.onOpen();
  };

  const openEdit = (p: Proveedor) => {
    setForm({
      nombre: p.nombre,
      cuit: p.cuit || "",
      telefono: p.telefono || "",
      email: p.email || "",
      domicilio: p.domicilio || "",
      rubro: p.rubro || "",
      observacion: p.observacion || "",
    });
    editDialog.onOpen(p);
  };

  const handleSave = async () => {
    const payload = {
      nombre: form.nombre,
      cuit: form.cuit || null,
      telefono: form.telefono || null,
      email: form.email || null,
      domicilio: form.domicilio || null,
      rubro: form.rubro || null,
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
    await proveedorService.update(id, { activo: false } as Partial<Proveedor>);
    refetch();
  };

  // ─── Cuenta Corriente ───
  const openCuentaCorriente = async (p: Proveedor) => {
    ccDialog.onOpen(p);
    setCcMovimientos([]);

    // Fetch from cuenta_corriente_proveedor table
    const { data: ccData } = await supabase
      .from("cuenta_corriente_proveedor")
      .select("*")
      .eq("proveedor_id", p.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (ccData && ccData.length > 0) {
      setCcMovimientos(ccData as CuentaCorrienteProveedor[]);
    } else {
      // Fallback: build history from compras (CC) + pagos
      const [{ data: compras }, { data: pagos }] = await Promise.all([
        supabase
          .from("compras")
          .select("id, numero, fecha, total, forma_pago, estado_pago, created_at")
          .eq("proveedor_id", p.id)
          .order("fecha", { ascending: false })
          .limit(50),
        supabase
          .from("pagos_proveedores")
          .select("id, fecha, monto, forma_pago, observacion, created_at")
          .eq("proveedor_id", p.id)
          .order("fecha", { ascending: false })
          .limit(50),
      ]);

      const movements: CuentaCorrienteProveedor[] = [];

      // Compras that went to CC (increase debt)
      for (const c of (compras || []) as any[]) {
        if (c.forma_pago === "Cuenta Corriente" || c.estado_pago === "Pendiente") {
          movements.push({
            id: c.id,
            proveedor_id: p.id,
            fecha: c.fecha,
            tipo: "compra",
            descripcion: `Compra ${c.numero}`,
            monto: c.total,
            saldo_resultante: 0,
            referencia_id: c.id,
            referencia_tipo: "compra",
            created_at: c.created_at,
          });
        }
      }

      // Pagos (decrease debt)
      for (const pg of (pagos || []) as any[]) {
        movements.push({
          id: pg.id,
          proveedor_id: p.id,
          fecha: pg.fecha,
          tipo: "pago",
          descripcion: `Pago ${pg.forma_pago}${pg.observacion ? " - " + pg.observacion : ""}`,
          monto: pg.monto,
          saldo_resultante: 0,
          referencia_id: pg.id,
          referencia_tipo: "pago",
          created_at: pg.created_at,
        });
      }

      // Sort by date descending
      movements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCcMovimientos(movements);
    }
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
    if (!pagoDialog.data) return;
    const monto = parseFloat(pagoForm.monto);
    if (!monto || monto <= 0) return;

    setSaving(true);
    try {
      const provId = pagoDialog.data.id;
      const provNombre = pagoDialog.data.nombre;

      // 1. Insert pago
      const { error: pagoError } = await supabase.from("pagos_proveedores").insert({
        proveedor_id: provId,
        fecha: todayARG(),
        monto,
        forma_pago: pagoForm.forma_pago,
        compra_id: pagoForm.compra_ids.length === 1 ? pagoForm.compra_ids[0] : null,
        observacion: pagoForm.observacion || null,
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
      await supabase.from("cuenta_corriente_proveedor").insert({
        proveedor_id: provId,
        fecha: todayARG(),
        tipo: "pago",
        descripcion: `Pago ${pagoForm.forma_pago} - ${provNombre}${pagoForm.compra_ids.length > 0 ? ` (${pagoForm.compra_ids.length} boleta/s)` : ""}`,
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

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <PageHeader
        title="Proveedores"
        description={`${providers.length} proveedores registrados`}
        actions={
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nuevo proveedor</Button>
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
                    <th className="text-right py-3 px-4 font-medium">Saldo</th>
                    <th className="text-right py-3 px-4 font-medium w-52">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{p.nombre}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.cuit || "\u2014"}</td>
                      <td className="py-3 px-4"><Badge variant="secondary" className="text-xs font-normal">{p.rubro || "\u2014"}</Badge></td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 text-muted-foreground text-xs">
                          {p.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefono}</span>}
                          {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {p.saldo > 0 ? <span className="font-semibold text-orange-500">{formatCurrency(p.saldo)}</span> : <span className="text-muted-foreground">\u2014</span>}
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editDialog.data ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2"><Label>Nombre</Label><Input value={form.nombre} onChange={(e) => f("nombre", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>CUIT</Label><Input value={form.cuit} onChange={(e) => f("cuit", e.target.value)} placeholder="XX-XXXXXXXX-X" /></div>
              <div className="space-y-2"><Label>Rubro</Label><Input value={form.rubro} onChange={(e) => f("rubro", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Telefono</Label><Input value={form.telefono} onChange={(e) => f("telefono", e.target.value)} /></div>
              <div className="space-y-2"><Label>E-mail</Label><Input value={form.email} onChange={(e) => f("email", e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Domicilio</Label><Input value={form.domicilio} onChange={(e) => f("domicilio", e.target.value)} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={editDialog.onClose}>Cancelar</Button>
              <Button onClick={handleSave}>{editDialog.data ? "Guardar cambios" : "Crear proveedor"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cuenta Corriente Dialog */}
      <Dialog open={ccDialog.open} onOpenChange={ccDialog.setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader><DialogTitle>Cuenta Corriente</DialogTitle></DialogHeader>
          {ccDialog.data && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{ccDialog.data.nombre}</p>
                  <p className="text-xs text-muted-foreground">{ccDialog.data.cuit || "Sin CUIT"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Saldo actual</p>
                  <p className={`text-lg font-bold ${ccDialog.data.saldo > 0 ? "text-orange-500" : "text-emerald-500"}`}>
                    {formatCurrency(ccDialog.data.saldo)}
                  </p>
                </div>
              </div>

              {ccMovimientos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay movimientos registrados</p>
              ) : (
                <div className="overflow-y-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-3 font-medium">Fecha</th>
                        <th className="text-left py-2 px-3 font-medium">Tipo</th>
                        <th className="text-left py-2 px-3 font-medium">Descripcion</th>
                        <th className="text-right py-2 px-3 font-medium">Debe</th>
                        <th className="text-right py-2 px-3 font-medium">Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ccMovimientos.map((mov) => (
                        <tr key={mov.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 px-3 text-muted-foreground text-xs">{formatDateARG(mov.fecha)}</td>
                          <td className="py-2 px-3">
                            <Badge
                              variant={mov.tipo === "compra" ? "destructive" : mov.tipo === "pago" ? "default" : "secondary"}
                              className="text-xs font-normal"
                            >
                              {mov.tipo === "compra" ? "Compra" : mov.tipo === "pago" ? "Pago" : "Ajuste"}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-sm">{mov.descripcion}</td>
                          <td className="py-2 px-3 text-right">
                            {mov.tipo === "compra" && (
                              <span className="text-red-500 font-medium">{formatCurrency(mov.monto)}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {mov.tipo === "pago" && (
                              <span className="text-emerald-600 font-medium">{formatCurrency(mov.monto)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={ccDialog.onClose}>Cerrar</Button>
              </div>
            </div>
          )}
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
    </div>
  );
}
