"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDateARG } from "@/lib/formatters";

interface Pedido {
  id: string;
  created_at: string;
  estado: string;
  total: number;
  numero: number | null;
}

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-700" },
  confirmado: { label: "Confirmado", color: "bg-blue-100 text-blue-700" },
  en_preparacion: { label: "En preparación", color: "bg-indigo-100 text-indigo-700" },
  enviado: { label: "Enviado", color: "bg-purple-100 text-purple-700" },
  entregado: { label: "Entregado", color: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-700" },
};

export default function HistorialPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [clienteId, setClienteId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (stored) {
        const p = JSON.parse(stored);
        if (p?.id) setClienteId(p.id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (clienteId === null) { setLoading(false); return; }
    supabase
      .from("ventas")
      .select("id, created_at, estado, total, numero")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setPedidos((data as Pedido[]) || []);
        setLoading(false);
      });
  }, [clienteId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (clienteId === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Package className="mx-auto h-16 w-16 text-gray-200 mb-4" />
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Iniciá sesión para ver tus pedidos</h2>
        <Link href="/cuenta" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition mt-4">
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cuenta" className="text-gray-400 hover:text-primary transition">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Mis pedidos</h1>
      </div>

      {pedidos.length === 0 ? (
        <div className="text-center py-16">
          <Package className="mx-auto h-16 w-16 text-gray-200 mb-4" />
          <p className="text-gray-500">Todavía no realizaste ningún pedido.</p>
          <Link href="/productos" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition mt-4">
            Ver productos
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const est = ESTADO_LABEL[p.estado] ?? { label: p.estado, color: "bg-gray-100 text-gray-600" };
            return (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm hover:shadow-md transition">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.numero && <span className="text-sm font-semibold text-gray-900">Pedido #{p.numero}</span>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${est.color}`}>{est.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{formatDateARG(p.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(p.total)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
