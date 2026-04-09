"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Package, ChevronDown, ChevronUp, ChevronRight, Calendar, Hash, AlertCircle, ShoppingBag, DollarSign, Globe, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/tienda/toast";
import { formatCurrency } from "@/lib/formatters";

interface ComboComponent {
  producto_id: string;
  cantidad: number;
  nombre: string;
}

interface PedidoItem {
  id: number;
  nombre: string;
  presentacion: string;
  unidades_por_presentacion?: number;
  cantidad: number;
  precio_unitario: number;
  descuento?: number;
  producto_id?: string;
  es_combo?: boolean;
  combo_items?: ComboComponent[];
}

interface NotaCredito {
  id: string;
  numero: string;
  fecha: string;
  total: number;
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[];
}

interface PagoDetalle {
  metodo_pago: string;
  monto: number;
  cuenta_bancaria?: string;
  fecha?: string;
  descripcion?: string;
}

interface VentaRecord {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  created_at: string;
  forma_pago: string;
  total: number;
  origen: string;
  estado?: string;
  entregado?: boolean;
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; presentacion?: string; unidades_por_presentacion?: number; descuento?: number; producto_id?: string; es_combo?: boolean; combo_items?: ComboComponent[] }[];
  notas_credito: NotaCredito[];
  pagos: PagoDetalle[];
  saldo_pendiente: number;
}

interface Pedido {
  id: number;
  numero: string;
  created_at: string;
  estado: string;
  total: number;
  items: PedidoItem[];
  venta?: VentaRecord;
}


