"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  Send,
  Clock,
  Settings,
  Users,
  BarChart3,
  Loader2,
  ChevronRight,
  Inbox,
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

function tiempoRelativo(fecha: string): string {
  const diff = Date.now() - new Date(fecha).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

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
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Bell className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Notificaciones</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">Mantené informados a tus clientes</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-muted/50 rounded-xl p-3 sm:p-5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2 sm:mb-3">
            <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold">{stats.hoy}</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Enviadas hoy</div>
        </div>
        <div className="bg-muted/50 rounded-xl p-3 sm:p-5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-green-50 flex items-center justify-center mb-2 sm:mb-3">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold">{stats.suscriptores}</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Suscriptores</div>
        </div>
        <div className="bg-muted/50 rounded-xl p-3 sm:p-5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-2 sm:mb-3">
            <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold">{stats.tasaLectura}%</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Leídas 7d</div>
        </div>
      </div>

      {/* Acción principal: Enviar */}
      <Link
        href="/admin/notificaciones/enviar"
        className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl p-4 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-all"
      >
        <div className="w-10 h-10 rounded-lg bg-white/60 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
          <Send className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-blue-800 dark:text-blue-200">Enviar notificación</div>
          <div className="text-xs text-blue-600/70 dark:text-blue-400 mt-0.5">Mandá un mensaje a uno o todos tus clientes</div>
        </div>
        <ChevronRight className="h-4 w-4 text-blue-400 shrink-0" />
      </Link>

      {/* Acciones secundarias */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {[
          { href: "/admin/notificaciones/historial", label: "Historial", desc: "Ver notificaciones enviadas", icon: Clock, color: "text-amber-600 bg-amber-50" },
          { href: "/admin/notificaciones/configuracion", label: "Configuración", desc: "Activar o desactivar tipos", icon: Settings, color: "text-muted-foreground bg-muted" },
        ].map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 bg-white dark:bg-gray-900 border rounded-xl p-3.5 hover:border-border/80 hover:shadow-sm transition-all group"
            >
              <div className={`w-9 h-9 rounded-lg ${link.color} flex items-center justify-center shrink-0`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm group-hover:text-primary transition-colors">{link.label}</div>
                <div className="text-xs text-muted-foreground hidden sm:block mt-0.5">{link.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Últimas notificaciones */}
      <div className="bg-white dark:bg-gray-900 border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Últimas enviadas</h2>
          <Link href="/admin/notificaciones/historial" className="text-xs text-primary hover:underline">
            Ver todo
          </Link>
        </div>
        {recientes.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No hay notificaciones aún</p>
          </div>
        ) : (
          <div className="divide-y">
            {recientes.map((n: any) => (
              <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                <Badge className={`${TIPO_COLORS[n.tipo] || ""} shrink-0 text-[10px] px-1.5 py-0`}>
                  {TIPO_LABELS[n.tipo] || n.tipo}
                </Badge>
                <span className="text-sm truncate flex-1">{n.titulo}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{tiempoRelativo(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
