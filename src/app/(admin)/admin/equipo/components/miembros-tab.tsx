"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Pencil, EyeOff, Eye, Trash2, Loader2 } from "lucide-react";
import type { Equipo } from "@/types/equipo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";

const ROL_LABEL: Record<string, string> = {
  armador: "Armador",
  repartidor: "Repartidor",
  admin: "Admin",
};

export function MiembrosTab() {
  const [miembros, setMiembros] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", pin: "", rol: "armador" as Equipo["rol"] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Equipo | null>(null);

  const fetchMiembros = useCallback(async () => {
    const { data } = await supabase
      .from("equipo")
      .select("*")
      .order("created_at", { ascending: false });
    setMiembros(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMiembros(); }, [fetchMiembros]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ nombre: "", pin: "", rol: "armador" });
    setError(null);
    setShowPin(false);
    setModalOpen(true);
  };

  const openEdit = (m: Equipo) => {
    setEditingId(m.id);
    setForm({ nombre: m.nombre, pin: m.pin, rol: m.rol });
    setError(null);
    setShowPin(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError("Nombre requerido"); return; }
    if (!form.pin || form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
      setError("PIN debe ser 4 dígitos");
      return;
    }
    const existing = miembros.find((m) => m.pin === form.pin && m.id !== editingId);
    if (existing) { setError("Este PIN ya está en uso"); return; }

    setSaving(true);
    setError(null);
    const payload = { nombre: form.nombre.trim(), pin: form.pin, rol: form.rol };
    if (editingId) {
      await supabase.from("equipo").update(payload).eq("id", editingId);
    } else {
      await supabase.from("equipo").insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    await fetchMiembros();
  };

  const toggleActivo = async (m: Equipo) => {
    await supabase.from("equipo").update({ activo: !m.activo }).eq("id", m.id);
    await fetchMiembros();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("equipo").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    await fetchMiembros();
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4 mr-1.5" /> Agregar miembro
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : miembros.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No hay miembros del equipo. Agregá uno para comenzar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Nombre</th>
                <th className="text-left px-4 py-2.5 font-medium">Rol</th>
                <th className="text-left px-4 py-2.5 font-medium">PIN</th>
                <th className="text-center px-4 py-2.5 font-medium">Estado</th>
                <th className="text-right px-4 py-2.5 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {miembros.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors ${!m.activo ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 font-medium">{m.nombre}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={
                        m.rol === "admin"
                          ? "bg-violet-100 text-violet-700 hover:bg-violet-100"
                          : m.rol === "repartidor"
                          ? "bg-sky-100 text-sky-700 hover:bg-sky-100"
                          : "bg-primary/10 text-primary hover:bg-primary/10"
                      }
                    >
                      {ROL_LABEL[m.rol] || m.rol}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">****</td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      variant={m.activo ? "default" : "secondary"}
                      className={m.activo ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""}
                    >
                      {m.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActivo(m)}>
                      {m.activo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(m)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar miembro" : "Agregar miembro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre del empleado"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">PIN (4 dígitos)</Label>
              <div className="relative">
                <Input
                  type={showPin ? "text" : "password"}
                  value={form.pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setForm({ ...form, pin: v });
                  }}
                  className="font-mono pr-10"
                  placeholder="1234"
                  maxLength={4}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rol</Label>
              <Select value={form.rol} onValueChange={(v) => setForm({ ...form, rol: (v ?? "armador") as Equipo["rol"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="armador">Armador</SelectItem>
                  <SelectItem value="repartidor">Repartidor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {editingId ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar miembro"
        description={`¿Eliminar a ${deleteTarget?.nombre}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={confirmDelete}
      />
    </>
  );
}
