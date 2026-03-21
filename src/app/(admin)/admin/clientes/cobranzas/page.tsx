"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
  DollarSign,
  Users,
  Search,
  Loader2,
  Eye,
  CreditCard,
  Download,
} from "lucide-react";

interface ClienteDeuda {
  id: string;
  nombre: string;
  cuit: string | null;
  saldo: number;
}

interface CuentaMovimiento {
  id: string;
  fecha: string;
  comprobante: string | null;
  descripcion: string | null;
  debe: number;
  haber: number;
  saldo: number;
  forma_pago: string | null;
  venta_id: string | null;
  ventas?: { tipo_comprobante: string; numero: string } | null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(value);
}

export default function CobranzasPage() {
  const [clients, setClients] = useState<ClienteDeuda[]>([]);
  const [allClients, setAllClients] = useState<ClienteDeuda[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClienteDeuda | null>(null);
  const [movimientos, setMovimientos] = useState<CuentaMovimiento[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Cobro dialog
  const [cobroOpen, setCobroOpen] = useState(false);
  const [cobroClient, setCobroClient] = useState<ClienteDeuda | null>(null);
  const [cobroMonto, setCobroMonto] = useState(0);
  const [cobroFormaPago, setCobroFormaPago] = useState("Efectivo");
  const [cobroObs, setCobroObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [cobroMovimientos, setCobroMovimientos] = useState<CuentaMovimiento[]>([]);
  const [loadingCobro, setLoadingCobro] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, cuit, saldo")
      .eq("activo", true)
      .gt("saldo", 0)
      .order("saldo", { ascending: false });
    setClients(data || []);

    const { data: all } = await supabase
      .from("clientes")
      .select("id, nombre, cuit, saldo")
      .eq("activo", true)
      .order("nombre");
    setAllClients(all || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const totalPendiente = clients.reduce((a, c) => a + c.saldo, 0);

  const openDetail = async (client: ClienteDeuda) => {
    setSelectedClient(client);
    setDetailOpen(true);
    setLoadingDetail(true);

    let query = supabase
      .from("cuenta_corriente")
      .select("*")
      .eq("cliente_id", client.id)
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true });

    if (filterFrom) query = query.gte("fecha", filterFrom);
    if (filterTo) query = query.lte("fecha", filterTo);

    const { data } = await query;
    setMovimientos((data as CuentaMovimiento[]) || []);
    setLoadingDetail(false);
  };

  const openCobro = async (client: ClienteDeuda) => {
    setCobroClient(client);
    setCobroMonto(client.saldo);
    setCobroFormaPago("Efectivo");
    setCobroObs("");
    setCobroMovimientos([]);
    setCobroOpen(true);
    setLoadingCobro(true);

    const { data } = await supabase
      .from("cuenta_corriente")
      .select("*, ventas(tipo_comprobante, numero)")
      .eq("cliente_id", client.id)
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true });

    setCobroMovimientos((data as CuentaMovimiento[]) || []);
    setLoadingCobro(false);
  };

  const handleCobro = async () => {
    if (!cobroClient || cobroMonto <= 0) return;
    setSaving(true);

    // Insert cobro
    await supabase.from("cobros").insert({
      cliente_id: cobroClient.id,
      monto: cobroMonto,
      forma_pago: cobroFormaPago,
      observacion: cobroObs || null,
    });

    // Insert cuenta corriente movement (haber)
    const currentSaldo = cobroClient.saldo - cobroMonto;
    await supabase.from("cuenta_corriente").insert({
      cliente_id: cobroClient.id,
      fecha: new Date().toISOString().split("T")[0],
      comprobante: `RE ${new Date().toISOString().split("T")[0]}`,
      descripcion: `Cobro - ${cobroFormaPago}`,
      debe: 0,
      haber: cobroMonto,
      saldo: currentSaldo,
      forma_pago: cobroFormaPago,
    });

    // Update client balance (can go negative = saldo a favor)
    await supabase
      .from("clientes")
      .update({ saldo: cobroClient.saldo - cobroMonto })
      .eq("id", cobroClient.id);

    // Register caja movement
    await supabase.from("caja_movimientos").insert({
      fecha: new Date().toISOString().split("T")[0],
      hora: new Date().toTimeString().split(" ")[0],
      tipo: "ingreso",
      descripcion: `Cobro a ${cobroClient.nombre}`,
      metodo_pago: cobroFormaPago,
      monto: cobroMonto,
    });

    setSaving(false);
    setCobroOpen(false);
    fetchClients();
  };

  const filtered = search
    ? clients.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase()))
    : clients;

  const exportCSV = () => {
    const header = "ID,Cliente,Saldo\n";
    const rows = clients.map((c) => `"${c.id}","${c.nombre}",${c.saldo}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cobranzas.csv";
    a.click();
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Seguimiento de Cobranzas</h1>
          <p className="text-muted-foreground text-sm">Clientes con saldo pendiente</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="w-4 h-4 mr-2" />Exportar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Clientes con deuda</p><p className="text-xl font-bold">{clients.length}</p></div>
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
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-xs text-muted-foreground">Mayor deudor</p><p className="text-xl font-bold">{clients[0]?.nombre || "—"}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Filtrar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">No hay clientes con saldo pendiente</p>
          ) : (
            <div className="overflow-x-auto">
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
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{c.nombre}</td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{c.cuit || "—"}</td>
                      <td className="py-3 px-4 text-right font-semibold text-orange-500">{formatCurrency(c.saldo)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openDetail(c)}>
                            <Eye className="w-3.5 h-3.5 mr-1" />Resumen
                          </Button>
                          <Button size="sm" onClick={() => openCobro(c)}>
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
          )}
        </CardContent>
      </Card>

      {/* Resumen de Cuenta Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resumen de Cuenta — {selectedClient?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 items-end mb-4">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-36 h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-36 h-8 text-xs" />
            </div>
            <Button variant="outline" size="sm" onClick={() => selectedClient && openDetail(selectedClient)}>Filtrar</Button>
          </div>

          {loadingDetail ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : movimientos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No hay movimientos registrados</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">Fecha</th>
                    <th className="text-left py-2 px-3 font-medium">Comprobante</th>
                    <th className="text-right py-2 px-3 font-medium">Debe</th>
                    <th className="text-right py-2 px-3 font-medium">Haber</th>
                    <th className="text-right py-2 px-3 font-medium">Saldo</th>
                    <th className="text-left py-2 px-3 font-medium">Cond. Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2 px-3 text-muted-foreground">{new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR")}</td>
                      <td className="py-2 px-3 font-mono text-xs">{m.comprobante || "—"}</td>
                      <td className="py-2 px-3 text-right">{m.debe > 0 ? formatCurrency(m.debe) : ""}</td>
                      <td className="py-2 px-3 text-right">{m.haber > 0 ? formatCurrency(m.haber) : ""}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${m.saldo < 0 ? "text-red-500" : ""}`}>
                        {formatCurrency(m.saldo)}
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{m.forma_pago || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedClient && (
            <div className="flex justify-between items-center pt-4 border-t">
              <span className="text-sm font-semibold">Saldo deudor actual</span>
              <span className="text-lg font-bold text-orange-500">{formatCurrency(selectedClient.saldo)}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cobro Dialog */}
      <Dialog open={cobroOpen} onOpenChange={setCobroOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar cobro — {cobroClient?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            {/* Saldo claro */}
            {cobroClient && cobroClient.saldo > 0 && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-800">Deuda pendiente</p>
                  <p className="text-xs text-orange-600 mt-0.5">El cliente debe abonar este monto</p>
                </div>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(cobroClient.saldo)}</p>
              </div>
            )}
            {cobroClient && cobroClient.saldo < 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-800">Saldo a favor</p>
                  <p className="text-xs text-emerald-600 mt-0.5">El cliente tiene crédito disponible</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(Math.abs(cobroClient.saldo))}</p>
              </div>
            )}
            {cobroClient && cobroClient.saldo === 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
                <p className="text-sm font-medium text-gray-600">Este cliente no tiene deuda pendiente</p>
              </div>
            )}

            {/* Monto */}
            <div className="space-y-2">
              <Label>Monto a cobrar</Label>
              <Input type="number" value={cobroMonto} onChange={(e) => setCobroMonto(Number(e.target.value))} />
              {cobroClient && cobroMonto > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saldo después del cobro: <span className="font-semibold">{formatCurrency(cobroClient.saldo - cobroMonto)}</span>
                  {cobroClient.saldo - cobroMonto < 0 && <span className="text-emerald-600 ml-1">(queda a favor)</span>}
                </p>
              )}
            </div>

            {/* Forma de pago */}
            <div className="space-y-2">
              <Label>Forma de pago</Label>
              <Select value={cobroFormaPago} onValueChange={(v) => setCobroFormaPago(v || "Efectivo")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Efectivo">Efectivo</SelectItem>
                  <SelectItem value="Transferencia">Transferencia</SelectItem>
                  <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Observación */}
            <div className="space-y-2">
              <Label>Observación</Label>
              <Input value={cobroObs} onChange={(e) => setCobroObs(e.target.value)} placeholder="Opcional" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCobroOpen(false)}>Cancelar</Button>
              <Button onClick={handleCobro} disabled={saving || cobroMonto <= 0}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Registrar cobro
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
