"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG ,  nowTimeARG } from "@/lib/formatters";
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
  Building2,
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
  const [cobroCuentaBancariaId, setCobroCuentaBancariaId] = useState("");
  const [cuentasBancarias, setCuentasBancarias] = useState<any[]>([]);
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

  useEffect(() => {
    fetchClients();
    supabase.from("cuentas_bancarias").select("id, nombre, alias, tipo_cuenta").eq("activo", true).order("nombre").then(({ data }) => setCuentasBancarias(data || []));
  }, [fetchClients]);

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
    setCobroMonto(client.saldo > 0 ? client.saldo : 0);
    setCobroFormaPago("Efectivo");
    setCobroCuentaBancariaId("");
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

    // Re-read saldo from DB to avoid stale state
    const { data: freshCli } = await supabase.from("clientes").select("saldo").eq("id", cobroClient.id).single();
    const saldoActual = freshCli?.saldo ?? cobroClient.saldo;
    const currentSaldo = saldoActual - cobroMonto;
    const hoy = todayARG();

    await supabase.from("cuenta_corriente").insert({
      cliente_id: cobroClient.id,
      fecha: hoy,
      comprobante: `RE ${hoy}`,
      descripcion: `Cobro - ${cobroFormaPago}`,
      debe: 0,
      haber: cobroMonto,
      saldo: currentSaldo,
      forma_pago: cobroFormaPago,
    });

    await supabase
      .from("clientes")
      .update({ saldo: currentSaldo })
      .eq("id", cobroClient.id);

    // Register caja movement
    const cuentaSeleccionada = cobroCuentaBancariaId ? cuentasBancarias.find((c) => c.id === cobroCuentaBancariaId) : null;
    await supabase.from("caja_movimientos").insert({
      fecha: hoy,
      hora: nowTimeARG(),
      tipo: "ingreso",
      descripcion: `Cobro CC — ${cobroClient.nombre}${cobroFormaPago === "Transferencia" && cuentaSeleccionada ? ` → ${cuentaSeleccionada.nombre}` : ""}`,
      metodo_pago: cobroFormaPago,
      monto: cobroMonto,
      ...(cobroFormaPago === "Transferencia" && cuentaSeleccionada ? { cuenta_bancaria: cuentaSeleccionada.nombre } : {}),
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
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Seguimiento de Cobranzas</h1>
            <p className="text-sm text-muted-foreground">Clientes con saldo pendiente</p>
          </div>
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
                      <td className="py-2 px-3 text-muted-foreground">{new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Registrar cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            {/* Client + debt header */}
            <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{cobroClient?.nombre}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cobroClient && cobroClient.saldo > 0 ? "Deuda pendiente" : cobroClient && cobroClient.saldo < 0 ? "Saldo a favor" : "Sin deuda"}
                </p>
              </div>
              <p className={`text-xl font-bold ${cobroClient && cobroClient.saldo > 0 ? "text-orange-500" : cobroClient && cobroClient.saldo < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                {cobroClient ? formatCurrency(Math.abs(cobroClient.saldo)) : "$0"}
              </p>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Monto a cobrar</Label>
              <Input
                type="text"
                inputMode="numeric"
                autoFocus
                value={cobroMonto ? cobroMonto.toLocaleString("es-AR") : ""}
                onChange={(e) => { const v = e.target.value.replace(/\./g, "").replace(/[^0-9]/g, ""); setCobroMonto(Number(v) || 0); }}
                className="text-lg font-semibold h-11"
              />
              {cobroClient && cobroMonto > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saldo después: <span className={`font-semibold ${cobroClient.saldo - cobroMonto <= 0 ? "text-emerald-600" : ""}`}>{formatCurrency(cobroClient.saldo - cobroMonto)}</span>
                  {cobroClient.saldo - cobroMonto < 0 && <span className="text-emerald-600 ml-1">(a favor)</span>}
                </p>
              )}
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Método de pago</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["Efectivo", "Transferencia"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => { setCobroFormaPago(m); if (m === "Efectivo") setCobroCuentaBancariaId(""); }}
                    className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${cobroFormaPago === m ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30 text-muted-foreground"}`}>
                    {m === "Efectivo" ? <DollarSign className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Bank account selector */}
            {cobroFormaPago === "Transferencia" && cuentasBancarias.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Cuenta destino</Label>
                <div className="grid gap-1.5">
                  {cuentasBancarias.map((cb) => (
                    <button
                      key={cb.id}
                      type="button"
                      onClick={() => setCobroCuentaBancariaId(cb.id)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-all text-left ${cobroCuentaBancariaId === cb.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/30"}`}
                    >
                      <Building2 className={`w-4 h-4 shrink-0 ${cobroCuentaBancariaId === cb.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div>
                        <p className="font-medium">{cb.nombre}</p>
                        {cb.alias && <p className="text-xs text-muted-foreground">{cb.alias}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Observation */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Observación <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input value={cobroObs} onChange={(e) => setCobroObs(e.target.value)} placeholder="Detalle del cobro..." />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setCobroOpen(false)}>Cancelar</Button>
              <Button
                className="flex-1"
                onClick={handleCobro}
                disabled={saving || cobroMonto <= 0 || (cobroFormaPago === "Transferencia" && cuentasBancarias.length > 0 && !cobroCuentaBancariaId)}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
                Cobrar {cobroMonto > 0 ? formatCurrency(cobroMonto) : ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
