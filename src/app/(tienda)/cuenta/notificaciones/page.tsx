"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronLeft, Loader2, CheckCheck, BellOff, BellRing } from "lucide-react";
import { showToast } from "@/components/tienda/toast";

const TIPOS = [
  { key: "pedido", label: "Pedidos", description: "Actualizaciones de tus pedidos" },
  { key: "promocion", label: "Promociones", description: "Ofertas y descuentos" },
  { key: "recordatorio", label: "Recordatorios", description: "Recordatorios y avisos" },
  { key: "catalogo", label: "Novedades", description: "Nuevos productos y catálogo" },
  { key: "cuenta_corriente", label: "Cuenta corriente", description: "Movimientos de tu cuenta" },
];

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

interface ClienteAuth {
  id: number;
  nombre: string;
  email: string;
}

export default function NotificacionesClientePage() {
  const router = useRouter();
  const [cliente, setCliente] = useState<ClienteAuth | null>(null);
  const [loading, setLoading] = useState(true);

  // Push state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushToggling, setPushToggling] = useState(false);

  // Preferences
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [prefsLoading, setPrefsLoading] = useState(true);

  // Notifications
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(true);

  // Init
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (!stored) { window.location.href = "/cuenta"; return; }
      const p = JSON.parse(stored);
      if (!p?.id) { window.location.href = "/cuenta"; return; }
      setCliente(p);
    } catch {
      window.location.href = "/cuenta";
    }
  }, []);

  // Check push support
  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in navigator;
    setPushSupported(supported);
    if (supported && "Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  // Check push subscription
  useEffect(() => {
    if (!pushSupported || !cliente) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const res = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
        const data = await res.json();
        setPushSubscribed(data.subscribed);
      }
    });
  }, [pushSupported, cliente]);

  // Load preferences
  useEffect(() => {
    if (!cliente) return;
    fetch(`/api/notificaciones/preferencias?cliente_id=${cliente.id}`)
      .then((r) => r.json())
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, [cliente]);

  // Load notifications
  const fetchNotifs = useCallback(async () => {
    if (!cliente) return;
    try {
      const res = await fetch(`/api/notificaciones/cliente?cliente_id=${cliente.id}&limit=50`);
      const data = await res.json();
      setNotifs(data.data || []);
    } catch {}
    setNotifsLoading(false);
  }, [cliente]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  useEffect(() => { if (cliente) setLoading(false); }, [cliente]);

  // Toggle push
  const togglePush = async () => {
    if (!pushSupported || !cliente) return;
    setPushToggling(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushSubscribed) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: sub.toJSON(), action: "unsubscribe" }),
          });
          await sub.unsubscribe();
        }
        setPushSubscribed(false);
        showToast("Notificaciones push desactivadas");
      } else {
        // Subscribe
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        if (permission !== "granted") {
          showToast("Permiso denegado. Habilitá las notificaciones en tu navegador.", { type: "error" });
          setPushToggling(false);
          return;
        }
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), cliente_id: cliente.id }),
        });
        setPushSubscribed(true);
        showToast("Notificaciones push activadas");
      }
    } catch {
      showToast("Error al cambiar notificaciones", { type: "error" });
    } finally {
      setPushToggling(false);
    }
  };

  // Toggle preference
  const togglePref = async (tipo: string) => {
    if (!cliente) return;
    const newVal = !prefs[tipo];
    setPrefs((p) => ({ ...p, [tipo]: newVal }));
    try {
      await fetch("/api/notificaciones/preferencias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: cliente.id, tipo, push_enabled: newVal }),
      });
    } catch {
      setPrefs((p) => ({ ...p, [tipo]: !newVal }));
      showToast("Error al guardar preferencia", { type: "error" });
    }
  };

  // Mark as read
  const handleNotifClick = async (n: any) => {
    if (!n.leida) {
      await fetch("/api/notificaciones/leer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    }
    if (n.notificacion?.url) router.push(n.notificacion.url);
  };

  const marcarTodas = async () => {
    if (!cliente) return;
    await fetch("/api/notificaciones/leer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todas: true, cliente_id: cliente.id }),
    });
    setNotifs((prev) => prev.map((x) => ({ ...x, leida: true })));
    showToast("Todas marcadas como leídas");
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/cuenta" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-3">
          <ChevronLeft className="h-4 w-4" /> Mi Cuenta
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
        </div>
      </div>

      {/* Push preferences */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Preferencias de notificación</h2>

        {!pushSupported ? (
          <div className="flex items-center gap-3 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
            <BellOff className="h-5 w-5 shrink-0" />
            Tu navegador no soporta notificaciones push
          </div>
        ) : pushPermission === "denied" ? (
          <div className="flex items-center gap-3 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
            <BellOff className="h-5 w-5 shrink-0" />
            Las notificaciones están bloqueadas. Habilitálas desde la configuración de tu navegador.
          </div>
        ) : (
          <>
            {/* Master toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                {pushSubscribed ? <BellRing className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5 text-gray-400" />}
                <div>
                  <div className="font-medium text-sm">Recibir notificaciones push</div>
                  <div className="text-xs text-gray-400">{pushSubscribed ? "Activadas" : "Desactivadas"}</div>
                </div>
              </div>
              <button
                onClick={togglePush}
                disabled={pushToggling}
                className={`relative w-11 h-6 rounded-full transition-colors ${pushSubscribed ? "bg-primary" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${pushSubscribed ? "translate-x-5" : ""}`} />
              </button>
            </div>

            {/* Per-type toggles */}
            {pushSubscribed && !prefsLoading && (
              <div className="space-y-1 border-t pt-3">
                {TIPOS.map((t) => (
                  <div key={t.key} className="flex items-center justify-between py-2.5 px-1">
                    <div>
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-gray-400">{t.description}</div>
                    </div>
                    <button
                      onClick={() => togglePref(t.key)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors ${prefs[t.key] !== false ? "bg-primary" : "bg-gray-300"}`}
                      style={{ width: 40, height: 22 }}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${prefs[t.key] !== false ? "translate-x-[18px]" : ""}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Notification history */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Historial de notificaciones</h2>
          {notifs.some((n) => !n.leida) && (
            <button onClick={marcarTodas} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como leídas
            </button>
          )}
        </div>

        {notifsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">No tenés notificaciones recientes</div>
        ) : (
          <div className="space-y-1">
            {notifs.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className={`w-full text-left p-3 rounded-xl transition-colors ${!n.leida ? "bg-blue-50/60 hover:bg-blue-50" : "hover:bg-gray-50"}`}
              >
                <div className="flex items-start gap-2">
                  {!n.leida && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                  <div className={!n.leida ? "" : "ml-4"}>
                    <div className="font-medium text-sm text-gray-900">{n.notificacion?.titulo}</div>
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.notificacion?.mensaje}</div>
                    <div className="text-xs text-gray-400 mt-1">{tiempoRelativo(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
