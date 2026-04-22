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
import { Building2, Loader2, Check } from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";

export default function EmpresaPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("empresa").select("*").limit(1).single();
    setEmpresa(data);
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
      nombre: empresa.nombre,
      razon_social: empresa.razon_social,
      cuit: empresa.cuit,
      situacion_iva: empresa.situacion_iva,
      domicilio: empresa.domicilio,
      localidad: empresa.localidad,
      telefono: empresa.telefono,
    }).eq("id", empresa.id);
    setSaving(false);
    showAdminToast("Datos de empresa guardados correctamente");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Datos de la empresa</h2>
          <p className="text-sm text-muted-foreground">Información general y fiscal de tu negocio</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Identidad comercial */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Identidad comercial</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Nombre comercial</Label>
                <Input value={empresa?.nombre || ""} onChange={(ev) => e("nombre", ev.target.value)} placeholder="Dulce Sur" />
              </div>
              <div className="space-y-2">
                <Label>Razón social</Label>
                <Input value={empresa?.razon_social || ""} onChange={(ev) => e("razon_social", ev.target.value)} />
              </div>
            </div>
          </div>
          <Separator />
          {/* Datos fiscales */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Datos fiscales</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>CUIT</Label>
                <Input value={empresa?.cuit || ""} onChange={(ev) => e("cuit", ev.target.value)} placeholder="XX-XXXXXXXX-X" />
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
            </div>
          </div>
          <Separator />
          {/* Contacto */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contacto</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Domicilio fiscal</Label>
                <Input value={empresa?.domicilio || ""} onChange={(ev) => e("domicilio", ev.target.value)} placeholder="Ej: Eduardo Gutierrez 5157" />
              </div>
              <div className="space-y-2">
                <Label>Localidad</Label>
                <Input value={empresa?.localidad || ""} onChange={(ev) => e("localidad", ev.target.value)} placeholder="Ej: Longchamps, Buenos Aires" />
                <p className="text-[11px] text-muted-foreground">Se usa como punto de partida para optimizar la ruta de entregas.</p>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={empresa?.telefono || ""} onChange={(ev) => e("telefono", ev.target.value)} />
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
