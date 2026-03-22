"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Empresa, Usuario } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Building2,
  User,
  Printer,
  Receipt,
  Shield,
  Puzzle,
  Loader2,
  Check,
  FileText,
  Eye,
  Landmark,
  Plus,
  Pencil,
  Trash2,
  Settings,
  CreditCard,
  Image,
  Info,
  SlidersHorizontal,
  ShoppingCart,
  Users,
  Package,
  Truck,
  ShoppingBag,
  BarChart3,
  Globe,
  LayoutDashboard,
  Lock,
  Download,
  Upload,
} from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";

// ─── Receipt config (shared with POS via receipt-print-view.tsx) ───
import type { ReceiptConfig } from "@/components/receipt-print-view";
import { defaultReceiptConfig } from "@/components/receipt-print-view";

// ─── Bank accounts config ───
interface CuentaBancaria {
  id: string;
  nombre: string;
  tipo: string;
  cbu_cvu: string;
  alias: string;
}

function loadCuentasBancarias(): CuentaBancaria[] {
  try {
    const stored = localStorage.getItem("cuentas_bancarias");
    if (stored) return JSON.parse(stored);
  } catch (err) { console.error("Config load error:", err); }
  return [];
}

function saveCuentasBancarias(cuentas: CuentaBancaria[]) {
  localStorage.setItem("cuentas_bancarias", JSON.stringify(cuentas));
}

function loadReceiptConfig(): ReceiptConfig {
  try {
    const stored = localStorage.getItem("receipt_config");
    if (stored) return { ...defaultReceiptConfig, ...JSON.parse(stored) };
  } catch (err) { console.error("Config load error:", err); }
  return defaultReceiptConfig;
}

function saveReceiptConfig(config: ReceiptConfig) {
  localStorage.setItem("receipt_config", JSON.stringify(config));
}

type Section = "empresa" | "facturacion" | "impresion" | "comprobantes" | "cuentas" | "modulos" | "backup";

const NAV_ITEMS: { id: Section; label: string; icon: typeof Building2; description: string }[] = [
  { id: "empresa", label: "Empresa", icon: Building2, description: "Datos generales" },
  { id: "facturacion", label: "Facturación", icon: Receipt, description: "Comprobantes y ventas" },
  { id: "impresion", label: "Impresión", icon: Printer, description: "Formato de tickets" },
  { id: "comprobantes", label: "Comprobantes", icon: FileText, description: "Diseño y formato" },
  { id: "cuentas", label: "Cuentas Bancarias", icon: Landmark, description: "Transferencias" },
  { id: "modulos", label: "Módulos", icon: Puzzle, description: "Secciones del sistema" },
  { id: "backup", label: "Backup", icon: Shield, description: "Exportar e importar datos" },
];

const MODULE_META: Record<string, { icon: typeof Building2; description: string }> = {
  Dashboard: { icon: LayoutDashboard, description: "Panel principal con resumen de actividad" },
  Ventas: { icon: ShoppingCart, description: "Gestión de ventas y facturación" },
  Clientes: { icon: Users, description: "Base de datos de clientes" },
  Productos: { icon: Package, description: "Catálogo de productos y precios" },
  Proveedores: { icon: Truck, description: "Gestión de proveedores" },
  Compras: { icon: ShoppingBag, description: "Órdenes de compra" },
  Caja: { icon: CreditCard, description: "Movimientos de caja y arqueos" },
  "Vendedores": { icon: Users, description: "Comisiones y configuración de vendedores" },
  "Auditoría": { icon: FileText, description: "Historial de acciones del sistema" },
  "Tienda Online": { icon: Globe, description: "E-commerce y pedidos online" },
  Configuración: { icon: Settings, description: "Ajustes del sistema" },
};

