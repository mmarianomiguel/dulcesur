"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { recalcFromVenta } from "@/lib/order-calc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
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
  Download,
  ChevronDown,
  DollarSign,
} from "lucide-react";

import { formatCurrency, todayARG, nowTimeARG, formatDatePDF } from "@/lib/formatters";
import { formatCuentaCanonica, type CuentaMasterRef } from "@/lib/cuenta-bancaria";

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

export interface TurnoCaja {
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
// Exported so other modules (e.g. ventas/page.tsx) can check turno status.
// Usage: import { getTurnoAbierto } from "@/app/(admin)/admin/caja/page";

export async function getTurnoAbierto(): Promise<TurnoCaja | null> {
  const { data } = await supabase
    .from("turnos_caja")
    .select("id, numero, fecha_apertura, hora_apertura, fecha_cierre, hora_cierre, operador, efectivo_inicial, efectivo_real, diferencia, notas, estado, created_at")
    .eq("estado", "abierto")
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data.length > 0 ? (data[0] as TurnoCaja) : null;
}

async function abrirTurno(efectivoInicial: number, operador: string): Promise<TurnoCaja> {
  // Verify no open turno exists (prevents concurrent opens from different browsers)
  const existing = await getTurnoAbierto();
  if (existing) throw new Error("Ya existe un turno abierto. Cerralo antes de abrir uno nuevo.");
  // Get next number and retry on unique constraint violation (race condition)
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: maxRow } = await supabase.from("turnos_caja").select("numero").order("numero", { ascending: false }).limit(1);
    const numero = maxRow && maxRow.length > 0 ? (maxRow[0] as { numero: number }).numero + 1 : 1;
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
    if (error) {
      // Unique constraint violation - retry with new number
      if (error.code === "23505" && attempt < maxRetries - 1) continue;
      throw new Error(error.message);
    }
    // Race condition guard: check if another turno was opened simultaneously
    const newTurno = data as TurnoCaja;
    const { data: openTurnos } = await supabase
      .from("turnos_caja")
      .select("id")
      .eq("estado", "abierto")
      .order("created_at", { ascending: true });
    if (openTurnos && openTurnos.length > 1) {
      // Another turno was opened simultaneously — delete ours (the newer one)
      await supabase.from("turnos_caja").delete().eq("id", newTurno.id);
      throw new Error("Otro usuario acaba de abrir un turno. Recargá la página.");
    }
    return newTurno;
  }
  throw new Error("No se pudo crear el turno después de varios intentos");
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

// ─── Resumen del día (compartido entre modal y PDF) ───
type ResumenDia = {
  totalVentas: number;
  cobradoTotal: number;
  cobradoEfectivo: number;
  cobradoTransf: number;
  cobradoOtros: number;
  ccGenerada: number;
  cobrosCCAnterior: number;
  cobrosCCEfvo: number;
  cobrosCCTransf: number;
  devolucionesNC: number;
  devolucionesAnul: number;
  devolucionesEfvo: number;
  devolucionesTransf: number;
  egresos: number;
  egresosEfvo: number;
  egresosTransf: number;
  efectivoFinal: number;
  transferenciaFinal: number;
  deudores: Array<{ numero: string; cliente: string; monto: number }>;
};

function calcResumenDia(
  ventas: Venta[],
  movs: CajaMovimiento[],
  cobroItems: Array<{ cobro_id: string; venta_id: string; monto_aplicado: number }> = []
): ResumenDia {
  const ventasConMov = new Set(movs.filter((m) => m.referencia_tipo === "venta" && m.tipo === "ingreso").map((m) => m.referencia_id));
  const ventasSinMov = ventas.filter((v) => !ventasConMov.has(v.id));

  // Para cada cobro, qué fracción de su monto aplica a ventas DEL TURNO
  // (esos cobros son intra-turno y deben contar como "Cobrado en caja", no como "CC anterior")
  const turnoVentaIds = new Set(ventas.map((v) => v.id));
  const cobroIntraRatio = new Map<string, number>(); // cobro_id -> fraccion (0-1) de monto aplicado a ventas del turno
  const itemsByCobro = new Map<string, Array<{ venta_id: string; monto_aplicado: number }>>();
  for (const it of cobroItems) {
    if (!itemsByCobro.has(it.cobro_id)) itemsByCobro.set(it.cobro_id, []);
    itemsByCobro.get(it.cobro_id)!.push({ venta_id: it.venta_id, monto_aplicado: it.monto_aplicado });
  }
  for (const [cobroId, items] of itemsByCobro.entries()) {
    const totalApp = items.reduce((a, x) => a + (x.monto_aplicado || 0), 0);
    const intraApp = items.filter((x) => turnoVentaIds.has(x.venta_id)).reduce((a, x) => a + (x.monto_aplicado || 0), 0);
    if (totalApp > 0) cobroIntraRatio.set(cobroId, intraApp / totalApp);
  }

  // Breakdown literal: movs reales + campos de la venta (monto_efectivo / monto_transferencia)
  let cobradoEfectivo = movs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Efectivo").reduce((a, m) => a + m.monto, 0)
    + ventasSinMov.filter((v) => v.forma_pago === "Efectivo").reduce((a, v) => a + v.total, 0)
    + ventasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_efectivo || 0), 0);
  let cobradoTransf = movs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia").reduce((a, m) => a + m.monto, 0)
    + ventasSinMov.filter((v) => v.forma_pago === "Transferencia").reduce((a, v) => a + v.total, 0)
    + ventasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_transferencia || 0), 0);

  const totalVentas = ventas.reduce((a, v) => a + v.total, 0);

  const deudores: Array<{ numero: string; cliente: string; monto: number }> = [];
  let ccGenerada = 0;
  for (const v of ventas) {
    const pagado = (v as any).monto_pagado || 0;
    const deuda = Math.max(0, v.total - pagado);
    if (deuda > 0.01) {
      deudores.push({
        numero: v.numero || "-",
        cliente: (v as any).clientes?.nombre || "Sin cliente",
        monto: deuda,
      });
      ccGenerada += deuda;
    }
  }
  deudores.sort((a, b) => b.monto - a.monto);

  // Cobrado total derivado del breakdown: cobradoEfvo + cobradoTransf (post-reclasificación
  // de cobros intra-turno). Se completa después del bloque de cobros más abajo.
  let cobradoTotal = 0;
  let cobradoOtros = 0;

  const isCobroCC = (m: CajaMovimiento) =>
    m.tipo === "ingreso" && (
      (m.referencia_tipo !== "venta" && (m.descripcion || "").includes("Cobro CC")) ||
      m.referencia_tipo === "cobro_saldo" ||
      m.referencia_tipo === "cobro"
    );
  // Reclasificar la porción intra-turno: si un cobro paga ventas de este turno,
  // esa porción es "Cobrado en caja" (no "CC anterior")
  let cobrosCCAnterior = 0;
  let cobrosCCEfvo = 0;
  let cobrosCCTransf = 0;
  for (const m of movs.filter(isCobroCC)) {
    const intraRatio = m.referencia_id ? (cobroIntraRatio.get(m.referencia_id) || 0) : 0;
    const intraAmt = m.monto * intraRatio;
    const ccAmt = m.monto - intraAmt;
    if (m.metodo_pago === "Efectivo") {
      cobradoEfectivo += intraAmt;
      cobrosCCEfvo += ccAmt;
    } else if (m.metodo_pago === "Transferencia") {
      cobradoTransf += intraAmt;
      cobrosCCTransf += ccAmt;
    } else {
      // método raro/null: tratar como efectivo por default
      cobradoEfectivo += intraAmt;
      cobrosCCEfvo += ccAmt;
    }
    cobrosCCAnterior += ccAmt;
  }

  // Total cobrado en caja = breakdown final (post-reclasificación). Cuadra exacto.
  cobradoTotal = cobradoEfectivo + cobradoTransf;
  cobradoOtros = 0;

  const ncMovs = movs.filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "nota_credito");
  const anulMovs = movs.filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "anulacion");
  const devolucionesNC = ncMovs.reduce((a, m) => a + Math.abs(m.monto), 0);
  const devolucionesAnul = anulMovs.reduce((a, m) => a + Math.abs(m.monto), 0);
  const devolMovs = [...ncMovs, ...anulMovs];
  const devolucionesEfvo = devolMovs.filter((m) => (m.metodo_pago || "Efectivo") === "Efectivo").reduce((a, m) => a + Math.abs(m.monto), 0);
  const devolucionesTransf = devolMovs.filter((m) => m.metodo_pago === "Transferencia").reduce((a, m) => a + Math.abs(m.monto), 0);

  const egMovs = movs.filter((m) => m.tipo === "egreso");
  const egresos = egMovs.reduce((a, m) => a + Math.abs(m.monto), 0);
  const egresosEfvo = egMovs.filter((m) => (m.metodo_pago || "Efectivo") === "Efectivo").reduce((a, m) => a + Math.abs(m.monto), 0);
  const egresosTransf = egMovs.filter((m) => m.metodo_pago === "Transferencia").reduce((a, m) => a + Math.abs(m.monto), 0);

  // Saldo final por método: cobrado del día + cobros CC anterior - egresos - devoluciones
  const efectivoFinal = cobradoEfectivo + cobrosCCEfvo - egresosEfvo - devolucionesEfvo;
  const transferenciaFinal = cobradoTransf + cobrosCCTransf - egresosTransf - devolucionesTransf;

  return {
    totalVentas, cobradoTotal, cobradoEfectivo, cobradoTransf, cobradoOtros,
    ccGenerada, cobrosCCAnterior, cobrosCCEfvo, cobrosCCTransf,
    devolucionesNC, devolucionesAnul, devolucionesEfvo, devolucionesTransf,
    egresos, egresosEfvo, egresosTransf,
    efectivoFinal, transferenciaFinal, deudores,
  };
}

// ─── Turno Historial Dialog (extracted to avoid duplication) ───

