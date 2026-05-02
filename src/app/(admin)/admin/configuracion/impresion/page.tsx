"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Empresa } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Printer, Loader2, Check, Eye, Image } from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";
import type { ReceiptConfig } from "@/components/receipt-print-view";
import { defaultReceiptConfig } from "@/components/receipt-print-view";

function loadReceiptConfig(): ReceiptConfig {
  try {
    const stored = localStorage.getItem("receipt_config");
    if (stored) {
      const parsed = JSON.parse(stored);
      const merged = { ...defaultReceiptConfig, ...parsed };
      if (!merged.logoUrl) merged.logoUrl = defaultReceiptConfig.logoUrl;
      return merged;
    }
  } catch (err) { console.error("Config load error:", err); }
  return defaultReceiptConfig;
}

async function loadReceiptConfigFromDB(): Promise<ReceiptConfig | null> {
  try {
    const { data: emp } = await supabase.from("empresa").select("receipt_config").limit(1).single();
    if (emp && (emp as any).receipt_config) {
      return { ...defaultReceiptConfig, ...(emp as any).receipt_config };
    }
  } catch {}
  return null;
}

async function persistReceiptConfig(config: ReceiptConfig) {
  localStorage.setItem("receipt_config", JSON.stringify(config));
  try {
    const { data: emp } = await supabase.from("empresa").select("id").limit(1).single();
    if (emp) {
      await supabase.from("empresa").update({ receipt_config: config } as any).eq("id", emp.id);
    }
  } catch (err) {
    console.error("Error guardando config de recibos en DB:", err);
  }
}

