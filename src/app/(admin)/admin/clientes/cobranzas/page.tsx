"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign,
  Users,
  Search,
  Loader2,
  Eye,
  CreditCard,
  Download,
} from "lucide-react";
import { CobroAllocationDialog } from "@/components/cobro-allocation-dialog";

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
  created_at?: string;
}


export default function CobranzasPage() {
  const [clients, setClients] = useState<ClienteDeuda[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClienteDeuda | null>(null);
  const [movimientos, setMovimientos] = useState<CuentaMovimiento[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Cobro dialog
  const [cobroOpen, setCobroOpen] = useState(false);
  const [cobroClient, setCobroClient] = useState<ClienteDeuda | null>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, cuit, saldo")
      .eq("activo", true)
      .gt("saldo", 0)
      .order("saldo", { ascending: false });
    setClients(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const totalPendiente = clients.reduce((a, c) => a + c.saldo, 0);

  const openDetail = async (client: ClienteDeuda, desde?: string, hasta?: string) => {
    setSelectedClient(client);
    setDetailOpen(true);
    setLoadingDetail(true);

    const from = desde || filterFrom;
    const to = hasta || filterTo;

    // Build movements query
    let q = supabase
      .from("cuenta_corriente")
      .select("*")
      .eq("cliente_id", client.id)
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true });
    if (from) q = q.gte("fecha", from);
    if (to) q = q.lte("fecha", to);

    const { data: movData } = await q;
    setMovimientos((movData as CuentaMovimiento[]) || []);

    // If date filter, get saldo before period
    if (from) {
      const { data: prevData } = await supabase
        .from("cuenta_corriente")
        .select("saldo")
        .eq("cliente_id", client.id)
        .lt("fecha", from)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      setSaldoInicial(prevData?.[0]?.saldo || 0);
    } else {
      setSaldoInicial(0);
    }
    setLoadingDetail(false);
  };

  const openCobro = (client: ClienteDeuda) => {
    setCobroClient(client);
    setCobroOpen(true);
  };

  const filtered = search
    ? clients.filter((c) => norm(c.nombre).includes(norm(search)))
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
            <div><p className="text-xs text-muted-foreground">Total pendiente</p><p className="text-xl font-bold text-orange-500">{formatCurrency(totalPendiente, true)}</p></div>
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
                      <td className="py-3 px-4 text-right font-semibold text-orange-500">{formatCurrency(c.saldo, true)}</td>
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
                <span className="text-sm font-bold text-orange-500">{formatCurrency(totalPendiente, true)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen de Cuenta Dialog — Libro Diario */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuenta Corriente — {selectedClient?.nombre}</DialogTitle>
          </DialogHeader>

          {/* Date filters */}
          <div className="flex gap-2 items-end mb-3">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-36 h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-36 h-8 text-xs" />
            </div>
            <Button variant="outline" size="sm" onClick={() => selectedClient && openDetail(selectedClient, filterFrom, filterTo)}>Filtrar</Button>
          </div>

          {/* KPI cards */}
          {!loadingDetail && movimientos.length > 0 && (() => {
            const totalDebe = movimientos.reduce((s, m) => s + (m.debe || 0), 0);
            const totalHaber = movimientos.reduce((s, m) => s + (m.haber || 0), 0);
            const saldoFinal = movimientos.length > 0 ? movimientos[movimientos.length - 1].saldo : 0;
            return (
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Compras</p>
                  <p className="text-sm font-bold">{formatCurrency(Math.round(totalDebe))}</p>
                </div>
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pagos</p>
                  <p className="text-sm font-bold text-emerald-600">{formatCurrency(Math.round(totalHaber))}</p>
                </div>
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Movimientos</p>
                  <p className="text-sm font-bold">{movimientos.length}</p>
                </div>
                <div className={`rounded-lg border p-2.5 text-center ${saldoFinal > 0 ? "bg-orange-50 border-orange-200" : saldoFinal < 0 ? "bg-emerald-50 border-emerald-200" : ""}`}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo</p>
                  <p className={`text-sm font-bold ${saldoFinal > 0 ? "text-orange-600" : saldoFinal < 0 ? "text-emerald-600" : ""}`}>
                    {saldoFinal > 0 ? formatCurrency(saldoFinal) : saldoFinal < 0 ? `${formatCurrency(Math.abs(saldoFinal))} a favor` : "$0"}
                  </p>
                </div>
              </div>
            );
          })()}

          {loadingDetail ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : movimientos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No hay movimientos registrados</p>
          ) : (() => {
            const cleanComp = (c: string) => c
              .replace(/Venta\s+#?/i, "FC ")
              .replace(/Edición Venta\s+#?/i, "AJ ")
              .replace(/Cobro (saldo|deuda)\s*[-–]\s*/i, "RE ")
              .replace(/^RE\s+\d{4}-\d{2}-\d{2}$/, "RE")
              .replace(/(\d{5})-(\d{8})/, (_: string, _a: string, b: string) => parseInt(b).toString().padStart(4, "0"));
            const cleanDesc = (d: string) => d
              .replace(/\s*—\s*desde\s*(Punto de Venta|Clientes)/gi, "")
              .replace(/\s*\(Cuenta Corriente\)/gi, "")
              .replace(/Cobro saldo pendiente\s*/i, "Cobro saldo")
              .replace(/Venta\s*-\s*Cuenta Corriente\s*(\(parcial\))?/i, (_: string, p: string) => p ? "Cta.Cte. (parcial)" : "Cta.Cte.")
              .replace(/Ajuste por edición\s*\((aumento|reducción)\)/i, (_: string, t: string) => t === "aumento" ? "Ajuste débito" : "Ajuste crédito")
              .replace(/\(saldo a favor aplicado:.*?\)/i, "");
            const totalDebe = movimientos.reduce((s, m) => s + (m.debe || 0), 0);
            const totalHaber = movimientos.reduce((s, m) => s + (m.haber || 0), 0);
            const saldoFinal = movimientos[movimientos.length - 1].saldo;

            return (
              <div className="overflow-x-auto border rounded-xl overflow-hidden">
                {(() => {
                  const getTipo = (r: { comprobante: string | null; forma_pago: string | null; debe: number; haber: number; descripcion?: string | null }) => {
                    const c = r.comprobante || "";
                    const fp = r.forma_pago || "";
                    const desc = r.descripcion || "";
                    if (/NC\s/i.test(c) || desc.toLowerCase().includes("nota de cr")) return "nc";
                    if (r.debe > 0 && (fp === "Cuenta Corriente" || fp === "Pendiente")) return "cc_pendiente";
                    if (r.debe > 0) return "venta";
                    if (fp === "Efectivo") return "efectivo";
                    if (fp === "Transferencia") return "transferencia";
                    if (desc.includes("Cobro") || c.startsWith("RE")) return "cobro";
                    return "pago";
                  };
                  const badgeMap: Record<string, { label: string; cls: string }> = {
                    venta: { label: "Venta", cls: "bg-blue-50 text-blue-700 border border-blue-200" },
                    nc: { label: "Nota de crédito", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
                    efectivo: { label: "Efectivo", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
                    transferencia: { label: "Transferencia", cls: "bg-violet-50 text-violet-700 border border-violet-200" },
                    cc_pendiente: { label: "Cta. Cte.", cls: "bg-orange-50 text-orange-700 border border-orange-200" },
                    cobro: { label: "Cobro", cls: "bg-green-50 text-green-700 border border-green-200" },
                    pago: { label: "Pago", cls: "bg-green-50 text-green-700 border border-green-200" },
                  };
                  return (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[60px]">Fecha</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[90px]">Comp.</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[110px]">Tipo</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Concepto</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[90px]">Debe</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[90px]">Haber</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-[100px]">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldoInicial !== 0 && (
                      <tr className="border-b bg-muted/20">
                        <td className="py-2 px-3 text-xs text-muted-foreground italic" colSpan={6}>
                          Saldo al inicio del período
                        </td>
                        <td className={`py-2 px-3 text-right font-bold text-xs tabular-nums ${saldoInicial > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                          {saldoInicial > 0 ? formatCurrency(saldoInicial) : `−${formatCurrency(Math.abs(saldoInicial))}`}
                        </td>
                      </tr>
                    )}
                    {movimientos.map((m, i) => {
                      const prevDate = i > 0 ? movimientos[i - 1].fecha : null;
                      const isNewDate = m.fecha !== prevDate;
                      const sr = Math.round(m.saldo);
                      const tipo = getTipo(m);
                      const badge = badgeMap[tipo] || badgeMap.pago;
                      return (
                        <tr key={m.id} className={`border-b last:border-0 hover:bg-muted/30 ${isNewDate && i > 0 ? "border-t-2 border-t-muted" : ""}`}>
                          <td className="py-2 px-3 text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                            {isNewDate ? new Date(m.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : ""}
                          </td>
                          <td className="py-2 px-3 text-xs font-mono whitespace-nowrap">{m.comprobante ? cleanComp(m.comprobante) : "—"}</td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[180px]">{m.descripcion ? cleanDesc(m.descripcion) : ""}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-xs font-medium">{m.debe > 0 ? formatCurrency(Math.round(m.debe)) : ""}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-xs font-medium text-emerald-600">{m.haber > 0 ? formatCurrency(Math.round(m.haber)) : ""}</td>
                          <td className={`py-2 px-3 text-right tabular-nums text-xs font-bold ${sr > 0 ? "text-orange-600" : sr < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {sr > 0 ? formatCurrency(sr) : sr < 0 ? `−${formatCurrency(Math.abs(sr))}` : "$0"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 border-t">
                      <td className="py-3 px-3" colSpan={4}>
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Totales del período</span>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-xs font-bold">{formatCurrency(Math.round(totalDebe))}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-xs font-bold text-emerald-600">{formatCurrency(Math.round(totalHaber))}</td>
                      <td className={`py-3 px-3 text-right tabular-nums text-sm font-extrabold ${saldoFinal > 0 ? "text-orange-600" : saldoFinal < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {saldoFinal > 0 ? formatCurrency(Math.round(saldoFinal)) : saldoFinal < 0 ? `−${formatCurrency(Math.round(Math.abs(saldoFinal)))}` : "$0"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                  );
                })()}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <CobroAllocationDialog
        open={cobroOpen}
        onOpenChange={setCobroOpen}
        cliente={cobroClient}
        onSuccess={() => {
          fetchClients();
        }}
      />
    </div>
  );
}