export default function ConfiguracionPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [rcfg, setRcfg] = useState<ReceiptConfig>(defaultReceiptConfig);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [editingCuenta, setEditingCuenta] = useState<CuentaBancaria | null>(null);
  const [cuentaForm, setCuentaForm] = useState({ nombre: "", tipo: "Caja de Ahorro", cbu_cvu: "", alias: "" });
  const [showCuentaForm, setShowCuentaForm] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("empresa");
  const [successMsg, setSuccessMsg] = useState("");

  // ─── Module enable/disable ───
  const allModulos = ["Dashboard", "Ventas", "Clientes", "Productos", "Proveedores", "Compras", "Caja", "Stock", "Reportes", "Vendedores", "Auditoría", "Tienda Online", "Configuración"] as const;
  const alwaysEnabled = ["Dashboard", "Configuración"];
  const [modulos, setModulos] = useState<Record<string, boolean>>(() => {
    const def: Record<string, boolean> = {};
    allModulos.forEach((m) => (def[m] = true));
    return def;
  });

  const toggleModulo = (name: string) => {
    if (alwaysEnabled.includes(name)) return;
    const updated = { ...modulos, [name]: !modulos[name] };
    setModulos(updated);
    localStorage.setItem("modulos_habilitados", JSON.stringify(updated));
    // Dispatch storage event so sidebar picks it up in the same tab
    window.dispatchEvent(new Event("modulos_updated"));
  };

  // Load receipt config, bank accounts and module config from localStorage on mount
  useEffect(() => {
    setRcfg(loadReceiptConfig());
    setCuentas(loadCuentasBancarias());
    try {
      const stored = localStorage.getItem("modulos_habilitados");
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged: Record<string, boolean> = {};
        allModulos.forEach((m) => (merged[m] = parsed[m] !== undefined ? parsed[m] : true));
        // Force always-enabled
        alwaysEnabled.forEach((m) => (merged[m] = true));
        setModulos(merged);
      }
    } catch (err) { showAdminToast("Error al guardar configuración", "error"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: emp }, { data: users }] = await Promise.all([
      supabase.from("empresa").select("*").limit(1).single(),
      supabase.from("usuarios").select("*").eq("activo", true).order("nombre"),
    ]);
    setEmpresa(emp);
    setUsuarios(users || []);

    // Auto-populate receipt config from empresa if not yet customized
    if (emp && !localStorage.getItem("receipt_config")) {
      const autoConfig: Partial<ReceiptConfig> = {
        empresaNombre: emp.nombre || defaultReceiptConfig.empresaNombre,
        empresaDomicilio: emp.domicilio || defaultReceiptConfig.empresaDomicilio,
        empresaTelefono: emp.telefono || defaultReceiptConfig.empresaTelefono,
        empresaCuit: emp.cuit || defaultReceiptConfig.empresaCuit,
        empresaIva: emp.situacion_iva || defaultReceiptConfig.empresaIva,
      };
      setRcfg((prev) => ({ ...prev, ...autoConfig }));
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
    showAdminToast(msg);
  };

  const saveEmpresa = async () => {
    if (!empresa) return;
    setSaving("empresa");
    await supabase.from("empresa").update({
      nombre: empresa.nombre,
      razon_social: empresa.razon_social,
      cuit: empresa.cuit,
      situacion_iva: empresa.situacion_iva,
      domicilio: empresa.domicilio,
      telefono: empresa.telefono,
    }).eq("id", empresa.id);
    setSaving(null);
    showSuccess("Datos de empresa guardados correctamente");
  };

  const saveBilling = async () => {
    if (!empresa) return;
    setSaving("billing");
    await supabase.from("empresa").update({
      punto_venta: empresa.punto_venta,
      tipo_comprobante_default: empresa.tipo_comprobante_default,
      lista_precios_default: empresa.lista_precios_default,
      moneda_default: empresa.moneda_default,
    }).eq("id", empresa.id);
    setSaving(null);
    showSuccess("Configuración de facturación guardada");
  };

  const savePrint = async () => {
    if (!empresa) return;
    setSaving("print");
    await supabase.from("empresa").update({
      formato_ticket: empresa.formato_ticket,
    }).eq("id", empresa.id);
    setSaving(null);
    showSuccess("Formato de impresión guardado");
  };

  const e = (key: keyof Empresa, value: string) => {
    if (empresa) setEmpresa({ ...empresa, [key]: value });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const SaveButton = ({ onClick, savingKey, label = "Guardar cambios" }: { onClick: () => void; savingKey: string; label?: string }) => (
    <div className="flex justify-end pt-4">
      <Button onClick={onClick} disabled={saving === savingKey}>
        {saving === savingKey ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        {label}
      </Button>
    </div>
  );

  const SectionHeader = ({ icon: Icon, title, description, color }: { icon: typeof Building2; title: string; description: string; color: string }) => (
    <div className="flex items-center gap-4 mb-6">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", color)}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Page title */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Configuración</h1>
          <p className="text-muted-foreground text-sm">Ajustes del sistema y empresa</p>
        </div>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 shadow-lg">
          <Check className="w-4 h-4 inline mr-2" />{successMsg}
        </div>
      )}

      {/* 2-column layout */}
      <div className="flex gap-8">
        {/* Left sidebar nav */}
        <nav className="w-56 shrink-0 sticky top-8 self-start">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150",
                    isActive
                      ? "bg-accent border-l-[3px] border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", isActive && "text-primary")} />
                  <div className="min-w-0">
                    <div className={cn("text-sm font-medium truncate", isActive && "text-foreground")}>{item.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{item.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right content area */}
        <div className="flex-1 min-w-0">
          {/* ─── Empresa ─── */}
          {activeSection === "empresa" && (
            <div>
              <SectionHeader icon={Building2} title="Datos de la empresa" description="Información general y fiscal de tu negocio" color="bg-primary/10 text-primary" />
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label>Nombre comercial</Label>
                      <Input value={empresa?.nombre || ""} onChange={(ev) => e("nombre", ev.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>CUIT</Label>
                      <Input value={empresa?.cuit || ""} onChange={(ev) => e("cuit", ev.target.value)} placeholder="XX-XXXXXXXX-X" />
                    </div>
                    <div className="space-y-2">
                      <Label>Razón social</Label>
                      <Input value={empresa?.razon_social || ""} onChange={(ev) => e("razon_social", ev.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Situación IVA</Label>
                      <Select value={empresa?.situacion_iva || ""} onValueChange={(v) => e("situacion_iva", v || "")}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar situación IVA" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                          <SelectItem value="Monotributista">Monotributista</SelectItem>
                          <SelectItem value="Exento">Exento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Domicilio fiscal</Label>
                      <Input value={empresa?.domicilio || ""} onChange={(ev) => e("domicilio", ev.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Teléfono</Label>
                      <Input value={empresa?.telefono || ""} onChange={(ev) => e("telefono", ev.target.value)} />
                    </div>
                  </div>
                  <Separator />
                  <SaveButton onClick={saveEmpresa} savingKey="empresa" />
                </CardContent>
              </Card>

              {/* Usuarios sub-section */}
              <div className="mt-8">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-5 h-5 text-orange-500" />
                  <div>
                    <h3 className="text-sm font-semibold">Usuarios y permisos</h3>
                    <p className="text-xs text-muted-foreground">Administrar usuarios del sistema</p>
                  </div>
                </div>
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      {usuarios.map((u) => (
                        <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {u.nombre.split(" ").map((n) => n[0]).join("").substring(0, 2)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{u.nombre}</p>
                              <p className="text-xs text-muted-foreground capitalize">{u.rol}</p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">Editar</Button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" className="mt-4" size="sm"><User className="w-4 h-4 mr-2" />Agregar usuario</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ─── Facturación ─── */}
          {activeSection === "facturacion" && (
            <div>
              <SectionHeader icon={Receipt} title="Facturación" description="Configuración de comprobantes, moneda y punto de venta" color="bg-emerald-500/10 text-emerald-500" />
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label>Punto de venta</Label>
                      <Input value={empresa?.punto_venta || ""} onChange={(ev) => e("punto_venta", ev.target.value)} placeholder="0001" />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo comprobante default</Label>
                      <Select value={empresa?.tipo_comprobante_default || ""} onValueChange={(v) => e("tipo_comprobante_default", v || "")}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Remito X">Remito X</SelectItem>
                          <SelectItem value="Factura B">Factura B</SelectItem>
                          <SelectItem value="Factura C">Factura C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Lista de precios default</Label>
                      <Select value={empresa?.lista_precios_default || ""} onValueChange={(v) => e("lista_precios_default", v || "")}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Contado">Contado</SelectItem>
                          <SelectItem value="Mayorista">Mayorista</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Moneda</Label>
                      <Select value={empresa?.moneda_default || ""} onValueChange={(v) => e("moneda_default", v || "")}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ARS">Pesos (ARS)</SelectItem>
                          <SelectItem value="USD">Dólares (USD)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Separator />
                  <SaveButton onClick={saveBilling} savingKey="billing" />
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─── Impresión ─── */}
          {activeSection === "impresion" && (
            <div>
              <SectionHeader icon={Printer} title="Impresión" description="Configurar el formato y tamaño de tickets impresos" color="bg-violet-500/10 text-violet-500" />
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div className="max-w-sm space-y-2">
                    <Label>Formato de ticket</Label>
                    <Select value={empresa?.formato_ticket || ""} onValueChange={(v) => e("formato_ticket", v || "")}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="58mm">58mm (Ticket)</SelectItem>
                        <SelectItem value="80mm">80mm (Ticket)</SelectItem>
                        <SelectItem value="A4">A4</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Selecciona el ancho de papel que usa tu impresora de tickets.</p>
                  </div>
                  <Separator />
                  <SaveButton onClick={savePrint} savingKey="print" />
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─── Comprobantes ─── */}
          {activeSection === "comprobantes" && (
            <div>
              <SectionHeader icon={FileText} title="Diseño de comprobantes" description="Configurar el formato visual de facturas, remitos y tickets" color="bg-blue-500/10 text-blue-500" />

              <div className="space-y-6">
                {/* Logo group */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Logo</CardTitle>
                    </div>
                    <CardDescription className="text-xs">Imagen que aparece en el encabezado del comprobante</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setRcfg({ ...rcfg, mostrarLogo: !rcfg.mostrarLogo })}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer",
                          rcfg.mostrarLogo ? "bg-emerald-500" : "bg-gray-300"
                        )}
                      >
                        <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out", rcfg.mostrarLogo ? "translate-x-5" : "translate-x-0")} />
                      </button>
                      <span className="text-sm">Mostrar logo en comprobante</span>
                    </div>
                    {rcfg.mostrarLogo && (
                      <div className="space-y-3 pl-2 border-l-2 border-muted ml-5">
                        <div className="pl-4 space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">URL del logo</Label>
                            <Input value={rcfg.logoUrl} onChange={(ev) => setRcfg({ ...rcfg, logoUrl: ev.target.value })} placeholder="https://..." className="h-9" />
                          </div>
                          <div className="flex items-center gap-3">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">Alto (px):</Label>
                            <Input type="number" value={rcfg.logoHeight} onChange={(ev) => setRcfg({ ...rcfg, logoHeight: Number(ev.target.value) })} className="h-9 w-24" min={20} max={150} />
                          </div>
                          {rcfg.logoUrl && (
                            <div className="p-3 border rounded-lg bg-muted/30 inline-block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={rcfg.logoUrl} alt="Preview" style={{ height: `${rcfg.logoHeight}px` }} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Sección 1: Datos del Mayorista */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Sección 1 — Datos del Mayorista</CardTitle>
                    <CardDescription className="text-xs">Encabezado con logo, nombre y datos fiscales que aparecen en el comprobante</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Nombre de la empresa</Label>
                        <Input value={rcfg.empresaNombre} onChange={(ev) => setRcfg({ ...rcfg, empresaNombre: ev.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Sitio web</Label>
                        <Input value={rcfg.empresaWeb} onChange={(ev) => setRcfg({ ...rcfg, empresaWeb: ev.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Domicilio</Label>
                        <Input value={rcfg.empresaDomicilio} onChange={(ev) => setRcfg({ ...rcfg, empresaDomicilio: ev.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Teléfono</Label>
                        <Input value={rcfg.empresaTelefono} onChange={(ev) => setRcfg({ ...rcfg, empresaTelefono: ev.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">CUIT</Label>
                        <Input value={rcfg.empresaCuit} onChange={(ev) => setRcfg({ ...rcfg, empresaCuit: ev.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Condición IVA</Label>
                        <Input value={rcfg.empresaIva} onChange={(ev) => setRcfg({ ...rcfg, empresaIva: ev.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Ingresos Brutos</Label>
                        <Input value={rcfg.empresaIngrBrutos} onChange={(ev) => setRcfg({ ...rcfg, empresaIngrBrutos: ev.target.value })} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Inicio de Actividad</Label>
                        <Input value={rcfg.empresaInicioAct} onChange={(ev) => setRcfg({ ...rcfg, empresaInicioAct: ev.target.value })} className="h-9" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Texto pie de página</Label>
                      <Input value={rcfg.footerTexto} onChange={(ev) => setRcfg({ ...rcfg, footerTexto: ev.target.value })} className="h-9" />
                    </div>
                    <div className="flex items-center gap-3 pt-2 border-t">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Tamaño fuente:</Label>
                      <Input type="number" value={rcfg.fontSizeEmpresa || rcfg.fontSize} onChange={(ev) => setRcfg({ ...rcfg, fontSizeEmpresa: Number(ev.target.value) })} className="h-8 w-20" min={8} max={18} />
                      <span className="text-xs text-muted-foreground">px</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Sección 2: Datos del Cliente */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Sección 2 — Datos del Cliente</CardTitle>
                    <CardDescription className="text-xs">Información del cliente en el comprobante</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Tamaño fuente:</Label>
                      <Input type="number" value={rcfg.fontSizeCliente || rcfg.fontSize} onChange={(ev) => setRcfg({ ...rcfg, fontSizeCliente: Number(ev.target.value) })} className="h-8 w-20" min={8} max={18} />
                      <span className="text-xs text-muted-foreground">px</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium pt-2">Campos a mostrar:</p>
                    {[
                      { key: "mostrarDireccion" as const, label: "Domicilio" },
                      { key: "mostrarTelefono" as const, label: "Teléfono" },
                      { key: "mostrarFormaPago" as const, label: "Forma de pago" },
                      { key: "mostrarMoneda" as const, label: "Moneda" },
                      { key: "mostrarVendedor" as const, label: "Vendedor" },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-3">
                        <button type="button" onClick={() => setRcfg({ ...rcfg, [key]: !rcfg[key] })}
                          className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer", rcfg[key] ? "bg-emerald-500" : "bg-gray-300")}>
                          <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform", rcfg[key] ? "translate-x-4" : "translate-x-0")} />
                        </button>
                        <span className="text-sm">{label}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Sección 3: Productos */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Sección 3 — Productos</CardTitle>
                    <CardDescription className="text-xs">Tabla de artículos del comprobante</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Tamaño fuente:</Label>
                      <Input type="number" value={rcfg.fontSizeProductos || rcfg.fontSize} onChange={(ev) => setRcfg({ ...rcfg, fontSizeProductos: Number(ev.target.value) })} className="h-8 w-20" min={8} max={18} />
                      <span className="text-xs text-muted-foreground">px</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setRcfg({ ...rcfg, mostrarDescuento: !rcfg.mostrarDescuento })}
                        className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer", rcfg.mostrarDescuento ? "bg-emerald-500" : "bg-gray-300")}>
                        <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform", rcfg.mostrarDescuento ? "translate-x-4" : "translate-x-0")} />
                      </button>
                      <span className="text-sm">Mostrar columna de descuento</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Sección 4: Resumen de Pago */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Sección 4 — Resumen de Pago</CardTitle>
                    <CardDescription className="text-xs">Total, descuentos, recargos y vuelto</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Tamaño fuente:</Label>
                      <Input type="number" value={rcfg.fontSizeResumen || 14} onChange={(ev) => setRcfg({ ...rcfg, fontSizeResumen: Number(ev.target.value) })} className="h-8 w-20" min={8} max={24} />
                      <span className="text-xs text-muted-foreground">px</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setRcfg({ ...rcfg, mostrarVuelto: !rcfg.mostrarVuelto })}
                        className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer", rcfg.mostrarVuelto ? "bg-emerald-500" : "bg-gray-300")}>
                        <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform", rcfg.mostrarVuelto ? "translate-x-4" : "translate-x-0")} />
                      </button>
                      <span className="text-sm">Mostrar vuelto del cliente (pago en efectivo)</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Live preview */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Vista previa</CardTitle>
                    </div>
                    <CardDescription className="text-xs">Así se verá tu comprobante impreso</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg bg-white p-2 overflow-hidden" style={{ transform: "scale(0.38)", transformOrigin: "top left", width: "263%", height: "400px" }}>
                      <div style={{ width: "210mm", padding: "8mm 10mm", fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${rcfg.fontSize}px`, color: "#000" }}>
                        {/* Header */}
                        <div style={{ display: "flex", borderBottom: "2px solid #000", paddingBottom: "6px", marginBottom: "4px" }}>
                          <div style={{ flex: 1 }}>
                            {rcfg.mostrarLogo && rcfg.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={rcfg.logoUrl} alt="" style={{ height: `${rcfg.logoHeight}px`, marginBottom: "4px" }} />
                            ) : (
                              <div style={{ fontSize: `${rcfg.fontSize + 8}px`, fontWeight: "bold", marginBottom: "4px" }}>{rcfg.empresaNombre}</div>
                            )}
                            <div style={{ fontSize: `${rcfg.fontSize - 2}px`, lineHeight: "1.5" }}>
                              {rcfg.empresaWeb && <div style={{ fontWeight: "bold" }}>{rcfg.empresaWeb}</div>}
                              <div>{rcfg.empresaDomicilio} | Tel: {rcfg.empresaTelefono}</div>
                            </div>
                          </div>
                          <div style={{ width: "55px", display: "flex", flexDirection: "column", alignItems: "center", borderLeft: "2px solid #000", borderRight: "2px solid #000", padding: "0 8px" }}>
                            <div style={{ fontSize: "30px", fontWeight: "bold", lineHeight: 1 }}>X</div>
                            <div style={{ fontSize: "8px", textAlign: "center", lineHeight: "1.2", marginTop: "2px" }}>Doc. no válido como factura</div>
                          </div>
                          <div style={{ flex: 1, paddingLeft: "10px" }}>
                            <div style={{ fontSize: `${rcfg.fontSize + 4}px`, fontWeight: "bold" }}>Remito X</div>
                            <div style={{ fontSize: `${rcfg.fontSize + 2}px`, fontWeight: "bold" }}>N° 0001-00000001</div>
                            <div style={{ fontSize: `${rcfg.fontSize - 2}px`, lineHeight: "1.6", marginTop: "4px" }}>
                              <div>Fecha: 16/03/2026</div>
                              <div>CUIT: {rcfg.empresaCuit}</div>
                              <div>Ing.Brutos: {rcfg.empresaIngrBrutos}</div>
                              <div>Cond.IVA: {rcfg.empresaIva}</div>
                              <div>Inicio Act.: {rcfg.empresaInicioAct}</div>
                            </div>
                          </div>
                        </div>
                        {/* Client - horizontal layout */}
                        <div style={{ border: "1px solid #ccc", padding: "4px 6px", marginBottom: "4px", fontSize: `${rcfg.fontSizeCliente || rcfg.fontSize - 1}px`, display: "flex", gap: "16px" }}>
                          <div style={{ flex: 1 }}>
                            <div>Cliente: Consumidor Final</div>
                            {rcfg.mostrarDireccion && <div>Domicilio: Av. Corrientes 1234</div>}
                            {rcfg.mostrarFormaPago && <div>Forma de pago: Efectivo</div>}
                          </div>
                          <div style={{ flex: 1 }}>
                            {rcfg.mostrarTelefono && <div>Teléfono: 11-2345-6789</div>}
                            {rcfg.mostrarMoneda && <div>Moneda: ARS</div>}
                          </div>
                          <div style={{ flex: 1, textAlign: "right" }}>
                            {rcfg.mostrarVendedor && <div>Vendedor: Juan Pérez</div>}
                          </div>
                        </div>
                        {/* Items preview */}
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: `${rcfg.fontSize - 1}px` }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #000", borderTop: "1px solid #000" }}>
                              <th style={{ textAlign: "left", padding: "4px" }}>Cant.</th>
                              <th style={{ textAlign: "left", padding: "4px" }}>Producto</th>
                              <th style={{ textAlign: "right", padding: "4px" }}>Precio</th>
                              {rcfg.mostrarDescuento && <th style={{ textAlign: "right", padding: "4px" }}>Desc.%</th>}
                              <th style={{ textAlign: "right", padding: "4px" }}>Importe</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ borderBottom: "1px solid #eee" }}>
                              <td style={{ padding: "3px 4px" }}>2</td>
                              <td style={{ padding: "3px 4px" }}>Producto ejemplo</td>
                              <td style={{ padding: "3px 4px", textAlign: "right" }}>$1.500</td>
                              {rcfg.mostrarDescuento && <td style={{ padding: "3px 4px", textAlign: "right" }}>0</td>}
                              <td style={{ padding: "3px 4px", textAlign: "right" }}>$3.000</td>
                            </tr>
                            <tr style={{ borderBottom: "1px solid #eee" }}>
                              <td style={{ padding: "3px 4px" }}>1</td>
                              <td style={{ padding: "3px 4px" }}>Otro producto</td>
                              <td style={{ padding: "3px 4px", textAlign: "right" }}>$2.000</td>
                              {rcfg.mostrarDescuento && <td style={{ padding: "3px 4px", textAlign: "right" }}>0</td>}
                              <td style={{ padding: "3px 4px", textAlign: "right" }}>$2.000</td>
                            </tr>
                          </tbody>
                        </table>
                        {/* Footer */}
                        <div style={{ borderTop: "2px solid #000", marginTop: "10px", padding: "6px 4px", textAlign: "right" }}>
                          <div style={{ fontSize: `${rcfg.fontSize + 6}px`, fontWeight: "bold" }}>TOTAL: $5.000</div>
                        </div>
                        <div style={{ textAlign: "center", fontSize: `${rcfg.fontSize - 2}px`, borderTop: "1px solid #ccc", padding: "6px 0" }}>
                          {rcfg.footerTexto}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={() => { saveReceiptConfig(rcfg); setSaving("receipt"); setTimeout(() => setSaving(null), 600); showSuccess("Configuración de comprobantes guardada"); }} disabled={saving === "receipt"}>
                    {saving === "receipt" ? <Check className="w-4 h-4 mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    {saving === "receipt" ? "Guardado" : "Guardar configuración"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Cuentas Bancarias ─── */}
          {activeSection === "cuentas" && (
            <div>
              <SectionHeader icon={Landmark} title="Cuentas Bancarias" description="Administrar cuentas para recibir transferencias y pagos" color="bg-cyan-500/10 text-cyan-500" />

              <div className="space-y-4">
                {cuentas.length > 0 ? (
                  <div className="grid gap-3">
                    {cuentas.map((c) => (
                      <Card key={c.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="py-4 px-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                                <Landmark className="w-5 h-5 text-cyan-500" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold">{c.nombre}</p>
                                <p className="text-xs text-muted-foreground">{c.tipo}{c.alias ? ` · ${c.alias}` : ""}</p>
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.cbu_cvu}</p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => {
                                setEditingCuenta(c);
                                setCuentaForm({ nombre: c.nombre, tipo: c.tipo, cbu_cvu: c.cbu_cvu, alias: c.alias });
                                setShowCuentaForm(true);
                              }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                                const updated = cuentas.filter((x) => x.id !== c.id);
                                setCuentas(updated);
                                saveCuentasBancarias(updated);
                              }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Landmark className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No hay cuentas bancarias configuradas.</p>
                      <p className="text-xs text-muted-foreground">Agrega una cuenta para recibir transferencias.</p>
                    </CardContent>
                  </Card>
                )}

                {showCuentaForm && (
                  <Card>
                    <CardContent className="pt-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Nombre</Label>
                          <Input placeholder="Ej: Brubank, Mercado Pago" value={cuentaForm.nombre} onChange={(ev) => setCuentaForm({ ...cuentaForm, nombre: ev.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Tipo</Label>
                          <Select value={cuentaForm.tipo} onValueChange={(v) => setCuentaForm({ ...cuentaForm, tipo: v ?? "" })}>
                            <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Caja de Ahorro">Caja de Ahorro</SelectItem>
                              <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>CBU / CVU</Label>
                          <Input placeholder="22 dígitos" value={cuentaForm.cbu_cvu} onChange={(ev) => setCuentaForm({ ...cuentaForm, cbu_cvu: ev.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Alias (opcional)</Label>
                          <Input placeholder="mi.alias.mp" value={cuentaForm.alias} onChange={(ev) => setCuentaForm({ ...cuentaForm, alias: ev.target.value })} />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => { setShowCuentaForm(false); setEditingCuenta(null); setCuentaForm({ nombre: "", tipo: "Caja de Ahorro", cbu_cvu: "", alias: "" }); }}>
                          Cancelar
                        </Button>
                        <Button size="sm" disabled={!cuentaForm.nombre || !cuentaForm.cbu_cvu} onClick={() => {
                          let updated: CuentaBancaria[];
                          if (editingCuenta) {
                            updated = cuentas.map((c) => c.id === editingCuenta.id ? { ...editingCuenta, ...cuentaForm } : c);
                          } else {
                            updated = [...cuentas, { id: crypto.randomUUID(), ...cuentaForm }];
                          }
                          setCuentas(updated);
                          saveCuentasBancarias(updated);
                          setShowCuentaForm(false);
                          setEditingCuenta(null);
                          setCuentaForm({ nombre: "", tipo: "Caja de Ahorro", cbu_cvu: "", alias: "" });
                        }}>
                          <Check className="w-4 h-4 mr-1" />
                          {editingCuenta ? "Actualizar" : "Agregar"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!showCuentaForm && (
                  <Button variant="outline" size="sm" onClick={() => setShowCuentaForm(true)}>
                    <Plus className="w-4 h-4 mr-2" />Agregar cuenta bancaria
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ─── Módulos ─── */}
          {activeSection === "modulos" && (
            <div>
              <SectionHeader icon={Puzzle} title="Módulos del Sistema" description="Activar o desactivar secciones del menú lateral" color="bg-amber-500/10 text-amber-500" />

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

          {activeSection === "backup" && (
            <div>
              <SectionHeader icon={Shield} title="Backup de Datos" description="Exportar e importar toda la información del sistema" color="bg-emerald-500/10 text-emerald-500" />
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
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!confirm("Esto reemplazará TODOS los datos actuales. ¿Estás seguro?")) {
                          e.target.value = "";
                          return;
                        }
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
                        e.target.value = "";
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