function CategoriaOrdenList({
  expandedSubs,
  onToggleSub,
  subtotalCats,
  onToggleSubtotalCat,
  alfaCats,
  onToggleAlfaCat,
}: {
  expandedSubs: string[];
  onToggleSub: (subId: string) => void;
  subtotalCats: string[];
  onToggleSubtotalCat: (catId: string) => void;
  alfaCats: string[];
  onToggleAlfaCat: (catId: string) => void;
}) {
  const [cats, setCats] = useState<{ id: string; nombre: string; orden: number | null }[]>([]);
  const [subs, setSubs] = useState<{ id: string; nombre: string; categoria_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [catRes, subRes] = await Promise.all([
        supabase.from("categorias").select("id, nombre, orden").order("orden", { nullsFirst: false }).order("nombre"),
        supabase.from("subcategorias").select("id, nombre, categoria_id").order("nombre").range(0, 999),
      ]);
      if (!alive) return;
      setCats(((catRes.data as any) || []).map((c: any) => ({ id: c.id, nombre: c.nombre, orden: c.orden })));
      setSubs(((subRes.data as any) || []).map((s: any) => ({ id: s.id, nombre: s.nombre, categoria_id: s.categoria_id })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);
  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  if (cats.length === 0) return <p className="text-xs text-muted-foreground">No hay categorías cargadas.</p>;
  const subsByCat: Record<string, { id: string; nombre: string }[]> = {};
  for (const s of subs) {
    if (!s.categoria_id) continue;
    (subsByCat[s.categoria_id] ||= []).push({ id: s.id, nombre: s.nombre });
  }
  return (
    <div className="space-y-2">
      {cats.map((c) => {
        const catSubs = subsByCat[c.id] || [];
        return (
          <div key={c.id} className="border rounded-md p-2.5">
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={c.orden ?? ""}
                placeholder="—"
                className="h-8 w-20 text-xs"
                onChange={(e) => {
                  const val = e.target.value === "" ? null : Number(e.target.value);
                  setCats((prev) => prev.map((cat) => cat.id === c.id ? { ...cat, orden: val } : cat));
                }}
                onBlur={async (e) => {
                  const val = e.target.value === "" ? null : Number(e.target.value);
                  await supabase.from("categorias").update({ orden: val }).eq("id", c.id);
                }}
              />
              <span className="text-sm font-medium">{c.nombre}</span>
              <button
                type="button"
                onClick={() => onToggleSubtotalCat(c.id)}
                className={cn(
                  "ml-auto text-[11px] px-2 py-0.5 rounded-full border font-medium cursor-pointer transition-colors",
                  subtotalCats.includes(c.id)
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "bg-muted/30 border-border text-muted-foreground hover:bg-muted"
                )}
                title={subtotalCats.includes(c.id) ? "Mostrar el subtotal $ de esta categoría en el ticket" : "No mostrar subtotal $ en el ticket"}
              >
                $ subtotal
              </button>
              <button
                type="button"
                onClick={() => onToggleAlfaCat(c.id)}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border font-medium cursor-pointer transition-colors",
                  alfaCats.includes(c.id)
                    ? "bg-sky-50 border-sky-300 text-sky-700"
                    : "bg-muted/30 border-border text-muted-foreground hover:bg-muted"
                )}
                title={alfaCats.includes(c.id) ? "Items ordenados A-Z dentro de esta categoría" : "Items en orden de carga (default)"}
              >
                A-Z
              </button>
              {catSubs.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{catSubs.length} subcat.</span>
              )}
            </div>
            {catSubs.length > 0 && (
              <div className="mt-2 pl-5 flex flex-wrap gap-1.5">
                {catSubs.map((s) => {
                  const checked = expandedSubs.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onToggleSub(s.id)}
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer",
                        checked
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                          : "bg-muted/30 border-border text-muted-foreground hover:bg-muted"
                      )}
                      title={checked ? "Se mostrará como sub-bloque" : "Se mezcla en la categoría"}
                    >
                      {s.nombre}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ImpresionPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [rcfg, setRcfg] = useState<ReceiptConfig>(defaultReceiptConfig);

  useEffect(() => {
    const localConfig = loadReceiptConfig();
    setRcfg(localConfig);
    loadReceiptConfigFromDB().then((dbConfig) => {
      if (dbConfig) {
        setRcfg(dbConfig);
        localStorage.setItem("receipt_config", JSON.stringify(dbConfig));
      }
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: emp } = await supabase.from("empresa").select("*").limit(1).single();
    setEmpresa(emp);
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

  const saveFormat = async () => {
    if (!empresa) return;
    setSaving("format");
    await supabase.from("empresa").update({ formato_ticket: empresa.formato_ticket }).eq("id", empresa.id);
    setSaving(null);
    showAdminToast("Formato de impresión guardado");
  };

  const saveReceipt = async () => {
    setSaving("receipt");
    await persistReceiptConfig(rcfg);
    setTimeout(() => setSaving(null), 600);
    showAdminToast("Configuración de comprobantes guardada");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onChange}
        className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer", checked ? "bg-emerald-500" : "bg-gray-300")}>
        <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform", checked ? "translate-x-4" : "translate-x-0")} />
      </button>
      <span className="text-sm">{label}</span>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <Printer className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Impresión y Comprobantes</h2>
          <p className="text-sm text-muted-foreground">Formato de tickets y diseño visual de comprobantes</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Formato de ticket */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Formato de ticket</CardTitle>
            <CardDescription className="text-xs">Tamaño de papel para impresión</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-sm space-y-2">
              <Label>Ancho de papel</Label>
              <Select value={empresa?.formato_ticket || ""} onValueChange={(v) => empresa && setEmpresa({ ...empresa, formato_ticket: v } as Empresa)}>
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
            <div className="flex justify-end">
              <Button onClick={saveFormat} disabled={saving === "format"} size="sm">
                {saving === "format" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Guardar formato
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logo */}
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
            <CardDescription className="text-xs">Encabezado con logo, nombre y datos fiscales</CardDescription>
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
            <Toggle checked={rcfg.mostrarDireccion} onChange={() => setRcfg({ ...rcfg, mostrarDireccion: !rcfg.mostrarDireccion })} label="Domicilio" />
            <Toggle checked={rcfg.mostrarTelefono} onChange={() => setRcfg({ ...rcfg, mostrarTelefono: !rcfg.mostrarTelefono })} label="Teléfono" />
            <Toggle checked={rcfg.mostrarFormaPago} onChange={() => setRcfg({ ...rcfg, mostrarFormaPago: !rcfg.mostrarFormaPago })} label="Forma de pago" />
            <Toggle checked={rcfg.mostrarMoneda} onChange={() => setRcfg({ ...rcfg, mostrarMoneda: !rcfg.mostrarMoneda })} label="Moneda" />
            <Toggle checked={rcfg.mostrarVendedor} onChange={() => setRcfg({ ...rcfg, mostrarVendedor: !rcfg.mostrarVendedor })} label="Vendedor" />
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
            <Toggle checked={rcfg.mostrarDescuento} onChange={() => setRcfg({ ...rcfg, mostrarDescuento: !rcfg.mostrarDescuento })} label="Mostrar columna de descuento" />
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
            <Toggle checked={rcfg.mostrarVuelto} onChange={() => setRcfg({ ...rcfg, mostrarVuelto: !rcfg.mostrarVuelto })} label="Mostrar vuelto del cliente (pago en efectivo)" />
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
                {/* Client */}
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
                {/* Items */}
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

        {/* Agrupación por categoría */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Agrupación por categoría</CardTitle>
            <CardDescription className="text-xs">Mostrar los items del comprobante separados por categoría — útil para armar pedidos en orden.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRcfg({ ...rcfg, agruparPorCategoria: !rcfg.agruparPorCategoria })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer",
                  rcfg.agruparPorCategoria ? "bg-emerald-500" : "bg-gray-300"
                )}
              >
                <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out", rcfg.agruparPorCategoria ? "translate-x-5" : "translate-x-0")} />
              </button>
              <span className="text-sm">Agrupar items por categoría</span>
            </div>
            {rcfg.agruparPorCategoria && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium mb-2">Orden de las categorías y subgrupos</p>
                  <p className="text-xs text-muted-foreground mb-3">Asigná un número (1, 2, 3, ...) para fijar el orden. Las categorías sin número se muestran al final ordenadas alfabéticamente. &quot;Otros&quot; (sin categoría) siempre va al final.</p>
                  <p className="text-xs text-muted-foreground mb-3">Tocá una subcategoría para mostrarla como sub-bloque dentro del ticket (ej: dentro de Almacén, separar Limpieza y Galletitas). Las que no marques se muestran mezcladas con el resto de la categoría.</p>
                  <CategoriaOrdenList
                    expandedSubs={rcfg.subcategoriasExpandidas || []}
                    onToggleSub={(subId) => setRcfg((prev) => {
                      const cur = prev.subcategoriasExpandidas || [];
                      const next = cur.includes(subId) ? cur.filter((x) => x !== subId) : [...cur, subId];
                      return { ...prev, subcategoriasExpandidas: next };
                    })}
                    subtotalCats={rcfg.mostrarSubtotalCategorias || []}
                    onToggleSubtotalCat={(catId) => setRcfg((prev) => {
                      const cur = prev.mostrarSubtotalCategorias || [];
                      const next = cur.includes(catId) ? cur.filter((x) => x !== catId) : [...cur, catId];
                      return { ...prev, mostrarSubtotalCategorias: next };
                    })}
                    alfaCats={rcfg.categoriasOrdenAlfabetico || []}
                    onToggleAlfaCat={(catId) => setRcfg((prev) => {
                      const cur = prev.categoriasOrdenAlfabetico || [];
                      const next = cur.includes(catId) ? cur.filter((x) => x !== catId) : [...cur, catId];
                      return { ...prev, categoriasOrdenAlfabetico: next };
                    })}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={saveReceipt} disabled={saving === "receipt"}>
            {saving === "receipt" ? <Check className="w-4 h-4 mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            {saving === "receipt" ? "Guardado" : "Guardar configuración"}
          </Button>
        </div>
      </div>
    </div>
  );
}