const estadoBadge: Record<string, { bg: string; text: string; dot: string }> = {
  pendiente: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
  armado: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-400" },
  confirmado: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-400" },
  entregado: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400" },
  cancelado: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-400" },
};

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ventasPOS, setVentasPOS] = useState<VentaRecord[]>([]);
  const [clienteSaldo, setClienteSaldo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedCombos, setExpandedCombos] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"web" | "local">("web");

  const toggleCombo = (key: string) => {
    setExpandedCombos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      const stored = localStorage.getItem("cliente_auth");
      if (!stored) { window.location.href = "/cuenta"; return; }
      const { id } = JSON.parse(stored);

      // Phase 1: Auth check + pedidos in parallel (pedidos don't need cliente_id)
      const [{ data: authRec, error: authErr }, { data }] = await Promise.all([
        supabase.from("clientes_auth").select("cliente_id").eq("id", id).single(),
        supabase.from("pedidos_tienda")
          .select("id, numero, created_at, estado, total, metodo_pago, monto_efectivo, monto_transferencia, pedido_tienda_items(id, nombre, presentacion, cantidad, precio_unitario, unidades_por_presentacion, producto_id)")
          .eq("cliente_auth_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (authErr || !authRec) {
        localStorage.removeItem("cliente_auth");
        window.location.href = "/cuenta";
        return;
      }
      const clienteId = authRec?.cliente_id;

      // Phase 2: Fetch ventas (needs cliente_id)
      let ventasData: any[] = [];
      if (clienteId) {
        const { data: vd } = await supabase
          .from("ventas")
          .select("id, numero, tipo_comprobante, fecha, created_at, forma_pago, total, subtotal, monto_pagado, monto_efectivo, monto_transferencia, recargo_porcentaje, origen, estado, entregado, venta_items(descripcion, cantidad, precio_unitario, subtotal, presentacion, unidades_por_presentacion, descuento, producto_id)")
          .eq("cliente_id", clienteId)
          .not("tipo_comprobante", "ilike", "Nota de Crédito%")
          .not("tipo_comprobante", "ilike", "Nota de Débito%")
          .order("fecha", { ascending: false });
        ventasData = vd || [];
      }
      const allVentas: any[] = ventasData;

      // Phase 2: All venta-dependent queries in parallel
      const ventaIds = allVentas.map((v: any) => v.id);

      const ncPromise = ventaIds.length > 0
        ? supabase.from("ventas")
            .select("id, numero, fecha, total, remito_origen_id, venta_items(descripcion, cantidad, precio_unitario, subtotal, presentacion, unidades_por_presentacion, descuento, producto_id)")
            .in("remito_origen_id", ventaIds)
            .ilike("tipo_comprobante", "Nota de Crédito%")
        : Promise.resolve({ data: [] });

      const cajaPromise = ventaIds.length > 0
        ? supabase.from("caja_movimientos")
            .select("referencia_id, metodo_pago, monto, cuenta_bancaria, created_at, descripcion")
            .in("referencia_id", ventaIds)
            .eq("referencia_tipo", "venta")
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] });

      const ccPromise = ventaIds.length > 0
        ? supabase.from("cuenta_corriente")
            .select("venta_id, debe, haber, forma_pago, created_at")
            .in("venta_id", ventaIds)
        : Promise.resolve({ data: [] });

      const cobroPromise = ventaIds.length > 0
        ? supabase.from("cobro_items")
            .select("venta_id, monto_aplicado, cobros(forma_pago, fecha)")
            .in("venta_id", ventaIds)
        : Promise.resolve({ data: [] });

      const ccHabersPromise = clienteId
        ? supabase.from("cuenta_corriente")
            .select("haber, forma_pago, created_at, venta_id")
            .eq("cliente_id", clienteId)
            .gt("haber", 0)
            .eq("debe", 0)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] });

      const saldoPromise = clienteId
        ? supabase.from("clientes").select("saldo").eq("id", clienteId).single()
        : Promise.resolve({ data: { saldo: 0 } });

      const [
        { data: ncsData },
        { data: movsData },
        { data: ccEntriesData },
        { data: cobroItemsData },
        { data: allHabersData },
        { data: cliData },
      ] = await Promise.all([ncPromise, cajaPromise, ccPromise, cobroPromise, ccHabersPromise, saldoPromise]);

      // Process NCs
      let ncMap: Record<string, NotaCredito[]> = {};
      for (const nc of ncsData || []) {
        const key = (nc as any).remito_origen_id;
        if (!ncMap[key]) ncMap[key] = [];
        ncMap[key].push({
          id: nc.id, numero: nc.numero, fecha: nc.fecha, total: nc.total,
          items: (nc as any).venta_items || [],
        });
      }

      // Process caja_movimientos
      let pagosMap: Record<string, PagoDetalle[]> = {};
      for (const m of movsData || []) {
        const key = m.referencia_id;
        if (!pagosMap[key]) pagosMap[key] = [];
        pagosMap[key].push({
          metodo_pago: m.metodo_pago, monto: m.monto,
          cuenta_bancaria: m.cuenta_bancaria || undefined,
          fecha: m.created_at || undefined, descripcion: m.descripcion || undefined,
        });
      }

      // Process CC entries
      const ccDebeMap: Record<string, number> = {};
      let ccHabersByVenta: Record<string, { haber: number; forma_pago: string; created_at: string }[]> = {};
      for (const cc of ccEntriesData || []) {
        if (!cc.venta_id) continue;
        if ((cc.debe || 0) > 0) {
          ccDebeMap[cc.venta_id] = (ccDebeMap[cc.venta_id] || 0) + (cc.debe || 0);
        }
        if ((cc.haber || 0) > 0 && (cc.debe || 0) === 0) {
          if (!ccHabersByVenta[cc.venta_id]) ccHabersByVenta[cc.venta_id] = [];
          ccHabersByVenta[cc.venta_id].push({
            haber: cc.haber, forma_pago: cc.forma_pago || "Pago", created_at: cc.created_at,
          });
        }
      }

      // Process cobro_items
      let cobroItemsByVenta: Record<string, { monto: number; forma_pago: string; fecha: string }[]> = {};
      for (const ci of cobroItemsData || []) {
        if (!cobroItemsByVenta[ci.venta_id]) cobroItemsByVenta[ci.venta_id] = [];
        const cobro = (ci as any).cobros;
        cobroItemsByVenta[ci.venta_id].push({
          monto: ci.monto_aplicado, forma_pago: cobro?.forma_pago || "Cobro", fecha: cobro?.fecha || "",
        });
      }

      // Determine which ventas had CC debt
      const hadCCDebt: Record<string, boolean> = {};
      for (const ventaId of ventaIds) {
        if ((ccDebeMap[ventaId] || 0) > 0 || (cobroItemsByVenta[ventaId] || []).length > 0) {
          hadCCDebt[ventaId] = true;
        }
      }

      // Build saldo map
      const saldoMap: Record<string, number> = {};
      for (const v of allVentas) {
        saldoMap[v.id] = hadCCDebt[v.id] ? Math.max(0, v.total - (v.monto_pagado || 0)) : 0;
      }

      // Process client CC habers
      let clientCCHabers = (allHabersData || []).filter((h: any) =>
        !h.venta_id || !ventaIds.includes(h.venta_id) || !hadCCDebt[h.venta_id]
      );

      // Client saldo
      let clienteSaldoReal = Math.max(0, (cliData as any)?.saldo || 0);
      setClienteSaldo(clienteSaldoReal);

      // Reconcile saldoMap against client's actual saldo (source of truth).
      // monto_pagado on ventas can be stale; client saldo is always up to date.
      const sumPending = Object.values(saldoMap).reduce((s, v) => s + v, 0);
      if (clienteSaldoReal <= 0) {
        // Client owes nothing — clear all per-venta debts
        for (const k of Object.keys(saldoMap)) saldoMap[k] = 0;
      } else if (sumPending > clienteSaldoReal + 0.01) {
        // FIFO-reduce from oldest until total pending matches actual saldo
        const sorted = allVentas
          .filter((v: any) => (saldoMap[v.id] || 0) > 0)
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        let excess = Math.round((sumPending - clienteSaldoReal) * 100) / 100;
        for (const v of sorted) {
          if (excess <= 0.01) break;
          const reduce = Math.min(excess, saldoMap[v.id] || 0);
          saldoMap[v.id] = Math.round(((saldoMap[v.id] || 0) - reduce) * 100) / 100;
          excess = Math.round((excess - reduce) * 100) / 100;
        }
      }

      // Build payment details for ventas that had CC debt
      for (const ventaId of ventaIds) {
        if (!hadCCDebt[ventaId]) continue;
        if (!pagosMap[ventaId]) pagosMap[ventaId] = [];

        const saldo = saldoMap[ventaId] || 0;
        const venta = allVentas.find((v: any) => v.id === ventaId);
        // At this point pagosMap only has caja_movimientos (sale-time payments like efectivo/transfer)
        const paidAtSale = (pagosMap[ventaId] || []).reduce((s, p) => s + p.monto, 0);
        const totalPaid = venta?.monto_pagado || 0;
        const cobrosApplied = Math.max(0, totalPaid - paidAtSale); // cobro payments toward CC debt

        // Collect all known cobro payment entries for this venta
        const cobroPayments: PagoDetalle[] = [];

        // From cobro_items
        for (const ci of cobroItemsByVenta[ventaId] || []) {
          cobroPayments.push({
            metodo_pago: ci.forma_pago,
            monto: ci.monto,
            fecha: ci.fecha || undefined,
            descripcion: "Cobro posterior",
          });
        }

        // From CC haber entries linked to this venta (FIFO, clientes page)
        // Deduplicate: skip CC habers that match a cobro_items entry (same amount)
        const usedAmounts = cobroPayments.map((p) => p.monto);
        for (const ccH of ccHabersByVenta[ventaId] || []) {
          const matchIdx = usedAmounts.indexOf(ccH.haber);
          if (matchIdx >= 0) {
            usedAmounts.splice(matchIdx, 1);
            continue;
          }
          cobroPayments.push({
            metodo_pago: ccH.forma_pago,
            monto: ccH.haber,
            fecha: ccH.created_at || undefined,
            descripcion: "Cobro posterior",
          });
        }

        // Check for payment gap (cobro_saldo entries linked to other ventas)
        const totalTracked = cobroPayments.reduce((s, p) => s + p.monto, 0);
        if (cobrosApplied > 0 && totalTracked < cobrosApplied) {
          let gap = Math.round((cobrosApplied - totalTracked) * 100) / 100;
          // Try to find matching payment from client's unlinked CC habers
          for (let i = 0; i < clientCCHabers.length && gap > 0.5; i++) {
            const h = clientCCHabers[i];
            if (h.haber <= gap + 0.5) {
              cobroPayments.push({
                metodo_pago: h.forma_pago || "Pago",
                monto: Math.min(h.haber, gap),
                fecha: h.created_at || undefined,
                descripcion: "Cobro posterior",
              });
              gap = Math.round((gap - h.haber) * 100) / 100;
              clientCCHabers.splice(i, 1);
              i--;
            }
          }
          // If still a gap, add generic entry as last resort
          if (gap > 0.5) {
            cobroPayments.push({
              metodo_pago: "Pago",
              monto: gap,
              descripcion: "Cobro posterior",
            });
          }
        }

        // Add cobro payments to pagosMap
        for (const cp of cobroPayments) {
          pagosMap[ventaId].push(cp);
        }

        // Update or remove CC entry in pagosMap
        const ccIdx = pagosMap[ventaId].findIndex((p) => p.metodo_pago === "Cuenta Corriente");
        if (saldo <= 0) {
          if (ccIdx >= 0) pagosMap[ventaId].splice(ccIdx, 1);
        } else {
          if (ccIdx >= 0) {
            pagosMap[ventaId][ccIdx].monto = saldo;
          } else {
            pagosMap[ventaId].push({ metodo_pago: "Cuenta Corriente", monto: saldo });
          }
        }
      }

      // Build venta records with NCs and payment info
      const ventaRecords: Record<string, VentaRecord> = {};
      for (const v of allVentas) {
        ventaRecords[v.numero] = {
          id: v.id,
          numero: v.numero,
          tipo_comprobante: v.tipo_comprobante,
          fecha: v.fecha,
          created_at: v.created_at,
          forma_pago: v.forma_pago,
          total: v.total,
          origen: v.origen || "admin",
          estado: v.estado || undefined,
          entregado: v.entregado || false,
          items: (v as any).venta_items || [],
          notas_credito: ncMap[v.id] || [],
          pagos: pagosMap[v.id] || [],
          saldo_pendiente: Math.max(0, saldoMap[v.id] || 0),
        };
      }

      // Collect all producto_ids to check which are combos
      const allProductoIds = new Set<string>();
      for (const p of (data || [])) {
        for (const item of (p as any).pedido_tienda_items || []) {
          if (item.producto_id) allProductoIds.add(item.producto_id);
        }
      }
      for (const v of Object.values(ventaRecords)) {
        for (const item of v.items) {
          if (item.producto_id) allProductoIds.add(item.producto_id);
        }
      }

      // Fetch which products are combos
      let comboMap: Record<string, ComboComponent[]> = {};
      if (allProductoIds.size > 0) {
        const { data: combos } = await supabase
          .from("productos")
          .select("id")
          .eq("es_combo", true)
          .in("id", Array.from(allProductoIds));
        const comboIds = (combos || []).map((c: any) => c.id);
        if (comboIds.length > 0) {
          const { data: ci } = await supabase
            .from("combo_items")
            .select("combo_id, cantidad, productos!combo_items_producto_id_fkey(id, nombre)")
            .in("combo_id", comboIds);
          for (const item of ci || []) {
            const key = (item as any).combo_id;
            if (!comboMap[key]) comboMap[key] = [];
            comboMap[key].push({
              producto_id: (item as any).productos?.id || "",
              cantidad: (item as any).cantidad,
              nombre: (item as any).productos?.nombre || "",
            });
          }
        }
      }

      // Enrich venta items with combo info
      for (const v of Object.values(ventaRecords)) {
        v.items = v.items.map((item) => ({
          ...item,
          es_combo: !!(item.producto_id && comboMap[item.producto_id]),
          combo_items: item.producto_id ? comboMap[item.producto_id] || undefined : undefined,
        }));
      }

      // Helper: derive pedido estado from linked venta (source of truth)
      const deriveEstado = (pedidoEstado: string, venta?: VentaRecord): string => {
        if (!venta?.estado) return pedidoEstado;
        // Map venta estado to pedido-friendly estado
        if (venta.estado === "anulada") return "cancelado";
        if (venta.entregado || venta.estado === "entregado") return "entregado";
        // For other venta states, prefer pedidos_tienda estado if it's more specific
        // (e.g. "armado", "confirmado" are pedido-specific states not in ventas)
        if (["armado", "confirmado"].includes(pedidoEstado)) return pedidoEstado;
        return venta.estado;
      };

      // Map pedidos with their ventas
      const pedidosList: Pedido[] = (data || []).map((p: any) => {
        const venta = ventaRecords[p.numero] || undefined;
        // Prefer venta_items (source of truth after admin edits) over pedido_tienda_items
        const sourceItems = (venta?.items && venta.items.length > 0)
          ? venta.items.map((item: any) => ({
              id: 0,
              nombre: item.descripcion?.replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/i, "").replace(/\s*\((?:Unidad|Un)\)\s*$/i, "") || "",
              presentacion: item.presentacion || "Unidad",
              unidades_por_presentacion: item.unidades_por_presentacion || 1,
              cantidad: item.cantidad,
              precio_unitario: item.precio_unitario,
              descuento: item.descuento || 0,
              producto_id: item.producto_id || undefined,
              es_combo: !!(item.producto_id && comboMap[item.producto_id]),
              combo_items: item.producto_id ? comboMap[item.producto_id] || undefined : undefined,
            }))
          : ((p as any).pedido_tienda_items || []).map((item: any) => ({
              ...item,
              es_combo: !!(item.producto_id && comboMap[item.producto_id]),
              combo_items: item.producto_id ? comboMap[item.producto_id] || undefined : undefined,
            }));
        // If venta has no tracked payments yet, use pedidos_tienda payment split
        let ventaWithPagos = venta;
        if (ventaWithPagos && ventaWithPagos.pagos.length === 0) {
          const ptPagos: PagoDetalle[] = [];
          const mp = (p.metodo_pago || "").toLowerCase();
          if (mp === "mixto") {
            if (p.monto_efectivo > 0) ptPagos.push({ metodo_pago: "Efectivo (a cobrar)", monto: p.monto_efectivo });
            if (p.monto_transferencia > 0) ptPagos.push({ metodo_pago: "Transferencia (a cobrar)", monto: p.monto_transferencia });
          } else if (mp === "transferencia") {
            ptPagos.push({ metodo_pago: "Transferencia (a cobrar)", monto: p.total });
          } else if (mp === "efectivo") {
            ptPagos.push({ metodo_pago: "Efectivo (a cobrar)", monto: p.total });
          }
          if (ptPagos.length > 0) ventaWithPagos = { ...ventaWithPagos, pagos: ptPagos };
        } else if (!ventaWithPagos) {
          // No linked venta at all — build pagos from pedido data
          const ptPagos: PagoDetalle[] = [];
          const mp = (p.metodo_pago || "").toLowerCase();
          if (mp === "mixto") {
            if (p.monto_efectivo > 0) ptPagos.push({ metodo_pago: "Efectivo (a cobrar)", monto: p.monto_efectivo });
            if (p.monto_transferencia > 0) ptPagos.push({ metodo_pago: "Transferencia (a cobrar)", monto: p.monto_transferencia });
          } else if (mp === "transferencia") {
            ptPagos.push({ metodo_pago: "Transferencia (a cobrar)", monto: p.total });
          } else if (mp === "efectivo") {
            ptPagos.push({ metodo_pago: "Efectivo (a cobrar)", monto: p.total });
          }
          // Create a minimal venta-like record for display
          if (ptPagos.length > 0) {
            ventaWithPagos = {
              id: "", numero: p.numero, tipo_comprobante: "Pedido Web", fecha: "", created_at: p.created_at,
              forma_pago: p.metodo_pago || "", total: p.total, origen: "tienda",
              entregado: false, items: [], notas_credito: [], pagos: ptPagos, saldo_pendiente: p.total,
            };
          }
        }
        return {
          ...p,
          total: ventaWithPagos?.total ?? p.total,
          estado: deriveEstado(p.estado, ventaWithPagos),
          items: sourceItems,
          venta: ventaWithPagos,
        };
      });

      setPedidos(pedidosList);

      // Separate: ventas linked to pedidos stay with pedidos (web tab)
      // Remaining ventas split by origen: "tienda" = web, else = local
      const pedidoNumeros = new Set(pedidosList.map((p) => p.numero));
      const unlinkedVentas = Object.values(ventaRecords).filter(
        (v) => !pedidoNumeros.has(v.numero)
      );
      // Web ventas without a pedido_tienda (e.g. older orders) go to web tab as extra pedidos
      const webVentasExtra = unlinkedVentas.filter((v) => v.origen === "tienda");
      const posOnly = unlinkedVentas.filter((v) => v.origen !== "tienda");

      // Convert web ventas to pseudo-pedidos so they show in the web tab
      const extraPedidos: Pedido[] = webVentasExtra.map((v) => ({
        id: parseInt(v.id.replace(/\D/g, "").slice(0, 8)) || 0,
        numero: v.numero,
        created_at: v.created_at || v.fecha,
        estado: v.estado === "anulada" ? "cancelado" : v.entregado ? "entregado" : v.estado || "entregado",
        total: v.total,
        items: [],
        venta: v,
      }));
      setPedidos([...pedidosList, ...extraPedidos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setVentasPOS(posOnly.sort((a, b) => new Date(b.created_at || b.fecha).getTime() - new Date(a.created_at || a.fecha).getTime()));

      setLoading(false);
    };
    fetchData();
  }, []);

  const formatDate = (dateStr: string, includeTime = false) => {
    const date = new Date(dateStr);
    const datePart = date.toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    if (!includeTime) return datePart;
    const timePart = date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${datePart}, ${timePart}`;
  };

  // Debt summary component
  const DebtSummary = () => {
    const deudasPedidos = pedidos.filter((p) => p.venta && p.venta.saldo_pendiente > 0 && p.venta.estado !== "anulada").map((p) => ({ numero: p.venta!.numero, tipo: p.venta!.tipo_comprobante, monto: p.venta!.saldo_pendiente }));
    const deudasPOS = ventasPOS.filter((v) => v.saldo_pendiente > 0 && v.estado !== "anulada").map((v) => ({ numero: v.numero, tipo: v.tipo_comprobante, monto: v.saldo_pendiente }));
    const deudas = [...deudasPedidos, ...deudasPOS];
    const totalDeuda = deudas.reduce((s, d) => s + d.monto, 0);
    if (totalDeuda <= 0 && clienteSaldo <= 0) return null;
    const displayTotal = totalDeuda > 0 ? totalDeuda : clienteSaldo;
    return (
      <div className="mb-6 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-5 h-5 text-orange-600" />
          <span className="font-bold text-orange-800">Saldo pendiente: {formatCurrency(displayTotal)}</span>
        </div>
        <div className="space-y-1.5">
          {deudas.map((d) => (
            <div key={d.numero} className="flex justify-between items-center text-sm">
              <span className="text-orange-700">{d.tipo} {d.numero}</span>
              <span className="font-semibold text-orange-800">{formatCurrency(d.monto)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render a pedido web card
  const renderPedido = (pedido: Pedido) => {
    const badge = estadoBadge[pedido.estado] || { bg: "bg-gray-50", text: "text-gray-700", dot: "bg-gray-400" };
    const isExpanded = expanded === `pedido-${pedido.id}`;

    return (
      <div
        key={pedido.id}
        className={`bg-white rounded-2xl border transition-all duration-200 ${
          isExpanded ? "border-primary/20 shadow-lg" : "border-gray-100 hover:border-gray-200"
        }`}
      >
        <button
          onClick={() => setExpanded(isExpanded ? null : `pedido-${pedido.id}`)}
          className="w-full text-left p-5 md:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-1.5 text-gray-900">
                  <Hash className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-mono font-semibold text-sm">{pedido.numero}</span>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                  <span className="capitalize">{pedido.estado}</span>
                </span>
                {pedido.venta?.notas_credito && pedido.venta.notas_credito.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                    <AlertCircle className="w-3 h-3" />
                    NC
                  </span>
                )}
                {pedido.venta && pedido.venta.saldo_pendiente > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                    <DollarSign className="w-3 h-3" />
                    Saldo pendiente: {formatCurrency(pedido.venta.saldo_pendiente)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(pedido.created_at, true)}
                </span>
                <span className="text-gray-200">|</span>
                <span>
                  {(pedido.items.length > 0 ? pedido.items.length : (pedido.venta?.items?.length || 0))} {(pedido.items.length > 0 ? pedido.items.length : (pedido.venta?.items?.length || 0)) === 1 ? "producto" : "productos"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                {pedido.venta?.notas_credito && pedido.venta.notas_credito.length > 0 ? (
                  <>
                    <span className="text-sm text-gray-400 line-through">{formatCurrency(pedido.total)}</span>
                    <span className="text-lg font-bold text-primary ml-1">
                      {formatCurrency(pedido.total - pedido.venta.notas_credito.reduce((s, nc) => s + nc.total, 0))}
                    </span>
                  </>
                ) : (
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(pedido.total)}</span>
                )}
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                isExpanded ? "bg-primary/5" : "bg-gray-50"
              }`}>
                {isExpanded ? (
                  <ChevronUp className={`w-4 h-4 ${isExpanded ? "text-primary" : "text-gray-400"}`} />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </div>
          </div>
        </button>

        {isExpanded && (
          <div className="border-t border-gray-100 mx-5 md:mx-6">
            {/* Show pedido items if available, otherwise fall back to venta items */}
            {(pedido.items.length > 0 || (pedido.venta && pedido.venta.items.length > 0)) && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider">
                    <th className="py-3 text-left font-medium">Producto</th>
                    <th className="py-3 text-center font-medium">Cant.</th>
                    <th className="py-3 text-center font-medium">Desc%</th>
                    <th className="py-3 text-right font-medium">Precio</th>
                    <th className="py-3 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(pedido.items.length > 0 ? pedido.items.map((item) => ({
                    id: item.id,
                    nombre: item.nombre,
                    presentacion: item.presentacion,
                    unidades_por_presentacion: item.unidades_por_presentacion,
                    cantidad: item.cantidad,
                    precio_unitario: item.precio_unitario,
                    descuento: item.descuento || 0,
                    es_combo: item.es_combo,
                    combo_items: item.combo_items,
                  })) : (pedido.venta?.items || []).map((item, idx) => ({
                    id: idx,
                    nombre: item.descripcion,
                    presentacion: item.presentacion || "Unidad",
                    unidades_por_presentacion: item.unidades_por_presentacion,
                    cantidad: item.cantidad,
                    precio_unitario: item.precio_unitario,
                    descuento: item.descuento || 0,
                    es_combo: item.es_combo,
                    combo_items: item.combo_items,
                  }))).map((item) => {
                    const isMedio = item.presentacion && (item.presentacion.toLowerCase().includes("medio") || (item.unidades_por_presentacion != null && item.unidades_por_presentacion <= 0.5 && item.unidades_por_presentacion > 0));
                    const isBox = item.presentacion && item.presentacion !== "Unidad" && (item.unidades_por_presentacion || 1) > 1;
                    const isCombo = item.nombre.toLowerCase().includes("combo") || item.es_combo;
                    const displayPrice = item.precio_unitario;
                    let displayName = item.nombre
                      .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
                      .replace(/\s*\(Unidad\)$/, "")
                      .replace(/(\([^)]+\))\s*\1/gi, "$1")
                      .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
                      .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
                    const nameAlreadyHasPres = (isBox || isMedio) && displayName.toLowerCase().includes(isMedio ? "medio" : item.presentacion.toLowerCase());
                    if (isBox && !nameAlreadyHasPres) {
                      const presClean = item.presentacion.replace(/\s*\([^)]*\)\s*$/, "");
                      displayName = `${displayName} (${presClean})`;
                    }
                    const comboKey = `pedido-${pedido.id}-item-${item.id}`;
                    const hasComboDetail = item.es_combo && item.combo_items && item.combo_items.length > 0;
                    const isComboExpanded = expandedCombos.has(comboKey);
                    return (
                    <React.Fragment key={item.id}>
                    <tr className="border-t border-gray-50">
                      <td className="py-3 text-gray-700 font-medium">
                        <div className="flex items-center gap-1.5">
                          {hasComboDetail && (
                            <button onClick={() => toggleCombo(comboKey)} className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors">
                              {isComboExpanded ? <ChevronDown className="w-3.5 h-3.5 text-primary/80" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                          )}
                          <div>
                            <span className="flex items-center gap-1.5">
                              {displayName}
                              {isCombo && (
                                <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary/90">
                                  COMBO
                                </span>
                              )}
                            </span>
                            {isCombo && !hasComboDetail && (item.unidades_por_presentacion || 1) > 1 && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">
                                Combo de {item.unidades_por_presentacion} unidades
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-center text-gray-500">{isMedio ? item.cantidad * (item.unidades_por_presentacion || 0.5) : item.cantidad}</td>
                      <td className="py-3 text-center text-gray-500">
                        {item.descuento != null && item.descuento > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                            {item.descuento}%
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-gray-500">
                        {formatCurrency(displayPrice)}
                        {(isBox || isMedio) && <span className="block text-[10px] text-gray-400">{item.presentacion}</span>}
                      </td>
                      <td className="py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(item.precio_unitario * item.cantidad)}
                      </td>
                    </tr>
                    {hasComboDetail && isComboExpanded && item.combo_items!.map((ci, ciIdx) => (
                      <tr key={`${item.id}-ci-${ciIdx}`} className="bg-gray-50/50">
                        <td className="py-2 pl-10 text-gray-500 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-gray-300" />
                            {ci.nombre}
                          </span>
                        </td>
                        <td className="py-2 text-center text-gray-400 text-xs">{ci.cantidad * item.cantidad}</td>
                        <td className="py-2" />
                        <td className="py-2" />
                        <td className="py-2" />
                      </tr>
                    ))}
                    </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const itemsTotal = pedido.items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);
                    const ncTotal = pedido.venta?.notas_credito?.reduce((s, nc) => s + nc.total, 0) || 0;
                    const baseAfterNC = itemsTotal - ncTotal;
                    const fp = (pedido.venta?.forma_pago || "").toLowerCase();
                    const recPct = (pedido.venta as any)?.recargo_porcentaje || 0;
                    const mt = (pedido.venta as any)?.monto_transferencia || 0;
                    const recargoBase = fp.includes("mixto") ? Math.min(mt, baseAfterNC) : (fp.includes("transfer") ? baseAfterNC : 0);
                    const recargoAmt = recPct > 0 && recargoBase > 0 ? Math.round(recargoBase * recPct) / 100 : 0;
                    return (
                      <>
                        <tr className="border-t border-gray-200">
                          <td colSpan={4} className="py-2 text-right text-gray-500 text-xs">Subtotal</td>
                          <td className="py-2 text-right font-medium text-gray-700">{formatCurrency(itemsTotal)}</td>
                        </tr>
                        {ncTotal > 0 && (
                          <tr>
                            <td colSpan={4} className="py-1 text-right text-red-500 text-xs">Nota de Crédito</td>
                            <td className="py-1 text-right font-medium text-red-500">-{formatCurrency(ncTotal)}</td>
                          </tr>
                        )}
                        {recargoAmt > 0 && (
                          <tr>
                            <td colSpan={4} className="py-1 text-right text-violet-500 text-xs">Recargo transferencia ({recPct}%)</td>
                            <td className="py-1 text-right font-medium text-violet-600">+{formatCurrency(recargoAmt)}</td>
                          </tr>
                        )}
                        <tr className="border-t border-gray-200">
                          <td colSpan={4} className="py-3 text-right font-semibold text-gray-500 text-xs uppercase tracking-wider">Total</td>
                          <td className="py-3 text-right font-bold text-primary text-base">{formatCurrency(pedido.venta?.total || pedido.total)}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tfoot>
              </table>
            )}

            {/* Payment breakdown */}
            {pedido.venta && pedido.venta.pagos.length > 0 && (() => {
              const pagos = pedido.venta.pagos;
              if (pagos.length === 0) return null;
              return (
              <div className="mt-3 bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detalle de pago</p>
                <div className="space-y-2">
                  {pagos.map((p, idx) => {
                    const isHojaRuta = p.descripcion && (p.descripcion.toLowerCase().includes("hoja de ruta") || p.descripcion.toLowerCase().includes("entrega"));
                    const isCobro = p.descripcion && p.descripcion.toLowerCase().includes("cobro");
                    return (
                    <div key={idx} className="flex justify-between items-start text-sm">
                      <div>
                        <span className="text-gray-700 font-medium">{p.metodo_pago}</span>
                        {p.cuenta_bancaria && <span className="text-gray-400 text-xs ml-1">→ {p.cuenta_bancaria}</span>}
                        {p.fecha && (
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            {(() => { const d = new Date(p.fecha); return isNaN(d.getTime()) ? "" : `${d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}`; })()}
                            {isHojaRuta ? " — Pago al momento de entrega" : isCobro ? " — Cobro posterior" : ""}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-gray-900">{formatCurrency(p.monto)}</span>
                    </div>
                    );
                  })}
                </div>
                {pedido.venta.saldo_pendiente > 0 && (
                  <div className="mt-2 pt-2 border-t border-orange-200 flex justify-between text-sm">
                    <span className="text-orange-600 font-medium">Saldo pendiente</span>
                    <span className="font-bold text-orange-600">{formatCurrency(pedido.venta.saldo_pendiente)}</span>
                  </div>
                )}
              </div>
              );
            })()}
            {pedido.venta && pedido.venta.pagos.length === 0 && pedido.venta.forma_pago && (
              <div className="mt-3 bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Forma de pago</p>
                <p className="text-sm text-gray-700">{pedido.venta.forma_pago}</p>
              </div>
            )}

            {/* Notas de crédito — detail of credited items */}
            {pedido.venta?.notas_credito && pedido.venta.notas_credito.length > 0 && (
              <div className="mt-3 mb-4">
                {pedido.venta.notas_credito.map((nc) => (
                  <div key={nc.id} className="bg-red-50 rounded-xl p-4 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="text-sm font-semibold text-red-700">Nota de Crédito (detalle)</span>
                        <span className="text-xs text-red-500 font-mono">{nc.numero}</span>
                      </div>
                      <span className="text-sm font-bold text-red-600">-{formatCurrency(nc.total)}</span>
                    </div>
                    {nc.items.length > 0 && (
                      <div className="space-y-1">
                        {nc.items.map((ni, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-red-600">
                            <span>{ni.cantidad}x {ni.descripcion.replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "").replace(/\s*\(Unidad\)$/, "").replace(/(\([^)]+\))\s*\1/gi, "$1")}</span>
                            <span>-{formatCurrency(ni.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {/* Total final already shown in the items tfoot breakdown above */}
              </div>
            )}

            {/* Volver a pedir */}
            {pedido.estado === "entregado" && pedido.items && pedido.items.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const stored = localStorage.getItem("carrito");
                    let carrito: any[];
                    try { const _p = stored ? JSON.parse(stored) : []; carrito = Array.isArray(_p) ? _p : []; } catch { carrito = []; }
                    for (const item of pedido.items) {
                      const existing = carrito.find((c: any) => c.nombre === item.nombre);
                      if (!existing) {
                        carrito.push({
                          id: `reorder_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                          nombre: item.nombre,
                          precio: item.precio_unitario,
                          imagen_url: null,
                          cantidad: item.cantidad,
                          presentacion: "Unidad",
                        });
                      }
                    }
                    localStorage.setItem("carrito", JSON.stringify(carrito));
                    window.dispatchEvent(new Event("cart-updated"));
                    showToast("Productos agregados al carrito", { subtitle: `${pedido.items.length} productos del pedido #${pedido.numero}` });
                  }}
                  className="w-full text-sm font-medium text-primary hover:bg-primary/5 rounded-xl py-2.5 transition"
                >
                  Volver a pedir
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render a POS venta card
  const renderVentaPOS = (v: VentaRecord) => {
    const isExp = expanded === `venta-${v.id}`;
    const hasNC = v.notas_credito.length > 0;
    return (
      <div
        key={v.id}
        className={`bg-white rounded-2xl border transition-all duration-200 ${
          isExp ? "border-indigo-200 shadow-lg" : "border-gray-100 hover:border-gray-200"
        }`}
      >
        <button
          onClick={() => setExpanded(isExp ? null : `venta-${v.id}`)}
          className="w-full text-left p-5 md:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-1.5 text-gray-900">
                  <Hash className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-mono font-semibold text-sm">{v.numero}</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  {v.tipo_comprobante}
                </span>
                {v.estado === "anulada" && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    Cancelada
                  </span>
                )}
                {v.entregado && v.estado !== "anulada" && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Entregado
                  </span>
                )}
                {hasNC && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                    <AlertCircle className="w-3 h-3" />
                    NC
                  </span>
                )}
                {v.saldo_pendiente > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                    <DollarSign className="w-3 h-3" />
                    Saldo pendiente: {formatCurrency(v.saldo_pendiente)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(v.created_at || (v.fecha + "T12:00:00"), true)}
                </span>
                <span className="text-gray-200">|</span>
                <span>{v.items.length} {v.items.length === 1 ? "producto" : "productos"}</span>
                <span className="text-gray-200">|</span>
                <span>{v.forma_pago}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                {v.notas_credito.length > 0 ? (
                  <>
                    <span className="text-sm text-gray-400 line-through">{formatCurrency(v.total)}</span>
                    <span className="text-lg font-bold text-indigo-600 ml-1">
                      {formatCurrency(v.total - v.notas_credito.reduce((s, nc) => s + nc.total, 0))}
                    </span>
                  </>
                ) : (
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(v.total)}</span>
                )}
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isExp ? "bg-indigo-50" : "bg-gray-50"}`}>
                {isExp ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </div>
          </div>
        </button>

        {isExp && (
          <div className="border-t border-gray-100 mx-5 md:mx-6">
            {v.items.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider">
                    <th className="py-3 text-left font-medium">Producto</th>
                    <th className="py-3 text-center font-medium">Cant.</th>
                    <th className="py-3 text-center font-medium">Desc%</th>
                    <th className="py-3 text-right font-medium">Precio</th>
                    <th className="py-3 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {v.items.map((item, idx) => {
                    const isMedioV = item.presentacion && (item.presentacion.toLowerCase().includes("medio") || (item.unidades_por_presentacion != null && item.unidades_por_presentacion <= 0.5 && item.unidades_por_presentacion > 0));
                    const isBox = item.presentacion && item.presentacion !== "Unidad" && (item.unidades_por_presentacion || 1) > 1;
                    const isCombo = (item.descripcion || "").toLowerCase().includes("combo") || item.es_combo;
                    const displayPriceV = item.precio_unitario;
                    const displayName = (item.descripcion || "")
                      .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
                      .replace(/\s*\(Unidad\)$/, "")
                      .replace(/(\([^)]+\))\s*\1/gi, "$1")
                      .replace(/\s*\(Caja \(x[\d.]+\)\)$/, "")
                      .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
                      .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1");
                    const comboKey = `venta-${v.id}-item-${idx}`;
                    const hasComboDetail = item.es_combo && item.combo_items && item.combo_items.length > 0;
                    const isComboExpanded = expandedCombos.has(comboKey);
                    return (
                    <React.Fragment key={idx}>
                    <tr className="border-t border-gray-50">
                      <td className="py-3 text-gray-700 font-medium">
                        <div className="flex items-center gap-1.5">
                          {hasComboDetail && (
                            <button onClick={() => toggleCombo(comboKey)} className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors">
                              {isComboExpanded ? <ChevronDown className="w-3.5 h-3.5 text-indigo-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                          )}
                          <div>
                            <span className="flex items-center gap-1.5">
                              {displayName}
                              {isCombo && (
                                <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary/90">
                                  COMBO
                                </span>
                              )}
                            </span>
                            {isCombo && !hasComboDetail && (item.unidades_por_presentacion || 1) > 1 && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">
                                Combo de {item.unidades_por_presentacion} unidades
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-center text-gray-500">{isMedioV ? item.cantidad * (item.unidades_por_presentacion || 0.5) : item.cantidad}</td>
                      <td className="py-3 text-center text-gray-500">
                        {item.descuento != null && item.descuento > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                            {item.descuento}%
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-gray-500">
                        {formatCurrency(displayPriceV)}
                        {(isBox || isMedioV) && item.presentacion && <span className="block text-[10px] text-gray-400">{item.presentacion}</span>}
                      </td>
                      <td className="py-3 text-right font-semibold text-gray-900">{formatCurrency(item.subtotal)}</td>
                    </tr>
                    {hasComboDetail && isComboExpanded && item.combo_items!.map((ci, ciIdx) => (
                      <tr key={`${idx}-ci-${ciIdx}`} className="bg-gray-50/50">
                        <td className="py-2 pl-10 text-gray-500 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-gray-300" />
                            {ci.nombre}
                          </span>
                        </td>
                        <td className="py-2 text-center text-gray-400 text-xs">{ci.cantidad * item.cantidad}</td>
                        <td className="py-2" />
                        <td className="py-2" />
                        <td className="py-2" />
                      </tr>
                    ))}
                    </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td colSpan={4} className="py-3 text-right font-semibold text-gray-500 text-xs uppercase tracking-wider">Total</td>
                    <td className="py-3 text-right font-bold text-indigo-600 text-base">{formatCurrency(v.total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Payment breakdown */}
            {v.pagos.length > 0 && (() => {
              const pagos = v.pagos;
              if (pagos.length === 0) return null;
              return (
              <div className="mt-3 bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detalle de pago</p>
                <div className="space-y-2">
                  {pagos.map((p, idx) => {
                    const isHojaRuta = p.descripcion && (p.descripcion.toLowerCase().includes("hoja de ruta") || p.descripcion.toLowerCase().includes("entrega"));
                    const isCobro = p.descripcion && p.descripcion.toLowerCase().includes("cobro");
                    return (
                    <div key={idx} className="flex justify-between items-start text-sm">
                      <div>
                        <span className="text-gray-700 font-medium">{p.metodo_pago}</span>
                        {p.cuenta_bancaria && <span className="text-gray-400 text-xs ml-1">→ {p.cuenta_bancaria}</span>}
                        {p.fecha && (
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            {(() => { const d = new Date(p.fecha); return isNaN(d.getTime()) ? "" : `${d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}`; })()}
                            {isHojaRuta ? " — Pago al momento de entrega" : isCobro ? " — Cobro posterior" : ""}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-gray-900">{formatCurrency(p.monto)}</span>
                    </div>
                    );
                  })}
                </div>
                {v.saldo_pendiente > 0 && (
                  <div className="mt-2 pt-2 border-t border-orange-200 flex justify-between text-sm">
                    <span className="text-orange-600 font-medium">Saldo pendiente</span>
                    <span className="font-bold text-orange-600">{formatCurrency(v.saldo_pendiente)}</span>
                  </div>
                )}
              </div>
              );
            })()}
            {v.pagos.length === 0 && v.forma_pago && (
              <div className="mt-3 bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Forma de pago</p>
                <p className="text-sm text-gray-700">{v.forma_pago}</p>
              </div>
            )}

            {v.notas_credito.length > 0 && (
              <div className="mt-3 mb-4">
                {v.notas_credito.map((nc) => (
                  <div key={nc.id} className="bg-red-50 rounded-xl p-4 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="text-sm font-semibold text-red-700">Nota de Crédito</span>
                        <span className="text-xs text-red-500 font-mono">{nc.numero}</span>
                      </div>
                      <span className="text-sm font-bold text-red-600">-{formatCurrency(nc.total)}</span>
                    </div>
                    {nc.items.length > 0 && (
                      <div className="space-y-1">
                        {nc.items.map((ni, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-red-600">
                            <span>{ni.cantidad}x {ni.descripcion.replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "").replace(/\s*\(Unidad\)$/, "").replace(/(\([^)]+\))\s*\1/gi, "$1")}</span>
                            <span>-{formatCurrency(ni.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-red-200">
                  <span className="text-sm font-semibold text-gray-700">Total final</span>
                  <span className="text-lg font-bold text-indigo-600">
                    {formatCurrency(v.total - v.notas_credito.reduce((s, nc) => s + nc.total, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back button */}
      <Link
        href="/cuenta"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-primary transition-colors mb-6 text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a mi cuenta
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Pedidos</h1>
          <p className="text-gray-400 text-sm mt-1">
            {pedidos.length + ventasPOS.length > 0
              ? `${pedidos.length + ventasPOS.length} ${(pedidos.length + ventasPOS.length) === 1 ? "registro" : "registros"} en total`
              : "Tu historial de compras"}
          </p>
        </div>
      </div>

      {/* Debt summary */}
      <DebtSummary />

      {/* Tabs */}
      {!loading && (pedidos.length > 0 || ventasPOS.length > 0) && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
          <button
            onClick={() => setActiveTab("web")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === "web"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Globe className="w-4 h-4" />
            Pedidos Web
            {pedidos.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "web" ? "bg-primary/10 text-primary/90" : "bg-gray-200 text-gray-500"}`}>
                {pedidos.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("local")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === "local"
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Store className="w-4 h-4" />
            Compras en local
            {ventasPOS.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "local" ? "bg-indigo-100 text-indigo-700" : "bg-gray-200 text-gray-500"}`}>
                {ventasPOS.length}
              </span>
            )}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-20 h-4 bg-gray-200 rounded" />
                <div className="w-24 h-4 bg-gray-100 rounded" />
                <div className="w-16 h-6 bg-gray-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (pedidos.length === 0 && ventasPOS.length === 0) ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No tenés pedidos todavía</p>
          <p className="text-gray-400 text-sm mt-1">Cuando hagas tu primera compra, aparecerá acá</p>
          <Link
            href="/"
            className="inline-block mt-5 bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Ir a la tienda
          </Link>
        </div>
      ) : (
        <>
          {/* Web orders tab */}
          {activeTab === "web" && (
            <div className="space-y-4">
              {pedidos.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                  <Globe className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No tenés pedidos web</p>
                  <p className="text-gray-400 text-sm mt-1">Tus pedidos de la tienda online aparecerán acá</p>
                </div>
              ) : (
                pedidos.map(renderPedido)
              )}
            </div>
          )}

          {/* In-store purchases tab */}
          {activeTab === "local" && (
            <div className="space-y-4">
              {ventasPOS.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                  <Store className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No tenés compras en local</p>
                  <p className="text-gray-400 text-sm mt-1">Tus compras presenciales aparecerán acá</p>
                </div>
              ) : (
                ventasPOS.map(renderVentaPOS)
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
