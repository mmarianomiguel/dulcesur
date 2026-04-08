"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronLeft, Loader2, CheckCheck, BellOff, BellRing, Info } from "lucide-react";
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
  const [pushCheckDone, setPushCheckDone] = useState(false);

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

  // Check push support (safely for iOS standalone)
  useEffect(() => {
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotif = "Notification" in window;
    const supported = hasSW && hasPush && hasNotif;
    setPushSupported(supported);
    if (hasNotif) {
      setPushPermission(Notification.permission);
    }
  }, []);

  // Check push subscription
  useEffect(() => {
    if (!pushSupported || !cliente) {
      setPushCheckDone(true);
      return;
    }

    const check = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const res = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
          if (res.ok) {
            const data = await res.json();
            setPushSubscribed(data.subscribed);
          }
        }
      } catch {
        // SW not registered or push not available - fail gracefully
      } finally {
        setPushCheckDone(true);
      }
    };
    check();
  }, [pushSupported, cliente]);

  // Load preferences
  useEffect(() => {
    if (!cliente) return;
    fetch(`/api/notificaciones/preferencias?cliente_id=${cliente.id}`)
      .then((r) => r.ok ? r.json() : {})
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, [cliente]);

  // Load notifications
  const fetchNotifs = useCallback(async () => {
    if (!cliente) return;
    try {
      const res = await fetch(`/api/notificaciones/cliente?cliente_id=${cliente.id}&limit=50`);
      if (!res.ok) { setNotifsLoading(false); return; }
      const data = await res.json();
      // Filter out entries with deleted notifications
      const valid = (data.data || []).filter((n: any) => n.notificacion);
      setNotifs(valid);
    } catch {}
    setNotifsLoading(false);
  }, [cliente]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  useEffect(() => { if (cliente) setLoading(false); }, [cliente]);

  // Register SW for tienda if needed
  const ensureSW = async () => {
    if (!("serviceWorker" in navigator)) return null;
    try {
      let reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js");
      }
      // Wait for it to be ready
      return await navigator.serviceWorker.ready;
    } catch {
      return null;
    }
  };

  // Toggle push
  const togglePush = async () => {
    if (!cliente) return;
    setPushToggling(true);
    try {
      if (pushSubscribed) {
        // Unsubscribe
        const reg = await ensureSW();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subscription: sub.toJSON(), action: "unsubscribe" }),
            });
            await sub.unsubscribe();
          }
        }
        setPushSubscribed(false);
        showToast("Notificaciones desactivadas");
      } else {
        // Subscribe
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        if (permission !== "granted") {
          showToast("Permiso denegado. Habilitá las notificaciones en la configuración de tu navegador.", { type: "error" });
          setPushToggling(false);
          return;
        }
        const reg = await ensureSW();
        if (!reg) {
          showToast("No se pudo registrar el servicio de notificaciones", { type: "error" });
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
        showToast("Notificaciones activadas");
      }
    } catch (err) {
      console.error("Push toggle error:", err);
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
      fetch("/api/notificaciones/leer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    }
    if (n.notificacion?.url) router.push(n.notificacion.url);
  };

  const marcarTodas = async () => {
    if (!cliente) return;
    fetch("/api/notificaciones/leer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todas: true, cliente_id: cliente.id }),
    }).catch(() => {});
    setNotifs((prev) => prev.map((x) => ({ ...x, leida: true })));
    showToast("Todas marcadas como leídas");
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // Custom toggle component with inline styles for iOS compatibility
  const Toggle = ({ checked, onChange, disabled, small }: { checked: boolean; onChange: () => void; disabled?: boolean; small?: boolean }) => {
    const w = small ? 36 : 44;
    const h = small ? 20 : 24;
    const dot = small ? 16 : 20;
    const travel = w - dot - 4;
    return (
      <button
        onClick={onChange}
        disabled={disabled}
        style={{
          width: w,
          height: h,
          borderRadius: h / 2,
          backgroundColor: checked ? "var(--color-primary, #2980b9)" : "#d1d5db",
          position: "relative",
          transition: "background-color 0.2s",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? travel + 2 : 2,
            width: dot,
            height: dot,
            borderRadius: "50%",
            backgroundColor: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }}
        />
      </button>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
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
          <div className="flex items-start gap-3 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
            <Info className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Notificaciones no disponibles</p>
              <p className="text-xs mt-0.5 text-gray-400">Tu navegador o dispositivo no soporta notificaciones push. Proba abrir la tienda desde Chrome (Android) o Safari (iPhone).</p>
            </div>
          </div>
        ) : pushPermission === "denied" ? (
          <div className="flex items-start gap-3 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
            <BellOff className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Notificaciones bloqueadas</p>
              <p className="text-xs mt-0.5">Habilitálas desde la configuración de tu navegador o dispositivo.</p>
            </div>
          </div>
        ) : !pushCheckDone ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
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
              <Toggle checked={pushSubscribed} onChange={togglePush} disabled={pushToggling} />
            </div>

            {/* Per-type toggles */}
            {pushSubscribed && !prefsLoading && (
              <div className="space-y-1 border-t pt-3">
                {TIPOS.map((t) => (
                  <div key={t.key} className="flex items-center justify-between py-2.5 px-1">
                    <div className="mr-3">
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-gray-400">{t.description}</div>
                    </div>
                    <Toggle checked={prefs[t.key] !== false} onChange={() => togglePref(t.key)} small />
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
          <h2 className="font-semibold text-gray-900">Historial</h2>
          {notifs.some((n) => !n.leida) && (
            <button onClick={marcarTodas} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <CheckCheck className="h-3.5 w-3.5" /> Marcar leídas
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
                className={`w-full text-left p-3 rounded-xl transition-colors active:bg-gray-100 ${!n.leida ? "bg-blue-50/60 hover:bg-blue-50" : "hover:bg-gray-50"}`}
              >
                <div className="flex items-start gap-2.5">
                  {!n.leida && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                  <div className={!n.leida ? "" : "ml-[18px]"}>
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
