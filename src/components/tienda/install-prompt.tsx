"use client";

import { useEffect, useState } from "react";
import { Bell, X, Smartphone } from "lucide-react";

const DISMISS_KEY = "install_prompt_dismissed";
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) return false;
    const ts = Number(stored);
    const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return days < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function dismiss() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
}

async function ensureSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    let reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
    return await navigator.serviceWorker.ready;
  } catch { return null; }
}

interface InstallPromptProps {
  clienteId: number | null;
}

export default function InstallPrompt({ clienteId }: InstallPromptProps) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"android" | "ios-install" | "ios-notif" | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!clienteId) return;
    if (isDismissed()) return;

    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotif = "Notification" in window;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isPWA = window.matchMedia("(display-mode: standalone)").matches;

    // Verificar si ya tiene push activado
    const checkPush = async () => {
      if (hasSW && hasPush) {
        try {
          const reg = await navigator.serviceWorker.getRegistration("/");
          if (reg) {
            const sub = await reg.pushManager.getSubscription();
            if (sub) return; // Ya tiene push — no mostrar nada
          }
        } catch {}
      }

      // Determinar modo
      if (!isIOS) {
        // Android u otro — push sin instalar
        if (hasSW && hasPush && hasNotif && Notification.permission !== "denied") {
          setMode("android");
          setVisible(true);
        }
      } else if (isPWA) {
        // iOS con app instalada
        if (hasSW && hasPush && hasNotif && Notification.permission !== "denied") {
          setMode("ios-notif");
          setVisible(true);
        }
      } else {
        // iOS sin app instalada
        setMode("ios-install");
        setVisible(true);
      }
    };

    checkPush();
  }, [clienteId]);

  const handleClose = () => {
    dismiss();
    setVisible(false);
  };

  const handleActivar = async () => {
    if (!clienteId) return;
    setActivating(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        handleClose();
        return;
      }
      const reg = await ensureSW();
      if (!reg) { handleClose(); return; }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), cliente_id: clienteId }),
      });
      dismiss();
      setVisible(false);
    } catch {
      handleClose();
    } finally {
      setActivating(false);
    }
  };

  if (!visible || !mode) return null;

  /* ── iOS sin app instalada ── */
  if (mode === "ios-install") {
    return (
      <div className="mx-3 mt-3 md:mx-auto md:max-w-md bg-white rounded-2xl border border-indigo-100 p-4 shadow-sm">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">Instala la app para recibir avisos</p>
            <p className="text-xs text-gray-500 mt-0.5">Solo lleva 3 segundos desde Safari</p>
          </div>
          <button onClick={handleClose} className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2.5 border-t border-gray-50 pt-3">
          {[
            { n: 1, text: "Tocá el botón compartir de Safari", icon: "↑" },
            { n: 2, text: 'Seleccioná "Agregar a pantalla de inicio"', icon: "⊞" },
            { n: 3, text: "Abrí la app desde tu pantalla de inicio", icon: "✓" },
          ].map((step) => (
            <div key={step.n} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {step.n}
              </div>
              <p className="text-xs text-gray-700 flex-1">{step.text}</p>
              <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-gray-500 text-xs shrink-0">
                {step.icon}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Android o iOS con app — activar notificaciones ── */
  return (
    <div className="mx-3 mt-3 md:mx-auto md:max-w-md bg-white rounded-2xl border border-amber-100 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">Recibí avisos de tus pedidos</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Activá las notificaciones y te avisamos cuando tu pedido esté listo o en camino.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleActivar}
              disabled={activating}
              className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-60"
            >
              {activating ? "Activando..." : "Activar ahora"}
            </button>
            <button
              onClick={handleClose}
              className="px-3 py-2 text-gray-400 text-xs rounded-xl hover:bg-gray-50 transition-colors"
            >
              Ahora no
            </button>
          </div>
        </div>
        <button onClick={handleClose} className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
