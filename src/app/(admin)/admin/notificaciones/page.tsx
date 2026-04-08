"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  Send,
  FileText,
  Clock,
  Settings,
  Users,
  BarChart3,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { formatDateARG } from "@/lib/formatters";

const TIPO_COLORS: Record<string, string> = {
  pedido: "bg-blue-100 text-blue-700",
  promocion: "bg-green-100 text-green-700",
  recordatorio: "bg-amber-100 text-amber-700",
  catalogo: "bg-purple-100 text-purple-700",
  cuenta_corriente: "bg-rose-100 text-rose-700",
  sistema: "bg-gray-100 text-gray-700",
};

const TIPO_LABELS: Record<string, string> = {
  pedido: "Pedido",
  promocion: "Promoción",
  recordatorio: "Recordatorio",
  catalogo: "Catálogo",
  cuenta_corriente: "Cta. Cte.",
  sistema: "Sistema",
};

export default function NotificacionesDashboard() {
  const [stats, setStats] = useState({ hoy: 0, suscriptores: 0, tasaLectura: 0 });
  const [recientes, setRecientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
          { count: hoy },
          { count: suscriptores },
          { data: destRecientes },
          { data: notifs },
        ] = await Promise.all([
          supabase.from("notificaciones").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
          supabase.from("push_subscriptions").select("*", { count: "exact", head: true }),
          supabase.from("notificacion_destinatarios").select("leida").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
          supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(5),
        ]);

        const totalDest = destRecientes?.length || 0;
        const leidas = destRecientes?.filter((d: any) => d.leida).length || 0;
        const tasa = totalDest > 0 ? Math.round((leidas / totalDest) * 100) : 0;

        setStats({ hoy: hoy ?? 0, suscriptores: suscriptores ?? 0, tasaLectura: tasa });
        setRecientes(notifs || []);
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const quickLinks = [
    { href: "/admin/notificaciones/enviar", label: "Enviar notificación", icon: Send, color: "text-blue-600 bg-blue-50" },
    { href: "/admin/notificaciones/plantillas", label: "Plantillas", icon: FileText, color: "text-purple-600 bg-purple-50" },
    { href: "/admin/notificaciones/historial", label: "Historial", icon: Clock, color: "text-amber-600 bg-amber-50" },
    { href: "/admin/notificaciones/configuracion", label: "Configuración", icon: Settings, color: "text-gray-600 bg-gray-100" },
  ];

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Notificaciones</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Send className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.hoy}</div>
              <div className="text-sm text-gray-500">Enviadas hoy</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.suscriptores}</div>
              <div className="text-sm text-gray-500">Suscriptores activos</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.tasaLectura}%</div>
              <div className="text-sm text-gray-500">Tasa de lectura (7 días)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className="bg-white dark:bg-gray-900 border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all group">
              <div className={`w-10 h-10 rounded-lg ${link.color} flex items-center justify-center mb-3`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-medium text-sm group-hover:text-primary transition-colors">{link.label}</div>
            </Link>
          );
        })}
      </div>

      {/* Recent notifications */}
      {recientes.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Últimas notificaciones</h2>
            <Link href="/admin/notificaciones/historial" className="text-sm text-primary hover:underline">Ver todo</Link>
          </div>
          <div className="space-y-2">
            {recientes.map((n: any) => (
              <div key={n.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge className={`${TIPO_COLORS[n.tipo] || ""} shrink-0`}>{TIPO_LABELS[n.tipo] || n.tipo}</Badge>
                  <span className="text-sm font-medium truncate">{n.titulo}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-3">{formatDateARG(n.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
