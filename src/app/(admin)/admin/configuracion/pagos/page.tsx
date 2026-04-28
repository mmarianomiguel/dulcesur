"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
import {
  CreditCard,
  Landmark,
  Loader2,
  Check,
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  Image,
  Search,
  X,
} from "lucide-react";

interface TiendaConfig {
  id: string;
  pago_mixto_habilitado: boolean;
  recargo_transferencia: number;
}

interface CuentaBancaria {
  id: string;
  nombre: string;
  tipo: string;
  cbu_cvu: string;
  alias: string;
  titular?: string;
  origen?: string;
  logo_url?: string | null;
}

const formatARS = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

export default function PagosConfigPage() {
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingCuenta, setEditingCuenta] = useState<CuentaBancaria | null>(null);
  const [cuentaForm, setCuentaForm] = useState({ nombre: "", tipo: "Caja de Ahorro", cbu_cvu: "", alias: "", origen: "propia", titular: "", proveedor_id: "", logo_url: "" });
  const [proveedoresList, setProveedoresList] = useState<{ id: string; nombre: string }[]>([]);
  const [showCuentaForm, setShowCuentaForm] = useState(false);
  const [provSearchText, setProvSearchText] = useState("");
  const [provDropdownOpen, setProvDropdownOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: cfg }, { data: ctas }, { data: provs }] = await Promise.all([
      supabase.from("tienda_config").select("id, pago_mixto_habilitado, recargo_transferencia").limit(1).single(),
      supabase.from("cuentas_bancarias").select("*").eq("activo", true).order("nombre"),
      supabase.from("proveedores").select("id, nombre").order("nombre"),
    ]);
    if (cfg) setConfig(cfg as TiendaConfig);
    if (ctas) {
      setCuentas(ctas.map((c: any) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo_cuenta || "Caja de Ahorro", cbu_cvu: c.cbu_cvu || "", alias: c.alias || "", titular: c.titular || "", origen: c.origen || "propia", logo_url: c.logo_url || "" })));
    }
    if (provs) setProveedoresList(provs);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const update = <K extends keyof TiendaConfig>(key: K, value: TiendaConfig[K]) => {
    if (config) setConfig({ ...config, [key]: value });
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    await supabase.from("tienda_config").update({
      pago_mixto_habilitado: config.pago_mixto_habilitado,
      recargo_transferencia: config.recargo_transferencia,
    }).eq("id", config.id);
    setSaving(false);
    showAdminToast("Configuración de pagos guardada");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <CreditCard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Pagos</h1>
          <p className="text-sm text-muted-foreground">
            Métodos de pago y cuentas bancarias
          </p>
        </div>
      </div>

      {/* ======================== METODOS DE PAGO ======================== */}
      <div className="space-y-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Pago mixto</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Permite a los clientes combinar múltiples métodos de pago
                    en una misma compra
                  </p>
                </div>
              </div>
              <button
                onClick={() => update("pago_mixto_habilitado", !config?.pago_mixto_habilitado)}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  config?.pago_mixto_habilitado
                    ? "bg-emerald-500"
                    : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    config?.pago_mixto_habilitado
                      ? "translate-x-8"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Transfer surcharge */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Recargo por transferencia</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Porcentaje adicional que se aplica cuando el cliente paga con transferencia bancaria
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 max-w-sm">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={config?.recargo_transferencia ?? 0}
                onChange={(e) => update("recargo_transferencia", Number(e.target.value))}
                className="h-10"
              />
              <span className="text-sm font-medium text-muted-foreground shrink-0">%</span>
            </div>
            {(config?.recargo_transferencia ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Ej: un pedido de $10.000 tendrá un recargo de {formatARS(10000 * (config!.recargo_transferencia / 100))} (total: {formatARS(10000 + 10000 * (config!.recargo_transferencia / 100))})
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={saveConfig} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Guardar cambios
          </Button>
        </div>
      </div>

      {/* ======================== CUENTAS BANCARIAS ======================== */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-cyan-500" />
          </div>
          <div>
            <p className="text-base font-semibold">Cuentas Bancarias</p>
            <p className="text-xs text-muted-foreground">Cuentas para recibir transferencias</p>
          </div>
        </div>

        {cuentas.length > 0 ? (
          <div className="grid gap-3">
            {cuentas.map((c) => (
              <Card key={c.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                        {c.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain" />
                        ) : (
                          <Landmark className="w-5 h-5 text-cyan-500" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{c.nombre}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.origen === "proveedor" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                            {c.origen === "proveedor" ? "Proveedor" : "Propia"}
                          </span>
                        </div>
                        {c.alias && <p className="text-xs text-muted-foreground">Alias: <span className="font-mono font-medium">{c.alias}</span></p>}
                        {c.titular && <p className="text-xs text-muted-foreground">Titular: {c.titular}</p>}
                        {c.cbu_cvu && <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.cbu_cvu}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingCuenta(c);
                        setCuentaForm({ nombre: c.nombre, tipo: c.tipo, cbu_cvu: c.cbu_cvu, alias: c.alias, origen: c.origen || "propia", titular: c.titular || "", proveedor_id: (c as any).proveedor_id || "", logo_url: c.logo_url || "" });
                        setShowCuentaForm(true);
                      }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                        await supabase.from("cuentas_bancarias").update({ activo: false }).eq("id", c.id);
                        setCuentas(cuentas.filter((x) => x.id !== c.id));
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
                  <Label>Nombre de la cuenta</Label>
                  <Input placeholder="Ej: Brubank, Mercado Pago, Arcor" value={cuentaForm.nombre} onChange={(ev) => setCuentaForm({ ...cuentaForm, nombre: ev.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>¿De quién es?</Label>
                  <div className="flex gap-2">
                    {([["propia", "Propia"], ["proveedor", "Proveedor"]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCuentaForm({ ...cuentaForm, origen: val })}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition ${cuentaForm.origen === val ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/50"}`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                {cuentaForm.origen === "proveedor" && (
                  <div className="space-y-1 relative">
                    <Label>Proveedor vinculado</Label>
                    <button
                      type="button"
                      onClick={() => { setProvDropdownOpen(!provDropdownOpen); setProvSearchText(""); }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm text-left hover:border-primary/50 transition"
                    >
                      <span className={cuentaForm.proveedor_id ? "text-foreground font-medium" : "text-muted-foreground"}>
                        {proveedoresList.find((p) => p.id === cuentaForm.proveedor_id)?.nombre || "Buscar proveedor..."}
                      </span>
                      {cuentaForm.proveedor_id && (
                        <span onClick={(e: any) => { e.stopPropagation(); setCuentaForm({ ...cuentaForm, proveedor_id: "" }); }} className="p-0.5 rounded-full hover:bg-muted cursor-pointer"><X className="w-3 h-3" /></span>
                      )}
                    </button>
                    {provDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-background rounded-lg border shadow-lg">
                        <div className="p-2 border-b">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Buscar proveedor..."
                              value={provSearchText}
                              onChange={(e) => setProvSearchText(e.target.value)}
                              className="pl-8 h-8 text-sm"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-[40vh] sm:max-h-48 overflow-y-auto p-1">
                          {proveedoresList.filter((p) => p.nombre.toLowerCase().includes(provSearchText.toLowerCase())).length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-4">Sin resultados</p>
                          ) : proveedoresList.filter((p) => p.nombre.toLowerCase().includes(provSearchText.toLowerCase())).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setCuentaForm({ ...cuentaForm, proveedor_id: p.id }); setProvDropdownOpen(false); setProvSearchText(""); }}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${cuentaForm.proveedor_id === p.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
                            >
                              {p.nombre}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Alias</Label>
                  <Input placeholder="Ej: dulcesur.mp, arcor.pagos" value={cuentaForm.alias} onChange={(ev) => setCuentaForm({ ...cuentaForm, alias: ev.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Titular (opcional)</Label>
                  <Input placeholder="Nombre del titular" value={cuentaForm.titular} onChange={(ev) => setCuentaForm({ ...cuentaForm, titular: ev.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>CBU / CVU (opcional)</Label>
                  <Input placeholder="22 dígitos" value={cuentaForm.cbu_cvu} onChange={(ev) => setCuentaForm({ ...cuentaForm, cbu_cvu: ev.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Logo (opcional)</Label>
                  <div className="flex items-center gap-3">
                    {cuentaForm.logo_url ? (
                      <div className="relative w-10 h-10 rounded-lg border overflow-hidden bg-white flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cuentaForm.logo_url} alt="" className="w-full h-full object-contain p-0.5" />
                        <button type="button" onClick={() => setCuentaForm({ ...cuentaForm, logo_url: "" })} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center hover:bg-red-600">x</button>
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg border border-dashed border-gray-300 flex items-center justify-center flex-shrink-0 text-gray-300">
                        <Image className="w-4 h-4" />
                      </div>
                    )}
                    <label className="flex-1 cursor-pointer">
                      <span className="text-xs text-primary hover:underline">{cuentaForm.logo_url ? "Cambiar" : "Subir logo"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append("file", file);
                        try {
                          const res = await fetch("/api/upload", { method: "POST", body: formData });
                          if (!res.ok) { showAdminToast("Error al subir logo", "error"); return; }
                          const data = await res.json();
                          if (data.secure_url || data.url) {
                            setCuentaForm({ ...cuentaForm, logo_url: data.secure_url || data.url });
                            showAdminToast("Logo subido", "success");
                          }
                        } catch { showAdminToast("Error al subir", "error"); }
                      }} />
                    </label>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Tipo de cuenta</Label>
                  <Select value={cuentaForm.tipo} onValueChange={(v) => setCuentaForm({ ...cuentaForm, tipo: v ?? "" })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Caja de Ahorro">Caja de Ahorro</SelectItem>
                      <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                      <SelectItem value="Billetera Virtual">Billetera Virtual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setShowCuentaForm(false); setEditingCuenta(null); setCuentaForm({ nombre: "", tipo: "Caja de Ahorro", cbu_cvu: "", alias: "", origen: "propia", titular: "", proveedor_id: "", logo_url: "" }); }}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={!cuentaForm.nombre} onClick={async () => {
                  if (editingCuenta) {
                    await supabase.from("cuentas_bancarias").update({
                      nombre: cuentaForm.nombre, tipo_cuenta: cuentaForm.tipo, cbu_cvu: cuentaForm.cbu_cvu, alias: cuentaForm.alias, titular: cuentaForm.titular, origen: cuentaForm.origen, proveedor_id: cuentaForm.proveedor_id || null, logo_url: cuentaForm.logo_url || null, updated_at: new Date().toISOString(),
                    }).eq("id", editingCuenta.id);
                    setCuentas(cuentas.map((c) => c.id === editingCuenta.id ? { ...c, ...cuentaForm } : c));
                  } else {
                    const { data: newCuenta } = await supabase.from("cuentas_bancarias").insert({
                      nombre: cuentaForm.nombre, tipo_cuenta: cuentaForm.tipo, cbu_cvu: cuentaForm.cbu_cvu, alias: cuentaForm.alias, titular: cuentaForm.titular, origen: cuentaForm.origen, proveedor_id: cuentaForm.proveedor_id || null, logo_url: cuentaForm.logo_url || null,
                    }).select("id").single();
                    if (newCuenta) setCuentas([...cuentas, { id: newCuenta.id, ...cuentaForm }]);
                  }
                  setShowCuentaForm(false);
                  setEditingCuenta(null);
                  setCuentaForm({ nombre: "", tipo: "Caja de Ahorro", cbu_cvu: "", alias: "", origen: "propia", titular: "", proveedor_id: "", logo_url: "" });
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
  );
}
