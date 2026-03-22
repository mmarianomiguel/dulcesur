"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Key,
  Users,
} from "lucide-react";

interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  created_at: string;
}

interface Permiso {
  id?: string;
  rol_id: string;
  modulo: string;
  submodulo: string;
  habilitado: boolean;
}

// Module/submodule structure — MUST match sidebar.tsx navigation child names exactly
const MODULE_STRUCTURE: { modulo: string; submodulos: string[] }[] = [
  { modulo: "Dashboard", submodulos: [] },
  {
    modulo: "Ventas",
    submodulos: [
      "Punto de venta",
      "Historial y Pedidos",
      "Entregas y Ruta",
      "Nota de Crédito",
      "Nota de Débito",
      "Anticipos",
    ],
  },
  {
    modulo: "Clientes",
    submodulos: ["Listado"],
  },
  {
    modulo: "Productos",
    submodulos: [
      "Listado",
      "Editar Precios",
      "Descuentos",
      "Marcas",
      "Lista de Precios (PDF)",
    ],
  },
  { modulo: "Proveedores", submodulos: [] },
  {
    modulo: "Compras",
    submodulos: ["Registrar", "Pedidos", "Reposicion"],
  },
  { modulo: "Caja", submodulos: [] },
  {
    modulo: "Stock",
    submodulos: ["Ajustes de Stock"],
  },
  {
    modulo: "Reportes",
    submodulos: ["General", "Resumen Mensual", "Resumen por Vendedor", "Percepciones"],
  },
  { modulo: "Vendedores", submodulos: [] },
  { modulo: "Auditoría", submodulos: [] },
  { modulo: "Tienda Online", submodulos: [] },
  {
    modulo: "Configuración",
    submodulos: ["General", "Personalización", "Tienda Online", "Página de Inicio", "Footer", "Usuarios", "Roles"],
  },
];

const emptyRolForm = { nombre: "", descripcion: "" };