function TurnoHistorialDialog({
  open,
  onOpenChange,
  histDetail,
  histTurnos,
  histLoading,
  histMovs,
  histVentas,
  openHistDetail,
  setHistDetail,
  exportTurnoPDF,
  cuentasMaster,
  histCobroItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  histDetail: TurnoCaja | null;
  histTurnos: TurnoCaja[];
  histLoading: boolean;
  histMovs: CajaMovimiento[];
  histVentas: Venta[];
  openHistDetail: (t: TurnoCaja) => void;
  setHistDetail: (t: TurnoCaja | null) => void;
  exportTurnoPDF: (t: TurnoCaja, ventas: Venta[], movs: CajaMovimiento[], cobroItems: Array<{ cobro_id: string; venta_id: string; monto_aplicado: number }>) => void;
  cuentasMaster: CuentaMasterRef[];
  histCobroItems: Array<{ cobro_id: string; venta_id: string; monto_aplicado: number }>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
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
              <Button variant="outline" size="sm" onClick={() => exportTurnoPDF(histDetail, histVentas, histMovs, histCobroItems)}>
                Descargar PDF
              </Button>
            </div>

            {/* Identificación compacta en una línea */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground border-b pb-3">
              <span className="font-semibold text-foreground">Turno #{histDetail.numero}</span>
              <span>·</span>
              <span>{new Date(histDetail.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
              <span>·</span>
              <span>Operador <span className="text-foreground font-medium">{histDetail.operador}</span></span>
              <span>·</span>
              <span>{histDetail.hora_apertura?.substring(0, 5)} — {histDetail.hora_cierre?.substring(0, 5) || "?"}</span>
            </div>

            {(() => {
              const real = histDetail.efectivo_real || 0;
              const diff = histDetail.diferencia || 0;
              const esperado = real - diff;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="rounded-lg border p-2 sm:p-3 bg-emerald-50 dark:bg-emerald-950/20">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Ef. inicial</p>
                    <p className="font-bold text-sm sm:text-base">{formatCurrency(histDetail.efectivo_inicial)}</p>
                  </div>
                  <div className="rounded-lg border p-2 sm:p-3 bg-muted/30">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Esperado</p>
                    <p className="font-bold text-sm sm:text-base">{formatCurrency(esperado)}</p>
                  </div>
                  <div className="rounded-lg border p-2 sm:p-3 bg-blue-50 dark:bg-blue-950/20">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Ef. real (contado)</p>
                    <p className="font-bold text-sm sm:text-base">{formatCurrency(real)}</p>
                  </div>
                  <div className={`rounded-lg border p-2 sm:p-3 ${diff === 0 ? "bg-muted/30" : diff > 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Diferencia</p>
                    <p className={`font-bold text-sm sm:text-base ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : ""}`}>
                      {formatCurrency(diff)}
                    </p>
                  </div>
                </div>
              );
            })()}

            {histDetail.notas && histDetail.notas.trim().length > 1 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Notas</p>
                <p className="text-sm">{histDetail.notas}</p>
              </div>
            )}

            {/* Resumen del día — agrupado en 3 secciones para guiar la lectura */}
            {(() => {
              const r = calcResumenDia(histVentas, histMovs, histCobroItems);
              return (
                <div className="space-y-5">
                  {/* SECCIÓN 1: VENTAS DEL DÍA */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Ventas del día</p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex-1 rounded-lg border p-3.5">
                        <p className="text-xs text-muted-foreground">Total ventas</p>
                        <p className="font-bold text-lg sm:text-xl mt-0.5">{formatCurrency(r.totalVentas)}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{histVentas.length} ventas</p>
                      </div>
                      <span className="hidden sm:block text-2xl text-muted-foreground font-light">=</span>
                      <div className="flex-1 rounded-lg border p-3.5">
                        <p className="text-xs text-muted-foreground">Cobrado en caja</p>
                        <p className="font-bold text-lg sm:text-xl text-emerald-600 mt-0.5">{formatCurrency(r.cobradoTotal)}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">
                          Efvo {formatCurrency(r.cobradoEfectivo)} · Tr {formatCurrency(r.cobradoTransf)}
                          {r.cobradoOtros > 0 && ` · Otros ${formatCurrency(r.cobradoOtros)}`}
                        </p>
                      </div>
                      <span className="hidden sm:block text-2xl text-muted-foreground font-light">+</span>
                      <div className="flex-1 rounded-lg border p-3.5">
                        <p className="text-xs text-muted-foreground">CC generada</p>
                        <p className={`font-bold text-lg sm:text-xl mt-0.5 ${r.ccGenerada > 0 ? "text-orange-600" : "text-muted-foreground"}`}>{formatCurrency(r.ccGenerada)}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{r.deudores.length === 0 ? "sin deudas nuevas" : `${r.deudores.length} ${r.deudores.length === 1 ? "deudor" : "deudores"}`}</p>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 2: OTROS MOVIMIENTOS */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                      Otros movimientos <span className="normal-case font-normal">(no son parte de las ventas de hoy)</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-lg border p-3.5">
                        <p className="text-xs text-muted-foreground">Cobros CC anterior</p>
                        <p className={`font-bold text-lg sm:text-xl mt-0.5 ${r.cobrosCCAnterior > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>{formatCurrency(r.cobrosCCAnterior)}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">deuda vieja saldada</p>
                      </div>
                      <div className="rounded-lg border p-3.5">
                        <p className="text-xs text-muted-foreground">Egresos</p>
                        <p className={`font-bold text-lg sm:text-xl mt-0.5 ${r.egresos > 0 ? "text-red-500" : "text-muted-foreground"}`}>{formatCurrency(r.egresos)}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">retiros y gastos</p>
                      </div>
                      <div className="rounded-lg border p-3.5">
                        <p className="text-xs text-muted-foreground">Devoluciones</p>
                        <p className={`font-bold text-lg sm:text-xl mt-0.5 ${(r.devolucionesNC + r.devolucionesAnul) > 0 ? "text-red-500" : "text-muted-foreground"}`}>{formatCurrency(r.devolucionesNC + r.devolucionesAnul)}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">NC y anulaciones</p>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 3: EN CAJA AL CIERRE */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                      En caja al cierre <span className="normal-case font-normal">(plata que efectivamente quedó hoy)</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border-2 border-emerald-200 dark:border-emerald-900 p-4 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <p className="text-sm text-muted-foreground">Efectivo del día</p>
                        <p className="font-bold text-2xl text-emerald-700 dark:text-emerald-400 mt-1">{formatCurrency(r.efectivoFinal)}</p>
                        <p className="text-[11px] text-muted-foreground mt-2 leading-tight">
                          Cobrado {formatCurrency(r.cobradoEfectivo)} + CC anterior {formatCurrency(r.cobrosCCEfvo)}
                          {r.egresosEfvo > 0 && ` − Egresos ${formatCurrency(r.egresosEfvo)}`}
                          {r.devolucionesEfvo > 0 && ` − Devoluciones ${formatCurrency(r.devolucionesEfvo)}`}
                        </p>
                      </div>
                      <div className="rounded-lg border-2 border-blue-200 dark:border-blue-900 p-4 bg-blue-50/50 dark:bg-blue-950/20">
                        <p className="text-sm text-muted-foreground">Transferencias del día</p>
                        <p className="font-bold text-2xl text-blue-700 dark:text-blue-400 mt-1">{formatCurrency(r.transferenciaFinal)}</p>
                        <p className="text-[11px] text-muted-foreground mt-2 leading-tight">
                          Cobrado {formatCurrency(r.cobradoTransf)} + CC anterior {formatCurrency(r.cobrosCCTransf)}
                          {r.egresosTransf > 0 && ` − Egresos ${formatCurrency(r.egresosTransf)}`}
                          {r.devolucionesTransf > 0 && ` − Devoluciones ${formatCurrency(r.devolucionesTransf)}`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Desglose por método de pago — separado en Ventas + Cobros CC */}
              {(() => {
                const hVentasConMov = new Set(histMovs.filter((m) => m.referencia_tipo === "venta" && m.tipo === "ingreso").map((m) => m.referencia_id));
                const hVentasSinMov = histVentas.filter((v) => !hVentasConMov.has(v.id));
                const hEfectivo = histMovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Efectivo").reduce((a, m) => a + m.monto, 0)
                  + hVentasSinMov.filter((v) => v.forma_pago === "Efectivo").reduce((a, v) => a + v.total, 0)
                  + hVentasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_efectivo || 0), 0);
                const hTransf = histMovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia").reduce((a, m) => a + m.monto, 0)
                  + hVentasSinMov.filter((v) => v.forma_pago === "Transferencia").reduce((a, v) => a + v.total, 0)
                  + hVentasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_transferencia || 0), 0);
                const hPorCuenta: Record<string, number> = {};
                histMovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia")
                  .forEach((m) => { const c = formatCuentaCanonica((m as any).cuenta_bancaria, cuentasMaster) || "Sin asignar"; hPorCuenta[c] = (hPorCuenta[c] || 0) + m.monto; });
                for (const v of hVentasSinMov) {
                  const ef = (v as any).monto_efectivo || 0;
                  const cc = (v as any).monto_cuenta_corriente || 0;
                  const tr = (v as any).monto_transferencia || 0;
                  let mt = 0;
                  if (v.forma_pago === "Transferencia") mt = v.total;
                  else if (v.forma_pago === "Mixto") mt = tr > 0 ? tr : Math.max(0, v.total - ef - cc);
                  if (mt > 0) { const c = formatCuentaCanonica((v as any).cuenta_transferencia_alias, cuentasMaster) || "Sin asignar"; hPorCuenta[c] = (hPorCuenta[c] || 0) + mt; }
                }

                // Cobros CC anterior por método/cuenta
                const isCobroCC = (m: CajaMovimiento) =>
                  m.tipo === "ingreso" && (
                    (m.referencia_tipo !== "venta" && (m.descripcion || "").includes("Cobro CC")) ||
                    m.referencia_tipo === "cobro_saldo" ||
                    m.referencia_tipo === "cobro"
                  );
                const ccEfvo = histMovs.filter((m) => isCobroCC(m) && m.metodo_pago === "Efectivo").reduce((a, m) => a + m.monto, 0);
                const ccTr = histMovs.filter((m) => isCobroCC(m) && m.metodo_pago === "Transferencia").reduce((a, m) => a + m.monto, 0);
                const ccPorCuenta: Record<string, number> = {};
                histMovs.filter((m) => isCobroCC(m) && m.metodo_pago === "Transferencia")
                  .forEach((m) => { const c = formatCuentaCanonica((m as any).cuenta_bancaria, cuentasMaster) || "Sin asignar"; ccPorCuenta[c] = (ccPorCuenta[c] || 0) + m.monto; });

                if (hEfectivo === 0 && hTransf === 0 && ccEfvo === 0 && ccTr === 0) return <div />;
                return (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Desglose por Método</h4>
                    <div className="rounded-lg border divide-y">
                      {(hEfectivo > 0 || hTransf > 0) && (
                        <div className="p-3 space-y-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Ventas del día</p>
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
                                  <span className="text-muted-foreground truncate mr-2">→ {cuenta}</span>
                                  <span className="font-medium shrink-0">{formatCurrency(monto)}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                      {(ccEfvo > 0 || ccTr > 0) && (
                        <div className="p-3 space-y-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Cobros CC anterior</p>
                          {ccEfvo > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Efectivo</span>
                              <span className="font-semibold">{formatCurrency(ccEfvo)}</span>
                            </div>
                          )}
                          {ccTr > 0 && (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Transferencia</span>
                                <span className="font-semibold">{formatCurrency(ccTr)}</span>
                              </div>
                              {Object.entries(ccPorCuenta).sort((a, b) => b[1] - a[1]).map(([cuenta, monto]) => (
                                <div key={cuenta} className="flex justify-between text-xs pl-3">
                                  <span className="text-muted-foreground truncate mr-2">→ {cuenta}</span>
                                  <span className="font-medium shrink-0">{formatCurrency(monto)}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Devoluciones: Notas de crédito + Anulaciones (apiladas) */}
              <div className="space-y-3">
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
                            <span className="truncate mr-2">{m.descripcion} ({m.metodo_pago || "Efectivo"})</span>
                            <span className="shrink-0">-{formatCurrency(Math.abs(m.monto))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Deudores del día */}
            {(() => {
              const r = calcResumenDia(histVentas, histMovs, histCobroItems);
              if (r.deudores.length === 0) return null;
              return (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Deudores del día <span className="text-xs text-muted-foreground font-normal">({r.deudores.length})</span></h4>
                  <div className="border rounded-lg overflow-hidden bg-orange-50 dark:bg-orange-950/20">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-orange-200 dark:border-orange-900"><th className="text-left py-2 px-3">N°</th><th className="text-left py-2 px-3">Cliente</th><th className="text-right py-2 px-3">Adeuda</th></tr></thead>
                      <tbody>
                        {r.deudores.map((d) => (
                          <tr key={d.numero} className="border-b last:border-0 border-orange-100 dark:border-orange-900/50">
                            <td className="py-1.5 px-3 font-mono">{d.numero}</td>
                            <td className="py-1.5 px-3">{d.cliente}</td>
                            <td className="py-1.5 px-3 text-right font-semibold text-orange-700 dark:text-orange-400">{formatCurrency(d.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t border-orange-200 dark:border-orange-900 px-3 py-1.5 text-right text-xs font-bold text-orange-700 dark:text-orange-400">
                      Total adeudado: {formatCurrency(r.ccGenerada)}
                    </div>
                  </div>
                </div>
              );
            })()}

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
        ) : histLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : histTurnos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay turnos cerrados</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="sm:hidden divide-y">
              {histTurnos.map((t) => (
                <div key={t.id} className="py-3 px-4 flex items-center gap-3 hover:bg-muted/30 cursor-pointer" onClick={() => openHistDetail(t)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">#{t.numero}</span>
                      <span className="text-xs text-muted-foreground">{t.operador}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(t.fecha_apertura + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })} · {t.hora_apertura?.substring(0, 5)} - {t.hora_cierre?.substring(0, 5) || "?"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{formatCurrency(t.efectivo_real || 0)}</p>
                    <p className={`text-xs font-medium ${(t.diferencia || 0) > 0 ? "text-emerald-600" : (t.diferencia || 0) < 0 ? "text-red-500" : "text-muted-foreground"}`}>{formatCurrency(t.diferencia || 0)}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Component ───

export default function CajaPage() {
  const [today, setToday] = useState(todayARG());
  const currentUser = useCurrentUser();

  // Keep today fresh if the page stays open past midnight
  useEffect(() => {
    const interval = setInterval(() => {
      const now = todayARG();
      if (now !== today) setToday(now);
    }, 60_000);
    return () => clearInterval(interval);
  }, [today]);

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
      const { data } = await supabase.from("caja_movimientos").select("*").gte("fecha", fechaApertura).lte("fecha", today).order("created_at", { ascending: false }).range(0, 49999);
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
    // Server-side filter NC + anuladas to reduce payload
    let query = supabase
      .from("ventas")
      .select("*, clientes(nombre)")
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .neq("estado", "anulada")
      .order("created_at", { ascending: false });
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
      const d = new Date(v.created_at);
      const isWebOrder = (v as any).origen === "tienda";
      if (isWebOrder) {
        // Exclude web orders not yet delivered/paid (pickup or delivery pending)
        const PENDING = new Set(["pendiente", "armado", "confirmado"]);
        if (PENDING.has(((v as any).estado || "").toLowerCase())) return false;
      } else {
        if (d < aperturaDate) return false;
      }
      if (cierreDate && d > cierreDate) return false;
      return true;
    });
  }, [today, turno]);
  const { data: ventas, loading: ventasLoading, refetch: refetchVentas } = useAsyncData({
    fetcher: fetchVentas,
    initialData: [] as Venta[],
    deps: [turno],
  });

  // Fetch CC entries for today (partial payment remainders + full CC sales)
  const fetchCCEntries = useCallback(async () => {
    if (!turno) return [];
    const fechaApertura = turno.fecha_apertura || today;
    // Fetch both debe (debts) and haber (credits from NC) so the CC card
    // reflects the net effect per client for the day.
    let query = supabase.from("cuenta_corriente").select("debe, haber, cliente_id, comprobante, descripcion, forma_pago, venta_id");
    if (fechaApertura === today) {
      query = query.eq("fecha", today);
    } else {
      query = query.gte("fecha", fechaApertura).lte("fecha", today);
    }
    const { data } = await query.range(0, 49999);
    return data || [];
  }, [today, turno]);
  const { data: ccEntries, refetch: refetchCC } = useAsyncData({
    fetcher: fetchCCEntries,
    initialData: [] as { debe: number; haber: number; cliente_id: string; comprobante: string; descripcion: string; forma_pago: string; venta_id: string }[],
    deps: [turno],
  });

  // Fetch NC (Nota de Crédito) amounts linked to today's ventas
  const fetchNCEntries = useCallback(async () => {
    if (!turno) return [];
    const fechaApertura = turno.fecha_apertura || today;
    let query = supabase.from("ventas").select("id, remito_origen_id, total").ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada").not("remito_origen_id", "is", null);
    if (fechaApertura === today) {
      query = query.eq("fecha", today);
    } else {
      query = query.gte("fecha", fechaApertura).lte("fecha", today);
    }
    const { data } = await query;
    return (data || []) as { id: string; remito_origen_id: string; total: number }[];
  }, [today, turno]);
  const { data: ncEntries } = useAsyncData({
    fetcher: fetchNCEntries,
    initialData: [] as { id: string; remito_origen_id: string; total: number }[],
    deps: [turno],
  });

  // ─── Expandable stat cards ───
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [ventaOrigenFilter, setVentaOrigenFilter] = useState<"todas" | "pos" | "envio" | "retiro">("todas");
  const [ventasTab, setVentasTab] = useState<"ventas" | "entregas">("ventas");
  const [movsOpen, setMovsOpen] = useState(false);
  const toggleCard = (key: string) => setExpandedCard((prev) => prev === key ? null : key);

  // ─── Dialogs ───
  const movDialog = useDialog<"ingreso" | "egreso">();
  const cierreDialog = useDialog();
  const abrirDialog = useDialog();
  const [movForm, setMovForm] = useState({ descripcion: "", metodo_pago: "Efectivo", monto: 0, proveedor: "", sub_tipo: "gasto" });
  const [cierreForm, setCierreForm] = useState({ efectivo_real: 0, notas: "" });
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([]);

  // Sellers map for display
  const [sellersMap, setSellersMap] = useState<Record<string, string>>({});
  // Sale detail for viewing
  const [ventaDetailOpen, setVentaDetailOpen] = useState(false);
  const [cajaCuentasBancarias, setCajaCuentasBancarias] = useState<{ id: string; nombre: string; alias: string }[]>([]);
  useEffect(() => {
    // Batch reference fetches: proveedores + usuarios + cuentas bancarias in one parallel call
    Promise.all([
      supabase.from("proveedores").select("id, nombre").order("nombre"),
      supabase.from("usuarios").select("id, nombre").eq("activo", true),
      supabase.from("cuentas_bancarias").select("id, nombre, alias").eq("activo", true).order("nombre"),
    ]).then(([provRes, userRes, cbRes]) => {
      if (provRes.error) console.error("Error cargando proveedores:", provRes.error);
      setProveedores(provRes.data || []);
      if (userRes.error) console.error("Error cargando usuarios:", userRes.error);
      const map: Record<string, string> = {};
      (userRes.data || []).forEach((u: any) => { map[u.id] = u.nombre; });
      setSellersMap(map);
      if (cbRes.error) console.error("Error cargando cuentas bancarias:", cbRes.error);
      setCajaCuentasBancarias(cbRes.data || []);
    });
  }, []);
  const [ventaDetail, setVentaDetail] = useState<Venta | null>(null);
  const [ventaDetailItems, setVentaDetailItems] = useState<any[]>([]);
  const [ventaDetailMovs, setVentaDetailMovs] = useState<any[]>([]);
  const [ventaDetailNCs, setVentaDetailNCs] = useState<{ numero: number; total: number; items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[] }[]>([]);

  const openVentaDetail = async (v: Venta) => {
    setVentaDetailItems([]);
    setVentaDetailMovs([]);
    setVentaDetailNCs([]);
    setVentaDetail(v);
    setVentaDetailOpen(true);
    const [{ data: items }, { data: movs }, { data: ccRows }, { data: ncVentas }] = await Promise.all([
      supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at").range(0, 4999),
      supabase.from("caja_movimientos").select("id, tipo, descripcion, metodo_pago, monto, referencia_id, referencia_tipo, created_at, cuenta_bancaria").eq("referencia_id", v.id).order("created_at").range(0, 999),
      supabase.from("cuenta_corriente").select("debe").eq("venta_id", v.id).gt("debe", 0).range(0, 999),
      supabase.from("ventas").select("id, numero, total, venta_items(descripcion, cantidad, precio_unitario, subtotal)").eq("remito_origen_id", v.id).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada").range(0, 999),
    ]);
    setVentaDetailItems(items || []);
    setVentaDetailNCs((ncVentas || []).map((nc: any) => ({
      numero: nc.numero,
      total: nc.total,
      items: (nc.venta_items || []).map((i: any) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_unitario, subtotal: i.subtotal })),
    })));
    const ccTotal = (ccRows || []).reduce((a: number, r: any) => a + (r.debe || 0), 0);
    const movsWithCC = [...(movs || [])];
    if (ccTotal > 0) {
      movsWithCC.push({ id: "cc-synthetic", tipo: "ingreso", descripcion: "Cuenta Corriente", metodo_pago: "Cuenta Corriente", monto: ccTotal, referencia_id: v.id, referencia_tipo: "venta", created_at: v.created_at || "", cuenta_bancaria: null } as any);
    }
    setVentaDetailMovs(movsWithCC);
  };

  // History
  const [histOpen, setHistOpen] = useState(false);
  const [histTurnos, setHistTurnos] = useState<TurnoCaja[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histDetail, setHistDetail] = useState<TurnoCaja | null>(null);
  const [histMovs, setHistMovs] = useState<CajaMovimiento[]>([]);
  const [histVentas, setHistVentas] = useState<Venta[]>([]);
  const [histCobroItems, setHistCobroItems] = useState<Array<{ cobro_id: string; venta_id: string; monto_aplicado: number }>>([]);

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
    setMovForm({ descripcion: "", metodo_pago: "Efectivo", monto: 0, proveedor: "", sub_tipo: "gasto" });
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
        await cajaService.registrarEgreso({ ...opts, subTipo: movForm.sub_tipo });
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
    setCierreForm({ efectivo_real: 0, notas: "" });
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

    // If turno crosses midnight (or spans multiple days), fetch full range
    const fechaCierre = t.fecha_cierre || fecha;

    const [{ data: movs }, { data: vts }] = await Promise.all([
      supabase.from("caja_movimientos").select("id, tipo, descripcion, metodo_pago, monto, hora, fecha, referencia_id, referencia_tipo, created_at, cuenta_bancaria").gte("fecha", fecha).lte("fecha", fechaCierre).order("hora", { ascending: false }).range(0, 49999),
      supabase.from("ventas").select("id, numero, fecha, total, subtotal, descuento_porcentaje, recargo_porcentaje, forma_pago, tipo_comprobante, vendedor_id, origen, estado, created_at, monto_efectivo, monto_transferencia, monto_pagado, cuenta_transferencia_alias, clientes(nombre)").gte("fecha", fecha).lte("fecha", fechaCierre).not("tipo_comprobante", "ilike", "Nota de Crédito%").neq("estado", "anulada").order("created_at", { ascending: false }).range(0, 49999),
    ]);

    // Cobro items para detectar cobros que aplican a ventas del mismo turno
    const cobroIds = (movs || []).filter((m: any) => m.referencia_tipo === "cobro" && m.referencia_id).map((m: any) => m.referencia_id);
    let cobroItemsList: Array<{ cobro_id: string; venta_id: string; monto_aplicado: number }> = [];
    if (cobroIds.length > 0) {
      const { data: items } = await supabase.from("cobro_items").select("cobro_id, venta_id, monto_aplicado").in("cobro_id", cobroIds).range(0, 9999);
      cobroItemsList = (items || []) as any;
    }

    // Filter by turno time range using Date comparison
    const filteredMovs = (movs || []).filter((m: any) => {
      const d = new Date(m.created_at);
      if (d < aperturaDate) return false;
      if (cierreDate && d > cierreDate) return false;
      return true;
    });
    const filteredVts = (vts || []).filter((v: any) => {
      const d = new Date(v.created_at);
      const isWebOrder = v.origen === "tienda";
      if (isWebOrder) {
        const PENDING = new Set(["pendiente", "armado", "confirmado"]);
        if (PENDING.has((v.estado || "").toLowerCase())) return false;
      } else {
        if (d < aperturaDate) return false;
      }
      if (cierreDate && d > cierreDate) return false;
      return true;
    });
    setHistMovs(filteredMovs as CajaMovimiento[]);
    setHistVentas(filteredVts as unknown as Venta[]);
    setHistCobroItems(cobroItemsList);
  };

  // ─── Export turno to PDF ───
  const exportTurnoPDF = async (
    t: TurnoCaja,
    tvts: Venta[],
    tmovs: CajaMovimiento[],
    cobroItems: Array<{ cobro_id: string; venta_id: string; monto_aplicado: number }> = []
  ) => {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;
    const fmtCur = formatCurrency;
    // jsPDF Helvetica embebido no soporta U+2192 (→) ni U+2014 (—) limpiamente:
    // los renderiza como bytes sueltos espaciados ("V e n t a"). Reemplazamos a ASCII.
    const sanitize = (s: string) => s.replace(/→/g, ">").replace(/[—–]/g, "-");

    // Header
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("Resumen de Turno de Caja", margin, y);
    y += 8;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Turno #${t.numero} - ${formatDatePDF(t.fecha_apertura)}`, margin, y);
    y += 5;
    pdf.text(`Operador: ${t.operador}`, margin, y);
    y += 5;
    pdf.text(`Horario: ${t.hora_apertura?.substring(0, 5)} - ${t.hora_cierre?.substring(0, 5) || "En curso"}`, margin, y);
    y += 10;

    // Efectivo summary
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("Resumen de Efectivo", margin, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");

    const efReal = t.efectivo_real || 0;
    const efDiff = t.diferencia || 0;
    const efEsperado = efReal - efDiff;
    const efRows: Array<[string, string, [number, number, number] | null]> = [
      ["Efectivo Inicial", fmtCur(t.efectivo_inicial), null],
      ["Esperado", fmtCur(efEsperado), null],
      ["Efectivo Real Contado", fmtCur(efReal), null],
      ["Diferencia", fmtCur(efDiff), efDiff < 0 ? [220, 38, 38] : efDiff > 0 ? [22, 163, 74] : null],
    ];
    for (const [label, val, color] of efRows) {
      pdf.text(label, margin, y);
      if (color) pdf.setTextColor(color[0], color[1], color[2]);
      pdf.text(val, w - margin, y, { align: "right" });
      pdf.setTextColor(0, 0, 0);
      y += 5;
    }
    if (t.notas) {
      y += 2;
      pdf.setFont("helvetica", "italic");
      pdf.text(`Notas: ${sanitize(t.notas)}`, margin, y);
      pdf.setFont("helvetica", "normal");
      y += 7;
    } else {
      y += 5;
    }

    // Resumen del día — agrupado en 3 secciones para guiar la lectura
    const resumen = calcResumenDia(tvts, tmovs, cobroItems);
    const sectionTitle = (text: string) => {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(110);
      pdf.text(text.toUpperCase(), margin, y);
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      y += 4;
    };
    const drawRow = (label: string, val: number, color: [number, number, number] | null, indent = 5) => {
      pdf.text(label, margin + indent, y);
      if (color) pdf.setTextColor(color[0], color[1], color[2]);
      pdf.text(fmtCur(val), w - margin, y, { align: "right" });
      pdf.setTextColor(0, 0, 0);
      y += 5;
    };

    pdf.setDrawColor(200);
    pdf.line(margin, y, w - margin, y);
    y += 5;

    // SECCIÓN 1: VENTAS DEL DÍA
    sectionTitle("Ventas del dia");
    drawRow(`Total ventas (${tvts.length})`, resumen.totalVentas, null);
    pdf.setFontSize(8); pdf.setTextColor(140);
    pdf.text("=", margin + 1, y - 4);
    pdf.setTextColor(0, 0, 0); pdf.setFontSize(10);
    drawRow("Cobrado en caja", resumen.cobradoTotal, [22, 163, 74]);
    pdf.setFontSize(8); pdf.setTextColor(140);
    pdf.text("+", margin + 1, y - 4);
    pdf.setTextColor(0, 0, 0); pdf.setFontSize(10);
    drawRow("CC generada hoy", resumen.ccGenerada, resumen.ccGenerada > 0 ? [234, 88, 12] : null);
    y += 3;

    // SECCIÓN 2: OTROS MOVIMIENTOS
    sectionTitle("Otros movimientos (no son parte de las ventas de hoy)");
    drawRow("Cobros de CC anterior", resumen.cobrosCCAnterior, resumen.cobrosCCAnterior > 0 ? [22, 163, 74] : null);
    drawRow("Egresos (retiros, gastos, pagos)", resumen.egresos, resumen.egresos > 0 ? [220, 38, 38] : null);
    drawRow("Devoluciones (NC + anulaciones)", resumen.devolucionesNC + resumen.devolucionesAnul, (resumen.devolucionesNC + resumen.devolucionesAnul) > 0 ? [220, 38, 38] : null);
    y += 3;

    // SECCIÓN 3: EN CAJA AL CIERRE
    sectionTitle("En caja al cierre (plata que efectivamente quedo hoy)");
    pdf.setFont("helvetica", "bold");
    pdf.text("Efectivo del dia", margin + 5, y);
    pdf.setTextColor(22, 163, 74);
    pdf.text(fmtCur(resumen.efectivoFinal), w - margin, y, { align: "right" });
    pdf.setTextColor(0, 0, 0);
    y += 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    pdf.text(
      sanitize(`Cobrado ${fmtCur(resumen.cobradoEfectivo)} + CC anterior ${fmtCur(resumen.cobrosCCEfvo)}` +
        (resumen.egresosEfvo > 0 ? ` - Egresos ${fmtCur(resumen.egresosEfvo)}` : "") +
        (resumen.devolucionesEfvo > 0 ? ` - Devoluciones ${fmtCur(resumen.devolucionesEfvo)}` : "")),
      margin + 10, y
    );
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    y += 6;
    pdf.setFont("helvetica", "bold");
    pdf.text("Transferencias del dia", margin + 5, y);
    pdf.setTextColor(37, 99, 235);
    pdf.text(fmtCur(resumen.transferenciaFinal), w - margin, y, { align: "right" });
    pdf.setTextColor(0, 0, 0);
    y += 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110);
    pdf.text(
      sanitize(`Cobrado ${fmtCur(resumen.cobradoTransf)} + CC anterior ${fmtCur(resumen.cobrosCCTransf)}` +
        (resumen.egresosTransf > 0 ? ` - Egresos ${fmtCur(resumen.egresosTransf)}` : "") +
        (resumen.devolucionesTransf > 0 ? ` - Devoluciones ${fmtCur(resumen.devolucionesTransf)}` : "")),
      margin + 10, y
    );
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    y += 5;

    // Payment method breakdown
    pdf.setDrawColor(200);
    pdf.line(margin, y, w - margin, y);
    y += 5;
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("Desglose por Metodo de Pago", margin, y);
    y += 7;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");

    const pdfVentasConMov = new Set(
      tmovs.filter((m) => m.referencia_tipo === "venta" && m.tipo === "ingreso").map((m) => m.referencia_id)
    );
    const pdfUnpaidEstados = new Set(["pendiente", "armado", "confirmado"]);
    const pdfVentasSinMov = tvts.filter((v) => !pdfVentasConMov.has(v.id) && !pdfUnpaidEstados.has((v.estado || "").toLowerCase()));
    const pdfMovEfectivo = tmovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Efectivo").reduce((a, m) => a + m.monto, 0)
      + pdfVentasSinMov.filter((v) => v.forma_pago === "Efectivo").reduce((a, v) => a + v.total, 0)
      + pdfVentasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_efectivo || 0), 0);
    const pdfMovTransf = tmovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia").reduce((a, m) => a + m.monto, 0)
      + pdfVentasSinMov.filter((v) => v.forma_pago === "Transferencia").reduce((a, v) => a + v.total, 0)
      + pdfVentasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_transferencia || 0), 0);

    // Sub-bloque: Ventas del día
    if (pdfMovEfectivo > 0 || pdfMovTransf > 0) {
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(110);
      pdf.text("Ventas del dia", margin + 5, y);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "normal");
      y += 5;
      if (pdfMovEfectivo > 0) { pdf.text("Efectivo", margin + 8, y); pdf.text(fmtCur(pdfMovEfectivo), w - margin, y, { align: "right" }); y += 5; }
      if (pdfMovTransf > 0) {
        pdf.text("Transferencia", margin + 8, y); pdf.text(fmtCur(pdfMovTransf), w - margin, y, { align: "right" }); y += 5;
        const pdfPorCuenta: Record<string, number> = {};
        tmovs.filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia")
          .forEach((m) => { const c = formatCuentaCanonica((m as any).cuenta_bancaria, cajaCuentasBancarias) || "Sin asignar"; pdfPorCuenta[c] = (pdfPorCuenta[c] || 0) + m.monto; });
        for (const v of pdfVentasSinMov) {
          const mt = v.forma_pago === "Transferencia" ? v.total : v.forma_pago === "Mixto" ? ((v as any).monto_transferencia || 0) : 0;
          if (mt > 0) { const c = formatCuentaCanonica((v as any).cuenta_transferencia_alias, cajaCuentasBancarias) || "Sin asignar"; pdfPorCuenta[c] = (pdfPorCuenta[c] || 0) + mt; }
        }
        pdf.setFontSize(9);
        for (const [cuenta, monto] of Object.entries(pdfPorCuenta).sort((a, b) => b[1] - a[1])) {
          pdf.text(sanitize(`> ${cuenta}`), margin + 13, y); pdf.text(fmtCur(monto), w - margin, y, { align: "right" }); y += 4;
        }
        pdf.setFontSize(10);
      }
    }

    // Sub-bloque: Cobros CC anterior
    if (resumen.cobrosCCEfvo > 0 || resumen.cobrosCCTransf > 0) {
      y += 1;
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(110);
      pdf.text("Cobros CC anterior", margin + 5, y);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "normal");
      y += 5;
      if (resumen.cobrosCCEfvo > 0) { pdf.text("Efectivo", margin + 8, y); pdf.text(fmtCur(resumen.cobrosCCEfvo), w - margin, y, { align: "right" }); y += 5; }
      if (resumen.cobrosCCTransf > 0) {
        pdf.text("Transferencia", margin + 8, y); pdf.text(fmtCur(resumen.cobrosCCTransf), w - margin, y, { align: "right" }); y += 5;
        const ccPorCuenta: Record<string, number> = {};
        const isCobroCC = (m: CajaMovimiento) =>
          m.tipo === "ingreso" && (
            (m.referencia_tipo !== "venta" && (m.descripcion || "").includes("Cobro CC")) ||
            m.referencia_tipo === "cobro_saldo" ||
            m.referencia_tipo === "cobro"
          );
        tmovs.filter((m) => isCobroCC(m) && m.metodo_pago === "Transferencia")
          .forEach((m) => { const c = formatCuentaCanonica((m as any).cuenta_bancaria, cajaCuentasBancarias) || "Sin asignar"; ccPorCuenta[c] = (ccPorCuenta[c] || 0) + m.monto; });
        pdf.setFontSize(9);
        for (const [cuenta, monto] of Object.entries(ccPorCuenta).sort((a, b) => b[1] - a[1])) {
          pdf.text(sanitize(`> ${cuenta}`), margin + 13, y); pdf.text(fmtCur(monto), w - margin, y, { align: "right" }); y += 4;
        }
        pdf.setFontSize(10);
      }
    }
    y += 5;

    // Deudores del día
    if (resumen.deudores.length > 0) {
      if (y > 250) { pdf.addPage(); y = 20; }
      pdf.setDrawColor(200);
      pdf.line(margin, y, w - margin, y);
      y += 5;
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(234, 88, 12);
      pdf.text(`Deudores del dia (${resumen.deudores.length})`, margin, y);
      pdf.setTextColor(0, 0, 0);
      y += 7;
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.text("N°", margin, y);
      pdf.text("Cliente", margin + 35, y);
      pdf.text("Adeuda", w - margin, y, { align: "right" });
      y += 2;
      pdf.setDrawColor(220);
      pdf.line(margin, y, w - margin, y);
      y += 4;
      pdf.setFont("helvetica", "normal");
      for (const d of resumen.deudores) {
        if (y > 270) { pdf.addPage(); y = 20; }
        pdf.text(d.numero, margin, y);
        pdf.text(sanitize(d.cliente.substring(0, 50)), margin + 35, y);
        pdf.setTextColor(234, 88, 12);
        pdf.text(fmtCur(d.monto), w - margin, y, { align: "right" });
        pdf.setTextColor(0, 0, 0);
        y += 4.5;
      }
      y += 2;
      pdf.setDrawColor(180);
      pdf.line(margin, y, w - margin, y);
      y += 4;
      pdf.setFont("helvetica", "bold");
      pdf.text("Total adeudado:", margin + 35, y);
      pdf.setTextColor(234, 88, 12);
      pdf.text(fmtCur(resumen.ccGenerada), w - margin, y, { align: "right" });
      pdf.setTextColor(0, 0, 0);
      y += 8;
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
      y += 2;
      pdf.setDrawColor(220);
      pdf.line(margin, y, w - margin, y);
      y += 4;
      pdf.setFont("helvetica", "normal");

      for (const v of tvts) {
        if (y > 270) { pdf.addPage(); y = 20; }
        pdf.text(v.numero || "-", margin, y);
        pdf.text(sanitize(((v as any).clientes?.nombre || "-").substring(0, 25)), margin + 35, y);
        pdf.text(v.forma_pago || "-", margin + 85, y);
        pdf.text(fmtCur(v.total), w - margin, y, { align: "right" });
        y += 4.5;
      }
      y += 3;
      pdf.setFont("helvetica", "bold");
      pdf.text("Total Ventas:", margin + 85, y);
      pdf.text(fmtCur(tvts.reduce((a, v) => a + v.total, 0)), w - margin, y, { align: "right" });
      y += 8;
    }

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
      // Columnas: Hora 0-18 | Descripcion 18-118 (100mm) | Metodo 120-150 | Monto right
      const colDesc = margin + 18;
      const colMetodo = margin + 120;
      pdf.setFont("helvetica", "bold");
      pdf.text("Hora", margin, y);
      pdf.text("Descripcion", colDesc, y);
      pdf.text("Metodo", colMetodo, y);
      pdf.text("Monto", w - margin, y, { align: "right" });
      y += 2;
      pdf.setDrawColor(220);
      pdf.line(margin, y, w - margin, y);
      y += 4;
      pdf.setFont("helvetica", "normal");

      // Subtotales en una pasada
      let totalIng = 0, totalEgr = 0;
      const ingPorMetodo: Record<string, number> = {};
      for (const m of tmovs) {
        if (y > 270) { pdf.addPage(); y = 20; }
        pdf.text(m.hora?.substring(0, 5) || "-", margin, y);
        pdf.text(sanitize((m.descripcion || "-").substring(0, 60)), colDesc, y);
        pdf.text(m.metodo_pago || "-", colMetodo, y);
        const prefix = m.tipo === "ingreso" ? "+" : "-";
        if (m.tipo === "ingreso") {
          pdf.setTextColor(22, 163, 74); // verde-600
          totalIng += Math.abs(m.monto);
          const k = m.metodo_pago || "Otro";
          ingPorMetodo[k] = (ingPorMetodo[k] || 0) + Math.abs(m.monto);
        } else {
          pdf.setTextColor(220, 38, 38); // rojo-600
          totalEgr += Math.abs(m.monto);
        }
        pdf.text(`${prefix}${fmtCur(Math.abs(m.monto))}`, w - margin, y, { align: "right" });
        pdf.setTextColor(0, 0, 0);
        y += 4.5;
      }

      // Totales al final
      if (y > 260) { pdf.addPage(); y = 20; }
      y += 2;
      pdf.setDrawColor(180);
      pdf.line(margin, y, w - margin, y);
      y += 5;
      pdf.setFont("helvetica", "bold");
      pdf.text("Total ingresos:", colDesc, y);
      pdf.setTextColor(22, 163, 74);
      pdf.text(`+${fmtCur(totalIng)}`, w - margin, y, { align: "right" });
      pdf.setTextColor(0, 0, 0);
      y += 5;
      // Desglose de ingresos por método (inline, fontSize chico)
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      const ingMetodos = Object.entries(ingPorMetodo).sort((a, b) => b[1] - a[1]);
      if (ingMetodos.length > 0) {
        const ingLine = ingMetodos.map(([k, v]) => `${k}: ${fmtCur(v)}`).join("  -  ");
        pdf.text(ingLine, colDesc + 4, y);
        y += 5;
      }
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.text("Total egresos:", colDesc, y);
      pdf.setTextColor(220, 38, 38);
      pdf.text(`-${fmtCur(totalEgr)}`, w - margin, y, { align: "right" });
      pdf.setTextColor(0, 0, 0);
      y += 5;
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
    cobrosCCTotal,
    cobrosCCEfectivo,
    cobrosCCTransferencia,
    totalVentas,
    depositos,
    gastos,
    notasCreditoEgresos,
    anulaciones,
    retiros,
    efectivoEsperado,
    efectivoInicial,
    egresosDetalle,
    ingresosDetalle,
    ventasDesglose,
    totalTransferSurcharge,
    ncByVenta,
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
    // Ventas without caja_movimientos — exclude orders pending payment confirmation
    const UNPAID_ESTADOS = new Set(["pendiente", "armado", "confirmado"]);
    const ventasSinMov = ventas.filter((v) =>
      !ventasConMovimientos.has(v.id) && !UNPAID_ESTADOS.has((v.estado || "").toLowerCase())
    );

    // Efectivo: from caja_movimientos + ventas sin movimientos
    const ventasEfectivo = movPorMetodo("Efectivo")
      + ventasSinMov.filter((v) => v.forma_pago === "Efectivo").reduce((a, v) => a + v.total, 0)
      + ventasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => a + ((v as any).monto_efectivo || 0), 0);

    // Transferencia: from caja_movimientos + ventas sin movimientos
    // For Mixto online: transferencia = total - efectivo (includes recargo)
    const ventasTransferencia = movPorMetodo("Transferencia")
      + ventasSinMov.filter((v) => v.forma_pago === "Transferencia").reduce((a, v) => a + v.total, 0)
      + ventasSinMov.filter((v) => v.forma_pago === "Mixto").reduce((a, v) => {
        const tr = (v as any).monto_transferencia || 0;
        if (tr > 0) return a + tr;
        // Fallback: total - efectivo - cc (for older records without monto_transferencia)
        const ef = (v as any).monto_efectivo || 0;
        const cc = (v as any).monto_cuenta_corriente || 0;
        const rest = v.total - ef - cc;
        return a + (rest > 0 ? rest : 0);
      }, 0);

    // Group transfers by bank account
    const transferenciaPorCuenta: Record<string, number> = {};
    const normalizarCuenta = (raw: string | null | undefined) =>
      (raw || "Sin asignar").split(" — ")[0].split(" - ")[0].trim();

    movements
      .filter((m) => m.tipo === "ingreso" && m.referencia_tipo === "venta" && m.metodo_pago === "Transferencia")
      .forEach((m) => {
        const cuenta = normalizarCuenta((m as any).cuenta_bancaria);
        transferenciaPorCuenta[cuenta] = (transferenciaPorCuenta[cuenta] || 0) + m.monto;
      });
    // Also include ventas sin movimientos in bank account grouping
    for (const v of ventasSinMov) {
      const ef = (v as any).monto_efectivo || 0;
      const cc = (v as any).monto_cuenta_corriente || 0;
      const tr = (v as any).monto_transferencia || 0;
      let montoTransf = 0;
      if (v.forma_pago === "Transferencia") montoTransf = v.total;
      else if (v.forma_pago === "Mixto") montoTransf = tr > 0 ? tr : Math.max(0, v.total - ef - cc);
      if (montoTransf > 0) {
        const cuenta = normalizarCuenta((v as any).cuenta_transferencia_alias);
        transferenciaPorCuenta[cuenta] = (transferenciaPorCuenta[cuenta] || 0) + montoTransf;
      }
    }

    // totalVentas is computed AFTER ventasDesglose (below) as the sum of actual money flow

    // Cobros de cuenta corriente del día (pagos que reducen deuda CC)
    const cobrosCC = movements.filter((m) => m.tipo === "ingreso" && (
      (m.referencia_tipo !== "venta" && (m.descripcion || "").includes("Cobro CC")) ||
      m.referencia_tipo === "cobro_saldo" ||
      m.referencia_tipo === "cobro"
    ));
    const cobrosCCTotal = cobrosCC.reduce((a, m) => a + m.monto, 0);
    const cobrosCCEfectivo = cobrosCC.filter((m) => m.metodo_pago === "Efectivo").reduce((a, m) => a + m.monto, 0);
    const cobrosCCTransferencia = cobrosCC.filter((m) => m.metodo_pago === "Transferencia").reduce((a, m) => a + m.monto, 0);

    const depositosEfectivo = movements
      .filter((m) => m.tipo === "ingreso" && m.metodo_pago === "Efectivo" && m.referencia_tipo !== "venta" && m.referencia_tipo !== "cobro_saldo" && m.referencia_tipo !== "cobro")
      .reduce((a, m) => a + m.monto, 0);
    const depositosOtros = movements
      .filter((m) => m.tipo === "ingreso" && m.metodo_pago !== "Efectivo" && m.referencia_tipo !== "venta" && m.referencia_tipo !== "cobro_saldo" && m.referencia_tipo !== "cobro")
      .reduce((a, m) => a + m.monto, 0);
    const depositos = depositosEfectivo + depositosOtros;

    const gastos = movements
      .filter((m) => m.tipo === "egreso" && (
        (m as any).sub_tipo
          ? (m as any).sub_tipo === "gasto"
          : (m.descripcion || "").toLowerCase().includes("gasto")
      ))
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const notasCreditoEgresos = movements
      .filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "nota_credito" && m.metodo_pago === "Efectivo")
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const anulaciones = movements
      .filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "anulacion" && m.metodo_pago === "Efectivo")
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const retiros = movements
      .filter((m) => m.tipo === "egreso" && (
        (m as any).sub_tipo
          ? (m as any).sub_tipo !== "gasto"
          : !(m.descripcion || "").toLowerCase().includes("gasto")
      ))
      .reduce((a, m) => a + Math.abs(m.monto), 0);

    const efectivoInicial = turno?.efectivo_inicial ?? 0;
    const efectivoEsperado = efectivoInicial + ventasEfectivo + depositosEfectivo + cobrosCCEfectivo - gastos - retiros - notasCreditoEgresos - anulaciones;

    // Individual egreso items for breakdown display
    const egresosDetalle = movements
      .filter((m) => m.tipo === "egreso" || (m.tipo === "cancelacion" && (m.referencia_tipo === "nota_credito" || m.referencia_tipo === "anulacion") && m.metodo_pago === "Efectivo"))
      .map((m) => ({ descripcion: m.descripcion || "Sin descripción", monto: Math.abs(m.monto) }));

    // Individual ingreso items (non-venta, non-cobro_saldo, non-cobro) for breakdown display
    const ingresosDetalle = movements
      .filter((m) => m.tipo === "ingreso" && m.referencia_tipo !== "venta" && m.referencia_tipo !== "cobro_saldo" && m.referencia_tipo !== "cobro")
      .map((m) => ({ descripcion: m.descripcion || "Sin descripción", monto: m.monto, metodo: m.metodo_pago || "Efectivo" }));

    // Ventas breakdown by ACTUAL money flow (caja_movimientos + CC entries)
    // This is the source of truth — not forma_pago on the venta record
    const ventasDesglose: Record<string, { count: number; total: number }> = {};
    const ventasCounted: Record<string, Set<string>> = {}; // track which ventas counted per method
    const addDesglose = (method: string, amount: number, ventaId?: string) => {
      if (amount <= 0) return;
      if (!ventasDesglose[method]) ventasDesglose[method] = { count: 0, total: 0 };
      if (!ventasCounted[method]) ventasCounted[method] = new Set();
      ventasDesglose[method].total += amount;
      if (ventaId && !ventasCounted[method].has(ventaId)) {
        ventasCounted[method].add(ventaId);
        ventasDesglose[method].count++;
      }
    };

    // Build CC entries map by venta_id for quick lookup — debe minus haber.
    // NC haber entries store venta_id = NC's own id; we re-key them to the
    // original venta (remito_origen_id) so the net cc debt is attributed
    // correctly and the total ventas card doesn't overcount.
    const ncIdToOrigen: Record<string, string> = {};
    for (const nc of (ncEntries || [])) {
      if (nc.id && nc.remito_origen_id) ncIdToOrigen[nc.id] = nc.remito_origen_id;
    }
    const ccByVenta: Record<string, number> = {};
    for (const e of (ccEntries || [])) {
      if (!e.venta_id) continue;
      const key = ncIdToOrigen[e.venta_id] || e.venta_id;
      ccByVenta[key] = (ccByVenta[key] || 0) + (e.debe || 0) - ((e as any).haber || 0);
    }

    // Build NC map by remito_origen_id (NC reduces effective venta total)
    const ncByVenta: Record<string, number> = {};
    for (const nc of (ncEntries || [])) {
      if (nc.remito_origen_id) ncByVenta[nc.remito_origen_id] = (ncByVenta[nc.remito_origen_id] || 0) + (nc.total || 0);
    }

    for (const v of ventas) {
      // 1. Check caja_movimientos for this venta (actual payments received)
      const ventaMovs = movements.filter((m) => m.referencia_id === v.id && m.referencia_tipo === "venta" && m.tipo === "ingreso");
      let accounted = 0;

      if (ventaMovs.length > 0) {
        for (const m of ventaMovs) {
          addDesglose(m.metodo_pago || "Otro", m.monto, v.id);
          accounted += m.monto;
        }
      }

      // 2. Check CC entries for this venta (partial payment remainders)
      const ccAmount = ccByVenta[v.id] || 0;
      if (ccAmount > 0) {
        addDesglose("Cuenta Corriente", ccAmount, v.id);
        accounted += ccAmount;
      }

      // 3. If full CC sale with no caja entries (forma_pago is CC and no movements)
      if (v.forma_pago === "Cuenta Corriente" && ventaMovs.length === 0 && ccAmount === 0) {
        addDesglose("Cuenta Corriente", v.total, v.id);
        accounted += v.total;
      }

      // 4. Remaining unaccounted amount (web orders not yet delivered/paid)
      // Subtract NC amount — NC settles part of the venta without cash payment
      const ncAmount = ncByVenta[v.id] || 0;
      const remaining = v.total - accounted - ncAmount;
      if (remaining > 1) {
        // Check if paid via cobro (monto_pagado) or marked as CC from hoja de ruta
        const montoPagado = (v as any).monto_pagado || 0;
        if (montoPagado + ncAmount >= v.total - 1 || v.forma_pago === "Cuenta Corriente") {
          addDesglose("Cuenta Corriente", remaining, v.id);
        } else {
          // Use stored amounts for online orders, or forma_pago as hint
          const ef = (v as any).monto_efectivo || 0;
          const tr = (v as any).monto_transferencia || 0;
          if (ef > 0 && tr > 0 && v.forma_pago === "Mixto") {
            // Online mixto without caja entries yet
            addDesglose("Efectivo (pendiente)", ef, v.id);
            addDesglose("Transferencia", Math.max(0, remaining - ef), v.id);
          } else if (v.forma_pago === "Transferencia" || tr > 0) {
            addDesglose("Transferencia", remaining, v.id);
          } else {
            addDesglose("Pendiente de cobro", remaining, v.id);
          }
        }
      }
    }

    // totalVentas = sum of all desglose entries (actual money flow, not venta.total)
    const totalVentas = Object.values(ventasDesglose).reduce((a, d) => a + d.total, 0);

    // Compute transfer surcharge total (portion of Transferencia that is recargo)
    // NOTE: Ideally ventas should store `recargo_monto` directly so this doesn't
    // depend on recalculation. For now we use the venta's own recargo_porcentaje
    // (not the current global setting) which was frozen at sale time.
    let totalTransferSurcharge = 0;
    for (const v of ventas) {
      const sub = (v as any).subtotal;
      const recPct = (v as any).recargo_porcentaje || 0;
      if (!sub || !recPct) continue;
      const hasTransferMov = movements.some(m => m.referencia_id === v.id && m.tipo === "ingreso" && m.metodo_pago === "Transferencia");
      if (hasTransferMov) {
        const ncAmt = ncByVenta[v.id] || 0;
        const baseNeta = sub - ncAmt;
        totalTransferSurcharge += baseNeta > 0 ? Math.round(baseNeta * recPct / 100) : 0;
      }
    }

    return {
      ventasEfectivo,
      ventasTransferencia,
      transferenciaPorCuenta,
      cobrosCCTotal,
      cobrosCCEfectivo,
      cobrosCCTransferencia,
      totalVentas,
      depositos,
      gastos,
      notasCreditoEgresos,
      anulaciones,
      retiros,
      efectivoEsperado,
      efectivoInicial,
      egresosDetalle,
      ingresosDetalle,
      ventasDesglose,
      totalTransferSurcharge,
      ncByVenta,
    };
  }, [ventas, movements, turno, ccEntries, ncEntries]);

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
                <MoneyInput
                  min={0}
                  value={abrirForm.efectivo_inicial}
                  onValueChange={(val) =>
                    setAbrirForm({ ...abrirForm, efectivo_inicial: val })
                  }
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

        <TurnoHistorialDialog
          open={histOpen}
          onOpenChange={setHistOpen}
          histDetail={histDetail}
          histTurnos={histTurnos}
          histLoading={histLoading}
          histMovs={histMovs}
          histVentas={histVentas}
          openHistDetail={openHistDetail}
          setHistDetail={setHistDetail}
          exportTurnoPDF={exportTurnoPDF}
          cuentasMaster={cajaCuentasBancarias}
          histCobroItems={histCobroItems}
        />
      </div>
    );
  }

  const exportMovimientosExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = movements.map((m) => ({
      "Fecha": m.fecha,
      "Hora": m.hora,
      "Tipo": m.tipo === "ingreso" ? "Ingreso" : m.tipo === "egreso" ? "Egreso" : "Cancelación",
      "Descripción": m.descripcion,
      "Método de Pago": m.metodo_pago,
      "Monto": m.monto,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 35 }, { wch: 18 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `Caja_Movimientos_${todayARG()}.xlsx`);
    showAdminToast(`${rows.length} movimientos exportados`, "success");
  };

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
            <Button variant="outline" size="sm" onClick={exportMovimientosExcel}>
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-2xl sm:rounded-full border border-border bg-background text-xs text-muted-foreground w-fit max-w-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Turno #{turno.numero}</span>
              <span className="text-border">·</span>
              <span>apertura {turno.hora_apertura?.substring(0, 5)}</span>
              <span className="text-border">·</span>
              <span>{turno.operador}</span>
              <span className="text-border">·</span>
              <span>efectivo inicial {formatCurrency(turno.efectivo_inicial)}</span>
            </div>
          )}

          {/* Stats - Interactive cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              {
                key: "ventas",
                title: "Total Ventas",
                value: formatCurrency(totalVentas),
                subtitle: `${ventas.length} ordenes`,
                hasDetail: Object.keys(ventasDesglose).length > 0,
                detail: Object.entries(ventasDesglose).sort((a, b) => b[1].total - a[1].total).map(([fp, d]) => ({
                  label: fp === "Transferencia" && totalTransferSurcharge > 0
                    ? `${fp} (${d.count}) — inc. rec. ${formatCurrency(totalTransferSurcharge)}`
                    : `${fp} (${d.count})`,
                  value: formatCurrency(d.total),
                  color: "",
                })),
              },
              {
                key: "efectivo",
                title: "Efectivo Esperado",
                value: formatCurrency(efectivoEsperado),
                hasDetail: true,
                detail: [
                  { label: `Inicial`, value: formatCurrency(efectivoInicial), color: "" },
                  { label: `+ Ventas efectivo`, value: formatCurrency(ventasEfectivo), color: "text-emerald-600" },
                  ...(cobrosCCEfectivo > 0 ? [{ label: `+ Cobros CC`, value: formatCurrency(cobrosCCEfectivo), color: "text-emerald-600" }] : []),
                  ...(depositos > 0 ? [{ label: `+ Ingresos`, value: formatCurrency(depositos), color: "text-emerald-600" }] : []),
                  { label: `- Egresos`, value: `-${formatCurrency(gastos + retiros + notasCreditoEgresos + anulaciones)}`, color: "text-red-500" },
                ],
              },
              {
                key: "ingresos",
                title: "Ingresos Caja",
                value: formatCurrency(depositos),
                hasDetail: ingresosDetalle.length > 0,
                detail: ingresosDetalle.map((d) => ({
                  label: `${d.descripcion} (${d.metodo})`,
                  value: formatCurrency(d.monto),
                  color: "text-emerald-600",
                })),
              },
              {
                key: "egresos",
                title: "Egresos Caja",
                value: formatCurrency(gastos + retiros + notasCreditoEgresos + anulaciones),
                hasDetail: egresosDetalle.length > 0,
                detail: egresosDetalle.map((d) => ({
                  label: d.descripcion,
                  value: `-${formatCurrency(d.monto)}`,
                  color: "text-red-500",
                })),
              },
            ].map((card) => (
              <div
                key={card.key}
                className={`rounded-xl bg-muted/50 p-4 transition-all ${card.hasDetail ? "cursor-pointer hover:bg-muted/70" : ""}`}
                onClick={() => card.hasDetail && toggleCard(card.key)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1">{card.title}</p>
                    <p className={`text-xl sm:text-2xl font-medium truncate ${
                      card.key === "egresos" ? "text-red-500" :
                      card.key === "ingresos" ? "text-emerald-600" : ""
                    }`}>{card.value}</p>
                    {card.subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{card.subtitle}</p>}
                  </div>
                  {card.hasDetail && (
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 transition-transform ${expandedCard === card.key ? "rotate-180" : ""}`} />
                  )}
                </div>
                {expandedCard === card.key && card.detail.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-border/50 space-y-1">
                    {card.detail.map((d, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground truncate mr-2">{d.label}</span>
                        <span className={`font-medium shrink-0 ${d.color}`}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-2 mb-2">Ingresos por método</p>
          {/* Detalle por método + deudores + egresos + cobros CC */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Efectivo */}
            <Card className="border-border/60">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Efectivo</p>
                <p className="text-lg font-medium">{formatCurrency(ventasEfectivo)}</p>
              </CardContent>
            </Card>

            {/* Transferencia con desglose por cuenta */}
            <Card className="border-border/60">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Transferencia</p>
                <p className="text-lg font-medium">{formatCurrency(ventasTransferencia)}</p>
                {totalTransferSurcharge > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    inc. recargo {formatCurrency(totalTransferSurcharge)}
                  </p>
                )}
                {Object.keys(transferenciaPorCuenta).length > 0 && (
                  <div className="mt-2 pt-2 border-t space-y-1">
                    {Object.entries(transferenciaPorCuenta)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cuenta, monto]) => (
                        <div key={cuenta} className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground truncate">{cuenta}</span>
                          <span className="font-medium shrink-0 ml-2">{formatCurrency(monto)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cuenta Corriente con lista de deudores */}
            {(ventasDesglose["Cuenta Corriente"]?.total || 0) > 0 && (() => {
              const deudoresHoy: { nombre: string; monto: number }[] = [];
              const ccByCliente: Record<string, number> = {};
              // Re-key NC haber entries to the original venta so the client
              // name resolves correctly instead of "Sin cliente".
              const ncIdToOrigenLocal: Record<string, string> = {};
              for (const nc of (ncEntries || [])) {
                if (nc.id && nc.remito_origen_id) ncIdToOrigenLocal[nc.id] = nc.remito_origen_id;
              }
              for (const e of (ccEntries || [])) {
                const effectiveId = ncIdToOrigenLocal[e.venta_id] || e.venta_id;
                const venta = ventas.find(v => v.id === effectiveId);
                const nombre = (venta as any)?.clientes?.nombre || "Sin cliente";
                ccByCliente[nombre] = (ccByCliente[nombre] || 0) + (e.debe || 0) - ((e as any).haber || 0);
              }
              for (const [nombre, monto] of Object.entries(ccByCliente)) {
                if (monto > 0) deudoresHoy.push({ nombre, monto });
              }
              deudoresHoy.sort((a, b) => b.monto - a.monto);
              return (
                <Card className="border-border/60">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Cuenta corriente</p>
                    <p className="text-lg font-medium text-amber-600">
                      {formatCurrency(ventasDesglose["Cuenta Corriente"].total)}
                    </p>
                    {deudoresHoy.length > 0 && (
                      <div className="mt-2 pt-2 border-t space-y-1">
                        {deudoresHoy.map((d, i) => (
                          <div key={i} className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground truncate">{d.nombre}</span>
                            <span className="font-medium text-amber-600 shrink-0 ml-2">
                              {formatCurrency(d.monto)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

          </div>

          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-2 mb-2">Detalle</p>
          {/* Cobros CC + Egresos + Ingresos manuales */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Cobros de deuda recibidos hoy */}
            {cobrosCCTotal > 0 && (
              <Card className="border-border/60">
                <CardContent className="pt-4 pb-4">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Cobros de deuda recibidos</p>
                  <p className="text-lg font-medium text-emerald-600">{formatCurrency(cobrosCCTotal)}</p>
                  <div className="mt-2 pt-2 border-t space-y-1.5">
                    {movements
                      .filter(m => m.tipo === "ingreso" && (m.referencia_tipo === "cobro_saldo" || m.referencia_tipo === "cobro"))
                      .map((m, i) => {
                        const desc = m.descripcion || "";
                        const nombreMatch = desc.match(/—\s*(.+?)(\s*→|\s*$)/);
                        const nombre = nombreMatch?.[1]?.trim() || desc;
                        const saldado = !desc.toLowerCase().includes("parcial");
                        return (
                          <div key={i} className="flex justify-between items-start text-[11px]">
                            <div className="min-w-0">
                              <p className="text-foreground truncate">{nombre}</p>
                              <p className="text-muted-foreground">{m.metodo_pago}</p>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <p className="font-medium text-emerald-600">{formatCurrency(m.monto)}</p>
                              {saldado && (
                                <p className="text-[10px] text-emerald-500">saldado</p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                  {(cobrosCCEfectivo > 0 || cobrosCCTransferencia > 0) && (
                    <div className="mt-2 pt-2 border-t flex justify-between text-[11px] text-muted-foreground">
                      {cobrosCCEfectivo > 0 && <span>Efectivo: {formatCurrency(cobrosCCEfectivo)}</span>}
                      {cobrosCCTransferencia > 0 && <span>Transf.: {formatCurrency(cobrosCCTransferencia)}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Egresos del día con detalle */}
            {(gastos + retiros + notasCreditoEgresos + anulaciones) > 0 && (
              <Card className="border-border/60">
                <CardContent className="pt-4 pb-4">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Egresos</p>
                  <p className="text-lg font-medium text-red-500">
                    -{formatCurrency(gastos + retiros + notasCreditoEgresos + anulaciones)}
                  </p>
                  {egresosDetalle.length > 0 && (
                    <div className="mt-2 pt-2 border-t space-y-1">
                      {egresosDetalle.map((d, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground truncate mr-2">{d.descripcion}</span>
                          <span className="font-medium text-red-500 shrink-0">-{formatCurrency(d.monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ingresos manuales si los hay */}
            {depositos > 0 && (
              <Card className="border-border/60">
                <CardContent className="pt-4 pb-4">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">Ingresos manuales</p>
                  <p className="text-lg font-medium text-emerald-600">{formatCurrency(depositos)}</p>
                  {ingresosDetalle.length > 0 && (
                    <div className="mt-2 pt-2 border-t space-y-1">
                      {ingresosDetalle.map((d, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground truncate mr-2">{d.descripcion}</span>
                          <span className="font-medium text-emerald-600 shrink-0">{formatCurrency(d.monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </div>

          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-2 mb-2">
            Ventas del día
          </p>
          <Card>
            {/* Tab bar */}
            <div className="px-4 pt-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-0">
                  {(["ventas", "entregas"] as const).map((t) => {
                    const entregasMovs = movements.filter(m =>
                      m.tipo === "ingreso" &&
                      m.referencia_tipo === "venta"
                    );
                    const ventasEntregadas = ventas.filter(v =>
                      (v as any).entregado === true &&
                      (v as any).metodo_entrega &&
                      ["envio", "envio_a_domicilio", "envio a domicilio"].includes((v as any).metodo_entrega)
                    );
                    const ventaIdsConCobro = new Set(entregasMovs.map(m => m.referencia_id));
                    const sinCobrar = ventasEntregadas.filter(v => {
                      if (ventaIdsConCobro.has(v.id)) return false;
                      if (((v as any).monto_pagado || 0) >= (v.total || 0) * 0.99) return false;
                      if (v.forma_pago === "Cuenta Corriente") return false;
                      return true;
                    });
                    return (
                      <button
                        key={t}
                        onClick={() => setVentasTab(t)}
                        className={`flex items-center gap-2 px-1 pb-2.5 mr-5 text-sm border-b-2 transition-all ${
                          ventasTab === t
                            ? "border-foreground text-foreground font-medium"
                            : "border-transparent text-muted-foreground hover:text-foreground/70"
                        }`}
                      >
                        {t === "ventas" ? "Ventas" : "Entregas"}
                        {t === "entregas" && (
                          <span className="flex items-center gap-1">
                            {entregasMovs.length > 0 && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                                {entregasMovs.length}
                              </span>
                            )}
                            {sinCobrar.length > 0 && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400">
                                {sinCobrar.length}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {ventasTab === "ventas" && (
                  <div className="flex gap-1.5 flex-wrap pb-2">
                    {([
                      { key: "todas" as const, label: "Todas", dot: null, count: ventas.length },
                      { key: "pos" as const, label: "POS", dot: "bg-blue-600", count: ventas.filter(v => { const me = (v as any).metodo_entrega; const isEnvio = me && ["envio","envio_a_domicilio","envio a domicilio"].includes(me); return (v as any).origen !== "tienda" && !isEnvio; }).length },
                      { key: "envio" as const, label: "Envío", dot: "bg-emerald-600", count: ventas.filter(v => { const me = (v as any).metodo_entrega; return me && ["envio","envio_a_domicilio","envio a domicilio"].includes(me); }).length },
                      { key: "retiro" as const, label: "Retiro", dot: "bg-purple-600", count: ventas.filter(v => { const isWeb = (v as any).origen === "tienda"; const me = (v as any).metodo_entrega; const isEnvio = me && ["envio","envio_a_domicilio","envio a domicilio"].includes(me); return isWeb && !isEnvio; }).length },
                    ]).map(f => (
                      <button
                        key={f.key}
                        onClick={() => setVentaOrigenFilter(f.key)}
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                          ventaOrigenFilter === f.key
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                        }`}
                      >
                        {f.dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.dot}`} />}
                        {f.label}
                        <span className="opacity-60">{f.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-border -mx-4" />
            </div>

            <CardContent className="pt-0 pb-0">

              {/* TAB VENTAS */}
              {ventasTab === "ventas" && (
                <>
                  {ventas.length === 0 ? (
                    <EmptyState title="No hay ventas hoy" icon={Wallet} />
                  ) : (
                    <>
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">N°</th>
                              <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Cliente</th>
                              <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Origen</th>
                              <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Método</th>
                              <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Estado</th>
                              <th className="text-right py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Total</th>
                              <th className="w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ventas.filter(v => {
                              if (ventaOrigenFilter === "todas") return true;
                              const isWeb = (v as any).origen === "tienda";
                              const me = (v as any).metodo_entrega;
                              const isEnvio = me && ["envio","envio_a_domicilio","envio a domicilio"].includes(me);
                              const isRetiro = isWeb && !isEnvio;
                              if (ventaOrigenFilter === "pos") return !isWeb && !isEnvio;
                              if (ventaOrigenFilter === "envio") return !!isEnvio;
                              if (ventaOrigenFilter === "retiro") return !!isRetiro;
                              return true;
                            }).map((v) => {
                              const isWeb = (v as any).origen === "tienda";
                              const me = (v as any).metodo_entrega;
                              const isEnvio = me && ["envio","envio_a_domicilio","envio a domicilio"].includes(me);
                              const isRetiro = isWeb && !isEnvio;
                              const origenLabel = isEnvio ? "Envío" : isRetiro ? "Retiro" : "POS";
                              const origenDot = isEnvio ? "bg-emerald-600" : isRetiro ? "bg-purple-600" : "bg-blue-600";
                              const origenClass = isEnvio
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : isRetiro
                                ? "bg-purple-50 text-purple-800 border border-purple-200"
                                : "bg-blue-50 text-blue-800 border border-blue-200";
                              const origenSub = isRetiro ? "Web" : (isEnvio && !isWeb) ? "POS" : isEnvio ? "Web" : null;
                              const montoPagado = (v as any).monto_pagado || 0;
                              const ncAmt = ncByVenta[v.id] || 0;
                              const ventaSubtotalCaja = (v as any).subtotal || v.total;
                              const recargoImplicitoCaja = v.total - ventaSubtotalCaja;
                              const pctCaja = recargoImplicitoCaja > 0 && ventaSubtotalCaja > 0 ? recargoImplicitoCaja / ventaSubtotalCaja : 0;
                              const baseNetaCaja = ventaSubtotalCaja - ncAmt;
                              const totalEfectivo = ncAmt > 0
                                ? baseNetaCaja + (baseNetaCaja > 0 ? Math.round(baseNetaCaja * pctCaja) : 0)
                                : v.total;
                              const isPagado = montoPagado >= totalEfectivo - 1;
                              const isCC = v.forma_pago === "Cuenta Corriente" ||
                                (ventasDesglose["Cuenta Corriente"] && ccEntries?.some(e => e.venta_id === v.id));
                              const estadoLabel = isPagado ? "Cobrado" : isCC ? "Cta cte" : "Pendiente";
                              const estadoClass = isPagado
                                ? "bg-green-50 text-green-800 border border-green-200"
                                : isCC
                                ? "bg-amber-50 text-amber-800 border border-amber-200"
                                : "bg-red-50 text-red-800 border border-red-200";
                              return (
                                <tr key={v.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => openVentaDetail(v)}>
                                  <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{v.numero}</td>
                                  <td className="py-2.5 px-3 text-xs">{(v as any).clientes?.nombre || "—"}</td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-col gap-0.5">
                                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full w-fit ${origenClass}`}>
                                        <span className={`w-1 h-1 rounded-full shrink-0 ${origenDot}`} />
                                        {origenLabel}
                                      </span>
                                      {origenSub && <span className="text-[10px] text-muted-foreground pl-1">{origenSub}</span>}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-col gap-0.5">
                                      <Badge variant="secondary" className="text-[10px] font-normal w-fit">{v.forma_pago}</Badge>
                                      {(v.forma_pago === "Transferencia" || (v.forma_pago === "Mixto" && (v as any).monto_transferencia > 0)) && (v as any).cuenta_transferencia_alias && (
                                        <span className="text-[10px] text-muted-foreground">→ {(v as any).cuenta_transferencia_alias}</span>
                                      )}
                                      {(v.forma_pago === "Transferencia" || (v.forma_pago === "Mixto" && (v as any).monto_transferencia > 0)) && !(v as any).cuenta_transferencia_alias && (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                                          <AlertTriangle className="w-2.5 h-2.5" />Sin cuenta
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full ${estadoClass}`}>
                                      {estadoLabel}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-medium text-xs">
                                    {(() => {
                                      const ncAmtCol = ncByVenta[v.id] || 0;
                                      if (ncAmtCol === 0) return formatCurrency(v.total);
                                      const vSub = (v as any).subtotal || v.total;
                                      const rImpl = v.total - vSub;
                                      const pctImpl = rImpl > 0 && vSub > 0 ? rImpl / vSub : 0;
                                      const bNeta = vSub - ncAmtCol;
                                      const totalConNC = bNeta + (bNeta > 0 ? Math.round(bNeta * pctImpl) : 0);
                                      return (
                                        <div>
                                          <span className="line-through text-gray-400 text-[10px] block">{formatCurrency(v.total)}</span>
                                          <span className="font-semibold text-primary">{formatCurrency(totalConNC)}</span>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="py-2.5 px-1"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t bg-muted/30">
                              <td colSpan={5} className="py-2.5 px-3 text-xs text-muted-foreground">
                                {ventas.filter(v => {
                                  if (ventaOrigenFilter === "todas") return true;
                                  const isWeb = (v as any).origen === "tienda";
                                  const me = (v as any).metodo_entrega;
                                  const isEnvio = me && ["envio","envio_a_domicilio","envio a domicilio"].includes(me);
                                  if (ventaOrigenFilter === "pos") return !isWeb && !isEnvio;
                                  if (ventaOrigenFilter === "envio") return !!isEnvio;
                                  if (ventaOrigenFilter === "retiro") return isWeb && !isEnvio;
                                  return true;
                                }).length} ventas
                                {ventas.some(v => (v.forma_pago === "Transferencia" || v.forma_pago === "Mixto") && !(v as any).cuenta_transferencia_alias) && (
                                  <span className="ml-2 text-amber-600 font-medium">
                                    · {ventas.filter(v => (v.forma_pago === "Transferencia" || v.forma_pago === "Mixto") && !(v as any).cuenta_transferencia_alias).length} sin cuenta
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right text-xs font-medium">
                                {formatCurrency(ventas.filter(v => {
                                  if (ventaOrigenFilter === "todas") return true;
                                  const isWeb = (v as any).origen === "tienda";
                                  const me = (v as any).metodo_entrega;
                                  const isEnvio = me && ["envio","envio_a_domicilio","envio a domicilio"].includes(me);
                                  if (ventaOrigenFilter === "pos") return !isWeb && !isEnvio;
                                  if (ventaOrigenFilter === "envio") return !!isEnvio;
                                  if (ventaOrigenFilter === "retiro") return isWeb && !isEnvio;
                                  return true;
                                }).reduce((s, v) => s + v.total, 0))}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Mobile */}
                      <div className="sm:hidden divide-y">
                        {ventas.filter(v => {
                          if (ventaOrigenFilter === "todas") return true;
                          const isWeb = (v as any).origen === "tienda";
                          const me = (v as any).metodo_entrega;
                          const isEnvio = me && ["envio","envio_a_domicilio","envio a domicilio"].includes(me);
                          if (ventaOrigenFilter === "pos") return !isWeb && !isEnvio;
                          if (ventaOrigenFilter === "envio") return !!isEnvio;
                          if (ventaOrigenFilter === "retiro") return isWeb && !isEnvio;
                          return true;
                        }).map((v) => (
                          <div key={v.id} className="py-3 px-3 flex items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openVentaDetail(v)}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-muted-foreground">{v.numero}</span>
                                {(v as any).origen === "tienda" && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-pink-300 text-pink-600">Web</Badge>
                                )}
                                <Badge variant="secondary" className="text-[10px] font-normal">{v.forma_pago}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{(v as any).clientes?.nombre || "—"}</p>
                            </div>
                            <span className="font-medium text-sm shrink-0">{formatCurrency(v.total)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* TAB ENTREGAS */}
              {ventasTab === "entregas" && (() => {
                const ventasEntregadas = ventas.filter(v =>
                  (v as any).entregado === true &&
                  (v as any).metodo_entrega &&
                  ["envio", "envio_a_domicilio", "envio a domicilio"].includes((v as any).metodo_entrega)
                );
                const ventaIdsEntrega = new Set(ventasEntregadas.map(v => v.id));
                // Match caja entries for delivery ventas (by referencia_id, regardless of description)
                const entregasMovs = movements.filter(m =>
                  m.tipo === "ingreso" &&
                  m.referencia_tipo === "venta" &&
                  m.referencia_id && ventaIdsEntrega.has(m.referencia_id)
                );
                const totalEfectivoEntregas = entregasMovs.filter(m => m.metodo_pago === "Efectivo").reduce((s, m) => s + m.monto, 0);
                const totalTransfEntregas = entregasMovs.filter(m => m.metodo_pago === "Transferencia").reduce((s, m) => s + m.monto, 0);
                const ventaIdsConCobro = new Set(entregasMovs.map(m => m.referencia_id));
                const sinCobrar = ventasEntregadas.filter(v => {
                  if (ventaIdsConCobro.has(v.id)) return false;
                  // Consider paid if monto_pagado covers total (payment in a previous turno)
                  if (((v as any).monto_pagado || 0) >= (v.total || 0) * 0.99) return false;
                  // Consider paid if it went to CC (not real money but recorded)
                  if (v.forma_pago === "Cuenta Corriente") return false;
                  return true;
                });
                return (
                  <>
                    {entregasMovs.length === 0 && sinCobrar.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">Sin entregas registradas hoy</div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Hora</th>
                                <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Cliente</th>
                                <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Método</th>
                                <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Cuenta</th>
                                <th className="text-right py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Monto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entregasMovs
                                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                .map((m) => {
                                  const desc = m.descripcion || "";
                                  const nombreMatch = desc.match(/—\s*(.+?)(\s*→|\s*$)/);
                                  const ventaCliente = ventasEntregadas.find(v => v.id === m.referencia_id) as any;
                                  const nombre = nombreMatch?.[1]?.trim() || ventaCliente?.clientes?.nombre || "—";
                                  const cuenta = (m as any).cuenta_bancaria || "";
                                  return (
                                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                                      <td className="py-2.5 px-3 text-xs text-muted-foreground">{m.hora?.substring(0, 5) || "—"}</td>
                                      <td className="py-2.5 px-3 text-xs font-medium">{nombre}</td>
                                      <td className="py-2.5 px-3">
                                        <Badge variant="secondary" className="text-[10px] font-normal">{m.metodo_pago}</Badge>
                                      </td>
                                      <td className="py-2.5 px-3 text-xs text-muted-foreground">{cuenta || "—"}</td>
                                      <td className="py-2.5 px-3 text-right text-xs font-medium text-emerald-600">{formatCurrency(m.monto)}</td>
                                    </tr>
                                  );
                                })}
                              {sinCobrar.map((v) => (
                                <tr key={v.id} className="border-b last:border-0 bg-red-50/40 dark:bg-red-950/10">
                                  <td className="py-2.5 px-3 text-xs text-muted-foreground">—</td>
                                  <td className="py-2.5 px-3 text-xs font-medium text-red-600">{(v as any).clientes?.nombre || "Sin cliente"}</td>
                                  <td className="py-2.5 px-3" colSpan={2}>
                                    <span className="text-[10px] text-red-500 font-medium">sin cobrar</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-xs font-medium text-red-500">{formatCurrency(v.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t bg-muted/30">
                                <td colSpan={4} className="py-2.5 px-3 text-xs text-muted-foreground">
                                  {totalEfectivoEntregas > 0 && (
                                    <span className="mr-4">Efectivo <span className="font-medium text-foreground">{formatCurrency(totalEfectivoEntregas)}</span></span>
                                  )}
                                  {totalTransfEntregas > 0 && (
                                    <span>Transferencia <span className="font-medium text-foreground">{formatCurrency(totalTransfEntregas)}</span></span>
                                  )}
                                  {sinCobrar.length > 0 && (
                                    <span className="ml-4 text-red-500">Sin cobrar <span className="font-medium">{formatCurrency(sinCobrar.reduce((s, v) => s + v.total, 0))}</span></span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right text-xs font-medium">
                                  {formatCurrency(entregasMovs.reduce((s, m) => s + m.monto, 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                );
              })()}

            </CardContent>
          </Card>

          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-2 mb-2">
            Movimientos de caja
          </p>
          <Card>
            <button
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
              onClick={() => setMovsOpen(o => !o)}
            >
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-foreground">{movements.length} movimientos</span>
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  {movements.filter(m => m.tipo === "ingreso").length > 0 && (
                    <span>
                      Ingresos{" "}
                      <span className="font-medium text-emerald-600">
                        +{formatCurrency(movements.filter(m => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0))}
                      </span>
                    </span>
                  )}
                  {movements.filter(m => m.tipo === "egreso" || m.tipo === "cancelacion").length > 0 && (
                    <span>
                      Egresos{" "}
                      <span className="font-medium text-red-500">
                        -{formatCurrency(movements.filter(m => m.tipo === "egreso" || m.tipo === "cancelacion").reduce((s, m) => s + Math.abs(m.monto), 0))}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${movsOpen ? "rotate-180" : ""}`} />
            </button>

            {movsOpen && (
              <div className="border-t border-border/60">
                {movements.length === 0 ? (
                  <EmptyState title="No hay movimientos hoy" icon={Wallet} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Hora</th>
                          <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Descripción</th>
                          <th className="text-left py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Método</th>
                          <th className="text-right py-2.5 px-3 font-medium text-[10px] uppercase tracking-widest text-muted-foreground">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((m) => (
                          <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                            <td className="py-2.5 px-3 text-xs text-muted-foreground">{m.hora?.substring(0, 5)}</td>
                            <td className="py-2.5 px-3 text-xs">{m.descripcion}</td>
                            <td className="py-2.5 px-3">
                              <Badge variant="secondary" className="text-[10px] font-normal">{m.metodo_pago}</Badge>
                            </td>
                            <td className={`py-2.5 px-3 text-right text-xs font-medium ${
                              m.tipo === "ingreso" ? "text-emerald-600" : "text-red-500"
                            }`}>
                              {m.tipo === "ingreso" ? "+" : "-"}{formatCurrency(Math.abs(m.monto))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto</Label>
                <MoneyInput
                  value={movForm.monto}
                  onValueChange={(val) => setMovForm({ ...movForm, monto: val })}
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
            {movDialog.data === "egreso" && (
              <div className="space-y-2">
                <Label>Tipo de egreso</Label>
                <Select
                  value={movForm.sub_tipo}
                  onValueChange={(v) => setMovForm({ ...movForm, sub_tipo: v ?? "gasto" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gasto">Gasto</SelectItem>
                    <SelectItem value="retiro">Retiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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

      <TurnoHistorialDialog
        open={histOpen}
        onOpenChange={setHistOpen}
        histDetail={histDetail}
        histTurnos={histTurnos}
        histLoading={histLoading}
        histMovs={histMovs}
        histVentas={histVentas}
        openHistDetail={openHistDetail}
        setHistDetail={setHistDetail}
        exportTurnoPDF={exportTurnoPDF}
        cuentasMaster={cajaCuentasBancarias}
        histCobroItems={histCobroItems}
      />

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
                        <span className="text-muted-foreground">Transferencia{totalTransferSurcharge > 0 ? ` (inc. rec. ${formatCurrency(totalTransferSurcharge)})` : ""}</span>
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
                  {(ventasDesglose["Cuenta Corriente"]?.total || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cuenta Corriente</span>
                      <span>{formatCurrency(ventasDesglose["Cuenta Corriente"].total)}</span>
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
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Anulaciones</span>
                        <span className="text-red-500">-{formatCurrency(anulaciones)}</span>
                      </div>
                      {/* Anulaciones breakdown by metodo_pago */}
                      {(() => {
                        const anulMovs = movements.filter((m) => m.tipo === "cancelacion" && m.referencia_tipo === "anulacion");
                        const porMetodo: Record<string, number> = {};
                        anulMovs.forEach((m) => {
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
                <MoneyInput
                  value={cierreForm.efectivo_real}
                  onValueChange={(val) =>
                    setCierreForm({ ...cierreForm, efectivo_real: val })
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
          monto_efectivo: (ventaDetail as any).monto_efectivo || 0,
          monto_transferencia: (ventaDetail as any).monto_transferencia || 0,
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
          if ((ventaDetail as any).monto_cuenta_corriente > 0) pagos.push({ metodo: "Cuenta Corriente", monto: (ventaDetail as any).monto_cuenta_corriente });
          // If still nothing, check if it's a full CC sale
          if (pagos.length === 0 && ventaDetail.forma_pago === "Cuenta Corriente") pagos.push({ metodo: "Cuenta Corriente", monto: ventaDetail.total });
          if (pagos.length === 0 && ventaDetail.forma_pago) pagos.push({ metodo: ventaDetail.forma_pago, monto: ventaDetail.total });
          return pagos;
        })()}
        ncs={ventaDetailNCs}
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
