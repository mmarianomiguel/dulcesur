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
} from "lucide-react";

// ─── Shared modules ───
import { formatCurrency, formatDateARG, todayARG } from "@/lib/formatters";
import type { Proveedor, Compra, PagoProveedor } from "@/types/database";
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

const emptyPagoForm = { monto: "", forma_pago: "Efectivo", compra_id: "", observacion: "", registrar_caja: true };

export default function ProveedoresPage() {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [pagoForm, setPagoForm] = useState(emptyPagoForm);
  const [comprasProveedor, setComprasProveedor] = useState<Compra[]>([]);
  const [pagosProveedor, setPagosProveedor] = useState<PagoProveedor[]>([]);
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
  const historyDialog = useDialog<Proveedor>();

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

  // ─── Pago ───
  const openPago = async (p: Proveedor) => {
    setPagoForm(emptyPagoForm);
    pagoDialog.onOpen(p);
    // Fetch pending compras for this proveedor
    const { data } = await supabase
      .from("compras")
      .select("*")
      .eq("proveedor_id", p.id)
      .eq("estado", "Pendiente")
      .order("fecha", { ascending: false });
    setComprasProveedor(data || []);
  };

  const handlePago = async () => {
    if (!pagoDialog.data) return;
    const monto = parseFloat(pagoForm.monto);
    if (!monto || monto <= 0) return;

    setSaving(true);
    try {
      // 1. Insert pago
      const { error: pagoError } = await supabase.from("pagos_proveedores").insert({
        proveedor_id: pagoDialog.data.id,
        fecha: todayARG(),
        monto,
        forma_pago: pagoForm.forma_pago,
        compra_id: pagoForm.compra_id || null,
        observacion: pagoForm.observacion || null,
      });
      if (pagoError) throw new Error(pagoError.message);

      // 2. Update proveedor saldo
      const newSaldo = Math.max(0, pagoDialog.data.saldo - monto);
      await proveedorService.update(pagoDialog.data.id, { saldo: newSaldo } as Partial<Proveedor>);

      // 3. Register caja movement (egreso) if selected
      if (pagoForm.registrar_caja && pagoForm.forma_pago !== "Cuenta Corriente") {
        await supabase.from("caja_movimientos").insert({
          fecha: todayARG(),
          hora: new Date().toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires" }),
          tipo: "egreso",
          descripcion: `Pago a proveedor: ${pagoDialog.data.nombre}`,
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

  // ─── History ───
  const openHistory = async (p: Proveedor) => {
    historyDialog.onOpen(p);
    const { data } = await supabase
      .from("pagos_proveedores")
      .select("*")
      .eq("proveedor_id", p.id)
      .order("fecha", { ascending: false });
    setPagosProveedor(data || []);
  };

  // ─── Derived ───
  const filtered = providers.filter(
    (p) => p.nombre.toLowerCase().includes(search.toLowerCase()) || (p.cuit || "").includes(search)
  );
  const totalDebt = providers.reduce((a, p) => a + p.saldo, 0);

  const f = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  const pf = (key: keyof typeof pagoForm, value: string) => setPagoForm({ ...pagoForm, [key]: value });

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
        <StatCard title="Deuda total" value={formatCurrency(totalDebt)} icon={Truck} iconColor="text-orange-500" iconBg="bg-orange-500/10" />
        <StatCard title="Sin deuda" value={providers.filter((p) => p.saldo === 0).length} icon={Truck} iconColor="text-emerald-500" iconBg="bg-emerald-500/10" />
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
                    <th className="text-right py-3 px-4 font-medium w-40">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{p.nombre}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.cuit || "—"}</td>
                      <td className="py-3 px-4"><Badge variant="secondary" className="text-xs font-normal">{p.rubro || "—"}</Badge></td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 text-muted-foreground text-xs">
                          {p.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefono}</span>}
                          {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {p.saldo > 0 ? <span className="font-semibold text-orange-500">{formatCurrency(p.saldo)}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Registrar pago" onClick={() => openPago(p)}><DollarSign className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Historial de pagos" onClick={() => openHistory(p)}><History className="w-3.5 h-3.5" /></Button>
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

      {/* Pago Dialog */}
      <Dialog open={pagoDialog.open} onOpenChange={pagoDialog.setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>
          {pagoDialog.data && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="font-medium">{pagoDialog.data.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  Deuda actual: <span className="font-semibold text-orange-500">{formatCurrency(pagoDialog.data.saldo)}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={pagoForm.monto}
                  onChange={(e) => pf("monto", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Forma de pago</Label>
                <Select value={pagoForm.forma_pago} onValueChange={(v) => pf("forma_pago", v ?? "")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(pagoForm.forma_pago === "Efectivo" || pagoForm.forma_pago === "Transferencia") && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={pagoForm.registrar_caja} onChange={(e) => setPagoForm({ ...pagoForm, registrar_caja: e.target.checked })} className="rounded" />
                  <span className="text-sm">Registrar en caja diaria</span>
                </label>
              )}

              {comprasProveedor.length > 0 && (
                <div className="space-y-2">
                  <Label>Aplicar a compra (opcional)</Label>
                  <Select value={pagoForm.compra_id} onValueChange={(v) => pf("compra_id", v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      {comprasProveedor.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.numero} — {formatCurrency(c.total)} ({formatDateARG(c.fecha)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Observaciones</Label>
                <Textarea
                  placeholder="Opcional..."
                  value={pagoForm.observacion}
                  onChange={(e) => pf("observacion", e.target.value)}
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

      {/* Payment History Dialog */}
      <Dialog open={historyDialog.open} onOpenChange={historyDialog.setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Historial de pagos</DialogTitle></DialogHeader>
          {historyDialog.data && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="font-medium">{historyDialog.data.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  Saldo actual: <span className="font-semibold text-orange-500">{formatCurrency(historyDialog.data.saldo)}</span>
                </p>
              </div>

              {pagosProveedor.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No hay pagos registrados</p>
              ) : (
                <div className="overflow-y-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-2 font-medium">Fecha</th>
                        <th className="text-left py-2 px-2 font-medium">Forma</th>
                        <th className="text-right py-2 px-2 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagosProveedor.map((pago) => (
                        <tr key={pago.id} className="border-b last:border-0">
                          <td className="py-2 px-2 text-muted-foreground">{formatDateARG(pago.fecha)}</td>
                          <td className="py-2 px-2">
                            <Badge variant="secondary" className="text-xs font-normal">{pago.forma_pago}</Badge>
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-emerald-600">{formatCurrency(pago.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={historyDialog.onClose}>Cerrar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
