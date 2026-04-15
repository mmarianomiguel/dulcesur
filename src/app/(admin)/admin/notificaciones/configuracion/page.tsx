"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Loader2,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Moon,
  Clock,
  ShoppingCart,
  PackageCheck,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { showAdminToast } from "@/components/admin-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { NotificacionPlantilla } from "@/types/database";

const TIPOS = [
  { value: "pedido", label: "Pedidos", description: "Confirmación, en camino, listo para retirar" },
  { value: "promocion", label: "Promociones", description: "Ofertas, descuentos y comunicaciones comerciales" },
  { value: "recordatorio", label: "Recordatorios", description: "Carrito abandonado, inactividad" },
  { value: "catalogo", label: "Catálogo", description: "Nuevos productos, actualizaciones" },
  { value: "cuenta_corriente", label: "Cuenta Corriente", description: "Pagos registrados, saldos pendientes" },
  { value: "sistema", label: "Sistema", description: "Caja abierta, alertas del sistema" },
];

const PUSH_CATEGORIES = [
  { key: "push_pedidos_nuevos", label: "Pedidos nuevos", description: "Cuando un cliente hace un pedido desde la tienda", icon: ShoppingCart },
  { key: "push_pedidos_armados", label: "Pedidos armados", description: "Cuando un armador termina de preparar un pedido", icon: PackageCheck },
  { key: "push_clientes_nuevos", label: "Clientes nuevos", description: "Cuando se registra un nuevo cliente", icon: UserPlus },
  { key: "push_stock_bajo", label: "Stock bajo", description: "Cuando un producto tiene pocas unidades", icon: AlertTriangle },
];

interface AdminConfig {
  push_pedidos_nuevos: boolean;
  push_pedidos_armados: boolean;
  push_clientes_nuevos: boolean;
  push_stock_bajo: boolean;
  sonido_enabled: boolean;
  dnd_enabled: boolean;
  dnd_hora_inicio: string;
  dnd_hora_fin: string;
}

const DEFAULTS: AdminConfig = {
  push_pedidos_nuevos: true,
  push_pedidos_armados: true,
  push_clientes_nuevos: true,
  push_stock_bajo: true,
  sonido_enabled: true,
  dnd_enabled: false,
  dnd_hora_inicio: "22:00",
  dnd_hora_fin: "08:00",
};

