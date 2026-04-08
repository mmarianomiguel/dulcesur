"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function tiempoRelativo(fecha: string): string {
  const diff = Date.now() - new Date(fecha).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} hs`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

interface NotifItem {
  id: string;
  leida: boolean;
  created_at: string;
  notificacion: {
    id: string;
    titulo: string;
    mensaje: string;
    tipo: string;
    url: string | null;
  };
}

export default function NotificationBell({ clienteId }: { clienteId: number }) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch(`/api/notificaciones/cliente?cliente_id=${clienteId}&limit=10`);
      const data = await res.json();
      setNotifs(data.data || []);
      setNoLeidas(data.no_leidas || 0);
    } catch {}
  }, [clienteId]);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleClick = async (n: NotifItem) => {
    if (!n.leida) {
      await fetch("/api/notificaciones/leer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      setNoLeidas((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.notificacion.url) router.push(n.notificacion.url);
  };

  const marcarTodas = async () => {
    await fetch("/api/notificaciones/leer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todas: true, cliente_id: clienteId }),
    });
    setNotifs((prev) => prev.map((x) => ({ ...x, leida: true })));
    setNoLeidas(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 hover:text-primary"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
            {noLeidas > 99 ? "99+" : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-semibold text-sm">Notificaciones</span>
            {noLeidas > 0 && (
              <button onClick={marcarTodas} className="text-xs text-primary hover:underline">
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No tenés notificaciones</div>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors ${
                    !n.leida ? "bg-blue-50/50" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.leida && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    <div className={!n.leida ? "" : "ml-4"}>
                      <div className="font-medium text-sm">{n.notificacion.titulo}</div>
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.notificacion.mensaje}</div>
                      <div className="text-xs text-gray-400 mt-1">{tiempoRelativo(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <Link href="/cuenta/notificaciones" onClick={() => setOpen(false)} className="block text-center text-sm text-primary font-medium py-3 border-t hover:bg-gray-50 transition-colors">
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
