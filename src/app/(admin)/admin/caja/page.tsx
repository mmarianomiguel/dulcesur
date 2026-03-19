"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Minus,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  Clock,
  LockOpen,
  Lock,
  AlertCircle,
  History,
  Eye,
  Loader2,
} from "lucide-react";

import { formatCurrency, todayARG, nowTimeARG } from "@/lib/formatters";
import { useAsyncData } from "@/hooks/use-async-data";
import { useDialog } from "@/hooks/use-dialog";
import { cajaService, ventaService } from "@/services";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/lib/supabase";
import type { Venta, CajaMovimiento } from "@/types/database";
import { showAdminToast } from "@/components/admin-toast";

// ─── Types ───

interface TurnoCaja {
  id: string;
  numero: number;
  fecha_apertura: string;
  hora_apertura: string;
  fecha_cierre: string | null;
  hora_cierre: string | null;
  operador: string;
  efectivo_inicial: number;
  efectivo_real: number | null;
  diferencia: number | null;
  notas: string | null;
  estado: "abierto" | "cerrado";
  created_at: string;
}

// ─── Turno helpers ───

async function getTurnoAbierto(): Promise<TurnoCaja | null> {
  const { data } = await supabase
    .from("turnos_caja")
    .select("id, numero, fecha_apertura, hora_apertura, fecha_cierre, hora_cierre, operador, efectivo_inicial, efectivo_real, diferencia, notas, estado, created_at")
    .eq("estado", "abierto")
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data.length > 0 ? (data[0] as TurnoCaja) : null;
}

async function getNextTurnoNumero(): Promise<number> {
  const { data } = await supabase
    .from("turnos_caja")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1);
  return data && data.length > 0 ? (data[0] as { numero: number }).numero + 1 : 1;
}