export default function RolesPage() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [editingRol, setEditingRol] = useState<Rol | null>(null);
  const [permRol, setPermRol] = useState<Rol | null>(null);
  const [form, setForm] = useState(emptyRolForm);
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("roles").select("*").order("nombre");
    setRoles(data || []);

    // Get user counts per role
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("rol_id")
      .eq("activo", true);
    const counts: Record<string, number> = {};
    (usuarios || []).forEach((u) => {
      if (u.rol_id) counts[u.rol_id] = (counts[u.rol_id] || 0) + 1;
    });
    setUserCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const openNew = () => {
    setEditingRol(null);
    setForm(emptyRolForm);
    setDialogOpen(true);
  };

  const openEdit = (r: Rol) => {
    setEditingRol(r);
    setForm({ nombre: r.nombre, descripcion: r.descripcion || "" });
    setDialogOpen(true);
  };

  const handleSaveRol = async () => {
    setSaving(true);
    if (editingRol) {
      await supabase
        .from("roles")
        .update({ nombre: form.nombre, descripcion: form.descripcion || null })
        .eq("id", editingRol.id);
    } else {
      await supabase
        .from("roles")
        .insert({ nombre: form.nombre, descripcion: form.descripcion || null });
    }
    setDialogOpen(false);
    setSaving(false);
    fetchRoles();
  };

  const handleDelete = async (r: Rol) => {
    if (!confirm(`Eliminar el rol "${r.nombre}"? Se eliminarán sus permisos asociados.`)) return;
    await supabase.from("permisos").delete().eq("rol_id", r.id);
    await supabase.from("roles").delete().eq("id", r.id);
    fetchRoles();
  };

  // Permissions management
  const openPermissions = async (r: Rol) => {
    setPermRol(r);
    // Fetch existing permissions for this role
    const { data } = await supabase
      .from("permisos")
      .select("*")
      .eq("rol_id", r.id);

    const permMap: Record<string, boolean> = {};
    // Initialize all as false
    MODULE_STRUCTURE.forEach((m) => {
      if (m.submodulos.length === 0) {
        permMap[`${m.modulo}::`] = false;
      } else {
        m.submodulos.forEach((s) => {
          permMap[`${m.modulo}::${s}`] = false;
        });
      }
    });
    // Apply saved permissions
    (data || []).forEach((p: Permiso) => {
      const key = `${p.modulo}::${p.submodulo}`;
      permMap[key] = p.habilitado;
    });
    setPermisos(permMap);
    setPermDialogOpen(true);
  };

  const isModuleEnabled = (modulo: string) => {
    const mod = MODULE_STRUCTURE.find((m) => m.modulo === modulo);
    if (!mod) return false;
    if (mod.submodulos.length === 0) return permisos[`${modulo}::`] ?? false;
    return mod.submodulos.every((s) => permisos[`${modulo}::${s}`]);
  };

  const isModulePartial = (modulo: string) => {
    const mod = MODULE_STRUCTURE.find((m) => m.modulo === modulo);
    if (!mod || mod.submodulos.length === 0) return false;
    const vals = mod.submodulos.map((s) => permisos[`${modulo}::${s}`] ?? false);
    return vals.some(Boolean) && !vals.every(Boolean);
  };

  const toggleModule = (modulo: string) => {
    const mod = MODULE_STRUCTURE.find((m) => m.modulo === modulo);
    if (!mod) return;

    const newPermisos = { ...permisos };
    if (mod.submodulos.length === 0) {
      newPermisos[`${modulo}::`] = !newPermisos[`${modulo}::`];
    } else {
      const allEnabled = isModuleEnabled(modulo);
      mod.submodulos.forEach((s) => {
        newPermisos[`${modulo}::${s}`] = !allEnabled;
      });
    }
    setPermisos(newPermisos);
  };

  const toggleSubmodule = (modulo: string, submodulo: string) => {
    setPermisos((prev) => ({
      ...prev,
      [`${modulo}::${submodulo}`]: !prev[`${modulo}::${submodulo}`],
    }));
  };

  const handleSavePerms = async () => {
    if (!permRol) return;
    setSavingPerms(true);

    // Delete existing permissions for this role and reinsert
    await supabase.from("permisos").delete().eq("rol_id", permRol.id);

    const rows: { rol_id: string; modulo: string; submodulo: string; habilitado: boolean }[] = [];
    Object.entries(permisos).forEach(([key, habilitado]) => {
      const [modulo, submodulo] = key.split("::");
      rows.push({ rol_id: permRol.id, modulo, submodulo, habilitado });
    });

    if (rows.length > 0) {
      await supabase.from("permisos").insert(rows);
    }

    setSavingPerms(false);
    setPermDialogOpen(false);
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Roles y Permisos</h1>
            <p className="text-sm text-muted-foreground">
              Configurar roles y permisos de acceso
            </p>
          </div>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Rol
        </Button>
      </div>

      {/* Roles list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : roles.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              No hay roles creados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Nombre
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Descripción
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      Usuarios
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium">{r.nombre}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {r.descripcion || "-"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="secondary" className="gap-1">
                          <Users className="w-3 h-3" />
                          {userCounts[r.id] || 0}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => openPermissions(r)}
                          >
                            <Key className="w-4 h-4" />
                            Permisos
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(r)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRol ? "Editar Rol" : "Nuevo Rol"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Vendedor"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={form.descripcion}
                onChange={(e) =>
                  setForm({ ...form, descripcion: e.target.value })
                }
                placeholder="Descripción del rol"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveRol} disabled={saving || !form.nombre}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingRol ? "Guardar" : "Crear Rol"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Permisos: {permRol?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 pt-2">
            {MODULE_STRUCTURE.map((mod) => (
              <div key={mod.modulo}>
                {/* Module row */}
                <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50">
                  <span className="font-medium text-sm">{mod.modulo}</span>
                  <div className="flex items-center gap-2">
                    {isModulePartial(mod.modulo) && (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Parcial
                      </span>
                    )}
                    <Switch
                      checked={isModuleEnabled(mod.modulo)}
                      onCheckedChange={() => toggleModule(mod.modulo)}
                    />
                  </div>
                </div>

                {/* Submodules */}
                {mod.submodulos.length > 0 && (
                  <div className="ml-6 border-l border-border pl-4 space-y-0.5 mb-1">
                    {mod.submodulos.map((sub) => (
                      <div
                        key={`${mod.modulo}-${sub}`}
                        className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30"
                      >
                        <span className="text-sm text-muted-foreground">
                          {sub}
                        </span>
                        <Switch
                          checked={permisos[`${mod.modulo}::${sub}`] ?? false}
                          onCheckedChange={() =>
                            toggleSubmodule(mod.modulo, sub)
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
                <Separator className="my-0.5" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setPermDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSavePerms} disabled={savingPerms}>
              {savingPerms && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Guardar Permisos
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
