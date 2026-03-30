"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Puzzle,
  Lock,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Truck,
  ShoppingBag,
  CreditCard,
  BarChart3,
  FileText,
  Globe,
  Settings,
  UserCheck,
} from "lucide-react";

const allModulos = ["Dashboard", "Ventas", "Clientes", "Productos", "Proveedores", "Compras", "Caja", "Stock", "Reportes", "Vendedores", "Auditoría", "Tienda Online", "Configuración"] as const;
const alwaysEnabled = ["Dashboard", "Configuración"];

const MODULE_META: Record<string, { icon: typeof Puzzle; description: string }> = {
  Dashboard: { icon: LayoutDashboard, description: "Panel principal con resumen de actividad" },
  Ventas: { icon: ShoppingCart, description: "Gestión de ventas y facturación" },
  Clientes: { icon: Users, description: "Base de datos de clientes" },
  Productos: { icon: Package, description: "Catálogo de productos y precios" },
  Proveedores: { icon: Truck, description: "Gestión de proveedores" },
  Compras: { icon: ShoppingBag, description: "Órdenes de compra" },
  Caja: { icon: CreditCard, description: "Movimientos de caja y arqueos" },
  Stock: { icon: Package, description: "Control de stock y ajustes" },
  Reportes: { icon: BarChart3, description: "Informes y estadísticas" },
  Vendedores: { icon: UserCheck, description: "Comisiones y configuración de vendedores" },
  "Auditoría": { icon: FileText, description: "Historial de acciones del sistema" },
  "Tienda Online": { icon: Globe, description: "E-commerce y pedidos online" },
  Configuración: { icon: Settings, description: "Ajustes del sistema" },
};

export default function ModulosPage() {
  const [modulos, setModulos] = useState<Record<string, boolean>>(() => {
    const def: Record<string, boolean> = {};
    allModulos.forEach((m) => (def[m] = true));
    return def;
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem("modulos_habilitados");
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged: Record<string, boolean> = {};
        allModulos.forEach((m) => (merged[m] = parsed[m] !== undefined ? parsed[m] : true));
        alwaysEnabled.forEach((m) => (merged[m] = true));
        setModulos(merged);
      }
    } catch {}
  }, []);

  const toggleModulo = (name: string) => {
    if (alwaysEnabled.includes(name)) return;
    const updated = { ...modulos, [name]: !modulos[name] };
    setModulos(updated);
    localStorage.setItem("modulos_habilitados", JSON.stringify(updated));
    window.dispatchEvent(new Event("modulos_updated"));
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <Puzzle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Módulos</h1>
          <p className="text-sm text-muted-foreground">
            Activá o desactivá secciones del sistema
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {allModulos.map((mod) => {
          const enabled = modulos[mod];
          const locked = alwaysEnabled.includes(mod);
          const meta = MODULE_META[mod] || { icon: Puzzle, description: "" };
          const ModIcon = meta.icon;
          return (
            <Card key={mod} className={cn("transition-all", !enabled && !locked && "opacity-60")}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      enabled ? "bg-primary/10" : "bg-muted"
                    )}>
                      <ModIcon className={cn("w-5 h-5", enabled ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{mod}</p>
                        {locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => toggleModulo(mod)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      enabled ? "bg-emerald-500" : "bg-gray-300",
                      locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out",
                        enabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Dashboard y Configuración siempre están habilitados.</p>
    </div>
  );
}
