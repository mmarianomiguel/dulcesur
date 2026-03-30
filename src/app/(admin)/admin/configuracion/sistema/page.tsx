"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Puzzle,
  Shield,
  Loader2,
  Lock,
  Download,
  Upload,
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
  Cog,
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

type Section = "modulos" | "backup";

const NAV_ITEMS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "modulos", label: "Módulos", icon: <Puzzle className="w-4 h-4" /> },
  { key: "backup", label: "Backup", icon: <Shield className="w-4 h-4" /> },
];

export default function SistemaConfigPage() {
  const [activeSection, setActiveSection] = useState<Section>("modulos");
  const [modulos, setModulos] = useState<Record<string, boolean>>(() => {
    const def: Record<string, boolean> = {};
    allModulos.forEach((m) => (def[m] = true));
    return def;
  });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

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
          <Cog className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Sistema</h1>
          <p className="text-sm text-muted-foreground">
            Módulos del sistema y backup de datos
          </p>
        </div>
      </div>

      {/* Body: Sidebar + Content */}
      <div className="flex gap-6">
        {/* Left Sidebar Nav */}
        <nav className="w-56 shrink-0 hidden md:block">
          <div className="sticky top-6 space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeSection === item.key
                    ? "bg-accent text-foreground border-l-[3px] border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile tabs */}
        <div className="flex gap-1 md:hidden w-full mb-4">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeSection === item.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* Right content area */}
        <div className="flex-1 min-w-0">
          {/* ======================== MODULOS ======================== */}
          {activeSection === "modulos" && (
            <div>
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
              <p className="text-xs text-muted-foreground mt-4">Dashboard y Configuración siempre están habilitados.</p>
            </div>
          )}

          {/* ======================== BACKUP ======================== */}
          {activeSection === "backup" && (
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Exportar Backup</CardTitle>
                  <CardDescription>Descarga un archivo JSON con todos los datos del sistema</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={async () => {
                      try {
                        showAdminToast("Generando backup...");
                        const res = await fetch("/api/backup");
                        if (!res.ok) throw new Error("Error al generar backup");
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        showAdminToast("Backup descargado correctamente");
                      } catch {
                        showAdminToast("Error al generar el backup", "error");
                      }
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Backup
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Restaurar Backup</CardTitle>
                  <CardDescription>Restaura los datos desde un archivo JSON previamente exportado. Esto reemplazará todos los datos actuales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <input
                    id="backup-restore-input"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const inputEl = e.target;
                      setConfirmDialog({
                        open: true,
                        title: "Restaurar backup",
                        message: "Esto reemplazará TODOS los datos actuales. ¿Estás seguro?",
                        onConfirm: async () => {
                          try {
                            showAdminToast("Restaurando backup...");
                            const text = await file.text();
                            const json = JSON.parse(text);
                            const res = await fetch("/api/backup", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(json),
                            });
                            const result = await res.json();
                            if (!res.ok) throw new Error(result.error);
                            showAdminToast(`Backup restaurado: ${result.success_count} tablas exitosas`);
                          } catch {
                            showAdminToast("Error al restaurar el backup", "error");
                          }
                          inputEl.value = "";
                        },
                      });
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById("backup-restore-input")?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Seleccionar archivo JSON
                  </Button>
                  <p className="text-xs text-destructive">
                    Advertencia: La restauración eliminará los datos actuales y los reemplazará con los del backup.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => { if (!o) { setConfirmDialog(prev => ({ ...prev, open: false })); const el = document.getElementById("backup-restore-input") as HTMLInputElement; if (el) el.value = ""; } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirmDialog.title}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmDialog.message}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => { setConfirmDialog(prev => ({ ...prev, open: false })); const el = document.getElementById("backup-restore-input") as HTMLInputElement; if (el) el.value = ""; }}>Cancelar</Button>
            <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })); }}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
