"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  subtitle?: string;
  type: ToastType;
  exiting: boolean;
  count: number; // cuántas veces se disparó el mismo message (para dedup).
  pulseKey: number; // cambia para retriggerear la animación shake.
}

const TOAST_CONFIG: Record<ToastType, { icon: typeof CheckCircle; bg: string; text: string; progress: string }> = {
  success: { icon: CheckCircle, bg: "bg-green-50", text: "text-green-600", progress: "bg-green-500" },
  error: { icon: AlertCircle, bg: "bg-red-50", text: "text-red-600", progress: "bg-red-500" },
  info: { icon: Info, bg: "bg-blue-50", text: "text-blue-600", progress: "bg-blue-500" },
};

let toastId = 0;

export function showToast(
  message: string,
  options?: { type?: ToastType; subtitle?: string } | ToastType
) {
  const opts = typeof options === "string" ? { type: options } : options;
  window.dispatchEvent(
    new CustomEvent("show-toast", {
      detail: { message, type: opts?.type || "success", subtitle: opts?.subtitle },
    })
  );
}

const MAX_STACK = 3; // máximo toasts visibles a la vez.

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Timers por id, para poder reiniciar cuando se deduplica.
  const dismissTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
    if (dismissTimers.current[id]) {
      clearTimeout(dismissTimers.current[id]);
      delete dismissTimers.current[id];
    }
  }, []);

  const scheduleDismiss = useCallback((id: number, type: ToastType) => {
    if (dismissTimers.current[id]) clearTimeout(dismissTimers.current[id]);
    const duration = type === "error" ? 2500 : 1800;
    dismissTimers.current[id] = setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  useEffect(() => {
    function handler(e: Event) {
      const { message, type, subtitle } = (e as CustomEvent).detail;
      const toastType: ToastType = type || "success";
      setToasts((prev) => {
        // Dedup: si ya existe un toast no-exiting con el mismo message, lo actualizamos.
        const existing = prev.find((t) => !t.exiting && t.message === message);
        if (existing) {
          scheduleDismiss(existing.id, toastType);
          return prev.map((t) =>
            t.id === existing.id
              ? { ...t, count: t.count + 1, subtitle: subtitle || t.subtitle, type: toastType, pulseKey: t.pulseKey + 1 }
              : t
          );
        }
        // Cap de stack: si hay MAX_STACK activos, descartamos el más viejo.
        const id = ++toastId;
        scheduleDismiss(id, toastType);
        const next = [...prev, { id, message, type: toastType, subtitle, exiting: false, count: 1, pulseKey: 0 }];
        if (next.filter((t) => !t.exiting).length > MAX_STACK) {
          const oldest = next.find((t) => !t.exiting);
          if (oldest) {
            // Lo marcamos exiting inmediato; el cleanup automático lo remueve.
            return next.map((t) => (t.id === oldest.id ? { ...t, exiting: true } : t));
          }
        }
        return next;
      });
    }
    window.addEventListener("show-toast", handler);
    return () => window.removeEventListener("show-toast", handler);
  }, [scheduleDismiss]);

  // Limpieza de toasts marcados exiting por el cap (después de la animación).
  useEffect(() => {
    const exiting = toasts.filter((t) => t.exiting);
    if (exiting.length === 0) return;
    const timeouts = exiting.map((t) =>
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 300)
    );
    return () => timeouts.forEach(clearTimeout);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col-reverse gap-3 items-center pointer-events-none">
      {toasts.map((t) => {
        const config = TOAST_CONFIG[t.type];
        const Icon = config.icon;
        const duration = t.type === "error" ? 2.5 : 1.8;

        return (
          <div
            key={t.id}
            className="pointer-events-auto"
            style={{
              animation: t.exiting
                ? "toast-out 0.3s ease-in forwards"
                : "toast-in 0.4s cubic-bezier(0.21,1.02,0.73,1) forwards",
            }}
          >
            <div
              key={`pulse-${t.pulseKey}`}
              className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 min-w-[200px] max-w-[85vw] sm:max-w-[380px]"
              style={t.pulseKey > 0 ? { animation: "toast-pulse 0.3s ease-out" } : undefined}
            >
              <div className={`relative flex h-9 w-9 items-center justify-center rounded-full ${config.bg} shrink-0`}>
                <Icon className={`h-[18px] w-[18px] ${config.text}`} />
                {t.count > 1 && (
                  <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full ${config.progress} text-white text-[10px] font-bold flex items-center justify-center`}>
                    {t.count}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 leading-tight">{t.message}</p>
                {t.subtitle && (
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{t.subtitle}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-full p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mx-4 mt-0 h-[2px] rounded-full bg-gray-100 overflow-hidden">
              <div
                key={`progress-${t.id}-${t.pulseKey}`}
                className={`h-full ${config.progress} rounded-full`}
                style={{ animation: `toast-progress ${duration}s linear forwards` }}
              />
            </div>
          </div>
        );
      })}

      <style jsx>{`
        @keyframes toast-in {
          0% { opacity: 0; transform: translateY(16px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toast-out {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(8px) scale(0.95); }
        }
        @keyframes toast-progress {
          0% { width: 100%; }
          100% { width: 0%; }
        }
        @keyframes toast-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
