"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { showAdminToast } from "@/components/admin-toast";
import type { NotificacionPlantilla } from "@/types/database";

const TIPOS = [
  { value: "pedido", label: "Pedidos", description: "Notificaciones relacionadas a pedidos: confirmación, en camino, listo para retirar" },
  { value: "promocion", label: "Promociones", description: "Ofertas, descuentos y comunicaciones comerciales" },
  { value: "recordatorio", label: "Recordatorios", description: "Recordatorios automáticos: carrito abandonado, inactividad" },
  { value: "catalogo", label: "Catálogo", description: "Nuevos productos, actualizaciones de catálogo" },
  { value: "cuenta_corriente", label: "Cuenta Corriente", description: "Pagos registrados, saldos pendientes" },
  { value: "sistema", label: "Sistema", description: "Notificaciones internas: caja abierta, alertas del sistema" },
];

export default function NotificacionesConfigPage() {
  const [plantillas, setPlantillas] = useState<NotificacionPlantilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchPlantillas = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones/plantillas");
      const data = await res.json();
      setPlantillas(data);
    } catch {
      showAdminToast("Error al cargar configuración", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlantillas(); }, [fetchPlantillas]);

  const isTipoActive = (tipo: string): boolean => {
    const tipoPlantillas = plantillas.filter((p) => p.tipo === tipo);
    if (tipoPlantillas.length === 0) return true;
    return tipoPlantillas.some((p) => p.activa);
  };

  const tipoCount = (tipo: string): number => {
    return plantillas.filter((p) => p.tipo === tipo).length;
  };

  const handleToggleTipo = async (tipo: string) => {
    const tipoPlantillas = plantillas.filter((p) => p.tipo === tipo);
    if (tipoPlantillas.length === 0) return;

    const newState = !isTipoActive(tipo);
    setToggling(tipo);

    try {
      await Promise.all(
        tipoPlantillas.map((p) =>
          fetch("/api/notificaciones/plantillas", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: p.id, activa: newState }),
          })
        )
      );

      setPlantillas((prev) =>
        prev.map((p) => (p.tipo === tipo ? { ...p, activa: newState } : p))
      );

      showAdminToast(
        `Notificaciones de ${TIPOS.find((t) => t.value === tipo)?.label} ${newState ? "activadas" : "desactivadas"}`,
        "success"
      );
    } catch {
      showAdminToast("Error al actualizar", "error");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Configuración de Notificaciones</h1>
      </div>

      <div className="space-y-3">
        {TIPOS.map((tipo) => {
          const count = tipoCount(tipo.value);
          const active = isTipoActive(tipo.value);
          return (
            <div key={tipo.value} className="bg-white dark:bg-gray-900 border rounded-xl p-5 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold">{tipo.label}</div>
                <div className="text-sm text-gray-500 mt-0.5">{tipo.description}</div>
                <div className="text-xs text-gray-400 mt-1">{count} plantilla{count !== 1 ? "s" : ""} configurada{count !== 1 ? "s" : ""}</div>
              </div>
              <div className="shrink-0 ml-4">
                {count > 0 ? (
                  <Switch
                    checked={active}
                    onCheckedChange={() => handleToggleTipo(tipo.value)}
                    disabled={toggling === tipo.value}
                  />
                ) : (
                  <span className="text-xs text-gray-400">Sin plantillas</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