async function abrirTurno(efectivoInicial: number, operador: string): Promise<TurnoCaja> {
  const numero = await getNextTurnoNumero();
  const { data, error } = await supabase
    .from("turnos_caja")
    .insert({
      numero,
      fecha_apertura: todayARG(),
      hora_apertura: nowTimeARG(),
      operador,
      efectivo_inicial: efectivoInicial,
      estado: "abierto",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TurnoCaja;
}

async function cerrarTurno(
  id: string,
  efectivoReal: number,
  diferencia: number,
  notas: string
): Promise<TurnoCaja> {
  const { data, error } = await supabase
    .from("turnos_caja")
    .update({
      fecha_cierre: todayARG(),
      hora_cierre: nowTimeARG(),
      efectivo_real: efectivoReal,
      diferencia,
      notas: notas || null,
      estado: "cerrado",
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TurnoCaja;
}

// ─── Component ───

export default function CajaPage() {
  const today = todayARG();

  // ─── Turno state ───
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [turnoLoading, setTurnoLoading] = useState(true);
  const [abrirForm, setAbrirForm] = useState({ efectivo_inicial: 0, operador: "" });

  // ─── Movements (filtered by turno time range) ───
  const fetchMovements = useCallback(async () => {
    const all = await cajaService.getByFecha(today);
    if (!turno) return [];
    const aperturaDate = new Date(turno.created_at);
    const cierreDate = turno.estado === "cerrado" && turno.fecha_cierre && turno.hora_cierre
      ? new Date(`${turno.fecha_cierre}T${turno.hora_cierre}-03:00`)
      : null;
    return all.filter((m: CajaMovimiento) => {
      const d = new Date(m.created_at);
      if (d < aperturaDate) return false;
      if (cierreDate && d > cierreDate) return false;
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [today, turno]);
  const { data: movements, loading: movLoading, refetch: refetchMov } = useAsyncData({
    fetcher: fetchMovements,
    initialData: [] as CajaMovimiento[],
    deps: [turno],
  });

  // ─── Ventas (filtered by turno time range, includes web orders) ───
  const fetchVentas = useCallback(async () => {
    const { data: allData } = await supabase
      .from("ventas")
      .select("*, clientes(nombre)")
      .eq("fecha", today)
      .order("created_at", { ascending: false });
    const all = (allData || []) as Venta[];
    if (!turno) return [];
    const aperturaDate = new Date(turno.created_at);
    const cierreDate = turno.estado === "cerrado" && turno.fecha_cierre && turno.hora_cierre
      ? new Date(`${turno.fecha_cierre}T${turno.hora_cierre}-03:00`)
      : null;
    return all.filter((v: Venta) => {
      // Exclude credit notes
      if ((v as any).tipo_comprobante?.toLowerCase().startsWith("nota de crédito")) return false;
      const d = new Date(v.created_at);
      if (d < aperturaDate) return false;
      if (cierreDate && d > cierreDate) return false;
      return true;
    });
  }, [today, turno]);
  const { data: ventas, loading: ventasLoading, refetch: refetchVentas } = useAsyncData({
    fetcher: fetchVentas,
    initialData: [] as Venta[],
    deps: [turno],
  });

  // ─── Dialogs ───
  const movDialog = useDialog<"ingreso" | "egreso">();
  const cierreDialog = useDialog();
  const abrirDialog = useDialog();
  const [movForm, setMovForm] = useState({ descripcion: "", metodo_pago: "Efectivo", monto: 0 });
  const [cierreForm, setCierreForm] = useState({ efectivo_real: 0, notas: "" });

  // Sellers map for display
  const [sellersMap, setSellersMap] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.from("usuarios").select("id, nombre").eq("activo", true).then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach((u: any) => { map[u.id] = u.nombre; });
      setSellersMap(map);
    });
  }, []);

  // Sale detail for viewing
  const [ventaDetailOpen, setVentaDetailOpen] = useState(false);
  const [ventaDetail, setVentaDetail] = useState<Venta | null>(null);
  const [ventaDetailItems, setVentaDetailItems] = useState<any[]>([]);
  const [ventaDetailMovs, setVentaDetailMovs] = useState<any[]>([]);

  const openVentaDetail = async (v: Venta) => {
    setVentaDetail(v);
    setVentaDetailOpen(true);
    const [{ data: items }, { data: movs }] = await Promise.all([
      supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at"),
      supabase.from("caja_movimientos").select("id, tipo, descripcion, metodo_pago, monto, referencia_id, referencia_tipo, created_at").eq("referencia_id", v.id).order("created_at"),
    ]);
    setVentaDetailItems(items || []);
    setVentaDetailMovs(movs || []);
  };

  // History
  const [histOpen, setHistOpen] = useState(false);
  const [histTurnos, setHistTurnos] = useState<TurnoCaja[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histDetail, setHistDetail] = useState<TurnoCaja | null>(null);
  const [histMovs, setHistMovs] = useState<CajaMovimiento[]>([]);
  const [histVentas, setHistVentas] = useState<Venta[]>([]);

  // ─── Load turno on mount ───
  const loadTurno = useCallback(async () => {
    setTurnoLoading(true);
    try {
      const t = await getTurnoAbierto();
      setTurno(t);
    } finally {
      setTurnoLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTurno();
  }, [loadTurno]);

  // ─── Handlers ───

  const handleAbrirTurno = async () => {
    if (!abrirForm.operador.trim()) return;
    const t = await abrirTurno(abrirForm.efectivo_inicial, abrirForm.operador.trim());
    setTurno(t);
    abrirDialog.onClose();
    setAbrirForm({ efectivo_inicial: 0, operador: "" });
    showAdminToast("Turno abierto correctamente");
    // Refetch so data is filtered by new turno
    setTimeout(() => { refetchMov(); refetchVentas(); }, 100);
  };

  const openMovDialog = (type: "ingreso" | "egreso") => {
    setMovForm({ descripcion: "", metodo_pago: "Efectivo", monto: 0 });
    movDialog.onOpen(type);
  };

  const handleSaveMov = async () => {
    const type = movDialog.data || "ingreso";
    const opts = {
      descripcion: movForm.descripcion,
      metodoPago: movForm.metodo_pago,
      monto: Math.abs(movForm.monto),
    };
    if (type === "ingreso") {
      await cajaService.registrarIngreso(opts);
    } else {
      await cajaService.registrarEgreso(opts);
    }
    movDialog.onClose();
    refetchMov();
    showAdminToast(type === "ingreso" ? "Ingreso registrado" : "Egreso registrado");
  };

  const openCierreDialog = () => {
    setCierreForm({ efectivo_real: efectivoEsperado, notas: "" });
    cierreDialog.onOpen();
  };

  const handleCerrarTurno = async () => {
    if (!turno) return;
    const diff = cierreForm.efectivo_real - efectivoEsperado;
    await cerrarTurno(turno.id, cierreForm.efectivo_real, diff, cierreForm.notas);
    setTurno(null);
    cierreDialog.onClose();
    refetchMov();
    refetchVentas();
    showAdminToast("Turno cerrado correctamente");
  };

  const openHistorial = async () => {
    setHistOpen(true);
    setHistDetail(null);
    setHistLoading(true);
    const { data } = await supabase
      .from("turnos_caja")
      .select("id, numero, fecha_apertura, hora_apertura, fecha_cierre, hora_cierre, operador, efectivo_inicial, efectivo_real, diferencia, notas, estado, created_at")
      .eq("estado", "cerrado")
      .order("created_at", { ascending: false })
      .limit(30);
    setHistTurnos((data as TurnoCaja[]) || []);
    setHistLoading(false);
  };

  const openHistDetail = async (t: TurnoCaja) => {
    setHistDetail(t);
    const fecha = t.fecha_apertura;

    // Use proper Date objects so UTC vs local timezone is handled correctly.
    // t.created_at is already a UTC ISO string from Supabase.
    // hora_apertura / hora_cierre are Argentina local time (UTC-3), so we append the offset.
    const aperturaDate = new Date(t.created_at);
    const cierreDate =
      t.estado === "cerrado" && t.fecha_cierre && t.hora_cierre
        ? new Date(`${t.fecha_cierre}T${t.hora_cierre}-03:00`)
        : null;

    const [{ data: movs }, { data: vts }] = await Promise.all([
      supabase.from("caja_movimientos").select("id, tipo, descripcion, metodo_pago, monto, hora, fecha, referencia_id, referencia_tipo, created_at").eq("fecha", fecha).order("hora", { ascending: false }),
      supabase.from("ventas").select("id, numero, fecha, total, forma_pago, tipo_comprobante, vendedor_id, origen, created_at, clientes(nombre)").eq("fecha", fecha).not("tipo_comprobante", "ilike", "Nota de Crédito%").order("created_at", { ascending: false }),
    ]);

    // Filter by turno time range using Date comparison
    const filteredMovs = (movs || []).filter((m: any) => {
      const d = new Date(m.created_at);
      if (d < aperturaDate) return false;
      if (cierreDate && d > cierreDate) return false;
      return true;
    });
    const filteredVts = (vts || []).filter((v: any) => {
      const d = new Date(v.created_at);
      if (d < aperturaDate) return false;
      if (cierreDate && d > cierreDate) return false;
      return true;
    });
    setHistMovs(filteredMovs as CajaMovimiento[]);
    setHistVentas(filteredVts as unknown as Venta[]);
  };

  // ─── Derived calculations ───

  const {
    ventasEfectivo,
    ventasTransferencia,
    ventasCuentaCorriente,
    totalVentas,
    depositos,
    gastos,
    notasCreditoEgresos,
    retiros,
    efectivoEsperado,
    efectivoInicial,
  } = useMemo(() => {
    const ventasPorMetodo = (metodo: string) =>
      ventas.filter((v) => v.forma_pago === metodo).reduce((a, v) => a + v.total, 0);

    // Calculate real totals per method using caja_movimientos (handles mixto split)
    const movPorMetodo = (metodo: string) =>
      movements
        .filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === metodo)
        .reduce((a, m) => a + m.monto, 0);

    const ventasEfectivo = movPorMetodo("Efectivo");
    const ventasTransferencia = movPorMetodo("Transferencia");
    // Cuenta corriente doesn't go through caja_movimientos, sum from ventas
    const ventasCuentaCorriente = ventasPorMetodo("Cuenta Corriente")
      + ventas.filter((v) => v.forma_pago === "Mixto").reduce((acc, v) => {
        const ccMov = movements.find(
          (m) => m.referencia_id === v.id && m.metodo_pago === "Cuenta Corriente"
        );
        // If no caja_movimiento for CC (it goes to cuenta_corriente table), estimate from total - other movs
        if (!ccMov) {
          const otherMovs = movements
            .filter((m) => m.referencia_id === v.id && m.referencia_tipo === "venta")
            .reduce((a, m) => a + m.monto, 0);
          const ccPart = v.total - otherMovs;
          return acc + (ccPart > 0 ? ccPart : 0);
        }
        return acc;
      }, 0);
    const totalVentas = ventas.reduce((a, v) => a + v.total, 0);

    const depositos = movements
      .filter((m) => m.tipo === "ingreso" && m.metodo_pago === "Efectivo" && m.referencia_tipo !== "venta")
      .reduce((a, m) => a + m.monto, 0);

    const gastos = movements
      .filter((m) => m.tipo === "egreso" && m.descripcion.toLowerCase().includes("gasto"))
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const notasCreditoEgresos = movements
      .filter((m) => m.tipo === "egreso" && m.referencia_tipo === "nota_credito")
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const retiros = movements
      .filter((m) => m.tipo === "egreso" && !m.descripcion.toLowerCase().includes("gasto") && m.referencia_tipo !== "nota_credito")
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const efectivoInicial = turno?.efectivo_inicial ?? 0;
    const efectivoEsperado = efectivoInicial + ventasEfectivo + depositos - gastos - retiros - notasCreditoEgresos;

    return {
      ventasEfectivo,
      ventasTransferencia,
      ventasCuentaCorriente,
      totalVentas,
      depositos,
      gastos,
      notasCreditoEgresos,
      retiros,
      efectivoEsperado,
      efectivoInicial,
    };
  }, [ventas, movements, turno]);

  const loading = turnoLoading || movLoading || ventasLoading;

  // ─── No turno open: show open button ───
  if (!turnoLoading && !turno) {
    return (
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <PageHeader
          title="Caja Diaria"
          description={new Date().toLocaleDateString("es-AR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        />

        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md w-full">
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <LockOpen className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">No hay turno abierto</h2>
                <p className="text-sm text-muted-foreground">
                  Abre un turno para comenzar a registrar operaciones de caja.
                </p>
              </div>
              <Button size="lg" className="w-full" onClick={() => abrirDialog.onOpen()}>
                <LockOpen className="w-5 h-5 mr-2" />
                Abrir Turno
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={openHistorial}>
                <History className="w-4 h-4 mr-2" />
                Ver Historial de Turnos
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Abrir Turno Dialog */}
        <Dialog open={abrirDialog.open} onOpenChange={abrirDialog.setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Abrir Turno de Caja</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Operador</Label>
                <Input
                  value={abrirForm.operador}
                  onChange={(e) => setAbrirForm({ ...abrirForm, operador: e.target.value })}
                  placeholder="Nombre del operador"
                />
              </div>
              <div className="space-y-2">
                <Label>Efectivo Inicial</Label>
                <Input
                  type="number"
                  value={abrirForm.efectivo_inicial}
                  onChange={(e) =>
                    setAbrirForm({ ...abrirForm, efectivo_inicial: Number(e.target.value) })
                  }
                  placeholder="0"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={abrirDialog.onClose}>
                  Cancelar
                </Button>
                <Button onClick={handleAbrirTurno} disabled={!abrirForm.operador.trim()}>
                  Abrir Turno
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Historial Dialog (accessible before opening turno) */}
        <Dialog open={histOpen} onOpenChange={setHistOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Historial de Turnos
              </DialogTitle>
            </DialogHeader>
            {histDetail ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setHistDetail(null)} className="text-xs">← Volver al listado</Button>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Turno</p><p className="font-bold">#{histDetail.numero}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Fecha</p><p className="font-bold">{new Date(histDetail.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR")}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Operador</p><p className="font-bold">{histDetail.operador}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Horario</p><p className="font-bold">{histDetail.hora_apertura?.substring(0, 5)} - {histDetail.hora_cierre?.substring(0, 5) || "?"}</p></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/20"><p className="text-xs text-muted-foreground">Efectivo inicial</p><p className="font-bold">{formatCurrency(histDetail.efectivo_inicial)}</p></div>
                  <div className="rounded-lg border p-3 bg-blue-50 dark:bg-blue-950/20"><p className="text-xs text-muted-foreground">Efectivo real</p><p className="font-bold">{formatCurrency(histDetail.efectivo_real || 0)}</p></div>
                  <div className={`rounded-lg border p-3 ${(histDetail.diferencia || 0) === 0 ? "bg-muted/30" : (histDetail.diferencia || 0) > 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                    <p className="text-xs text-muted-foreground">Diferencia</p>
                    <p className={`font-bold ${(histDetail.diferencia || 0) > 0 ? "text-emerald-600" : (histDetail.diferencia || 0) < 0 ? "text-red-500" : ""}`}>{formatCurrency(histDetail.diferencia || 0)}</p>
                  </div>
                </div>
                {histDetail.notas && <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground mb-1">Notas</p><p className="text-sm">{histDetail.notas}</p></div>}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Ventas ({histVentas.length})</h4>
                    {histVentas.length === 0 ? <p className="text-xs text-muted-foreground">Sin ventas</p> : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b bg-muted/50"><th className="text-left py-2 px-3">N°</th><th className="text-left py-2 px-3">Pago</th><th className="text-right py-2 px-3">Total</th></tr></thead>
                          <tbody>{histVentas.map((v) => (<tr key={v.id} className="border-b last:border-0"><td className="py-1.5 px-3 font-mono">{v.numero}</td><td className="py-1.5 px-3"><Badge variant="outline" className="text-[10px]">{v.forma_pago}</Badge></td><td className="py-1.5 px-3 text-right font-semibold">{formatCurrency(v.total)}</td></tr>))}</tbody>
                        </table>
                        <div className="border-t px-3 py-1.5 text-right text-xs font-bold">Total: {formatCurrency(histVentas.reduce((a, v) => a + v.total, 0))}</div>
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Transferencias</h4>
                    {(() => {
                      const transfMovs = histMovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia");
                      const totalTransf = transfMovs.reduce((a, m) => a + m.monto, 0);
                      return totalTransf > 0 ? (
                        <div className="rounded-lg border p-3 bg-blue-50 dark:bg-blue-950/20">
                          <p className="text-xs text-muted-foreground mb-1">Total transferencias</p>
                          <p className="font-bold text-lg">{formatCurrency(totalTransf)}</p>
                        </div>
                      ) : <p className="text-xs text-muted-foreground">Sin transferencias</p>;
                    })()}
                    {(() => {
                      const ncMovs = histMovs.filter((m) => m.tipo === "egreso" && m.referencia_tipo === "nota_credito");
                      if (ncMovs.length === 0) return null;
                      const totalNC = ncMovs.reduce((a, m) => a + Math.abs(m.monto), 0);
                      const porMetodo: Record<string, number> = {};
                      ncMovs.forEach((m) => { const k = m.metodo_pago || "Efectivo"; porMetodo[k] = (porMetodo[k] || 0) + Math.abs(m.monto); });
                      return (
                        <>
                          <h4 className="text-sm font-semibold mt-4 mb-2">Notas de Crédito</h4>
                          <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/20 space-y-1">
                            <p className="font-bold text-lg text-red-600">-{formatCurrency(totalNC)}</p>
                            {Object.entries(porMetodo).map(([metodo, monto]) => (
                              <div key={metodo} className="flex justify-between text-xs text-red-500">
                                <span>→ {metodo}</span>
                                <span>-{formatCurrency(monto)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                    <h4 className="text-sm font-semibold mt-4 mb-2">Movimientos ({histMovs.length})</h4>
                    {histMovs.length === 0 ? <p className="text-xs text-muted-foreground">Sin movimientos</p> : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b bg-muted/50"><th className="text-left py-2 px-3">Hora</th><th className="text-left py-2 px-3">Desc</th><th className="text-right py-2 px-3">Monto</th></tr></thead>
                          <tbody>{histMovs.map((m) => (<tr key={m.id} className="border-b last:border-0"><td className="py-1.5 px-3 text-muted-foreground">{m.hora?.substring(0, 5)}</td><td className="py-1.5 px-3">{m.descripcion}</td><td className={`py-1.5 px-3 text-right font-semibold ${m.tipo === "ingreso" ? "text-emerald-600" : "text-red-500"}`}>{m.tipo === "ingreso" ? "+" : "-"}{formatCurrency(Math.abs(m.monto))}</td></tr>))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : histLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : histTurnos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><Clock className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No hay turnos cerrados</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground"><th className="text-left py-2 px-3 font-medium">Turno</th><th className="text-left py-2 px-3 font-medium">Fecha</th><th className="text-left py-2 px-3 font-medium">Operador</th><th className="text-left py-2 px-3 font-medium">Horario</th><th className="text-right py-2 px-3 font-medium">Ef. Real</th><th className="text-right py-2 px-3 font-medium">Diferencia</th><th className="w-10"></th></tr></thead>
                  <tbody>{histTurnos.map((t) => (<tr key={t.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => openHistDetail(t)}><td className="py-2 px-3 font-mono text-xs">#{t.numero}</td><td className="py-2 px-3">{new Date(t.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR")}</td><td className="py-2 px-3">{t.operador}</td><td className="py-2 px-3 text-muted-foreground text-xs">{t.hora_apertura?.substring(0, 5)} - {t.hora_cierre?.substring(0, 5) || "?"}</td><td className="py-2 px-3 text-right font-semibold">{formatCurrency(t.efectivo_real || 0)}</td><td className={`py-2 px-3 text-right font-semibold ${(t.diferencia || 0) > 0 ? "text-emerald-600" : (t.diferencia || 0) < 0 ? "text-red-500" : "text-muted-foreground"}`}>{formatCurrency(t.diferencia || 0)}</td><td className="py-2 px-3"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></td></tr>))}</tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Turno open: main view ───
  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <PageHeader
        title="Caja Diaria"
        description={new Date().toLocaleDateString("es-AR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={openHistorial}>
              <History className="w-4 h-4 mr-2" />
              Historial
            </Button>
            <Button variant="outline" size="sm" onClick={() => openMovDialog("ingreso")}>
              <Plus className="w-4 h-4 mr-2" />
              Ingreso
            </Button>
            <Button variant="outline" size="sm" onClick={() => openMovDialog("egreso")}>
              <Minus className="w-4 h-4 mr-2" />
              Egreso
            </Button>
            <Button variant="destructive" size="sm" onClick={openCierreDialog}>
              <Lock className="w-4 h-4 mr-2" />
              Cerrar Turno
            </Button>
          </>
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Turno info bar */}
          {turno && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    Turno #{turno.numero}
                  </Badge>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Apertura: {turno.hora_apertura?.substring(0, 5)} hs
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Operador: <span className="font-medium text-foreground">{turno.operador}</span>
                  </div>
                  <div className="text-muted-foreground">
                    Efectivo inicial:{" "}
                    <span className="font-medium text-foreground">
                      {formatCurrency(turno.efectivo_inicial)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Total Ventas"
              value={formatCurrency(totalVentas)}
              subtitle={`${ventas.length} ordenes`}
              icon={Wallet}
              iconColor="text-primary"
              iconBg="bg-primary/10"
            />
            <StatCard
              title="Efectivo Esperado"
              value={formatCurrency(efectivoEsperado)}
              icon={Banknote}
              iconColor="text-emerald-500"
              iconBg="bg-emerald-500/10"
            />
            <StatCard
              title="Ingresos Caja"
              value={formatCurrency(depositos)}
              icon={ArrowUpRight}
              iconColor="text-emerald-500"
              iconBg="bg-emerald-500/10"
            />
            <StatCard
              title="Egresos Caja"
              value={formatCurrency(gastos + retiros + notasCreditoEgresos)}
              icon={ArrowDownRight}
              iconColor="text-red-500"
              iconBg="bg-red-500/10"
            />
          </div>

          {/* Payment method breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Efectivo", value: ventasEfectivo, icon: Banknote },
              { label: "Transferencia", value: ventasTransferencia, icon: ArrowRightLeft },
              { label: "Cuenta Corriente", value: ventasCuentaCorriente, icon: Wallet },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <item.icon className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                    <p className="text-base font-semibold">{formatCurrency(item.value)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Transactions table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ventas del dia */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventas del dia</CardTitle>
              </CardHeader>
              <CardContent>
                {ventas.length === 0 ? (
                  <EmptyState title="No hay ventas hoy" icon={Wallet} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-3 px-4 font-medium">N.</th>
                          <th className="text-left py-3 px-4 font-medium">Cliente</th>
                          <th className="text-left py-3 px-4 font-medium">Vendedor</th>
                          <th className="text-left py-3 px-4 font-medium">Forma Pago</th>
                          <th className="text-right py-3 px-4 font-medium">Total</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ventas.map((v) => (
                          <tr
                            key={v.id}
                            className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => openVentaDetail(v)}
                          >
                            <td className="py-3 px-4 font-mono text-xs">
                              {v.numero}
                              {(v as any).origen === "tienda" && (
                                <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0 border-pink-300 text-pink-600">Web</Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              {(v as any).clientes?.nombre || "—"}
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {(v as any).vendedor_id ? sellersMap[(v as any).vendedor_id] || "—" : "—"}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="secondary" className="text-xs font-normal">
                                {v.forma_pago}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                              {formatCurrency(v.total)}
                            </td>
                            <td className="py-3 px-1">
                              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Movimientos de caja */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Movimientos de Caja</CardTitle>
              </CardHeader>
              <CardContent>
                {movements.length === 0 ? (
                  <EmptyState title="No hay movimientos hoy" icon={Wallet} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-3 px-4 font-medium">Hora</th>
                          <th className="text-left py-3 px-4 font-medium">Descripcion</th>
                          <th className="text-left py-3 px-4 font-medium">Metodo</th>
                          <th className="text-right py-3 px-4 font-medium">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((m) => (
                          <tr
                            key={m.id}
                            className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-3 px-4 text-muted-foreground">
                              {m.hora?.substring(0, 5)}
                            </td>
                            <td className="py-3 px-4 font-medium">{m.descripcion}</td>
                            <td className="py-3 px-4">
                              <Badge variant="secondary" className="text-xs font-normal">
                                {m.metodo_pago}
                              </Badge>
                            </td>
                            <td
                              className={`py-3 px-4 text-right font-semibold ${
                                m.tipo === "ingreso" ? "text-emerald-600" : "text-red-500"
                              }`}
                            >
                              {m.tipo === "ingreso" ? "+" : "-"}
                              {formatCurrency(Math.abs(m.monto))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ─── Ingreso/Egreso Dialog ─── */}
      <Dialog open={movDialog.open} onOpenChange={movDialog.setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {movDialog.data === "ingreso" ? "Nuevo Ingreso" : "Nuevo Egreso"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Descripcion</Label>
              <Input
                value={movForm.descripcion}
                onChange={(e) => setMovForm({ ...movForm, descripcion: e.target.value })}
                placeholder="Motivo del movimiento"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="number"
                  value={movForm.monto}
                  onChange={(e) => setMovForm({ ...movForm, monto: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Metodo de pago</Label>
                <Select
                  value={movForm.metodo_pago}
                  onValueChange={(v) => setMovForm({ ...movForm, metodo_pago: v ?? "" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={movDialog.onClose}>
                Cancelar
              </Button>
              <Button onClick={handleSaveMov}>Registrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Historial Dialog ─── */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Historial de Turnos
            </DialogTitle>
          </DialogHeader>

          {histDetail ? (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setHistDetail(null)} className="text-xs">
                ← Volver al listado
              </Button>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Turno</p>
                  <p className="font-bold">#{histDetail.numero}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="font-bold">{new Date(histDetail.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR")}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Operador</p>
                  <p className="font-bold">{histDetail.operador}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Horario</p>
                  <p className="font-bold">{histDetail.hora_apertura?.substring(0, 5)} - {histDetail.hora_cierre?.substring(0, 5) || "?"}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/20">
                  <p className="text-xs text-muted-foreground">Efectivo inicial</p>
                  <p className="font-bold">{formatCurrency(histDetail.efectivo_inicial)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-blue-50 dark:bg-blue-950/20">
                  <p className="text-xs text-muted-foreground">Efectivo real</p>
                  <p className="font-bold">{formatCurrency(histDetail.efectivo_real || 0)}</p>
                </div>
                <div className={`rounded-lg border p-3 ${(histDetail.diferencia || 0) === 0 ? "bg-muted/30" : (histDetail.diferencia || 0) > 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                  <p className="text-xs text-muted-foreground">Diferencia</p>
                  <p className={`font-bold ${(histDetail.diferencia || 0) > 0 ? "text-emerald-600" : (histDetail.diferencia || 0) < 0 ? "text-red-500" : ""}`}>
                    {formatCurrency(histDetail.diferencia || 0)}
                  </p>
                </div>
              </div>

              {histDetail.notas && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  <p className="text-sm">{histDetail.notas}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Ventas ({histVentas.length})</h4>
                  {histVentas.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin ventas</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b bg-muted/50"><th className="text-left py-2 px-3">N°</th><th className="text-left py-2 px-3">Pago</th><th className="text-right py-2 px-3">Total</th></tr></thead>
                        <tbody>
                          {histVentas.map((v) => (
                            <tr key={v.id} className="border-b last:border-0">
                              <td className="py-1.5 px-3 font-mono">{v.numero}</td>
                              <td className="py-1.5 px-3"><Badge variant="outline" className="text-[10px]">{v.forma_pago}</Badge></td>
                              <td className="py-1.5 px-3 text-right font-semibold">{formatCurrency(v.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="border-t px-3 py-1.5 text-right text-xs font-bold">
                        Total: {formatCurrency(histVentas.reduce((a, v) => a + v.total, 0))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Transferencias breakdown */}
                  {(() => {
                    const transfMovs = histMovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia");
                    const totalTransf = transfMovs.reduce((a, m) => a + m.monto, 0);
                    if (totalTransf === 0) return null;
                    return (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Transferencias</h4>
                        <div className="rounded-lg border p-3 bg-blue-50 dark:bg-blue-950/20">
                          <p className="font-bold text-lg">{formatCurrency(totalTransf)}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Notas de crédito */}
                  {(() => {
                    const ncMovs = histMovs.filter((m) => m.tipo === "egreso" && m.referencia_tipo === "nota_credito");
                    if (ncMovs.length === 0) return null;
                    const totalNC = ncMovs.reduce((a, m) => a + Math.abs(m.monto), 0);
                    const porMetodo: Record<string, number> = {};
                    ncMovs.forEach((m) => { const k = m.metodo_pago || "Efectivo"; porMetodo[k] = (porMetodo[k] || 0) + Math.abs(m.monto); });
                    return (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Notas de Crédito (devoluciones)</h4>
                        <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/20 space-y-1">
                          <p className="font-bold text-lg text-red-600">-{formatCurrency(totalNC)}</p>
                          {Object.entries(porMetodo).map(([metodo, monto]) => (
                            <div key={metodo} className="flex justify-between text-xs text-red-500">
                              <span>→ {metodo}</span>
                              <span>-{formatCurrency(monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Movimientos ({histMovs.length})</h4>
                    {histMovs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin movimientos</p>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b bg-muted/50"><th className="text-left py-2 px-3">Hora</th><th className="text-left py-2 px-3">Desc</th><th className="text-right py-2 px-3">Monto</th></tr></thead>
                          <tbody>
                            {histMovs.map((m) => (
                              <tr key={m.id} className="border-b last:border-0">
                                <td className="py-1.5 px-3 text-muted-foreground">{m.hora?.substring(0, 5)}</td>
                                <td className="py-1.5 px-3">{m.descripcion}</td>
                                <td className={`py-1.5 px-3 text-right font-semibold ${m.tipo === "ingreso" ? "text-emerald-600" : "text-red-500"}`}>
                                  {m.tipo === "ingreso" ? "+" : "-"}{formatCurrency(Math.abs(m.monto))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : histLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : histTurnos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay turnos cerrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">Turno</th>
                    <th className="text-left py-2 px-3 font-medium">Fecha</th>
                    <th className="text-left py-2 px-3 font-medium">Operador</th>
                    <th className="text-left py-2 px-3 font-medium">Horario</th>
                    <th className="text-right py-2 px-3 font-medium">Ef. Real</th>
                    <th className="text-right py-2 px-3 font-medium">Diferencia</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {histTurnos.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => openHistDetail(t)}>
                      <td className="py-2 px-3 font-mono text-xs">#{t.numero}</td>
                      <td className="py-2 px-3">{new Date(t.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR")}</td>
                      <td className="py-2 px-3">{t.operador}</td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">{t.hora_apertura?.substring(0, 5)} - {t.hora_cierre?.substring(0, 5) || "?"}</td>
                      <td className="py-2 px-3 text-right font-semibold">{formatCurrency(t.efectivo_real || 0)}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${(t.diferencia || 0) > 0 ? "text-emerald-600" : (t.diferencia || 0) < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {formatCurrency(t.diferencia || 0)}
                      </td>
                      <td className="py-2 px-3"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Cerrar Turno Dialog ─── */}
      <Dialog open={cierreDialog.open} onOpenChange={cierreDialog.setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cerrar Turno de Caja</DialogTitle>
          </DialogHeader>

          {turno && (
            <div className="space-y-5 mt-2 max-h-[70vh] overflow-y-auto pr-1">
              {/* Info turno */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Caja</p>
                  <p className="font-medium">Caja Principal</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Turno</p>
                  <p className="font-medium">#{turno.numero}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Apertura</p>
                  <p className="font-medium">
                    {turno.fecha_apertura} {turno.hora_apertura?.substring(0, 5)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Operador</p>
                  <p className="font-medium">{turno.operador}</p>
                </div>
              </div>

              <Separator />

              {/* Ventas */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Ventas</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Ventas</span>
                    <span className="font-semibold">{formatCurrency(totalVentas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ordenes</span>
                    <span>{ventas.length}</span>
                  </div>
                </div>
                <div className="pl-3 space-y-1 text-sm border-l-2 border-muted mt-2">
                  {ventasEfectivo > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Efectivo</span>
                      <span>{formatCurrency(ventasEfectivo)}</span>
                    </div>
                  )}
                  {ventasTransferencia > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Transferencia</span>
                        <span>{formatCurrency(ventasTransferencia)}</span>
                      </div>
                      {/* Desglose por banco */}
                      {(() => {
                        const transfMovs = movements.filter(
                          (m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia"
                        );
                        const porBanco: Record<string, number> = {};
                        transfMovs.forEach((m) => {
                          const banco = m.cuenta_bancaria || "Sin especificar";
                          porBanco[banco] = (porBanco[banco] || 0) + m.monto;
                        });
                        const bancos = Object.entries(porBanco);
                        if (bancos.length <= 1 && bancos[0]?.[0] === "Sin especificar") return null;
                        return bancos.map(([banco, monto]) => (
                          <div key={banco} className="flex justify-between pl-3 text-xs">
                            <span className="text-muted-foreground">→ {banco}</span>
                            <span>{formatCurrency(monto)}</span>
                          </div>
                        ));
                      })()}
                    </>
                  )}
                  {ventasCuentaCorriente > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cuenta Corriente</span>
                      <span>{formatCurrency(ventasCuentaCorriente)}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Movimientos de Efectivo */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Movimientos de Efectivo</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo Inicial</span>
                    <span>{formatCurrency(efectivoInicial)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ventas en Efectivo</span>
                    <span className="text-emerald-600">+{formatCurrency(ventasEfectivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Depositos</span>
                    <span className="text-emerald-600">+{formatCurrency(depositos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gastos</span>
                    <span className="text-red-500">-{formatCurrency(gastos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Retiros</span>
                    <span className="text-red-500">-{formatCurrency(retiros)}</span>
                  </div>
                  {notasCreditoEgresos > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Notas de Crédito</span>
                        <span className="text-red-500">-{formatCurrency(notasCreditoEgresos)}</span>
                      </div>
                      {/* NC breakdown by metodo_pago */}
                      {(() => {
                        const ncMovs = movements.filter((m) => m.tipo === "egreso" && m.referencia_tipo === "nota_credito");
                        const porMetodo: Record<string, number> = {};
                        ncMovs.forEach((m) => {
                          const k = m.metodo_pago || "Efectivo";
                          porMetodo[k] = (porMetodo[k] || 0) + Math.abs(m.monto);
                        });
                        return Object.entries(porMetodo).map(([metodo, monto]) => (
                          <div key={metodo} className="flex justify-between pl-3 text-xs">
                            <span className="text-muted-foreground">→ {metodo}</span>
                            <span className="text-red-400">-{formatCurrency(monto)}</span>
                          </div>
                        ));
                      })()}
                    </>
                  )}
                </div>
              </div>

              {/* Efectivo Esperado highlight */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                    Efectivo Esperado
                  </span>
                  <span className="text-xl font-bold text-blue-700 dark:text-blue-300">
                    {formatCurrency(efectivoEsperado)}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Efectivo real contado */}
              <div className="space-y-2">
                <Label className="font-semibold">Efectivo Real Contado</Label>
                <Input
                  type="number"
                  value={cierreForm.efectivo_real}
                  onChange={(e) =>
                    setCierreForm({ ...cierreForm, efectivo_real: Number(e.target.value) })
                  }
                  className="text-lg font-semibold"
                />
              </div>

              {/* Difference */}
              {cierreForm.efectivo_real !== efectivoEsperado && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
                    cierreForm.efectivo_real - efectivoEsperado > 0
                      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Diferencia:{" "}
                    {formatCurrency(cierreForm.efectivo_real - efectivoEsperado)}
                  </span>
                </div>
              )}

              {/* Notas */}
              <div className="space-y-2">
                <Label>Notas / Observaciones</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={cierreForm.notas}
                  onChange={(e) => setCierreForm({ ...cierreForm, notas: e.target.value })}
                  placeholder="Observaciones opcionales..."
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={cierreDialog.onClose}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleCerrarTurno}>
                  <Lock className="w-4 h-4 mr-2" />
                  Cerrar Turno
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Venta Detail Dialog */}
      <Dialog open={ventaDetailOpen} onOpenChange={setVentaDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Venta {ventaDetail?.numero}</DialogTitle>
          </DialogHeader>
          {ventaDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium ml-1">{(ventaDetail as any).clientes?.nombre || "—"}</span></div>
                <div><span className="text-muted-foreground">Vendedor:</span> <span className="font-medium ml-1">{(ventaDetail as any).vendedor_id ? sellersMap[(ventaDetail as any).vendedor_id] || "—" : "—"}</span></div>
                <div><span className="text-muted-foreground">Pago:</span> <span className="font-medium ml-1">{ventaDetail.forma_pago}</span></div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-bold ml-1 text-emerald-600">{formatCurrency(ventaDetail.total)}</span></div>
              </div>

              {/* Mixed payment detail */}
              {ventaDetail.forma_pago === "Mixto" && ventaDetailMovs.length > 0 && (
                <div className="space-y-1.5 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Detalle pago mixto</p>
                  {ventaDetailMovs.filter((m: any) => m.tipo === "ingreso").map((m: any, i: number) => {
                    const desc = (m.descripcion || "").toLowerCase();
                    const isDebtCollection = desc.includes("cobro") || desc.includes("saldo") || desc.includes("deuda");
                    return (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {m.metodo_pago}
                          {isDebtCollection && (
                            <span className="ml-1 text-xs text-amber-600 font-medium">(Cobro saldo anterior)</span>
                          )}
                        </span>
                        <span className="font-medium">{formatCurrency(Math.abs(m.monto))}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Items */}
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium">Producto</th>
                      <th className="text-center py-2 px-3 font-medium">Cant</th>
                      <th className="text-right py-2 px-3 font-medium">Precio</th>
                      <th className="text-right py-2 px-3 font-medium">Desc%</th>
                      <th className="text-right py-2 px-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventaDetailItems.map((item: any) => {
                      const unidades = item.unidades_por_presentacion || 1;
                      const isBox = unidades > 1;
                      const unitPrice = isBox ? item.precio_unitario / unidades : item.precio_unitario;
                      // Clean description: remove duplicate presentations and "(Unidad)"
                      const rawName = item.descripcion || item.nombre_producto || "";
                      const cleanName = rawName
                        .replace(/\s*\(Unidad\)/gi, "")
                        .replace(/\s*[-–]\s*Unidad$/i, "")
                        .replace(/(\([^)]+\))\s*\1/gi, "$1")
                        .trim();
                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-2 px-3">
                            <span>{cleanName}</span>
                            {item.es_combo && <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">Combo</span>}
                          </td>
                          <td className="py-2 px-3 text-center">{unidades > 0 && unidades < 1 ? item.cantidad * unidades : item.cantidad}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(unitPrice)}{isBox && <span className="block text-[10px] text-muted-foreground">c/u (x{unidades})</span>}</td>
                          <td className="py-2 px-3 text-right">{item.descuento ? `${item.descuento}%` : "—"}</td>
                          <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
