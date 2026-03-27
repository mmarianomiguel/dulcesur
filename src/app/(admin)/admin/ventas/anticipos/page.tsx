"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Plus,
  Search,
  DollarSign,
  Clock,
  CheckCircle2,
  Undo2,
  Loader2,
  Download,
  Wallet,
} from "lucide-react";

interface Anticipo {
  id: string;
  numero: string;
  cliente_id: string;
  fecha: string;
  monto: number;
  concepto: string;
  estado: "Vigente" | "Aplicado" | "Devuelto";
  venta_id: string | null;
  observacion: string | null;
  clientes?: { nombre: string };
}

interface Cliente {
  id: string;
  nombre: string;
}

interface Venta {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  total: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

export default function AnticiposPage() {
  const [anticipos, setAnticipos] = useState<Anticipo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  // New anticipo dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nuevoClienteId, setNuevoClienteId] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevoConcepto, setNuevoConcepto] = useState("");
  const [nuevoObservacion, setNuevoObservacion] = useState("");

  // Aplicar dialog
  const [aplicarOpen, setAplicarOpen] = useState(false);
  const [aplicarAnticipo, setAplicarAnticipo] = useState<Anticipo | null>(null);
  const [ventasCliente, setVentasCliente] = useState<Venta[]>([]);
  const [selectedVentaId, setSelectedVentaId] = useState("");
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: ants }, { data: cls }] = await Promise.all([
      supabase
        .from("anticipos")
        .select("*, clientes(nombre)")
        .order("fecha", { ascending: false }),
      supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre"),
    ]);
    setAnticipos(ants || []);
    setClientes(cls || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const vigentes = anticipos.filter((a) => a.estado === "Vigente");
  const montoVigente = vigentes.reduce((sum, a) => sum + a.monto, 0);
  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const aplicadosMes = anticipos.filter(
    (a) => a.estado === "Aplicado" && a.fecha.startsWith(mesActual)
  ).length;

  const filtered = anticipos.filter((a) => {
    const matchEstado = filtroEstado === "todos" || a.estado === filtroEstado;
    const matchSearch =
      !search ||
      (a.clientes?.nombre || "").toLowerCase().includes(search.toLowerCase()) ||
      a.numero.toLowerCase().includes(search.toLowerCase());
    return matchEstado && matchSearch;
  });

  const handleNuevo = async () => {
    if (!nuevoClienteId || !nuevoMonto || !nuevoConcepto) return;
    setSaving(true);
    try {
      const monto = parseFloat(nuevoMonto);
      const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "anticipo" });
      const numero = numData as string;
      const fecha = todayARG();

      const { data: anticipo, error } = await supabase
        .from("anticipos")
        .insert({
          numero,
          cliente_id: nuevoClienteId,
          fecha,
          monto,
          concepto: nuevoConcepto,
          estado: "Vigente",
          observacion: nuevoObservacion || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Register caja ingreso
      await supabase.from("caja_movimientos").insert({
        fecha,
        hora: new Date().toLocaleTimeString("es-AR", { hour12: false }),
        tipo: "ingreso",
        descripcion: `Anticipo ${numero} - ${nuevoConcepto}`,
        metodo_pago: "Efectivo",
        monto,
        referencia_id: anticipo.id,
        referencia_tipo: "anticipo",
      });

      // Update client saldo and add haber to cuenta_corriente
      const { data: freshCliente } = await supabase.from("clientes").select("saldo").eq("id", nuevoClienteId).single();
      const saldoActual = freshCliente?.saldo ?? 0;
      const newSaldo = saldoActual - monto;
      await supabase.from("clientes").update({ saldo: newSaldo }).eq("id", nuevoClienteId);
      await supabase.from("cuenta_corriente").insert({
        cliente_id: nuevoClienteId,
        fecha,
        comprobante: numero,
        descripcion: `Anticipo/Seña - ${nuevoConcepto}`,
        debe: 0,
        haber: monto,
        saldo: newSaldo,
        forma_pago: "Efectivo",
      });

      setDialogOpen(false);
      setNuevoClienteId("");
      setNuevoMonto("");
      setNuevoConcepto("");
      setNuevoObservacion("");
      fetchData();
    } catch (err) {
      console.error("Error creando anticipo:", err);
    } finally {
      setSaving(false);
    }
  };

  const openAplicar = async (anticipo: Anticipo) => {
    setAplicarAnticipo(anticipo);
    setSelectedVentaId("");
    setAplicarOpen(true);
    setLoadingVentas(true);
    const { data: ventas } = await supabase
      .from("ventas")
      .select("id, numero, tipo_comprobante, fecha, total")
      .eq("cliente_id", anticipo.cliente_id)
      .order("fecha", { ascending: false });
    setVentasCliente(ventas || []);
    setLoadingVentas(false);
  };

  const handleAplicar = async () => {
    if (!aplicarAnticipo || !selectedVentaId) return;
    setSaving(true);
    try {
      await supabase
        .from("anticipos")
        .update({ estado: "Aplicado", venta_id: selectedVentaId })
        .eq("id", aplicarAnticipo.id);
      setAplicarOpen(false);
      setAplicarAnticipo(null);
      fetchData();
    } catch (err) {
      console.error("Error aplicando anticipo:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDevolver = async (anticipo: Anticipo) => {
    setConfirmDialog({
      open: true,
      title: "Confirmar devolución",
      message: "¿Confirmar devolución del anticipo?",
      onConfirm: async () => {
        setSaving(true);
        try {
          const fecha = todayARG();
          await supabase
            .from("anticipos")
            .update({ estado: "Devuelto" })
            .eq("id", anticipo.id);

          await supabase.from("caja_movimientos").insert({
            fecha,
            hora: new Date().toLocaleTimeString("es-AR", { hour12: false }),
            tipo: "egreso",
            descripcion: `Devolución anticipo ${anticipo.numero}`,
            metodo_pago: "Efectivo",
            monto: anticipo.monto,
            referencia_id: anticipo.id,
            referencia_tipo: "anticipo",
          });

          // Reverse saldo: add back the anticipo amount
          const { data: freshCliente } = await supabase.from("clientes").select("saldo").eq("id", anticipo.cliente_id).single();
          const saldoActual = freshCliente?.saldo ?? 0;
          const newSaldo = saldoActual + anticipo.monto;
          await supabase.from("clientes").update({ saldo: newSaldo }).eq("id", anticipo.cliente_id);
          await supabase.from("cuenta_corriente").insert({
            cliente_id: anticipo.cliente_id,
            fecha,
            comprobante: anticipo.numero,
            descripcion: `Devolución anticipo/seña - ${anticipo.concepto || ""}`,
            debe: anticipo.monto,
            haber: 0,
            saldo: newSaldo,
            forma_pago: "Efectivo",
          });

          fetchData();
        } catch (err) {
          console.error("Error devolviendo anticipo:", err);
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const estadoBadge = (estado: string) => {
    const variants: Record<string, string> = {
      Vigente: "bg-green-100 text-green-800",
      Aplicado: "bg-blue-100 text-blue-800",
      Devuelto: "bg-orange-100 text-orange-800",
    };
    return (
      <Badge className={variants[estado] || ""}>{estado}</Badge>
    );
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Anticipos / Señas</h1>
            <p className="text-sm text-muted-foreground">Gestión de anticipos y señas de clientes</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Anticipo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Anticipos Vigentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vigentes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monto Vigente Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(montoVigente)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aplicados este Mes</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aplicadosMes}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente o número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v ?? "all")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Vigente">Vigente</SelectItem>
                <SelectItem value="Aplicado">Aplicado</SelectItem>
                <SelectItem value="Devuelto">Devuelto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Número</th>
                  <th className="text-left p-3 font-medium">Fecha</th>
                  <th className="text-left p-3 font-medium">Cliente</th>
                  <th className="text-left p-3 font-medium">Concepto</th>
                  <th className="text-right p-3 font-medium">Monto</th>
                  <th className="text-center p-3 font-medium">Estado</th>
                  <th className="text-right p-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No se encontraron anticipos
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => (
                    <tr key={a.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono">{a.numero}</td>
                      <td className="p-3">{a.fecha}</td>
                      <td className="p-3">{a.clientes?.nombre || "-"}</td>
                      <td className="p-3">{a.concepto}</td>
                      <td className="p-3 text-right font-medium">
                        {formatCurrency(a.monto)}
                      </td>
                      <td className="p-3 text-center">{estadoBadge(a.estado)}</td>
                      <td className="p-3 text-right">
                        {a.estado === "Vigente" && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAplicar(a)}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Aplicar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDevolver(a)}
                            >
                              <Undo2 className="h-3 w-3 mr-1" />
                              Devolver
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Nuevo Anticipo Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Nuevo Anticipo / Seña</DialogTitle>
          </DialogHeader>
          <div className="w-full overflow-hidden space-y-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={nuevoClienteId} onValueChange={(v) => setNuevoClienteId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto</Label>
              <Input
                type="number"
                placeholder="0"
                value={nuevoMonto}
                onChange={(e) => setNuevoMonto(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input
                placeholder="Descripción del anticipo"
                value={nuevoConcepto}
                onChange={(e) => setNuevoConcepto(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Observación</Label>
              <Textarea
                placeholder="Observaciones adicionales (opcional)"
                value={nuevoObservacion}
                onChange={(e) => setNuevoObservacion(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleNuevo} disabled={saving || !nuevoClienteId || !nuevoMonto || !nuevoConcepto}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
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

      {/* Aplicar Dialog */}
      <Dialog open={aplicarOpen} onOpenChange={setAplicarOpen}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle className="truncate">Aplicar Anticipo {aplicarAnticipo?.numero}</DialogTitle>
          </DialogHeader>
          <div className="w-full overflow-hidden space-y-4">
            <p className="text-sm text-muted-foreground">
              Monto del anticipo: <strong>{formatCurrency(aplicarAnticipo?.monto || 0)}</strong>
            </p>
            <div className="space-y-2">
              <Label>Seleccionar Venta</Label>
              {loadingVentas ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando ventas...
                </div>
              ) : ventasCliente.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay ventas para este cliente
                </p>
              ) : (
                <Select value={selectedVentaId} onValueChange={(v) => setSelectedVentaId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar venta" />
                  </SelectTrigger>
                  <SelectContent>
                    {ventasCliente.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.numero} - {v.tipo_comprobante} - {v.fecha} - {formatCurrency(v.total)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAplicarOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAplicar} disabled={saving || !selectedVentaId}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Aplicar Anticipo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