export default function NotificacionesConfigPage() {
  const currentUser = useCurrentUser();
  const [plantillas, setPlantillas] = useState<NotificacionPlantilla[]>([]);
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchPlantillas = useCallback(async () => {
    try {
      const res = await fetch("/api/notificaciones/plantillas");
      const data = await res.json();
      setPlantillas(data);
    } catch {
      showAdminToast("Error al cargar plantillas", "error");
    }
  }, []);

  const fetchAdminConfig = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`/api/admin/notif-config?usuario_id=${currentUser.id}`);
      const data = await res.json();
      if (!data.error) {
        setAdminConfig({
          push_pedidos_nuevos: data.push_pedidos_nuevos ?? true,
          push_pedidos_armados: data.push_pedidos_armados ?? true,
          push_clientes_nuevos: data.push_clientes_nuevos ?? true,
          push_stock_bajo: data.push_stock_bajo ?? true,
          sonido_enabled: data.sonido_enabled ?? true,
          dnd_enabled: data.dnd_enabled ?? false,
          dnd_hora_inicio: data.dnd_hora_inicio ?? "22:00",
          dnd_hora_fin: data.dnd_hora_fin ?? "08:00",
        });
      }
    } catch {}
  }, [currentUser?.id]);

  useEffect(() => {
    Promise.all([fetchPlantillas(), fetchAdminConfig()]).finally(() => setLoading(false));
  }, [fetchPlantillas, fetchAdminConfig]);

  const saveAdminConfig = async (updates: Partial<AdminConfig>) => {
    if (!currentUser?.id) return;
    const newConfig = { ...adminConfig, ...updates };
    setAdminConfig(newConfig);
    setSavingConfig(true);
    try {
      await fetch("/api/admin/notif-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: currentUser.id, ...newConfig }),
      });
      showAdminToast("Configuración guardada", "success");
    } catch {
      showAdminToast("Error al guardar", "error");
    } finally {
      setSavingConfig(false);
    }
  };

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
        `${TIPOS.find((t) => t.value === tipo)?.label} ${newState ? "activadas" : "desactivadas"}`,
        "success"
      );
    } catch {
      showAdminToast("Error al actualizar", "error");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#FF2D6B]" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#FFE0EC] flex items-center justify-center shrink-0">
          <Settings className="h-4 w-4 text-[#99003D]" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-[#12131A]">Configuración de Notificaciones</h1>
          <p className="text-xs text-[#6B7080] hidden sm:block">Push, sonidos y horarios</p>
        </div>
      </div>

      {/* ── Section 1: Push Notifications para Admin ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
          <Bell className="h-4 w-4 text-[#FF2D6B]" />
          <div>
            <h2 className="font-semibold text-sm text-[#12131A]">Notificaciones Push</h2>
            <p className="text-xs text-[#6B7080]">Elegí qué alertas querés recibir en tu dispositivo</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {PUSH_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const enabled = adminConfig[cat.key as keyof AdminConfig] as boolean;
            return (
              <div key={cat.key} className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${enabled ? "bg-[#FFE0EC]" : "bg-gray-100"}`}>
                    <Icon className={`h-4 w-4 ${enabled ? "text-[#99003D]" : "text-[#6B7080]"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#12131A]">{cat.label}</p>
                    <p className="text-xs text-[#6B7080]">{cat.description}</p>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => saveAdminConfig({ [cat.key]: v })}
                  disabled={savingConfig}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Sonido ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
          {adminConfig.sonido_enabled ? (
            <Volume2 className="h-4 w-4 text-[#FF2D6B]" />
          ) : (
            <VolumeX className="h-4 w-4 text-[#6B7080]" />
          )}
          <div>
            <h2 className="font-semibold text-sm text-[#12131A]">Sonido</h2>
            <p className="text-xs text-[#6B7080]">Sonido de alerta cuando llega un pedido nuevo</p>
          </div>
        </div>
        <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${adminConfig.sonido_enabled ? "bg-[#D4F5E2]" : "bg-gray-100"}`}>
              {adminConfig.sonido_enabled ? (
                <Volume2 className="h-4 w-4 text-[#1A7A45]" />
              ) : (
                <VolumeX className="h-4 w-4 text-[#6B7080]" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-[#12131A]">
                {adminConfig.sonido_enabled ? "Sonido activado" : "Sonido desactivado"}
              </p>
              <p className="text-xs text-[#6B7080]">Beep al recibir pedidos en el listado de ventas</p>
            </div>
          </div>
          <Switch
            checked={adminConfig.sonido_enabled}
            onCheckedChange={(v) => saveAdminConfig({ sonido_enabled: v })}
            disabled={savingConfig}
          />
        </div>
      </div>

      {/* ── Section 3: No molestar ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
          <Moon className="h-4 w-4 text-[#FF2D6B]" />
          <div>
            <h2 className="font-semibold text-sm text-[#12131A]">No molestar</h2>
            <p className="text-xs text-[#6B7080]">Silenciar push fuera de horario laboral</p>
          </div>
        </div>
        <div className="px-4 sm:px-5 py-3.5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${adminConfig.dnd_enabled ? "bg-[#B3EFFF]" : "bg-gray-100"}`}>
                <Moon className={`h-4 w-4 ${adminConfig.dnd_enabled ? "text-[#006080]" : "text-[#6B7080]"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-[#12131A]">
                  {adminConfig.dnd_enabled ? "Modo no molestar activo" : "Modo no molestar desactivado"}
                </p>
                <p className="text-xs text-[#6B7080]">No se envían push entre las horas configuradas</p>
              </div>
            </div>
            <Switch
              checked={adminConfig.dnd_enabled}
              onCheckedChange={(v) => saveAdminConfig({ dnd_enabled: v })}
              disabled={savingConfig}
            />
          </div>

          {adminConfig.dnd_enabled && (
            <div className="flex items-center gap-3 pl-11">
              <Clock className="h-4 w-4 text-[#6B7080] shrink-0" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#6B7080]">De</span>
                <input
                  type="time"
                  value={adminConfig.dnd_hora_inicio}
                  onChange={(e) => saveAdminConfig({ dnd_hora_inicio: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-[#12131A] focus:outline-none focus:ring-2 focus:ring-[#FF2D6B] focus:border-transparent"
                />
                <span className="text-[#6B7080]">a</span>
                <input
                  type="time"
                  value={adminConfig.dnd_hora_fin}
                  onChange={(e) => saveAdminConfig({ dnd_hora_fin: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-[#12131A] focus:outline-none focus:ring-2 focus:ring-[#FF2D6B] focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Tipos de notificación (clientes) ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
          <BellOff className="h-4 w-4 text-[#FF2D6B]" />
          <div>
            <h2 className="font-semibold text-sm text-[#12131A]">Notificaciones a clientes</h2>
            <p className="text-xs text-[#6B7080]">Activar/desactivar tipos globalmente. Bloquea incluso si el cliente las tiene activadas.</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {TIPOS.map((tipo) => {
            const count = tipoCount(tipo.value);
            const active = isTipoActive(tipo.value);
            return (
              <div key={tipo.value} className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#12131A]">{tipo.label}</p>
                  <p className="text-xs text-[#6B7080]">{tipo.description}</p>
                  <p className="text-[11px] text-[#6B7080]/60 mt-1">
                    {count === 0 ? "Sin plantillas" : `${count} plantilla${count !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <div className="shrink-0">
                  {count > 0 ? (
                    <Switch
                      checked={active}
                      onCheckedChange={() => handleToggleTipo(tipo.value)}
                      disabled={toggling === tipo.value}
                    />
                  ) : (
                    <span className="text-xs text-[#6B7080]/50">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
