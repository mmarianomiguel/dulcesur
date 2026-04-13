"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Empresa } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Receipt, Loader2, Check } from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";

export default function FacturacionPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listasPrecios, setListasPrecios] = useState<{ id: string; nombre: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: listas }] = await Promise.all([
      supabase.from("empresa").select("*").limit(1).single(),
      supabase.from("listas_precios").select("id, nombre").order("nombre"),
    ]);
    setEmpresa(data);
    setListasPrecios(listas || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const e = (key: keyof Empresa, value: string) => {
    if (empresa) setEmpresa({ ...empresa, [key]: value });
  };

  const save = async () => {
    if (!empresa) return;
    setSaving(true);
    await supabase.from("empresa").update({
      punto_venta: empresa.punto_venta,
      tipo_comprobante_default: empresa.tipo_comprobante_default,
      lista_precios_default: empresa.lista_precios_default,
      moneda_default: empresa.moneda_default,
    }).eq("id", empresa.id);
    setSaving(false);
    showAdminToast("Configuración de facturación guardada");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Receipt className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Facturación</h2>
          <p className="text-sm text-muted-foreground">Configuración de comprobantes, moneda y punto de venta</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Comprobantes */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Comprobantes</p>
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
            </div>
          </div>
          <Separator />
          {/* Precios y moneda */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Precios y moneda</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Lista de precios default</Label>
                <Select value={empresa?.lista_precios_default || ""} onValueChange={(v) => e("lista_precios_default", v || "")}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {listasPrecios.length > 0 ? (
                      listasPrecios.map((l) => (
                        <SelectItem key={l.id} value={l.nombre}>{l.nombre}</SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="Contado">Contado</SelectItem>
                        <SelectItem value="Mayorista">Mayorista</SelectItem>
                      </>
                    )}
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
          </div>
          <Separator />
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
