"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, X, AlertCircle, Info } from "lucide-react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  exiting: boolean;
}

let toastId = 0;

export function showAdminToast(message: string, type: "success" | "error" | "info" = "success") {
  window.dispatchEvent(new CustomEvent("admin-toast", { detail: { message, type } }));
}

export default function AdminToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const { message, type } = (e as CustomEvent).detail;
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message, type: type || "success", exiting: false }]);
      setTimeout(() => dismiss(id), 3500);
    }
    window.addEventListener("admin-toast", handler);
    return () => window.removeEventListener("admin-toast", handler);
  }, [dismiss]);

  if (toasts.length === 0) return null;

  const iconMap = {
    success: <CheckCircle className="w-4 h-4 text-emerald-500" />,
    error: <AlertCircle className="w-4 h-4 text-red-500" />,
    info: <Info className="w-4 h-4 text-blue-500" />,
  };

  const borderMap = {
    success: "border-emerald-500/30",
    error: "border-red-500/30",
    info: "border-blue-500/30",
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto"
          style={{
            animation: t.exiting
              ? "admin-toast-out 0.3s ease-in forwards"
              : "admin-toast-in 0.3s ease-out forwards",
          }}
        >
          <div className={`flex items-center gap-2.5 rounded-lg border ${borderMap[t.type]} bg-background px-4 py-3 text-sm shadow-lg min-w-[200px] max-w-[85vw] sm:max-w-[400px]`}>
            {iconMap[t.type]}
            <span className="flex-1 font-medium">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <style jsx>{`
        @keyframes admin-toast-in {
          0% { opacity: 0; transform: translateX(16px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes admin-toast-out {
          0% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(16px); }
        }
      `}</style>
    </div>
  );
}
