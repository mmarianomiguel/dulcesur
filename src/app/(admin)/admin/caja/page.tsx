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
  AlertTriangle,
} from "lucide-react";

import { formatCurrency, todayARG, nowTimeARG, formatDatePDF } from "@/lib/formatters";
import { jsPDF } from "jspdf";
import { VentaDetailDialog } from "@/components/venta-detail-dialog";
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
import { useCurrentUser } from "@/hooks/use-current-user";
import { logAudit } from "@/lib/audit";

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
  // Verify no open turno exists (prevents concurrent opens from different browsers)
  const existing = await getTurnoAbierto();
  if (existing) throw new Error("Ya existe un turno abierto. Cerralo antes de abrir uno nuevo.");
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
  const currentUser = useCurrentUser();

  // ─── Turno state ───
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [turnoLoading, setTurnoLoading] = useState(true);
  const [abrirForm, setAbrirForm] = useState({ efectivo_inicial: 0, operador: "" });

  // ─── Movements (filtered by turno time range) ───
  const fetchMovements = useCallback(async () => {
    if (!turno) return [];
    // Fetch movements from apertura date to today (turno may span multiple days)
    const fechaApertura = turno.fecha_apertura || today;
    let allMovs: CajaMovimiento[] = [];
    if (fechaApertura === today) {
      allMovs = await cajaService.getByFecha(today);
    } else {
      // Fetch range: from apertura date to today
      const { data } = await supabase.from("caja_movimientos").select("*").gte("fecha", fechaApertura).lte("fecha", today).order("created_at", { ascending: false });
      allMovs = (data || []) as CajaMovimiento[];
    }
    const all = allMovs;
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
    if (!turno) return [];
    const fechaApertura = turno.fecha_apertura || today;
    let query = supabase.from("ventas").select("*, clientes(nombre)").order("created_at", { ascending: false });
    if (fechaApertura === today) {
      query = query.eq("fecha", today);
    } else {
      query = query.gte("fecha", fechaApertura).lte("fecha", today);
    }
    const { data: allData } = await query;
    const all = (allData || []) as Venta[];
    const aperturaDate = new Date(turno.created_at);
    const cierreDate = turno.estado === "cerrado" && turno.fecha_cierre && turno.hora_cierre
      ? new Date(`${turno.fecha_cierre}T${turno.hora_cierre}-03:00`)
      : null;
    return all.filter((v: Venta) => {
      // Exclude credit notes and annulled sales
      if ((v as any).tipo_comprobante?.toLowerCase().startsWith("nota de crédito")) return false;
      if (v.estado === "anulada") return false;
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
  const [movForm, setMovForm] = useState({ descripcion: "", metodo_pago: "Efectivo", monto: 0, proveedor: "" });
  const [cierreForm, setCierreForm] = useState({ efectivo_real: 0, notas: "" });
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([]);

  // Sellers map for display
  const [sellersMap, setSellersMap] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.from("proveedores").select("id, nombre").order("nombre").then(({ data }) => {
      setProveedores(data || []);
    });
    supabase.from("usuarios").select("id, nombre").eq("activo", true).then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach((u: any) => { map[u.id] = u.nombre; });
      setSellersMap(map);
    });
  }, []);

  // Sale detail for viewing
  const [ventaDetailOpen, setVentaDetailOpen] = useState(false);
  const [cajaCuentasBancarias, setCajaCuentasBancarias] = useState<{ id: string; nombre: string; alias: string }[]>([]);
  useEffect(() => {
    supabase.from("cuentas_bancarias").select("id, nombre, alias").eq("activo", true).order("nombre").then(({ data }) => setCajaCuentasBancarias(data || []));
  }, []);
  const [ventaDetail, setVentaDetail] = useState<Venta | null>(null);
  const [ventaDetailItems, setVentaDetailItems] = useState<any[]>([]);
  const [ventaDetailMovs, setVentaDetailMovs] = useState<any[]>([]);

  const openVentaDetail = async (v: Venta) => {
    setVentaDetail(v);
    setVentaDetailOpen(true);
    const [{ data: items }, { data: movs }] = await Promise.all([
      supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at"),
      supabase.from("caja_movimientos").select("id, tipo, descripcion, metodo_pago, monto, referencia_id, referencia_tipo, created_at, cuenta_bancaria").eq("referencia_id", v.id).order("created_at"),
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
    if (turno) { showAdminToast("Ya hay un turno abierto", "error"); return; }
    try {
      const t = await abrirTurno(abrirForm.efectivo_inicial, abrirForm.operador.trim());
      setTurno(t);
      abrirDialog.onClose();
      setAbrirForm({ efectivo_inicial: 0, operador: "" });
      showAdminToast("Turno abierto correctamente");
      setTimeout(() => { refetchMov(); refetchVentas(); }, 100);
    } catch (err: any) {
      showAdminToast(err?.message || "Error al abrir turno", "error");
    }
  };

  const openMovDialog = (type: "ingreso" | "egreso") => {
    setMovForm({ descripcion: "", metodo_pago: "Efectivo", monto: 0, proveedor: "" });
    movDialog.onOpen(type);
  };

  const handleSaveMov = async () => {
    if (!turno) { showAdminToast("Debe abrir un turno antes de registrar movimientos", "error"); return; }
    if (!movForm.descripcion.trim()) { showAdminToast("Ingresá una descripción", "error"); return; }
    if (movForm.monto < 1) { showAdminToast("El monto debe ser al menos $1", "error"); return; }
    const type = movDialog.data || "ingreso";
    try {
      const provNombre = movForm.proveedor ? proveedores.find(p => p.id === movForm.proveedor)?.nombre : null;
      const desc = provNombre ? `${movForm.descripcion} — Prov: ${provNombre}` : movForm.descripcion;
      const opts = {
        descripcion: desc,
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
      logAudit({
        userName: currentUser?.nombre || "Admin Sistema",
        action: "CREATE",
        module: "caja",
        after: { tipo: type, descripcion: desc, monto: movForm.monto, metodo_pago: movForm.metodo_pago, proveedor: provNombre },
      });
      showAdminToast(type === "ingreso" ? "Ingreso registrado" : "Egreso registrado");
    } catch (err: any) {
      showAdminToast(err?.message || "Error al registrar movimiento", "error");
    }
  };

  const openCierreDialog = () => {
    setCierreForm({ efectivo_real: efectivoEsperado, notas: "" });
    cierreDialog.onOpen();
  };

  const handleCerrarTurno = async () => {
    if (!turno) return;
    const diff = cierreForm.efectivo_real - efectivoEsperado;
    if (Math.abs(diff) > 500 && !cierreForm.notas.trim()) {
      showAdminToast("Hay una diferencia de " + formatCurrency(Math.abs(diff)) + ". Agregá una nota explicativa.", "error");
      return;
    }
    try {
      await cerrarTurno(turno.id, cierreForm.efectivo_real, diff, cierreForm.notas);
      setTurno(null);
      cierreDialog.onClose();
      refetchMov();
      refetchVentas();
      showAdminToast("Turno cerrado correctamente");
    } catch (err: any) {
      showAdminToast(err?.message || "Error al cerrar turno", "error");
    }
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
      supabase.from("caja_movimientos").select("id, tipo, descripcion, metodo_pago, monto, hora, fecha, referencia_id, referencia_tipo, created_at, cuenta_bancaria").eq("fecha", fecha).order("hora", { ascending: false }),
      supabase.from("ventas").select("id, numero, fecha, total, forma_pago, tipo_comprobante, vendedor_id, origen, estado, created_at, monto_efectivo, monto_transferencia, cuenta_transferencia_alias, clientes(nombre)").eq("fecha", fecha).not("tipo_comprobante", "ilike", "Nota de Crédito%").neq("estado", "anulada").order("created_at", { ascending: false }),
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

  // ─── Export turno to PDF ───
  const exportTurnoPDF = (t: TurnoCaja, tvts: Venta[], tmovs: CajaMovimiento[]) => {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;
    const fmtCur = (v: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

    // Header
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("Resumen de Turno de Caja", margin, y);
    y += 8;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Turno #${t.numero} — ${formatDatePDF(t.fecha_apertura)}`, margin, y);
    y += 5;
    pdf.text(`Operador: ${t.operador}`, margin, y);
    y += 5;
    pdf.text(`Horario: ${t.hora_apertura?.substring(0, 5)} — ${t.hora_cierre?.substring(0, 5) || "En curso"}`, margin, y);
    y += 10;

    // Efectivo summary
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("Resumen de Efectivo", margin, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");

    const efRows = [
      ["Efectivo Inicial", fmtCur(t.efectivo_inicial)],
      ["Efectivo Real Contado", fmtCur(t.efectivo_real || 0)],
      ["Diferencia", fmtCur(t.diferencia || 0)],
    ];
    for (const [label, val] of efRows) {
      pdf.text(label, margin, y);
      pdf.text(val, w - margin, y, { align: "right" });
      y += 5;
    }
    if (t.notas) {
      y += 2;
      pdf.setFont("helvetica", "italic");
      pdf.text(`Notas: ${t.notas}`, margin, y);
      pdf.setFont("helvetica", "normal");
      y += 7;
    } else {
      y += 5;
    }

    // Ventas summary
    pdf.setDrawColor(200);
    pdf.line(margin, y, w - margin, y);
    y += 5;
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Ventas (${tvts.length})`, margin, y);
    y += 7;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");

    if (tvts.length > 0) {
      // Table header
      pdf.setFont("helvetica", "bold");
      pdf.text("N°", margin, y);
      pdf.text("Cliente", margin + 35, y);
      pdf.text("Forma Pago", margin + 85, y);
      pdf.text("Total", w - margin, y, { align: "right" });
      y += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setDrawColor(220);
      pdf.line(margin, y - 1, w - margin, y - 1);

      for (const v of tvts) {
        if (y > 270) { pdf.addPage(); y = 20; }
        pdf.text(v.numero || "—", margin, y);
        pdf.text(((v as any).clientes?.nombre || "—").substring(0, 25), margin + 35, y);
        pdf.text(v.forma_pago || "—", margin + 85, y);
        pdf.text(fmtCur(v.total), w - margin, y, { align: "right" });
        y += 4.5;
      }
      y += 3;
      pdf.setFont("helvetica", "bold");
      pdf.text("Total Ventas:", margin + 85, y);
      pdf.text(fmtCur(tvts.reduce((a, v) => a + v.total, 0)), w - margin, y, { align: "right" });
      y += 8;
    }

    // Payment method breakdown
    pdf.setDrawColor(200);
    pdf.line(margin, y, w - margin, y);
    y += 5;
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("Desglose por Método de Pago", margin, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");

    // Calculate per-method using same logic as live view
    const pdfVentasConMov = new Set(
      tmovs.filter((m) => m.referencia_tipo === "venta" && m.tipo === "ingreso").map((m) => m.referencia_id)
    );
    const pdfVentasSinMov = tvts.filter((v) => !pdfVentasConMov.has(v.id));
    const pdfMovEfectivo = tmovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Efectivo").reduce((a, m) => a + m.monto, 0)
      + pdfVentasSinMov.filter((v) => v.forma_pago === "Efectivo").reduce((a, v) => a + v.total, 0)
      + pdfVentasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_efectivo || 0), 0);
    const pdfMovTransf = tmovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia").reduce((a, m) => a + m.monto, 0)
      + pdfVentasSinMov.filter((v) => v.forma_pago === "Transferencia").reduce((a, v) => a + v.total, 0)
      + pdfVentasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_transferencia || 0), 0);

    if (pdfMovEfectivo > 0) { pdf.text("Efectivo", margin + 5, y); pdf.text(fmtCur(pdfMovEfectivo), w - margin, y, { align: "right" }); y += 5; }
    if (pdfMovTransf > 0) {
      pdf.text("Transferencia", margin + 5, y); pdf.text(fmtCur(pdfMovTransf), w - margin, y, { align: "right" }); y += 5;
      // Per-account breakdown
      const pdfPorCuenta: Record<string, number> = {};
      tmovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia")
        .forEach((m) => { const c = (m as any).cuenta_bancaria || "Sin asignar"; pdfPorCuenta[c] = (pdfPorCuenta[c] || 0) + m.monto; });
      for (const v of pdfVentasSinMov) {
        const mt = v.forma_pago === "Transferencia" ? v.total : v.forma_pago === "Mixto" ? ((v as any).monto_transferencia || 0) : 0;
        if (mt > 0) { const c = (v as any).cuenta_transferencia_alias || "Sin asignar"; pdfPorCuenta[c] = (pdfPorCuenta[c] || 0) + mt; }
      }
      pdf.setFontSize(9);
      for (const [cuenta, monto] of Object.entries(pdfPorCuenta).sort((a, b) => b[1] - a[1])) {
        pdf.text(`→ ${cuenta}`, margin + 10, y); pdf.text(fmtCur(monto), w - margin, y, { align: "right" }); y += 4;
      }
      pdf.setFontSize(10);
    }
    y += 5;

    // Movimientos
    pdf.setDrawColor(200);
    pdf.line(margin, y, w - margin, y);
    y += 5;
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Movimientos de Caja (${tmovs.length})`, margin, y);
    y += 7;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");

    if (tmovs.length > 0) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Hora", margin, y);
      pdf.text("Descripción", margin + 20, y);
      pdf.text("Método", margin + 100, y);
      pdf.text("Monto", w - margin, y, { align: "right" });
      y += 5;
      pdf.setFont("helvetica", "normal");
      pdf.line(margin, y - 1, w - margin, y - 1);

      for (const m of tmovs) {
        if (y > 270) { pdf.addPage(); y = 20; }
        pdf.text(m.hora?.substring(0, 5) || "—", margin, y);
        pdf.text((m.descripcion || "—").substring(0, 45), margin + 20, y);
        pdf.text(m.metodo_pago || "—", margin + 100, y);
        const prefix = m.tipo === "ingreso" ? "+" : "-";
        pdf.text(`${prefix}${fmtCur(Math.abs(m.monto))}`, w - margin, y, { align: "right" });
        y += 4.5;
      }
    }

    // Footer
    y += 5;
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`Generado el ${new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })} a las ${nowTimeARG().substring(0, 5)}`, margin, y);

    pdf.save(`turno-${t.numero}-${t.fecha_apertura}.pdf`);
    showAdminToast("PDF descargado");
  };

  // ─── Derived calculations ───

  const {
    ventasEfectivo,
    ventasTransferencia,
    transferenciaPorCuenta,
    ventasCuentaCorriente,
    totalVentas,
    depositos,
    gastos,
    notasCreditoEgresos,
    anulaciones,
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

    // Build set of venta IDs that have caja_movimientos entries
    const ventasConMovimientos = new Set(
      movements.filter((m) => m.referencia_tipo === "venta" && m.tipo === "ingreso").map((m) => m.referencia_id)
    );
    // Ventas without caja_movimientos (typically online orders)
    const ventasSinMov = ventas.filter((v) => !ventasConMovimientos.has(v.id));

    // Efectivo: from caja_movimientos + ventas sin movimientos
    const ventasEfectivo = movPorMetodo("Efectivo")
      + ventasSinMov.filter((v) => v.forma_pago === "Efectivo").reduce((a, v) => a + v.total, 0)
      + ventasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_efectivo || 0), 0);

    // Transferencia: from caja_movimientos + ventas sin movimientos
    // For Mixto online: transferencia = total - efectivo (includes recargo)
    const ventasTransferencia = movPorMetodo("Transferencia")
      + ventasSinMov.filter((v) => v.forma_pago === "Transferencia").reduce((a, v) => a + v.total, 0)
      + ventasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => {
        const ef = (v as any).monto_efectivo || 0;
        const cc = (v as any).monto_cuenta_corriente || 0;
        return a + (v.total - ef - cc);  // Everything not cash or CC goes to transfer
      }, 0);

    // Group transfers by bank account
    const transferenciaPorCuenta: Record<string, number> = {};
    movements
      .filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia")
      .forEach((m) => {
        const cuenta = (m as any).cuenta_bancaria || "Sin asignar";
        transferenciaPorCuenta[cuenta] = (transferenciaPorCuenta[cuenta] || 0) + m.monto;
      });
    // Also include ventas sin movimientos in bank account grouping
    for (const v of ventasSinMov) {
      const ef = (v as any).monto_efectivo || 0;
      const cc = (v as any).monto_cuenta_corriente || 0;
      const montoTransf = v.forma_pago === "Transferencia" ? v.total
        : v.forma_pago === "Mixto" ? (v.total - ef - cc)
        : 0;
      if (montoTransf > 0) {
        const cuenta = (v as any).cuenta_transferencia_alias || "Sin asignar";
        transferenciaPorCuenta[cuenta] = (transferenciaPorCuenta[cuenta] || 0) + montoTransf;
      }
    }

    // CC: pure CC ventas + mixto CC portion (only when CC was explicitly used via POS)
    const ventasCuentaCorriente = ventasPorMetodo("Cuenta Corriente")
      + ventas.filter((v) => v.forma_pago === "Mixto").reduce((acc, v) => {
        // Check if this mixto sale has a CC component in caja_movimientos
        const ccMovTotal = movements
          .filter((m) => m.referencia_id === v.id && m.referencia_tipo === "venta" && m.tipo === "ingreso" && m.metodo_pago === "Cuenta Corriente")
          .reduce((a, m) => a + m.monto, 0);
        if (ccMovTotal > 0) return acc + ccMovTotal;
        // For ventas sin caja_movimientos (online orders):
        // Online Mixto = Efectivo + Transferencia only (no CC option in checkout)
        // Any gap between stored amounts and total is recargo rounding, NOT CC
        const storedCC = (v as any).monto_cuenta_corriente || 0;
        return acc + storedCC;
      }, 0);
    const totalVentas = ventas.reduce((a, v) => a + v.total, 0);

    const depositos = movements
      .filter((m) => m.tipo === "ingreso" && m.metodo_pago === "Efectivo" && m.referencia_tipo !== "venta")
      .reduce((a, m) => a + m.monto, 0);

    const gastos = movements
      .filter((m) => m.tipo === "egreso" && (m.descripcion || "").toLowerCase().includes("gasto"))
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const notasCreditoEgresos = movements
      .filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "nota_credito")
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const anulaciones = movements
      .filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "anulacion")
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const retiros = movements
      .filter((m) => m.tipo === "egreso" && !(m.descripcion || "").toLowerCase().includes("gasto"))
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const efectivoInicial = turno?.efectivo_inicial ?? 0;
    const efectivoEsperado = efectivoInicial + ventasEfectivo + depositos - gastos - retiros - notasCreditoEgresos - anulaciones;

    return {
      ventasEfectivo,
      ventasTransferencia,
      transferenciaPorCuenta,
      ventasCuentaCorriente,
      totalVentas,
      depositos,
      gastos,
      notasCreditoEgresos,
      anulaciones,
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
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setHistDetail(null)} className="text-xs">← Volver al listado</Button>
                  <Button variant="outline" size="sm" onClick={() => exportTurnoPDF(histDetail, histVentas, histMovs)}>
                    Descargar PDF
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Turno</p><p className="font-bold">#{histDetail.numero}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Fecha</p><p className="font-bold">{new Date(histDetail.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p></div>
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
                      const ncMovs = histMovs.filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "nota_credito");
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
                    {(() => {
                      const anulMovs = histMovs.filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "anulacion");
                      if (anulMovs.length === 0) return null;
                      const totalAnul = anulMovs.reduce((a, m) => a + Math.abs(m.monto), 0);
                      return (
                        <>
                          <h4 className="text-sm font-semibold mt-4 mb-2">Anulaciones</h4>
                          <div className="rounded-lg border p-3 bg-orange-50 dark:bg-orange-950/20 space-y-1">
                            <p className="font-bold text-lg text-orange-600">-{formatCurrency(totalAnul)}</p>
                            {anulMovs.map((m) => (
                              <div key={m.id} className="flex justify-between text-xs text-orange-600">
                                <span className="truncate mr-2">{m.descripcion}</span>
                                <span className="shrink-0">-{formatCurrency(Math.abs(m.monto))}</span>
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
                  <tbody>{histTurnos.map((t) => (<tr key={t.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => openHistDetail(t)}><td className="py-2 px-3 font-mono text-xs">#{t.numero}</td><td className="py-2 px-3">{new Date(t.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td><td className="py-2 px-3">{t.operador}</td><td className="py-2 px-3 text-muted-foreground text-xs">{t.hora_apertura?.substring(0, 5)} - {t.hora_cierre?.substring(0, 5) || "?"}</td><td className="py-2 px-3 text-right font-semibold">{formatCurrency(t.efectivo_real || 0)}</td><td className={`py-2 px-3 text-right font-semibold ${(t.diferencia || 0) > 0 ? "text-emerald-600" : (t.diferencia || 0) < 0 ? "text-red-500" : "text-muted-foreground"}`}>{formatCurrency(t.diferencia || 0)}</td><td className="py-2 px-3"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></td></tr>))}</tbody>
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
              value={formatCurrency(gastos + retiros + notasCreditoEgresos + anulaciones)}
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
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                      <p className="text-base font-semibold">{formatCurrency(item.value)}</p>
                    </div>
                  </div>
                  {/* Desglose de transferencias por cuenta bancaria */}
                  {item.label === "Transferencia" && ventasTransferencia > 0 && Object.keys(transferenciaPorCuenta).length > 0 && (
                    <div className="mt-2 pt-2 border-t space-y-1">
                      {Object.entries(transferenciaPorCuenta).sort((a, b) => b[1] - a[1]).map(([cuenta, monto]) => (
                        <div key={cuenta} className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground truncate">{cuenta}</span>
                          <span className="font-medium shrink-0 ml-2">{formatCurrency(monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Transactions table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ventas del día */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventas del día</CardTitle>
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
                              {(v.forma_pago === "Transferencia" || v.forma_pago === "Mixto") && !(v as any).cuenta_transferencia_alias && (
                                <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] text-amber-600 font-medium bg-amber-50 border border-amber-200 px-1 py-0 rounded">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Sin cuenta
                                </span>
                              )}
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
                          <th className="text-left py-3 px-4 font-medium">Descripción</th>
                          <th className="text-left py-3 px-4 font-medium">Método</th>
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
              <Label>Descripción</Label>
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
                <Label>Método de pago</Label>
                <Select
                  value={movForm.metodo_pago}
                  onValueChange={(v) => setMovForm({ ...movForm, metodo_pago: v ?? "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {movDialog.data === "egreso" && proveedores.length > 0 && (
              <div className="space-y-2">
                <Label>Proveedor (opcional)</Label>
                <Select
                  value={movForm.proveedor || "none"}
                  onValueChange={(v) => setMovForm({ ...movForm, proveedor: v === "none" ? "" : (v || "") })}
                >
                  <SelectTrigger>
                    {movForm.proveedor ? proveedores.find(p => p.id === movForm.proveedor)?.nombre || "Sin proveedor" : "Sin proveedor"}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setHistDetail(null)} className="text-xs">
                  ← Volver al listado
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportTurnoPDF(histDetail, histVentas, histMovs)}>
                  Descargar PDF
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Turno</p>
                  <p className="font-bold">#{histDetail.numero}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="font-bold">{new Date(histDetail.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
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
                  {/* Desglose por método de pago */}
                  {(() => {
                    const hVentasConMov = new Set(histMovs.filter((m) => m.referencia_tipo === "venta" && m.tipo === "ingreso").map((m) => m.referencia_id));
                    const hVentasSinMov = histVentas.filter((v) => !hVentasConMov.has(v.id));
                    const hEfectivo = histMovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Efectivo").reduce((a, m) => a + m.monto, 0)
                      + hVentasSinMov.filter((v) => v.forma_pago === "Efectivo").reduce((a, v) => a + v.total, 0)
                      + hVentasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_efectivo || 0), 0);
                    const hTransf = histMovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia").reduce((a, m) => a + m.monto, 0)
                      + hVentasSinMov.filter((v) => v.forma_pago === "Transferencia").reduce((a, v) => a + v.total, 0)
                      + hVentasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_transferencia || 0), 0);
                    // Per-account
                    const hPorCuenta: Record<string, number> = {};
                    histMovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia")
                      .forEach((m) => { const c = (m as any).cuenta_bancaria || "Sin asignar"; hPorCuenta[c] = (hPorCuenta[c] || 0) + m.monto; });
                    for (const v of hVentasSinMov) {
                      const mt = v.forma_pago === "Transferencia" ? v.total : v.forma_pago === "Mixto" ? ((v as any).monto_transferencia || 0) : 0;
                      if (mt > 0) { const c = (v as any).cuenta_transferencia_alias || "Sin asignar"; hPorCuenta[c] = (hPorCuenta[c] || 0) + mt; }
                    }
                    if (hEfectivo === 0 && hTransf === 0) return null;
                    return (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Desglose por Método</h4>
                        <div className="rounded-lg border p-3 space-y-2">
                          {hEfectivo > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Efectivo</span>
                              <span className="font-semibold">{formatCurrency(hEfectivo)}</span>
                            </div>
                          )}
                          {hTransf > 0 && (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Transferencia</span>
                                <span className="font-semibold">{formatCurrency(hTransf)}</span>
                              </div>
                              {Object.entries(hPorCuenta).sort((a, b) => b[1] - a[1]).map(([cuenta, monto]) => (
                                <div key={cuenta} className="flex justify-between text-xs pl-3">
                                  <span className="text-muted-foreground">→ {cuenta}</span>
                                  <span className="font-medium">{formatCurrency(monto)}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Notas de crédito */}
                  {(() => {
                    const ncMovs = histMovs.filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "nota_credito");
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

                  {/* Anulaciones */}
                  {(() => {
                    const anulMovs = histMovs.filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "anulacion");
                    if (anulMovs.length === 0) return null;
                    const totalAnul = anulMovs.reduce((a, m) => a + Math.abs(m.monto), 0);
                    return (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Anulaciones</h4>
                        <div className="rounded-lg border p-3 bg-orange-50 dark:bg-orange-950/20 space-y-1">
                          <p className="font-bold text-lg text-orange-600">-{formatCurrency(totalAnul)}</p>
                          {anulMovs.map((m) => (
                            <div key={m.id} className="flex justify-between text-xs text-orange-600">
                              <span className="truncate mr-2">{m.descripcion}</span>
                              <span className="shrink-0">-{formatCurrency(Math.abs(m.monto))}</span>
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
                      <td className="py-2 px-3">{new Date(t.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
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
                      {/* Desglose por cuenta bancaria */}
                      {Object.keys(transferenciaPorCuenta).length > 0 && Object.entries(transferenciaPorCuenta).sort((a, b) => b[1] - a[1]).map(([cuenta, monto]) => (
                        <div key={cuenta} className="flex justify-between pl-3 text-xs">
                          <span className="text-muted-foreground">→ {cuenta}</span>
                          <span>{formatCurrency(monto)}</span>
                        </div>
                      ))}
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
                  {anulaciones > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Anulaciones</span>
                      <span className="text-red-500">-{formatCurrency(anulaciones)}</span>
                    </div>
                  )}
                  {notasCreditoEgresos > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Notas de Crédito</span>
                        <span className="text-red-500">-{formatCurrency(notasCreditoEgresos)}</span>
                      </div>
                      {/* NC breakdown by metodo_pago */}
                      {(() => {
                        const ncMovs = movements.filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "nota_credito");
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
      <VentaDetailDialog
        open={ventaDetailOpen}
        onOpenChange={setVentaDetailOpen}
        data={ventaDetail ? {
          numero: ventaDetail.numero,
          created_at: (ventaDetail as any).created_at || ventaDetail.fecha,
          fecha: ventaDetail.fecha,
          estado: ventaDetail.estado,
          tipo_comprobante: (ventaDetail as any).tipo_comprobante,
          forma_pago: ventaDetail.forma_pago,
          total: ventaDetail.total,
          subtotal: ventaDetail.subtotal,
          descuento_porcentaje: (ventaDetail as any).descuento_porcentaje,
          recargo_porcentaje: (ventaDetail as any).recargo_porcentaje,
          observacion: ventaDetail.observacion,
          entregado: (ventaDetail as any).entregado,
          nombre_cliente: (ventaDetail as any).clientes?.nombre || "Consumidor Final",
          telefono: (ventaDetail as any).clientes?.telefono || undefined,
          domicilio: (ventaDetail as any).clientes?.domicilio || undefined,
          cuit: (ventaDetail as any).clientes?.cuit || undefined,
          vendedor: (ventaDetail as any).vendedor_id ? sellersMap[(ventaDetail as any).vendedor_id] || undefined : undefined,
          cuenta_transferencia_alias: (ventaDetail as any).cuenta_transferencia_alias || null,
          metodo_entrega: (ventaDetail as any).metodo_entrega || undefined,
          origen: (ventaDetail as any).origen === "tienda" ? "pedidos" : "historial",
        } : null}
        items={ventaDetailItems.map((item: any) => ({
          id: item.id,
          producto_id: item.producto_id,
          codigo: item.codigo || undefined,
          descripcion: item.descripcion || item.nombre_producto || "",
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          descuento: item.descuento,
          subtotal: item.subtotal,
          unidades_por_presentacion: item.unidades_por_presentacion ?? undefined,
        }))}
        pagos={(() => {
          const ingresos = ventaDetailMovs.filter((m: any) => m.tipo === "ingreso").map((m: any) => ({
            metodo: m.metodo_pago,
            monto: Math.abs(m.monto),
            cuenta_bancaria: m.cuenta_bancaria || null,
          }));
          if (ingresos.length > 0) return ingresos;
          // Fallback: build from venta stored amounts
          if (!ventaDetail) return [];
          const pagos: { metodo: string; monto: number; cuenta_bancaria?: string | null }[] = [];
          if ((ventaDetail as any).monto_efectivo > 0) pagos.push({ metodo: "Efectivo", monto: (ventaDetail as any).monto_efectivo });
          if ((ventaDetail as any).monto_transferencia > 0) pagos.push({ metodo: "Transferencia", monto: (ventaDetail as any).monto_transferencia });
          if (pagos.length === 0 && ventaDetail.forma_pago) pagos.push({ metodo: ventaDetail.forma_pago, monto: ventaDetail.total });
          return pagos;
        })()}
        footerExtra={ventaDetail && (ventaDetail.forma_pago === "Transferencia" || (ventaDetail.forma_pago === "Mixto" && (ventaDetail as any).monto_transferencia > 0)) && !(ventaDetail as any).cuenta_transferencia_alias && cajaCuentasBancarias.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Asignar cuenta:</span>
            {cajaCuentasBancarias.map((cb) => (
              <button
                key={cb.id}
                onClick={async () => {
                  const nombre = cb.nombre;
                  await supabase.from("ventas").update({ cuenta_transferencia_id: cb.id, cuenta_transferencia_alias: nombre }).eq("id", ventaDetail.id);
                  await supabase.from("caja_movimientos").update({ cuenta_bancaria: nombre }).eq("referencia_id", ventaDetail.id).eq("referencia_tipo", "venta").eq("metodo_pago", "Transferencia");
                  setVentaDetail({ ...ventaDetail, cuenta_transferencia_alias: nombre } as any);
                  refetchVentas();
                  showAdminToast(`Cuenta asignada: ${nombre}`, "success");
                }}
                className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium transition"
              >
                {cb.alias || cb.nombre}
              </button>
            ))}
          </div>
        ) : undefined}
      />
    </div>
  );
}
